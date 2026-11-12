# tiny-expr-parser

一个小型零依赖的表达式解析库。支持将 `1 + 2 * (3 - a)` 这样的字符串解析成 AST。

[![CI](https://github.com/peakchen90/tiny-expr-parser/actions/workflows/ci.yml/badge.svg)](https://github.com/peakchen90/tiny-expr-parser/actions/workflows/ci.yml)
[![Codecov](https://img.shields.io/codecov/c/github/peakchen90/tiny-expr-parser.svg)](https://codecov.io/gh/peakchen90/tiny-expr-parser)
[![npm](https://img.shields.io/npm/v/tiny-expr-parser.svg)](https://www.npmjs.com/package/tiny-expr-parser)
[![license](https://img.shields.io/github/license/peakchen90/tiny-expr-parser.svg)](./LICENSE)

[English](./README.md) | 简体中文

## 特性

- 小型、零依赖
- 支持自定义运算符

开发和构建要求 Node.js >= 24；发布产物可运行于 Node.js 与现代浏览器。

## 安装

```bash
# 使用 npm
npm i -S tiny-expr-parser

# 或使用 yarn
yarn add tiny-expr-parser

# 或使用 pnpm
pnpm add tiny-expr-parser
```

从源码构建请使用 Node.js 24，运行 `npm run build`。

## 使用

解析包含内置运算符（`+`、`-`、`*`、`/`）、括号和标识符的表达式。

```js
import { Parser } from 'tiny-expr-parser';

const parser = new Parser();
const ast = parser.parse('1 + 2 * a');
```

返回的 AST 是可直接 JSON 序列化的普通对象：

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

自定义运算符按解析器实例注册。设置优先级时可参考[内置运算符的优先级](#内置运算符优先级)。

```js
import { Parser } from 'tiny-expr-parser';

const parser = new Parser();
parser.addBinaryOperator('%', 14); // 取余
parser.addUnaryOperator('sin', 16);

const first = parser.parse('1 + 1 % 2');
const second = parser.parse('2 + sin 2');
```

非法表达式会抛出继承自 `SyntaxError` 的 `ParserError`。

```js
new Parser().parse('1 +');
// ParserError: Unexpected end of input
```

## API

### `new Parser(options?: ParserOptions)`

创建一个解析器实例，同一实例可连续解析多个表达式。

- `identifierPrefixChars?: string[]` 为标识符添加单字符前缀，每个前缀必须是非空白字符。例如，`new Parser({ identifierPrefixChars: ['@'] })` 会将 `@名称` 解析为标识符，名称保留 `@`。前缀后必须紧跟一个合法标识符，已有 token 和已注册运算符仍优先匹配。
- `features?: { number?: boolean; string?: boolean; call?: boolean }` 控制是否支持数字字面量、字符串字面量和函数调用，每项默认启用。设为 `false` 时，对应语法会报错。关闭 `call` 后仍可使用括号分组。

#### `parser.parse(expression: string): RootNode | null`

解析表达式并返回 AST。空字符串（或纯空白字符）返回 `null`。非法输入抛出 `ParserError`。

#### `parser.stringify(node: Node): string`

将任意 AST 节点转换为表达式文本。二元运算和函数参数使用统一的空格格式，括号用于保留运算分组。数字和字符串字面量保留 `rawValue`。

#### 解析错误提示

通过 `ParserOptions.messages` 配置 `parse()` 的错误提示。传入时必须提供完整的 `Messages`，省略时使用英文。内置语言包可通过 `Parser.Messages.zh` 和 `Parser.Messages.en` 获取。

```js
import { Parser } from 'tiny-expr-parser';

const parser = new Parser({ messages: Parser.Messages.zh });
```

`{v}` 是触发错误的 token 文本。`{pos}` 是从 0 开始的 UTF-16 偏移量，输入提前结束时取输入长度。

`ParserError.code` 对应下表的国际化键。`start` 和 `end` 是从 0 开始的 UTF-16 源码偏移，含首不含尾。`unexpectedEndOfInput` 的两个偏移都等于输入长度。`toJSON()` 返回 `name`、`code`、`start`、`end`、`message` 和 `stack`。

| `Messages` 键               | 场景                                                        | 占位符         |
| --------------------------- | ----------------------------------------------------------- | -------------- |
| `unexpectedToken`           | 未知字符、非法数字，或逗号、括号等 token 出现在不允许的位置 | `{v}`、`{pos}` |
| `unexpectedEndOfInput`      | 输入结束时仍缺操作数或右括号                                | `{pos}`        |
| `unterminatedStringLiteral` | 字符串遇到输入末尾或未转义的换行，且引号尚未闭合            | `{pos}`        |
| `invalidStringEscape`       | 字符串使用了不支持的转义                                    | `{pos}`        |
| `invalidIdentifierEscape`   | 标识符 Unicode 转义格式无效，或解码字符不允许出现在当前位置 | `{pos}`        |

#### `parser.addBinaryOperator(value: string, precedence: number): void`

为当前实例注册二元运算符，或替换已有运算符的优先级。

#### `parser.addUnaryOperator(value: string, precedence: number): void`

为当前实例注册前缀一元运算符，或替换已有运算符的优先级。

#### `version: string`

当前包版本号。

## AST

每个节点都包含 `start` 和 `end`：节点覆盖的源字符串偏移量（start 含首、end 不含尾）。

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
  prefix: boolean; // 恒为 true
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
  rawValue: string; // 源字符串中的原始字面量
  value: string; // 去掉 `_` 分隔符后的 `rawValue`
}

interface StringLiteral {
  type: 'StringLiteral';
  start: number;
  end: number;
  rawValue: string; // 含引号的原文
  value: string; // 解码后的内容
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

## 进阶

### 内置运算符优先级

| 运算符      | 优先级 |
| ----------- | ------ |
| `... + ...` | 13     |
| `... - ...` | 13     |
| `... * ...` | 14     |
| `... / ...` | 14     |

优先级参考 [MDN 运算符优先级表](https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Reference/Operators/Operator_Precedence)。

### 数字语法

解析器接受 `123`、`.5`、`1.5`、`1_000`、`1e3`、`1.2e-3`，以及 `-2`、`-.5` 等负数字面量。在操作数位置，紧贴数字的负号属于数字本身，例如 `1--2` 的右操作数是 `-2`。`_` 分隔符会在 `NumericLiteral.value` 中移除，但在 `rawValue` 中保留。

前缀一元 `+` 和 `-` 可通过 `addUnaryOperator` 注册。已注册的运算符优先匹配。

### 字符串和函数调用

字符串使用单引号或双引号，支持 `\\`、`\'`、`\"`、`\/`、`\b`、`\f`、`\n`、`\r`、`\t` 和 `\v` 转义。

函数名为标识符，例如 `fn()` 和 `fn('text', other(1 + 2))`。参数用逗号分隔，末尾省略逗号。函数调用优先于一元和二元运算。

### 标识符语法

标识符遵循 ECMAScript `IdentifierName` 的字符规则，支持 `求和(金额)` 这样的 Unicode 名称，也可以用 `$` 或 `_` 开头。`\uXXXX` 和 `\u{...}` 转义会解码为 AST 中的名称，位置仍按原文的 UTF-16 偏移量计算。字符分类使用运行环境的 Unicode 属性转义支持。

### 自定义运算符规则

- 必须是不含空白字符的非空字符串，且不能以 `.`、数字或 `?` 开头
- `(`、`)`、`,`、`'` 和 `"` 是保留字符
- 更长的运算符优先匹配；相同 label 时，最近注册的定义优先

## 参与贡献

见 [CONTRIBUTING.md](./CONTRIBUTING.md)，欢迎提交 Issue 和 PR！

## License

[MIT](./LICENSE)
