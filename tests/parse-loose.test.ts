import { describe, expect, expectTypeOf, test } from 'vitest';
import {
  Parser,
  ParserError,
  type CallExpression,
  type Identifier,
  type LooseParseResult,
  type Node,
} from '../src';
import { astFixtures } from './fixtures/ast';

describe('Parser Loose', () => {
  test.each(Object.keys(astFixtures))(
    'returns the same AST as strict parsing for %s',
    (input) => {
      const parser = new Parser();
      const result = parser.parseLoose(input);

      expectTypeOf(result).toEqualTypeOf<LooseParseResult>();
      expect(result).toEqual({ nodes: [parser.parse(input)], errors: [] });
    },
  );

  test.each(['', ' \t\n\u3000'])(
    'returns no nodes or errors for %j',
    (input) => {
      expect(new Parser().parseLoose(input)).toEqual({ nodes: [], errors: [] });
    },
  );

  test('reports consecutive invalid characters using UTF-16 offsets', () => {
    const { nodes, errors } = new Parser().parseLoose('?🙂');

    expect(nodes).toEqual([]);
    expect(errors.every((error) => error instanceof ParserError)).toBe(true);
    expect(errors.map(({ code, start, end }) => [code, start, end])).toEqual([
      ['unexpectedToken', 0, 1],
      ['unexpectedToken', 1, 3],
    ]);
  });

  test('walks a recovered call with typed callbacks and source-ordered ranges', () => {
    const parser = new Parser();
    const input = 'sum(a, ?, b)';
    const { nodes, errors } = parser.parseLoose(input);
    const visited: [string, number, number][] = [];

    expect(nodes).toHaveLength(1);
    for (const node of nodes) {
      parser.walk(node, {
        CallExpression(call) {
          expectTypeOf(call).toEqualTypeOf<CallExpression>();
          expect(call.callee.name).toBe('sum');
          expect(call.arguments).toHaveLength(2);
        },
        Identifier(identifier, ancestors) {
          expectTypeOf(identifier).toEqualTypeOf<Identifier>();
          expectTypeOf(ancestors).toEqualTypeOf<Node[]>();
          expect(ancestors.map((ancestor) => ancestor.type)).toEqual([
            'Expression',
            'CallExpression',
          ]);
          visited.push([identifier.name, identifier.start, identifier.end]);
        },
      });
    }

    expect(visited).toEqual([
      ['sum', 0, 3],
      ['a', 4, 5],
      ['b', 10, 11],
    ]);
    expect(errors).toMatchObject([
      { code: 'unexpectedToken', start: 7, end: 8 },
    ]);
    expect(input.slice(errors[0].start, errors[0].end)).toBe('?');
  });

  test.each([
    ['f(,a)', ['a'], 2],
    ['f(a,,b)', ['a', 'b'], 4],
    ['f(a,)', ['a'], 4],
    ['f(a + , b)', ['a', 'b'], 6],
    ['f(a +)', ['a'], 5],
    ['f((a +), b)', ['a', 'b'], 6],
  ])('preserves recognized arguments in %s', (input, names, position) => {
    const parser = new Parser();
    const { nodes, errors } = parser.parseLoose(input);

    expect(nodes).toMatchObject([
      {
        type: 'Expression',
        expression: {
          type: 'CallExpression',
          start: 0,
          end: input.length,
          arguments: names.map((name) => ({ type: 'Identifier', name })),
        },
      },
    ]);
    expect(errors).toMatchObject([
      { code: 'unexpectedToken', start: position, end: position + 1 },
    ]);
    expect(() => parser.parse(input)).toThrow(ParserError);
  });

  test.each([
    ['f(', []],
    ['f(a,', ['a']],
    ['f((a', ['a']],
    ['f(a +', ['a']],
    ['f((a +', ['a']],
    ['f(neg', []],
    ['f(a + neg', ['a']],
  ])(
    'preserves an incomplete call in %s and reports the end once',
    (input, names) => {
      const parser = new Parser({
        unaryOperators: { neg: { precedence: 16 } },
      });
      const { nodes, errors } = parser.parseLoose(input);

      expect(nodes).toMatchObject([
        {
          type: 'Expression',
          start: 0,
          end: input.length,
          expression: {
            type: 'CallExpression',
            callee: { name: 'f' },
            arguments: names.map((name) => ({ type: 'Identifier', name })),
          },
        },
      ]);
      expect(errors).toMatchObject([
        {
          code: 'unexpectedEndOfInput',
          start: input.length,
          end: input.length,
        },
      ]);
    },
  );

  test.each([
    ['[1, ?, id]', 4],
    ['[1,, id]', 3],
    ['[1 +, id]', 4],
  ])('recovers array elements in %s', (input, start) => {
    const { nodes, errors } = new Parser().parseLoose(input);

    expect(nodes).toMatchObject([
      {
        expression: {
          type: 'ArrayExpression',
          elements: [
            { type: 'NumericLiteral', rawValue: '1' },
            { type: 'Identifier', name: 'id' },
          ],
        },
      },
    ]);
    expect(errors).toMatchObject([
      { code: 'unexpectedToken', start, end: start + 1 },
    ]);
  });

  test('keeps nested containers and skips a prefix operator without an operand', () => {
    const parser = new Parser({ unaryOperators: { neg: { precedence: 16 } } });
    const input = 'f([a +], (neg), b)';
    const { nodes, errors } = parser.parseLoose(input);

    expect(nodes).toMatchObject([
      {
        expression: {
          type: 'CallExpression',
          start: 0,
          end: input.length,
          arguments: [
            {
              type: 'ArrayExpression',
              start: 2,
              end: 7,
              elements: [{ type: 'Identifier', name: 'a', start: 3, end: 4 }],
            },
            { type: 'Identifier', name: 'b' },
          ],
        },
      },
    ]);
    expect(errors).toMatchObject([
      { code: 'unexpectedToken', start: 6, end: 7 },
      { code: 'unexpectedToken', start: 13, end: 14 },
    ]);
  });

  test.each([
    ['[a +]', '[a]', [4]],
    ['[a +,, b *, c]', '[a, b, c]', [4, 5, 10]],
    ['f(a - b -, -2)', 'f(a - b, -2)', [9]],
    ['f((a +) * b, c)', 'f(a * b, c)', [6]],
    ['[f(a +), b] * c', '[f(a), b] * c', [6]],
    ['f(a ** , neg b)', 'f(a, neg b)', [7]],
    ['[neg, neg] + 1', '[] + 1', [4, 9]],
    ['f(a + (neg), b)', 'f(a, b)', [10]],
    ['f(neg neg, b)', 'f(b)', [9]],
    ['f(neg (a +), b)', 'f(neg a, b)', [10]],
    ['f((), b)', 'f(b)', [3]],
  ])(
    'recovers operands at list and group boundaries in %s',
    (input, text, starts) => {
      const parser = new Parser({
        binaryOperators: { '**': { precedence: 17 } },
        unaryOperators: { neg: { precedence: 16 } },
      });
      const { nodes, errors } = parser.parseLoose(input);

      expect(nodes).toMatchObject([
        { type: 'Expression', start: 0, end: input.length },
      ]);
      expect(nodes.map((node) => parser.stringify(node))).toEqual([text]);
      expect(errors).toMatchObject(
        starts.map((start) => ({
          code: 'unexpectedToken',
          start,
          end: start + 1,
        })),
      );
      expect(() => parser.parse(input)).toThrow(
        expect.objectContaining({ code: 'unexpectedToken', start: starts[0] }),
      );
    },
  );

  test('walks the complete part of a mixed-precedence argument once', () => {
    const parser = new Parser();
    const { nodes, errors } = parser.parseLoose('f(a + b *, c)');
    const visited: [string, number, number][] = [];

    expect(nodes.map((node) => parser.stringify(node))).toEqual([
      'f(a + b, c)',
    ]);
    parser.walk(nodes[0], {
      Identifier({ name, start, end }) {
        visited.push([name, start, end]);
      },
      Operator({ value, start, end }) {
        visited.push([value, start, end]);
      },
    });
    expect(visited).toEqual([
      ['f', 0, 1],
      ['a', 2, 3],
      ['+', 4, 5],
      ['b', 6, 7],
      ['c', 11, 12],
    ]);
    expect(errors).toMatchObject([
      { code: 'unexpectedToken', start: 9, end: 10 },
    ]);
  });

  test('reports invalid characters in missing operands without duplicating delimiter errors', () => {
    const parser = new Parser();
    const { nodes, errors } = parser.parseLoose('f(a + ?🙂, b * ?, c /)');

    expect(nodes.map((node) => parser.stringify(node))).toEqual(['f(a, b, c)']);
    expect(errors).toMatchObject([
      { code: 'unexpectedToken', start: 6, end: 7 },
      { code: 'unexpectedToken', start: 7, end: 9 },
      { code: 'unexpectedToken', start: 15, end: 16 },
      { code: 'unexpectedToken', start: 21, end: 22 },
    ]);
  });

  test.each([
    ['f(a + ] b', ['f', 'a', '+', 'b'], 6],
    ['[a + ) b', ['a', '+', 'b'], 5],
  ])(
    'reports the mismatched closer in %s and continues parsing',
    (input, text, start) => {
      const parser = new Parser();
      const { nodes, errors } = parser.parseLoose(input);

      expect(nodes.map((node) => parser.stringify(node))).toEqual(text);
      expect(errors).toMatchObject([
        { code: 'unexpectedToken', start, end: start + 1 },
      ]);
    },
  );

  test('reports one end error across unfinished nested lists after invalid input and whitespace', () => {
    const parser = new Parser();
    const input = '[f([a + 🙂 \t\u3000';
    const { nodes, errors } = parser.parseLoose(input);

    expect(nodes).toMatchObject([{ type: 'Expression', start: 0, end: 7 }]);
    expect(nodes.map((node) => parser.stringify(node))).toEqual(['[f([a])]']);
    expect(errors).toMatchObject([
      { code: 'unexpectedToken', start: 8, end: 10 },
      { code: 'unexpectedEndOfInput', start: input.length, end: input.length },
    ]);
  });

  test('retains unfinished arrays and reports the input end once', () => {
    const input = '[1, [id';
    const { nodes, errors } = new Parser().parseLoose(input);

    expect(nodes).toMatchObject([
      {
        expression: {
          type: 'ArrayExpression',
          end: input.length,
          elements: [
            { type: 'NumericLiteral', rawValue: '1' },
            {
              type: 'ArrayExpression',
              end: input.length,
              elements: [{ type: 'Identifier', name: 'id' }],
            },
          ],
        },
      },
    ]);
    expect(errors).toMatchObject([
      {
        code: 'unexpectedEndOfInput',
        start: input.length,
        end: input.length,
      },
    ]);
  });

  test('resumes after a stray closing bracket in loose mode', () => {
    const { nodes, errors } = new Parser().parseLoose('id ] other');

    expect(nodes).toMatchObject([
      { expression: { type: 'Identifier', name: 'id' } },
      { expression: { type: 'Identifier', name: 'other' } },
    ]);
    expect(errors).toMatchObject([
      { code: 'unexpectedToken', start: 3, end: 4 },
    ]);
  });

  test('keeps a dangling operator as a standalone node', () => {
    const { nodes, errors } = new Parser().parseLoose('a + ');

    expect(nodes).toEqual([
      { type: 'Identifier', name: 'a', start: 0, end: 1 },
      { type: 'Operator', value: '+', start: 2, end: 3 },
    ]);
    expect(errors).toMatchObject([
      { code: 'unexpectedEndOfInput', start: 4, end: 4 },
    ]);
  });

  test('resumes after an unexpected operator', () => {
    const { nodes, errors } = new Parser().parseLoose('a + * b');

    expect(nodes).toMatchObject([
      { type: 'Identifier', name: 'a', start: 0, end: 1 },
      { type: 'Operator', value: '+', start: 2, end: 3 },
      { type: 'Operator', value: '*', start: 4, end: 5 },
      {
        type: 'Expression',
        expression: { type: 'Identifier', name: 'b', start: 6, end: 7 },
      },
    ]);
    expect(errors).toMatchObject([
      { code: 'unexpectedToken', start: 4, end: 5 },
    ]);
  });

  test('resumes at the token found where a closing parenthesis was expected', () => {
    const { nodes, errors } = new Parser().parseLoose('(a b');

    expect(nodes).toMatchObject([
      { type: 'Identifier', name: 'a', start: 1, end: 2 },
      {
        type: 'Expression',
        expression: { type: 'Identifier', name: 'b', start: 3, end: 4 },
      },
    ]);
    expect(errors).toMatchObject([
      { code: 'unexpectedToken', start: 3, end: 4 },
    ]);
  });

  test('reports lexical and syntactic errors in source order', () => {
    const { nodes, errors } = new Parser().parseLoose("a '\\q' + b");

    expect(nodes).toMatchObject([
      { expression: { type: 'Identifier', name: 'a' } },
      {
        expression: {
          type: 'BinaryExpression',
          left: { type: 'StringLiteral', rawValue: "'\\q'", start: 2, end: 6 },
          right: { type: 'Identifier', name: 'b' },
        },
      },
    ]);
    expect(errors).toMatchObject([
      { code: 'unexpectedToken', start: 2, end: 6 },
      { code: 'invalidStringEscape', start: 4, end: 5 },
    ]);
  });

  test.each([
    ['"a\n+ b', '"a', 'unterminatedStringLiteral', 2],
    ['"a\\\n+ b', '"a\\', 'invalidStringEscape', 3],
  ])(
    'resumes parsing after a line break in %j',
    (input, rawValue, code, start) => {
      const { nodes, errors } = new Parser().parseLoose(input);

      expect(nodes).toMatchObject([
        {
          expression: {
            type: 'BinaryExpression',
            left: { type: 'StringLiteral', rawValue, start: 0, end: start },
            right: { type: 'Identifier', name: 'b' },
          },
        },
      ]);
      expect(errors).toMatchObject([{ code, start, end: start + 1 }]);
    },
  );

  test('keeps an unterminated string and a trailing backslash at the end', () => {
    const input = '"abc\\';
    const { nodes, errors } = new Parser().parseLoose(input);

    expect(nodes).toMatchObject([
      {
        expression: {
          type: 'StringLiteral',
          rawValue: input,
          value: 'abc\\',
          start: 0,
          end: input.length,
        },
      },
    ]);
    expect(errors).toMatchObject([
      { code: 'unterminatedStringLiteral', start: 0, end: input.length },
    ]);
  });

  test('keeps an incomplete number and resumes at the argument separator', () => {
    const { nodes, errors } = new Parser().parseLoose('f(1e+, b)');

    expect(nodes).toMatchObject([
      {
        expression: {
          type: 'CallExpression',
          arguments: [
            { type: 'NumericLiteral', rawValue: '1e+', start: 2, end: 5 },
            { type: 'Identifier', name: 'b', start: 7, end: 8 },
          ],
        },
      },
    ]);
    expect(errors).toMatchObject([
      { code: 'unexpectedToken', start: 5, end: 6 },
    ]);
  });

  test.each([
    ['a\\u{110000}b', 11],
    ['a\\u12', 2],
  ])(
    'keeps the identifier %s with an invalid Unicode escape',
    (name, errorEnd) => {
      const { nodes, errors } = new Parser().parseLoose(name + ' + c');

      expect(nodes).toMatchObject([
        {
          expression: {
            type: 'BinaryExpression',
            left: { type: 'Identifier', name, start: 0, end: name.length },
            right: { type: 'Identifier', name: 'c' },
          },
        },
      ]);
      expect(errors).toMatchObject([
        { code: 'invalidIdentifierEscape', start: 1, end: errorEnd },
      ]);
    },
  );

  test('reuses parser options and keeps strict and loose calls independent', () => {
    const parser = new Parser({
      identifierPrefixChars: ['@'],
      binaryOperators: { '%': { precedence: 14 } },
      messages: Parser.Messages.zh,
    });
    const input = '@a % ? b';
    const result = parser.parseLoose(input);

    expect(result.nodes).toMatchObject([
      {
        expression: {
          type: 'BinaryExpression',
          left: { type: 'Identifier', name: '@a' },
          operator: { value: '%' },
          right: { type: 'Identifier', name: 'b' },
        },
      },
    ]);
    expect(result.errors).toMatchObject([
      { message: '位置 5 处出现意外的标记 ?', start: 5, end: 6 },
    ]);
    expect(() => parser.parse(input)).toThrow(ParserError);
    expect(parser.parseLoose('@a % b')).toEqual({
      nodes: [parser.parse('@a % b')],
      errors: [],
    });
    expect(result.errors).toHaveLength(1);
  });

  test('reports disabled array syntax while retaining the contents', () => {
    const parser = new Parser({ features: { array: false } });
    const { nodes, errors } = parser.parseLoose('[id]');

    expect(nodes).toMatchObject([
      { expression: { type: 'Identifier', name: 'id', start: 1, end: 3 } },
    ]);
    expect(errors).toMatchObject([
      { code: 'unexpectedToken', start: 0, end: 1 },
      { code: 'unexpectedToken', start: 3, end: 4 },
    ]);
  });

  test('respects disabled call syntax while retaining the identifiers', () => {
    const parser = new Parser({ features: { call: false } });
    const { nodes, errors } = parser.parseLoose('f(a)');

    expect(nodes).toMatchObject([
      { expression: { type: 'Identifier', name: 'f' } },
      { expression: { type: 'Identifier', name: 'a' } },
    ]);
    expect(errors).toMatchObject([
      { code: 'unexpectedToken', start: 1, end: 2 },
    ]);
  });
});
