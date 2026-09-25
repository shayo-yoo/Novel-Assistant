import * as vscode from 'vscode';
import { ChapterService, ChapterInfo } from './chapterService';
import { NovelConfig, ChapterStatus } from '../types';

/**
 * 章节树面板（规划文档 3.9 / 4.2）
 * 显示章节名、字数、状态、最后编辑时间、敏感词/未回收伏笔标记。
 */

const STATUS_LABELS: Record<ChapterStatus, string> = {
  draft: '草稿',
  revising: '修改中',
  done: '完成'
};

export class ChapterTreeProvider implements vscode.TreeDataProvider<ChapterNode> {
  private readonly emitter = new vscode.EventEmitter<ChapterNode | undefined | null | void>();
  readonly onDidChangeTreeData = this.emitter.event;
  private sortMode: 'name' | 'mtime' | 'words' = 'name';

  constructor(
    private readonly chapterService: ChapterService,
    private readonly getConfig: () => Promise<NovelConfig>
  ) {}

  public refresh(): void {
    this.emitter.fire();
  }

  public setSortMode(mode: 'name' | 'mtime' | 'words'): void {
    this.sortMode = mode;
    this.refresh();
  }

  getTreeItem(element: ChapterNode): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: ChapterNode): Promise<ChapterNode[]> {
    if (element) {
      return [];
    }
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) {
      return [];
    }
    const config = await this.getConfig();
    const chapters = await this.chapterService.getChapters(folder, config);
    this.sort(chapters);
    const total = chapters.reduce((sum, c) => sum + c.wordCount, 0);
    const summary = new ChapterNode(
      'summary',
      `📚 共 ${chapters.length} 章 · 全书 ${total.toLocaleString()} 字`,
      vscode.TreeItemCollapsibleState.None,
      undefined,
      '全书字数汇总'
    );
    summary.iconPath = new vscode.ThemeIcon('library');
    return [summary, ...chapters.map(c => this.toNode(c))];
  }

  private sort(chapters: ChapterInfo[]): void {
    switch (this.sortMode) {
      case 'words':
        chapters.sort((a, b) => b.wordCount - a.wordCount);
        break;
      case 'mtime':
        chapters.sort((a, b) => (b.lastEdited || '').localeCompare(a.lastEdited || ''));
        break;
      default:
        chapters.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN', { numeric: true }));
    }
  }

  private toNode(c: ChapterInfo): ChapterNode {
    const marks: string[] = [];
    if (c.hasSensitive) {
      marks.push('⚠️');
    }
    if (c.hasOpenForeshadow) {
      marks.push('🪝');
    }
    const label = `${c.name} (${c.wordCount.toLocaleString()})${marks.join('')}`;
    const description = `${STATUS_LABELS[c.status]}${c.lastEdited ? ' · ' + c.lastEdited : ''}`;
    const node = new ChapterNode(c.name, label, vscode.TreeItemCollapsibleState.None, c.uri, description);
    node.iconPath = new vscode.ThemeIcon(
      c.status === 'done' ? 'check' : c.status === 'revising' ? 'edit' : 'file',
      c.status === 'done' ? new vscode.ThemeColor('charts.green') : undefined
    );
    return node;
  }
}

export class ChapterNode extends vscode.TreeItem {
  constructor(
    public readonly id: string,
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly uri?: vscode.Uri,
    description?: string
  ) {
    super(label, collapsibleState);
    this.id = id;
    this.description = description;
    this.tooltip = description ?? label;
    if (uri) {
      this.command = {
        command: 'vscode.open',
        title: '打开章节',
        arguments: [uri]
      };
      this.contextValue = 'chapter';
    }
  }
}
