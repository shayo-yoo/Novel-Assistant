import { CountMode, NovelConfig, CustomCountMode } from '../types';
import { isCjk, isCjkPunct, isWhitespace, ASCII_WORD_REGEX, ASCII_DIGIT_REGEX } from '../utils/unicode';

/**
 * 字数统计引擎
 * 每个模式实现 CountMode 接口，通过注册表统一调度。
 * 详细算法遵循《小说写作辅助扩展功能规划.md》3.1.5 节。
 */

const cjkTest = (ch: string) => isCjk(ch);
const cjkPunctTest = (ch: string) => isCjk(ch) || isCjkPunct(ch);
const nonWsTest = (ch: string) => !isWhitespace(ch);

/** 全字符模式：所有 Unicode 码点各计 1 */
const allMode: CountMode = {
  id: 'all',
  name: '全字符模式',
  count(text) {
    return [...text].length;
  }
};

/** 仅中文模式：仅 CJK 汉字 */
const cjkMode: CountMode = {
  id: 'cjk',
  name: '仅中文模式',
  count(text) {
    return [...text].filter(cjkTest).length;
  }
};

/** 中文加标点模式：CJK 汉字 + 中文常用标点 */
const cjkPunctMode: CountMode = {
  id: 'cjk_punct',
  name: '中文加标点模式',
  count(text) {
    return [...text].filter(cjkPunctTest).length;
  }
};

/** 非空白字符模式：排除所有 Unicode 空白 */
const nonWhitespaceMode: CountMode = {
  id: 'non_whitespace',
  name: '非空白字符模式',
  count(text) {
    return [...text].filter(nonWsTest).length;
  }
};

/** 起点模式：与 non_whitespace 一致 */
const qidianMode: CountMode = {
  id: 'qidian',
  name: '起点模式',
  count(text) {
    return [...text].filter(nonWsTest).length;
  }
};

/** 番茄模式：非空白；ASCII 字母序列计 1 词，数字序列计 1 词，其余码点各计 1 */
const fanqieMode: CountMode = {
  id: 'fanqie',
  name: '番茄模式',
  count(text) {
    const chars = [...text];
    let total = 0;
    for (let i = 0; i < chars.length; i++) {
      const ch = chars[i];
      if (isWhitespace(ch)) {
        continue;
      }
      if (/[A-Za-z]/.test(ch)) {
        while (i + 1 < chars.length && /[A-Za-z]/.test(chars[i + 1])) {
          i++;
        }
        total += 1;
      } else if (/\d/.test(ch)) {
        while (i + 1 < chars.length && /\d/.test(chars[i + 1])) {
          i++;
        }
        total += 1;
      } else {
        total += 1;
      }
    }
    return total;
  }
};

/** 中英混合模式：汉字/中文标点各 1，英文词 1，数字串 1，其他符号 1，空白 0 */
const mixedMode: CountMode = {
  id: 'mixed',
  name: '中英混合模式',
  count(text) {
    const chars = [...text];
    let total = 0;
    for (let i = 0; i < chars.length; i++) {
      const ch = chars[i];
      if (isWhitespace(ch)) {
        continue;
      }
      if (isCjk(ch) || isCjkPunct(ch)) {
        total += 1;
      } else if (/[A-Za-z]/.test(ch)) {
        while (i + 1 < chars.length && /[A-Za-z]/.test(chars[i + 1])) {
          i++;
        }
        total += 1;
      } else if (/\d/.test(ch)) {
        while (i + 1 < chars.length && /\d/.test(chars[i + 1])) {
          i++;
        }
        total += 1;
      } else {
        total += 1;
      }
    }
    return total;
  }
};

/** 自定义正则模式 */
function customRegexMode(id: string, name: string, regexSource: string, countBy: 'chars' | 'matches'): CountMode {
  return {
    id,
    name,
    count(text) {
      let re: RegExp;
      try {
        re = new RegExp(regexSource, 'g');
      } catch {
        // 正则无效：按非空白字符兜底
        return [...text].filter(nonWsTest).length;
      }
      let sum = 0;
      for (const m of text.matchAll(re)) {
        if (countBy === 'matches') {
          sum += 1;
        } else {
          sum += m[0].length;
        }
      }
      return sum;
    }
  };
}

/** 自定义权重模式 */
function customWeightMode(id: string, name: string, rules: NonNullable<CustomCountMode['rules']>): CountMode {
  const getWeight = (type: NonNullable<CustomCountMode['rules']>[number]['type']): number => {
    const rule = rules.find(r => r.type === type);
    return rule ? rule.weight : 1;
  };
  const wCjk = getWeight('cjk');
  const wPunct = getWeight('punctuation');
  const wWs = getWeight('whitespace');
  const wWord = getWeight('ascii_word');
  const wDigit = getWeight('digit_sequence');
  const wOther = getWeight('other');
  return {
    id,
    name,
    count(text) {
      const chars = [...text];
      let total = 0;
      for (let i = 0; i < chars.length; i++) {
        const ch = chars[i];
        if (isWhitespace(ch)) {
          total += wWs;
        } else if (isCjk(ch)) {
          total += wCjk;
        } else if (isCjkPunct(ch)) {
          total += wPunct;
        } else if (/[A-Za-z]/.test(ch)) {
          while (i + 1 < chars.length && /[A-Za-z]/.test(chars[i + 1])) {
            i++;
          }
          total += wWord;
        } else if (/\d/.test(ch)) {
          while (i + 1 < chars.length && /\d/.test(chars[i + 1])) {
            i++;
          }
          total += wDigit;
        } else {
          total += wOther;
        }
      }
      return total;
    }
  };
}

/** 内置模式注册表 */
export const BUILTIN_MODES: CountMode[] = [
  allMode,
  cjkMode,
  cjkPunctMode,
  nonWhitespaceMode,
  qidianMode,
  fanqieMode,
  mixedMode
];

export const BUILTIN_MODE_NAMES: Record<string, string> = Object.fromEntries(
  BUILTIN_MODES.map(m => [m.id, m.name])
);

/**
 * 根据模式 id 与工作区配置构建计数模式。
 * 支持内置模式与用户自定义模式（custom_regex / custom_weight）。
 */
export function resolveCountMode(modeId: string, config?: NovelConfig): CountMode {
  const builtin = BUILTIN_MODES.find(m => m.id === modeId);
  if (builtin) {
    return builtin;
  }
  if (config?.countModes) {
    const custom = config.countModes[modeId];
    if (custom) {
      if (custom.type === 'custom_regex' && custom.regex) {
        return customRegexMode(modeId, modeId, custom.regex, custom.countBy ?? 'chars');
      }
      if (custom.type === 'custom_weight' && custom.rules && custom.rules.length > 0) {
        return customWeightMode(modeId, modeId, custom.rules);
      }
    }
  }
  // 兜底：非空白字符模式
  return nonWhitespaceMode;
}

/** 便捷函数：统计指定模式下的字数 */
export function countText(text: string, modeId: string, config?: NovelConfig): number {
  return resolveCountMode(modeId, config).count(text);
}

/** 全部可用模式（含工作区自定义模式）的展示列表 */
export function listCountModes(config?: NovelConfig): { id: string; name: string }[] {
  const list = BUILTIN_MODES.map(m => ({ id: m.id, name: m.name }));
  if (config?.countModes) {
    for (const key of Object.keys(config.countModes)) {
      if (!list.some(m => m.id === key)) {
        list.push({ id: key, name: key });
      }
    }
  }
  return list;
}

/** 计数排除：标题行 / 作者备注 / 分隔线 */
export function countWithExcludes(text: string, modeId: string, config?: NovelConfig): number {
  if (!config?.countExcludes) {
    return countText(text, modeId, config);
  }
  const excludes = config.countExcludes;
  const needsLineWork = excludes.skipTitleLines || excludes.skipAuthorNotes || excludes.skipDividers;
  if (!needsLineWork) {
    return countText(text, modeId, config);
  }

  const lines = text.split(/\r?\n/);
  let body = '';
  for (const line of lines) {
    const trimmed = line.trim();
    if (excludes.skipTitleLines && config.titlePatterns && config.titlePatterns.some(p => new RegExp(p).test(trimmed))) {
      continue;
    }
    if (excludes.skipDividers && /^[-*_]{3,}$/.test(trimmed)) {
      continue;
    }
    if (excludes.skipAuthorNotes) {
      const idx = line.indexOf('【作者的话】');
      if (idx >= 0) {
        body += line.slice(0, idx) + '\n';
        continue;
      }
    }
    body += line + '\n';
  }
  return countText(body, modeId, config);
}

/** 文本中非粘贴新增码点数（用于输入速度） */
export function countInsertedChars(inserted: string): number {
  return [...inserted].filter(nonWsTest).length;
}

export { ASCII_WORD_REGEX, ASCII_DIGIT_REGEX };
