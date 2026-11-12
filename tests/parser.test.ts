import { describe, expect, test } from 'vitest';
import { Parser } from '../src';
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

  test('parses a long chain of same-precedence binary operators', () => {
    const input = `1${'+1'.repeat(20_000)}`;
    const ast = new Parser().parse(input);
    expect(ast?.expression.type).toBe('BinaryExpression');
    expect(ast?.expression.end).toBe(input.length);
  });
});

describe('Parser Features', () => {
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
      expect.objectContaining({ constructor: SyntaxError, message }),
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
        operator: { type: 'ExpressionOperator', value: '~' },
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
      expect.objectContaining({ constructor: SyntaxError, message }),
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
    expect(new Parser().parse('1 + -f(g(), -2 * 3) * 4')).toMatchObject({
      expression: {
        operator: { value: '+' },
        right: {
          operator: { value: '*' },
          left: {
            type: 'UnaryExpression',
            operator: { value: '-' },
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
                    type: 'UnaryExpression',
                    operator: { value: '-' },
                    argument: { value: '2' },
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
      expect.objectContaining({ constructor: SyntaxError, message }),
    );
  });
});

describe('Parser Messages', () => {
  test.each([
    ['1^2', '位置 1 处出现意外的标记 ^'],
    ['1+', '表达式意外结束'],
    ['"abc', '字符串未闭合（位置 0）'],
    [String.raw`'\q'`, '无效的字符串转义（位置 2）'],
    [String.raw`\u0030名`, '标识符中的 Unicode 转义无效（位置 0）'],
  ])('uses the Chinese message for `%s`', (input, message) => {
    const parser = new Parser({ messages: Parser.Messages.zh });

    expect(() => parser.parse(input)).toThrow(
      expect.objectContaining({ constructor: SyntaxError, message }),
    );
  });

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
    ['1e', 'Unexpected token e at position 1'],
    ['1e+', 'Unexpected token + at position 2'],
    ['1e+q', 'Unexpected token q at position 3'],
    ['1e2e3', 'Unexpected token e at position 3'],
    ['1.2.3', 'Unexpected token . at position 3'],
    ['1__2', 'Unexpected token _ at position 2'],
    ['1_', 'Unexpected token _ at position 1'],
    ['.', 'Unexpected token . at position 0'],
  ])('rejects malformed numeric literal `%s`', (input, message) => {
    expect(() => new Parser().parse(input)).toThrow(
      expect.objectContaining({ constructor: SyntaxError, message }),
    );
  });

  test.each([
    ['1 2', 'Unexpected token 2 at position 2'],
    ['()', 'Unexpected token ) at position 1'],
    ['(1+2', 'Unexpected end of input'],
    ['1*/2', 'Unexpected token / at position 2'],
  ])('rejects invalid token sequence `%s`', (input, message) => {
    expect(() => new Parser().parse(input)).toThrow(
      expect.objectContaining({ constructor: SyntaxError, message }),
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

  test('unexpected token when read numeric with prefix', () => {
    expect(() => {
      new Parser().parse('1++)+1');
    }).toThrow('Unexpected token ) at position 3');
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
