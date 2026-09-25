import * as vscode from 'vscode';
import { SensitiveWordsConfig, NovelConfig } from '../types';
import { ConfigService } from '../config/configService';
import { debounce } from '../utils/debounce';
import { escapeRegex } from '../highlight/highlightService';

/**
 * 敏感词检测服务（规划文档 3.8）
 *
 * - 本地检测，不上传文本。
 * - 词库分级：严重（红底+波浪线）、警告（橙下划线）、提示（黄下划线）。
 * - 输入防抖 500ms；扫描当前文档；问题面板显示命中，点击跳转。
 * - 词库来源：内置基础词库（可关闭）、工作区自定义词库文件、配置分级词库。
 */

/** 内置基础词库（示例级，可整体关闭） */
const BUILTIN_BASE_WORDS: Record<keyof SensitiveWordsConfig['levels'], string[]> = {
  severe: [],
  warning: [],
  info: []
};

const DECORATION_OPTIONS: Record<keyof SensitiveWordsConfig['levels'], vscode.DecorationRenderOptions> = {
  severe: {
    backgroundColor: 'rgba(255, 60, 60, 0.45)',
    textDecoration: 'underline wavy rgba(255, 0, 0, 0.9)',
    color: '#ffcccc'
  },
  warning: {
    textDecoration: 'underline 2px #FFA500',
    color: '#FFA500'
  },
  info: {
    textDecoration: 'underline 2px #FFD700',
    color: '#FFD700'
  }
};

const LEVEL_LABELS: Record<keyof SensitiveWordsConfig['levels'], string> = {
  severe: '严重',
  warning: '警告',
  info: '提示'
};

export class SensitiveWordService implements vscode.Disposable {
  private decorations: Record<keyof SensitiveWordsConfig['levels'], vscode.TextEditorDecorationType>;
  private diagnostics: vscode.DiagnosticCollection;
  private words: Record<keyof SensitiveWordsConfig['levels'], string[]> = {
    severe: [],
    warning: [],
    info: []
  };
  private config: NovelConfig | undefined;
  private currentUri: vscode.Uri | undefined;
  private scanning = false;

  private readonly apply = debounce(() => {
    void this.scanCurrent();
  }, 500);

  constructor(private readonly configService: ConfigService) {
    this.decorations = {
      severe: vscode.window.createTextEditorDecorationType(DECORATION_OPTIONS.severe),
      warning: vscode.window.createTextEditorDecorationType(DECORATION_OPTIONS.warning),
      info: vscode.window.createTextEditorDecorationType(DECORATION_OPTIONS.info)
    };
    this.diagnostics = vscode.languages.createDiagnosticCollection('novelAssistantSensitive');
  }

  public async reload(config?: NovelConfig): Promise<void> {
    this.config = config ?? (await this.configService.getConfig());
    const fileWords = await this.configService.readSensitiveWordsFile();
    this.words = {
      severe: [...(this.config.sensitiveWords.levels.severe ?? []), ...BUILTIN_BASE_WORDS.severe],
      warning: [...(this.config.sensitiveWords.levels.warning ?? []), ...BUILTIN_BASE_WORDS.warning],
      info: [...(this.config.sensitiveWords.levels.info ?? []), ...BUILTIN_BASE_WORDS.info]
    };
    // 词库文件中的词默认为警告级
    this.words.warning.push(...fileWords);
    await this.scanCurrent();
  }

  public isEnabled(): boolean {
    return this.config?.sensitiveWords.enabled ?? true;
  }

  /** 当前词库快照（供树面板展示） */
  public getWordsSnapshot(): Record<keyof SensitiveWordsConfig['levels'], string[]> {
    return {
      severe: [...this.words.severe],
      warning: [...this.words.warning],
      info: [...this.words.info]
    };
  }

  public schedule(): void {
    if (!this.isEnabled()) {
      return;
    }
    this.apply();
  }

  public async scanCurrent(): Promise<void> {
    if (!this.isEnabled() || this.scanning) {
      return;
    }
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      this.clear();
      return;
    }
    this.currentUri = editor.document.uri;
    this.scanning = true;
    try {
      const text = editor.document.getText();
      const rangesByLevel: Record<keyof SensitiveWordsConfig['levels'], vscode.Range[]> = {
        severe: [],
        warning: [],
        info: []
      };
      const diagnostics: vscode.Diagnostic[] = [];

      for (const level of ['severe', 'warning', 'info'] as const) {
        for (const word of this.words[level]) {
          if (!word) {
            continue;
          }
          let re: RegExp;
          try {
            re = new RegExp(escapeRegex(word), 'g');
          } catch {
            continue;
          }
          for (const match of text.matchAll(re)) {
            if (match.index === undefined) {
              continue;
            }
            const start = editor.document.positionAt(match.index);
            const end = editor.document.positionAt(match.index + match[0].length);
            rangesByLevel[level].push(new vscode.Range(start, end));
            diagnostics.push(
              new vscode.Diagnostic(
                new vscode.Range(start, end),
                `敏感词（${LEVEL_LABELS[level]}）：${match[0]}`,
                level === 'severe' ? vscode.DiagnosticSeverity.Error : level === 'warning' ? vscode.DiagnosticSeverity.Warning : vscode.DiagnosticSeverity.Information
              )
            );
          }
        }
      }

      for (const level of ['severe', 'warning', 'info'] as const) {
        editor.setDecorations(this.decorations[level], rangesByLevel[level]);
      }
      this.diagnostics.set(editor.document.uri, diagnostics);
    } finally {
      this.scanning = false;
    }
  }

  public clear(): void {
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      for (const level of ['severe', 'warning', 'info'] as const) {
        editor.setDecorations(this.decorations[level], []);
      }
    }
    if (this.currentUri) {
      this.diagnostics.delete(this.currentUri);
    }
    this.currentUri = undefined;
  }

  /** 管理命令：增删词 / 切换分级 / 启用禁用 / 导入导出 */
  public async manage(): Promise<void> {
    if (!this.config) {
      await this.reload();
    }
    const enabled = this.config?.sensitiveWords.enabled ?? true;
    const toggleItem = enabled ? '禁用敏感词检测' : '启用敏感词检测';
    const actions = [
      '添加敏感词',
      '删除敏感词',
      '切换分级',
      '导入词库文件',
      '导出词库文件',
      toggleItem
    ];
    const action = await vscode.window.showQuickPick(actions, { placeHolder: '选择敏感词管理操作' });
    if (!action) {
      return;
    }
    switch (action) {
      case '添加敏感词': {
        const input = await vscode.window.showInputBox({ prompt: '输入敏感词（多个用逗号分隔）' });
        if (!input) {
          return;
        }
        const level = await vscode.window.showQuickPick(
          Object.entries(LEVEL_LABELS).map(([id, label]) => ({ label, description: id })),
          { placeHolder: '选择分级（默认警告）' }
        );
        const targetLevel = (level?.description as keyof SensitiveWordsConfig['levels']) ?? 'warning';
        const words = input.split(/[,，、\s]+/).map(w => w.trim()).filter(Boolean);
        if (this.config) {
          this.config.sensitiveWords.levels[targetLevel].push(...words);
          await this.configService.writeConfig(this.config);
          await this.reload(this.config);
          vscode.window.showInformationMessage(`已添加 ${words.length} 个敏感词（${LEVEL_LABELS[targetLevel]}）。`);
        }
        break;
      }
      case '删除敏感词': {
        const all = this.flattenWords();
        if (!all.length) {
          vscode.window.showInformationMessage('当前词库为空。');
          return;
        }
        const word = await vscode.window.showQuickPick(all, { placeHolder: '选择要删除的敏感词' });
        if (!word || !this.config) {
          return;
        }
        for (const level of ['severe', 'warning', 'info'] as const) {
          this.config.sensitiveWords.levels[level] = this.config.sensitiveWords.levels[level].filter(w => w !== word);
        }
        await this.configService.writeConfig(this.config);
        await this.configService.writeSensitiveWordsFile(
          (await this.configService.readSensitiveWordsFile()).filter(w => w !== word)
        );
        await this.reload(this.config);
        vscode.window.showInformationMessage(`已删除敏感词：${word}`);
        break;
      }
      case '切换分级': {
        const all = this.flattenWords();
        if (!all.length) {
          return;
        }
        const word = await vscode.window.showQuickPick(all, { placeHolder: '选择要切换分级的词' });
        if (!word || !this.config) {
          return;
        }
        const level = await vscode.window.showQuickPick(
          Object.entries(LEVEL_LABELS).map(([id, label]) => ({ label, description: id })),
          { placeHolder: '切换为' }
        );
        if (!level) {
          return;
        }
        const target = level.description as keyof SensitiveWordsConfig['levels'];
        for (const l of ['severe', 'warning', 'info'] as const) {
          this.config.sensitiveWords.levels[l] = this.config.sensitiveWords.levels[l].filter(w => w !== word);
        }
        this.config.sensitiveWords.levels[target].push(word);
        await this.configService.writeConfig(this.config);
        await this.reload(this.config);
        vscode.window.showInformationMessage(`已将“${word}”切换为${LEVEL_LABELS[target]}。`);
        break;
      }
      case '导入词库文件': {
        const uris = await vscode.window.showOpenDialog({ filters: { 词库: ['txt', 'json', 'csv'] } });
        if (!uris || uris.length === 0) {
          return;
        }
        const words = await this.parseWordFile(uris[0]);
        if (!words.length) {
          vscode.window.showInformationMessage('文件中没有可导入的词。');
          return;
        }
        if (this.config) {
          this.config.sensitiveWords.levels.warning.push(...words);
          await this.configService.writeConfig(this.config);
          await this.reload(this.config);
          vscode.window.showInformationMessage(`已导入 ${words.length} 个敏感词（警告级）。`);
        }
        break;
      }
      case '导出词库文件': {
        const all = this.flattenWords();
        const uri = await vscode.window.showSaveDialog({ filters: { 词库: ['txt'] } });
        if (!uri) {
          return;
        }
        await vscode.workspace.fs.writeFile(uri, Buffer.from(all.join('\n'), 'utf8'));
        vscode.window.showInformationMessage(`已导出 ${all.length} 个敏感词。`);
        break;
      }
      case toggleItem: {
        if (this.config) {
          this.config.sensitiveWords.enabled = !enabled;
          await this.configService.writeConfig(this.config);
          await this.reload(this.config);
          vscode.window.showInformationMessage(`敏感词检测已${enabled ? '禁用' : '启用'}。`);
        }
        break;
      }
    }
  }

  private flattenWords(): string[] {
    const set = new Set<string>();
    for (const level of ['severe', 'warning', 'info'] as const) {
      for (const w of this.words[level]) {
        set.add(w);
      }
    }
    return [...set];
  }

  private async parseWordFile(uri: vscode.Uri): Promise<string[]> {
    const raw = await vscode.workspace.fs.readFile(uri);
    const text = Buffer.from(raw).toString('utf8').trim();
    if (!text) {
      return [];
    }
    if (uri.fsPath.endsWith('.json') || uri.fsPath.endsWith('.csv')) {
      try {
        const parsed = JSON.parse(text);
        const arr = Array.isArray(parsed)
          ? parsed
          : Array.isArray(parsed.words)
            ? parsed.words
            : [];
        return arr.map((w: unknown) => String(w).trim()).filter(Boolean);
      } catch {
        // 非 JSON，按行处理
      }
    }
    return text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  }

  public dispose(): void {
    this.apply.cancel();
    for (const d of Object.values(this.decorations)) {
      d.dispose();
    }
    this.diagnostics.dispose();
  }
}
