import type { BinaryExpression, RootNode, ExpressionNode, Node, UnaryExpression, InitialPartNode, FinishPartNode, NumericLiteral, Identifier } from './types';
import { TokenType, tokenTypes as tt } from './token-type';
import { isNumericStart, isNumericChar, isIdentifierChar, isIdentifierStart, getRealNumeric } from './util';

/**
 * Expression Parser
 */
export class Parser  {
  private readonly operators: TokenType[] = [];
  private input = ''; // 输入的解析字符串
  private pos = 0; // 当前位置
  private tokenType = tt.start; // 当前 Token 的类型
  private tokenText = ''; // 当前 Token 的值
  private tokenStart = 0; // 当前 Token 的开始位置
  private tokenEnd = 0; // 当前 Token 的结束位置
  private lastTokenStart = 0; // 上一个 Token 的开始位置
  private lastTokenEnd = 0; // 上一个 Token 的结束位置
  private allowPrefix = true;

  /**
   * 注册二元运算符
   */
  addBinaryOperator(value: string, precedence: number): void {
    this.addOperator(value, precedence, false);
  }

  /**
   * 注册前缀一元运算符
   */
  addUnaryOperator(value: string, precedence: number): void {
    this.addOperator(value, precedence, true);
  }

  /**
   * 开始解析，如果是空字符串返回 `null`
   */
  parse(input: string): RootNode | null {
    this.input = input;
    this.tokenType = tt.start;
    this.tokenText = '';
    this.pos = 0;
    this.tokenStart = 0;
    this.tokenEnd = 0;
    this.lastTokenStart = 0;
    this.lastTokenEnd = 0;
    this.allowPrefix = true;

    this.next();
    const node = this.startNode<RootNode>(this.tokenStart);
    if (this.tokenType === tt.end) {
      return null; // 空字符
    }

    const expression = this.parseExprAtom(this.tokenStart, -1);
    if (this.tokenType !== tt.end) {
      // 其后遇到其他非法字符
      this.unexpected(this.tokenText);
    }

    return this.finishNode(node, { type: 'Expression', expression });
  }

  /**
   * 解析一个表达式原子（最小单元的表达式）, 如: `1 + 2`、`(1 + 2 + 3)`、`-1` 都作为一个表达式原子解析
   * @param leftStartPos 左侧开始位置
   * @param minPrecedence 当前上下文的优先级
   */
  private parseExprAtom(leftStartPos: number, minPrecedence: number): ExpressionNode {
    if (this.tokenType === tt.parenL) {
      // 遇到 `(` 则递归解析表达式原子
      this.next();
      const left = this.parseExprAtom(this.tokenStart, -1);
      this.expect(tt.parenR);
      return this.parseMaybeBinary(left, leftStartPos, minPrecedence); // 将 `(expr)` 整体作为左值，进入优先级解析流程
    } else {
      const left = this.parseMaybeUnary(minPrecedence);
      return this.parseMaybeBinary(left, leftStartPos, minPrecedence); // 读取一个数字作为左值，进入优先级解析流程
    }
  }

  /**
   * 解析可能的二元表达式
   * @param left 左值
   * @param leftStartPos 左值节点起始位置
   * @param minPrecedence 当前上下文的优先级
   */
  private parseMaybeBinary(left: ExpressionNode, leftStartPos: number, minPrecedence: number): ExpressionNode {
    const precedence = this.tokenType.precedence;
    if (this.tokenType.isBinary && precedence > minPrecedence) {
      // 比较当前运算符与上下文优先级
      const node = this.startNode<BinaryExpression>(leftStartPos);
      const operator = this.tokenText;
      this.next();

      // 解析可能更高优先级的右侧表达式，如: `1 + 2 * 3` 将解析 `2 * 3` 作为右值
      const start = this.tokenStart;
      const maybeHighPrecedenceExpr = this.parseExprAtom(start, precedence);
      const right = this.parseMaybeBinary(maybeHighPrecedenceExpr, start, precedence);
      const leftNode = this.finishNode(node, { type: 'BinaryExpression', left, right, operator });

      // 将已经解析的二元表达式作为左值，然后递归解析后面可能的同等优先级或低优先级的表达式作为右值
      // 如: `1 + 2 + 3`, 当前已经解析 `1 + 2`, 然后将该节点作为左值递归解析表达式优先级
      return this.parseMaybeBinary(leftNode, leftStartPos, minPrecedence);
    }
    return left;
  }

  /**
   * 解析可能带前缀的表达式，如: `+1`, `-(2)`, `3`, `-(3 + 4)`, `+-+5`
   * @param minPrecedence 当前上下文的优先级
   */
  private parseMaybeUnary(minPrecedence: number): ExpressionNode {
    const precedence = this.tokenType.precedence;
    const node = this.startNode<ExpressionNode>();
    const start = this.tokenStart;
    const value = this.tokenText;

    // Note: `1 ++ 1` 会当作 `1 + (+1)` 对待，与 JS 会作为 `1++` 对待不同
    if (this.tokenType.isPrefix) {
      if (precedence >= minPrecedence) {
        // 相同优先级的一元运算符可以连续
        const operator = value;
        const prefix = true;
        this.next();
        const argument = this.parseExprAtom(this.tokenStart, precedence);
        return this.finishNode(node as InitialPartNode<UnaryExpression>, {
          type: 'UnaryExpression',
          argument,
          operator,
          prefix,
        });
      }
    }

    if (this.tokenType === tt.numeric) {
      const realValue = getRealNumeric(value);
      const rawValue = value;
      this.next();
      return this.finishNode(node as InitialPartNode<NumericLiteral>, {
        type: 'NumericLiteral',
        rawValue,
        value: realValue,
      });
    }

    if (this.tokenType === tt.identifier) {
      const name = value;
      this.next();
      return this.finishNode(node as InitialPartNode<Identifier>, {
        type: 'Identifier',
        name,
      });
    }

    return this.unexpected(value, start);
  }

  /**
   * 读取并移到下一个 Token
   */
  private next(): void {
    this.lastTokenStart = this.tokenStart;
    this.lastTokenEnd = this.tokenEnd;
    this.skipSpace();

    this.tokenStart = this.pos;
    if (this.pos >= this.input.length) {
      if (this.tokenType === tt.end) return;
      this.finishToken(tt.end);
    } else {
      this.readToken();
    }
  }

  /**
   * 读取一个 token
   */
  private readToken(): void {
    const code = this.codeAt(this.pos);
    if (isNumericStart(code)) {
      return this.readNumeric();
    }
    return this.readTokenFromCode();
  }

  /**
   * 读取一个数字
   */
  private readNumeric(): void {
    const chunkStart = this.pos;
    let countE = -1; // 统计字符 `e` 出现次数，-1 表示当前位置不允许出现 `e`
    let allowDot = true;
    let allowUnderline = false;
    let expectANumber = false; // 是否期望字符是数字
    let unexpectedPos = -1;

    while (this.isValidPosition()) {
      const code = this.codeAt(this.pos);

      if (isNumericChar(code)) {
        // 0-9
        if (countE === -1) {
          countE = 0;
        }
        this.pos++;
        expectANumber = false;
        allowUnderline = true;
      } else if (expectANumber) {
        unexpectedPos = this.pos;
        expectANumber = false;
        break;
      } else if (code === 69 || code === 101) {
        // `E` / `e`
        if (countE !== 0) {
          unexpectedPos = this.pos;
          break;
        }

        countE++;
        this.pos++;
        if (
          this.isValidPosition() &&
          (this.codeAt(this.pos) === 43 || this.codeAt(this.pos) === 45) // `+` / `-`
        ) {
          this.pos++;
        }
        allowDot = false;
        expectANumber = true;
      } else if (code === 46) {
        // `.`
        if (!allowDot) {
          unexpectedPos = this.pos;
          break;
        }

        allowDot = false;
        this.pos++;
        if (this.pos - chunkStart === 1) {
          expectANumber = true;
        }
      } else if (code === 95) {
        // `_`
        if (!allowUnderline) {
          unexpectedPos = this.pos;
          break;
        }

        allowUnderline = false;
        expectANumber = true;
        this.pos++;
      } else {
        break;
      }
    }

    if (expectANumber) {
      unexpectedPos = this.pos - 1;
    }
    if (unexpectedPos >= 0) {
      this.unexpected(this.input[unexpectedPos], unexpectedPos);
    }

    const value = this.input.slice(chunkStart, this.pos);
    this.finishToken(tt.numeric, value);
  }

  /**
   * 根据字符 code 读取一个 Token，包括自定义注册的运算符
   */
  private readTokenFromCode(): void {
    const code = this.codeAt(this.pos);

    // 优先解析自定义运算符
    for (const operator of this.operators) {
      if ((this.allowPrefix && !operator.isPrefix) || (!this.allowPrefix && !operator.isBinary)) continue;

      if (this.input.startsWith(operator.label, this.pos)) {
        this.pos += operator.label.length;
        return this.finishToken(operator, operator.label);
      }
    }

    switch (code) {
      case 40: // `(`
        this.pos++;
        return this.finishToken(tt.parenL, '(');
      case 41: // `)`
        this.pos++;
        return this.finishToken(tt.parenR, ')');
      case 42: // `*`
        this.pos++;
        return this.finishToken(tt.times, '*');
      case 43: // `+`
        this.pos++;
        if (this.allowPrefix) {
          return this.finishToken(tt.prefixPlus, '+');
        }
        return this.finishToken(tt.plus, '+');
      case 45: // `-`
        this.pos++;
        if (this.allowPrefix) {
          return this.finishToken(tt.prefixMinus, '-');
        }
        return this.finishToken(tt.minus, '-');
      case 47: // `/`
        this.pos++;
        return this.finishToken(tt.div, '/');
      default:
        if (isIdentifierStart(code)) {
          return this.readIdentifier();
        }
    }

    this.unexpected(this.input[this.pos]);
  }

  /**
   * 读取一个 scope 变量 Token
   */
  private readIdentifier(): void {
    const chunkStart = this.pos;
    while (this.isValidPosition()) {
      const code = this.codeAt(this.pos);
      if (isIdentifierChar(code)) {
        this.pos++;
      } else {
        break;
      }
    }
    const value = this.input.slice(chunkStart, this.pos);
    this.finishToken(tt.identifier, value);
  }

  /**
   * 完善一个 Token
   * @param type
   * @param value
   */
  private finishToken(type: TokenType, value = ''): void {
    const prevType = this.tokenType;
    this.tokenEnd = this.pos;
    this.tokenType = type;
    this.tokenText = value;

    const typeType = this.tokenType;
    if (typeType.isBinary || typeType.isPrefix) {
      this.allowPrefix = true;
    } else if (typeType.updateContext) {
      const { allowPrefix } = typeType.updateContext(this, prevType);
      if (allowPrefix != null) {
        this.allowPrefix = allowPrefix;
      }
    }
  }

  private codeAt(index: number): number {
    return this.input.charCodeAt(index);
  }

  private isValidPosition(): boolean {
    return this.pos < this.input.length;
  }

  /**
   * 在当前位置创建一个新节点
   */
  private startNode<T extends Node = Node>(pos?: number): InitialPartNode<T> {
    pos = pos ?? this.tokenStart;
    return { start: pos, end: pos };
  }

  /**
   * 完善一个节点
   */
  private finishNode<T extends Node = Node>(node: InitialPartNode<T>, info?: FinishPartNode<T>): T {
    Object.assign(node, info);
    node.end = this.lastTokenEnd;
    return node as T;
  }

  /**
   * 跳过空白字符
   */
  private skipSpace(): void {
    while (this.isValidPosition()) {
      const code = this.codeAt(this.pos);
      if (code === 32 || code === 160) {
        // ` `
        this.pos++;
      } else if (code === 13 || code === 10 || code === 8232 || code === 8233) {
        // new line
        if (code === 13 && this.codeAt(this.pos + 1) === 10) {
          // CRLF
          this.pos++;
        }
        this.pos++;
      } else if (code > 8 && code < 14) {
        // 制表符等
        this.pos++;
      } else {
        break;
      }
    }
  }

  /**
   * 消费当前指定类型的 token，否则抛出异常
   * @param type
   */
  private expect(type: TokenType): void {
    if (!this.eat(type)) {
      this.unexpected(this.tokenText);
    }
  }

  /**
   * 消费一个 token，如果是指定的 token 类型，则移动到下一个 token ，返回 true，否则返回 false
   * @param type
   */
  private eat(type: TokenType): boolean {
    if (this.tokenType === type) {
      this.next();
      return true;
    }
    return false;
  }

  /**
   * 抛出 Unexpected token 异常
   * @param token
   * @param pos
   */
  private unexpected(token = '', pos?: number): never {
    this.raise(pos ?? this.tokenStart, `Unexpected token ${token}`);
  }

  /**
   * 抛出异常
   * @param pos
   * @param message
   */
  private raise(pos: number, message: string): never {
    if (pos > this.input.length - 1) {
      message = 'Unexpected end of input';
    } else {
      message += ` at position ${pos}`;
    }
    throw new SyntaxError(message);
  }

  private addOperator(value: string, precedence: number, isUnary: boolean): void {
    if (typeof value !== 'string' || !/^\S+$/.test(value)) {
      throw new Error('The custom operator should be a non-empty string');
    }
    if (value === '(' || value === ')') {
      throw new Error('The custom operator cannot use reserved character, including: (, )');
    }
    if (isNumericStart(value.charCodeAt(0))) {
      throw new Error('The custom operator cannot start with a possible number, including: `.`, 0-9');
    }
    if (value.charCodeAt(0) === 63) {
      // `?`
      throw new Error('The custom operator cannot start with `?`');
    }
    if (precedence != null && (typeof precedence !== 'number' || precedence < 0)) {
      throw new Error('The precedence should be a number greater than 0');
    }

    // 最近注册的定义优先匹配
    this.operators.unshift({
      label: value,
      isBinary: !isUnary,
      isPrefix: isUnary,
      precedence,
    });

    // 按照字符长度排序，确保长字符优先匹配
    this.operators.sort((a, b) => b.label.length - a.label.length);
  }
}
