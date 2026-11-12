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
});

describe('Parser Error Capture', () => {
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
