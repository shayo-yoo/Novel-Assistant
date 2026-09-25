import * as vscode from 'vscode';
import { FocusWatcher } from './focusWatcher';
import { InputSpeedService } from './inputSpeedService';
import { localDateKey } from '../utils/text';

/**
 * 创作时间服务（规划文档 2.5 / 3.2）
 *
 * 规则：
 * - 仅窗口活动（focusWatcher.focused）时每秒累计。
 * - 失焦立即暂停。
 * - 空闲但未失焦默认不暂停（用户可能正在思考）。
 * - 可配置“空闲暂停创作时间”，空闲阈值默认 120 秒。
 * - 按工作区、按日期、按文档分别累计。
 * - 跨天按本地时区切分。
 */

export interface TimerPersistence {
  /** 将一段时间内的累计秒数写入统计（deltas 为自上次刷新以来的增量） */
  flush(activeSeconds: number, dateKey: string, documentSeconds: { [fileName: string]: number }): Promise<void>;
}

export interface TimerConfig {
  idleThresholdSeconds: number;
  pauseCreativeTimeWhenIdle: boolean;
}

export class TimerService {
  private activeSecondsToday = 0;
  private sessionSeconds = 0;
  private documentSeconds = new Map<string, number>();
  private dateKey = localDateKey();
  private timer?: NodeJS.Timeout;
  private lastFlushAt = Date.now();
  private pendingFlush = 0;
  private config: TimerConfig = { idleThresholdSeconds: 120, pauseCreativeTimeWhenIdle: false };
  private manualPaused = false;

  constructor(
    private readonly focusWatcher: FocusWatcher,
    private readonly inputSpeed: InputSpeedService,
    private readonly persistence: TimerPersistence,
    private readonly getCurrentFolder: () => Promise<vscode.WorkspaceFolder | undefined>
  ) {
    this.timer = setInterval(() => this.tick(), 1000);
  }

  public setConfig(config: TimerConfig): void {
    this.config = config;
  }

  public setManualPaused(paused: boolean): void {
    this.manualPaused = paused;
  }

  public isManualPaused(): boolean {
    return this.manualPaused;
  }

  private tick(): void {
    const now = Date.now();
    const today = localDateKey();
    if (today !== this.dateKey) {
      // 跨天：先把昨天的累计刷新，再重置
      void this.flushToStats();
      this.dateKey = today;
      this.activeSecondsToday = 0;
      this.documentSeconds.clear();
    }

    const editor = vscode.window.activeTextEditor;
    // 仅当活动编辑器属于某个工作区根文件夹时计时
    const inWorkspace = !!editor && (
      vscode.workspace.getWorkspaceFolder(editor.document.uri) !== undefined
    );
    const canCount = this.focusWatcher.focused &&
      inWorkspace &&
      !this.manualPaused;

    // 空闲暂停
    let idlePaused = false;
    if (canCount && this.config.pauseCreativeTimeWhenIdle) {
      const idleMs = now - this.inputSpeed.getLastActivityAt();
      if (idleMs >= this.config.idleThresholdSeconds * 1000) {
        idlePaused = true;
      }
    }

    if (canCount && !idlePaused) {
      this.activeSecondsToday++;
      this.sessionSeconds++;
      const fileName = editor.document.fileName.split(/[\\/]/).pop() ?? 'unknown';
      this.documentSeconds.set(fileName, (this.documentSeconds.get(fileName) ?? 0) + 1);
      this.pendingFlush++;
    }

    this.inputSpeed.tick(now);

    // 每 60 秒或累计 300 秒刷新一次统计文件
    if (this.pendingFlush >= 300 || now - this.lastFlushAt >= 60_000) {
      void this.flushToStats();
    }
  }

  public async flushToStats(): Promise<void> {
    const activeSeconds = this.pendingFlush;
    if (activeSeconds <= 0) {
      return;
    }
    const docSeconds: { [fileName: string]: number } = {};
    for (const [name, seconds] of this.documentSeconds) {
      docSeconds[name] = seconds;
    }
    this.pendingFlush = 0;
    this.lastFlushAt = Date.now();
    // 仅当活动编辑器属于某个工作区时写入对应工作区统计
    const folder = await this.getCurrentFolder();
    if (folder) {
      await this.persistence.flush(activeSeconds, this.dateKey, docSeconds);
    }
  }

  public getTodayActiveSeconds(): number {
    return this.activeSecondsToday;
  }

  public getSessionSeconds(): number {
    return this.sessionSeconds;
  }

  public getDocumentSeconds(): Map<string, number> {
    return new Map(this.documentSeconds);
  }

  public dispose(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    void this.flushToStats();
  }
}
