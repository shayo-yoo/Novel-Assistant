/**
 * 故事时间线服务：事件增删改查、类型/状态/章节筛选、按工作区持久化。
 * 所有读写均通过 ConfigService 的 getDataFile / writeDataFile 完成，
 * 变更时先克隆数组再写回完整 NovelData（保留 version、characters、foreshadows、chapterStatus）。
 */
import { TimelineEvent, TimelineEventType, TimelineEventStatus, NovelData } from '../types';
import { ConfigService } from '../config/configService';
import { shortId, localIso } from '../utils/text';

/** 事件类型常量（id -> 中文标签） */
export const TIMELINE_TYPES: { id: TimelineEventType; label: string }[] = [
  { id: 'battle', label: '战斗' },
  { id: 'romance', label: '感情' },
  { id: 'twist', label: '转折' },
  { id: 'daily', label: '日常' },
  { id: 'foreshadow', label: '伏笔' },
  { id: 'other', label: '其他' }
];

/** 事件状态常量（id -> 中文标签） */
export const TIMELINE_STATUSES: { id: TimelineEventStatus; label: string }[] = [
  { id: 'planned', label: '计划' },
  { id: 'written', label: '已写' },
  { id: 'revised', label: '已修改' },
  { id: 'abandoned', label: '废弃' }
];

export class TimelineService {
  constructor(private readonly configService: ConfigService) {}

  /** 获取全部时间线事件（来自数据文件） */
  public async getAll(): Promise<TimelineEvent[]> {
    const data = await this.configService.getDataFile();
    return data.timeline;
  }

  /** 新增时间线事件，写入后返回新事件 */
  public async add(input: {
    title: string;
    description?: string;
    chapter?: string;
    storyTime?: string;
    type?: TimelineEventType;
    status?: TimelineEventStatus;
    characters?: string[];
    locations?: string[];
  }): Promise<TimelineEvent> {
    const data = await this.configService.getDataFile();
    const now = localIso();
    const event: TimelineEvent = {
      id: shortId(),
      title: input.title.trim(),
      description: input.description ?? '',
      chapter: input.chapter ?? '',
      storyTime: input.storyTime ?? '',
      type: input.type ?? 'other',
      status: input.status ?? 'planned',
      characters: input.characters ?? [],
      locations: input.locations ?? [],
      createdAt: now,
      updatedAt: now
    };
    const list = [...data.timeline, event];
    await this.writeTimeline(data, list);
    return event;
  }

  /** 按 id 替换事件并刷新 updatedAt；事件不存在时不写入 */
  public async update(event: TimelineEvent): Promise<void> {
    const data = await this.configService.getDataFile();
    const exists = data.timeline.some(e => e.id === event.id);
    if (!exists) {
      return;
    }
    const updated: TimelineEvent = { ...event, updatedAt: localIso() };
    const list = data.timeline.map(e => (e.id === event.id ? updated : e));
    await this.writeTimeline(data, list);
  }

  /** 按 id 删除事件 */
  public async remove(id: string): Promise<void> {
    const data = await this.configService.getDataFile();
    const list = data.timeline.filter(e => e.id !== id);
    if (list.length === data.timeline.length) {
      return;
    }
    await this.writeTimeline(data, list);
  }

  /** 按 id 查找事件 */
  public async getById(id: string): Promise<TimelineEvent | undefined> {
    const data = await this.configService.getDataFile();
    return data.timeline.find(e => e.id === id);
  }

  /** 按类型 / 状态 / 章节（精确匹配，章节先 trim）筛选事件 */
  public async filter(opts?: {
    type?: TimelineEventType;
    status?: TimelineEventStatus;
    chapter?: string;
  }): Promise<TimelineEvent[]> {
    const events = await this.getAll();
    if (!opts) {
      return events;
    }
    const chapter = opts.chapter?.trim();
    return events.filter(e => {
      if (opts.type && e.type !== opts.type) {
        return false;
      }
      if (opts.status && e.status !== opts.status) {
        return false;
      }
      if (chapter !== undefined && chapter !== '' && e.chapter !== chapter) {
        return false;
      }
      return true;
    });
  }

  /** 将新的时间线列表写回数据文件（保留其余字段） */
  private async writeTimeline(data: NovelData, timeline: TimelineEvent[]): Promise<void> {
    await this.configService.writeDataFile({
      version: data.version,
      characters: data.characters,
      timeline,
      foreshadows: data.foreshadows,
      chapterStatus: data.chapterStatus
    });
  }
}
