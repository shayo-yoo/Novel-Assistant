import type { Character, NovelData } from '../types';
import type { ConfigService } from '../config/configService';
import { shortId, localIso } from '../utils/text';

/** 一个章节的文本内容（name 用于展示/排序，text 用于统计） */
export interface ChapterText {
  name: string;
  text: string;
}

/** 单个章节中某角色出现的次数 */
export interface CharacterOccurrence {
  chapter: string;
  count: number;
}

/** 热力图一行：一个角色在各章节的出现次数及合计 */
export interface CharacterHeatmapRow {
  character: Character;
  occurrences: CharacterOccurrence[];
  total: number;
}

/**
 * 角色管理服务：负责角色数据的增删改查、别名合并统计与章节出场频次热力图构建。
 * 所有读写均经由 ConfigService 的故事数据文件进行，不直接写其他文件。
 */
export class CharacterService {
  constructor(private readonly configService: ConfigService) {}

  /** 读取数据文件，返回角色数组 */
  async getAll(): Promise<Character[]> {
    const data = await this.configService.getDataFile();
    return data.characters;
  }

  /** 新增角色 */
  async add(input: {
    name: string;
    aliases?: string[];
    highlightGroupId?: string;
    description?: string;
  }): Promise<Character> {
    const data = await this.configService.getDataFile();
    const now = localIso();
    const character: Character = {
      id: shortId(),
      name: input.name.trim(),
      aliases: input.aliases ?? [],
      description: input.description ?? '',
      createdAt: now,
      updatedAt: now
    };
    if (input.highlightGroupId !== undefined) {
      character.highlightGroupId = input.highlightGroupId;
    }
    const list = [...data.characters, character];
    await this.configService.writeDataFile({ ...data, characters: list });
    return character;
  }

  /** 按 id 整条替换角色，并刷新 updatedAt */
  async update(character: Character): Promise<void> {
    const data = await this.configService.getDataFile();
    const list = data.characters.map(c =>
      c.id === character.id ? { ...character, updatedAt: localIso() } : c
    );
    await this.configService.writeDataFile({ ...data, characters: list });
  }

  /** 按 id 删除角色 */
  async remove(id: string): Promise<void> {
    const data = await this.configService.getDataFile();
    const list = data.characters.filter(c => c.id !== id);
    await this.configService.writeDataFile({ ...data, characters: list });
  }

  /** 按 id 查找角色 */
  async getById(id: string): Promise<Character | undefined> {
    const data = await this.configService.getDataFile();
    return data.characters.find(c => c.id === id);
  }

  /**
   * 统计角色在文本中的出现次数。
   * 对角色名及每个别名进行大小写不敏感的全局子串匹配，权重相同。
   * 若别名与角色名相同，为避免重复统计仅计一次。
   */
  static countOccurrences(character: Character, text: string): number {
    const terms = new Set<string>([character.name, ...character.aliases].filter(s => s.trim().length > 0));
    let total = 0;
    for (const term of terms) {
      // 转义正则特殊字符
      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(escaped, 'gi');
      const matches = text.match(re);
      total += matches ? matches.length : 0;
    }
    return total;
  }

  /**
   * 构建完整热力图：按传入章节顺序，为每个角色统计每个章节的出现次数（无则为 0），并汇总 total。
   */
  async buildHeatmap(chapters: ChapterText[]): Promise<CharacterHeatmapRow[]> {
    const chars = (await this.configService.getDataFile()).characters;
    return chars.map(character => {
      const occurrences: CharacterOccurrence[] = chapters.map(chapter => ({
        chapter: chapter.name,
        count: CharacterService.countOccurrences(character, chapter.text)
      }));
      const total = occurrences.reduce((sum, occ) => sum + occ.count, 0);
      return { character, occurrences, total };
    });
  }

  /** 确保至少存在一个指定名字的角色（用于快速添加），返回该角色 */
  async ensureCharacter(name: string, highlightGroupId?: string): Promise<Character> {
    const data = await this.configService.getDataFile();
    const trimmed = name.trim();
    const existing = data.characters.find(c => c.name === trimmed);
    if (existing) {
      return existing;
    }
    const character: Character = {
      id: shortId(),
      name: trimmed,
      aliases: [],
      description: '',
      createdAt: localIso(),
      updatedAt: localIso()
    };
    if (highlightGroupId !== undefined) {
      character.highlightGroupId = highlightGroupId;
    }
    const list = [...data.characters, character];
    await this.configService.writeDataFile({ ...data, characters: list });
    return character;
  }
}

/**
 * 模块职责：角色管理 —— 提供角色的增删改查（CRUD）、
 * 角色名与别名合并的出现次数统计，以及章节出场频次热力图（CharacterHeatmapRow）数据的构建。
 */