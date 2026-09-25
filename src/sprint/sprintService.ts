import * as vscode from 'vscode';
import { SprintConfig, SprintState } from '../types';
import { FocusWatcher } from '../timer/focusWatcher';
import { StatsService } from '../stats/statsService';
import { localIso, formatCountdown } from '../utils/text';

/**
 * 写作冲刺服务（规划文档 3.13）
 * 短时间高强度写作：可选时长（5/10/15/30/60 分钟）与目标字数。
 * 与番茄钟区别：不强制休息，更强调速度。
 */

export interface SprintSnapshot {
  state: SprintState;
  remainingSeconds: number;
  totalSeconds: number;
  targetWords: number;
  currentWords: number;
  paused: boolean;
}

export class SprintService implements vscode.Disposable {
  private state: SprintState = 'idle';
  private remainingSeconds = 0;
  private totalSeconds = 0;
  private targetWords = 0;
  private paused = false;
  private startWords = 0;
  private startTime?: Date;
  private activeSeconds = 0;
  private timer?: NodeJS.Timeout;
  private readonly emitter = new vscode.EventEmitter<SprintSnapshot>();
  public readonly onDidChange = this.emitter.event;

  constructor(
    private readonly focusWatcher: FocusWatcher,
    private readonly statsService: StatsService,
    private readonly getConfig: () => Promise<SprintConfig>
  ) {
    this.timer = setInterval(() => this.tick(), 1000);
  }

  public isRunning(): boolean {
    return this.state !== 'idle';
  }

  public getSnapshot(): SprintSnapshot {
    return {
      state: this.state,
      remainingSeconds: this.remainingSeconds,
      totalSeconds: this.totalSeconds,
      targetWords: this.targetWords,
      currentWords: this.getCurrentWords(),
      paused: this.paused
    };
  }

  public async start(minutes: number, targetWords: number): Promise<void> {
    const config = await this.getConfig();
    this.state = 'running';
    this.totalSeconds = minutes * 60;
    this.remainingSeconds = this.totalSeconds;
    this.targetWords = targetWords > 0 ? targetWords : config.defaultTargetWords;
    this.paused = false;
    this.activeSeconds = 0;
    this.startWords = (await this.statsService.getToday()).addedWords;
    this.startTime = new Date();
    this.emit();
    vscode.window.showInformationMessage(`⏱ 写作冲刺开始：${minutes} 分钟，目标 ${this.targetWords} 字。`);
  }

  public togglePause(): void {
    if (this.state === 'idle') {
      return;
    }
    this.paused = !this.paused;
    this.emit();
  }

  /** 失焦恢复后自动继续 */
  public resumeIfPaused(): void {
    if (this.state !== 'idle' && this.paused) {
      this.paused = false;
      this.emit();
    }
  }

  public stop(): void {
    this.state = 'idle';
    this.remainingSeconds = 0;
    this.paused = false;
    this.emit();
  }

  private getCurrentWords(): number {
    return 0; // 由外部通过今日新增差值呈现
  }

  private tick(): void {
    if (this.state === 'idle' || this.paused) {
      return;
    }
    if (!this.focusWatcher.focused) {
      this.paused = true;
      this.emit();
      return;
    }
    this.remainingSeconds--;
    this.activeSeconds++;
    if (this.remainingSeconds <= 0) {
      void this.complete();
      return;
    }
    if (this.remainingSeconds % 30 === 0 || this.remainingSeconds <= 10) {
      this.emit();
    }
  }

  private async complete(): Promise<void> {
    const endWords = (await this.statsService.getToday()).addedWords;
    const words = Math.max(endWords - this.startWords, 0);
    const speed = this.activeSeconds > 0 ? (words / this.activeSeconds) * 60 : 0;
    const reached = this.targetWords > 0 ? words >= this.targetWords : true;

    void this.statsService.completeSprint({
      start: this.startTime ? localIso(this.startTime) : localIso(),
      end: localIso(),
      minutes: Math.round(this.totalSeconds / 60),
      words,
      speed: Math.round(speed * 100) / 100,
      targetWords: this.targetWords,
      reached
    });

    const message = `⚡ 冲刺结束：${words} 字，速度 ${Math.round(speed)} 字/分，${reached ? '目标达成 🎉' : `距目标还差 ${Math.max(this.targetWords - words, 0)} 字`}`;
    vscode.window.showInformationMessage(message);

    this.state = 'idle';
    this.emit();
  }

  public getStatusText(): string {
    if (this.state === 'idle') {
      return '⚡ 冲刺空闲';
    }
    const mark = this.paused ? ' ⏸' : '';
    return `⚡ 冲刺 ${formatCountdown(Math.max(this.remainingSeconds, 0))}${mark}`;
  }

  private emit(): void {
    this.emitter.fire(this.getSnapshot());
  }

  public dispose(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    this.emitter.dispose();
  }
}
