export type Node = RootNode | ExpressionNode;

export type ExpressionNode = BinaryExpression | UnaryExpression | NumericLiteral | Identifier;

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

export interface NumericLiteral extends NodeMeta {
  type: 'NumericLiteral';
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
