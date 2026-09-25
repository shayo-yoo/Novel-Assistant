import * as vscode from 'vscode';
import { NovelConfig, ChapterStatus } from '../types';
import { ConfigService } from '../config/configService';
import { countText } from '../count/countEngine';
import { naturalCompare, basename, extname } from '../utils/text';

/**
 * 章节服务（规划文档 3.9）
 * 默认一个文本文件视为一个章节；章节顺序按文件名自然排序。
 */

export interface ChapterInfo {
  name: string;
  uri: vscode.Uri;
  wordCount: number;
  status: ChapterStatus;
  lastEdited: string;
  hasSensitive: boolean;
  hasOpenForeshadow: boolean;
}

export class ChapterService {
  constructor(
    private readonly configService: ConfigService,
    private readonly checkSensitive: (text: string) => boolean,
    private readonly checkForeshadow: (chapterName: string) => Promise<boolean>
  ) {}

  /** 查找工作区内全部小说章节文件 */
  public async findChapterUris(folder: vscode.WorkspaceFolder, config: NovelConfig): Promise<vscode.Uri[]> {
    const exts = config.fileExtensions.length ? config.fileExtensions : ['.txt'];
    // 使用 glob 花括号语法组合多种扩展名
    const pattern = `**/*{${exts.join(',')}}`;
    const excludes = config.excludeGlobs?.join(',') || '**/.git/**';
    const uris = await vscode.workspace.findFiles(pattern, excludes);
    return uris;
  }

  /** 获取全部章节信息（含字数、状态、标记） */
  public async getChapters(folder: vscode.WorkspaceFolder, config: NovelConfig): Promise<ChapterInfo[]> {
    const uris = await this.findChapterUris(folder, config);
    const data = await this.configService.getDataFile(folder);
    const items = await Promise.all(
      uris.map(async uri => {
        const name = basename(uri.fsPath);
        let wordCount = 0;
        let hasSensitive = false;
        let lastEdited = '';
        try {
          const doc = await vscode.workspace.openTextDocument(uri);
          const text = doc.getText();
          wordCount = countText(text, config.countMode, config);
          hasSensitive = this.checkSensitive(text);
        } catch {
          wordCount = 0;
        }
        try {
          const stat = await vscode.workspace.fs.stat(uri);
          lastEdited = stat.mtime ? new Date(stat.mtime).toLocaleString('zh-CN', { hour12: false }) : '';
        } catch {
          lastEdited = '';
        }
        return {
          name,
          uri,
          wordCount,
          status: data.chapterStatus[name] ?? ('draft' as ChapterStatus),
          lastEdited,
          hasSensitive,
          hasOpenForeshadow: await this.checkForeshadow(name)
        };
      })
    );
    items.sort((a, b) => naturalCompare(a.name, b.name));
    return items;
  }

  /** 新建章节：自动创建文件并按默认缩进应用格式化 */
  public async createChapter(folder: vscode.WorkspaceFolder, name: string): Promise<vscode.Uri | undefined> {
    const safeName = name.trim();
    if (!safeName) {
      return undefined;
    }
    const fileName = `${safeName}${extname(safeName) || '.txt'}`;
    const uri = vscode.Uri.joinPath(folder.uri, fileName);
    try {
      await vscode.workspace.fs.stat(uri);
      const answer = await vscode.window.showWarningMessage(`章节“${fileName}”已存在，是否覆盖？`, '覆盖', '取消');
      if (answer !== '覆盖') {
        return undefined;
      }
    } catch {
      // 不存在，正常创建
    }
    const config = await this.configService.getConfig(folder);
    const template = `${config.formatIndent || '    '}${safeName}\n\n`;
    await vscode.workspace.fs.writeFile(uri, Buffer.from(template, 'utf8'));
    return uri;
  }

  public async renameChapter(uri: vscode.Uri, newName: string): Promise<void> {
    const dir = vscode.Uri.joinPath(uri, '..');
    const oldName = basename(uri.fsPath);
    const target = vscode.Uri.joinPath(dir, newName.trim());
    try {
      await vscode.workspace.fs.rename(uri, target);
      // 更新章节状态键
      const folder = this.configService.getFolderForUri(uri);
      if (folder) {
        const data = await this.configService.getDataFile(folder);
        if (oldName in data.chapterStatus) {
          data.chapterStatus[basename(target.fsPath)] = data.chapterStatus[oldName];
          delete data.chapterStatus[oldName];
          await this.configService.writeDataFile(data, folder);
        }
      }
    } catch (e) {
      vscode.window.showErrorMessage(`重命名失败：${e instanceof Error ? e.message : String(e)}`);
    }
  }

  public async deleteChapter(uri: vscode.Uri): Promise<void> {
    const name = basename(uri.fsPath);
    const answer = await vscode.window.showWarningMessage(`确定删除章节“${name}”吗？此操作不可撤销。`, '删除', '取消');
    if (answer !== '删除') {
      return;
    }
    try {
      await vscode.workspace.fs.delete(uri, { recursive: false });
    } catch (e) {
      vscode.window.showErrorMessage(`删除失败：${e instanceof Error ? e.message : String(e)}`);
    }
  }

  public async setStatus(uri: vscode.Uri, status: ChapterStatus): Promise<void> {
    const folder = this.configService.getFolderForUri(uri);
    if (!folder) {
      return;
    }
    const data = await this.configService.getDataFile(folder);
    data.chapterStatus[basename(uri.fsPath)] = status;
    await this.configService.writeDataFile(data, folder);
  }
}
