/**
 * 小说助手共享类型定义
 * 本文件是各模块之间的唯一类型契约来源，其他模块一律从此导入。
 */

/** 高亮组 */
export interface HighlightGroup {
  id: string;
  name: string;
  color: string;
  enabled: boolean;
  priority: number;
  words: string[];
  matchCase: boolean;
  wholeWord: boolean;
  regex: boolean;
  style: 'background' | 'underline' | 'border' | 'bold' | 'italic';
}

/** 敏感词三级配置 */
export interface SensitiveWordsConfig {
  enabled: boolean;
  levels: {
    severe: string[];
    warning: string[];
    info: string[];
  };
}

/** 每日目标配置 */
export interface GoalConfig {
  dailyWords: number;
  dailyMinutes: number;
  dailyPomodoros: number;
  dailyActiveMinutes: number;
}

/** 番茄钟配置 */
export interface PomodoroConfig {
  workMinutes: number;
  shortBreakMinutes: number;
  longBreakMinutes: number;
  cyclesBeforeLongBreak: number;
  autoContinue: boolean;
  pauseWhenIdle: boolean;
}

/** 写作冲刺配置 */
export interface SprintConfig {
  defaultMinutes: number;
  defaultTargetWords: number;
}

/** 专注模式配置 */
export interface FocusModeConfig {
  hideSidebar: boolean;
  hidePanel: boolean;
  fullScreen: boolean;
}

/** 自定义权重计数规则 */
export interface WeightRule {
  type: 'cjk' | 'punctuation' | 'whitespace' | 'ascii_word' | 'digit_sequence' | 'other';
  weight: number;
}

/** 自定义计数模式 */
export interface CustomCountMode {
  type: 'custom_regex' | 'custom_weight';
  /** custom_regex 时使用的正则 */
  regex?: string;
  /** custom_regex：按匹配次数还是匹配字符数统计 */
  countBy?: 'chars' | 'matches';
  /** custom_weight 时使用的规则 */
  rules?: WeightRule[];
}

/** 工作区配置（.vscode/novel-assistant.json） */
export interface NovelConfig {
  version: number;
  fileExtensions: string[];
  excludeGlobs: string[];
  countMode: string;
  /** 自定义计数模式表，键为模式 id */
  countModes: Record<string, CustomCountMode>;
  /** 计数排除规则 */
  countExcludes: {
    skipTitleLines: boolean;
    skipAuthorNotes: boolean;
    skipDividers: boolean;
  };
  autoFormatOnSave: boolean;
  formatIndent: string;
  skipTitleIndent: boolean;
  skipQuoteIndent: boolean;
  skipListIndent: boolean;
  titlePatterns: string[];
  idleThresholdSeconds: number;
  pauseCreativeTimeWhenIdle: boolean;
  pasteThresholdChars: number;
  pasteIntervalMs: number;
  highlights: HighlightGroup[];
  sensitiveWords: SensitiveWordsConfig;
  goals: GoalConfig;
  pomodoro: PomodoroConfig;
  sprint: SprintConfig;
  typewriterMode: boolean;
  dialogueHighlight: boolean;
  focusMode: FocusModeConfig;
}

/** 章节状态 */
export type ChapterStatus = 'draft' | 'revising' | 'done';

/** 事件类型 */
export type TimelineEventType = 'battle' | 'romance' | 'twist' | 'daily' | 'foreshadow' | 'other';

/** 事件状态 */
export type TimelineEventStatus = 'planned' | 'written' | 'revised' | 'abandoned';

/** 故事时间线事件 */
export interface TimelineEvent {
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

/** 伏笔状态 */
export type ForeshadowStatus = 'unresolved' | 'partially' | 'resolved' | 'abandoned';

/** 伏笔 */
export interface Foreshadow {
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

/** 角色 */
export interface Character {
  id: string;
  name: string;
  aliases: string[];
  highlightGroupId?: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

/** 章节状态记录（文件名 -> 状态） */
export interface ChapterStatusRecord {
  [fileName: string]: ChapterStatus;
}

/** 故事管理数据（.vscode/novel-assistant-data.json） */
export interface NovelData {
  version: number;
  characters: Character[];
  timeline: TimelineEvent[];
  foreshadows: Foreshadow[];
  chapterStatus: ChapterStatusRecord;
}

/** 每日统计 */
export interface DailyStats {
  words: number;
  activeSeconds: number;
  inputSeconds: number;
  pomodoros: number;
  sprints: number;
  speed: number;
  /** 今日新增字数（不含撤销等近似处理，仅净增） */
  addedWords: number;
}

/** 文档统计 */
export interface DocumentStats {
  words: number;
  activeSeconds: number;
  lastEdited: string;
}

/** 会话统计 */
export interface SessionRecord {
  start: string;
  end: string;
  words: number;
  activeSeconds: number;
  inputSeconds: number;
}

/** 番茄钟历史记录 */
export interface PomodoroRecord {
  start: string;
  end: string;
  words: number;
  speed: number;
  reached: boolean;
}

/** 冲刺历史记录 */
export interface SprintRecord {
  start: string;
  end: string;
  minutes: number;
  words: number;
  speed: number;
  targetWords: number;
  reached: boolean;
}

/** 统计文件（.vscode/novel-assistant-stats.json） */
export interface StatsFile {
  version: number;
  daily: Record<string, DailyStats>;
  documents: Record<string, DocumentStats>;
  sessions: SessionRecord[];
  pomodoroHistory: PomodoroRecord[];
  sprintHistory: SprintRecord[];
}

/** 番茄钟运行状态 */
export type PomodoroMode = 'idle' | 'work' | 'shortBreak' | 'longBreak' | 'paused';

/** 冲刺运行状态 */
export type SprintState = 'idle' | 'running' | 'paused';

/** 字符统计引擎模式接口 */
export interface CountMode {
  id: string;
  name: string;
  count(text: string): number;
}
