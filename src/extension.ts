import * as vscode from 'vscode';
import { NovelConfig } from './types';
import { ConfigService } from './config/configService';
import { StatsService } from './stats/statsService';
import { GoalService } from './stats/goalService';
import { HeatmapService } from './stats/heatmapService';
import { FocusWatcher } from './timer/focusWatcher';
import { InputSpeedService } from './timer/inputSpeedService';
import { TimerService } from './timer/timerService';
import { HighlightService } from './highlight/highlightService';
import { HighlightGroupService } from './highlight/highlightGroupService';
import { DialogueHighlightService } from './highlight/dialogueHighlight';
import { PomodoroService } from './pomodoro/pomodoroService';
import { SprintService } from './sprint/sprintService';
import { SensitiveWordService } from './sensitive/sensitiveWordService';
import { ChapterService } from './chapters/chapterService';
import { CharacterService } from './characters/characterService';
import { TimelineService } from './timeline/timelineService';
import { ForeshadowService } from './foreshadow/foreshadowService';
import { FormatService } from './format/formatService';
import { StatusBarController } from './ui/statusBar';
import { ChapterTreeProvider } from './chapters/chapterTreeProvider';
import { HighlightTreeProvider } from './ui/highlightTreeProvider';
import { SensitiveTreeProvider } from './ui/sensitiveTreeProvider';
import { TimelineTreeProvider } from './ui/timelineTreeProvider';
import { ForeshadowTreeProvider } from './ui/foreshadowTreeProvider';
import { StatsDashboardProvider } from './ui/statsDashboardProvider';
import { CharacterHeatmapProvider } from './ui/characterHeatmapProvider';
import { registerCommands, applyTypewriter } from './ui/commands';
import { countText, countWithExcludes } from './count/countEngine';
import { debounce } from './utils/debounce';
import { basename, localDateKey } from './utils/text';

export async function activate(context: vscode.ExtensionContext) {
  // ================= 基础服务 =================
  const configService = new ConfigService();
  const statsService = new StatsService(configService);
  const goalService = new GoalService(statsService);
  const heatmapService = new HeatmapService(statsService);
  const focusWatcher = new FocusWatcher();
  const inputSpeed = new InputSpeedService();
  const timerService = new TimerService(
    focusWatcher,
    inputSpeed,
    statsService,
    () => configService.getCurrentFolder()
  );

  const getConfig = (): Promise<NovelConfig> => configService.getConfig();
  const saveConfig = (c: NovelConfig): Promise<void> => configService.writeConfig(c);

  // ================= 业务服务 =================
  const highlightGroupService = new HighlightGroupService(getConfig, saveConfig);
  const highlightService = new HighlightService(getConfig);
  const dialogueHighlight = new DialogueHighlightService();
  const pomodoroService = new PomodoroService(
    focusWatcher,
    statsService,
    inputSpeed,
    async () => (await getConfig()).pomodoro,
    async () => (await getConfig()).goals.dailyWords
  );
  const sprintService = new SprintService(focusWatcher, statsService, async () => (await getConfig()).sprint);
  const sensitiveService = new SensitiveWordService(configService);
  const formatService = new FormatService(configService);
  const characterService = new CharacterService(configService);
  const timelineService = new TimelineService(configService);
  const foreshadowService = new ForeshadowService(configService);

  const checkSensitive = (text: string): boolean => {
    const snapshot = sensitiveService.getWordsSnapshot();
    const all = [...snapshot.severe, ...snapshot.warning, ...snapshot.info].filter(Boolean);
    return all.some(w => text.includes(w));
  };
  const chapterService = new ChapterService(
    configService,
    checkSensitive,
    chapterName => foreshadowService.chapterHasOpenForeshadow(chapterName)
  );

  // ================= UI 服务 =================
  const chapterTree = new ChapterTreeProvider(chapterService, getConfig);
  const highlightTree = new HighlightTreeProvider(highlightGroupService);
  const sensitiveTree = new SensitiveTreeProvider(sensitiveService);
  const timelineTree = new TimelineTreeProvider(timelineService);
  const foreshadowTree = new ForeshadowTreeProvider(foreshadowService);
  const statsDashboard = new StatsDashboardProvider(
    statsService,
    heatmapService,
    goalService,
    pomodoroService,
    sprintService,
    getConfig
  );
  const characterHeatmap = new CharacterHeatmapProvider(characterService, chapterService, getConfig);
  const statusBar = new StatusBarController();

  // ================= 状态栏刷新 =================
  const refreshStatusBar = async () => {
    const editor = vscode.window.activeTextEditor;
    const config = await getConfig();
    const text = editor?.document.getText() ?? '';
    const wordCount = countWithExcludes(text, config.countMode, config);
    const selectedCount =
      editor && !editor.selection.isEmpty
        ? countWithExcludes(editor.document.getText(editor.selection), config.countMode, config)
        : undefined;
    const today = await statsService.getToday();
    const progress = await goalService.getTodayProgress(config.goals);

    const instant = inputSpeed.getInstantSpeed();
    const shortTerm = inputSpeed.getShortTermSpeed();
    const sessionAvg = inputSpeed.getSessionAverageSpeed();
    const displaySpeed = shortTerm > 0 ? shortTerm : instant > 0 ? instant : sessionAvg;
    const speedLabel = `${Math.round(displaySpeed)} 字/分`;

    statusBar.update(
      {
        config,
        wordCount,
        countModeName: config.countMode,
        todayActiveSeconds: today.activeSeconds,
        speed: displaySpeed,
        speedLabel,
        goalPct: progress.wordsPct,
        goalText: `字数 ${progress.wordsPct}% (${today.addedWords}/${config.goals.dailyWords})\n时间 ${progress.minutesPct}%\n番茄 ${progress.pomodoroPct}%\n输入 ${progress.activeMinutesPct}%`,
        pomodoroText: pomodoroService.getStatusText(),
        sprintText: sprintService.isRunning() ? sprintService.getStatusText() : undefined,
        selectedTextCount: selectedCount
      },
      editor
    );
  };

  const refreshAll = () => {
    chapterTree.refresh();
    highlightTree.refresh();
    sensitiveTree.refresh();
    timelineTree.refresh();
    foreshadowTree.refresh();
  };

  // ================= 事件监听 =================

  const onDidChangeTextDocument = vscode.workspace.onDidChangeTextDocument(event => {
    if (event.document.uri.scheme !== 'file') {
      return;
    }
    const inserted = event.contentChanges.map(c => c.text).join('');
    inputSpeed.recordChange(inserted);
    if (event.document === vscode.window.activeTextEditor?.document) {
      sensitiveService.schedule();
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        highlightService.schedule(editor);
        if (dialogueHighlight.isEnabled()) {
          dialogueHighlight.apply(editor);
        }
      }
    }
    scheduleStatusBarRefresh();
  });

  const debouncedStatusBarRefresh = debounce(() => void refreshStatusBar(), 300);
  const scheduleStatusBarRefresh = () => debouncedStatusBarRefresh();

  const onDidSaveTextDocument = vscode.workspace.onDidSaveTextDocument(async document => {
    if (document.uri.scheme !== 'file') {
      return;
    }
    const config = await getConfig();
    // 保存时自动格式化
    if (config.autoFormatOnSave) {
      await formatService.formatDocument(document, config);
    }
    // 记录文档字数
    const name = basename(document.fileName);
    statsService.recordDocumentWords(name, countWithExcludes(document.getText(), config.countMode, config));
    await refreshStatusBar();
    chapterTree.refresh();
  });

  const onDidChangeWindowState = vscode.window.onDidChangeWindowState(state => {
    if (state.focused) {
      void (async () => {
        const config = await getConfig();
        if (config.pomodoro.autoContinue) {
          pomodoroService.resumeIfPaused();
        }
        sprintService.resumeIfPaused();
      })();
    }
    void refreshStatusBar();
  });

  const onDidChangeActiveTextEditor = vscode.window.onDidChangeActiveTextEditor(editor => {
    if (!editor) {
      return;
    }
    highlightService.schedule(editor);
    if (dialogueHighlight.isEnabled()) {
      dialogueHighlight.apply(editor);
    }
    const configPromise = getConfig();
    void configPromise.then(config => {
      if (config.typewriterMode) {
        applyTypewriter(editor);
      }
    });
    void refreshStatusBar();
  });

  const onDidChangeSelection = vscode.window.onDidChangeTextEditorSelection(event => {
    void getConfig().then(config => {
      if (config.typewriterMode) {
        applyTypewriter(event.textEditor);
      }
    });
    scheduleStatusBarRefresh();
  });

  const onDidOpenTextDocument = vscode.workspace.onDidOpenTextDocument(() => {
    chapterTree.refresh();
  });

  const onDidCloseTextDocument = vscode.workspace.onDidCloseTextDocument(() => {
    chapterTree.refresh();
  });

  // 配置文件变更监听：重新加载配置并刷新
  const configWatcher = vscode.workspace.createFileSystemWatcher('**/.vscode/novel-assistant.json');
  const onConfigFileChange = () => {
    void (async () => {
      const config = await getConfig();
      inputSpeed.setConfig({
        pasteThresholdChars: config.pasteThresholdChars,
        pasteIntervalMs: config.pasteIntervalMs
      });
      timerService.setConfig({
        idleThresholdSeconds: config.idleThresholdSeconds,
        pauseCreativeTimeWhenIdle: config.pauseCreativeTimeWhenIdle
      });
      await highlightService.reload();
      await sensitiveService.reload(config);
      dialogueHighlight.setEnabled(config.dialogueHighlight);
      await refreshStatusBar();
      refreshAll();
    })();
  };
  configWatcher.onDidChange(onConfigFileChange);
  configWatcher.onDidCreate(onConfigFileChange);
  configWatcher.onDidDelete(onConfigFileChange);

  // 番茄钟/冲刺状态变化 → 状态栏更新
  pomodoroService.onDidChange(() => void refreshStatusBar());
  sprintService.onDidChange(() => void refreshStatusBar());

  // ================= 周期任务 =================
  let lastRecordedTodayWords = 0;
  let lastRecordedTodayInputSeconds = 0;
  let lastDocWordRecord = '';
  const periodicTimer = setInterval(() => {
    void (async () => {
      const todayWords = inputSpeed.getTodayWords();
      const deltaWords = todayWords - lastRecordedTodayWords;
      if (deltaWords > 0) {
        statsService.recordAddedWords(deltaWords);
        lastRecordedTodayWords = todayWords;
      }
      const todayInputSeconds = inputSpeed.getTodayInputSeconds();
      const deltaSeconds = todayInputSeconds - lastRecordedTodayInputSeconds;
      if (deltaSeconds > 0) {
        statsService.recordInputSeconds(deltaSeconds);
        lastRecordedTodayInputSeconds = todayInputSeconds;
      }
      // 记录当前文档字数
      const editor = vscode.window.activeTextEditor;
      if (editor && editor.document.uri.toString() !== lastDocWordRecord) {
        lastDocWordRecord = editor.document.uri.toString();
      }
      if (editor) {
        const config = await getConfig();
        statsService.recordDocumentWords(
          basename(editor.document.fileName),
          countWithExcludes(editor.document.getText(), config.countMode, config)
        );
      }
      // 每日目标达成通知（一天一次）
      await checkGoalAchievement(context, statsService, goalService, getConfig);
      await refreshStatusBar();
    })();
  }, 60_000);

  // ================= 视图注册 =================
  const chapterTreeView = vscode.window.createTreeView('novelAssistantChapters', { treeDataProvider: chapterTree });
  const highlightTreeView = vscode.window.createTreeView('novelAssistantHighlights', { treeDataProvider: highlightTree });
  const sensitiveTreeView = vscode.window.createTreeView('novelAssistantSensitiveWords', { treeDataProvider: sensitiveTree });
  const timelineTreeView = vscode.window.createTreeView('novelAssistantTimeline', { treeDataProvider: timelineTree });
  const foreshadowTreeView = vscode.window.createTreeView('novelAssistantForeshadows', { treeDataProvider: foreshadowTree });

  const statsDashboardView = vscode.window.registerWebviewViewProvider('novelAssistantStatsDashboard', statsDashboard);
  const characterHeatmapView = vscode.window.registerWebviewViewProvider('novelAssistantCharacterHeatmap', characterHeatmap);

  // ================= 命令注册 =================
  const commands = registerCommands({
    context,
    configService,
    statsService,
    goalService,
    timerService,
    inputSpeed,
    focusWatcher,
    highlightService,
    highlightGroupService,
    dialogueHighlight,
    pomodoroService,
    sprintService,
    sensitiveService,
    chapterService,
    characterService,
    timelineService,
    foreshadowService,
    formatService,
    statusBar,
    chapterTree,
    highlightTree,
    sensitiveTree,
    timelineTree,
    foreshadowTree,
    statsDashboard,
    characterHeatmap,
    getConfig,
    refreshStatusBar,
    refreshAll
  });

  // ================= 初始化 =================
  const initialConfig = await getConfig();
  inputSpeed.setConfig({
    pasteThresholdChars: initialConfig.pasteThresholdChars,
    pasteIntervalMs: initialConfig.pasteIntervalMs
  });
  timerService.setConfig({
    idleThresholdSeconds: initialConfig.idleThresholdSeconds,
    pauseCreativeTimeWhenIdle: initialConfig.pauseCreativeTimeWhenIdle
  });
  await highlightService.reload();
  await sensitiveService.reload(initialConfig);
  dialogueHighlight.setEnabled(initialConfig.dialogueHighlight);

  statusBar.setHandlers({
    onWordClick: () => void vscode.commands.executeCommand('novelAssistant.statusBarWord'),
    onTimeClick: () => void vscode.commands.executeCommand('novelAssistant.statusBarTime'),
    onSpeedClick: () => void vscode.commands.executeCommand('novelAssistant.statusBarSpeed'),
    onGoalClick: () => void vscode.commands.executeCommand('novelAssistant.statusBarGoal'),
    onPomodoroClick: () => void vscode.commands.executeCommand('novelAssistant.statusBarPomodoro'),
    onSprintClick: () => void vscode.commands.executeCommand('novelAssistant.statusBarSprint')
  });

  await statsService.getToday(); // 预热统计
  await refreshStatusBar();
  refreshAll();

  // ================= 资源清理 =================
  context.subscriptions.push(
    chapterTreeView,
    highlightTreeView,
    sensitiveTreeView,
    timelineTreeView,
    foreshadowTreeView,
    statsDashboardView,
    characterHeatmapView,
    ...commands,
    onDidChangeTextDocument,
    onDidSaveTextDocument,
    onDidChangeWindowState,
    onDidChangeActiveTextEditor,
    onDidChangeSelection,
    onDidOpenTextDocument,
    onDidCloseTextDocument,
    configWatcher,
    statusBar,
    highlightService,
    dialogueHighlight,
    pomodoroService,
    sprintService,
    sensitiveService,
    timerService,
    statsService,
    focusWatcher,
    {
      dispose: () => {
        clearInterval(periodicTimer);
        debouncedStatusBarRefresh.cancel();
      }
    }
  );
}

/** 每日目标达成通知（一天仅一次） */
async function checkGoalAchievement(
  context: vscode.ExtensionContext,
  statsService: StatsService,
  goalService: GoalService,
  getConfig: () => Promise<NovelConfig>
): Promise<void> {
  const key = 'novelAssistant.goalNotified';
  const today = localDateKey();
  if (context.globalState.get<string>(key) === today) {
    return;
  }
  const config = await getConfig();
  const progress = await goalService.getTodayProgress(config.goals);
  if (progress.reached) {
    await context.globalState.update(key, today);
    vscode.window.showInformationMessage(`🎉 今日写作目标已达成：${config.goals.dailyWords} 字！`);
  }
}

export function deactivate(): void {
  // 服务 dispose 由 context.subscriptions 统一处理
}
