# tiny-expr-parser

A tiny, zero-dependency expression parser library. It parses a string like `1 + 2 * (3 - a)` into an AST.

[![CI](https://github.com/peakchen90/tiny-expr-parser/actions/workflows/ci.yml/badge.svg)](https://github.com/peakchen90/tiny-expr-parser/actions/workflows/ci.yml)
[![Codecov](https://img.shields.io/codecov/c/github/peakchen90/tiny-expr-parser.svg)](https://codecov.io/gh/peakchen90/tiny-expr-parser)
[![npm](https://img.shields.io/npm/v/tiny-expr-parser.svg)](https://www.npmjs.com/package/tiny-expr-parser)
[![license](https://img.shields.io/github/license/peakchen90/tiny-expr-parser.svg)](./LICENSE)

English | [简体中文](./README.ZH-CN.md)

## Features

- Lightweight, with zero runtime dependencies
- Configurable syntax and custom operators
- Strict and loose parsing for validation and live highlighting
- AST with source ranges, traversal, and customizable output

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
    operator: { type: 'Operator', value: '+', start: 2, end: 3 },
    left: { type: 'NumericLiteral', rawValue: '1', value: '1', start: 0, end: 1 },
    right: {
      type: 'BinaryExpression',
      operator: { type: 'Operator', value: '*', start: 6, end: 7 },
      left: { type: 'NumericLiteral', rawValue: '2', value: '2', start: 4, end: 5 },
      right: { type: 'Identifier', name: 'a', start: 8, end: 9 },
    },
    start: 0,
    end: 9,
  },
}
```

Custom operators are registered per parser instance, either through constructor options or instance methods. See [precedence of built-in operators](#precedence-of-built-in-operators) when choosing a precedence.

```js
import { Parser } from 'tiny-expr-parser';

const parser = new Parser({
  binaryOperators: { '%': { precedence: 14 } }, // remainder
  unaryOperators: { sin: { precedence: 16 } },
});

// equivalent instance methods:
// parser.addBinaryOperator('%', 14);
// parser.addUnaryOperator('sin', 16);

const first = parser.parse('1 + 1 % 2');
const second = parser.parse('2 + sin 2');
```

Invalid expressions throw a `ParserError`, which extends `SyntaxError`.

```js
new Parser().parse('1 +');
// ParserError: Unexpected end of input
```

## API

### `new Parser(options?: ParserOptions)`

Create a parser instance. The same instance can parse multiple expressions sequentially.

| Option                  | Type                                     | Default     | Description                                                                                                                                                                                                                                                                                                                   |
| ----------------------- | ---------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `identifierPrefixChars` | `string[]`                               | `[]`        | Extra identifier prefixes, each a single non-whitespace character. For example, `new Parser({ identifierPrefixChars: ['@'] })` parses `@name` as an identifier whose name includes `@`. The prefix must be followed immediately by a valid identifier. Existing tokens and registered operators keep their matching priority. |
| `features`              | `Features`                               | all enabled | Toggles for the supported syntax. See the features table below.                                                                                                                                                                                                                                                               |
| `binaryOperators`       | `Record<string, { precedence: number }>` | `{}`        | Binary operators registered at construction. Keys are operator labels; each value sets the precedence. The [custom operator rules](#custom-operator-rules) apply, and `parser.addBinaryOperator()` can still update them afterwards.                                                                                          |
| `unaryOperators`        | `Record<string, { precedence: number }>` | `{}`        | Prefix unary operators registered at construction, with the same rules as `binaryOperators`.                                                                                                                                                                                                                                  |

All features are enabled by default; set one to `false` to reject that syntax.

| Feature         | Description                                                                                  |
| --------------- | -------------------------------------------------------------------------------------------- |
| `number`        | Numeric literals. Negative literals such as `-2` are rejected as well.                       |
| `string`        | String literals.                                                                             |
| `array`         | Array expressions.                                                                           |
| `call`          | Function calls. Grouping parentheses remain available when disabled.                         |
| `plusOperator`  | Built-in binary operator `+`.                                                                |
| `minusOperator` | Built-in binary operator `-`. Negative literals such as `-2` remain available when disabled. |
| `timesOperator` | Built-in binary operator `*`.                                                                |
| `divOperator`   | Built-in binary operator `/`.                                                                |

#### `parser.parse(expression: string): RootNode | null`

Parse an expression and return its AST. Returns `null` for an empty / whitespace-only string. Throws `ParserError` on invalid input.

#### `parser.parseLoose(expression: string): LooseParseResult`

Parse an expression while it is being edited. The parser records syntax errors and continues recognizing later nodes. Use `parse()` for strict parsing. Both methods share the instance's syntax toggles, custom operators, identifier prefixes, and error message settings.

```ts
interface LooseParseResult {
  nodes: Node[];
  errors: ParserError[];
}
```

- `nodes` contains AST fragments in source order. Pass each node to `walk()`. A valid expression returns one root node with the same structure and ranges as the result of `parse()`. When a required child is missing, recognized nodes can be returned individually. For example, `a +` returns the identifier `a` and the operator `+`.
- If an operand is missing at a separator, closing delimiter, or the end of the input within a call or array, `parseLoose()` keeps the enclosing node and the expressions it could complete. For example, `f(a + , b)` keeps the call with arguments `a` and `b` and reports an error at the comma.
- `errors` contains `ParserError` instances ordered by their starting offsets. Use `code` and `message` for diagnostics and `start` and `end` to locate them. Nodes and errors use zero-based UTF-16 offsets with an inclusive start and exclusive end, so you can use `input.slice(start, end)`. For an unexpected end of input, both error offsets equal `input.length`.
- Empty or whitespace-only input returns two empty arrays. If the parser finds no recognizable nodes, as in `?`, `nodes` is empty and `errors` still reports the error.

The example below distinguishes function names from ordinary identifiers and marks the error separately. Literal nodes can cover incomplete input. Use their ranges to highlight the original text. Read parentheses, commas, and whitespace from the source.

```js
import { Parser } from 'tiny-expr-parser';

const input = 'sum(a, ?, b)';
const parser = new Parser();
const { nodes, errors } = parser.parseLoose(input);
const highlights = [];

for (const node of nodes) {
  parser.walk(node, {
    Identifier(identifier, ancestors) {
      const parent = ancestors[ancestors.length - 1];
      const isCallee = parent?.type === 'CallExpression' && parent.callee === identifier;
      highlights.push({
        kind: isCallee ? 'function' : 'identifier',
        start: identifier.start,
        end: identifier.end,
      });
    },
  });
}

// highlights contains sum [0, 3), a [4, 5), and b [10, 11)
console.log(errors.map(({ start, end }) => [start, end])); // [[7, 8]]
```

#### `parser.stringify(node: Node, customStringify?: StringifyCallback): string`

Convert any AST node to expression text. Binary operators, call arguments, and array elements use consistent spacing, with parentheses added to preserve grouping. Numeric and string literals retain their `rawValue`.

The optional second argument controls how individual nodes are converted. A returned string replaces the node's text, including when the string is empty. Return `undefined` to use built-in formatting for the current node. Its children still use the callback. Calling the supplied `stringify(child)` also applies the same callback to the given node.

```ts
type StringifyCallback = (
  node: Node,
  stringify: (node: Node) => string,
) => string | undefined;
```

```js
const ast = parser.parse('sum(a, 2) + b');

const text = parser.stringify(ast, (node, stringify) => {
  if (node.type === 'Expression') return stringify(node.expression);
  if (node.type === 'Identifier') return node.name.toUpperCase();
});
// text is 'SUM(A, 2) + B'
```

#### `parser.walk(node: Node, visitors: WalkVisitors): void`

Traverse an AST iteratively in depth-first pre-order, without recursive calls. Each visitor receives the current `node`, an `ancestors` array, and an `options` object. Call `options.skip()` to skip the current node's children and continue outside its subtree, or `options.stop()` to stop the entire traversal immediately.

The `ancestors` array is ordered from the starting node to the current node's direct parent. The current node is excluded, so the starting node receives an empty array. All node types, including `Operator`, are visited, and children follow source order. Visitor callbacks are optional; omitting a node's callback does not skip its subtree. TypeScript infers the specific node type for each callback.

```js
const ast = parser.parse('a + 2 * b');

parser.walk(ast, {
  Expression(node, ancestors) {
    console.log(ancestors); // []
  },
  BinaryExpression(node, ancestors, options) {
    if (node.operator.value === '*') {
      options.skip(); // Skip this subtree, including `b`
    }
  },
  Identifier(node, ancestors) {
    console.log(node.name); // 'a'
    console.log(ancestors.map((ancestor) => ancestor.type));
    // ['Expression', 'BinaryExpression']
  },
});
```

#### Parse error messages

Pass a complete `Messages` object in `ParserOptions.messages` to configure error messages for `parse()` and `parseLoose()`. The built-in presets are `Parser.Messages.zh` and `Parser.Messages.en`. The parser uses English when `messages` is omitted.

```js
import { Parser } from 'tiny-expr-parser';

const parser = new Parser({ messages: Parser.Messages.zh });
```

`{v}` is the offending token text. `{pos}` is the zero-based UTF-16 offset in the input, or the input length for an unexpected end.

`code` is the message key in the table below. `start` and `end` are zero-based UTF-16 offsets with an inclusive start and exclusive end. For `unexpectedEndOfInput`, both offsets equal the input length. `toJSON()` returns `name`, `code`, `start`, `end`, `message`, and `stack`.

| `Messages` key              | Scenario                                                                                          | Placeholders   |
| --------------------------- | ------------------------------------------------------------------------------------------------- | -------------- |
| `unexpectedToken`           | Unknown character, malformed number, or misplaced punctuation such as a comma, parenthesis, or bracket | `{v}`, `{pos}` |
| `unexpectedEndOfInput`      | Input ends while an operand, closing parenthesis, or closing bracket is required                       | `{pos}`        |
| `unterminatedStringLiteral` | String reaches the end of input or an unescaped line break without a closing quote                | `{pos}`        |
| `invalidStringEscape`       | Unsupported escape in a string literal                                                            | `{pos}`        |
| `invalidIdentifierEscape`   | Malformed Unicode escape or a decoded character invalid at that identifier position               | `{pos}`        |

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
  | ArrayExpression
  | NumericLiteral
  | StringLiteral
  | Identifier;

interface BinaryExpression {
  type: 'BinaryExpression';
  start: number;
  end: number;
  left: ExpressionNode;
  right: ExpressionNode;
  operator: Operator;
}

interface UnaryExpression {
  type: 'UnaryExpression';
  start: number;
  end: number;
  argument: ExpressionNode;
  operator: Operator;
  prefix: boolean; // always true
}

interface Operator {
  type: 'Operator';
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

interface ArrayExpression {
  type: 'ArrayExpression';
  start: number;
  end: number;
  elements: ExpressionNode[];
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

Precedence follows the [MDN operator precedence table](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Operator_precedence).

### Number syntax

The parser accepts `123`, `.5`, `1.5`, `1_000`, `1e3`, `1.2e-3`, and negative literals such as `-2` and `-.5`. In operand position, an adjacent minus sign is part of the number, as in `1--2`. The `_` separator is stripped in `NumericLiteral.value` but preserved in `rawValue`.

Register `+` or `-` as a prefix operator with `addUnaryOperator` or the `unaryOperators` option. Registered operators take precedence over built-in token matching.

### Strings and calls

Strings use single or double quotes and support `\\`, `\'`, `\"`, `\/`, `\b`, `\f`, `\n`, `\r`, `\t`, and `\v` escapes.

Calls use an identifier as the function name, as in `fn()` and `fn('text', other(1 + 2))`. Separate arguments with commas and omit the trailing comma. Calls bind before unary and binary operators.

### Arrays

Square brackets enclose a comma-separated list of expressions, as in `[1, "23", id]`. Arrays can be empty or nested. Each element can be a complete expression, as in `[x + 1, fn(id), [2]]`. Use one expression per element and omit the trailing comma.

An array is represented by an `ArrayExpression` node in the AST. Its `elements` list follows source order, and the node's source range includes both brackets. `walk()` visits the elements in order, and `stringify()` joins them with a comma and a space. `parseLoose()` can retain recognized elements when an item is missing or input ends before the closing bracket.

```js
const ast = parser.parse('[1,"23",id]');

parser.walk(ast, {
  ArrayExpression(node) {
    console.log(node.elements.map((element) => element.type));
    // ['NumericLiteral', 'StringLiteral', 'Identifier']
  },
});

parser.stringify(ast); // '[1, "23", id]'
```

Existing custom operator and identifier-prefix matches take precedence when they overlap with a bracket.

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
