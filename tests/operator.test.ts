import { describe, expect, test } from 'vitest';
import { Parser } from '../src';

describe('Binary Operator', () => {
  test('custom binary operator: `%`', () => {
    const parser = new Parser();
    parser.addBinaryOperator('%', 14);
    expect(parser.parse('2 % 3')).toMatchObject({
      expression: { type: 'BinaryExpression', operator: '%' },
    });
    expect(parser.parse('2 % 3 + 5')).toMatchObject({
      expression: { operator: '+', left: { operator: '%' } },
    });
  });

  test('custom binary operator: `**`', () => {
    const parser = new Parser();
    parser.addBinaryOperator('**', 15);
    parser.addBinaryOperator('*', 14);
    expect(parser.parse('2 ** 3')).toMatchObject({
      expression: { type: 'BinaryExpression', operator: '**' },
    });
    expect(parser.parse('2 ** 3 - 1')).toMatchObject({
      expression: { operator: '-', left: { operator: '**' } },
    });
  });

  test('custom binary operator: use a identifier', () => {
    const parser = new Parser();
    parser.addBinaryOperator('add', 13);
    expect(parser.parse('2 add 3')).toMatchObject({
      expression: { type: 'BinaryExpression', operator: 'add' },
    });
  });

  test('overrides binary precedence across parses on the same instance', () => {
    const parser = new Parser();
    parser.addBinaryOperator('+', 10);
    parser.addUnaryOperator('+', 16);

    expect(parser.parse('1 + +2 - 3')).toMatchObject({
      expression: { operator: '+', right: { operator: '-', left: { type: 'UnaryExpression', operator: '+' } } },
    });
    expect(parser.parse('2 + 2 - 1')).toMatchObject({
      expression: { operator: '+', right: { operator: '-' } },
    });
    expect(new Parser().parse('1 + 2 - 3')).toMatchObject({
      expression: { operator: '-', left: { operator: '+' } },
    });
  });

  test('cannot use reserved character as operator', () => {
    const parser = new Parser();
    expect(() => {
      parser.addBinaryOperator('(', 13);
    }).toThrow(/The custom operator cannot use reserved character/);
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
    }).toThrow(/The precedence should be a number greater than 0/);
  });
});

describe('Unary Operator', () => {
  test('custom unary operator: high precedence `double`', () => {
    const parser = new Parser();
    parser.addUnaryOperator('double', 19);
    expect(parser.parse('double1.5')).toMatchObject({
      expression: { type: 'UnaryExpression', operator: 'double', argument: { value: '1.5' } },
    });
    expect(parser.parse('double .035 * 100')).toMatchObject({
      expression: { operator: '*', left: { operator: 'double' } },
    });
  });

  test('custom unary operator: low precedence `double`', () => {
    const parser = new Parser();
    parser.addUnaryOperator('double', 0);
    expect(parser.parse('double 1 + 4 - 2')).toMatchObject({
      expression: { operator: 'double', argument: { operator: '-', left: { operator: '+' } } },
    });
  });

  test('custom unary operator chain', () => {
    const parser = new Parser();
    parser.addUnaryOperator('double', 0);
    parser.addUnaryOperator('abs', 0);
    expect(parser.parse('abs double 2 - 10')).toMatchObject({
      expression: { operator: 'abs', argument: { operator: 'double', argument: { operator: '-' } } },
    });
  });
});
