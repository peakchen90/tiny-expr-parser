import type { Parser } from './parser';

export type TokenTypeUpdateContext = (
  parser: Parser,
  prevType: TokenType,
) => { allowPrefix?: boolean };

export interface TokenType {
  /**
   * Token label
   */
  readonly label: string;
  /**
   * 是否为二元运算符
   */
  readonly isBinary: boolean;
  /**
   * 是否可以作为前缀（一元运算符，仅支持运算符在左侧）
   */
  readonly isPrefix: boolean;
  /**
   * 运算符优先级
   * @see https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Reference/Operators/Operator_Precedence
   */
  readonly precedence: number;
  /**
   * 读取 Token 时更新上下文
   */
  readonly updateContext?: TokenTypeUpdateContext;
}

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
