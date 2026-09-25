import * as vscode from 'vscode';
import { SensitiveWordService } from '../sensitive/sensitiveWordService';

/**
 * 敏感词树面板（规划文档 4.2）
 * 按 严重/警告/提示 三级分组展示当前词库。
 */

const LEVELS = [
  { id: 'severe', label: '严重', icon: 'error' },
  { id: 'warning', label: '警告', icon: 'warning' },
  { id: 'info', label: '提示', icon: 'info' }
] as const;

export class SensitiveTreeProvider implements vscode.TreeDataProvider<SensitiveNode> {
  private readonly emitter = new vscode.EventEmitter<SensitiveNode | undefined | null | void>();
  readonly onDidChangeTreeData = this.emitter.event;

  constructor(private readonly service: SensitiveWordService) {}

  public refresh(): void {
    this.emitter.fire();
  }

  getTreeItem(element: SensitiveNode): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: SensitiveNode): Promise<SensitiveNode[]> {
    const words = await this.service.getWordsSnapshot();
    if (!element) {
      return LEVELS.map(level => {
        const list = words[level.id] ?? [];
        const node = new SensitiveNode(
          'level',
          `${level.label} (${list.length})`,
          list.length ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
          level.id,
          undefined
        );
        node.iconPath = new vscode.ThemeIcon(level.icon);
        node.contextValue = 'sensitiveLevel';
        return node;
      });
    }
    if (element.type === 'level') {
      const list = words[element.levelId as keyof typeof words] ?? [];
      return list.map(word => {
        const node = new SensitiveNode('word', word, vscode.TreeItemCollapsibleState.None, element.levelId, word);
        node.contextValue = 'sensitiveWord';
        return node;
      });
    }
    return [];
  }
}

export class SensitiveNode extends vscode.TreeItem {
  constructor(
    public readonly type: 'level' | 'word',
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly levelId?: string,
    public readonly word?: string
  ) {
    super(label, collapsibleState);
    if (type === 'word') {
      this.tooltip = `分级：${levelId === 'severe' ? '严重' : levelId === 'warning' ? '警告' : '提示'}`;
    }
  }
}
