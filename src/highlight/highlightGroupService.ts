import { NovelConfig, HighlightGroup } from '../types';
import { DEFAULT_HIGHLIGHT_GROUPS } from '../config/defaultConfig';
import { shortId } from '../utils/text';

/**
 * 高亮分组服务（规划文档 3.4）
 * 提供高亮组的增删改查、词管理、颜色与匹配选项。操作结果通过回调写回配置。
 */

/** 预设颜色（带中文名） */
export const PRESET_COLORS: { name: string; value: string }[] = [
  { name: '金色', value: '#FFD700' },
  { name: '浅蓝', value: '#87CEEB' },
  { name: '浅红', value: '#FFB6C1' },
  { name: '浅绿', value: '#90EE90' },
  { name: '灰色', value: '#D3D3D3' },
  { name: '橙色', value: '#FFA500' },
  { name: '紫色', value: '#DDA0DD' },
  { name: '青色', value: '#AFEEEE' },
  { name: '黄色', value: '#FFFACD' }
];

export class HighlightGroupService {
  constructor(private readonly getConfig: () => Promise<NovelConfig>, private readonly saveConfig: (c: NovelConfig) => Promise<void>) {}

  public async getGroups(): Promise<HighlightGroup[]> {
    const config = await this.getConfig();
    return config.highlights;
  }

  public async addGroup(name: string, color: string): Promise<HighlightGroup> {
    const config = await this.getConfig();
    const group: HighlightGroup = {
      id: shortId(),
      name,
      color,
      enabled: true,
      priority: config.highlights.length + 1,
      words: [],
      matchCase: false,
      wholeWord: false,
      regex: false,
      style: 'background'
    };
    config.highlights.push(group);
    await this.saveConfig(config);
    return group;
  }

  public async removeGroup(id: string): Promise<void> {
    const config = await this.getConfig();
    config.highlights = config.highlights.filter(g => g.id !== id);
    await this.saveConfig(config);
  }

  public async updateGroup(id: string, patch: Partial<HighlightGroup>): Promise<void> {
    const config = await this.getConfig();
    const group = config.highlights.find(g => g.id === id);
    if (!group) {
      return;
    }
    Object.assign(group, patch);
    await this.saveConfig(config);
  }

  public async addWord(groupId: string, word: string, dedupe = true): Promise<void> {
    const trimmed = word.trim();
    if (!trimmed) {
      return;
    }
    const config = await this.getConfig();
    const group = config.highlights.find(g => g.id === groupId);
    if (!group) {
      return;
    }
    if (dedupe && group.words.includes(trimmed)) {
      return;
    }
    group.words.push(trimmed);
    await this.saveConfig(config);
  }

  public async removeWord(groupId: string, word: string): Promise<void> {
    const config = await this.getConfig();
    const group = config.highlights.find(g => g.id === groupId);
    if (!group) {
      return;
    }
    group.words = group.words.filter(w => w !== word);
    await this.saveConfig(config);
  }

  public async resetToDefault(): Promise<void> {
    const config = await this.getConfig();
    config.highlights = DEFAULT_HIGHLIGHT_GROUPS.map(g => ({ ...g, words: [...g.words] }));
    await this.saveConfig(config);
  }

  /** 把一批词加入指定组（用于批量导入），返回新增数 */
  public async addWords(groupId: string, words: string[], dedupe = true): Promise<number> {
    const config = await this.getConfig();
    const group = config.highlights.find(g => g.id === groupId);
    if (!group) {
      return 0;
    }
    let added = 0;
    for (const w of words) {
      const t = w.trim();
      if (!t || (dedupe && group.words.includes(t))) {
        continue;
      }
      group.words.push(t);
      added++;
    }
    if (added > 0) {
      await this.saveConfig(config);
    }
    return added;
  }

  /** 生成随机颜色 */
  public static randomColor(): string {
    const hue = Math.floor(Math.random() * 360);
    return `hsl(${hue}, 65%, 75%)`;
  }
}