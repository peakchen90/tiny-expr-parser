const IDENTIFIER_START_PATTERN = /^\p{ID_Start}$/u;
const IDENTIFIER_CONTINUE_PATTERN = /^[\p{ID_Continue}\u200C\u200D]$/u;

export const WHITESPACE_PATTERN = /\s/;
export const MESSAGE_PLACEHOLDER_PATTERN = /\{(?:v|pos)\}/g;
export const IDENTIFIER_ESCAPE_PATTERN =
  /\\u(?:([0-9a-fA-F]{4})|\{([0-9a-fA-F]+)\})/y;
export const STRING_ESCAPES: Record<string, string | undefined> = {
  '"': '"',
  "'": "'",
  '\\': '\\',
  '/': '/',
  b: '\b',
  f: '\f',
  n: '\n',
  r: '\r',
  t: '\t',
  v: '\v',
};

/**
 * 判断数字可能的字符
 * @param code
 */
export function isNumericChar(code: number): boolean {
  return code >= 48 && code <= 57;
}

/**
 * 判断数字开始字符
 * @param code
 */
export function isNumericStart(code: number): boolean {
  if (code === 46) return true; // `.`
  return isNumericChar(code); // 0-9
}

/**
 * 判断 Unicode 码点是否可以作为标识符首字符
 */
export function isIdentifierStart(code: number): boolean {
  if (code >= 65 && code <= 90) return true; // A-Z
  if (code >= 97 && code <= 122) return true; // a-z
  if (code === 36 || code === 95) return true; // $ _
  return (
    code > 127 && IDENTIFIER_START_PATTERN.test(String.fromCodePoint(code))
  );
}

/**
 * 判断 Unicode 码点是否可以作为标识符后续字符
 */
export function isIdentifierChar(code: number): boolean {
  if (code > 127) {
    return IDENTIFIER_CONTINUE_PATTERN.test(String.fromCodePoint(code));
  }
  return isIdentifierStart(code) || isNumericChar(code);
}

/**
 * 返回一个数字的原始数据
 * @param rawValue
 */
export function getRealNumeric(rawValue: string): string {
  let value = rawValue;

  // 去掉数字分割线线
  const arr: string[] = [];
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code !== 95) {
      // `_`
      arr.push(value[i]);
    }
  }
  if (arr.length !== value.length) {
    value = arr.join('');
  }

  return value;
}
