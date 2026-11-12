# decimal-eval

一个用于解析算术表达式的小巧 JavaScript 库。

[![Build Status](https://www.travis-ci.com/peakchen90/decimal-eval.svg?branch=master)](https://www.travis-ci.com/peakchen90/decimal-eval)
[![Codecov](https://img.shields.io/codecov/c/github/peakchen90/decimal-eval.svg)](https://codecov.io/gh/peakchen90/decimal-eval)
[![npm](https://img.shields.io/npm/v/decimal-eval.svg)](https://www.npmjs.com/package/decimal-eval)
[![BUNDLE SIZE](https://badgen.net/bundlephobia/minzip/decimal-eval)](https://bundlephobia.com/result?p=decimal-eval)
[![GitHub](https://img.shields.io/github/license/mashape/apistatus.svg)](https://github.com/peakchen90/decimal-eval/blob/master/LICENSE)

[English](./README.md) | 简体中文

## 特性

- :writing_hand: 非常容易扩展自己的自定义运算符
- :vulcan_salute: 支持表达式变量占位符

## 快速开始

### 安装

```
# 使用 npm
npm i -S decimal-eval

# 或使用 yarn
yarn add decimal-eval
```

从源码构建请使用 Node.js 24.11+（24.x），运行 `npm run build`。

### 使用

支持解析含内置运算符（`+`、`-`、`*`、`/`）和标识符的表达式。

```js
import { Parser } from 'decimal-eval';

const parser = new Parser();
const ast = parser.parse('1 + abc');
```

可以在每个解析器实例上注册自定义的一元运算符和二元运算符。设置优先级时可参考[内置运算符的优先级](#toc-built-in-operators-precedence)。

```js
import { Parser } from 'decimal-eval';

const parser = new Parser();
parser.addBinaryOperator('+', 10);
parser.addUnaryOperator('sin', 16);

const first = parser.parse('1 + 1');
const second = parser.parse('2 + sin 2');
```

## API

### Parser

#### parser.parse(expression: string): Node | null

解析表达式并返回 AST。同一个实例可连续解析多个表达式。

```js
import { Parser } from 'decimal-eval';

const node = new Parser().parse('1 + 2');
```

#### parser.addBinaryOperator(value: string, precedence: number): void

为当前实例注册二元运算符，或替换它的优先级。

#### parser.addUnaryOperator(value: string, precedence: number): void

为当前实例注册前缀一元运算符，或替换它的优先级。

## 进阶

### <span id="toc-built-in-operators-precedence">内置运算符优先级参考</span>

| 运算符      | 优先级 |
| ----------- | ------ |
| `... + ...` | 13     |
| `... - ...` | 13     |
| `... * ...` | 14     |
| `... / ...` | 14     |
| `+ ...`     | 16     |
| `- ...`     | 16     |
