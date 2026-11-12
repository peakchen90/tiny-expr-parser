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
        operator: '+',
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
      expression: { operator: '+', left: { value: '1' }, right: { value: '2' } },
    });
  });

  test.each([
    ['.5e-2', '.5e-2'],
    ['1e-1_0', '1e-10'],
  ])('parses numeric literal `%s`', (input, value) => {
    expect(new Parser().parse(input)).toMatchObject({
      expression: { type: 'NumericLiteral', rawValue: input, value, start: 0, end: input.length },
    });
  });

  test('preserves source offsets around whitespace and parentheses', () => {
    expect(new Parser().parse(' \u3000(a_1) + .5 ')).toMatchObject({
      start: 2,
      end: 12,
      expression: {
        type: 'BinaryExpression',
        operator: '+',
        start: 2,
        end: 12,
        left: { type: 'Identifier', name: 'a_1', start: 3, end: 6 },
        right: { type: 'NumericLiteral', rawValue: '.5', start: 10, end: 12 },
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
        operator: '-',
        argument: { type: 'BinaryExpression', operator: '%', left: { value: '2' }, right: { value: '3' } },
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
    expect(() => new Parser().parse(input)).toThrow(expect.objectContaining({ constructor: SyntaxError, message }));
  });

  test.each([
    ['1 2', 'Unexpected token 2 at position 2'],
    ['()', 'Unexpected token ) at position 1'],
    ['(1+2', 'Unexpected end of input'],
    ['1*/2', 'Unexpected token / at position 2'],
  ])('rejects invalid token sequence `%s`', (input, message) => {
    expect(() => new Parser().parse(input)).toThrow(expect.objectContaining({ constructor: SyntaxError, message }));
  });

  test('rejects a numeric separator immediately after the decimal point', () => {
    expect(() => new Parser().parse('1._2')).toThrow('Unexpected token _ at position 2');
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
