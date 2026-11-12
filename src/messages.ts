import type { Messages } from './types';

/** 英文语法错误提示，也是默认提示 */
export const enMessages: Readonly<Messages> = {
  unexpectedToken: 'Unexpected token {v} at position {pos}',
  unexpectedEndOfInput: 'Unexpected end of input',
  unterminatedStringLiteral: 'Unterminated string literal at position {pos}',
  invalidStringEscape: 'Invalid string escape at position {pos}',
  invalidIdentifierEscape:
    'Invalid Unicode escape in identifier at position {pos}',
};

/** 简体中文语法错误提示 */
export const zhCNMessages: Readonly<Messages> = {
  unexpectedToken: '位置 {pos} 处出现意外的标记 {v}',
  unexpectedEndOfInput: '表达式意外结束',
  unterminatedStringLiteral: '字符串未闭合（位置 {pos}）',
  invalidStringEscape: '无效的字符串转义（位置 {pos}）',
  invalidIdentifierEscape: '标识符中的 Unicode 转义无效（位置 {pos}）',
};
