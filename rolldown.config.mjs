import { defineConfig } from 'rolldown';
import { dts } from 'rolldown-plugin-dts';
import packageJson from './package.json' with { type: 'json' };

export default defineConfig([
  {
    input: 'src/index.ts',
    transform: {
      target: 'es2015',
      define: {
        __VERSION__: JSON.stringify(packageJson.version),
      },
    },
    output: [
      {
        dir: 'dist',
        entryFileNames: 'index.esm.js',
        format: 'esm',
        sourcemap: true,
        // 完整构建时清理一次，watch 重建时保留其他产物。
        cleanDir: process.env.ROLLDOWN_WATCH !== 'true',
      },
      {
        dir: 'dist',
        entryFileNames: 'index.cjs.js',
        format: 'cjs',
        exports: 'named',
        sourcemap: true,
      },
      {
        dir: 'dist',
        entryFileNames: 'index.umd.js',
        format: 'umd',
        name: 'TinyExprParser',
        exports: 'named',
        sourcemap: true,
      },
    ],
    watch: {
      include: 'src/**',
      exclude: 'node_modules/**',
    },
  },
  {
    input: 'src/index.ts',
    plugins: [
      dts({
        tsconfig: 'tsconfig.build.json',
        emitDtsOnly: true,
      }),
    ],
    output: {
      dir: 'dist',
      format: 'esm',
    },
  },
]);
