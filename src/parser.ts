import type {
  BinaryExpression,
  RootNode,
  ExpressionNode,
  Node,
  StringifyCallback,
  Operator,
  UnaryExpression,
  CallExpression,
  MemberExpression,
  ArrayExpression,
  InitialPartNode,
  FinishPartNode,
  NumericLiteral,
  StringLiteral,
  Identifier,
  TokenType,
  ParserOptions,
  LooseParseResult,
  Messages,
  WalkOptions,
  WalkVisitors,
} from './types';
import { enMessages, zhCNMessages } from './messages';
import { ParserError } from './parser-error';
import {
  tokenTypes as tt,
  groupOperandBoundaries,
  callOperandBoundaries,
  arrayOperandBoundaries,
} from './token';
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

  /**
   * 创建表达式解析器
   * @param options 语法开关、标识符前缀、错误消息和自定义运算符配置
   */
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
        array: features?.array !== false,
        call: features?.call !== false,
        member: features?.member !== false,
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
   * @param value 运算符文本
   * @param precedence 运算符优先级，数值越大越先结合
   */
  addBinaryOperator(value: string, precedence: number): void {
    this.addOperator(value, precedence, false);
  }

  /**
   * 注册前缀一元运算符
   * @param value 运算符文本
   * @param precedence 决定操作数范围的优先级
   */
  addUnaryOperator(value: string, precedence: number): void {
    this.addOperator(value, precedence, true);
  }

  /**
   * 严格解析表达式，空字符串或纯空白返回 `null`
   * @param input 表达式源码
   */
  parse(input: string): RootNode | null {
    this.startParse(input);
    const node = this.startNode<RootNode>(this.tokenStart);
    if (this.tokenType === tt.end) {
      return null; // 空字符
    }

    const expression = this.parseExpression(-1);
    if (!expression || this.tokenType !== tt.end) {
      this.unexpected();
    }

    return this.finishNode(node, { type: 'Expression', expression });
  }

  /**
   * 开始宽松解析，如果是空字符串或纯空白，返回空的节点和错误列表
   * 遇到语法错误时记录错误并尽可能继续解析，返回已识别的节点和错误列表
   * @param input 表达式源码
   */
  parseLoose(input: string): LooseParseResult {
    const result: LooseParseResult = { nodes: [], errors: [] };
    this.startParse(input, result.errors);
    while (this.tokenType !== tt.end) {
      const start = this.tokenStart;
      try {
        const expression = this.parseExpression(-1, result);
        if (!expression) this.unexpected();
        this.finishNode(
          this.startNode<RootNode>(start),
          { type: 'Expression', expression },
          result.nodes,
        );
        if (this.tokenType === tt.end) break;
        result.errors.push(this.unexpectedError());
      } catch (error) {
        if (!(error instanceof ParserError)) throw error;
        result.errors.push(error);
      }

      if (this.tokenType === tt.end) break;
      // 运算符仍可高亮；能开始新表达式的 token 留给下一轮
      if (this.tokenType.isBinary && !this.tokenType.isPrefix) {
        this.parseOperator(result);
      } else if (
        this.tokenStart === start ||
        this.tokenType === tt.parenR ||
        this.tokenType === tt.bracketR ||
        this.tokenType === tt.comma ||
        this.tokenType === tt.dot
      ) {
        this.next(result.errors);
      }
    }

    result.errors.sort((a, b) => a.start - b.start);
    return result;
  }

  /**
   * 将 AST 节点转换为表达式文本，默认保留字面量的原始写法
   * 自定义回调返回 undefined 时使用内置逻辑，其 stringify 参数会继续应用同一回调
   * @param node 要转换的 AST 节点
   * @param customStringify 可选的节点格式化回调
   */
  stringify(node: Node, customStringify?: StringifyCallback): string {
    const stringify = (child: Node) => this.stringify(child, customStringify);
    const customText = customStringify?.(node, stringify);
    if (customText !== undefined) return customText;

    switch (node.type) {
      case 'Expression':
        return stringify(node.expression);
      case 'NumericLiteral':
      case 'StringLiteral':
        return node.rawValue;
      case 'Identifier':
        return node.name;
      case 'Operator':
        return node.value;
      case 'CallExpression':
      case 'MemberExpression': {
        let current = node;
        let parents: (CallExpression | MemberExpression)[] | undefined;
        let text: string;

        // 沿调用和成员访问的左侧链迭代，保留回调顺序且避免耗尽调用栈
        while (true) {
          const base: ExpressionNode =
            current.type === 'CallExpression' ? current.callee : current.object;
          if (
            base.type !== 'CallExpression' &&
            base.type !== 'MemberExpression'
          ) {
            text = stringify(base);
            if (
              base.type === 'NumericLiteral' ||
              base.type === 'BinaryExpression' ||
              base.type === 'UnaryExpression'
            ) {
              text = `(${text})`;
            }
            break;
          }

          const customText = customStringify?.(base, stringify);
          if (customText !== undefined) {
            text = customText;
            break;
          }
          (parents ??= []).push(current);
          current = base;
        }

        while (true) {
          text +=
            current.type === 'CallExpression'
              ? `(${current.arguments.map(stringify).join(', ')})`
              : `.${stringify(current.property)}`;
          const parent = parents?.pop();
          if (!parent) return text;
          current = parent;
        }
      }
      case 'ArrayExpression':
        return `[${node.elements.map(stringify).join(', ')}]`;
      case 'UnaryExpression': {
        const operator = stringify(node.operator);
        const argument = stringify(node.argument);
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
          const rightText = stringify(right);
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
            ` ${stringify(operator)} ${wrapRight ? `(${rightText})` : rightText}`,
          );

          if (left.type !== 'BinaryExpression') {
            const leftText = stringify(left);
            segments.push(
              left.type === 'UnaryExpression' ? `(${leftText})` : leftText,
            );
            break;
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

          // 左侧二元节点沿迭代路径处理，也需要应用自定义回调
          const leftText = customStringify?.(left, stringify);
          if (leftText !== undefined) {
            segments.push(leftText);
            break;
          }
          current = left;
        }
        return prefix + segments.reverse().join('');
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
        case 'MemberExpression':
          stack.push({ node: current.property, exiting: false });
          stack.push({ node: current.object, exiting: false });
          break;
        case 'ArrayExpression':
          for (let i = current.elements.length - 1; i >= 0; i--) {
            stack.push({ node: current.elements[i], exiting: false });
          }
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

  /**
   * 重置解析状态并读取首个 token
   * @param input 表达式源码
   * @param errors 宽松模式下收集词法错误的列表
   */
  private startParse(input: string, errors?: ParserError[]): void {
    this.input = input;
    this.tokenType = tt.start;
    this.tokenText = '';
    this.pos = 0;
    this.tokenStart = 0;
    this.tokenEnd = 0;
    this.lastTokenStart = 0;
    this.lastTokenEnd = 0;
    this.allowPrefix = true;

    this.next(errors);
  }

  /**
   * 获取当前实例的二元运算符优先级，注册定义优先
   * @param value 运算符文本
   */
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
   * 先解析操作数，再按优先级续接二元运算，缺失操作数且可恢复时返回 `undefined`
   * @param minPrecedence 二元运算符的优先级必须大于此值，`-1` 表示接受所有优先级
   * @param looseResult 宽松模式下收集节点片段和错误的结果
   * @param operandBoundaries 当前语法结构中允许恢复缺失操作数的 token 类型
   */
  private parseExpression(
    minPrecedence: number,
    looseResult?: LooseParseResult,
    operandBoundaries?: readonly TokenType[],
  ): ExpressionNode | undefined {
    const start = this.tokenStart;
    const errors = looseResult?.errors;
    const nodes = looseResult?.nodes;
    let canCall = this.tokenType === tt.identifier;
    let left: ExpressionNode | undefined;
    if (this.tokenType === tt.parenL) {
      this.next(errors);
      left = this.parseExpression(
        -1,
        looseResult,
        operandBoundaries ? groupOperandBoundaries : undefined,
      );
      this.expect(tt.parenR, errors);
    } else {
      left = this.parseMaybeUnary(looseResult, operandBoundaries);
    }
    if (!left) return;

    // 成员访问和调用在二元运算之前结合，调用目标为未分组的标识符或点号成员
    while (true) {
      if (this.tokenType === tt.dot) {
        this.next(errors);
        if (this.tokenType !== tt.identifier) {
          if (
            errors &&
            (this.tokenType === tt.end ||
              operandBoundaries?.includes(this.tokenType))
          ) {
            if (
              this.tokenType === tt.end ||
              errors.length === 0 ||
              errors[errors.length - 1].start < this.lastTokenEnd
            ) {
              errors.push(this.unexpectedError());
            }
            break;
          }
          this.unexpected();
        }

        const propertyNode = this.startNode<Identifier>();
        const name = this.tokenText;
        this.next(errors);
        const property = this.finishNode<Identifier>(propertyNode, {
          type: 'Identifier',
          name,
        });
        left = this.finishNode<MemberExpression>(
          this.startNode(start),
          { type: 'MemberExpression', object: left, property },
          nodes,
        );
        canCall = true;
      } else if (
        this.tokenType === tt.parenL &&
        canCall &&
        this.options.features.call &&
        (left.type === 'Identifier' || left.type === 'MemberExpression')
      ) {
        this.next(errors);
        const args = this.parseExpressionList(tt.parenR, looseResult);
        left = this.finishNode<CallExpression>(
          this.startNode(start),
          { type: 'CallExpression', callee: left, arguments: args },
          nodes,
        );
      } else {
        break;
      }
    }

    // 逐个续接左结合的二元运算符，避免同级运算链增加递归深度
    while (
      this.tokenType.isBinary &&
      this.tokenType.precedence > minPrecedence
    ) {
      const precedence = this.tokenType.precedence;
      const node = this.startNode<BinaryExpression>(start);
      const operator = this.parseOperator(looseResult);

      // 解析可能更高优先级的右侧表达式，如: `1 + 2 * 3` 将解析 `2 * 3` 作为右值
      const right = this.parseExpression(
        precedence,
        looseResult,
        operandBoundaries,
      );
      if (!right) break;
      left = this.finishNode(
        node,
        { type: 'BinaryExpression', left, right, operator },
        nodes,
      );
    }
    return left;
  }

  /**
   * 解析字面量、数组、标识符或已注册的前缀运算符
   * @param looseResult 宽松模式下收集节点片段和错误的结果
   * @param operandBoundaries 当前语法结构中允许恢复缺失操作数的 token 类型
   */
  private parseMaybeUnary(
    looseResult?: LooseParseResult,
    operandBoundaries?: readonly TokenType[],
  ): ExpressionNode | undefined {
    const precedence = this.tokenType.precedence;
    const node = this.startNode<ExpressionNode>();
    const start = this.tokenStart;
    const value = this.tokenText;
    const errors = looseResult?.errors;
    const nodes = looseResult?.nodes;

    if (this.tokenType.isPrefix) {
      const operator = this.parseOperator(looseResult);
      // 前缀运算符自身的优先级决定其操作数的范围
      const argument = this.parseExpression(
        precedence,
        looseResult,
        operandBoundaries,
      );
      if (!argument) return;
      return this.finishNode(
        node as InitialPartNode<UnaryExpression>,
        { type: 'UnaryExpression', argument, operator, prefix: true },
        nodes,
      );
    }

    if (this.tokenType === tt.numeric) {
      const realValue = getRealNumeric(value);
      const rawValue = value;
      this.next(errors);
      return this.finishNode(
        node as InitialPartNode<NumericLiteral>,
        { type: 'NumericLiteral', rawValue, value: realValue },
        nodes,
      );
    }

    if (this.tokenType === tt.string) {
      const rawValue = this.input.slice(start, this.tokenEnd);
      this.next(errors);
      return this.finishNode(
        node as InitialPartNode<StringLiteral>,
        { type: 'StringLiteral', rawValue, value },
        nodes,
      );
    }

    if (this.eat(tt.bracketL, errors)) {
      return this.finishNode(
        node as InitialPartNode<ArrayExpression>,
        {
          type: 'ArrayExpression',
          elements: this.parseExpressionList(tt.bracketR, looseResult),
        },
        nodes,
      );
    }

    if (this.tokenType === tt.identifier) {
      this.next(errors);
      return this.finishNode(
        node as InitialPartNode<Identifier>,
        { type: 'Identifier', name: value },
        nodes,
      );
    }

    // 操作数缺失时把分隔符留给外层，词法错误已经定位的空位无需重复报错
    if (errors && operandBoundaries?.includes(this.tokenType)) {
      if (
        this.tokenType === tt.end ||
        errors.length === 0 ||
        errors[errors.length - 1].start < this.lastTokenEnd
      ) {
        errors.push(this.unexpectedError());
      }
      return;
    }

    return this.unexpected();
  }

  /**
   * 读取逗号分隔的数组元素或函数参数，每项按完整表达式解析
   * @param closingToken 结束列表的右方括号或右圆括号
   * @param looseResult 宽松模式下收集节点片段和错误的结果
   */
  private parseExpressionList(
    closingToken: TokenType,
    looseResult?: LooseParseResult,
  ): ExpressionNode[] {
    const errors = looseResult?.errors;
    const operandBoundaries = looseResult
      ? closingToken === tt.parenR
        ? callOperandBoundaries
        : arrayOperandBoundaries
      : undefined;
    const elements: ExpressionNode[] = [];
    if (!this.eat(closingToken, errors)) {
      do {
        const element = this.parseExpression(
          -1,
          looseResult,
          operandBoundaries,
        );
        if (element) elements.push(element);
      } while (this.eat(tt.comma, errors));
      this.expect(closingToken, errors);
    }
    return elements;
  }

  /**
   * 读取运算符节点，范围只覆盖当前运算符 token
   * @param looseResult 宽松模式下收集节点片段和错误的结果
   */
  private parseOperator(looseResult?: LooseParseResult): Operator {
    const node = this.startNode<Operator>();
    const value = this.tokenText;
    this.next(looseResult?.errors);
    return this.finishNode(
      node,
      { type: 'Operator', value },
      looseResult?.nodes,
    );
  }

  /**
   * 读取并移到下一个 Token
   * @param errors 宽松模式下收集词法错误的列表
   */
  private next(errors?: ParserError[]): void {
    this.lastTokenStart = this.tokenStart;
    this.lastTokenEnd = this.tokenEnd;

    while (true) {
      this.skipSpace();
      this.tokenStart = this.pos;
      if (this.pos >= this.input.length) {
        if (this.tokenType !== tt.end) this.finishToken(tt.end);
        return;
      }

      try {
        return this.readToken(errors);
      } catch (error) {
        if (!errors || !(error instanceof ParserError)) throw error;
        errors.push(error);

        // 跳过无效字符，保证恢复时向前推进
        if (this.pos === this.tokenStart) {
          this.pos = error.end;
        }
      }
    }
  }

  /**
   * 读取一个 token
   * @param errors 宽松模式下收集词法错误的列表
   */
  private readToken(errors?: ParserError[]): void {
    const code = this.codeAt(this.pos);
    if (
      code === 46 &&
      this.options.features.member &&
      !isNumericChar(this.codeAt(this.pos + 1))
    ) {
      this.pos++;
      return this.finishToken(tt.dot, '.');
    }
    if (isNumericStart(code)) {
      return this.readNumeric(errors);
    }
    if (code === 34 || code === 39) {
      if (!this.options.features.string) {
        this.unexpected(this.input[this.pos]);
      }
      return this.readString(code, errors);
    }
    return this.readTokenFromCode(errors);
  }

  /**
   * 读取一个数字
   * @param errors 宽松模式下收集数字词法错误的列表
   */
  private readNumeric(errors?: ParserError[]): void {
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
          // 已完整读取的数字后，只有紧跟数字的点号仍按数字语法报错
          if (
            this.options.features.member &&
            !isNumericChar(this.codeAt(this.pos + 1))
          ) {
            break;
          }
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
      const error = this.unexpectedError(
        this.input[unexpectedPos],
        unexpectedPos,
      );
      if (!errors) throw error;
      errors.push(error);
    }

    const value = this.input.slice(this.tokenStart, this.pos);
    this.finishToken(tt.numeric, value);
  }

  /**
   * 读取单引号或双引号字符串并解码转义
   * @param quote 起始引号的 UTF-16 码元值
   * @param errors 宽松模式下收集字符串词法错误的列表
   */
  private readString(quote: number, errors?: ParserError[]): void {
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
        const error = this.createError(this.pos, 'unterminatedStringLiteral');
        if (!errors) throw error;
        errors.push(error);
        return this.finishToken(
          tt.string,
          value + this.input.slice(chunkStart, this.pos),
        );
      }
      if (code === 92) {
        // 只在遇到转义时截取前面的原文
        value += this.input.slice(chunkStart, this.pos);
        chunkStart = this.pos;
        this.pos++;
        if (!this.isValidPosition()) break;

        const escaped = STRING_ESCAPES[this.input[this.pos]];
        if (escaped === undefined) {
          const error = this.createError(this.pos, 'invalidStringEscape');
          if (!errors) throw error;
          errors.push(error);
          // 行尾的无效转义结束当前字符串，以便继续解析下一行
          if (this.codeAt(this.pos) === 10 || this.codeAt(this.pos) === 13) {
            return this.finishToken(
              tt.string,
              value + this.input.slice(chunkStart, this.pos),
            );
          }
        }
        value += escaped ?? this.input[this.pos];
        chunkStart = this.pos + 1;
      }
      this.pos++;
    }

    const error = this.createError(
      this.tokenStart,
      'unterminatedStringLiteral',
      this.pos,
    );
    if (!errors) throw error;
    errors.push(error);
    this.finishToken(tt.string, value + this.input.slice(chunkStart, this.pos));
  }

  /**
   * 按当前位置的 Unicode 码点读取 token，优先匹配自定义运算符
   * @param errors 宽松模式下收集词法错误的列表
   */
  private readTokenFromCode(errors?: ParserError[]): void {
    const code = this.input.codePointAt(this.pos) ?? -1;

    // 点号后的标识符名称不匹配同名的自定义运算符
    if (this.tokenType === tt.dot && (code === 92 || isIdentifierStart(code))) {
      return this.readIdentifier(errors);
    }

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
          return this.readNumeric(errors);
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
          return this.readIdentifier(errors);
        }
    }

    const char = this.input.slice(this.pos, this.pos + (code > 0xffff ? 2 : 1));
    if (this.options.identifierPrefixChars.includes(char)) {
      // 自定义前缀后必须紧跟一个合法的标识符首字符或 Unicode 转义
      this.pos += char.length;
      const nextCode = this.input.codePointAt(this.pos) ?? -1;
      if (nextCode === 92 || isIdentifierStart(nextCode)) {
        return this.readIdentifier(errors);
      }
    }
    if (code === 91 || code === 93) {
      // 已配置的标识符前缀优先于方括号
      if (!this.options.features.array) {
        this.unexpected(char);
      }
      this.pos = this.tokenStart + 1;
      return this.finishToken(code === 91 ? tt.bracketL : tt.bracketR, char);
    }
    this.unexpected(char);
  }

  /**
   * 按 ECMAScript IdentifierName 读取标识符并解码 Unicode 转义
   * @param errors 宽松模式下收集无效 Unicode 转义错误的列表
   */
  private readIdentifier(errors?: ParserError[]): void {
    const identifierStart = this.pos;
    let chunkStart = this.tokenStart;
    let value = '';

    while (this.isValidPosition()) {
      const code = this.input.codePointAt(this.pos) ?? -1;
      if (code === 92) {
        IDENTIFIER_ESCAPE_PATTERN.lastIndex = this.pos;
        const match = IDENTIFIER_ESCAPE_PATTERN.exec(this.input);

        // 转义后的码点也必须满足当前位置的标识符规则
        const escapedCode = match
          ? Number.parseInt(match[1] ?? match[2], 16)
          : -1;
        let valid = false;
        if (match && escapedCode <= 0x10ffff) {
          if (this.pos === identifierStart) {
            valid = isIdentifierStart(escapedCode);
          } else {
            valid = isIdentifierChar(escapedCode);
          }
        }
        if (!match || !valid) {
          const error = this.createError(
            this.pos,
            'invalidIdentifierEscape',
            match ? this.pos + match[0].length : undefined,
          );
          if (!errors) throw error;
          errors.push(error);
          // 保留原文用于高亮，继续读取标识符的后续字符
          this.pos = error.end;
          continue;
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
   * 完成当前 token 并更新词法上下文
   * @param type 当前 token 的类型
   * @param value 保存到当前 token 的文本，默认为空字符串
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

  /**
   * 读取指定位置的 UTF-16 码元值
   * @param index 源码中的 UTF-16 偏移
   */
  private codeAt(index: number): number {
    return this.input.charCodeAt(index);
  }

  private isValidPosition(): boolean {
    return this.pos < this.input.length;
  }

  /**
   * 在当前位置创建一个新节点
   * @param pos 节点的起始偏移，默认为当前 token 的起点
   */
  private startNode<T extends Node = Node>(pos?: number): InitialPartNode<T> {
    pos = pos ?? this.tokenStart;
    return { start: pos, end: pos };
  }

  /**
   * 补全节点字段，以前一个 token 的结束位置作为节点终点
   * @param node 包含初始源码范围的节点
   * @param info 要合并到节点的类型及其他字段
   * @param nodes 宽松模式下收集节点片段的列表，父节点会替换已收集的子节点
   */
  private finishNode<T extends Node = Node>(
    node: InitialPartNode<T>,
    info?: FinishPartNode<T>,
    nodes?: Node[],
  ): T {
    Object.assign(node, info);
    node.end = this.lastTokenEnd;
    if (nodes) {
      // 父节点完成后用它替换已收集的子节点，避免 walk 重复访问
      while (nodes.length > 0 && nodes[nodes.length - 1].start >= node.start) {
        nodes.pop();
      }
      nodes.push(node as T);
    }
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
   * 消费指定类型的 token，宽松模式下允许在输入末尾缺少闭合符
   * @param type 期望消费的 token 类型
   * @param errors 宽松模式下收集词法错误和输入结束错误的列表
   */
  private expect(type: TokenType, errors?: ParserError[]): void {
    if (!this.eat(type, errors)) {
      if (errors && this.tokenType === tt.end) {
        // 嵌套表达式可以在同一个输入末尾结束
        if (errors[errors.length - 1]?.code !== 'unexpectedEndOfInput') {
          errors.push(this.unexpectedError());
        }
        return;
      }
      this.unexpected();
    }
  }

  /**
   * 当前 token 匹配指定类型时将其消费并返回 `true`，否则返回 `false`
   * @param type 要匹配的 token 类型
   * @param errors 宽松模式下读取下一个 token 时收集词法错误的列表
   */
  private eat(type: TokenType, errors?: ParserError[]): boolean {
    if (this.tokenType === type) {
      this.next(errors);
      return true;
    }
    return false;
  }

  /**
   * 抛出 Unexpected token 异常
   * @param token 用于错误提示的文本，默认取当前 token 的文本
   * @param start 错误起始偏移，默认为当前 token 的起点
   */
  private unexpected(token?: string, start = this.tokenStart): never {
    throw this.unexpectedError(token, start);
  }

  /**
   * 生成意外 token 错误
   * @param token 用于错误提示的文本，省略时从当前 token 读取文本及结束位置
   * @param start 错误起始偏移，默认为当前 token 的起点
   */
  private unexpectedError(
    token?: string,
    start = this.tokenStart,
  ): ParserError {
    let end: number | undefined;
    if (token === undefined) {
      end = this.tokenEnd;
      if (this.tokenType === tt.string) {
        token = this.input.slice(this.tokenStart, this.tokenEnd);
      } else {
        token = this.tokenText;
      }
    }
    return this.createError(start, 'unexpectedToken', end, token);
  }

  /**
   * 用当前语言的提示模板生成语法错误
   * @param start 错误范围的起始 UTF-16 偏移
   * @param code 错误码，对应错误消息模板
   * @param end 错误范围的结束 UTF-16 偏移，含首不含尾，省略时覆盖一个 Unicode 码点
   * @param value 替换消息模板中 `{v}` 的文本
   */
  private createError(
    start: number,
    code: keyof Messages,
    end?: number,
    value?: string,
  ): ParserError {
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
    return new ParserError(message, code, start, end);
  }

  /**
   * 校验并注册自定义运算符
   * @param value 运算符文本
   * @param precedence 运算符优先级
   * @param isUnary 是否为前缀一元运算符
   */
  private addOperator(
    value: string,
    precedence: number,
    isUnary: boolean,
  ): void {
    if (typeof value !== 'string' || !/^\S+$/.test(value)) {
      throw new Error('The custom operator should be a non-empty string');
    }
    if (/\p{Cc}/u.test(value)) {
      throw new Error('The custom operator cannot contain control characters');
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
    if (value[0] === '[' || value[0] === ']') {
      throw new Error('The custom operator cannot start with `[` or `]`');
    }
    if (!Number.isFinite(precedence) || precedence < 0) {
      throw new Error(
        'The precedence should be a finite number greater than or equal to 0',
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
