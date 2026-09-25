import * as vscode from 'vscode';
import { TimelineService, TIMELINE_TYPES, TIMELINE_STATUSES } from '../timeline/timelineService';
import { TimelineEvent } from '../types';

/**
 * 时间线树面板（规划文档 3.11 / 4.2）
 * 按事件类型分组展示；支持筛选；点击跳转章节。
 */

const TYPE_ICONS: Record<string, string> = {
  battle: 'flame',
  romance: 'heart',
  twist: 'zap',
  daily: 'calendar',
  foreshadow: 'eye',
  other: 'book'
};

export class TimelineTreeProvider implements vscode.TreeDataProvider<TimelineNode> {
  private readonly emitter = new vscode.EventEmitter<TimelineNode | undefined | null | void>();
  readonly onDidChangeTreeData = this.emitter.event;
  private filter: { type?: string; status?: string } = {};

  constructor(private readonly service: TimelineService) {}

  public refresh(): void {
    this.emitter.fire();
  }

  public setFilter(type?: string, status?: string): void {
    this.filter = { type, status };
    this.refresh();
  }

  getTreeItem(element: TimelineNode): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: TimelineNode): Promise<TimelineNode[]> {
    const events = await this.service.filter({
      type: this.filter.type as never,
      status: this.filter.status as never
    });
    if (!element) {
      // 分组视图
      return TIMELINE_TYPES.map(t => {
        const items = events.filter(e => e.type === t.id);
        if (items.length === 0 && !this.filter.type && !this.filter.status) {
          return null;
        }
        const node = new TimelineNode('group', `${t.label} (${items.length})`, items.length ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None, undefined, t.id);
        node.iconPath = new vscode.ThemeIcon(TYPE_ICONS[t.id] ?? 'book');
        return node;
      }).filter((n): n is TimelineNode => n !== null);
    }
    if (element.type === 'group') {
      return events
        .filter(e => e.type === element.groupType)
        .map(e => this.eventNode(e));
    }
    return [];
  }

  private eventNode(e: TimelineEvent): TimelineNode {
    const statusLabel = TIMELINE_STATUSES.find(s => s.id === e.status)?.label ?? e.status;
    const node = new TimelineNode('event', `${e.title}`, vscode.TreeItemCollapsibleState.None, e);
    node.description = `[${statusLabel}] ${e.chapter ? e.chapter : '未关联章节'}`;
    node.iconPath = new vscode.ThemeIcon(TYPE_ICONS[e.type] ?? 'book');
    node.tooltip = `${e.title}\n${e.description || ''}\n章节：${e.chapter || '-'}\n故事时间：${e.storyTime || '-'}\n角色：${e.characters.join('、') || '-'}`;
    node.contextValue = 'timelineEvent';
    if (e.chapter) {
      node.command = { command: 'novelAssistant.openChapterFile', title: '跳转章节', arguments: [e.chapter] };
    }
    return node;
  }
}

export class TimelineNode extends vscode.TreeItem {
  constructor(
    public readonly type: 'group' | 'event',
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly event?: TimelineEvent,
    public readonly groupType?: string
  ) {
    super(label, collapsibleState);
    if (type === 'event') {
      this.contextValue = 'timelineEvent';
    } else {
      this.contextValue = 'timelineGroup';
    }
  }
}
