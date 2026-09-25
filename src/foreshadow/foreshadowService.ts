import { Foreshadow, ForeshadowStatus, NovelData } from '../types';
import { ConfigService } from '../config/configService';
import { shortId, localIso } from '../utils/text';

/**
 * 伏笔状态展示常量：id 为存储值，label 为中文展示名。
 * 顺序与状态枚举一致，供侧边栏列表、筛选下拉等 UI 复用。
 */
export const FORESHADOW_STATUSES: { id: ForeshadowStatus; label: string }[] = [
  { id: 'unresolved', label: '未回收' },
  { id: 'partially', label: '部分回收' },
  { id: 'resolved', label: '已回收' },
  { id: 'abandoned', label: '废弃' }
];

export class ForeshadowService {
  constructor(private readonly configService: ConfigService) {}

  /** 读取全部伏笔（来自工作区故事数据文件） */
  public async getAll(): Promise<Foreshadow[]> {
    const data = await this.configService.getDataFile();
    return data.foreshadows;
  }

  /** 新增伏笔：默认未回收、优先级 3，无描述/埋设章节 */
  public async add(input: { name: string; description?: string; plantedChapter?: string; priority?: number }): Promise<Foreshadow> {
    const data = await this.configService.getDataFile();
    const now = localIso();
    const foreshadow: Foreshadow = {
      id: shortId(),
      name: input.name.trim(),
      description: input.description ?? '',
      plantedChapter: input.plantedChapter ?? '',
      advancedChapters: [],
      resolvedChapter: '',
      status: 'unresolved',
      priority: input.priority ?? 3,
      createdAt: now,
      updatedAt: now
    };
    const list = [...data.foreshadows];
    list.push(foreshadow);
    await this.configService.writeDataFile({ ...data, foreshadows: list });
    return foreshadow;
  }

  /** 按 id 整体替换伏笔，刷新 updatedAt */
  public async update(foreshadow: Foreshadow): Promise<void> {
    const data = await this.configService.getDataFile();
    const list = [...data.foreshadows];
    const index = list.findIndex(f => f.id === foreshadow.id);
    if (index === -1) {
      return;
    }
    list[index] = { ...foreshadow, updatedAt: localIso() };
    await this.configService.writeDataFile({ ...data, foreshadows: list });
  }

  /** 按 id 删除伏笔 */
  public async remove(id: string): Promise<void> {
    const data = await this.configService.getDataFile();
    const list = [...data.foreshadows];
    const next = list.filter(f => f.id !== id);
    if (next.length === list.length) {
      return;
    }
    await this.configService.writeDataFile({ ...data, foreshadows: next });
  }

  /** 按 id 查找单个伏笔 */
  public async getById(id: string): Promise<Foreshadow | undefined> {
    const data = await this.configService.getDataFile();
    return data.foreshadows.find(f => f.id === id);
  }

  /** 标记推进：向 advancedChapters 追加章节（去重，重复调用为 no-op），未回收时状态升为部分回收 */
  public async advance(id: string, chapter: string): Promise<void> {
    const data = await this.configService.getDataFile();
    const list = [...data.foreshadows];
    const index = list.findIndex(f => f.id === id);
    if (index === -1) {
      return;
    }
    const current = list[index];
    if (current.advancedChapters.includes(chapter)) {
      return;
    }
    list[index] = {
      ...current,
      advancedChapters: [...current.advancedChapters, chapter],
      status: current.status === 'unresolved' ? 'partially' : current.status,
      updatedAt: localIso()
    };
    await this.configService.writeDataFile({ ...data, foreshadows: list });
  }

  /** 标记回收：设置 resolvedChapter，状态改为 resolved */
  public async markResolved(id: string, chapter: string): Promise<void> {
    const data = await this.configService.getDataFile();
    const list = [...data.foreshadows];
    const index = list.findIndex(f => f.id === id);
    if (index === -1) {
      return;
    }
    list[index] = {
      ...list[index],
      resolvedChapter: chapter,
      status: 'resolved',
      updatedAt: localIso()
    };
    await this.configService.writeDataFile({ ...data, foreshadows: list });
  }

  /** 标记废弃：状态改为 abandoned */
  public async markAbandoned(id: string): Promise<void> {
    const data = await this.configService.getDataFile();
    const list = [...data.foreshadows];
    const index = list.findIndex(f => f.id === id);
    if (index === -1) {
      return;
    }
    list[index] = {
      ...list[index],
      status: 'abandoned',
      updatedAt: localIso()
    };
    await this.configService.writeDataFile({ ...data, foreshadows: list });
  }

  /** 未回收伏笔（unresolved + partially），按优先级升序 */
  public async getUnresolved(): Promise<Foreshadow[]> {
    const data = await this.configService.getDataFile();
    return data.foreshadows
      .filter(f => f.status === 'unresolved' || f.status === 'partially')
      .sort((a, b) => a.priority - b.priority);
  }

  /** 检查某个章节是否包含未回收伏笔的埋设/推进记录（用于章节面板标记） */
  public async chapterHasOpenForeshadow(chapterName: string): Promise<boolean> {
    const data = await this.configService.getDataFile();
    return data.foreshadows.some(
      f =>
        (f.status === 'unresolved' || f.status === 'partially') &&
        (f.plantedChapter === chapterName || f.advancedChapters.includes(chapterName))
    );
  }
}

/**
 * 伏笔追踪：生命周期 埋设→推进→回收，按工作区持久化。
 * 所有读写均经由 ConfigService 的故事数据文件（.vscode/novel-assistant-data.json），
 * 变更时克隆数组并整体写回，保留 version / characters / timeline / chapterStatus 字段。
 */
