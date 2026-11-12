import type { Parser } from './parser';

export interface ParserOptions {
  /**
   * 额外支持的标识符前缀字符，必须为单个非空白字符，示例: "@"、"~"
   */
  identifierPrefixChars?: string[];
  /** 自定义整套解析错误提示，省略时使用英文 */
  messages?: Messages;
  /** 支持的语法，每项默认启用 */
  features?: {
    number?: boolean;
    string?: boolean;
    call?: boolean;
  };
  /** 自定义二元运算符，键为运算符文本，示例: `{ '%': { precedence: 14 } }` */
  binaryOperators?: Record<string, { precedence: number }>;
  /** 自定义前缀一元运算符，键为运算符文本，示例: `{ sin: { precedence: 16 } }` */
  unaryOperators?: Record<string, { precedence: number }>;
}

/** `parse()` 抛出的 `ParserError` 提示模板 */
export interface Messages {
  /** 意外的 token，{v} 为报错文本，{pos} 为位置 */
  unexpectedToken: string;
  /** 输入提前结束，{pos} 为输入末尾的位置 */
  unexpectedEndOfInput: string;
  /** 字符串未闭合，{pos} 为报错位置 */
  unterminatedStringLiteral: string;
  /** 字符串转义无效，{pos} 为报错位置 */
  invalidStringEscape: string;
  /** 标识符 Unicode 转义无效，{pos} 为报错位置 */
  invalidIdentifierEscape: string;
}

export type Node = RootNode | ExpressionNode | ExpressionOperator;

export type ExpressionNode =
  | BinaryExpression
  | UnaryExpression
  | CallExpression
  | NumericLiteral
  | StringLiteral
  | Identifier;

export interface RootNode extends NodeMeta {
  type: 'Expression';
  expression: ExpressionNode;
}

export interface BinaryExpression extends NodeMeta {
  type: 'BinaryExpression';
  left: ExpressionNode;
  right: ExpressionNode;
  operator: ExpressionOperator;
}

export interface UnaryExpression extends NodeMeta {
  type: 'UnaryExpression';
  argument: ExpressionNode;
  operator: ExpressionOperator;
  prefix: boolean;
}

/** 表达式中的运算符及其源码位置 */
export interface ExpressionOperator extends NodeMeta {
  type: 'ExpressionOperator';
  value: string;
}

export interface CallExpression extends NodeMeta {
  type: 'CallExpression';
  callee: Identifier;
  arguments: ExpressionNode[];
}

export interface NumericLiteral extends NodeMeta {
  type: 'NumericLiteral';
  rawValue: string;
  value: string;
}

export interface StringLiteral extends NodeMeta {
  type: 'StringLiteral';
  rawValue: string;
  value: string;
}

export interface Identifier extends NodeMeta {
  type: 'Identifier';
  name: string;
}

export interface NodeMeta {
  start: number;
  end: number;
}

export type InitialPartNode<T extends Node> = Pick<T, 'start' | 'end'>;

export type FinishPartNode<T extends Node> = Omit<T, 'start' | 'end'>;

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
