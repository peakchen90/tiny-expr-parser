import { describe, expect, expectTypeOf, test } from 'vitest';
import { Parser, ParserError, type ArrayExpression, type Node } from '../src';
import { astFixtures } from './fixtures/ast';

describe('Parser Fixtures', () => {
  Object.keys(astFixtures).forEach((expr) => {
    test(`Test expression: \`${expr}\``, () => {
      const ast = new Parser().parse(expr);
      expect(ast).toEqual(astFixtures[expr]);
    });
  });
});

describe('Parser Special Case', () => {
  test('empty string', () => {
    expect(new Parser().parse('')).toBe(null);
  });

  test('skip space', () => {
    expect(new Parser().parse('\r\n 1 \t \v + \t 2 \n')).toMatchObject({
      type: 'Expression',
      expression: {
        type: 'BinaryExpression',
        left: {
          type: 'NumericLiteral',
          value: '1',
        },
        operator: { value: '+' },
        right: {
          type: 'NumericLiteral',
          value: '2',
        },
      },
    });
  });

  test('skips full-width spaces', () => {
    const parser = new Parser();
    expect(parser.parse('\u3000')).toBeNull();
    expect(parser.parse('1\u3000+\u30002')).toMatchObject({
      expression: {
        operator: { value: '+' },
        left: { value: '1' },
        right: { value: '2' },
      },
    });
  });

  test('can parse again after a syntax error on the same instance', () => {
    const parser = new Parser();
    parser.addBinaryOperator('%', 14);
    parser.addUnaryOperator('-', 16);

    expect(() => parser.parse('1 2')).toThrow(SyntaxError);
    expect(parser.parse('-(2%3)')).toMatchObject({
      expression: {
        type: 'UnaryExpression',
        operator: { value: '-' },
        argument: {
          type: 'BinaryExpression',
          operator: { value: '%' },
          left: { value: '2' },
          right: { value: '3' },
        },
      },
    });
  });

  test('parses and stringifies a long chain of same-precedence binary operators', () => {
    const parser = new Parser();
    const input = `1${'+1'.repeat(20_000)}`;
    const ast = parser.parse(input)!;
    expect(ast.expression.type).toBe('BinaryExpression');
    expect(ast.expression.end).toBe(input.length);
    expect(parser.stringify(ast)).toBe(`1${' + 1'.repeat(20_000)}`);
  });
});

describe('Parser Stringify', () => {
  test.each([
    ['1+2*3', '1 + 2 * 3'],
    ['(1+2)*3', '(1 + 2) * 3'],
    ['1-(2-3)', '1 - (2 - 3)'],
    ['(a+b)*c/d', '(a + b) * c / d'],
    ['1--2', '1 - -2'],
    ['[-2, x * (y + 1), f([id])] - 4', '[-2, x * (y + 1), f([id])] - 4'],
    [
      String.raw`f(g(),1_000,'a\n',变量)`,
      String.raw`f(g(), 1_000, 'a\n', 变量)`,
    ],
  ])('stringifies `%s`', (input, expected) => {
    const parser = new Parser();
    const ast = parser.parse(input)!;

    expect(parser.stringify(ast)).toBe(expected);
    expect(parser.stringify(ast.expression)).toBe(expected);
    expect(parser.stringify(ast, () => undefined)).toBe(expected);
  });

  test('stringifies arrays and applies custom formatting to their elements', () => {
    const parser = new Parser();
    const ast = parser.parse(' [1_000,[id,"23"],f(x)] ')!;

    expect(parser.stringify(ast)).toBe('[1_000, [id, "23"], f(x)]');
    expect(
      parser.stringify(ast, (node) => {
        if (node.type === 'Identifier') return node.name.toUpperCase();
      }),
    ).toBe('[1_000, [ID, "23"], F(X)]');
    expect(parser.stringify(parser.parse('[]')!)).toBe('[]');
  });

  test('stringifies a standalone operator node', () => {
    expect(
      new Parser().stringify({
        type: 'Operator',
        value: '+',
        start: 2,
        end: 3,
      }),
    ).toBe('+');
  });

  test('preserves grouping and token boundaries for custom operators', () => {
    const parser = new Parser();
    parser.addBinaryOperator('**', 17);
    parser.addUnaryOperator('low', 0);
    parser.addUnaryOperator('-a', 16);
    parser.addUnaryOperator('-', 16);

    expect(parser.stringify(parser.parse('(a+b)**c')!)).toBe('(a + b) ** c');
    expect(parser.stringify(parser.parse('(low a)+b')!)).toBe('(low a) + b');
    expect(parser.stringify(parser.parse('- a')!)).toBe('- a');
    expect(parser.stringify(parser.parse('-(a+b)')!)).toBe('-(a + b)');
  });

  test('applies the same callback when it delegates to a child node', () => {
    const parser = new Parser();
    const ast = parser.parse("sum(a, 1_000, 'text') + b")!;

    const text = parser.stringify(ast, (node, stringify) => {
      if (node.type === 'Expression') return stringify(node.expression);
      if (node.type === 'Identifier') return node.name.toUpperCase();
    });

    expect(text).toBe("SUM(A, 1_000, 'text') + B");
    expect(parser.stringify(ast)).toBe("sum(a, 1_000, 'text') + b");
  });

  test('applies the callback once to each visited binary node on the left chain', () => {
    const parser = new Parser();
    const ast = parser.parse('a + b + c + d')!;
    const binaryNodes: Node[] = [];

    const text = parser.stringify(ast, (node, stringify) => {
      if (node.type === 'Identifier') return node.name.toUpperCase();
      if (node.type === 'BinaryExpression') {
        binaryNodes.push(node);
        if (node.right.type === 'Identifier' && node.right.name === 'c') {
          return `sum(${stringify(node.left)}, ${stringify(node.right)})`;
        }
      }
    });

    expect(text).toBe('sum(A + B, C) + D');
    expect(binaryNodes).toHaveLength(3);
    expect(new Set(binaryNodes).size).toBe(3);
  });

  test('preserves built-in grouping around customized binary children', () => {
    const parser = new Parser();
    const ast = parser.parse('(a + b) * c + a * (b + c)')!;

    expect(
      parser.stringify(ast, (node) => {
        if (
          node.type === 'BinaryExpression' &&
          node.left.type === 'Identifier' &&
          node.right.type === 'Identifier'
        ) {
          return 'combined';
        }
      }),
    ).toBe('(combined) * c + a * (combined)');
  });

  test('applies the callback to unary operands and operator nodes', () => {
    const parser = new Parser({ unaryOperators: { '-': { precedence: 16 } } });
    const ast = parser.parse('-(a + b)')!;

    expect(
      parser.stringify(ast, (node) => {
        if (node.type === 'Identifier') return node.name.toUpperCase();
        if (node.type === 'Operator')
          return node.value === '-' ? 'neg' : 'plus';
      }),
    ).toBe('neg(A plus B)');
  });

  test('uses an empty string override without visiting the children', () => {
    const parser = new Parser();
    const ast = parser.parse('a + b')!;
    const visited: Node[] = [];

    expect(
      parser.stringify(ast, (node) => {
        visited.push(node);
        return '';
      }),
    ).toBe('');
    expect(visited).toEqual([ast]);
  });

  test('supports a callback on a long binary chain', () => {
    const parser = new Parser();
    const ast = parser.parse(`a${'+a'.repeat(20_000)}`)!;

    expect(
      parser.stringify(ast, (node) => {
        if (node.type === 'Identifier') return 'b';
      }),
    ).toBe(`b${' + b'.repeat(20_000)}`);
  });
});

describe('Parser Walk', () => {
  test('walks nodes depth-first with root-to-parent ancestors', () => {
    const parser = new Parser();
    parser.addUnaryOperator('-', 16);
    const ast = parser.parse(`f(-a, 'x', 1 + 2 * 3)`)!;
    const visited: string[] = [];
    let unaryAncestors: Node[] | undefined;

    parser.walk(ast, {
      Expression(node, ancestors) {
        visited.push(node.type);
        expect(ancestors).toEqual([]);
      },
      CallExpression(node) {
        visited.push(node.type);
      },
      UnaryExpression(node, ancestors) {
        visited.push(node.type);
        unaryAncestors = ancestors;
      },
      BinaryExpression(node) {
        visited.push(`${node.type}:${node.operator.value}`);
      },
      Operator(node) {
        visited.push(`${node.type}:${node.value}`);
      },
      Identifier(node) {
        visited.push(`${node.type}:${node.name}`);
      },
      StringLiteral(node) {
        visited.push(`${node.type}:${node.value}`);
      },
      NumericLiteral(node, ancestors) {
        visited.push(`${node.type}:${node.rawValue}`);
        if (node.rawValue === '3') {
          expect(ancestors.map((ancestor) => ancestor.type)).toEqual([
            'Expression',
            'CallExpression',
            'BinaryExpression',
            'BinaryExpression',
          ]);
        }
      },
    });

    expect(visited).toEqual([
      'Expression',
      'CallExpression',
      'Identifier:f',
      'UnaryExpression',
      'Operator:-',
      'Identifier:a',
      'StringLiteral:x',
      'BinaryExpression:+',
      'NumericLiteral:1',
      'Operator:+',
      'BinaryExpression:*',
      'NumericLiteral:2',
      'Operator:*',
      'NumericLiteral:3',
    ]);
    expect(unaryAncestors).toEqual([ast, ast.expression]);
  });

  test('walks array elements in source order with typed callbacks and ancestors', () => {
    const parser = new Parser();
    const ast = parser.parse('[1, [id, "23"], end]')!;
    const visited: string[] = [];

    parser.walk(ast, {
      ArrayExpression(node) {
        expectTypeOf(node).toEqualTypeOf<ArrayExpression>();
        visited.push(`array:${node.elements.length}`);
      },
      NumericLiteral(node) {
        visited.push(node.rawValue);
      },
      StringLiteral(node) {
        visited.push(node.rawValue);
      },
      Identifier(node, ancestors) {
        expect(ancestors.map((ancestor) => ancestor.type)).toEqual(
          node.name === 'id'
            ? ['Expression', 'ArrayExpression', 'ArrayExpression']
            : ['Expression', 'ArrayExpression'],
        );
        visited.push(node.name);
      },
    });

    expect(visited).toEqual(['array:3', '1', 'array:2', 'id', '"23"', 'end']);
  });

  test('uses the supplied subtree as the ancestor root', () => {
    const parser = new Parser();
    const ast = parser.parse('1 + 2')!;

    parser.walk(ast.expression, {
      BinaryExpression(node, ancestors) {
        expect(ancestors).toEqual([]);
        expect(node).toBe(ast.expression);
      },
      NumericLiteral(node, ancestors) {
        expect(ancestors).toEqual([ast.expression]);
      },
    });
  });

  test('continues through nodes without visitor callbacks', () => {
    const parser = new Parser();
    const ast = parser.parse('1 + 2')!;
    const visited: string[] = [];

    parser.walk(ast, {
      NumericLiteral(node) {
        visited.push(node.rawValue);
      },
    });

    expect(visited).toEqual(['1', '2']);
  });

  test('skips only the current node children', () => {
    const parser = new Parser();
    const ast = parser.parse('f(a + b, c)')!;
    const visited: string[] = [];

    parser.walk(ast, {
      BinaryExpression(node, ancestors, options) {
        visited.push(`${node.type}:${node.operator.value}`);
        expect(ancestors.map((ancestor) => ancestor.type)).toEqual([
          'Expression',
          'CallExpression',
        ]);
        options.skip();
      },
      Operator(node) {
        visited.push(`${node.type}:${node.value}`);
      },
      Identifier(node, ancestors) {
        visited.push(`${node.type}:${node.name}`);
        if (node.name === 'c') {
          expect(ancestors.map((ancestor) => ancestor.type)).toEqual([
            'Expression',
            'CallExpression',
          ]);
        }
      },
    });

    expect(visited).toEqual([
      'Identifier:f',
      'BinaryExpression:+',
      'Identifier:c',
    ]);
  });

  test('stops the entire traversal immediately', () => {
    const parser = new Parser();
    const ast = parser.parse('f(a, b, c)')!;
    const visited: string[] = [];

    parser.walk(ast, {
      Identifier(node, ancestors, options) {
        visited.push(node.name);
        if (node.name === 'b') {
          options.stop();
        }
      },
    });

    expect(visited).toEqual(['f', 'a', 'b']);
  });

  test('walks a deeply nested tree without recursive calls', () => {
    const parser = new Parser();
    const ast = parser.parse(`1${'+1'.repeat(20_000)}`)!;
    let rootVisited = false;

    parser.walk(ast, {
      Expression() {
        rootVisited = true;
      },
    });

    expect(rootVisited).toBe(true);
  });
});

describe('Parser Features', () => {
  test('fills in omitted parser options at construction', () => {
    const parser = new Parser({ features: { call: false } });

    expect(parser.options).toEqual({
      identifierPrefixChars: [],
      messages: Parser.Messages.en,
      features: {
        number: true,
        string: true,
        call: false,
        plusOperator: true,
        minusOperator: true,
        timesOperator: true,
        divOperator: true,
      },
      binaryOperators: {},
      unaryOperators: {},
    });
  });

  test('disables number literals independently', () => {
    const parser = new Parser({
      features: { number: false },
    });

    expect(() => parser.parse('f(2)')).toThrow(
      'Unexpected token 2 at position 2',
    );
    expect(() => parser.parse('.5')).toThrow(
      'Unexpected token . at position 0',
    );
    expect(() => parser.parse('f(-2)')).toThrow(
      'Unexpected token - at position 2',
    );
    expect(parser.parse('f("text")')).toMatchObject({
      expression: {
        type: 'CallExpression',
        arguments: [{ type: 'StringLiteral', value: 'text' }],
      },
    });
  });

  test('disables string literals independently', () => {
    const parser = new Parser({
      features: { string: false },
    });

    expect(() => parser.parse("f('text')")).toThrow(
      "Unexpected token ' at position 2",
    );
    expect(() => parser.parse('"text"')).toThrow(
      'Unexpected token " at position 0',
    );
    expect(parser.parse('f(2)')).toMatchObject({
      expression: {
        type: 'CallExpression',
        arguments: [{ type: 'NumericLiteral', value: '2' }],
      },
    });
  });

  test('disables the plus operator independently', () => {
    const parser = new Parser({ features: { plusOperator: false } });

    expect(() => parser.parse('1 + 2')).toThrow(
      'Unexpected token + at position 2',
    );
    expect(parser.parse('1 - 2 * 3')).toMatchObject({
      expression: { operator: { value: '-' } },
    });
  });

  test('disables the minus operator while keeping negative literals', () => {
    const parser = new Parser({ features: { minusOperator: false } });

    expect(() => parser.parse('1 - 2')).toThrow(
      'Unexpected token - at position 2',
    );
    expect(() => parser.parse('1 - -2')).toThrow(
      'Unexpected token - at position 2',
    );
    expect(() => parser.parse('- 2')).toThrow(
      'Unexpected token - at position 0',
    );
    expect(parser.parse('-2')).toMatchObject({
      expression: { type: 'NumericLiteral', rawValue: '-2', value: '-2' },
    });
    expect(parser.parse('-.5 * 2')).toMatchObject({
      expression: {
        type: 'BinaryExpression',
        operator: { value: '*' },
        left: { type: 'NumericLiteral', rawValue: '-.5' },
      },
    });
  });

  test('disables the times operator independently', () => {
    const parser = new Parser({ features: { timesOperator: false } });

    expect(() => parser.parse('1 * 2')).toThrow(
      'Unexpected token * at position 2',
    );
    expect(parser.parse('1 + 2 / 3')).toMatchObject({
      expression: { operator: { value: '+' } },
    });
  });

  test('disables the div operator independently', () => {
    const parser = new Parser({ features: { divOperator: false } });

    expect(() => parser.parse('1 / 2')).toThrow(
      'Unexpected token / at position 2',
    );
    expect(parser.parse('1 * 2 + 3')).toMatchObject({
      expression: { operator: { value: '+' } },
    });
  });

  test('a custom operator still matches when the built-in is disabled', () => {
    const parser = new Parser({ features: { plusOperator: false } });
    parser.addBinaryOperator('+', 1);

    expect(parser.parse('1 + 2 * 3')).toMatchObject({
      expression: {
        operator: { value: '+' },
        right: { operator: { value: '*' } },
      },
    });
  });

  test('disables calls while allowing grouping parentheses', () => {
    const parser = new Parser({
      features: { call: false },
    });

    expect(() => parser.parse('f()')).toThrow(
      'Unexpected token ( at position 1',
    );
    expect(parser.parse('("text" + 2)')).toMatchObject({
      expression: {
        type: 'BinaryExpression',
        left: { type: 'StringLiteral', value: 'text' },
        right: { type: 'NumericLiteral', value: '2' },
      },
    });
  });

  test('parses identifier expressions with all features disabled', () => {
    const parser = new Parser({
      features: { number: false, string: false, call: false },
    });
    parser.addUnaryOperator('-', 16);

    expect(parser.parse('-(a + b)')).toMatchObject({
      expression: {
        type: 'UnaryExpression',
        argument: {
          type: 'BinaryExpression',
          left: { type: 'Identifier', name: 'a' },
          right: { type: 'Identifier', name: 'b' },
        },
      },
    });
  });
});

describe('Identifier', () => {
  test.each([
    ['中文_名称2', '中文_名称2'],
    ['$金额', '$金额'],
    ['_私有', '_私有'],
    ['καφέ', 'καφέ'],
    ['e\u0301', 'e\u0301'],
    ['a\u200Cb\u200Dc', 'a\u200Cb\u200Dc'],
    ['𠀀字', '𠀀字'],
    [String.raw`\u4E2D文`, '中文'],
    [String.raw`\u{20000}字`, '𠀀字'],
    [String.raw`名\u0030\u200C\u{24}`, '名0\u200C$'],
  ])('parses identifier `%s`', (input, name) => {
    expect(new Parser().parse(` ${input}`)).toMatchObject({
      expression: { type: 'Identifier', name, start: 1, end: input.length + 1 },
    });
  });

  test.each([
    ['\u0301a', 'Unexpected token \u0301 at position 0'],
    ['\u200C名', 'Unexpected token \u200C at position 0'],
    ['名🙂', 'Unexpected token 🙂 at position 1'],
    [
      String.raw`\u0030名`,
      'Invalid Unicode escape in identifier at position 0',
    ],
    [
      String.raw`名\u0020`,
      'Invalid Unicode escape in identifier at position 1',
    ],
    [String.raw`\u{}`, 'Invalid Unicode escape in identifier at position 0'],
    [
      String.raw`\u{110000}`,
      'Invalid Unicode escape in identifier at position 0',
    ],
    [String.raw`\uD800`, 'Invalid Unicode escape in identifier at position 0'],
    [String.raw`\u12`, 'Invalid Unicode escape in identifier at position 0'],
  ])('rejects invalid identifier `%s`', (input, message) => {
    expect(() => new Parser().parse(input)).toThrow(
      expect.objectContaining({ constructor: ParserError, message }),
    );
  });
});

describe('Identifier Prefix Characters', () => {
  test('parses configured prefixes as part of the identifier name', () => {
    const parser = new Parser({ identifierPrefixChars: ['@', '~'] });

    expect(parser.parse(' @金额 + ~系数 ')).toMatchObject({
      expression: {
        type: 'BinaryExpression',
        left: { type: 'Identifier', name: '@金额', start: 1, end: 4 },
        right: { type: 'Identifier', name: '~系数', start: 7, end: 10 },
      },
    });
  });

  test('supports prefixed function names and supplementary Unicode prefixes', () => {
    const parser = new Parser({ identifierPrefixChars: ['@', '🧮'] });

    expect(parser.parse('@函数(🧮数)')).toMatchObject({
      expression: {
        type: 'CallExpression',
        callee: { type: 'Identifier', name: '@函数', start: 0, end: 3 },
        arguments: [{ type: 'Identifier', name: '🧮数', start: 4, end: 7 }],
      },
    });
  });

  test('decodes Unicode escapes after a configured prefix', () => {
    const parser = new Parser({ identifierPrefixChars: ['@'] });

    expect(parser.parse(String.raw`@\u540D`)).toMatchObject({
      expression: { type: 'Identifier', name: '@名', start: 0, end: 7 },
    });
  });

  test('requires configuration and only accepts extra characters at the start', () => {
    expect(() => new Parser().parse('@名称')).toThrow(SyntaxError);

    const parser = new Parser({ identifierPrefixChars: ['@'] });
    expect(() => parser.parse('变量@名称')).toThrow(SyntaxError);
  });

  test.each(['@', '@123', '@@名称', '@ 名称', String.raw`@\u0030名称`])(
    'rejects a prefix without a valid identifier in `%s`',
    (input) => {
      const parser = new Parser({ identifierPrefixChars: ['@'] });
      expect(() => parser.parse(input)).toThrow(SyntaxError);
    },
  );

  test('keeps registered operators ahead of identifier prefixes', () => {
    const parser = new Parser({ identifierPrefixChars: ['~'] });
    parser.addUnaryOperator('~', 16);

    expect(parser.parse('~名称')).toMatchObject({
      expression: {
        type: 'UnaryExpression',
        operator: { type: 'Operator', value: '~' },
        argument: { type: 'Identifier', name: '名称' },
      },
    });
  });

  test.each(['', '@@', ' ', '\t', '\n', '\u00a0', '\u3000'])(
    'rejects invalid prefix option `%j`',
    (prefix) => {
      expect(() => new Parser({ identifierPrefixChars: [prefix] })).toThrow(
        'Each identifier prefix must be a single non-whitespace character',
      );
    },
  );
});

describe('String Literal', () => {
  test.each([
    ['""', ''],
    ["''", ''],
    ["'你好🙂, (+)'", '你好🙂, (+)'],
    [String.raw`'it\'s'`, "it's"],
    [String.raw`"a\"b\\c\n\t"`, 'a"b\\c\n\t'],
    [String.raw`"\b\f\r\v\/"`, '\b\f\r\v/'],
  ])('parses string literal `%s`', (input, value) => {
    expect(new Parser().parse(` ${input} `)).toEqual({
      type: 'Expression',
      start: 1,
      end: input.length + 1,
      expression: {
        type: 'StringLiteral',
        rawValue: input,
        value,
        start: 1,
        end: input.length + 1,
      },
    });
  });

  test.each([
    ['"abc', 'Unterminated string literal at position 0'],
    ["'abc\\", 'Unterminated string literal at position 0'],
    ['"line\nbreak"', 'Unterminated string literal at position 5'],
    [String.raw`'\q'`, 'Invalid string escape at position 2'],
  ])('rejects malformed string literal `%s`', (input, message) => {
    expect(() => new Parser().parse(input)).toThrow(
      expect.objectContaining({ constructor: ParserError, message }),
    );
  });

  test.each([
    [String.raw`1 '\n'`, 2],
    [String.raw`f(1 '\n')`, 4],
  ])(
    'reports the original text of an unexpected string literal in `%s`',
    (input, position) => {
      expect(() => new Parser().parse(input)).toThrow(
        String.raw`Unexpected token '\n' at position ${position}`,
      );
    },
  );
});

describe('Call Expression', () => {
  test('binds calls before unary and binary operators and parses nested arguments', () => {
    const parser = new Parser();
    parser.addUnaryOperator('abs', 16);

    expect(parser.parse('1 + abs f(g(), -2 * 3) * 4')).toMatchObject({
      expression: {
        operator: { value: '+' },
        right: {
          operator: { value: '*' },
          left: {
            type: 'UnaryExpression',
            operator: { value: 'abs' },
            argument: {
              type: 'CallExpression',
              callee: { name: 'f' },
              arguments: [
                {
                  type: 'CallExpression',
                  callee: { name: 'g' },
                  arguments: [],
                },
                {
                  operator: { value: '*' },
                  left: {
                    type: 'NumericLiteral',
                    value: '-2',
                  },
                  right: { value: '3' },
                },
              ],
            },
          },
          right: { value: '4' },
        },
      },
    });
  });

  test.each([
    ['f(', 'Unexpected end of input'],
    ['f(1', 'Unexpected end of input'],
    ['f(,1)', 'Unexpected token , at position 2'],
    ['f(1,,2)', 'Unexpected token , at position 4'],
    ['f(1,)', 'Unexpected token ) at position 4'],
    ['f(1 2)', 'Unexpected token 2 at position 4'],
    ['(f)(1)', 'Unexpected token ( at position 3'],
    ['f()(1)', 'Unexpected token ( at position 3'],
    ['1(2)', 'Unexpected token ( at position 1'],
  ])('rejects invalid call `%s`', (input, message) => {
    expect(() => new Parser().parse(input)).toThrow(
      expect.objectContaining({ constructor: ParserError, message }),
    );
  });
});

describe('Array Expression', () => {
  test.each([
    ['[', 'unexpectedEndOfInput', 1, 1],
    ['[1', 'unexpectedEndOfInput', 2, 2],
    ['[1,', 'unexpectedEndOfInput', 3, 3],
    ['[,1]', 'unexpectedToken', 1, 2],
    ['[1,]', 'unexpectedToken', 3, 4],
    ['[1,,2]', 'unexpectedToken', 3, 4],
    ['[1 2]', 'unexpectedToken', 3, 4],
    ['[1)', 'unexpectedToken', 2, 3],
    ['items[0]', 'unexpectedToken', 5, 6],
  ])('reports a syntax error for %s', (input, code, start, end) => {
    expect(() => new Parser().parse(input)).toThrow(
      expect.objectContaining({ constructor: ParserError, code, start, end }),
    );
  });
});

describe('Parser Messages', () => {
  test.each([
    ['1^2', '位置 1 处出现意外的标记 ^', 'unexpectedToken', 1, 2],
    ['1+ ', '表达式意外结束', 'unexpectedEndOfInput', 3, 3],
    ['"abc', '字符串未闭合（位置 0）', 'unterminatedStringLiteral', 0, 4],
    [
      String.raw`'\q'`,
      '无效的字符串转义（位置 2）',
      'invalidStringEscape',
      2,
      3,
    ],
    [
      String.raw`\u0030名`,
      '标识符中的 Unicode 转义无效（位置 0）',
      'invalidIdentifierEscape',
      0,
      6,
    ],
  ])(
    'uses the Chinese message for `%s`',
    (input, message, code, start, end) => {
      const parser = new Parser({ messages: Parser.Messages.zh });

      expect(() => parser.parse(input)).toThrow(
        expect.objectContaining({
          constructor: ParserError,
          message,
          code,
          start,
          end,
        }),
      );
    },
  );

  test('formats placeholders in a complete custom message set', () => {
    const parser = new Parser({
      messages: {
        ...Parser.Messages.en,
        unexpectedToken: '{pos} => {v} | {v}',
        unexpectedEndOfInput: 'End of input at {pos}',
      },
    });

    expect(() => parser.parse("1 '{pos}$&'")).toThrow(
      "2 => '{pos}$&' | '{pos}$&'",
    );
    expect(() => parser.parse('1+ ')).toThrow('End of input at 3');
    expect(() => parser.parse(String.raw`'\q'`)).toThrow(
      'Invalid string escape at position 2',
    );
  });

  test('rejects an incomplete message set at construction', () => {
    expect(
      () =>
        new Parser({
          // @ts-expect-error Deliberately pass an incomplete message set.
          messages: { unexpectedToken: '{v}' },
        }),
    ).toThrow('Missing or invalid parser message: unexpectedEndOfInput');
  });
});

describe('Parser Error Capture', () => {
  test.each([
    ['1 total', 'unexpectedToken', 2, 7],
    [String.raw`1 '\n'`, 'unexpectedToken', 2, 6],
    ['名🙂', 'unexpectedToken', 1, 3],
    ['1e🙂', 'unexpectedToken', 2, 4],
    ['"a\nb"', 'unterminatedStringLiteral', 2, 3],
    [String.raw`\u12`, 'invalidIdentifierEscape', 0, 1],
  ])('reports the source range for `%s`', (input, code, start, end) => {
    expect(() => new Parser().parse(input)).toThrow(
      expect.objectContaining({ constructor: ParserError, code, start, end }),
    );
  });

  test('serializes a ParserError and remains a SyntaxError', () => {
    const error = new ParserError(
      'Unexpected token ^ at position 1',
      'unexpectedToken',
      1,
      2,
    );
    const json = {
      name: 'ParserError',
      code: 'unexpectedToken',
      start: 1,
      end: 2,
      message: 'Unexpected token ^ at position 1',
      stack: expect.any(String),
    };

    expect(error).toBeInstanceOf(SyntaxError);
    expect(error.toJSON()).toEqual(json);
    expect(JSON.parse(JSON.stringify(error))).toEqual(json);
  });

  test.each([
    ['1e', 'Unexpected token e at position 1'],
    ['1e+', 'Unexpected token + at position 2'],
    ['1e+q', 'Unexpected token q at position 3'],
    ['1e2e3', 'Unexpected token e at position 3'],
    ['1.2.3', 'Unexpected token . at position 3'],
    ['1__2', 'Unexpected token _ at position 2'],
    ['1_', 'Unexpected token _ at position 1'],
    ['.', 'Unexpected token . at position 0'],
    ['-.', 'Unexpected token . at position 1'],
  ])('rejects malformed numeric literal `%s`', (input, message) => {
    expect(() => new Parser().parse(input)).toThrow(
      expect.objectContaining({ constructor: ParserError, message }),
    );
  });

  test.each([
    ['1 2', 'Unexpected token 2 at position 2'],
    ['()', 'Unexpected token ) at position 1'],
    ['(1+2', 'Unexpected end of input'],
    ['1*/2', 'Unexpected token / at position 2'],
  ])('rejects invalid token sequence `%s`', (input, message) => {
    expect(() => new Parser().parse(input)).toThrow(
      expect.objectContaining({ constructor: ParserError, message }),
    );
  });

  test('rejects a numeric separator immediately after the decimal point', () => {
    expect(() => new Parser().parse('1._2')).toThrow(
      'Unexpected token _ at position 2',
    );
  });

  test('unexpected token in the end', () => {
    expect(() => {
      new Parser().parse('1+');
    }).toThrow('Unexpected end of input');
  });

  test.each([
    ['+1', 'Unexpected token + at position 0'],
    ['-x', 'Unexpected token - at position 0'],
    ['-(1)', 'Unexpected token - at position 0'],
    ['- 1', 'Unexpected token - at position 0'],
    ['1++2', 'Unexpected token + at position 2'],
  ])('rejects unregistered prefix operator in `%s`', (input, message) => {
    expect(() => new Parser().parse(input)).toThrow(message);
  });

  test('unexpected token: extra `)`', () => {
    expect(() => {
      new Parser().parse('1+(2+3))');
    }).toThrow('Unexpected token ) at position 7');
  });

  test('unexpected token: missing `)`', () => {
    expect(() => {
      new Parser().parse('(2+3 3');
    }).toThrow('Unexpected token 3 at position 5');
  });

  test('unexpected token: unknown character', () => {
    expect(() => {
      new Parser().parse('1^2');
    }).toThrow('Unexpected token ^ at position 1');
  });
});
