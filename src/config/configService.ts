import * as vscode from 'vscode';
import { NovelConfig, StatsFile, NovelData, SensitiveWordsConfig } from '../types';
import { DEFAULT_CONFIG, CONFIG_VERSION, STATS_VERSION, DATA_VERSION } from './defaultConfig';
import { basename } from '../utils/text';

/**
 * 配置服务：负责工作区配置、统计文件、故事数据文件、敏感词词库文件的读写。
 * 优先级：工作区配置 > 全局配置 > 内置默认值（见规划文档 3.5.2）。
 */

function decode(data: Uint8Array): string {
  return Buffer.from(data).toString('utf8');
}

function encode(text: string): Uint8Array {
  return Buffer.from(text, 'utf8');
}

export class ConfigService {
  /** 当前工作区根文件夹（基于活动编辑器） */
  public async getCurrentFolder(): Promise<vscode.WorkspaceFolder | undefined> {
    const active = vscode.window.activeTextEditor?.document.uri;
    if (active) {
      const folder = vscode.workspace.getWorkspaceFolder(active);
      if (folder) {
        return folder;
      }
    }
    return vscode.workspace.workspaceFolders?.[0];
  }

  /** 给定 uri 所属的根文件夹 */
  public getFolderForUri(uri: vscode.Uri): vscode.WorkspaceFolder | undefined {
    return vscode.workspace.getWorkspaceFolder(uri);
  }

  private async ensureVscodeDir(folder: vscode.WorkspaceFolder): Promise<vscode.Uri> {
    const dir = vscode.Uri.joinPath(folder.uri, '.vscode');
    try {
      await vscode.workspace.fs.stat(dir);
    } catch {
      await vscode.workspace.fs.createDirectory(dir);
    }
    return dir;
  }

  public workspaceConfigUri(folder: vscode.WorkspaceFolder): vscode.Uri {
    return vscode.Uri.joinPath(folder.uri, '.vscode', 'novel-assistant.json');
  }

  public statsUri(folder: vscode.WorkspaceFolder): vscode.Uri {
    return vscode.Uri.joinPath(folder.uri, '.vscode', 'novel-assistant-stats.json');
  }

  public dataUri(folder: vscode.WorkspaceFolder): vscode.Uri {
    return vscode.Uri.joinPath(folder.uri, '.vscode', 'novel-assistant-data.json');
  }

  public sensitiveFileUri(folder: vscode.WorkspaceFolder): vscode.Uri {
    return vscode.Uri.joinPath(folder.uri, '.vscode', 'novel-assistant-sensitive.txt');
  }

  private async readJsonFile<T>(uri: vscode.Uri): Promise<T | undefined> {
    try {
      const raw = await vscode.workspace.fs.readFile(uri);
      const text = decode(raw);
      if (!text.trim()) {
        return undefined;
      }
      return JSON.parse(text) as T;
    } catch {
      return undefined;
    }
  }

  private async writeJsonFile(uri: vscode.Uri, value: unknown): Promise<void> {
    const content = JSON.stringify(value, null, 2);
    await vscode.workspace.fs.writeFile(uri, encode(content));
  }

  private async ensureParent(uri: vscode.Uri): Promise<void> {
    const dir = vscode.Uri.joinPath(uri, '..');
    try {
      await vscode.workspace.fs.stat(dir);
    } catch {
      await vscode.workspace.fs.createDirectory(dir);
    }
  }

  // ========== 工作区配置 ==========

  /** 读取工作区配置；不存在时返回默认配置（不自动写入）。 */
  public async getConfig(folder?: vscode.WorkspaceFolder): Promise<NovelConfig> {
    const target = folder ?? (await this.getCurrentFolder());
    if (!target) {
      return this.mergeWithGlobal(DEFAULT_CONFIG);
    }
    const uri = this.workspaceConfigUri(target);
    const parsed = await this.readJsonFile<Partial<NovelConfig>>(uri);
    if (!parsed) {
      return this.mergeWithGlobal(DEFAULT_CONFIG);
    }
    const migrated = this.migrateConfig(parsed, uri);
    return this.mergeWithGlobal(migrated);
  }

  /** 写入工作区配置（自动补齐默认字段） */
  public async writeConfig(config: NovelConfig, folder?: vscode.WorkspaceFolder): Promise<void> {
    const target = folder ?? (await this.getCurrentFolder());
    if (!target) {
      return;
    }
    const uri = this.workspaceConfigUri(target);
    await this.ensureParent(uri);
    const merged = { ...this.mergeWithGlobal(config), version: CONFIG_VERSION };
    await this.writeJsonFile(uri, merged);
  }

  /** 判断工作区是否已有配置文件 */
  public async hasWorkspaceConfig(folder?: vscode.WorkspaceFolder): Promise<boolean> {
    const target = folder ?? (await this.getCurrentFolder());
    if (!target) {
      return false;
    }
    try {
      await vscode.workspace.fs.stat(this.workspaceConfigUri(target));
      return true;
    } catch {
      return false;
    }
  }

  /** 初始化工作区配置（询问确认，不自动生成） */
  public async initConfig(folder?: vscode.WorkspaceFolder): Promise<boolean> {
    const target = folder ?? (await this.getCurrentFolder());
    if (!target) {
      vscode.window.showInformationMessage('请先打开一个小说工作区。');
      return false;
    }
    const exists = await this.hasWorkspaceConfig(target);
    if (exists) {
      const answer = await vscode.window.showInformationMessage('工作区已存在小说助手配置，是否覆盖为默认配置？', '覆盖', '取消');
      if (answer !== '覆盖') {
        return false;
      }
    }
    await this.writeConfig({ ...DEFAULT_CONFIG, version: CONFIG_VERSION }, target);
    vscode.window.showInformationMessage('小说助手配置已初始化。');
    return true;
  }

  /** 配置迁移：旧版本备份后升级 */
  private migrateConfig(parsed: Partial<NovelConfig>, uri: vscode.Uri): NovelConfig {
    const version = parsed.version ?? 1;
    if (version >= CONFIG_VERSION) {
      return this.mergeDefaults(parsed);
    }
    // 版本 1 -> 2：补齐新字段（sprint、focusMode、countExcludes、excludeGlobs、countModes）
    const migrated: NovelConfig = this.mergeDefaults(parsed);
    migrated.version = CONFIG_VERSION;
    // 迁移前备份
    void this.backupConfig(uri, version);
    return migrated;
  }

  private async backupConfig(uri: vscode.Uri, oldVersion: number): Promise<void> {
    try {
      const raw = await vscode.workspace.fs.readFile(uri);
      const backupUri = vscode.Uri.joinPath(uri, '..', 'novel-assistant.backup.json');
      await vscode.workspace.fs.writeFile(backupUri, raw);
      vscode.window.showInformationMessage(`小说助手配置已从 v${oldVersion} 迁移，旧配置备份至 .vscode/novel-assistant.backup.json`);
    } catch {
      // 备份失败不阻塞迁移
    }
  }

  /** 深层合并默认配置（数组字段按配置覆盖） */
  private mergeDefaults(partial: Partial<NovelConfig>): NovelConfig {
    const result: NovelConfig = {
      ...DEFAULT_CONFIG,
      ...partial,
      countModes: { ...DEFAULT_CONFIG.countModes, ...(partial.countModes ?? {}) },
      countExcludes: { ...DEFAULT_CONFIG.countExcludes, ...(partial.countExcludes ?? {}) },
      sensitiveWords: this.mergeSensitive(DEFAULT_CONFIG.sensitiveWords, partial.sensitiveWords),
      goals: { ...DEFAULT_CONFIG.goals, ...(partial.goals ?? {}) },
      pomodoro: { ...DEFAULT_CONFIG.pomodoro, ...(partial.pomodoro ?? {}) },
      sprint: { ...DEFAULT_CONFIG.sprint, ...(partial.sprint ?? {}) },
      focusMode: { ...DEFAULT_CONFIG.focusMode, ...(partial.focusMode ?? {}) },
      highlights: Array.isArray(partial.highlights) ? partial.highlights : [...DEFAULT_CONFIG.highlights],
      titlePatterns: Array.isArray(partial.titlePatterns) ? partial.titlePatterns : [...DEFAULT_CONFIG.titlePatterns],
      excludeGlobs: Array.isArray(partial.excludeGlobs) ? partial.excludeGlobs : [...DEFAULT_CONFIG.excludeGlobs]
    };
    return result;
  }

  private mergeSensitive(base: SensitiveWordsConfig, partial?: Partial<SensitiveWordsConfig>): SensitiveWordsConfig {
    return {
      enabled: partial?.enabled ?? base.enabled,
      levels: {
        severe: Array.isArray(partial?.levels?.severe) ? partial!.levels!.severe : [...base.levels.severe],
        warning: Array.isArray(partial?.levels?.warning) ? partial!.levels!.warning : [...base.levels.warning],
        info: Array.isArray(partial?.levels?.info) ? partial!.levels!.info : [...base.levels.info]
      }
    };
  }

  /** 合并全局设置（novelAssistant.*），全局设置作为默认值层 */
  private mergeWithGlobal(config: NovelConfig): NovelConfig {
    const g = vscode.workspace.getConfiguration('novelAssistant');
    const result: NovelConfig = {
      ...config,
      countMode: g.get<string>('defaultCountMode', config.countMode),
      goals: {
        ...config.goals,
        dailyWords: g.get<number>('defaultDailyWords', config.goals.dailyWords),
        dailyMinutes: g.get<number>('defaultDailyMinutes', config.goals.dailyMinutes),
        dailyPomodoros: g.get<number>('defaultDailyPomodoros', config.goals.dailyPomodoros),
        dailyActiveMinutes: g.get<number>('defaultDailyActiveMinutes', config.goals.dailyActiveMinutes)
      },
      pomodoro: {
        ...config.pomodoro,
        workMinutes: g.get<number>('defaultPomodoroWorkMinutes', config.pomodoro.workMinutes)
      }
    };
    return result;
  }

  // ========== 统计文件 ==========

  public async getStatsFile(folder?: vscode.WorkspaceFolder): Promise<StatsFile> {
    const target = folder ?? (await this.getCurrentFolder());
    if (!target) {
      return emptyStats();
    }
    const uri = this.statsUri(target);
    const parsed = await this.readJsonFile<Partial<StatsFile>>(uri);
    if (!parsed) {
      return emptyStats();
    }
    return {
      version: STATS_VERSION,
      daily: parsed.daily ?? {},
      documents: parsed.documents ?? {},
      sessions: parsed.sessions ?? [],
      pomodoroHistory: parsed.pomodoroHistory ?? [],
      sprintHistory: parsed.sprintHistory ?? []
    };
  }

  public async writeStatsFile(stats: StatsFile, folder?: vscode.WorkspaceFolder): Promise<void> {
    const target = folder ?? (await this.getCurrentFolder());
    if (!target) {
      return;
    }
    const uri = this.statsUri(target);
    await this.ensureParent(uri);
    await this.writeJsonFile(uri, { ...stats, version: STATS_VERSION });
  }

  // ========== 故事数据文件（角色/时间线/伏笔/章节状态） ==========

  public async getDataFile(folder?: vscode.WorkspaceFolder): Promise<NovelData> {
    const target = folder ?? (await this.getCurrentFolder());
    if (!target) {
      return emptyData();
    }
    const uri = this.dataUri(target);
    const parsed = await this.readJsonFile<Partial<NovelData>>(uri);
    if (!parsed) {
      return emptyData();
    }
    return {
      version: DATA_VERSION,
      characters: parsed.characters ?? [],
      timeline: parsed.timeline ?? [],
      foreshadows: parsed.foreshadows ?? [],
      chapterStatus: parsed.chapterStatus ?? {}
    };
  }

  public async writeDataFile(data: NovelData, folder?: vscode.WorkspaceFolder): Promise<void> {
    const target = folder ?? (await this.getCurrentFolder());
    if (!target) {
      return;
    }
    const uri = this.dataUri(target);
    await this.ensureParent(uri);
    await this.writeJsonFile(uri, { ...data, version: DATA_VERSION });
  }

  // ========== 敏感词词库文件 ==========

  public async readSensitiveWordsFile(folder?: vscode.WorkspaceFolder): Promise<string[]> {
    const target = folder ?? (await this.getCurrentFolder());
    if (!target) {
      return [];
    }
    try {
      const raw = await vscode.workspace.fs.readFile(this.sensitiveFileUri(target));
      return decode(raw)
        .split(/\r?\n/)
        .map(l => l.trim())
        .filter(Boolean);
    } catch {
      return [];
    }
  }

  public async writeSensitiveWordsFile(words: string[], folder?: vscode.WorkspaceFolder): Promise<void> {
    const target = folder ?? (await this.getCurrentFolder());
    if (!target) {
      return;
    }
    const uri = this.sensitiveFileUri(target);
    await this.ensureParent(uri);
    await vscode.workspace.fs.writeFile(uri, encode(words.join('\n') + (words.length ? '\n' : '')));
  }

  // ========== 导入 / 导出 / 清除 ==========

  public async exportAll(): Promise<void> {
    const target = await this.getCurrentFolder();
    if (!target) {
      vscode.window.showInformationMessage('请先打开一个小说工作区。');
      return;
    }
    const [config, stats, data, sensitive] = await Promise.all([
      this.getConfig(target),
      this.getStatsFile(target),
      this.getDataFile(target),
      this.readSensitiveWordsFile(target)
    ]);
    const payload = {
      exportedAt: new Date().toISOString(),
      workspace: basename(target.uri.fsPath),
      config,
      stats,
      data,
      sensitiveWords: sensitive
    };
    const uri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.joinPath(target.uri, 'novel-assistant-export.json'),
      filters: { JSON: ['json'] }
    });
    if (!uri) {
      return;
    }
    await vscode.workspace.fs.writeFile(uri, encode(JSON.stringify(payload, null, 2)));
    vscode.window.showInformationMessage('全部数据已导出。');
  }

  public async importAll(): Promise<void> {
    const target = await this.getCurrentFolder();
    if (!target) {
      vscode.window.showInformationMessage('请先打开一个小说工作区。');
      return;
    }
    const uris = await vscode.window.showOpenDialog({ filters: { JSON: ['json'] } });
    if (!uris || uris.length === 0) {
      return;
    }
    try {
      const raw = await vscode.workspace.fs.readFile(uris[0]);
      const payload = JSON.parse(decode(raw)) as {
        config?: NovelConfig;
        stats?: StatsFile;
        data?: NovelData;
        sensitiveWords?: string[];
      };
      if (payload.config && typeof payload.config === 'object') {
        await this.writeConfig({ ...this.mergeDefaults(payload.config), version: CONFIG_VERSION }, target);
      }
      if (payload.stats && typeof payload.stats === 'object') {
        await this.writeStatsFile({ ...emptyStats(), ...payload.stats }, target);
      }
      if (payload.data && typeof payload.data === 'object') {
        await this.writeDataFile({ ...emptyData(), ...payload.data }, target);
      }
      if (Array.isArray(payload.sensitiveWords)) {
        await this.writeSensitiveWordsFile(payload.sensitiveWords, target);
      }
      vscode.window.showInformationMessage('数据导入完成。');
    } catch (e) {
      vscode.window.showErrorMessage(`导入失败：${e instanceof Error ? e.message : String(e)}`);
    }
  }

  public async clearStats(): Promise<void> {
    const target = await this.getCurrentFolder();
    if (!target) {
      return;
    }
    const answer = await vscode.window.showWarningMessage('确定要清除本工作区的全部统计数据吗？（字数、时间、番茄、冲刺历史）', '清除', '取消');
    if (answer !== '清除') {
      return;
    }
    await this.writeStatsFile(emptyStats(), target);
    vscode.window.showInformationMessage('本工作区统计数据已清除。');
  }
}

export function emptyStats(): StatsFile {
  return { version: STATS_VERSION, daily: {}, documents: {}, sessions: [], pomodoroHistory: [], sprintHistory: [] };
}

export function emptyData(): NovelData {
  return { version: DATA_VERSION, characters: [], timeline: [], foreshadows: [], chapterStatus: {} };
}
