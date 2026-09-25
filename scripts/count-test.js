// 字数引擎验证脚本（对照规划文档 3.1.5 算法）
const { countText } = require('../dist/count/countEngine.js');

let failures = 0;
function check(actual, expected, label) {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(ok ? 'PASS' : 'FAIL', label.padEnd(22), 'got', actual, 'expected', expected);
}

const t = '你好，世界！Hello123\n';
check(countText(t, 'all'), 15, 'all 所有码点');
check(countText(t, 'cjk'), 4, 'cjk 仅汉字');
check(countText(t, 'cjk_punct'), 6, 'cjk_punct 汉字+中文标点');
check(countText(t, 'non_whitespace'), 14, 'non_whitespace 排除换行');
check(countText(t, 'qidian'), 14, 'qidian 起点=非空白');
check(countText(t, 'fanqie'), 8, 'fanqie 汉字4+标点2+词1+串1');
check(countText(t, 'mixed'), 8, 'mixed 汉字4+标点2+词1+串1');

// 全角空格应排除
check(countText('　a　', 'non_whitespace'), 1, '全角空格排除');

// CRLF 按 2 码点计
check(countText('a\r\nb', 'all'), 4, 'CRLF 计 2 码点');

// 英文单词/数字串边界
check(countText('abc123def456', 'fanqie'), 4, 'fanqie 词串');
check(countText('abc123def456', 'mixed'), 4, 'mixed 词串');

// 标点：英文标点计入 non_whitespace，不计入 cjk_punct
check(countText('a.b,', 'non_whitespace'), 4, '英文标点非空白');

console.log(failures === 0 ? '\n全部通过' : `\n${failures} 项失败`);
process.exit(failures === 0 ? 0 : 1);
