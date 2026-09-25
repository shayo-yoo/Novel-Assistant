import { StatsService } from './statsService';
import { GoalConfig, DailyStats } from '../types';
import { localDateKey } from '../utils/text';

/**
 * 每日目标服务（规划文档 3.7.1）
 * 支持字数 / 时间 / 番茄数 / 有效输入秒四种目标。
 */

export interface GoalProgress {
  wordsPct: number;
  minutesPct: number;
  pomodoroPct: number;
  activeMinutesPct: number;
  overallPct: number;
  reached: boolean;
}

export class GoalService {
  constructor(private readonly statsService: StatsService) {}

  public async getTodayProgress(goals: GoalConfig): Promise<GoalProgress> {
    const today = await this.statsService.getToday();
    const wordsPct = this.pct(today.addedWords, goals.dailyWords);
    const minutesPct = this.pct(today.activeSeconds / 60, goals.dailyMinutes);
    const pomodoroPct = this.pct(today.pomodoros, goals.dailyPomodoros);
    const activeMinutesPct = this.pct(today.inputSeconds / 60, goals.dailyActiveMinutes);
    const reached = wordsPct >= 100;
    return {
      wordsPct,
      minutesPct,
      pomodoroPct,
      activeMinutesPct,
      overallPct: Math.round((wordsPct + minutesPct + pomodoroPct + activeMinutesPct) / 4),
      reached
    };
  }

  /** 计算某日达成情况（用于日历标记） */
  public async isDayGoalReached(dateKey: string, goals: GoalConfig): Promise<boolean> {
    const day = await this.statsService.getDay(dateKey);
    return day.addedWords >= goals.dailyWords;
  }

  private pct(value: number, target: number): number {
    if (target <= 0) {
      return 0;
    }
    return Math.min(100, Math.round((Math.max(value, 0) / target) * 100));
  }

  /** 格式化目标进度文本 */
  public static formatPct(pct: number): string {
    return `${pct}%`;
  }
}

export { DailyStats };
export type { GoalConfig };
export { localDateKey };