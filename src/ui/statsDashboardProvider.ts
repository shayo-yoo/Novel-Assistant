import * as vscode from 'vscode';
import { StatsService } from '../stats/statsService';
import { HeatmapService, HeatmapGrade } from '../stats/heatmapService';
import { GoalService } from '../stats/goalService';
import { PomodoroService } from '../pomodoro/pomodoroService';
import { SprintService } from '../sprint/sprintService';
import { NovelConfig } from '../types';
import { formatDuration, localDateKey } from '../utils/text';
import { wrapHtml, WEBVIEW_STYLE } from './webviewUtil';

/**
 * 写作统计仪表盘（规划文档 3.7 / 4.2）
 * 今日概览、目标进度、365 天热力图、月历、番茄钟与冲刺快捷控制。
 */

const HEATMAP_COLORS: Record<HeatmapGrade, string> = {
  0: '#ebedf0',
  1: '#c6e48b',
  2: '#7bc96f',
  3: '#239a3b',
  4: '#196127',
  5: '#0f4a17'
};

export class StatsDashboardProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private disposables: vscode.Disposable[] = [];

  constructor(
    private readonly statsService: StatsService,
    private readonly heatmapService: HeatmapService,
    private readonly goalService: GoalService,
    private readonly pomodoroService: PomodoroService,
    private readonly sprintService: SprintService,
    private readonly getConfig: () => Promise<NovelConfig>
  ) {}

  public resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = this.renderLoading();

    webviewView.webview.onDidReceiveMessage(msg => {
      switch (msg.command) {
        case 'refresh':
          void this.render();
          break;
        case 'pomodoroStart':
          void this.pomodoroService.start();
          break;
        case 'pomodoroPause':
          this.pomodoroService.togglePause();
          break;
        case 'pomodoroStop':
          void this.pomodoroService.stop();
          break;
        case 'sprintStart':
          void vscode.commands.executeCommand('novelAssistant.startSprint');
          break;
        case 'openDay':
          vscode.window.showInformationMessage(`${msg.date}：${msg.words} 字`);
          break;
      }
    });

    this.render();
  }

  private renderLoading(): string {
    return wrapHtml('写作统计', '<div class="muted">加载中…</div>');
  }

  public async render(): Promise<void> {
    if (!this.view) {
      return;
    }
    const config = await this.getConfig();
    const today = await this.statsService.getToday();
    const progress = await this.goalService.getTodayProgress(config.goals);
    const heatmap = await this.heatmapService.getHeatmap(365);
    const pomodoro = this.pomodoroService.getSnapshot();
    const sprint = this.sprintService.getSnapshot();
    const week = await this.statsService.getWeekTotals();
    const month = await this.statsService.getMonthTotals();

    const pomodoroStatus = pomodoro.mode === 'idle'
      ? '<span class="muted">空闲</span>'
      : `<b>${pomodoro.mode === 'work' ? '工作' : pomodoro.mode === 'shortBreak' ? '短休' : '长休'}</b> ${mmss(pomodoro.remainingSeconds)}${pomodoro.paused ? '（已暂停）' : ''}`;

    const sprintStatus = sprint.state === 'idle'
      ? '<span class="muted">未运行</span>'
      : `<b>冲刺</b> ${mmss(sprint.remainingSeconds)}${sprint.paused ? '（已暂停）' : ''}`;

    const body = `
<h2>📊 写作统计</h2>

<div class="card grid" style="grid-template-columns: repeat(4, 1fr);">
  <div><div class="muted">今日新增</div><div class="big">${today.addedWords}</div></div>
  <div><div class="muted">今日创作</div><div class="big">${formatDuration(today.activeSeconds)}</div></div>
  <div><div class="muted">番茄完成</div><div class="big">${today.pomodoros}</div></div>
  <div><div class="muted">冲刺完成</div><div class="big">${today.sprints}</div></div>
</div>

<div class="card grid" style="grid-template-columns: repeat(2, 1fr);">
  <div class="muted">本周：${formatDuration(week.activeSeconds)} / +${week.addedWords} 字</div>
  <div class="muted">本月：${formatDuration(month.activeSeconds)} / +${month.addedWords} 字</div>
</div>

<div class="card">
  <h3>🎯 今日目标进度</h3>
  <div class="row">
    <span>字数 ${progress.wordsPct}% (${today.addedWords}/${config.goals.dailyWords})</span>
    <span>时间 ${progress.minutesPct}%</span>
    <span>番茄 ${progress.pomodoroPct}%</span>
    <span>输入 ${progress.activeMinutesPct}%</span>
  </div>
  <div style="height:8px;background:var(--vscode-progressBar-background,#333);border-radius:4px;margin-top:6px;">
    <div style="height:100%;width:${progress.wordsPct}%;background:${progress.reached ? '#4ec9b0' : '#3794ff'};border-radius:4px;"></div>
  </div>
</div>

<div class="card">
  <h3>🍅 番茄钟</h3>
  <div class="row">
    <span>状态：${pomodoroStatus}</span>
    <button onclick="post('pomodoroStart')">开始/继续</button>
    <button class="secondary" onclick="post('pomodoroPause')">暂停</button>
    <button class="secondary" onclick="post('pomodoroStop')">停止</button>
  </div>
</div>

<div class="card">
  <h3>⚡ 写作冲刺</h3>
  <div class="row">
    <span>状态：${sprintStatus}</span>
    <button onclick="post('sprintStart')">开始冲刺</button>
  </div>
</div>

<div class="card">
  <h3>🗓 最近 365 天写作热力图</h3>
  <div id="heatmap" style="overflow-x:auto;">${renderHeatmap(heatmap)}</div>
  <div class="muted" style="margin-top:6px;">图例：${(['0','1-500','501-1000','1001-2000','2001-4000','4000+'] as const).map((label, i) => `<span style="display:inline-block;width:12px;height:12px;background:${HEATMAP_COLORS[i as HeatmapGrade]};border-radius:2px;"></span> ${label}`).join('　')}</div>
</div>

<div class="card">
  <h3>📅 本月写作日历</h3>
  ${renderMonthCalendar()}
</div>

<script>
const vscode = acquireVsCodeApi();
function post(command, extra = {}) { vscode.postMessage({ command, ...extra }); }
setInterval(() => post('refresh'), 30000);
</script>
`;
    this.view.webview.html = wrapHtml('写作统计', body, `
.heat { display: grid; grid-auto-flow: column; grid-template-rows: repeat(7, 12px); gap: 3px; }
.heat div { width: 12px; height: 12px; border-radius: 2px; cursor: pointer; }
.cal { display: grid; grid-template-columns: repeat(7, 1fr); gap: 3px; }
.cal div { border: 1px solid var(--border); border-radius: 3px; padding: 3px; min-height: 34px; font-size: 11px; }
.cal .dim { opacity: 0.35; }
`);
  }
}

function mmss(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

interface HeatCell { date: string; words: number; grade: HeatmapGrade; isToday: boolean }

function renderHeatmap(cells: HeatCell[]): string {
  // 按周分组（周日起始）
  const weeks: HeatCell[][] = [];
  let week: HeatCell[] = [];
  for (const cell of cells) {
    const dayOfWeek = new Date(cell.date + 'T00:00:00').getDay();
    if (week.length === 0 && dayOfWeek !== 0) {
      for (let i = 0; i < dayOfWeek; i++) {
        week.push({ date: '', words: 0, grade: 0, isToday: false });
      }
    }
    week.push(cell);
    if (dayOfWeek === 6) {
      weeks.push(week);
      week = [];
    }
  }
  if (week.length) {
    weeks.push(week);
  }
  const html = weeks.map(w => `<div style="display:grid;grid-template-rows:repeat(7,12px);gap:3px;">${w.map(c => c.date
    ? `<div title="${c.date}：${c.words} 字${c.isToday ? '（今天）' : ''}" style="background:${HEATMAP_COLORS[c.grade]};" onclick="post('openDay',{date:'${c.date}',words:${c.words}})"></div>`
    : '<div></div>').join('')}</div>`).join('<div style="width:6px;"></div>');
  return `<div class="row" style="align-items:flex-start;">${html}</div>`;
}

function renderMonthCalendar(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayDate = now.getDate();
  const cells: string[] = ['一', '二', '三', '四', '五', '六', '日'].map(d => `<div class="muted" style="text-align:center;">${d}</div>`);
  for (let i = 0; i < firstDay; i++) {
    cells.push('<div class="dim"></div>');
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const isToday = d === todayDate;
    const key = localDateKey(new Date(year, month, d));
    cells.push(`<div ${isToday ? 'style="border-color:var(--accent);"' : ''} onclick="post('openDay',{date:'${key}'})"><b>${d}</b></div>`);
  }
  // 补齐最后一周
  while (cells.length % 7 !== 0) {
    cells.push('<div class="dim"></div>');
  }
  return `<div class="cal">${cells.join('')}</div>`;
}
