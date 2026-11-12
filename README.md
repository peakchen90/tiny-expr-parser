# decimal-eval

A tiny JavaScript parser for decimal arithmetic expressions.

[![Build Status](https://www.travis-ci.com/peakchen90/decimal-eval.svg?branch=master)](https://www.travis-ci.com/peakchen90/decimal-eval)
[![Codecov](https://img.shields.io/codecov/c/github/peakchen90/decimal-eval.svg)](https://codecov.io/gh/peakchen90/decimal-eval)
[![npm](https://img.shields.io/npm/v/decimal-eval.svg)](https://www.npmjs.com/package/decimal-eval)
[![BUNDLE SIZE](https://badgen.net/bundlephobia/minzip/decimal-eval)](https://bundlephobia.com/result?p=decimal-eval)
[![GitHub](https://img.shields.io/github/license/mashape/apistatus.svg)](https://github.com/peakchen90/decimal-eval/blob/master/LICENSE)

English | [简体中文](./README.ZH-CN.md)

## Features

- :writing_hand: Easy to extend custom operator
- :vulcan_salute: Supports identifiers in expressions

## Get Started

### Installation

```
# use npm
npm i -S decimal-eval

# or use yarn
yarn add decimal-eval
```

To build from source, use Node.js 24.11+ (24.x) and run `npm run build`.

### Usage

Parse expressions with the built-in operators (`+`, `-`, `*`, `/`) and identifiers.

```js
import { Parser } from 'decimal-eval';

const parser = new Parser();
const ast = parser.parse('1 + abc');
```

You can register custom unary and binary operators on each parser instance.
See the [precedence of built-in operators](#toc-built-in-operators-precedence) when choosing a precedence.

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

Parse an arithmetic expression. The same instance can parse multiple expressions.

```js
import { Parser } from 'decimal-eval';

const node = new Parser().parse('1 + 2');
```

#### parser.addBinaryOperator(value: string, precedence: number): void

Register a binary operator or replace its precedence on this instance.

#### parser.addUnaryOperator(value: string, precedence: number): void

Register a prefix unary operator or replace its precedence on this instance.

## Advanced

### <span id="toc-built-in-operators-precedence">Precedence of built-in operators</span>

| operator    | precedence |
| ----------- | ---------- |
| `... + ...` | 13         |
| `... - ...` | 13         |
| `... * ...` | 14         |
| `... / ...` | 14         |
| `+ ...`     | 16         |
| `- ...`     | 16         |
