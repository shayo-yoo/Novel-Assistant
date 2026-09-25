import * as vscode from 'vscode';
import { NovelConfig, ChapterStatus, TimelineEventType, TimelineEventStatus, ForeshadowStatus } from '../types';
import { ConfigService } from '../config/configService';
import { StatsService } from '../stats/statsService';
import { GoalService } from '../stats/goalService';
import { TimerService } from '../timer/timerService';
import { InputSpeedService } from '../timer/inputSpeedService';
import { FocusWatcher } from '../timer/focusWatcher';
import { HighlightService } from '../highlight/highlightService';
import { HighlightGroupService } from '../highlight/highlightGroupService';
import { DialogueHighlightService } from '../highlight/dialogueHighlight';
import { PomodoroService } from '../pomodoro/pomodoroService';
import { SprintService } from '../sprint/sprintService';
import { SensitiveWordService } from '../sensitive/sensitiveWordService';
import { ChapterService } from '../chapters/chapterService';
import { CharacterService } from '../characters/characterService';
import { TimelineService, TIMELINE_TYPES, TIMELINE_STATUSES } from '../timeline/timelineService';
import { ForeshadowService, FORESHADOW_STATUSES } from '../foreshadow/foreshadowService';
import { FormatService } from '../format/formatService';
import { StatusBarController } from './statusBar';
import { ChapterTreeProvider } from '../chapters/chapterTreeProvider';
import { HighlightTreeProvider } from './highlightTreeProvider';
import { SensitiveTreeProvider } from './sensitiveTreeProvider';
import { TimelineTreeProvider } from './timelineTreeProvider';
import { ForeshadowTreeProvider } from './foreshadowTreeProvider';
import { StatsDashboardProvider } from './statsDashboardProvider';
import { CharacterHeatmapProvider } from './characterHeatmapProvider';
import { countText, BUILTIN_MODE_NAMES, resolveCountMode } from '../count/countEngine';
import {
  pickCountMode,
  pickHighlightGroup,
  pickColor,
  pickChapterStatus,
  pickTimelineType,
  pickTimelineStatus,
  pickForeshadowStatus,
  pickSprintMinutes,
  inputTargetWords,
  confirm
} from './quickPicks';
import { basename, localDateKey, localIso } from '../utils/text';

/**
 * 全部命令注册（规划文档 12.1 + 扩展命令）。
 */

export interface CommandContext {
  context: vscode.ExtensionContext;
  configService: ConfigService;
  statsService: StatsService;
  goalService: GoalService;
  timerService: TimerService;
  inputSpeed: InputSpeedService;
  focusWatcher: FocusWatcher;
  highlightService: HighlightService;
  highlightGroupService: HighlightGroupService;
  dialogueHighlight: DialogueHighlightService;
  pomodoroService: PomodoroService;
  sprintService: SprintService;
  sensitiveService: SensitiveWordService;
  chapterService: ChapterService;
  characterService: CharacterService;
  timelineService: TimelineService;
  foreshadowService: ForeshadowService;
  formatService: FormatService;
  statusBar: StatusBarController;
  chapterTree: ChapterTreeProvider;
  highlightTree: HighlightTreeProvider;
  sensitiveTree: SensitiveTreeProvider;
  timelineTree: TimelineTreeProvider;
  foreshadowTree: ForeshadowTreeProvider;
  statsDashboard: StatsDashboardProvider;
  characterHeatmap: CharacterHeatmapProvider;
  getConfig: () => Promise<NovelConfig>;
  refreshStatusBar: () => Promise<void>;
  refreshAll: () => void;
}

export function registerCommands(deps: CommandContext): vscode.Disposable[] {
  const { context, configService, statsService, goalService, timerService, inputSpeed, focusWatcher } = deps;
  const commands: vscode.Disposable[] = [];

  const refresh = deps.refreshStatusBar;
  const getConfig = deps.getConfig;

  // ========== 配置 ==========

  commands.push(vscode.commands.registerCommand('novelAssistant.initConfig', async () => {
    await configService.initConfig();
    await refresh();
    deps.refreshAll();
  }));

  // ========== 字数统计 ==========

  commands.push(vscode.commands.registerCommand('novelAssistant.switchCountMode', async () => {
    const config = await getConfig();
    const mode = await pickCountMode(config);
    if (!mode) {
      return;
    }
    config.countMode = mode;
    await configService.writeConfig(config);
    vscode.window.showInformationMessage(`已切换字数统计模式：${BUILTIN_MODE_NAMES[mode] ?? mode}`);
    await refresh();
    deps.refreshAll();
  }));

  commands.push(vscode.commands.registerCommand('novelAssistant.configureCustomRegexMode', async () => {
    const config = await getConfig();
    const regex = await vscode.window.showInputBox({
      prompt: '输入正则表达式（统计其匹配覆盖的字符）',
      placeHolder: '例如 [\u4e00-\u9fff]'
    });
    if (!regex) {
      return;
    }
    const countBy = await vscode.window.showQuickPick(
      [
        { label: '统计匹配字符数（默认）', description: 'chars' },
        { label: '统计匹配次数', description: 'matches' }
      ],
      { placeHolder: '选择统计方式' }
    );
    config.countModes = { ...(config.countModes ?? {}), custom_regex: { type: 'custom_regex', regex, countBy: (countBy?.description as 'chars' | 'matches') ?? 'chars' } };
    config.countMode = 'custom_regex';
    await configService.writeConfig(config);
    vscode.window.showInformationMessage('已配置自定义正则模式并切换。');
    await refresh();
  }));

  commands.push(vscode.commands.registerCommand('novelAssistant.configureCustomWeightMode', async () => {
    const config = await getConfig();
    const rules = await vscode.window.showInputBox({
      prompt: '输入权重规则 JSON（示例：{"cjk":1,"punctuation":1,"whitespace":0,"ascii_word":1,"digit_sequence":1,"other":1}）',
      placeHolder: '{"cjk":1,"punctuation":1,"whitespace":0,"ascii_word":1,"digit_sequence":1,"other":1}'
    });
    if (!rules) {
      return;
    }
    try {
      const parsed = JSON.parse(rules) as Record<string, number>;
      const ruleList = (['cjk', 'punctuation', 'whitespace', 'ascii_word', 'digit_sequence', 'other'] as const)
        .map(type => ({ type, weight: parsed[type] ?? 1 }));
      config.countModes = { ...(config.countModes ?? {}), custom: { type: 'custom_weight', rules: ruleList } };
      config.countMode = 'custom';
      await configService.writeConfig(config);
      vscode.window.showInformationMessage('已配置自定义权重模式并切换。');
      await refresh();
    } catch {
      vscode.window.showErrorMessage('JSON 解析失败，请输入合法的 JSON。');
    }
  }));

  commands.push(vscode.commands.registerCommand('novelAssistant.viewCountDetails', async () => {
    const editor = vscode.window.activeTextEditor;
    const config = await getConfig();
    const text = editor?.document.getText() ?? '';
    const lines: string[] = [];
    const modes = ['all', 'cjk', 'cjk_punct', 'non_whitespace', 'qidian', 'fanqie', 'mixed'];
    for (const mode of modes) {
      lines.push(`${BUILTIN_MODE_NAMES[mode] ?? mode}：${countText(text, mode, config).toLocaleString()}`);
    }
    const selected = editor?.selection;
    const selectedCount = selected && !selected.isEmpty ? countText(editor.document.getText(selected), config.countMode, config) : 0;
    const docName = editor ? basename(editor.document.fileName) : '无';
    lines.push('');
    lines.push(`当前模式（${BUILTIN_MODE_NAMES[config.countMode] ?? config.countMode}）：${countText(text, config.countMode, config).toLocaleString()}`);
    if (selectedCount > 0) {
      lines.push(`选中文本（${docName}）：${selectedCount.toLocaleString()}`);
    }
    await vscode.window.showInformationMessage(lines.join('\n'), { modal: false });
  }));

  // ========== 格式化 ==========

  commands.push(vscode.commands.registerCommand('novelAssistant.formatDocument', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showInformationMessage('当前没有打开的文档。');
      return;
    }
    const config = await getConfig();
    const applied = await deps.formatService.formatDocument(editor.document, config);
    if (applied) {
      vscode.window.showInformationMessage('文档已格式化。');
    } else {
      vscode.window.showInformationMessage('无需格式化（已符合规则或内容为空）。');
    }
  }));

  commands.push(vscode.commands.registerCommand('novelAssistant.formatSelection', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }
    const config = await getConfig();
    const applied = await deps.formatService.formatSelection(editor, config);
    if (applied) {
      vscode.window.showInformationMessage('选中段落已格式化。');
    } else {
      vscode.window.showInformationMessage('请先选中文本，或内容无需格式化。');
    }
  }));

  commands.push(vscode.commands.registerCommand('novelAssistant.formatWorkspace', async () => {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) {
      vscode.window.showInformationMessage('请先打开一个小说工作区。');
      return;
    }
    const answer = await vscode.window.showWarningMessage('将格式化工作区内全部小说文件，确定继续？', '确定', '取消');
    if (answer !== '确定') {
      return;
    }
    const config = await getConfig();
    const count = await deps.formatService.formatWorkspace(folder, config);
    vscode.window.showInformationMessage(`已格式化 ${count} 个文件。`);
  }));

  // ========== 高亮 ==========

  commands.push(vscode.commands.registerCommand('novelAssistant.addSelectionToHighlight', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.selection.isEmpty) {
      vscode.window.showInformationMessage('请先选中文本。');
      return;
    }
    const config = await getConfig();
    const groupId = await pickHighlightGroup(config);
    if (!groupId) {
      return;
    }
    const selected = editor.document.getText(editor.selection).trim();
    if (!selected) {
      return;
    }
    await deps.highlightGroupService.addWord(groupId, selected);
    const group = config.highlights.find(g => g.id === groupId);
    await refresh();
    vscode.window.showInformationMessage(`已添加“${selected}”到「${group?.name ?? groupId}」。`);
  }));

  commands.push(vscode.commands.registerCommand('novelAssistant.removeSelectionHighlight', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.selection.isEmpty) {
      return;
    }
    const config = await getConfig();
    const selected = editor.document.getText(editor.selection).trim();
    // 找到包含该词的所有组
    const targets = config.highlights.filter(g => g.words.includes(selected));
    if (targets.length === 0) {
      vscode.window.showInformationMessage(`“${selected}”不在任何高亮组中。`);
      return;
    }
    const groupId = await pickHighlightGroup(config, '选择要从哪个组取消高亮');
    if (!groupId) {
      return;
    }
    await deps.highlightGroupService.removeWord(groupId, selected);
    await refresh();
    vscode.window.showInformationMessage(`已从高亮组取消“${selected}”。`);
  }));

  commands.push(vscode.commands.registerCommand('novelAssistant.manageHighlights', async () => {
    const config = await getConfig();
    const actions = [
      { label: '添加高亮组', description: 'add_group' },
      { label: '管理现有组', description: 'manage_group' },
      { label: '重置为默认组', description: 'reset' }
    ];
    const pick = await vscode.window.showQuickPick(actions, { placeHolder: '选择高亮管理操作' });
    if (!pick) {
      return;
    }
    if (pick.description === 'add_group') {
      const name = await vscode.window.showInputBox({ prompt: '输入新组名（如 关键道具）' });
      if (!name) {
        return;
      }
      const color = await pickColor('为新组选择颜色');
      if (!color) {
        return;
      }
      await deps.highlightGroupService.addGroup(name, color);
      vscode.window.showInformationMessage(`已创建高亮组「${name}」。`);
    } else if (pick.description === 'manage_group') {
      await manageHighlightGroups(deps);
    } else if (pick.description === 'reset') {
      const ok = await confirm('确定将高亮组重置为默认五组（主角/配角/关键道具/地点/自定义）？', '重置', '取消');
      if (ok) {
        await deps.highlightGroupService.resetToDefault();
        vscode.window.showInformationMessage('高亮组已重置。');
      }
    }
    await refresh();
    deps.refreshAll();
  }));

  commands.push(vscode.commands.registerCommand('novelAssistant.highlightAddWord', async (groupId?: string) => {
    const config = await getConfig();
    const targetId = groupId ?? (await pickHighlightGroup(config));
    if (!targetId) {
      return;
    }
    const word = await vscode.window.showInputBox({ prompt: '输入要添加的高亮词' });
    if (!word) {
      return;
    }
    await deps.highlightGroupService.addWord(targetId, word);
    vscode.window.showInformationMessage(`已添加高亮词：${word}`);
    await refresh();
    deps.refreshAll();
  }));

  commands.push(vscode.commands.registerCommand('novelAssistant.highlightRemoveWord', async (node: { group?: { id: string }; word?: string }) => {
    const groupId = node?.group?.id;
    const word = node?.word;
    if (!groupId || !word) {
      return;
    }
    await deps.highlightGroupService.removeWord(groupId, word);
    await refresh();
    deps.refreshAll();
  }));

  commands.push(vscode.commands.registerCommand('novelAssistant.highlightToggleGroup', async (node: { group?: { id: string } }) => {
    const id = node?.group?.id;
    if (!id) {
      return;
    }
    const config = await getConfig();
    const group = config.highlights.find(g => g.id === id);
    if (!group) {
      return;
    }
    group.enabled = !group.enabled;
    await configService.writeConfig(config);
    await refresh();
    deps.refreshAll();
  }));

  commands.push(vscode.commands.registerCommand('novelAssistant.highlightRenameGroup', async (node: { group?: { id: string; name: string } }) => {
    const id = node?.group?.id;
    if (!id) {
      return;
    }
    const name = await vscode.window.showInputBox({ prompt: '输入新组名', value: node?.group?.name ?? '' });
    if (!name) {
      return;
    }
    await deps.highlightGroupService.updateGroup(id, { name });
    await refresh();
    deps.refreshAll();
  }));

  commands.push(vscode.commands.registerCommand('novelAssistant.highlightChangeColor', async (node: { group?: { id: string } }) => {
    const id = node?.group?.id;
    if (!id) {
      return;
    }
    const color = await pickColor('选择新颜色');
    if (!color) {
      return;
    }
    await deps.highlightGroupService.updateGroup(id, { color });
    await refresh();
    deps.refreshAll();
  }));

  commands.push(vscode.commands.registerCommand('novelAssistant.highlightSetStyle', async (node: { group?: { id: string } }) => {
    const id = node?.group?.id;
    if (!id) {
      return;
    }
    const styles = [
      { label: '背景色块', description: 'background' },
      { label: '下划线', description: 'underline' },
      { label: '边框', description: 'border' },
      { label: '加粗', description: 'bold' },
      { label: '斜体', description: 'italic' }
    ];
    const pick = await vscode.window.showQuickPick(styles, { placeHolder: '选择高亮样式' });
    if (!pick) {
      return;
    }
    await deps.highlightGroupService.updateGroup(id, { style: pick.description as never });
    await refresh();
    deps.refreshAll();
  }));

  commands.push(vscode.commands.registerCommand('novelAssistant.highlightDeleteGroup', async (node: { group?: { id: string; name: string } }) => {
    const id = node?.group?.id;
    if (!id) {
      return;
    }
    const ok = await confirm(`确定删除高亮组「${node?.group?.name ?? ''}」及其全部词？`, '删除', '取消');
    if (ok) {
      await deps.highlightGroupService.removeGroup(id);
      await refresh();
      deps.refreshAll();
    }
  }));

  commands.push(vscode.commands.registerCommand('novelAssistant.customizeHighlightColor', async () => {
    await vscode.commands.executeCommand('novelAssistant.manageHighlights');
  }));

  // ========== 计时 ==========

  commands.push(vscode.commands.registerCommand('novelAssistant.toggleTimer', async () => {
    timerService.setManualPaused(!timerService.isManualPaused());
    const label = timerService.isManualPaused() ? '已暂停计时' : '已继续计时';
    vscode.window.showInformationMessage(label);
    await refresh();
  }));

  commands.push(vscode.commands.registerCommand('novelAssistant.showSpeedDetails', async () => {
    const editor = vscode.window.activeTextEditor;
    const words = editor ? countText(editor.document.getText(), (await getConfig()).countMode, await getConfig()) : 0;
    const msg =
      `瞬时速度（60 秒）：${Math.round(inputSpeed.getInstantSpeed())} 字/分\n` +
      `短期速度（5 分钟）：${Math.round(inputSpeed.getShortTermSpeed())} 字/分\n` +
      `会话平均：${Math.round(inputSpeed.getSessionAverageSpeed())} 字/分\n` +
      `今日平均：${Math.round(inputSpeed.getTodayAverageSpeed())} 字/分\n` +
      `会话新增：${inputSpeed.getSessionWords()} 字\n` +
      `当前文档字数：${words} 字`;
    vscode.window.showInformationMessage(msg);
  }));

  // ========== 每日目标 ==========

  commands.push(vscode.commands.registerCommand('novelAssistant.setGoals', async () => {
    const config = await getConfig();
    const type = await vscode.window.showQuickPick(
      [
        { label: `每日字数（当前 ${config.goals.dailyWords}）`, description: 'dailyWords' },
        { label: `每日创作时间分钟（当前 ${config.goals.dailyMinutes}）`, description: 'dailyMinutes' },
        { label: `每日番茄数（当前 ${config.goals.dailyPomodoros}）`, description: 'dailyPomodoros' },
        { label: `每日有效输入分钟（当前 ${config.goals.dailyActiveMinutes}）`, description: 'dailyActiveMinutes' }
      ],
      { placeHolder: '选择要设置的目标类型' }
    );
    if (!type) {
      return;
    }
    const value = await vscode.window.showInputBox({
      prompt: `输入新的${type.label}数值`,
      value: String(config.goals[type.description as keyof typeof config.goals])
    });
    const n = value ? Number(value) : NaN;
    if (!Number.isFinite(n) || n < 0) {
      vscode.window.showErrorMessage('请输入合法数值。');
      return;
    }
    const goals = config.goals as unknown as Record<string, number>;
    goals[type.description as string] = n;
    await configService.writeConfig(config);
    vscode.window.showInformationMessage('每日目标已更新。');
    await refresh();
  }));

  // ========== 番茄钟 ==========

  commands.push(vscode.commands.registerCommand('novelAssistant.startPomodoro', async () => {
    await deps.pomodoroService.start();
    await refresh();
  }));

  commands.push(vscode.commands.registerCommand('novelAssistant.pausePomodoro', async () => {
    deps.pomodoroService.togglePause();
    await refresh();
  }));

  commands.push(vscode.commands.registerCommand('novelAssistant.stopPomodoro', async () => {
    const config = await getConfig();
    const answer = await vscode.window.showQuickPick(
      [
        { label: '保存已专注时间并停止', description: 'save' },
        { label: '放弃本次番茄', description: 'discard' }
      ],
      { placeHolder: '如何结束本次番茄？' }
    );
    if (!answer) {
      return;
    }
    await deps.pomodoroService.stop(answer.description === 'save');
    await refresh();
  }));

  commands.push(vscode.commands.registerCommand('novelAssistant.setPomodoroDuration', async () => {
    const config = await getConfig();
    const field = await vscode.window.showQuickPick(
      [
        { label: `工作时长（当前 ${config.pomodoro.workMinutes} 分钟）`, description: 'workMinutes' },
        { label: `短休时长（当前 ${config.pomodoro.shortBreakMinutes} 分钟）`, description: 'shortBreakMinutes' },
        { label: `长休时长（当前 ${config.pomodoro.longBreakMinutes} 分钟）`, description: 'longBreakMinutes' },
        { label: `长休前循环数（当前 ${config.pomodoro.cyclesBeforeLongBreak}）`, description: 'cyclesBeforeLongBreak' }
      ],
      { placeHolder: '选择要设置的参数' }
    );
    if (!field) {
      return;
    }
    const value = await vscode.window.showInputBox({ prompt: '输入新数值', value: String(config.pomodoro[field.description as keyof typeof config.pomodoro]) });
    const n = value ? Number(value) : NaN;
    if (!Number.isFinite(n) || n <= 0) {
      vscode.window.showErrorMessage('请输入合法数值。');
      return;
    }
    const pomodoroCfg = config.pomodoro as unknown as Record<string, number>;
    pomodoroCfg[field.description as string] = n;
    await configService.writeConfig(config);
    vscode.window.showInformationMessage('番茄钟参数已更新。');
  }));

  // ========== 写作冲刺 ==========

  commands.push(vscode.commands.registerCommand('novelAssistant.startSprint', async () => {
    if (deps.sprintService.isRunning()) {
      deps.sprintService.togglePause();
      await refresh();
      return;
    }
    const minutes = await pickSprintMinutes();
    if (!minutes) {
      return;
    }
    const target = await inputTargetWords();
    await deps.sprintService.start(minutes, target);
    await refresh();
  }));

  commands.push(vscode.commands.registerCommand('novelAssistant.pauseSprint', async () => {
    deps.sprintService.togglePause();
    await refresh();
  }));

  commands.push(vscode.commands.registerCommand('novelAssistant.stopSprint', async () => {
    deps.sprintService.stop();
    await refresh();
  }));

  // ========== 专注 / 打字机 / 对话高亮 ==========

  commands.push(vscode.commands.registerCommand('novelAssistant.toggleFocusMode', async () => {
    const config = await getConfig();
    // 用运行中标志判断当前是否专注（保存在全局状态）
    const key = 'novelAssistant.focusModeActive';
    const active = context.globalState.get<boolean>(key, false);
    const next = !active;
    await context.globalState.update(key, next);
    const fm = config.focusMode;
    if (next) {
      if (fm.hideSidebar) {
        await vscode.commands.executeCommand('workbench.action.toggleSidebarVisibility');
      }
      if (fm.hidePanel) {
        await vscode.commands.executeCommand('workbench.action.togglePanel');
      }
      if (fm.fullScreen) {
        await vscode.commands.executeCommand('workbench.action.toggleFullScreen');
      }
    } else {
      if (fm.hideSidebar) {
        await vscode.commands.executeCommand('workbench.action.toggleSidebarVisibility');
      }
      if (fm.hidePanel) {
        await vscode.commands.executeCommand('workbench.action.togglePanel');
      }
      if (fm.fullScreen) {
        await vscode.commands.executeCommand('workbench.action.toggleFullScreen');
      }
    }
    vscode.window.showInformationMessage(`专注模式：${next ? '开启' : '关闭'}`);
  }));

  commands.push(vscode.commands.registerCommand('novelAssistant.configureFocusMode', async () => {
    const config = await getConfig();
    const fm = config.focusMode;
    const items = [
      { label: `${fm.hideSidebar ? '✓' : '○'} 隐藏侧边栏`, description: 'hideSidebar' },
      { label: `${fm.hidePanel ? '✓' : '○'} 隐藏面板`, description: 'hidePanel' },
      { label: `${fm.fullScreen ? '✓' : '○'} 全屏`, description: 'fullScreen' }
    ];
    const pick = await vscode.window.showQuickPick(items, { placeHolder: '勾选专注模式要执行的动作（点击切换）' });
    if (!pick) {
      return;
    }
    const field = pick.description as keyof typeof fm;
    fm[field] = !fm[field];
    await configService.writeConfig(config);
    vscode.window.showInformationMessage('专注模式配置已更新。');
  }));

  commands.push(vscode.commands.registerCommand('novelAssistant.toggleTypewriter', async () => {
    const config = await getConfig();
    config.typewriterMode = !config.typewriterMode;
    await configService.writeConfig(config);
    vscode.window.showInformationMessage(`打字机模式：${config.typewriterMode ? '开启' : '关闭'}`);
    if (config.typewriterMode && vscode.window.activeTextEditor) {
      applyTypewriter(vscode.window.activeTextEditor);
    }
    await refresh();
  }));

  commands.push(vscode.commands.registerCommand('novelAssistant.toggleDialogueHighlight', async () => {
    const config = await getConfig();
    config.dialogueHighlight = !config.dialogueHighlight;
    await configService.writeConfig(config);
    deps.dialogueHighlight.setEnabled(config.dialogueHighlight);
    vscode.window.showInformationMessage(`对话高亮：${config.dialogueHighlight ? '开启' : '关闭'}`);
    await refresh();
  }));

  // ========== 敏感词 ==========

  commands.push(vscode.commands.registerCommand('novelAssistant.manageSensitiveWords', async () => {
    await deps.sensitiveService.manage();
    await refresh();
    deps.refreshAll();
  }));

  // ========== 章节 ==========

  commands.push(vscode.commands.registerCommand('novelAssistant.newChapter', async () => {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) {
      vscode.window.showInformationMessage('请先打开一个小说工作区。');
      return;
    }
    const name = await vscode.window.showInputBox({ prompt: '输入章节名（如 第1章）', placeHolder: '第1章' });
    if (!name) {
      return;
    }
    const uri = await deps.chapterService.createChapter(folder, name);
    if (uri) {
      vscode.window.showInformationMessage(`已创建章节：${basename(uri.fsPath)}`);
      deps.refreshAll();
      await vscode.window.showTextDocument(uri);
    }
  }));

  commands.push(vscode.commands.registerCommand('novelAssistant.renameChapter', async (node?: { uri?: vscode.Uri }) => {
    const uri = node?.uri ?? vscode.window.activeTextEditor?.document.uri;
    if (!uri) {
      return;
    }
    const old = basename(uri.fsPath);
    const name = await vscode.window.showInputBox({ prompt: '输入新章节名', value: old });
    if (!name || name === old) {
      return;
    }
    await deps.chapterService.renameChapter(uri, name);
    deps.refreshAll();
  }));

  commands.push(vscode.commands.registerCommand('novelAssistant.deleteChapter', async (node?: { uri?: vscode.Uri }) => {
    const uri = node?.uri ?? vscode.window.activeTextEditor?.document.uri;
    if (!uri) {
      return;
    }
    await deps.chapterService.deleteChapter(uri);
    deps.refreshAll();
  }));

  commands.push(vscode.commands.registerCommand('novelAssistant.setChapterStatus', async (node?: { uri?: vscode.Uri }) => {
    const uri = node?.uri ?? vscode.window.activeTextEditor?.document.uri;
    if (!uri) {
      return;
    }
    const status = await pickChapterStatus();
    if (!status) {
      return;
    }
    await deps.chapterService.setStatus(uri, status);
    vscode.window.showInformationMessage(`章节「${basename(uri.fsPath)}」状态已设为：${statusLabel(status)}`);
    deps.refreshAll();
  }));

  commands.push(vscode.commands.registerCommand('novelAssistant.refreshChapters', async () => {
    deps.chapterTree.refresh();
  }));

  commands.push(vscode.commands.registerCommand('novelAssistant.rebuildChapterIndex', async () => {
    deps.chapterTree.refresh();
    vscode.window.showInformationMessage('章节索引已重建。');
  }));

  commands.push(vscode.commands.registerCommand('novelAssistant.sortChaptersByName', async () => {
    deps.chapterTree.setSortMode('name');
  }));

  commands.push(vscode.commands.registerCommand('novelAssistant.sortChaptersByWords', async () => {
    deps.chapterTree.setSortMode('words');
  }));

  commands.push(vscode.commands.registerCommand('novelAssistant.sortChaptersByMtime', async () => {
    deps.chapterTree.setSortMode('mtime');
  }));

  commands.push(vscode.commands.registerCommand('novelAssistant.openChapterFile', async (chapterName: string) => {
    if (!chapterName) {
      return;
    }
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) {
      return;
    }
    const config = await getConfig();
    const uris = await deps.chapterService.findChapterUris(folder, config);
    const target = uris.find(u => basename(u.fsPath) === chapterName);
    if (!target) {
      vscode.window.showInformationMessage(`未找到章节：${chapterName}`);
      return;
    }
    await vscode.window.showTextDocument(target);
  }));

  // ========== 角色 ==========

  commands.push(vscode.commands.registerCommand('novelAssistant.addSelectionAsCharacter', async (groupId?: string) => {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.selection.isEmpty) {
      vscode.window.showInformationMessage('请先选中文本。');
      return;
    }
    const name = editor.document.getText(editor.selection).trim();
    if (!name) {
      return;
    }
    await deps.characterService.ensureCharacter(name, groupId);
    vscode.window.showInformationMessage(`已将“${name}”设为角色。`);
    deps.refreshAll();
    deps.characterHeatmap.render();
  }));

  commands.push(vscode.commands.registerCommand('novelAssistant.addSelectionAsKeyProp', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.selection.isEmpty) {
      return;
    }
    const name = editor.document.getText(editor.selection).trim();
    if (!name) {
      return;
    }
    // 关键道具 = 高亮组 key_prop 中的词 + 独立角色标记
    const config = await getConfig();
    const propGroup = config.highlights.find(g => g.id === 'key_prop');
    if (propGroup) {
      await deps.highlightGroupService.addWord(propGroup.id, name);
    }
    vscode.window.showInformationMessage(`已将“${name}”设为关键道具。`);
    await refresh();
    deps.refreshAll();
  }));

  commands.push(vscode.commands.registerCommand('novelAssistant.manageCharacters', async () => {
    const characters = await deps.characterService.getAll();
    const actions = [
      { label: '添加角色', description: 'add' },
      { label: '删除角色', description: 'remove' },
      { label: '编辑角色（别名/描述）', description: 'edit' }
    ];
    const pick = await vscode.window.showQuickPick(actions, { placeHolder: '角色管理' });
    if (!pick) {
      return;
    }
    if (pick.description === 'add') {
      const name = await vscode.window.showInputBox({ prompt: '输入角色名' });
      if (!name) {
        return;
      }
      const aliases = await vscode.window.showInputBox({ prompt: '输入别名（逗号分隔，可选）' });
      await deps.characterService.add({
        name,
        aliases: aliases ? aliases.split(/[,，]/).map(a => a.trim()).filter(Boolean) : []
      });
      vscode.window.showInformationMessage(`已添加角色：${name}`);
    } else if (pick.description === 'remove') {
      if (!characters.length) {
        vscode.window.showInformationMessage('暂无角色。');
        return;
      }
      const target = await vscode.window.showQuickPick(characters.map(c => c.name), { placeHolder: '选择要删除的角色' });
      if (!target) {
        return;
      }
      const char = characters.find(c => c.name === target);
      if (char) {
        await deps.characterService.remove(char.id);
        vscode.window.showInformationMessage(`已删除角色：${target}`);
      }
    } else if (pick.description === 'edit') {
      if (!characters.length) {
        return;
      }
      const target = await vscode.window.showQuickPick(characters.map(c => c.name), { placeHolder: '选择要编辑的角色' });
      const char = characters.find(c => c.name === target);
      if (!char) {
        return;
      }
      const name = await vscode.window.showInputBox({ prompt: '角色名', value: char.name });
      const aliases = await vscode.window.showInputBox({ prompt: '别名（逗号分隔）', value: char.aliases.join('，') });
      const description = await vscode.window.showInputBox({ prompt: '描述（可选）', value: char.description });
      await deps.characterService.update({
        ...char,
        name: name ?? char.name,
        aliases: aliases ? aliases.split(/[,，]/).map(a => a.trim()).filter(Boolean) : [],
        description: description ?? char.description
      });
      vscode.window.showInformationMessage('角色已更新。');
    }
    deps.refreshAll();
    deps.characterHeatmap.render();
  }));

  commands.push(vscode.commands.registerCommand('novelAssistant.exportCharacterHeatmap', async () => {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) {
      return;
    }
    const config = await getConfig();
    const chapters = await deps.chapterService.findChapterUris(folder, config);
    const chapterTexts = await Promise.all(
      chapters.map(async uri => {
        try {
          const doc = await vscode.workspace.openTextDocument(uri);
          return { name: basename(uri.fsPath), text: doc.getText() };
        } catch {
          return { name: basename(uri.fsPath), text: '' };
        }
      })
    );
    const rows = await deps.characterService.buildHeatmap(chapterTexts);
    const uri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.joinPath(folder.uri, '角色热力图.csv'),
      filters: { CSV: ['csv'] }
    });
    if (!uri) {
      return;
    }
    const header = `角色,总次数,${chapterTexts.map(c => `"${c.name}"`).join(',')}\n`;
    const lines = rows.map(r => `"${r.character.name}",${r.total},${r.occurrences.map(o => o.count).join(',')}`).join('\n');
    await vscode.workspace.fs.writeFile(uri, Buffer.from(header + lines, 'utf8'));
    vscode.window.showInformationMessage('角色热力图已导出为 CSV。');
  }));

  // ========== 时间线 ==========

  commands.push(vscode.commands.registerCommand('novelAssistant.timelineAdd', async () => {
    const title = await vscode.window.showInputBox({ prompt: '事件标题' });
    if (!title) {
      return;
    }
    const type = await pickTimelineType();
    const status = await pickTimelineStatus();
    const chapter = await vscode.window.showInputBox({ prompt: '所属章节（可选）', placeHolder: '第1章' });
    const storyTime = await vscode.window.showInputBox({ prompt: '故事内时间（可选）' });
    const description = await vscode.window.showInputBox({ prompt: '事件描述（可选）' });
    await deps.timelineService.add({
      title,
      type: (type as TimelineEventType) ?? 'other',
      status: (status as TimelineEventStatus) ?? 'planned',
      chapter: chapter ?? '',
      storyTime: storyTime ?? '',
      description: description ?? ''
    });
    vscode.window.showInformationMessage('时间线事件已添加。');
    deps.refreshAll();
  }));

  commands.push(vscode.commands.registerCommand('novelAssistant.timelineEdit', async (node?: { event?: { id: string } }) => {
    const id = node?.event?.id;
    const events = await deps.timelineService.getAll();
    const event = id ? events.find(e => e.id === id) : undefined;
    const target = event ?? (await pickTimelineEvent(deps));
    if (!target) {
      return;
    }
    const title = await vscode.window.showInputBox({ prompt: '事件标题', value: target.title });
    const description = await vscode.window.showInputBox({ prompt: '事件描述', value: target.description });
    await deps.timelineService.update({
      ...target,
      title: title ?? target.title,
      description: description ?? target.description,
      updatedAt: localIso()
    });
    vscode.window.showInformationMessage('时间线事件已更新。');
    deps.refreshAll();
  }));

  commands.push(vscode.commands.registerCommand('novelAssistant.timelineSetStatus', async (node?: { event?: { id: string } }) => {
    const id = node?.event?.id;
    const events = await deps.timelineService.getAll();
    const event = id ? events.find(e => e.id === id) : undefined;
    const target = event ?? (await pickTimelineEvent(deps));
    if (!target) {
      return;
    }
    const status = await pickTimelineStatus();
    if (!status) {
      return;
    }
    await deps.timelineService.update({ ...target, status: status as TimelineEventStatus, updatedAt: localIso() });
    deps.refreshAll();
  }));

  commands.push(vscode.commands.registerCommand('novelAssistant.timelineRemove', async (node?: { event?: { id: string } }) => {
    const id = node?.event?.id;
    const events = await deps.timelineService.getAll();
    const event = id ? events.find(e => e.id === id) : undefined;
    const target = event ?? (await pickTimelineEvent(deps));
    if (!target) {
      return;
    }
    const ok = await confirm(`确定删除事件「${target.title}」？`, '删除', '取消');
    if (ok) {
      await deps.timelineService.remove(target.id);
      deps.refreshAll();
    }
  }));

  commands.push(vscode.commands.registerCommand('novelAssistant.timelineFilter', async () => {
    const type = await vscode.window.showQuickPick(
      [{ label: '全部类型', description: '' }, ...TIMELINE_TYPES.map(t => ({ label: t.label, description: t.id }))],
      { placeHolder: '按类型筛选' }
    );
    const status = await vscode.window.showQuickPick(
      [{ label: '全部状态', description: '' }, ...TIMELINE_STATUSES.map(s => ({ label: s.label, description: s.id }))],
      { placeHolder: '按状态筛选' }
    );
    deps.timelineTree.setFilter(type?.description, status?.description);
  }));

  // ========== 伏笔 ==========

  commands.push(vscode.commands.registerCommand('novelAssistant.foreshadowAdd', async () => {
    const name = await vscode.window.showInputBox({ prompt: '伏笔名称' });
    if (!name) {
      return;
    }
    const description = await vscode.window.showInputBox({ prompt: '伏笔描述（可选）' });
    const planted = await vscode.window.showInputBox({ prompt: '埋设章节（可选）', placeHolder: '第3章' });
    const priorityInput = await vscode.window.showInputBox({ prompt: '优先级（1-5，默认3）', value: '3' });
    const priority = Math.max(1, Math.min(5, Number(priorityInput) || 3));
    await deps.foreshadowService.add({ name, description: description ?? '', plantedChapter: planted ?? '', priority });
    vscode.window.showInformationMessage(`已埋设伏笔：${name}`);
    deps.refreshAll();
  }));

  commands.push(vscode.commands.registerCommand('novelAssistant.foreshadowAdvance', async (node?: { foreshadow?: { id: string; name: string } }) => {
    const id = node?.foreshadow?.id;
    const list = await deps.foreshadowService.getAll();
    const target = id ? list.find(f => f.id === id) : undefined;
    const foreshadow = target ?? (await pickForeshadow(deps));
    if (!foreshadow) {
      return;
    }
    const chapter = await vscode.window.showInputBox({ prompt: '输入推进章节', placeHolder: '第5章' });
    if (!chapter) {
      return;
    }
    await deps.foreshadowService.advance(foreshadow.id, chapter);
    vscode.window.showInformationMessage(`伏笔「${foreshadow.name}」已在 ${chapter} 推进。`);
    deps.refreshAll();
  }));

  commands.push(vscode.commands.registerCommand('novelAssistant.foreshadowResolve', async (node?: { foreshadow?: { id: string; name: string } }) => {
    const id = node?.foreshadow?.id;
    const list = await deps.foreshadowService.getAll();
    const target = id ? list.find(f => f.id === id) : undefined;
    const foreshadow = target ?? (await pickForeshadow(deps));
    if (!foreshadow) {
      return;
    }
    const chapter = await vscode.window.showInputBox({ prompt: '输入回收章节', placeHolder: '第10章' });
    if (!chapter) {
      return;
    }
    await deps.foreshadowService.markResolved(foreshadow.id, chapter);
    vscode.window.showInformationMessage(`伏笔「${foreshadow.name}」已在 ${chapter} 回收。`);
    deps.refreshAll();
  }));

  commands.push(vscode.commands.registerCommand('novelAssistant.foreshadowSetStatus', async (node?: { foreshadow?: { id: string } }) => {
    const id = node?.foreshadow?.id;
    const list = await deps.foreshadowService.getAll();
    const target = id ? list.find(f => f.id === id) : undefined;
    const foreshadow = target ?? (await pickForeshadow(deps));
    if (!foreshadow) {
      return;
    }
    const status = await pickForeshadowStatus();
    if (!status) {
      return;
    }
    await deps.foreshadowService.update({ ...foreshadow, status: status as ForeshadowStatus, updatedAt: localIso() });
    deps.refreshAll();
  }));

  commands.push(vscode.commands.registerCommand('novelAssistant.foreshadowRemove', async (node?: { foreshadow?: { id: string; name: string } }) => {
    const id = node?.foreshadow?.id;
    const list = await deps.foreshadowService.getAll();
    const target = id ? list.find(f => f.id === id) : undefined;
    const foreshadow = target ?? (await pickForeshadow(deps));
    if (!foreshadow) {
      return;
    }
    const ok = await confirm(`确定删除伏笔「${foreshadow.name}」？`, '删除', '取消');
    if (ok) {
      await deps.foreshadowService.remove(foreshadow.id);
      deps.refreshAll();
    }
  }));

  // ========== 统计面板 / 热力图 ==========

  commands.push(vscode.commands.registerCommand('novelAssistant.openStats', async () => {
    await vscode.commands.executeCommand('novelAssistantStatsDashboard.focus');
  }));

  commands.push(vscode.commands.registerCommand('novelAssistant.openHeatmap', async () => {
    await vscode.commands.executeCommand('novelAssistantCharacterHeatmap.focus');
  }));

  // ========== 数据管理 ==========

  commands.push(vscode.commands.registerCommand('novelAssistant.clearStats', async () => {
    await configService.clearStats();
    await refresh();
    deps.refreshAll();
  }));

  commands.push(vscode.commands.registerCommand('novelAssistant.exportData', async () => {
    await configService.exportAll();
  }));

  commands.push(vscode.commands.registerCommand('novelAssistant.importData', async () => {
    await configService.importAll();
    await refresh();
    deps.refreshAll();
  }));

  // ========== 状态栏点击 ==========

  commands.push(vscode.commands.registerCommand('novelAssistant.statusBarWord', async () => {
    const action = await vscode.window.showQuickPick(
      [
        { label: '查看字数统计详情', description: 'details' },
        { label: '切换字数统计模式', description: 'mode' },
        { label: '配置自定义正则模式', description: 'regex' }
      ],
      { placeHolder: '字数统计操作' }
    );
    if (!action) {
      return;
    }
    if (action.description === 'details') {
      await vscode.commands.executeCommand('novelAssistant.viewCountDetails');
    } else if (action.description === 'mode') {
      await vscode.commands.executeCommand('novelAssistant.switchCountMode');
    } else {
      await vscode.commands.executeCommand('novelAssistant.configureCustomRegexMode');
    }
  }));

  commands.push(vscode.commands.registerCommand('novelAssistant.statusBarTime', async () => {
    await vscode.commands.executeCommand('novelAssistant.toggleTimer');
  }));

  commands.push(vscode.commands.registerCommand('novelAssistant.statusBarSpeed', async () => {
    await vscode.commands.executeCommand('novelAssistant.showSpeedDetails');
  }));

  commands.push(vscode.commands.registerCommand('novelAssistant.statusBarGoal', async () => {
    await vscode.commands.executeCommand('novelAssistant.setGoals');
  }));

  commands.push(vscode.commands.registerCommand('novelAssistant.statusBarPomodoro', async () => {
    const config = await getConfig();
    if (!deps.pomodoroService.isRunning()) {
      await vscode.commands.executeCommand('novelAssistant.startPomodoro');
      return;
    }
    const action = await vscode.window.showQuickPick(
      [
        { label: '暂停/继续', description: 'toggle' },
        { label: '停止', description: 'stop' }
      ],
      { placeHolder: '番茄钟操作' }
    );
    if (!action) {
      return;
    }
    if (action.description === 'toggle') {
      await vscode.commands.executeCommand('novelAssistant.pausePomodoro');
    } else {
      await vscode.commands.executeCommand('novelAssistant.stopPomodoro');
    }
  }));

  commands.push(vscode.commands.registerCommand('novelAssistant.statusBarSprint', async () => {
    const action = await vscode.window.showQuickPick(
      [
        { label: '暂停/继续', description: 'toggle' },
        { label: '停止', description: 'stop' }
      ],
      { placeHolder: '冲刺操作' }
    );
    if (!action) {
      return;
    }
    if (action.description === 'toggle') {
      await vscode.commands.executeCommand('novelAssistant.pauseSprint');
    } else {
      await vscode.commands.executeCommand('novelAssistant.stopSprint');
    }
  }));

  return commands;
}

// ========== 内部辅助 ==========

async function manageHighlightGroups(deps: CommandContext): Promise<void> {
  const config = await deps.getConfig();
  const groupPick = await vscode.window.showQuickPick(
    config.highlights.map(g => ({
      label: `${g.enabled ? '●' : '○'} ${g.name} (${g.words.length}) ${g.color}`,
      description: g.id
    })),
    { placeHolder: '选择要管理的高亮组' }
  );
  if (!groupPick) {
    return;
  }
  const group = config.highlights.find(g => g.id === groupPick.description);
  if (!group) {
    return;
  }
  const actions = [
    { label: '添加词', description: 'add_word' },
    { label: '删除词', description: 'remove_word' },
    { label: '重命名组', description: 'rename' },
    { label: '修改颜色', description: 'color' },
    { label: '切换样式', description: 'style' },
    { label: '启用/禁用', description: 'toggle' },
    { label: '删除组', description: 'delete' }
  ];
  const action = await vscode.window.showQuickPick(actions, { placeHolder: `管理「${group.name}」` });
  if (!action) {
    return;
  }
  switch (action.description) {
    case 'add_word': {
      const word = await vscode.window.showInputBox({ prompt: '输入高亮词' });
      if (word) {
        await deps.highlightGroupService.addWord(group.id, word);
        vscode.window.showInformationMessage(`已添加词：${word}`);
      }
      break;
    }
    case 'remove_word': {
      if (!group.words.length) {
        vscode.window.showInformationMessage('该组暂无词。');
        return;
      }
      const word = await vscode.window.showQuickPick(group.words, { placeHolder: '选择要删除的词' });
      if (word) {
        await deps.highlightGroupService.removeWord(group.id, word);
      }
      break;
    }
    case 'rename': {
      const name = await vscode.window.showInputBox({ prompt: '输入新组名', value: group.name });
      if (name) {
        await deps.highlightGroupService.updateGroup(group.id, { name });
      }
      break;
    }
    case 'color': {
      const color = await pickColor();
      if (color) {
        await deps.highlightGroupService.updateGroup(group.id, { color });
      }
      break;
    }
    case 'style': {
      const styles = [
        { label: '背景色块', description: 'background' },
        { label: '下划线', description: 'underline' },
        { label: '边框', description: 'border' },
        { label: '加粗', description: 'bold' },
        { label: '斜体', description: 'italic' }
      ];
      const pick = await vscode.window.showQuickPick(styles, { placeHolder: '选择样式' });
      if (pick) {
        await deps.highlightGroupService.updateGroup(group.id, { style: pick.description as never });
      }
      break;
    }
    case 'toggle':
      await deps.highlightGroupService.updateGroup(group.id, { enabled: !group.enabled });
      break;
    case 'delete': {
      const ok = await confirm(`确定删除组「${group.name}」？`, '删除', '取消');
      if (ok) {
        await deps.highlightGroupService.removeGroup(group.id);
      }
      break;
    }
  }
}

async function pickTimelineEvent(deps: CommandContext): Promise<TimelineEventLike | undefined> {
  const events = await deps.timelineService.getAll();
  if (!events.length) {
    vscode.window.showInformationMessage('暂无时间线事件。');
    return undefined;
  }
  const pick = await vscode.window.showQuickPick(
    events.map(e => ({ label: e.title, description: e.id })),
    { placeHolder: '选择时间线事件' }
  );
  return events.find(e => e.id === pick?.description);
}

interface TimelineEventLike {
  id: string;
  title: string;
  description: string;
  chapter: string;
  storyTime: string;
  type: TimelineEventType;
  status: TimelineEventStatus;
  characters: string[];
  locations: string[];
  createdAt: string;
  updatedAt: string;
}

async function pickForeshadow(deps: CommandContext): Promise<ForeshadowLike | undefined> {
  const list = await deps.foreshadowService.getAll();
  if (!list.length) {
    vscode.window.showInformationMessage('暂无伏笔。');
    return undefined;
  }
  const pick = await vscode.window.showQuickPick(
    list.map(f => ({ label: f.name, description: f.id })),
    { placeHolder: '选择伏笔' }
  );
  return list.find(f => f.id === pick?.description);
}

interface ForeshadowLike {
  id: string;
  name: string;
  description: string;
  plantedChapter: string;
  advancedChapters: string[];
  resolvedChapter: string;
  status: ForeshadowStatus;
  priority: number;
  createdAt: string;
  updatedAt: string;
}

export function applyTypewriter(editor: vscode.TextEditor): void {
  const line = editor.selection.active.line;
  const position = new vscode.Position(Math.max(0, line), 0);
  editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
}

export function statusLabel(status: ChapterStatus): string {
  switch (status) {
    case 'draft':
      return '草稿';
    case 'revising':
      return '修改中';
    case 'done':
      return '完成';
  }
}
