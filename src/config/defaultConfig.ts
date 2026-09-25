import { NovelConfig, HighlightGroup, SensitiveWordsConfig } from '../types';

/**
 * 内置默认高亮组（主角/配角/关键道具/地点/自定义）
 */
export const DEFAULT_HIGHLIGHT_GROUPS: HighlightGroup[] = [
  {
    id: 'protagonist',
    name: '主角',
    color: '#FFD700',
    enabled: true,
    priority: 1,
    words: [],
    matchCase: false,
    wholeWord: false,
    regex: false,
    style: 'background'
  },
  {
    id: 'supporting',
    name: '配角',
    color: '#87CEEB',
    enabled: true,
    priority: 2,
    words: [],
    matchCase: false,
    wholeWord: false,
    regex: false,
    style: 'background'
  },
  {
    id: 'key_prop',
    name: '关键道具',
    color: '#FFB6C1',
    enabled: true,
    priority: 3,
    words: [],
    matchCase: false,
    wholeWord: false,
    regex: false,
    style: 'background'
  },
  {
    id: 'location',
    name: '地点',
    color: '#90EE90',
    enabled: true,
    priority: 4,
    words: [],
    matchCase: false,
    wholeWord: false,
    regex: false,
    style: 'background'
  },
  {
    id: 'custom',
    name: '自定义',
    color: '#D3D3D3',
    enabled: true,
    priority: 5,
    words: [],
    matchCase: false,
    wholeWord: false,
    regex: false,
    style: 'background'
  }
];

/**
 * 内置默认敏感词词库（仅示例级，可整体关闭）。
 * 按 严重/警告/提示 三级。
 */
export const DEFAULT_SENSITIVE_WORDS: SensitiveWordsConfig = {
  enabled: true,
  levels: {
    severe: [],
    warning: [],
    info: []
  }
};

/**
 * 内置默认工作区配置（与规划文档 5.1 节一致）。
 */
export const DEFAULT_CONFIG: NovelConfig = {
  version: 2,
  fileExtensions: ['.txt', '.md', '.text', '.novel'],
  excludeGlobs: ['.vscode/**', 'node_modules/**', '.git/**', '**/.git/**'],
  countMode: 'qidian',
  countModes: {
    custom: { type: 'custom_weight', rules: [
      { type: 'whitespace', weight: 0 },
      { type: 'cjk', weight: 1 },
      { type: 'punctuation', weight: 1 },
      { type: 'ascii_word', weight: 1 },
      { type: 'digit_sequence', weight: 1 },
      { type: 'other', weight: 1 }
    ]}
  },
  countExcludes: {
    skipTitleLines: false,
    skipAuthorNotes: false,
    skipDividers: false
  },
  autoFormatOnSave: false,
  formatIndent: '    ',
  skipTitleIndent: true,
  skipQuoteIndent: true,
  skipListIndent: true,
  titlePatterns: [
    '^第[一二三四五六七八九十百千万零两0-9]+[章回节卷部篇]',
    '^Chapter\\s+\\d+',
    '^序章',
    '^楔子',
    '^尾声',
    '^后记'
  ],
  idleThresholdSeconds: 120,
  pauseCreativeTimeWhenIdle: false,
  pasteThresholdChars: 30,
  pasteIntervalMs: 500,
  highlights: DEFAULT_HIGHLIGHT_GROUPS,
  sensitiveWords: DEFAULT_SENSITIVE_WORDS,
  goals: {
    dailyWords: 2000,
    dailyMinutes: 60,
    dailyPomodoros: 4,
    dailyActiveMinutes: 45
  },
  pomodoro: {
    workMinutes: 25,
    shortBreakMinutes: 5,
    longBreakMinutes: 15,
    cyclesBeforeLongBreak: 4,
    autoContinue: true,
    pauseWhenIdle: false
  },
  sprint: {
    defaultMinutes: 15,
    defaultTargetWords: 500
  },
  typewriterMode: false,
  dialogueHighlight: false,
  focusMode: {
    hideSidebar: true,
    hidePanel: true,
    fullScreen: false
  }
};

/** 配置当前版本号 */
export const CONFIG_VERSION = 2;
/** 统计文件版本号 */
export const STATS_VERSION = 1;
/** 故事数据文件版本号 */
export const DATA_VERSION = 1;
