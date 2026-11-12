#!/usr/bin/env node

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline/promises');
const semver = require('semver');

const REGISTRY = 'https://registry.npmjs.org';
const packagePath = path.join(__dirname, '..', 'package.json');

async function fetchLatestVersion(packageName) {
  try {
    const response = await fetch(`${REGISTRY}/${packageName}`);
    if (!response.ok) return null;
    const data = await response.json();
    return data['dist-tags']?.latest ?? null;
  } catch {
    return null;
  }
}

function tagExists(tag) {
  try {
    execFileSync('git', ['rev-parse', '-q', '--verify', `refs/tags/${tag}`]);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  const local = pkg.version;
  const published = await fetchLatestVersion(pkg.name);

  console.log(`Package: ${pkg.name}`);
  console.log(`Local version:    ${local}`);
  console.log(published ? `Published version: ${published}` : 'Published version: (not published yet)');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  const base = published && semver.gt(published, local) ? published : local;
  const patchExample = semver.inc(base, 'patch');

  let next;
  for (;;) {
    const input = (await rl.question(`\nEnter the new version (e.g. ${patchExample}): `)).trim();
    next = semver.valid(input);
    if (!next) {
      console.error(`Invalid semver version: ${input}`);
      continue;
    }
    if (tagExists(`v${next}`)) {
      console.error(`Tag v${next} already exists`);
      continue;
    }
    break;
  }
  rl.close();

  pkg.version = next;
  fs.writeFileSync(packagePath, `${JSON.stringify(pkg, null, 2)}\n`);

  const tag = `v${next}`;
  execFileSync('git', ['add', 'package.json'], { cwd: path.dirname(packagePath) });
  execFileSync('git', ['commit', '-m', `chore(release): publish ${tag}`, '--', 'package.json']);
  execFileSync('git', ['tag', tag]);

  console.log(`\nReleased ${tag}: package.json updated, committed and tagged.`);
  console.log('Push to trigger the npm publish workflow:');
  console.log('  git push --follow-tags');
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
