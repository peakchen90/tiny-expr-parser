# tiny-expr-parser

一个零依赖的算术表达式解析库。它把 `1 + 2 * (3 - a)` 这样的字符串解析成 AST —— 不做任何求值，数字和变量的解释方式完全由你掌控。

[![CI](https://github.com/peakchen90/tiny-expr-parser/actions/workflows/ci.yml/badge.svg)](https://github.com/peakchen90/tiny-expr-parser/actions/workflows/ci.yml)
[![Codecov](https://img.shields.io/codecov/c/github/peakchen90/tiny-expr-parser.svg)](https://codecov.io/gh/peakchen90/tiny-expr-parser)
[![npm](https://img.shields.io/npm/v/tiny-expr-parser.svg)](https://www.npmjs.com/package/tiny-expr-parser)
[![bundle size](https://badgen.net/bundlephobia/minzip/tiny-expr-parser)](https://bundlephobia.com/result?p=tiny-expr-parser)
[![license](https://img.shields.io/github/license/peakchen90/tiny-expr-parser.svg)](./LICENSE)

[English](./README.md) | 简体中文

## 特性

- **零依赖** —— 提供 ESM、CommonJS 和 UMD 三种构建产物，支持 tree-shaking
- **只解析、不求值** —— AST 如何解释由你决定
- **数字精度安全** —— 数字字面量以原始字符串保留，不会丢失浮点精度（支持 `1_000`、`.5`、`1.2e-3`）
- **位置信息完整** —— 每个节点都带有源字符串中的 `start` / `end` 偏移量
- **自定义运算符** —— 按实例注册一元 / 二元运算符，并显式指定优先级
- **标识符支持** —— `a + b` 这类变量占位符由你自行解析
- **错误信息友好** —— 非法输入抛出携带位置信息的 `SyntaxError`

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

由于 `tiny-expr-parser` 不做求值，`NumericLiteral.value` 刻意保持为字符串。可以用你偏好的十进制库（如 `decimal.js`）或 `Number` 来转换。

自定义运算符按解析器实例注册。设置优先级时可参考[内置运算符的优先级](#内置运算符优先级)。

```js
import { Parser } from 'tiny-expr-parser';

const parser = new Parser();
parser.addBinaryOperator('%', 14); // 取余
parser.addUnaryOperator('sin', 16);

const first = parser.parse('1 + 1 % 2');
const second = parser.parse('2 + sin 2');
```

非法表达式会抛出带位置信息的 `SyntaxError`：

```js
new Parser().parse('1 + +');
// SyntaxError: Unexpected end of input
```

## API

### `new Parser()`

创建一个解析器实例，同一实例可连续解析多个表达式。

#### `parser.parse(expression: string): RootNode | null`

解析表达式并返回 AST。空字符串（或纯空白字符）返回 `null`。非法输入抛出 `SyntaxError`。

#### `parser.addBinaryOperator(value: string, precedence: number): void`

为当前实例注册二元运算符，或替换已有运算符的优先级。

#### `parser.addUnaryOperator(value: string, precedence: number): void`

为当前实例注册前缀一元运算符，或替换已有运算符的优先级。

#### `version: string`

当前包版本号。

## AST

每个节点都包含 `start` 和 `end`：节点覆盖的源字符串偏移量（start 含首、end 不含尾）。

| 节点               | 字段                             | 描述                                     |
| ------------------ | -------------------------------- | ---------------------------------------- |
| `Expression`       | `expression`                     | 根节点                                   |
| `BinaryExpression` | `left`、`right`、`operator`      | 如 `1 + 2`                               |
| `UnaryExpression`  | `argument`、`operator`、`prefix` | 前缀运算符，如 `-1`、`sin 2`             |
| `NumericLiteral`   | `rawValue`、`value`              | `value` 是去掉 `_` 分隔符后的 `rawValue` |
| `Identifier`       | `name`                           | 变量占位符，如 `a`                       |

## 进阶

### 内置运算符优先级

| 运算符      | 优先级 |
| ----------- | ------ |
| `... + ...` | 13     |
| `... - ...` | 13     |
| `... * ...` | 14     |
| `... / ...` | 14     |
| `+ ...`     | 16     |
| `- ...`     | 16     |

优先级参考 [MDN 运算符优先级表](https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Reference/Operators/Operator_Precedence)。

### 数字语法

解析器接受 `123`、`.5`、`1.5`、`1_000`、`1e3`、`1.2e-3`。`_` 分隔符会在 `NumericLiteral.value` 中移除，但在 `rawValue` 中保留。

### 自定义运算符规则

- 必须是不含空白字符的非空字符串，且不能以 `.`、数字或 `?` 开头
- `(` 和 `)` 是保留字符
- 更长的运算符优先匹配；相同 label 时，最近注册的定义优先

## 参与贡献

见 [CONTRIBUTING.md](./CONTRIBUTING.md)，欢迎提交 Issue 和 PR！

## License

[MIT](./LICENSE)
