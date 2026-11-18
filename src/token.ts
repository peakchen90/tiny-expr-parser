import type { TokenType, TokenTypeUpdateContext } from './types';

export const tokenTypes = {
  start: _tokenType('start'),
  end: _tokenType('end'),
  parenL: _tokenType('(', { updateContext: () => ({ allowPrefix: true }) }),
  parenR: _tokenType(')', { updateContext: () => ({ allowPrefix: false }) }),
  bracketL: _tokenType('[', { updateContext: () => ({ allowPrefix: true }) }),
  bracketR: _tokenType(']', { updateContext: () => ({ allowPrefix: false }) }),
  comma: _tokenType(',', { updateContext: () => ({ allowPrefix: true }) }),
  dot: _tokenType('.'),
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
} as const;

// 宽松解析中允许恢复缺失操作数的边界 token
export const groupOperandBoundaries = [tokenTypes.parenR, tokenTypes.end];
export const callOperandBoundaries = [
  tokenTypes.comma,
  tokenTypes.parenR,
  tokenTypes.end,
];
export const arrayOperandBoundaries = [
  tokenTypes.comma,
  tokenTypes.bracketR,
  tokenTypes.end,
];

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
