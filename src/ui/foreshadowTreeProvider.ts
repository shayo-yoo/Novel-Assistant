import * as vscode from 'vscode';
import { ForeshadowService, FORESHADOW_STATUSES } from '../foreshadow/foreshadowService';
import { Foreshadow } from '../types';

/**
 * 伏笔追踪树面板（规划文档 3.12 / 4.2）
 * 展示伏笔生命周期：埋设→推进→回收；未回收伏笔优先。
 */

const STATUS_ICONS: Record<string, string> = {
  unresolved: 'warning',
  partially: 'sync',
  resolved: 'check',
  abandoned: 'circle-slash'
};

export class ForeshadowTreeProvider implements vscode.TreeDataProvider<ForeshadowNode> {
  private readonly emitter = new vscode.EventEmitter<ForeshadowNode | undefined | null | void>();
  readonly onDidChangeTreeData = this.emitter.event;

  constructor(private readonly service: ForeshadowService) {}

  public refresh(): void {
    this.emitter.fire();
  }

  getTreeItem(element: ForeshadowNode): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: ForeshadowNode): Promise<ForeshadowNode[]> {
    if (element) {
      return [];
    }
    const list = await this.service.getAll();
    // 排序：优先级升序，未回收在前
    list.sort((a, b) => {
      const rank: Record<string, number> = { unresolved: 0, partially: 1, abandoned: 2, resolved: 3 };
      return (rank[a.status] ?? 4) - (rank[b.status] ?? 4) || a.priority - b.priority;
    });
    return list.map(f => {
      const statusLabel = FORESHADOW_STATUSES.find(s => s.id === f.status)?.label ?? f.status;
      const node = new ForeshadowNode(f, `${f.name} (P${f.priority})`, vscode.TreeItemCollapsibleState.None);
      node.description = `[${statusLabel}] 埋设：${f.plantedChapter || '-'}`;
      node.iconPath = new vscode.ThemeIcon(STATUS_ICONS[f.status] ?? 'eye');
      node.tooltip =
        `${f.name}\n${f.description || ''}\n` +
        `埋设章节：${f.plantedChapter || '-'}\n` +
        `推进章节：${f.advancedChapters.join('、') || '-'}\n` +
        `回收章节：${f.resolvedChapter || '-'}\n` +
        `状态：${statusLabel}`;
      node.contextValue = 'foreshadow';
      return node;
    });
  }
}

export class ForeshadowNode extends vscode.TreeItem {
  constructor(
    public readonly foreshadow: Foreshadow,
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super(label, collapsibleState);
  }
}
