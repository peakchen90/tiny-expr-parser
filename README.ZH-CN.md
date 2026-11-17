# tiny-expr-parser

一个小型零依赖的表达式解析库。支持将 `1 + 2 * (3 - a)` 这样的字符串解析成 AST。

[![CI](https://github.com/peakchen90/tiny-expr-parser/actions/workflows/ci.yml/badge.svg)](https://github.com/peakchen90/tiny-expr-parser/actions/workflows/ci.yml)
[![Codecov](https://img.shields.io/codecov/c/github/peakchen90/tiny-expr-parser.svg)](https://codecov.io/gh/peakchen90/tiny-expr-parser)
[![npm](https://img.shields.io/npm/v/tiny-expr-parser.svg)](https://www.npmjs.com/package/tiny-expr-parser)
[![license](https://img.shields.io/github/license/peakchen90/tiny-expr-parser.svg)](./LICENSE)

[English](./README.md) | 简体中文

## 特性

- 轻量，零运行时依赖
- 语法可配置，支持自定义运算符
- 支持严格与宽松解析，适合语法校验和实时高亮
- AST 带源码位置，支持遍历和自定义输出

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

自定义运算符按解析器实例注册，可通过构造参数或实例方法配置。设置优先级时可参考[内置运算符的优先级](#内置运算符优先级)。

```js
import { Parser } from 'tiny-expr-parser';

const parser = new Parser({
  binaryOperators: { '%': { precedence: 14 } }, // 取余
  unaryOperators: { sin: { precedence: 16 } },
});

// 等价的实例方法：
// parser.addBinaryOperator('%', 14);
// parser.addUnaryOperator('sin', 16);

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

| 选项                    | 类型                                     | 默认值   | 说明                                                                                                                                                                                                       |
| ----------------------- | ---------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `identifierPrefixChars` | `string[]`                               | `[]`     | 标识符额外前缀，每个前缀必须是非空白单字符。例如 `new Parser({ identifierPrefixChars: ['@'] })` 将 `@名称` 解析为标识符，名称保留 `@`。前缀后必须紧跟一个合法标识符，已有 token 和已注册运算符仍优先匹配。 |
| `features`              | `Features`                               | 全部启用 | 语法开关，见下表。                                                                                                                                                                                         |
| `binaryOperators`       | `Record<string, { precedence: number }>` | `{}`     | 构造时注册的二元运算符，键为运算符文本，值为优先级配置。遵循[自定义运算符规则](#自定义运算符规则)，之后仍可通过 `parser.addBinaryOperator()` 更新。                                                        |
| `unaryOperators`        | `Record<string, { precedence: number }>` | `{}`     | 构造时注册的前缀一元运算符，规则与 `binaryOperators` 相同。                                                                                                                                                |

所有语法默认启用，设为 `false` 时对应语法会报错。

| 语法开关        | 说明                                                 |
| --------------- | ---------------------------------------------------- |
| `number`        | 数字字面量，关闭后 `-2` 等负数字面量也不可用。       |
| `string`        | 字符串字面量。                                       |
| `array`         | 数组表达式。                                         |
| `call`          | 函数调用，关闭后括号仍可用于分组。                   |
| `plusOperator`  | 内置二元运算符 `+`。                                 |
| `minusOperator` | 内置二元运算符 `-`，关闭后 `-2` 等负数字面量仍可用。 |
| `timesOperator` | 内置二元运算符 `*`。                                 |
| `divOperator`   | 内置二元运算符 `/`。                                 |

#### `parser.parse(expression: string): RootNode | null`

解析表达式并返回 AST。空字符串（或纯空白字符）返回 `null`。非法输入抛出 `ParserError`。

#### `parser.parseLoose(expression: string): LooseParseResult`

解析编辑中的表达式，遇到语法错误时记录错误并继续识别后续节点。严格解析使用 `parse()`。两种方法共用实例的语法开关、自定义运算符、标识符前缀和错误消息配置。

```ts
interface LooseParseResult {
  nodes: Node[];
  errors: ParserError[];
}
```

- `nodes` 是按源码顺序排列的 AST 片段，可以逐个传给 `walk()`。合法表达式返回一个根节点，其结构和范围与 `parse()` 的结果一致。缺少必要子节点时，已识别的节点可以单独返回，例如 `a +` 会返回标识符 `a` 和运算符 `+`。
- 函数参数或数组元素在分隔符、匹配的右括号或输入末尾缺少操作数时，`parseLoose()` 会保留外层节点和已能完成的表达式。例如 `f(a + , b)` 会保留函数调用及参数 `a`、`b`，并在逗号处报错。
- `errors` 是按起始位置排列的 `ParserError`。使用 `code` 和 `message` 展示诊断，用 `start` 和 `end` 定位。节点范围和错误范围都采用从 0 开始、含首不含尾的 UTF-16 偏移，可直接用于 `input.slice(start, end)`。输入意外结束时，两个错误偏移都等于 `input.length`。
- 空字符串或纯空白输入返回两个空数组。如果没有可识别的节点，例如输入 `?`，`nodes` 为空，`errors` 仍包含错误。

下例在编辑过程中区分函数名与普通标识符，并单独标记错误字符。字面量节点可覆盖不完整的输入，可以直接用节点范围给原文着色。括号、逗号和空白可从源码读取。

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

// highlights 包含 sum [0, 3)、a [4, 5) 和 b [10, 11)
console.log(errors.map(({ start, end }) => [start, end])); // [[7, 8]]
```

#### `parser.stringify(node: Node, customStringify?: StringifyCallback): string`

将任意 AST 节点转换为表达式文本。二元运算、函数参数和数组元素使用统一的空格格式，括号用于保留运算分组。数字和字符串字面量保留 `rawValue`。

第二个参数是可选的节点转换回调。返回字符串时使用该结果，包括空字符串。返回 `undefined` 时使用当前节点的内置转换逻辑，其子节点仍会应用这个回调。调用回调参数 `stringify(child)` 也会用同一个回调转换指定节点。

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
// text 为 'SUM(A, 2) + B'
```

#### `parser.walk(node: Node, visitors: WalkVisitors): void`

以深度优先前序迭代遍历 AST，不使用递归函数。每个回调接收当前节点 `node`、祖先列表 `ancestors` 和控制对象 `options`。调用 `options.skip()` 可跳过当前节点的所有子节点，并继续遍历当前子树之外的后续节点；调用 `options.stop()` 可立即终止整个遍历。

`ancestors` 按从起始节点到当前节点直接父节点的顺序排列，不包含当前节点；起始节点的祖先列表为 `[]`。包括 `Operator` 在内的所有节点都会遍历，子节点按源码顺序访问。各类回调均可省略，省略某个节点的回调不会跳过其子树。TypeScript 会自动推导每个回调的具体节点类型。

```js
const ast = parser.parse('a + 2 * b');

parser.walk(ast, {
  Expression(node, ancestors) {
    console.log(ancestors); // []
  },
  BinaryExpression(node, ancestors, options) {
    if (node.operator.value === '*') {
      options.skip(); // 跳过当前子树，包括 b
    }
  },
  Identifier(node, ancestors) {
    console.log(node.name); // 'a'
    console.log(ancestors.map((ancestor) => ancestor.type));
    // ['Expression', 'BinaryExpression']
  },
});
```

#### 解析错误提示

通过 `ParserOptions.messages` 配置 `parse()` 和 `parseLoose()` 的错误提示。传入时必须提供完整的 `Messages`，省略时使用英文。内置语言包可通过 `Parser.Messages.zh` 和 `Parser.Messages.en` 获取。

```js
import { Parser } from 'tiny-expr-parser';

const parser = new Parser({ messages: Parser.Messages.zh });
```

`{v}` 是触发错误的 token 文本。`{pos}` 是从 0 开始的 UTF-16 偏移量，输入提前结束时取输入长度。

`ParserError.code` 对应下表的国际化键。`start` 和 `end` 是从 0 开始的 UTF-16 源码偏移，含首不含尾。`unexpectedEndOfInput` 的两个偏移都等于输入长度。`toJSON()` 返回 `name`、`code`、`start`、`end`、`message` 和 `stack`。

| `Messages` 键               | 场景                                                        | 占位符         |
| --------------------------- | ----------------------------------------------------------- | -------------- |
| `unexpectedToken`           | 未知字符、非法数字，或逗号、圆括号、方括号等出现在不允许的位置 | `{v}`、`{pos}` |
| `unexpectedEndOfInput`      | 输入结束时仍缺操作数、右圆括号或右方括号                       | `{pos}`        |
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
  prefix: boolean; // 恒为 true
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

前缀一元 `+` 和 `-` 可通过 `addUnaryOperator` 或 `unaryOperators` 选项注册。已注册的运算符优先匹配。

### 字符串和函数调用

字符串使用单引号或双引号，支持 `\\`、`\'`、`\"`、`\/`、`\b`、`\f`、`\n`、`\r`、`\t` 和 `\v` 转义。

函数名为标识符，例如 `fn()` 和 `fn('text', other(1 + 2))`。参数用逗号分隔，末尾省略逗号。函数调用优先于一元和二元运算。

### 数组

数组使用方括号包裹逗号分隔的表达式，例如 `[1, "23", id]`。支持空数组和嵌套数组。每个元素可以是完整表达式，例如 `[x + 1, fn(id), [2]]`。每个分隔位置都需要提供元素，末尾省略逗号。

数组在 AST 中表示为 `ArrayExpression` 节点。其 `elements` 按源码顺序排列，节点范围包含两个方括号。`walk()` 按顺序访问数组元素，`stringify()` 用逗号和一个空格连接元素。遇到缺失元素或右方括号时，`parseLoose()` 可以保留已识别的元素。

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

方括号与已有的自定义运算符或标识符前缀发生匹配冲突时，优先采用已有的匹配结果。

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
