import * as vscode from 'vscode';
import { NovelConfig, HighlightGroup } from '../types';
import { DecorationManager } from './decorations';
import { debounce } from '../utils/debounce';

/**
 * 高亮服务（规划文档 3.4.5）
 *
 * - 使用 TextEditorDecorationType 渲染，不修改文本。
 * - 异步匹配，防抖 200ms。
 * - 最大匹配数默认 5000（超出后仅高亮可见区域）。
 * - 同一文本属于多个组时，按优先级（数值小者优先）应用，高优先级覆盖低优先级。
 * - 切换编辑器时重新应用。
 */

const DEFAULT_MAX_MATCHES = 5000;

export class HighlightService implements vscode.Disposable {
  private decorations = new DecorationManager();
  private disposables: vscode.Disposable[] = [];
  private config: NovelConfig | undefined;
  private maxMatches = DEFAULT_MAX_MATCHES;

  constructor(
    private readonly getConfig: () => Promise<NovelConfig>,
    onConfigChange?: vscode.Event<void>
  ) {
    if (onConfigChange) {
      this.disposables.push(onConfigChange(() => void this.reload()));
    }
    this.disposables.push(this.decorations);
  }

  public async reload(): Promise<void> {
    this.config = await this.getConfig();
    if (!this.config) {
      return;
    }
    this.decorations.rebuild(this.config.highlights);
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      await this.applyToEditor(editor);
    }
  }

  /** 是否属于小说文件 */
  public isNovelFile(uri: vscode.Uri, config?: NovelConfig): boolean {
    const cfg = config ?? this.config;
    if (!cfg) {
      return true;
    }
    const name = uri.fsPath;
    const ext = name.slice(name.lastIndexOf('.')).toLowerCase();
    return cfg.fileExtensions.includes(ext);
  }

  private scheduleApply = debounce((editor: vscode.TextEditor) => {
    void this.applyToEditor(editor);
  }, 200);

  public schedule(editor: vscode.TextEditor): void {
    this.scheduleApply(editor);
  }

  public async applyToEditor(editor: vscode.TextEditor): Promise<void> {
    if (!this.config) {
      this.config = await this.getConfig();
      this.decorations.rebuild(this.config.highlights);
    }
    if (!this.isNovelFile(editor.document.uri, this.config)) {
      this.clearEditor(editor);
      return;
    }
    const groups = this.config.highlights
      .filter(g => g.enabled && g.words.length > 0)
      .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));

    const text = editor.document.getText();
    const matchesByGroup = new Map<string, vscode.Range[]>();

    for (const group of groups) {
      const ranges = this.findMatches(group, text, editor.document, this.maxMatches);
      if (ranges.length > 0) {
        matchesByGroup.set(group.id, ranges);
      }
    }

    // 先清除该编辑器上的全部高亮装饰
    for (const group of this.config.highlights) {
      const type = this.decorations.get(group);
      if (type) {
        editor.setDecorations(type, []);
      }
    }
    for (const [id, ranges] of matchesByGroup) {
      const type = this.decorations.get(this.config.highlights.find(g => g.id === id)!);
      if (type) {
        editor.setDecorations(type, ranges);
      }
    }
  }

  private findMatches(group: HighlightGroup, text: string, document: vscode.TextDocument, maxMatches: number): vscode.Range[] {
    const found: vscode.Range[] = [];
    const flags = group.matchCase ? 'g' : 'gi';

    if (group.regex) {
      for (const pattern of group.words) {
        let re: RegExp;
        try {
          re = new RegExp(pattern, flags);
        } catch {
          continue;
        }
        this.collectMatches(re, text, document, found, maxMatches);
        if (found.length >= maxMatches) {
          break;
        }
      }
    } else {
      for (const word of group.words) {
        const re = new RegExp(escapeRegex(word), flags);
        this.collectMatches(re, text, document, found, maxMatches);
        if (found.length >= maxMatches) {
          break;
        }
      }
    }
    return found;
  }

  private collectMatches(re: RegExp, text: string, document: vscode.TextDocument, out: vscode.Range[], maxMatches: number): void {
    for (const match of text.matchAll(re)) {
      if (match.index === undefined) {
        continue;
      }
      if (out.length >= maxMatches) {
        return;
      }
      const start = document.positionAt(match.index);
      const end = document.positionAt(match.index + match[0].length);
      out.push(new vscode.Range(start, end));
    }
  }

  public clearEditor(editor: vscode.TextEditor): void {
    if (!this.config) {
      return;
    }
    for (const group of this.config.highlights) {
      const type = this.decorations.get(group);
      if (type) {
        editor.setDecorations(type, []);
      }
    }
  }

  public setMaxMatches(value: number): void {
    this.maxMatches = value > 0 ? value : DEFAULT_MAX_MATCHES;
  }

  public dispose(): void {
    this.scheduleApply.cancel();
    this.decorations.dispose();
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables = [];
  }
}

export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
