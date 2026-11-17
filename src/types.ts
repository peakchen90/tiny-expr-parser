import type { Parser } from './parser';
import type { ParserError } from './parser-error';

export interface ParserOptions {
  /**
   * 额外支持的标识符前缀字符，必须为单个非空白字符，示例: "@"、"~"
   */
  identifierPrefixChars?: string[];
  /** 自定义整套解析错误提示，省略时使用英文 */
  messages?: Messages;
  /** 支持的语法，每项默认启用 */
  features?: {
    /** 数字字面量，关闭后 `-2` 等负数字面量也不可用 */
    number?: boolean;
    /** 字符串字面量 */
    string?: boolean;
    /** 函数调用，关闭后括号仍可用于分组 */
    call?: boolean;
    /** 内置二元运算符 `+` */
    plusOperator?: boolean;
    /** 内置二元运算符 `-`，关闭后 `-2` 等负数字面量仍可用 */
    minusOperator?: boolean;
    /** 内置二元运算符 `*` */
    timesOperator?: boolean;
    /** 内置二元运算符 `/` */
    divOperator?: boolean;
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

export type Node = RootNode | ExpressionNode | Operator;

/** 自定义节点的字符串，返回 undefined 时使用内置逻辑 */
export type StringifyCallback = (
  node: Node,
  stringify: (node: Node) => string,
) => string | undefined;

/** 宽松解析得到的 AST 片段和语法错误，均按源码位置排列 */
export interface LooseParseResult {
  nodes: Node[];
  errors: ParserError[];
}

/** `walk()` 回调提供的遍历控制方法 */
export interface WalkOptions {
  /** 跳过当前节点的所有子节点，继续遍历当前子树之外的后续节点 */
  skip(): void;
  /** 立即终止整个遍历 */
  stop(): void;
}

/** `walk()` 的节点回调，ancestors 按从根节点到直接父节点的顺序排列 */
export type WalkVisitors = {
  [T in Node['type']]?: (
    node: Extract<Node, { type: T }>,
    ancestors: Node[],
    options: WalkOptions,
  ) => void;
};

export type ExpressionNode =
  | BinaryExpression
  | UnaryExpression
  | CallExpression
  | ArrayExpression
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
  operator: Operator;
}

export interface UnaryExpression extends NodeMeta {
  type: 'UnaryExpression';
  argument: ExpressionNode;
  operator: Operator;
  prefix: boolean;
}

/** 表达式中的运算符及其源码位置 */
export interface Operator extends NodeMeta {
  type: 'Operator';
  value: string;
}

export interface CallExpression extends NodeMeta {
  type: 'CallExpression';
  callee: Identifier;
  arguments: ExpressionNode[];
}

/** 数组表达式，元素按源码顺序排列 */
export interface ArrayExpression extends NodeMeta {
  type: 'ArrayExpression';
  elements: ExpressionNode[];
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
