import * as vscode from 'vscode';
import { NovelConfig } from '../types';
import { TitleDetector } from './titleDetector';

/**
 * 格式化服务：将小说正文每段开头设为四个半角空格。
 * 不破坏原有内容、不修改行内空格、保留换行符风格（规划文档 3.3）。
 */

export class FormatService {
  constructor(private readonly configService: { getConfig(folder?: vscode.WorkspaceFolder): Promise<NovelConfig> }) {}

  /** 解析原始文本为行数组，并记录每行的原始长度以精确还原 */
  private formatText(text: string, config: NovelConfig): string {
    const lines = text.split(/\r?\n/);
    const detector = new TitleDetector(config);
    const indent = config.formatIndent || '    ';
    const result = lines.map(line => {
      const trimmed = line.trim();
      if (!trimmed) {
        return line;
      }
      if (detector.shouldSkipIndent(line)) {
        return line;
      }
      // 移除所有前导半角空格、全角空格、Tab，再加缩进
      const stripped = line.replace(/^[\t\u3000 ]+/u, '');
      return `${indent}${stripped}`;
    });
    return result.join(detectEol(text));
  }

  /** 格式化整个文档（单个 WorkspaceEdit，支持一次撤销） */
  public async formatDocument(document: vscode.TextDocument, config: NovelConfig): Promise<boolean> {
    const text = document.getText();
    if (!text.trim()) {
      return false;
    }
    const formatted = this.formatText(text, config);
    if (formatted === text) {
      return false;
    }
    const edit = new vscode.WorkspaceEdit();
    const fullRange = new vscode.Range(0, 0, document.lineCount, 0);
    edit.replace(document.uri, fullRange, formatted);
    const applied = await vscode.workspace.applyEdit(edit);
    return applied;
  }

  /** 格式化选中段落（保留选择区域外不变） */
  public async formatSelection(editor: vscode.TextEditor, config: NovelConfig): Promise<boolean> {
    const selection = editor.selection;
    if (selection.isEmpty) {
      return false;
    }
    const selected = editor.document.getText(selection);
    if (!selected.trim()) {
      return false;
    }
    const formatted = this.formatText(selected, config);
    if (formatted === selected) {
      return false;
    }
    const edit = new vscode.WorkspaceEdit();
    edit.replace(editor.document.uri, selection, formatted);
    const applied = await vscode.workspace.applyEdit(edit);
    return applied;
  }

  /** 批量格式化整个工作区中的全部小说文件 */
  public async formatWorkspace(folder: vscode.WorkspaceFolder, config: NovelConfig): Promise<number> {
    const exts = config.fileExtensions.length ? config.fileExtensions : ['.txt'];
    const pattern = `**/*{${exts.join(',')}}`;
    const uris = await vscode.workspace.findFiles(pattern, config.excludeGlobs?.join(',') ?? '');
    let formattedCount = 0;
    for (const uri of uris) {
      try {
        const doc = await vscode.workspace.openTextDocument(uri);
        const applied = await this.formatDocument(doc, config);
        if (applied) {
          formattedCount++;
        }
      } catch {
        // 跳过无法打开的文件
      }
    }
    return formattedCount;
  }
}

/** 检测换行符风格：优先保留原始文件 EOL，其次按文本推断 */
export function detectEol(text: string): string {
  if (text.includes('\r\n')) {
    return '\r\n';
  }
  return '\n';
}
