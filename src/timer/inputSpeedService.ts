import { countInsertedChars } from '../count/countEngine';

/**
 * 输入速度服务（规划文档 3.2.4）
 *
 * 规则：
 * - 只统计非粘贴新增码点（删除不计、光标移动不计）。
 * - 粘贴判定：单次变更插入字符数 > pasteThresholdChars，且距上次输入 < pasteIntervalMs。
 * - 输入法组合期间不计数，直到文本提交到文档（事件本身就是提交后）。
 * - 提供瞬时（60s）、短期（5min，默认）、会话平均、今日平均四种速度。
 */

interface InputEvent {
  time: number;
  words: number;
}

export interface InputSpeedConfig {
  pasteThresholdChars: number;
  pasteIntervalMs: number;
}

export class InputSpeedService {
  private events: InputEvent[] = [];
  private sessionWords = 0;
  private todayWords = 0;
  private sessionInputSeconds = 0;
  private todayInputSeconds = 0;
  private lastEventTime = 0;
  private lastActivityAt = Date.now();
  private config: InputSpeedConfig = { pasteThresholdChars: 30, pasteIntervalMs: 500 };
  private sessionStart = Date.now();

  public setConfig(config: InputSpeedConfig): void {
    this.config = config;
  }

  /** 文档变更事件：统计非粘贴新增字符 */
  public recordChange(insertedText: string, now = Date.now()): void {
    const insertedNonWs = countInsertedChars(insertedText);
    if (insertedNonWs <= 0) {
      return;
    }
    const isPaste = insertedNonWs > this.config.pasteThresholdChars &&
      now - this.lastEventTime < this.config.pasteIntervalMs;
    this.lastEventTime = now;
    this.lastActivityAt = now;
    if (isPaste) {
      return;
    }
    this.sessionWords += insertedNonWs;
    this.todayWords += insertedNonWs;
    this.events.push({ time: now, words: this.sessionWords });
    this.prune(now, 5 * 60 * 1000);
  }

  /** 每秒心跳：若本秒内发生非粘贴输入，计入有效输入秒 */
  public tick(now = Date.now()): void {
    if (this.events.length > 0 && now - this.events[this.events.length - 1].time < 1000) {
      this.sessionInputSeconds++;
      this.todayInputSeconds++;
    }
  }

  public recordActivity(): void {
    this.lastActivityAt = Date.now();
  }

  public getLastActivityAt(): number {
    return this.lastActivityAt;
  }

  public resetSession(): void {
    this.sessionWords = 0;
    this.sessionInputSeconds = 0;
    this.sessionStart = Date.now();
    this.events = [];
  }

  /** 计算窗口内速度（字/分钟） */
  private windowSpeed(windowMs: number, now = Date.now()): number {
    this.prune(now, windowMs);
    if (this.events.length < 2) {
      return 0;
    }
    const first = this.events[0];
    const last = this.events[this.events.length - 1];
    const words = Math.max(last.words - first.words, 0);
    const seconds = this.countInputSeconds(now - windowMs, now);
    if (seconds <= 0) {
      return 0;
    }
    return (words / seconds) * 60;
  }

  /** 统计窗口内发生输入的不同秒数 */
  private countInputSeconds(from: number, to: number): number {
    const set = new Set<number>();
    for (const e of this.events) {
      if (e.time >= from && e.time <= to) {
        set.add(Math.floor(e.time / 1000));
      }
    }
    return set.size;
  }

  /** 瞬时速度：最近 60 秒 */
  public getInstantSpeed(now = Date.now()): number {
    return this.windowSpeed(60 * 1000, now);
  }

  /** 短期速度：最近 5 分钟（默认显示） */
  public getShortTermSpeed(now = Date.now()): number {
    return this.windowSpeed(5 * 60 * 1000, now);
  }

  /** 会话平均速度 */
  public getSessionAverageSpeed(): number {
    if (this.sessionInputSeconds <= 0) {
      return 0;
    }
    return (this.sessionWords / this.sessionInputSeconds) * 60;
  }

  /** 今日平均速度 */
  public getTodayAverageSpeed(): number {
    if (this.todayInputSeconds <= 0) {
      return 0;
    }
    return (this.todayWords / this.todayInputSeconds) * 60;
  }

  public getSessionWords(): number {
    return this.sessionWords;
  }

  public getTodayWords(): number {
    return this.todayWords;
  }

  public getTodayInputSeconds(): number {
    return this.todayInputSeconds;
  }

  /** 今日新增字数（供统计服务累计，调用后清零今日累计由外部决定） */
  public consumeTodayWords(): number {
    const w = this.todayWords;
    return w;
  }

  private prune(now: number, windowMs: number): void {
    const cutoff = now - windowMs;
    this.events = this.events.filter(e => e.time >= cutoff);
  }

  public dispose(): void {
    this.events = [];
  }
}
