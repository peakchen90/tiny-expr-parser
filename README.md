# tiny-expr-parser

A tiny, zero-dependency expression parser library. It parses a string like `1 + 2 * (3 - a)` into an AST.

[![CI](https://github.com/peakchen90/tiny-expr-parser/actions/workflows/ci.yml/badge.svg)](https://github.com/peakchen90/tiny-expr-parser/actions/workflows/ci.yml)
[![Codecov](https://img.shields.io/codecov/c/github/peakchen90/tiny-expr-parser.svg)](https://codecov.io/gh/peakchen90/tiny-expr-parser)
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
    operator: '+',
    left: { type: 'NumericLiteral', rawValue: '1', value: '1', start: 0, end: 1 },
    right: {
      type: 'BinaryExpression',
      operator: '*',
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

type ExpressionNode = BinaryExpression | UnaryExpression | NumericLiteral | Identifier;

interface BinaryExpression {
  type: 'BinaryExpression';
  start: number;
  end: number;
  left: ExpressionNode;
  right: ExpressionNode;
  operator: string; // e.g. '+', '-', '*', '/'
}

interface UnaryExpression {
  type: 'UnaryExpression';
  start: number;
  end: number;
  argument: ExpressionNode;
  operator: string; // e.g. '-', 'sin'
  prefix: boolean; // always true
}

interface NumericLiteral {
  type: 'NumericLiteral';
  start: number;
  end: number;
  rawValue: string; // the literal as it appears in the source
  value: string; // `rawValue` without `_` separators
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

### Custom operator rules

- must be a non-empty string without whitespace, and must not start with `.`, a digit, or `?`
- `(` and `)` are reserved
- longer operators are matched first, and the most recently registered one wins on the same label

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). Issues and PRs are welcome!

## License

[MIT](./LICENSE)
