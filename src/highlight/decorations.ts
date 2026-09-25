import * as vscode from 'vscode';
import { HighlightGroup } from '../types';

/**
 * 装饰管理器：根据高亮组的样式与颜色创建/缓存 TextEditorDecorationType。
 * 配置变化时需调用 rebuild 重建并释放旧的装饰。
 */

export class DecorationManager implements vscode.Disposable {
  private cache = new Map<string, vscode.TextEditorDecorationType>();

  public get(group: HighlightGroup): vscode.TextEditorDecorationType | undefined {
    return this.cache.get(group.id);
  }

  /** 根据当前组列表重建全部装饰类型 */
  public rebuild(groups: HighlightGroup[]): void {
    this.dispose();
    for (const group of groups) {
      if (!group.enabled || !group.words.length || !isValidColor(group.color)) {
        continue;
      }
      const type = vscode.window.createTextEditorDecorationType(createDecorationOptions(group));
      this.cache.set(group.id, type);
    }
  }

  public dispose(): void {
    for (const type of this.cache.values()) {
      type.dispose();
    }
    this.cache.clear();
  }
}

export function isValidColor(color: string): boolean {
  return /^#[0-9a-fA-F]{3,8}$/.test(color) || /^hsl?\(/.test(color) || /^rgb/.test(color);
}

/** 根据组样式生成装饰选项 */
export function createDecorationOptions(group: HighlightGroup): vscode.DecorationRenderOptions {
  const color = isValidColor(group.color) ? group.color : '#FFD700';
  const options: vscode.DecorationRenderOptions = {};
  switch (group.style) {
    case 'underline':
      options.textDecoration = `underline 2px ${color}`;
      options.color = undefined;
      break;
    case 'border':
      options.border = `1px solid ${color}`;
      options.backgroundColor = undefined;
      break;
    case 'bold':
      options.fontWeight = 'bold';
      options.color = color;
      break;
    case 'italic':
      options.fontStyle = 'italic';
      options.color = color;
      break;
    case 'background':
    default:
      // 用半透明背景近似色块，避免过重
      options.backgroundColor = toRgba(color, 0.55);
      options.border = `1px solid ${color}`;
      break;
  }
  return options;
}

/** 十六进制/HSL 颜色转 rgba 字符串 */
export function toRgba(color: string, alpha: number): string {
  if (/^#/.test(color)) {
    let hex = color.slice(1);
    if (hex.length === 3) {
      hex = hex.split('').map(c => c + c).join('');
    }
    const num = parseInt(hex, 16);
    if (hex.length >= 6 && !Number.isNaN(num)) {
      const r = (num >> 16) & 255;
      const g = (num >> 8) & 255;
      const b = num & 255;
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
  }
  if (/^hsl/.test(color)) {
    return color;
  }
  return color;
}