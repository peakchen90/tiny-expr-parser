import type { Messages } from './types';

/** 带有错误码和源码范围的解析错误 */
export class ParserError extends SyntaxError {
  constructor(
    message: string,
    readonly code: keyof Messages,
    readonly start: number,
    readonly end: number,
  ) {
    super(message);
    this.name = 'ParserError';
  }

  /** 返回错误的可序列化信息 */
  toJSON() {
    return {
      name: this.name,
      code: this.code,
      start: this.start,
      end: this.end,
      message: this.message,
      stack: this.stack,
    };
  }
}
