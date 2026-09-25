import * as vscode from 'vscode';
import { PomodoroConfig, PomodoroMode } from '../types';
import { FocusWatcher } from '../timer/focusWatcher';
import { StatsService } from '../stats/statsService';
import { InputSpeedService } from '../timer/inputSpeedService';
import { localIso, formatCountdown } from '../utils/text';

/**
 * 番茄钟服务（规划文档 3.6）
 *
 * - 仅窗口活动时倒计时，失焦自动暂停；重新聚焦后按 autoContinue 配置决定是否继续。
 * - 工作 -> 短休/长休 循环；每 cyclesBeforeLongBreak 个工作番茄后长休。
 * - 结束显示本次报告：专注时长、新增字数、输入速度、是否达标。
 * - 中断时保存已专注时间（不计完整番茄）。
 * - 记录历史与今日番茄数（通过 StatsService）。
 */

export interface PomodoroSnapshot {
  mode: PomodoroMode;
  remainingSeconds: number;
  totalSeconds: number;
  cycleCount: number;
  paused: boolean;
}

export class PomodoroService implements vscode.Disposable {
  private mode: PomodoroMode = 'idle';
  private remainingSeconds = 0;
  private totalSeconds = 0;
  private cycleCount = 0;
  private paused = false;
  private timer?: NodeJS.Timeout;
  private activeSeconds = 0;
  private startWords = 0;
  private startTime?: Date;
  private config: PomodoroConfig | undefined;
  private readonly emitter = new vscode.EventEmitter<PomodoroSnapshot>();
  public readonly onDidChange = this.emitter.event;

  constructor(
    private readonly focusWatcher: FocusWatcher,
    private readonly statsService: StatsService,
    private readonly inputSpeed: InputSpeedService,
    private readonly getConfig: () => Promise<PomodoroConfig>,
    private readonly getDailyWordsGoal: () => Promise<number>
  ) {
    this.timer = setInterval(() => this.tick(), 1000);
  }

  public isRunning(): boolean {
    return this.mode !== 'idle';
  }

  public getMode(): PomodoroMode {
    return this.mode;
  }

  public getSnapshot(): PomodoroSnapshot {
    return {
      mode: this.mode,
      remainingSeconds: this.remainingSeconds,
      totalSeconds: this.totalSeconds,
      cycleCount: this.cycleCount,
      paused: this.paused
    };
  }

  /** 开始（从工作模式）；空闲时进入工作，休息时立即进入休息 */
  public async start(): Promise<void> {
    this.config = await this.getConfig();
    if (this.mode === 'idle') {
      this.mode = 'work';
      this.cycleCount = 0;
      this.remainingSeconds = this.config.workMinutes * 60;
      this.totalSeconds = this.remainingSeconds;
      this.activeSeconds = 0;
      this.startWords = (await this.statsService.getToday()).addedWords;
      this.startTime = new Date();
      this.paused = false;
    } else if (this.paused) {
      this.paused = false;
    } else {
      // 已运行：暂停/继续
      this.paused = true;
    }
    this.emit();
  }

  /** 手动暂停/继续 */
  public togglePause(): void {
    if (this.mode === 'idle') {
      return;
    }
    this.paused = !this.paused;
    this.emit();
  }

  /** 失焦恢复后按配置自动继续 */
  public resumeIfPaused(): void {
    if (this.mode !== 'idle' && this.paused) {
      this.paused = false;
      this.emit();
    }
  }

  public pause(): void {
    if (this.mode !== 'idle' && !this.paused) {
      this.paused = true;
      this.emit();
    }
  }

  /** 停止（中断）。save：是否保存已专注时间（不计完整番茄） */
  public async stop(save = true): Promise<void> {
    const mode = this.mode;
    const activeSeconds = this.activeSeconds;
    this.mode = 'idle';
    this.remainingSeconds = 0;
    this.totalSeconds = 0;
    this.activeSeconds = 0;
    this.paused = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    if (save && activeSeconds > 30 && mode === 'work') {
      // 中断也把已专注时间计入创作时间（通过 stats 的 activeSeconds 由 TimerService 独立累计，
      // 这里仅提示）
      vscode.window.showInformationMessage(`番茄已中断，已专注 ${Math.round(activeSeconds / 60)} 分钟（未计入完整番茄）。`);
    }
    this.emit();
    // 重新启动心跳（若被 stop 清理）
    if (!this.timer) {
      this.timer = setInterval(() => this.tick(), 1000);
    }
  }

  private tick(): void {
    if (this.mode === 'idle' || this.paused) {
      return;
    }
    if (!this.focusWatcher.focused) {
      // 失焦自动暂停
      this.paused = true;
      this.emit();
      return;
    }
    this.remainingSeconds--;
    this.activeSeconds++;
    if (this.remainingSeconds <= 0) {
      void this.complete();
    } else {
      // 每 30 秒更新一次状态栏
      if (this.remainingSeconds % 30 === 0 || this.remainingSeconds <= 10) {
        this.emit();
      }
    }
  }

  private async complete(): Promise<void> {
    this.config = this.config ?? (await this.getConfig());
    const finishedMode = this.mode;
    const endWords = (await this.statsService.getToday()).addedWords;
    const words = Math.max(endWords - this.startWords, 0);
    const speed = this.activeSeconds > 0 ? (words / this.activeSeconds) * 60 : 0;

    if (finishedMode === 'work') {
      this.cycleCount++;
      const dailyGoal = await this.getDailyWordsGoal();
      const reached = dailyGoal > 0 ? words >= dailyGoal : false;
      void this.statsService.completePomodoro({
        start: this.startTime ? localIso(this.startTime) : localIso(),
        end: localIso(),
        words,
        speed: Math.round(speed * 100) / 100,
        reached
      });
      const summary = `🍅 番茄完成：专注 ${Math.round(this.activeSeconds / 60)} 分钟，新增 ${words} 字，速度 ${Math.round(speed)} 字/分`;
      vscode.window.showInformationMessage(summary);

      const needLongBreak = this.cycleCount % this.config.cyclesBeforeLongBreak === 0;
      this.mode = needLongBreak ? 'longBreak' : 'shortBreak';
    } else {
      vscode.window.showInformationMessage(`休息结束，开始新一轮番茄吧。`);
      this.mode = 'work';
    }

    const nextSeconds =
      this.mode === 'shortBreak'
        ? this.config.shortBreakMinutes * 60
        : this.mode === 'longBreak'
          ? this.config.longBreakMinutes * 60
          : this.config.workMinutes * 60;
    this.remainingSeconds = nextSeconds;
    this.totalSeconds = nextSeconds;
    this.activeSeconds = 0;
    this.startWords = (await this.statsService.getToday()).addedWords;
    this.startTime = new Date();
    this.paused = false;

    if (!this.config.autoContinue) {
      const answer = await vscode.window.showInformationMessage(
        `进入${this.mode === 'shortBreak' ? '短休' : this.mode === 'longBreak' ? '长休' : '工作'}阶段，是否开始？`,
        '开始',
        '稍后'
      );
      if (answer !== '开始') {
        this.paused = true;
      }
    }
    this.emit();
  }

  public getStatusText(): string {
    if (this.mode === 'idle') {
      return '🍅 空闲';
    }
    const name =
      this.mode === 'work' ? '工作' : this.mode === 'shortBreak' ? '短休' : '长休';
    const pauseMark = this.paused ? ' ⏸' : '';
    return `🍅 ${name} ${formatCountdown(Math.max(this.remainingSeconds, 0))}${pauseMark}`;
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
