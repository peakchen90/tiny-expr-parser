# tiny-expr-parser

A tiny, zero-dependency expression parser library. It parses a string like `1 + 2 * (3 - a)` into an AST.

[![CI](https://github.com/peakchen90/tiny-expr-parser/actions/workflows/ci.yml/badge.svg)](https://github.com/peakchen90/tiny-expr-parser/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/tiny-expr-parser.svg)](https://www.npmjs.com/package/tiny-expr-parser)
[![license](https://img.shields.io/github/license/peakchen90/tiny-expr-parser.svg)](./LICENSE)

English | [简体中文](./README.ZH-CN.md)

## Features

- Tiny, zero dependencies
- Supports custom operators

Requires Node.js >= 24 to develop and build; the published package runs in Node.js and modern browsers.

## Installation

```bash
# use npm
npm i -S tiny-expr-parser

# or use yarn
yarn add tiny-expr-parser

# or use pnpm
pnpm add tiny-expr-parser
```

To build from source, use Node.js 24 and run `npm run build`.

## Usage

Parse expressions with the built-in operators (`+`, `-`, `*`, `/`), parentheses and identifiers.

```js
import { Parser } from 'tiny-expr-parser';

const parser = new Parser();
const ast = parser.parse('1 + 2 * a');
```

The returned AST is a plain JSON-serializable object:

```js
{
  start: 0,
  end: 9,
  type: 'Expression',
  expression: {
    type: 'BinaryExpression',
    operator: { type: 'ExpressionOperator', value: '+', start: 2, end: 3 },
    left: { type: 'NumericLiteral', rawValue: '1', value: '1', start: 0, end: 1 },
    right: {
      type: 'BinaryExpression',
      operator: { type: 'ExpressionOperator', value: '*', start: 6, end: 7 },
      left: { type: 'NumericLiteral', rawValue: '2', value: '2', start: 4, end: 5 },
      right: { type: 'Identifier', name: 'a', start: 8, end: 9 },
    },
    start: 0,
    end: 9,
  },
}
```

Custom operators are registered per parser instance. See [precedence of built-in operators](#precedence-of-built-in-operators) when choosing a precedence.

```js
import { Parser } from 'tiny-expr-parser';

const parser = new Parser();
parser.addBinaryOperator('%', 14); // remainder
parser.addUnaryOperator('sin', 16);

const first = parser.parse('1 + 1 % 2');
const second = parser.parse('2 + sin 2');
```

Invalid expressions throw a `SyntaxError` that includes the position:

```js
new Parser().parse('1 + +');
// SyntaxError: Unexpected end of input
```

## API

### `new Parser()`

Create a parser instance. The same instance can parse multiple expressions sequentially.

#### `parser.parse(expression: string): RootNode | null`

Parse an expression and return its AST. Returns `null` for an empty / whitespace-only string. Throws `SyntaxError` on invalid input.

#### `parser.addBinaryOperator(value: string, precedence: number): void`

Register a binary operator on this instance, or replace the precedence of an existing one.

#### `parser.addUnaryOperator(value: string, precedence: number): void`

Register a prefix unary operator on this instance, or replace the precedence of an existing one.

#### `version: string`

The current package version.

## AST

Every node contains `start` and `end`: the offsets of the source string it covers (inclusive start, exclusive end).

```ts
interface RootNode {
  type: 'Expression';
  start: number;
  end: number;
  expression: ExpressionNode;
}

type ExpressionNode =
  | BinaryExpression
  | UnaryExpression
  | CallExpression
  | NumericLiteral
  | StringLiteral
  | Identifier;

interface BinaryExpression {
  type: 'BinaryExpression';
  start: number;
  end: number;
  left: ExpressionNode;
  right: ExpressionNode;
  operator: ExpressionOperator;
}

interface UnaryExpression {
  type: 'UnaryExpression';
  start: number;
  end: number;
  argument: ExpressionNode;
  operator: ExpressionOperator;
  prefix: boolean; // always true
}

interface ExpressionOperator {
  type: 'ExpressionOperator';
  start: number;
  end: number;
  value: string;
}

interface NumericLiteral {
  type: 'NumericLiteral';
  start: number;
  end: number;
  rawValue: string; // the literal as it appears in the source
  value: string; // `rawValue` without `_` separators
}

interface StringLiteral {
  type: 'StringLiteral';
  start: number;
  end: number;
  rawValue: string; // original text including quotes
  value: string; // decoded content
}

interface CallExpression {
  type: 'CallExpression';
  start: number;
  end: number;
  callee: Identifier;
  arguments: ExpressionNode[];
}

interface Identifier {
  type: 'Identifier';
  start: number;
  end: number;
  name: string;
}
```

## Advanced

### Precedence of built-in operators

| operator    | precedence |
| ----------- | ---------- |
| `... + ...` | 13         |
| `... - ...` | 13         |
| `... * ...` | 14         |
| `... / ...` | 14         |
| `+ ...`     | 16         |
| `- ...`     | 16         |

Precedence follows the [MDN operator precedence table](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Operator_precedence).

### Number syntax

The parser accepts `123`, `.5`, `1.5`, `1_000`, `1e3`, `1.2e-3`. The `_` separator is stripped in `NumericLiteral.value` but preserved in `rawValue`.

### Strings and calls

Strings use single or double quotes and support `\\`, `\'`, `\"`, `\/`, `\b`, `\f`, `\n`, `\r`, `\t`, and `\v` escapes.

Calls use an identifier as the function name, as in `fn()` and `fn('text', other(1 + 2))`. Separate arguments with commas and omit the trailing comma. Calls bind before unary and binary operators.

### Identifier syntax

Identifiers use the ECMAScript `IdentifierName` character rules. Names can contain Unicode letters, as in `求和(金额)`, and can start with `$` or `_`. They also accept `\uXXXX` and `\u{...}` escapes. The AST stores the decoded name and UTF-16 offsets into the original input. Unicode classification uses the runtime's support for Unicode property escapes.

### Custom operator rules

- must be a non-empty string without whitespace, and must not start with `.`, a digit, or `?`
- `(`, `)`, `,`, `'`, and `"` are reserved
- longer operators are matched first, and the most recently registered one wins on the same label

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). Issues and PRs are welcome!

## License

[MIT](./LICENSE)
