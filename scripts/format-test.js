// 格式化逻辑验证（对照规划文档 3.3）— 只测试不依赖 vscode 的纯逻辑
const { TitleDetector } = require('../dist/format/titleDetector.js');
const { DEFAULT_CONFIG } = require('../dist/config/defaultConfig.js');

let failures = 0;
function check(actual, expected, label) {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(ok ? 'PASS' : 'FAIL', label);
  if (!ok) {
    console.log('  got     :', JSON.stringify(actual));
    console.log('  expected:', JSON.stringify(expected));
  }
}

const detector = new TitleDetector(DEFAULT_CONFIG);
check(detector.isTitleLine('第一章 风起'), true, '标题行 第X章');
check(detector.isTitleLine('Chapter 12'), true, '标题行 Chapter 12');
check(detector.isTitleLine('序章'), true, '标题行 序章');
check(detector.isTitleLine('楔子'), true, '标题行 楔子');
check(detector.isTitleLine('   第3回 相遇'), true, '标题行 缩进第3回');
check(detector.isTitleLine('正文内容'), false, '普通行非标题');
check(detector.isDivider('---'), true, '分隔线 ---');
check(detector.isDivider('***'), true, '分隔线 ***');
check(detector.isDivider('___'), true, '分隔线 ___');
check(detector.isDivider('----'), true, '分隔线 ----');
check(detector.isQuoteLine('> 引用'), true, '引用行');
check(detector.isListLine('- 列表'), true, '列表行 -');
check(detector.isListLine('* 列表'), true, '列表行 *');
check(detector.isListLine('1. 列表'), true, '列表行 1.');
check(detector.shouldSkipIndent('第一章 风起'), true, '应跳过缩进：标题');
check(detector.shouldSkipIndent('---'), true, '应跳过缩进：分隔线');
check(detector.shouldSkipIndent('正文'), false, '应缩进：正文');

// 格式化行处理关键点（与 formatService 相同规则）
function simulateFormat(text, config) {
  const lines = text.split(/\r?\n/);
  const d = new TitleDetector(config);
  const indent = config.formatIndent || '    ';
  return lines.map(line => {
    const trimmed = line.trim();
    if (!trimmed) return line;
    if (d.shouldSkipIndent(line)) return line;
    return indent + line.replace(/^[\t\u3000 ]+/u, '');
  }).join(text.includes('\r\n') ? '\r\n' : '\n');
}

const sample = [
  '第一章 风起',
  '',
  '这是第一段',
  '    这是已有缩进的段落',
  '\t这是Tab缩进的段落',
  '这是另一段',
  '---',
  '> 引用内容',
  '- 列表项',
  '最后一段'
].join('\n');

const expected = [
  '第一章 风起',
  '',
  '    这是第一段',
  '    这是已有缩进的段落',
  '    这是Tab缩进的段落',
  '    这是另一段',
  '---',
  '> 引用内容',
  '- 列表项',
  '    最后一段'
].join('\n');

check(simulateFormat(sample, DEFAULT_CONFIG), expected, '完整格式化规则');

check(DEFAULT_CONFIG.formatIndent, '    ', '默认缩进为四个半角空格');

// 换行符保留
check(simulateFormat('a\r\n\r\nb\r\n', DEFAULT_CONFIG), '    a\r\n\r\n    b\r\n', 'CRLF 保留');
check(simulateFormat('a\n\nb\n', DEFAULT_CONFIG), '    a\n\n    b\n', 'LF 保留');

console.log(failures === 0 ? '\n全部通过' : `\n${failures} 项失败`);
process.exit(failures === 0 ? 0 : 1);
