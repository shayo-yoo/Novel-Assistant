/**
 * Unicode 工具：用于字符分类与正则集合，避免各处重复定义。
 */

/** CJK 统一汉字与扩展 A 区 */
export const CJK_REGEX = /[\u4E00-\u9FFF\u3400-\u4DBF]/u;

/** CJK 扩展 B-F 区与兼容区（须用 \u{...} 表示增补平面） */
export const CJK_EXT_REGEX = /[\u{20000}-\u{2EBEF}\uF900-\uFAFF]/u;

/** 中英文常用标点集合（中文标点 + 英文标点） */
export const PUNCTUATION_REGEX =
  /[，。！？；：“”‘’「」『』《》【】（）——……·、—～！＠＃￥％＆＊？＞＜：；，．／｀～＾｜｛｝［］（）"',.!?;:()\[\]{}<>\\/|`~@#$%^&*_+=\-]/u;

/** 仅中文标点（用于 cjk_punct 模式） */
export const CJK_PUNCTUATION_REGEX =
  /[，。！？；：“”‘’「」『』《》【】（）——……·、—～！＠＃￥％＆＊？＞＜：；，．／]/u;

/** Unicode 空白（含全角空格、Tab、换行、回车、换页等） */
export const WHITESPACE_REGEX = /\s/u;

/** ASCII 字母序列 */
export const ASCII_WORD_REGEX = /[A-Za-z]+/g;

/** ASCII 数字序列 */
export const ASCII_DIGIT_REGEX = /\d+/g;

/** 是否为 CJK 汉字 */
export function isCjk(ch: string): boolean {
  return CJK_REGEX.test(ch) || CJK_EXT_REGEX.test(ch);
}

/** 是否为中文标点 */
export function isCjkPunct(ch: string): boolean {
  return CJK_PUNCTUATION_REGEX.test(ch);
}

/** 是否为空白 */
export function isWhitespace(ch: string): boolean {
  return WHITESPACE_REGEX.test(ch);
}
