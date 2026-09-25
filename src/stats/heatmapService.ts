import { StatsService } from './statsService';
import { localDateKey } from '../utils/text';

/**
 * 写作热力图数据服务（规划文档 3.7.2）
 * 展示过去 365 天每日写作字数，颜色分级：0、1-500、501-1000、1001-2000、2001-4000、4000+。
 */

export type HeatmapGrade = 0 | 1 | 2 | 3 | 4 | 5;

export function heatmapGrade(words: number): HeatmapGrade {
  if (words <= 0) {
    return 0;
  }
  if (words <= 500) {
    return 1;
  }
  if (words <= 1000) {
    return 2;
  }
  if (words <= 2000) {
    return 3;
  }
  if (words <= 4000) {
    return 4;
  }
  return 5;
}

export interface HeatmapCell {
  date: string;
  words: number;
  grade: HeatmapGrade;
  isToday: boolean;
}

export class HeatmapService {
  constructor(private readonly statsService: StatsService) {}

  /** 过去 days 天（默认 365）的每日字数 */
  public async getHeatmap(days = 365): Promise<HeatmapCell[]> {
    const range = await this.statsService.getRangeDays(days);
    const todayKey = localDateKey();
    const today = new Date();
    const cells: HeatmapCell[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
      const key = localDateKey(d);
      const day = range[key];
      cells.push({
        date: key,
        words: day?.words ?? 0,
        grade: heatmapGrade(day?.words ?? 0),
        isToday: key === todayKey
      });
    }
    return cells;
  }
}
