import type { TokenType, TokenTypeUpdateContext } from './types';

export const tokenTypes = {
  start: _tokenType('start'),
  end: _tokenType('end'),
  parenL: _tokenType('(', { updateContext: () => ({ allowPrefix: true }) }),
  parenR: _tokenType(')', { updateContext: () => ({ allowPrefix: false }) }),
  comma: _tokenType(',', { updateContext: () => ({ allowPrefix: true }) }),
  numeric: _tokenType('numeric', {
    updateContext: () => ({ allowPrefix: false }),
  }),
  string: _tokenType('string', {
    updateContext: () => ({ allowPrefix: false }),
  }),
  identifier: _tokenType('identifier', {
    updateContext: () => ({ allowPrefix: false }),
  }),
  plus: _tokenType('+', { isBinary: true, precedence: 13 }),
  minus: _tokenType('-', { isBinary: true, precedence: 13 }),
  times: _tokenType('*', { isBinary: true, precedence: 14 }),
  div: _tokenType('/', { isBinary: true, precedence: 14 }),
  prefixPlus: _tokenType('+', { isPrefix: true, precedence: 16 }),
  prefixMinus: _tokenType('-', { isPrefix: true, precedence: 16 }),
} as const;

function _tokenType(
  label: string,
  options?: {
    isBinary?: boolean;
    isPrefix?: boolean;
    precedence?: number;
    updateContext?: TokenTypeUpdateContext;
  },
): TokenType {
  return {
    label: label,
    isBinary: !!options?.isBinary,
    isPrefix: !!options?.isPrefix,
    precedence: options?.precedence ?? -1,
    updateContext: options?.updateContext,
  };
}
