import * as vscode from 'vscode';
import { NovelConfig, GoalConfig } from '../types';
import { countText } from '../count/countEngine';
import { BUILTIN_MODE_NAMES } from '../count/countEngine';
import { formatDuration } from '../utils/text';

/**
 * 状态栏控制器（规划文档 4.1）
 * 常驻显示：字数 + 模式、今日创作时间、输入速度、目标进度、番茄钟、冲刺。
 */

export interface StatusBarData {
  config: NovelConfig;
  wordCount: number;
  countModeName: string;
  todayActiveSeconds: number;
  speed: number;
  speedLabel: string;
  goalPct: number;
  goalText: string;
  pomodoroText: string;
  sprintText: string | undefined;
  selectedTextCount?: number;
}

export class StatusBarController implements vscode.Disposable {
  private readonly wordItem: vscode.StatusBarItem;
  private readonly timeItem: vscode.StatusBarItem;
  private readonly speedItem: vscode.StatusBarItem;
  private readonly goalItem: vscode.StatusBarItem;
  private readonly pomodoroItem: vscode.StatusBarItem;
  private readonly sprintItem: vscode.StatusBarItem;
  private onWordClick: (() => void) | undefined;
  private onTimeClick: (() => void) | undefined;
  private onSpeedClick: (() => void) | undefined;
  private onGoalClick: (() => void) | undefined;
  private onPomodoroClick: (() => void) | undefined;
  private onSprintClick: (() => void) | undefined;

  constructor() {
    this.wordItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.timeItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 99);
    this.speedItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 98);
    this.goalItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 97);
    this.pomodoroItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 96);
    this.sprintItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 95);

    this.wordItem.command = 'novelAssistant.statusBarWord';
    this.timeItem.command = 'novelAssistant.statusBarTime';
    this.speedItem.command = 'novelAssistant.statusBarSpeed';
    this.goalItem.command = 'novelAssistant.statusBarGoal';
    this.pomodoroItem.command = 'novelAssistant.statusBarPomodoro';
    this.sprintItem.command = 'novelAssistant.statusBarSprint';

    this.wordItem.show();
    this.timeItem.show();
    this.speedItem.show();
    this.goalItem.show();
    this.pomodoroItem.show();
  }

  public setHandlers(h: {
    onWordClick?: () => void;
    onTimeClick?: () => void;
    onSpeedClick?: () => void;
    onGoalClick?: () => void;
    onPomodoroClick?: () => void;
    onSprintClick?: () => void;
  }): void {
    this.onWordClick = h.onWordClick;
    this.onTimeClick = h.onTimeClick;
    this.onSpeedClick = h.onSpeedClick;
    this.onGoalClick = h.onGoalClick;
    this.onPomodoroClick = h.onPomodoroClick;
    this.onSprintClick = h.onSprintClick;
  }

  public update(data: StatusBarData, editor?: vscode.TextEditor): void {
    const modeName = BUILTIN_MODE_NAMES[data.config.countMode] ?? data.config.countMode;
    const docName = editor?.document.fileName.split(/[\\/]/).pop() ?? '无';

    this.wordItem.text = `📝 ${data.wordCount.toLocaleString()} 字 [${modeName}]`;
    this.wordItem.tooltip =
      `当前文档：${docName}\n` +
      `当前字数：${data.wordCount.toLocaleString()}\n` +
      `模式：${modeName} (${data.config.countMode})\n` +
      (data.selectedTextCount !== undefined ? `选中文本：${data.selectedTextCount.toLocaleString()} 字\n` : '') +
      `点击：查看详情 / 切换模式`;

    this.timeItem.text = `⏱ ${formatDuration(data.todayActiveSeconds)}`;
    this.timeItem.tooltip = `今日创作时间：${formatDuration(data.todayActiveSeconds)}\n点击：暂停/继续计时`;

    this.speedItem.text = `⚡ ${data.speedLabel}`;
    this.speedItem.tooltip = `当前速度：${data.speedLabel}\n点击：查看速度详情`;

    this.goalItem.text = `🎯 ${data.goalPct}%`;
    this.goalItem.tooltip = `${data.goalText}\n点击：设置每日目标`;
    this.goalItem.color = data.goalPct >= 100
      ? new vscode.ThemeColor('charts.green')
      : undefined;

    this.pomodoroItem.text = data.pomodoroText;
    this.pomodoroItem.tooltip = '番茄钟\n点击：开始/暂停/停止';

    if (data.sprintText) {
      this.sprintItem.text = data.sprintText;
      this.sprintItem.show();
      this.sprintItem.tooltip = '写作冲刺\n点击：暂停/停止';
    } else {
      this.sprintItem.hide();
    }
  }

  public handleWordClick(): void {
    if (this.onWordClick) {
      this.onWordClick();
    }
  }

  public handleTimeClick(): void {
    if (this.onTimeClick) {
      this.onTimeClick();
    }
  }

  public handleSpeedClick(): void {
    if (this.onSpeedClick) {
      this.onSpeedClick();
    }
  }

  public handleGoalClick(): void {
    if (this.onGoalClick) {
      this.onGoalClick();
    }
  }

  public handlePomodoroClick(): void {
    if (this.onPomodoroClick) {
      this.onPomodoroClick();
    }
  }

  public handleSprintClick(): void {
    if (this.onSprintClick) {
      this.onSprintClick();
    }
  }

  public dispose(): void {
    this.wordItem.dispose();
    this.timeItem.dispose();
    this.speedItem.dispose();
    this.goalItem.dispose();
    this.pomodoroItem.dispose();
    this.sprintItem.dispose();
  }
}
