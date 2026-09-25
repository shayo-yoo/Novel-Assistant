import { NovelConfig } from '../types';

/**
 * 标题行检测器：判断一行是否属于“标题行”（章节标题 / 序章 / 楔子等）。
 * 规则可配置，见规划文档 3.3.3。
 */

const DIVIDER_PATTERN = /^[-*_]{3,}$/;

export class TitleDetector {
  constructor(private readonly config: NovelConfig) {}

  public isTitleLine(line: string): boolean {
    const trimmed = line.trim();
    if (!trimmed) {
      return false;
    }
    return this.config.titlePatterns.some(p => {
      try {
        return new RegExp(p).test(trimmed);
      } catch {
        return false;
      }
    });
  }

  public isDivider(line: string): boolean {
    return DIVIDER_PATTERN.test(line.trim());
  }

  /** 引用行（> 开头） */
  public isQuoteLine(line: string): boolean {
    return /^\s*>/.test(line);
  }

  /** 列表行（- * 数字. 开头） */
  public isListLine(line: string): boolean {
    return /^\s*([-*+•]|\d+[.、）)])\s/.test(line.trimStart());
  }

  /** 该行是否应跳过缩进 */
  public shouldSkipIndent(line: string): boolean {
    if (!line.trim()) {
      return true;
    }
    if (this.config.skipTitleIndent && this.isTitleLine(line)) {
      return true;
    }
    if (this.isDivider(line)) {
      return true;
    }
    if (this.config.skipQuoteIndent && this.isQuoteLine(line)) {
      return true;
    }
    if (this.config.skipListIndent && this.isListLine(line)) {
      return true;
    }
    return false;
  }
}
