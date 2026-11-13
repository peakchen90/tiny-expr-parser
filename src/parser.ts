import type {
  BinaryExpression,
  RootNode,
  ExpressionNode,
  Node,
  ExpressionOperator,
  UnaryExpression,
  CallExpression,
  InitialPartNode,
  FinishPartNode,
  NumericLiteral,
  StringLiteral,
  Identifier,
  TokenType,
  ParserOptions,
  Messages,
  WalkOptions,
  WalkVisitors,
} from './types';
import { enMessages, zhCNMessages } from './messages';
import { ParserError } from './parser-error';
import { tokenTypes as tt } from './token-type';
import {
  isNumericStart,
  isNumericChar,
  isIdentifierChar,
  isIdentifierStart,
  getRealNumeric,
  WHITESPACE_PATTERN,
  MESSAGE_PLACEHOLDER_PATTERN,
  IDENTIFIER_ESCAPE_PATTERN,
  STRING_ESCAPES,
} from './util';

/**
 * Expression Parser
 */
export class Parser {
  /** 内置的中英文语法错误提示 */
  static readonly Messages = { zh: zhCNMessages, en: enMessages } as const;

  /** 应用默认值后的解析配置 */
  readonly options: Required<ParserOptions> & {
    features: Required<NonNullable<ParserOptions['features']>>;
  };

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

  constructor(options?: ParserOptions) {
    const features = options?.features;
    const messages = options?.messages;
    const binaryOperators = options?.binaryOperators;
    const unaryOperators = options?.unaryOperators;
    this.options = {
      identifierPrefixChars: options?.identifierPrefixChars ?? [],
      messages: messages ?? Parser.Messages.en,
      features: {
        number: features?.number !== false,
        string: features?.string !== false,
        call: features?.call !== false,
        plusOperator: features?.plusOperator !== false,
        minusOperator: features?.minusOperator !== false,
        timesOperator: features?.timesOperator !== false,
        divOperator: features?.divOperator !== false,
      },
      binaryOperators: binaryOperators ?? {},
      unaryOperators: unaryOperators ?? {},
    };

    if (
      this.options.identifierPrefixChars.some(
        (char) =>
          typeof char !== 'string' ||
          [...char].length !== 1 ||
          WHITESPACE_PATTERN.test(char),
      )
    ) {
      throw new TypeError(
        'Each identifier prefix must be a single non-whitespace character',
      );
    }

    if (messages !== undefined) {
      for (const key of Object.keys(Parser.Messages.en) as (keyof Messages)[]) {
        if (typeof messages?.[key] !== 'string') {
          throw new TypeError(`Missing or invalid parser message: ${key}`);
        }
      }
    }

    if (binaryOperators) {
      for (const value of Object.keys(binaryOperators)) {
        this.addBinaryOperator(value, binaryOperators[value].precedence);
      }
    }
    if (unaryOperators) {
      for (const value of Object.keys(unaryOperators)) {
        this.addUnaryOperator(value, unaryOperators[value].precedence);
      }
    }
  }

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
      this.unexpected();
    }

    return this.finishNode(node, { type: 'Expression', expression });
  }

  /** 将 AST 节点转换为表达式文本，保留字面量的原始写法 */
  stringify(node: Node): string {
    switch (node.type) {
      case 'Expression':
        return this.stringify(node.expression);
      case 'NumericLiteral':
      case 'StringLiteral':
        return node.rawValue;
      case 'Identifier':
        return node.name;
      case 'ExpressionOperator':
        return node.value;
      case 'CallExpression': {
        const callee = this.stringify(node.callee);
        const args = node.arguments
          .map((argument) => this.stringify(argument))
          .join(', ');
        return `${callee}(${args})`;
      }
      case 'UnaryExpression': {
        const operator = this.stringify(node.operator);
        const argument = this.stringify(node.argument);
        if (node.argument.type === 'BinaryExpression') {
          return `${operator}(${argument})`;
        }

        // 避免相邻字符被识别为一个更长的自定义运算符
        const text = operator + argument;
        const canOmitSpace =
          (operator === '+' || operator === '-') &&
          node.argument.type !== 'UnaryExpression' &&
          !this.operators.some(
            (token) =>
              token.isPrefix &&
              token.label.length > operator.length &&
              text.startsWith(token.label),
          );

        return canOmitSpace ? text : `${operator} ${argument}`;
      }
      case 'BinaryExpression': {
        const segments: string[] = [];
        let current = node;
        let prefix = '';

        // 沿左侧运算链迭代，避免长二元链耗尽调用栈
        while (true) {
          const { left, operator, right } = current;
          const precedence = this.getBinaryPrecedence(operator.value);
          const rightText = this.stringify(right);
          const rightPrecedence =
            right.type === 'BinaryExpression'
              ? this.getBinaryPrecedence(right.operator.value)
              : undefined;
          const wrapRight =
            right.type === 'UnaryExpression' ||
            (right.type === 'BinaryExpression' &&
              (precedence === undefined ||
                rightPrecedence === undefined ||
                rightPrecedence <= precedence));
          segments.push(
            ` ${this.stringify(operator)} ${wrapRight ? `(${rightText})` : rightText}`,
          );

          if (left.type !== 'BinaryExpression') {
            const leftText = this.stringify(left);
            segments.push(
              left.type === 'UnaryExpression' ? `(${leftText})` : leftText,
            );
            return prefix + segments.reverse().join('');
          }

          const leftPrecedence = this.getBinaryPrecedence(left.operator.value);
          if (
            left.operator.value !== operator.value &&
            (precedence === undefined ||
              leftPrecedence === undefined ||
              leftPrecedence < precedence)
          ) {
            prefix += '(';
            segments.push(')');
          }
          current = left;
        }
      }
    }
  }

  /**
   * 以深度优先的前序遍历节点，子节点按源码顺序访问
   * @param node 起始节点
   * @param visitors 节点回调，ancestors 按从根节点到直接父节点的顺序排列
   */
  walk(node: Node, visitors: WalkVisitors): void {
    const stack: { node: Node; exiting: boolean }[] = [
      { node, exiting: false },
    ];
    const ancestors: Node[] = [];

    while (stack.length > 0) {
      const { node: current, exiting } = stack.pop()!;
      if (exiting) {
        ancestors.pop();
        continue;
      }

      const visitor = visitors[current.type] as
        | ((node: Node, ancestors: Node[], options: WalkOptions) => void)
        | undefined;
      if (visitor) {
        let skipped = false;
        let stopped = false;
        visitor(current, [...ancestors], {
          skip() {
            skipped = true;
          },
          stop() {
            stopped = true;
          },
        });
        if (stopped) return;
        if (skipped) continue;
      }

      // 子节点处理完毕后，通过退出标记恢复祖先列表
      stack.push({ node: current, exiting: true });
      ancestors.push(current);

      // 子节点逆序入栈，使出栈后的访问顺序与源码一致
      switch (current.type) {
        case 'Expression':
          stack.push({ node: current.expression, exiting: false });
          break;
        case 'CallExpression':
          for (let i = current.arguments.length - 1; i >= 0; i--) {
            stack.push({ node: current.arguments[i], exiting: false });
          }
          stack.push({ node: current.callee, exiting: false });
          break;
        case 'UnaryExpression':
          stack.push({ node: current.argument, exiting: false });
          stack.push({ node: current.operator, exiting: false });
          break;
        case 'BinaryExpression':
          stack.push({ node: current.right, exiting: false });
          stack.push({ node: current.operator, exiting: false });
          stack.push({ node: current.left, exiting: false });
          break;
      }
    }
  }

  /** 获取当前实例的二元运算符优先级，注册定义优先 */
  private getBinaryPrecedence(value: string): number | undefined {
    const operator = this.operators.find(
      (token) => token.isBinary && token.label === value,
    );
    if (operator) return operator.precedence;

    switch (value) {
      case '+':
        return tt.plus.precedence;
      case '-':
        return tt.minus.precedence;
      case '*':
        return tt.times.precedence;
      case '/':
        return tt.div.precedence;
    }
  }

  /**
   * 解析一个表达式原子（最小单元的表达式）, 如: `1 + 2`、`(1 + 2 + 3)`、`-1` 都作为一个表达式原子解析
   * @param leftStartPos 左侧开始位置
   * @param minPrecedence 当前上下文的优先级
   */
  private parseExprAtom(
    leftStartPos: number,
    minPrecedence: number,
  ): ExpressionNode {
    if (this.tokenType === tt.parenL) {
      // 遇到 `(` 则递归解析表达式原子
      this.next();
      const left = this.parseExprAtom(this.tokenStart, -1);
      this.expect(tt.parenR);
      return this.parseMaybeBinary(left, leftStartPos, minPrecedence); // 将 `(expr)` 整体作为左值，进入优先级解析流程
    } else {
      const left = this.parseMaybeUnary();
      return this.parseMaybeBinary(left, leftStartPos, minPrecedence);
    }
  }

  /**
   * 解析可能的二元表达式
   * @param left 左值
   * @param leftStartPos 左值节点起始位置
   * @param minPrecedence 当前上下文的优先级
   */
  private parseMaybeBinary(
    left: ExpressionNode,
    leftStartPos: number,
    minPrecedence: number,
  ): ExpressionNode {
    // 逐个续接左结合的二元运算符，避免同级运算链增加递归深度
    while (
      this.tokenType.isBinary &&
      this.tokenType.precedence > minPrecedence
    ) {
      const precedence = this.tokenType.precedence;
      const node = this.startNode<BinaryExpression>(leftStartPos);
      const operator = this.parseOperator();

      // 解析可能更高优先级的右侧表达式，如: `1 + 2 * 3` 将解析 `2 * 3` 作为右值
      const right = this.parseExprAtom(this.tokenStart, precedence);
      left = this.finishNode(node, {
        type: 'BinaryExpression',
        left,
        right,
        operator,
      });
    }
    return left;
  }

  /**
   * 解析字面量、标识符、函数调用或已注册的前缀运算符
   */
  private parseMaybeUnary(): ExpressionNode {
    const precedence = this.tokenType.precedence;
    const node = this.startNode<ExpressionNode>();
    const start = this.tokenStart;
    const value = this.tokenText;

    if (this.tokenType.isPrefix) {
      const operator = this.parseOperator();
      // 前缀运算符自身的优先级决定其操作数的范围
      const argument = this.parseExprAtom(this.tokenStart, precedence);
      return this.finishNode(node as InitialPartNode<UnaryExpression>, {
        type: 'UnaryExpression',
        argument,
        operator,
        prefix: true,
      });
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

    if (this.tokenType === tt.string) {
      const rawValue = this.input.slice(start, this.tokenEnd);
      this.next();
      return this.finishNode(node as InitialPartNode<StringLiteral>, {
        type: 'StringLiteral',
        rawValue,
        value,
      });
    }

    if (this.tokenType === tt.identifier) {
      this.next();
      const identifier = this.finishNode(node as InitialPartNode<Identifier>, {
        type: 'Identifier',
        name: value,
      });
      if (!this.options.features.call || !this.eat(tt.parenL)) {
        return identifier;
      }

      // 每个参数按完整表达式解析，逗号用于分隔参数
      const args: ExpressionNode[] = [];
      if (!this.eat(tt.parenR)) {
        do {
          args.push(this.parseExprAtom(this.tokenStart, -1));
        } while (this.eat(tt.comma));
        this.expect(tt.parenR);
      }
      return this.finishNode(this.startNode<CallExpression>(start), {
        type: 'CallExpression',
        callee: identifier,
        arguments: args,
      });
    }

    return this.unexpected();
  }

  /**
   * 读取运算符节点，范围只覆盖当前运算符 token
   */
  private parseOperator(): ExpressionOperator {
    const node = this.startNode<ExpressionOperator>();
    const value = this.tokenText;
    this.next();
    return this.finishNode(node, { type: 'ExpressionOperator', value });
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
    if (code === 34 || code === 39) {
      if (!this.options.features.string) {
        this.unexpected(this.input[this.pos]);
      }
      return this.readString(code);
    }
    return this.readTokenFromCode();
  }

  /**
   * 读取一个数字
   */
  private readNumeric(): void {
    if (!this.options.features.number) {
      this.unexpected(this.input[this.tokenStart]);
    }

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
        allowUnderline = false;
        this.pos++;
        if (countE === -1) {
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

    const value = this.input.slice(this.tokenStart, this.pos);
    this.finishToken(tt.numeric, value);
  }

  /**
   * 读取单引号或双引号字符串并解码转义
   */
  private readString(quote: number): void {
    this.pos++;
    let chunkStart = this.pos;
    let value = '';

    while (this.isValidPosition()) {
      const code = this.codeAt(this.pos);
      if (code === quote) {
        value += this.input.slice(chunkStart, this.pos);
        this.pos++;
        return this.finishToken(tt.string, value);
      }
      if (code === 10 || code === 13) {
        this.raise(this.pos, 'unterminatedStringLiteral');
      }
      if (code === 92) {
        // 只在遇到转义时截取前面的原文
        value += this.input.slice(chunkStart, this.pos);
        this.pos++;
        if (!this.isValidPosition()) break;

        const escaped = STRING_ESCAPES[this.input[this.pos]];
        if (escaped === undefined) {
          this.raise(this.pos, 'invalidStringEscape');
        }
        value += escaped;
        chunkStart = this.pos + 1;
      }
      this.pos++;
    }

    this.raise(this.tokenStart, 'unterminatedStringLiteral', this.pos);
  }

  /**
   * 根据字符 code 读取一个 Token，包括自定义注册的运算符
   */
  private readTokenFromCode(): void {
    const code = this.input.codePointAt(this.pos) ?? -1;

    // 优先解析自定义运算符
    for (const operator of this.operators) {
      if (
        (this.allowPrefix && !operator.isPrefix) ||
        (!this.allowPrefix && !operator.isBinary)
      )
        continue;

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
        if (!this.options.features.timesOperator) {
          this.unexpected('*');
        }
        this.pos++;
        return this.finishToken(tt.times, '*');
      case 43: // `+`
        if (!this.options.features.plusOperator) {
          this.unexpected('+');
        }
        this.pos++;
        return this.finishToken(tt.plus, '+');
      case 44: // `,`
        this.pos++;
        return this.finishToken(tt.comma, ',');
      case 45: // `-`
        this.pos++;
        if (this.allowPrefix && isNumericStart(this.codeAt(this.pos))) {
          return this.readNumeric();
        }
        if (!this.options.features.minusOperator) {
          this.unexpected('-');
        }
        return this.finishToken(tt.minus, '-');
      case 47: // `/`
        if (!this.options.features.divOperator) {
          this.unexpected('/');
        }
        this.pos++;
        return this.finishToken(tt.div, '/');
      default:
        if (code === 92 || isIdentifierStart(code)) {
          return this.readIdentifier();
        }
    }

    const char = this.input.slice(this.pos, this.pos + (code > 0xffff ? 2 : 1));
    if (this.options.identifierPrefixChars.includes(char)) {
      // 自定义前缀后必须紧跟一个合法的标识符首字符或 Unicode 转义
      this.pos += char.length;
      const nextCode = this.input.codePointAt(this.pos) ?? -1;
      if (nextCode === 92 || isIdentifierStart(nextCode)) {
        return this.readIdentifier();
      }
    }
    this.unexpected(char);
  }

  /**
   * 按 ECMAScript IdentifierName 读取标识符并解码 Unicode 转义
   */
  private readIdentifier(): void {
    const identifierStart = this.pos;
    let chunkStart = this.tokenStart;
    let value = '';

    while (this.isValidPosition()) {
      const code = this.input.codePointAt(this.pos) ?? -1;
      if (code === 92) {
        IDENTIFIER_ESCAPE_PATTERN.lastIndex = this.pos;
        const match = IDENTIFIER_ESCAPE_PATTERN.exec(this.input);
        if (!match) {
          this.raise(this.pos, 'invalidIdentifierEscape');
        }

        // 转义后的码点也必须满足当前位置的标识符规则
        const escapedCode = Number.parseInt(match[1] ?? match[2], 16);
        let valid = false;
        if (escapedCode <= 0x10ffff) {
          if (this.pos === identifierStart) {
            valid = isIdentifierStart(escapedCode);
          } else {
            valid = isIdentifierChar(escapedCode);
          }
        }
        if (!valid) {
          this.raise(
            this.pos,
            'invalidIdentifierEscape',
            this.pos + match[0].length,
          );
        }
        value +=
          this.input.slice(chunkStart, this.pos) +
          String.fromCodePoint(escapedCode);
        this.pos += match[0].length;
        chunkStart = this.pos;
      } else if (isIdentifierChar(code)) {
        this.pos += code > 0xffff ? 2 : 1;
      } else {
        break;
      }
    }
    this.finishToken(
      tt.identifier,
      value + this.input.slice(chunkStart, this.pos),
    );
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
  private finishNode<T extends Node = Node>(
    node: InitialPartNode<T>,
    info?: FinishPartNode<T>,
  ): T {
    Object.assign(node, info);
    node.end = this.lastTokenEnd;
    return node as T;
  }

  /**
   * 跳过空白字符
   */
  private skipSpace(): void {
    while (
      this.isValidPosition() &&
      WHITESPACE_PATTERN.test(this.input[this.pos])
    ) {
      this.pos++;
    }
  }

  /**
   * 消费当前指定类型的 token，否则抛出异常
   * @param type
   */
  private expect(type: TokenType): void {
    if (!this.eat(type)) {
      this.unexpected();
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
   * @param start
   */
  private unexpected(token?: string, start = this.tokenStart): never {
    let end: number | undefined;
    if (token === undefined) {
      end = this.tokenEnd;
      if (this.tokenType === tt.string) {
        token = this.input.slice(this.tokenStart, this.tokenEnd);
      } else {
        token = this.tokenText;
      }
    }
    this.raise(start, 'unexpectedToken', end, token);
  }

  /**
   * 用当前语言的提示模板抛出语法错误
   * @param start
   * @param code
   * @param end
   * @param value
   */
  private raise(
    start: number,
    code: keyof Messages,
    end?: number,
    value?: string,
  ): never {
    if (start >= this.input.length) {
      code = 'unexpectedEndOfInput';
      start = this.input.length;
      end = start;
      value = undefined;
    }

    // 词法错误未提供完整范围时，覆盖当前位置的一个 Unicode 码点。
    end ??= start + ((this.input.codePointAt(start) ?? 0) > 0xffff ? 2 : 1);
    const message = this.options.messages[code].replace(
      MESSAGE_PLACEHOLDER_PATTERN,
      (placeholder) => {
        if (placeholder === '{pos}') return String(start);
        return value ?? placeholder;
      },
    );
    throw new ParserError(message, code, start, end);
  }

  private addOperator(
    value: string,
    precedence: number,
    isUnary: boolean,
  ): void {
    if (typeof value !== 'string' || !/^\S+$/.test(value)) {
      throw new Error('The custom operator should be a non-empty string');
    }
    if (/[(),'"]/.test(value)) {
      throw new Error(
        'The custom operator cannot use reserved characters, including parentheses, commas and quotes',
      );
    }
    if (isNumericStart(value.charCodeAt(0))) {
      throw new Error(
        'The custom operator cannot start with a possible number, including: `.`, 0-9',
      );
    }
    if (value.charCodeAt(0) === 63) {
      // `?`
      throw new Error('The custom operator cannot start with `?`');
    }
    if (
      typeof precedence !== 'number' ||
      Number.isNaN(precedence) ||
      precedence < 0
    ) {
      throw new Error(
        'The precedence should be a number greater than or equal to 0',
      );
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
