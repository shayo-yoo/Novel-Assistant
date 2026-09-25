import * as vscode from 'vscode';
import { StatsFile, DailyStats, DocumentStats, PomodoroRecord, SprintRecord, SessionRecord } from '../types';
import { ConfigService, emptyStats } from '../config/configService';
import { TimerPersistence } from '../timer/timerService';
import { localDateKey, localIso, basename } from '../utils/text';

/**
 * 统计服务（规划文档 3.2.6 / 5.2）
 *
 * - 按工作区保存到 .vscode/novel-assistant-stats.json。
 * - 按日期存储每日汇总；按文档存储文档累计；记录会话/番茄/冲刺历史。
 * - 高频累计采用“增量缓冲 + 定期落盘”，历史记录直接写入。
 */

function zeroDaily(): DailyStats {
  return { words: 0, addedWords: 0, activeSeconds: 0, inputSeconds: 0, pomodoros: 0, sprints: 0, speed: 0 };
}

export class StatsService implements TimerPersistence {
  private pendingDaily: Record<string, Partial<DailyStats>> = {};
  private pendingDocs: Record<string, number> = {};
  private writeChain: Promise<void> = Promise.resolve();
  private flushTimer?: NodeJS.Timeout;

  constructor(private readonly configService: ConfigService) {
    this.flushTimer = setInterval(() => void this.flushToDisk(), 60_000);
  }

  /** 串行化文件写入，避免并发覆盖 */
  private enqueue(task: () => Promise<void>): Promise<void> {
    this.writeChain = this.writeChain.then(task).catch(() => undefined);
    return this.writeChain;
  }

  // ===== TimerPersistence 实现 =====

  public async flush(activeSeconds: number, dateKey: string, docSeconds: { [fileName: string]: number }): Promise<void> {
    const day = this.pendingDaily[dateKey] ?? zeroDaily();
    day.activeSeconds = (day.activeSeconds ?? 0) + activeSeconds;
    this.pendingDaily[dateKey] = day;
    for (const [name, sec] of Object.entries(docSeconds)) {
      this.pendingDocs[name] = (this.pendingDocs[name] ?? 0) + sec;
    }
    if (Object.keys(this.pendingDaily).length > 0) {
      await this.flushToDisk();
    }
  }

  // ===== 增量记录 =====

  public recordAddedWords(words: number, dateKey = localDateKey()): void {
    if (words <= 0) {
      return;
    }
    const day = this.pendingDaily[dateKey] ?? zeroDaily();
    day.words = (day.words ?? 0) + words;
    day.addedWords = (day.addedWords ?? 0) + words;
    this.pendingDaily[dateKey] = day;
  }

  public recordInputSeconds(seconds: number, dateKey = localDateKey()): void {
    if (seconds <= 0) {
      return;
    }
    const day = this.pendingDaily[dateKey] ?? zeroDaily();
    day.inputSeconds = (day.inputSeconds ?? 0) + seconds;
    this.pendingDaily[dateKey] = day;
  }

  // ===== 落盘 =====

  public async flushToDisk(): Promise<void> {
    const folder = await this.configService.getCurrentFolder();
    if (!folder) {
      return;
    }
    const pendingDaily = this.pendingDaily;
    const pendingDocs = this.pendingDocs;
    this.pendingDaily = {};
    this.pendingDocs = {};
    await this.enqueue(async () => {
      const stats = await this.configService.getStatsFile(folder);
      for (const [dateKey, delta] of Object.entries(pendingDaily)) {
        const day = stats.daily[dateKey] ?? zeroDaily();
        day.words += delta.words ?? 0;
        day.addedWords += delta.addedWords ?? 0;
        day.activeSeconds += delta.activeSeconds ?? 0;
        day.inputSeconds += delta.inputSeconds ?? 0;
        day.pomodoros += delta.pomodoros ?? 0;
        day.sprints += delta.sprints ?? 0;
        day.speed = day.inputSeconds > 0 ? (day.addedWords / day.inputSeconds) * 60 : 0;
        stats.daily[dateKey] = day;
      }
      for (const [name, sec] of Object.entries(pendingDocs)) {
        const doc = stats.documents[name] ?? { words: 0, activeSeconds: 0, lastEdited: '' };
        doc.activeSeconds += sec;
        doc.lastEdited = doc.lastEdited || localIso();
        stats.documents[name] = doc;
      }
      await this.configService.writeStatsFile(stats, folder);
    });
  }

  // ===== 文档字数 =====

  /** 记录某文档当前字数与最后编辑时间 */
  public recordDocumentWords(docName: string, words: number): void {
    void this.enqueue(async () => {
      const folder = await this.configService.getCurrentFolder();
      if (!folder) {
        return;
      }
      const stats = await this.configService.getStatsFile(folder);
      const doc = stats.documents[docName] ?? { words: 0, activeSeconds: 0, lastEdited: '' };
      doc.words = words;
      doc.lastEdited = localIso();
      stats.documents[docName] = doc;
      await this.configService.writeStatsFile(stats, folder);
    });
  }

  // ===== 历史记录 =====

  public completePomodoro(record: PomodoroRecord): Promise<void> {
    const dateKey = localDateKey(new Date(record.end));
    const day = this.pendingDaily[dateKey] ?? zeroDaily();
    day.pomodoros = (day.pomodoros ?? 0) + 1;
    this.pendingDaily[dateKey] = day;
    return this.enqueue(async () => {
      const folder = await this.configService.getCurrentFolder();
      if (!folder) {
        return;
      }
      const stats = await this.configService.getStatsFile(folder);
      stats.pomodoroHistory.push(record);
      await this.configService.writeStatsFile(stats, folder);
    });
  }

  public completeSprint(record: SprintRecord): Promise<void> {
    const dateKey = localDateKey(new Date(record.end));
    const day = this.pendingDaily[dateKey] ?? zeroDaily();
    day.sprints = (day.sprints ?? 0) + 1;
    this.pendingDaily[dateKey] = day;
    return this.enqueue(async () => {
      const folder = await this.configService.getCurrentFolder();
      if (!folder) {
        return;
      }
      const stats = await this.configService.getStatsFile(folder);
      stats.sprintHistory.push(record);
      await this.configService.writeStatsFile(stats, folder);
    });
  }

  public addSession(record: SessionRecord): Promise<void> {
    return this.enqueue(async () => {
      const folder = await this.configService.getCurrentFolder();
      if (!folder) {
        return;
      }
      const stats = await this.configService.getStatsFile(folder);
      stats.sessions.push(record);
      if (stats.sessions.length > 500) {
        stats.sessions = stats.sessions.slice(-500);
      }
      await this.configService.writeStatsFile(stats, folder);
    });
  }

  // ===== 读取 =====

  public async getToday(dateKey = localDateKey(), folder?: vscode.WorkspaceFolder): Promise<DailyStats> {
    const stats = await this.configService.getStatsFile(folder);
    const merged = { ...zeroDaily(), ...(stats.daily[dateKey] ?? {}) };
    const pending = this.pendingDaily[dateKey];
    if (pending) {
      merged.words += pending.words ?? 0;
      merged.addedWords += pending.addedWords ?? 0;
      merged.activeSeconds += pending.activeSeconds ?? 0;
      merged.inputSeconds += pending.inputSeconds ?? 0;
      merged.pomodoros += pending.pomodoros ?? 0;
      merged.sprints += pending.sprints ?? 0;
    }
    return merged;
  }

  public getDay(dateKey: string): Promise<DailyStats> {
    return this.getToday(dateKey);
  }

  /** 最近 n 天（含今天）每日统计，用于热力图 */
  public async getRangeDays(days: number): Promise<Record<string, DailyStats>> {
    const folder = await this.configService.getCurrentFolder();
    if (!folder) {
      return {};
    }
    const stats = await this.configService.getStatsFile(folder);
    const result: Record<string, DailyStats> = {};
    const today = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
      const key = localDateKey(d);
      result[key] = stats.daily[key] ?? zeroDaily();
    }
    // 合并今天的未落盘增量
    const todayKey = localDateKey();
    const todayStats = await this.getToday(todayKey, folder);
    result[todayKey] = todayStats;
    return result;
  }

  /** 周期汇总（如本周/本月）：创作秒数与新增字数 */
  public async getPeriodTotals(startDate: Date, endDate: Date): Promise<{ activeSeconds: number; addedWords: number }> {
    const folder = await this.configService.getCurrentFolder();
    if (!folder) {
      return { activeSeconds: 0, addedWords: 0 };
    }
    const stats = await this.configService.getStatsFile(folder);
    let activeSeconds = 0;
    let addedWords = 0;
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const key = localDateKey(d);
      const day = stats.daily[key] ?? zeroDaily();
      activeSeconds += day.activeSeconds;
      addedWords += day.addedWords;
    }
    // 合并今天的未落盘增量
    const todayKey = localDateKey();
    const todayStats = await this.getToday(todayKey, folder);
    const todayDate = new Date();
    if (startDate <= todayDate && todayDate <= endDate) {
      activeSeconds += todayStats.activeSeconds;
      addedWords += todayStats.addedWords;
    }
    return { activeSeconds, addedWords };
  }

  /** 本周（周一起）汇总 */
  public getWeekTotals(): Promise<{ activeSeconds: number; addedWords: number }> {
    const now = new Date();
    const day = now.getDay() === 0 ? 6 : now.getDay() - 1; // 周一起始
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day);
    return this.getPeriodTotals(monday, now);
  }

  /** 本月汇总 */
  public getMonthTotals(): Promise<{ activeSeconds: number; addedWords: number }> {
    const now = new Date();
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return this.getPeriodTotals(first, last);
  }

  public async getDocuments(folder?: vscode.WorkspaceFolder): Promise<Record<string, DocumentStats>> {
    const stats = await this.configService.getStatsFile(folder);
    return stats.documents;
  }

  public async getPomodoroHistory(): Promise<PomodoroRecord[]> {
    const stats = await this.configService.getStatsFile();
    return stats.pomodoroHistory;
  }

  public async getSprintHistory(): Promise<SprintRecord[]> {
    const stats = await this.configService.getStatsFile();
    return stats.sprintHistory;
  }

  public async getSessions(): Promise<SessionRecord[]> {
    const stats = await this.configService.getStatsFile();
    return stats.sessions;
  }

  public dispose(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = undefined;
    }
    void this.flushToDisk();
  }
}

/** 供其他模块便捷使用 */
export function docNameFromUri(uri: vscode.Uri): string {
  return basename(uri.fsPath);
}

export { emptyStats };
