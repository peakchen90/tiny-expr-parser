import { describe, expect, test } from 'vitest';
import { Parser } from '../src';

describe('Binary Operator', () => {
  test('custom binary operator: `%`', () => {
    const parser = new Parser();
    parser.addBinaryOperator('%', 14);
    expect(parser.parse('2 % 3')).toMatchObject({
      expression: { type: 'BinaryExpression', operator: { value: '%' } },
    });
    expect(parser.parse('2 % 3 + 5')).toMatchObject({
      expression: {
        operator: { value: '+' },
        left: { operator: { value: '%' } },
      },
    });
  });

  test('custom binary operator: `**`', () => {
    const parser = new Parser();
    parser.addBinaryOperator('**', 15);
    parser.addBinaryOperator('*', 14);
    expect(parser.parse('2 ** 3')).toMatchObject({
      expression: {
        type: 'BinaryExpression',
        operator: { type: 'ExpressionOperator', value: '**', start: 2, end: 4 },
      },
    });
    expect(parser.parse('2 ** 3 - 1')).toMatchObject({
      expression: {
        operator: { value: '-' },
        left: { operator: { value: '**' } },
      },
    });
  });

  test('reports UTF-16 offsets for operators in Unicode expressions', () => {
    const parser = new Parser();
    parser.addBinaryOperator('🧮', 13);

    expect(parser.parse('𠀀 🧮 -2')).toMatchObject({
      expression: {
        type: 'BinaryExpression',
        operator: { type: 'ExpressionOperator', value: '🧮', start: 3, end: 5 },
        right: {
          type: 'NumericLiteral',
          rawValue: '-2',
          value: '-2',
          start: 6,
          end: 8,
        },
      },
    });
  });

  test('accepts a prefix operand after a higher-precedence binary operator', () => {
    const parser = new Parser();
    parser.addBinaryOperator('**', 17);
    parser.addUnaryOperator('-', 16);

    expect(parser.parse('2 ** - 3 * 4')).toMatchObject({
      expression: {
        operator: { value: '*' },
        left: {
          operator: { value: '**' },
          right: {
            type: 'UnaryExpression',
            operator: { value: '-' },
            argument: { type: 'NumericLiteral', value: '3' },
          },
        },
      },
    });
  });

  test('custom binary operator: use a identifier', () => {
    const parser = new Parser();
    parser.addBinaryOperator('add', 13);
    expect(parser.parse('2 add 3')).toMatchObject({
      expression: { type: 'BinaryExpression', operator: { value: 'add' } },
    });
  });

  test('overrides binary precedence across parses on the same instance', () => {
    const parser = new Parser();
    parser.addBinaryOperator('+', 10);
    parser.addUnaryOperator('+', 16);

    expect(parser.parse('1 + +2 - 3')).toMatchObject({
      expression: {
        operator: { value: '+' },
        right: {
          operator: { value: '-' },
          left: { type: 'UnaryExpression', operator: { value: '+' } },
        },
      },
    });
    expect(parser.parse('2 + 2 - 1')).toMatchObject({
      expression: {
        operator: { value: '+' },
        right: { operator: { value: '-' } },
      },
    });
    expect(new Parser().parse('1 + 2 - 3')).toMatchObject({
      expression: {
        operator: { value: '-' },
        left: { operator: { value: '+' } },
      },
    });
  });

  test('uses the most recently registered precedence for the same binary operator', () => {
    const parser = new Parser();
    parser.addBinaryOperator('%', 10);
    expect(parser.parse('1+2%3')).toMatchObject({
      expression: {
        operator: { value: '%' },
        left: { operator: { value: '+' } },
      },
    });

    parser.addBinaryOperator('%', 15);
    expect(parser.parse('1+2%3')).toMatchObject({
      expression: {
        operator: { value: '+' },
        right: { operator: { value: '%' } },
      },
    });
  });

  test('uses context to distinguish unary and binary operators with the same symbol', () => {
    const parser = new Parser();
    parser.addUnaryOperator('~', 16);
    parser.addBinaryOperator('~', 13);

    expect(parser.parse('~1~~2')).toMatchObject({
      expression: {
        type: 'BinaryExpression',
        operator: { value: '~' },
        left: {
          type: 'UnaryExpression',
          operator: { value: '~' },
          argument: { value: '1' },
        },
        right: {
          type: 'UnaryExpression',
          operator: { value: '~' },
          argument: { value: '2' },
        },
      },
    });
  });

  test.each(['(', ')', ')+', '+(', ',', '+,', "'+", '+"'])(
    'cannot use reserved characters in operator `%s`',
    (operator) => {
      const parser = new Parser();
      expect(() => {
        parser.addBinaryOperator(operator, 13);
      }).toThrow(/The custom operator cannot use reserved character/);
    },
  );

  test('rejects NaN precedence when registering an operator', () => {
    const parser = new Parser();
    expect(() => parser.addBinaryOperator('+', NaN)).toThrow(
      /The precedence should be a number/,
    );
    expect(parser.parse('1+2')).toMatchObject({
      expression: { operator: { value: '+' } },
    });
  });

  test('invalid operator', () => {
    const parser = new Parser();
    expect(() => {
      parser.addBinaryOperator('', 0);
    }).toThrow(/The custom operator should be a non-empty string/);
    expect(() => {
      parser.addBinaryOperator(' * ', 0);
    }).toThrow(/The custom operator should be a non-empty string/);
    expect(() => {
      parser.addBinaryOperator('.', 0);
    }).toThrow(/The custom operator cannot start with a possible number/);
    expect(() => {
      parser.addBinaryOperator('5', 0);
    }).toThrow(/The custom operator cannot start with a possible number/);
    expect(() => {
      parser.addBinaryOperator('?', 0);
    }).toThrow(/The custom operator cannot start with `?`/);
    expect(() => {
      parser.addBinaryOperator('%', -1);
    }).toThrow(/The precedence should be a number greater than or equal to 0/);
  });
});

describe('Unary Operator', () => {
  test('custom unary operator: high precedence `double`', () => {
    const parser = new Parser();
    parser.addUnaryOperator('double', 19);
    expect(parser.parse('double1.5')).toMatchObject({
      expression: {
        type: 'UnaryExpression',
        operator: {
          type: 'ExpressionOperator',
          value: 'double',
          start: 0,
          end: 6,
        },
        argument: { value: '1.5' },
      },
    });
    expect(parser.parse('double(2)')).toMatchObject({
      expression: {
        type: 'UnaryExpression',
        operator: { value: 'double' },
        argument: { value: '2' },
      },
    });
    expect(parser.parse('double .035 * 100')).toMatchObject({
      expression: {
        operator: { value: '*' },
        left: { operator: { value: 'double' } },
      },
    });
  });

  test('custom unary operator: low precedence `double`', () => {
    const parser = new Parser();
    parser.addUnaryOperator('double', 0);
    expect(parser.parse('double 1 + 4 - 2')).toMatchObject({
      expression: {
        operator: { value: 'double' },
        argument: {
          operator: { value: '-' },
          left: { operator: { value: '+' } },
        },
      },
    });
  });

  test('custom unary operator chain', () => {
    const parser = new Parser();
    parser.addUnaryOperator('double', 0);
    parser.addUnaryOperator('abs', 0);
    expect(parser.parse('abs double 2 - 10')).toMatchObject({
      expression: {
        operator: { value: 'abs' },
        argument: {
          operator: { value: 'double' },
          argument: { operator: { value: '-' } },
        },
      },
    });
  });
});
