import * as vscode from 'vscode';
import { listCountModes } from '../count/countEngine';
import { NovelConfig, ChapterStatus } from '../types';
import { HighlightGroupService, PRESET_COLORS } from '../highlight/highlightGroupService';

/**
 * QuickPick 交互助手（规划文档 4.5）
 * 所有配置优先使用中文 QuickPick。
 */

export async function pickCountMode(config?: NovelConfig): Promise<string | undefined> {
  const modes = listCountModes(config);
  const pick = await vscode.window.showQuickPick(
    modes.map(m => ({ label: m.name, description: m.id })),
    { placeHolder: '请选择字数统计模式' }
  );
  return pick?.description;
}

export async function pickHighlightGroup(config: NovelConfig, placeholder = '选择高亮组'): Promise<string | undefined> {
  const pick = await vscode.window.showQuickPick(
    config.highlights.map(g => ({
      label: `${g.enabled ? '●' : '○'} ${g.name} (${g.words.length})`,
      description: g.id
    })),
    { placeHolder: placeholder }
  );
  return pick?.description;
}

export interface ColorPick {
  color: string;
  label: string;
}

export async function pickColor(placeholder = '选择颜色'): Promise<string | undefined> {
  const presets = PRESET_COLORS.map(c => ({ label: `${colorBlock(c.value)} ${c.name}`, description: c.value }));
  const actions = [
    { label: '🎲 随机颜色', description: '__random__' },
    { label: '✏️ 输入自定义十六进制颜色', description: '__custom__' }
  ];
  const pick = await vscode.window.showQuickPick([...presets, ...actions], { placeHolder: placeholder });
  if (!pick) {
    return undefined;
  }
  if (pick.description === '__random__') {
    return HighlightGroupService.randomColor();
  }
  if (pick.description === '__custom__') {
    const input = await vscode.window.showInputBox({
      prompt: '输入十六进制颜色，如 #FFD700',
      validateInput: v => (/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(v) ? null : '请输入合法的十六进制颜色')
    });
    return input || undefined;
  }
  return pick.description;
}

export function colorBlock(color: string): string {
  return '●';
}

export async function pickChapterStatus(current?: ChapterStatus): Promise<ChapterStatus | undefined> {
  const statuses: { id: ChapterStatus; label: string }[] = [
    { id: 'draft', label: '草稿' },
    { id: 'revising', label: '修改中' },
    { id: 'done', label: '完成' }
  ];
  const pick = await vscode.window.showQuickPick(
    statuses.map(s => ({ label: `${s.id === current ? '✓ ' : ''}${s.label}`, description: s.id })),
    { placeHolder: '选择章节状态' }
  );
  return pick?.description as ChapterStatus | undefined;
}

export async function pickTimelineType(): Promise<string | undefined> {
  const types = [
    { id: 'battle', label: '战斗' },
    { id: 'romance', label: '感情' },
    { id: 'twist', label: '转折' },
    { id: 'daily', label: '日常' },
    { id: 'foreshadow', label: '伏笔' },
    { id: 'other', label: '其他' }
  ];
  const pick = await vscode.window.showQuickPick(types.map(t => ({ label: t.label, description: t.id })), { placeHolder: '选择事件类型' });
  return pick?.description;
}

export async function pickTimelineStatus(): Promise<string | undefined> {
  const statuses = [
    { id: 'planned', label: '计划' },
    { id: 'written', label: '已写' },
    { id: 'revised', label: '已修改' },
    { id: 'abandoned', label: '废弃' }
  ];
  const pick = await vscode.window.showQuickPick(statuses.map(s => ({ label: s.label, description: s.id })), { placeHolder: '选择事件状态' });
  return pick?.description;
}

export async function pickForeshadowStatus(): Promise<string | undefined> {
  const statuses = [
    { id: 'unresolved', label: '未回收' },
    { id: 'partially', label: '部分回收' },
    { id: 'resolved', label: '已回收' },
    { id: 'abandoned', label: '废弃' }
  ];
  const pick = await vscode.window.showQuickPick(statuses.map(s => ({ label: s.label, description: s.id })), { placeHolder: '选择伏笔状态' });
  return pick?.description;
}

export async function pickSprintMinutes(): Promise<number | undefined> {
  const pick = await vscode.window.showQuickPick(['5', '10', '15', '30', '60'].map(m => ({ label: `${m} 分钟`, description: m })), { placeHolder: '选择写作冲刺时长' });
  return pick ? Number(pick.description) : undefined;
}

export async function inputTargetWords(): Promise<number> {
  const input = await vscode.window.showInputBox({ prompt: '请输入目标字数（留空则不设目标）', placeHolder: '例如 1000' });
  if (!input) {
    return 0;
  }
  const n = Number(input);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export async function confirm(message: string, yesLabel = '确定', noLabel = '取消'): Promise<boolean> {
  const answer = await vscode.window.showWarningMessage(message, yesLabel, noLabel);
  return answer === yesLabel;
}
