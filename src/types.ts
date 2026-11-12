import type { Parser } from './parser';

export interface ParserOptions {}

export type Node = RootNode | ExpressionNode;

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
  operator: string;
}

export interface UnaryExpression extends NodeMeta {
  type: 'UnaryExpression';
  argument: ExpressionNode;
  operator: string;
  prefix: boolean;
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
