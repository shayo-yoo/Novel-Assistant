import * as vscode from 'vscode';
import { HighlightGroup } from '../types';
import { HighlightGroupService } from '../highlight/highlightGroupService';

/**
 * 高亮管理树面板（规划文档 4.2）
 * 分组节点 + 词子节点；右键可管理组与词。
 */

export class HighlightTreeProvider implements vscode.TreeDataProvider<HighlightNode> {
  private readonly emitter = new vscode.EventEmitter<HighlightNode | undefined | null | void>();
  readonly onDidChangeTreeData = this.emitter.event;
  private groups: HighlightGroup[] = [];

  constructor(private readonly groupService: HighlightGroupService) {}

  public refresh(): void {
    this.emitter.fire();
  }

  async getChildren(element?: HighlightNode): Promise<HighlightNode[]> {
    if (element) {
      // 词的子节点
      if (element.type === 'group' && element.group) {
        return element.group.words.map(word => new HighlightNode('word', word, vscode.TreeItemCollapsibleState.None, element.group, word));
      }
      return [];
    }
    this.groups = await this.groupService.getGroups();
    return this.groups.map(g => {
      const node = new HighlightNode('group', `${g.enabled ? '●' : '○'} ${g.name} (${g.words.length})`, vscode.TreeItemCollapsibleState.Collapsed, g);
      node.iconPath = colorIcon(g.color);
      node.contextValue = 'highlightGroup';
      node.tooltip = `颜色：${g.color}\n优先级：${g.priority}\n状态：${g.enabled ? '启用' : '禁用'}\n样式：${g.style}`;
      return node;
    });
  }

  getTreeItem(element: HighlightNode): vscode.TreeItem {
    return element;
  }

  public getGroupById(id: string): HighlightGroup | undefined {
    return this.groups.find(g => g.id === id);
  }
}

function colorIcon(color: string): vscode.ThemeIcon | undefined {
  // 主题图标无法直接着色，用 emoji 色块近似
  return new vscode.ThemeIcon('circle-filled');
}

export class HighlightNode extends vscode.TreeItem {
  constructor(
    public readonly type: 'group' | 'word',
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly group?: HighlightGroup,
    public readonly word?: string
  ) {
    super(label, collapsibleState);
    if (type === 'word') {
      this.contextValue = 'highlightWord';
      this.iconPath = new vscode.ThemeIcon('symbol-key');
    } else {
      this.contextValue = 'highlightGroup';
    }
  }
}
