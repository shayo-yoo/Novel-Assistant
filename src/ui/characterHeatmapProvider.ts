import * as vscode from 'vscode';
import { CharacterService, CharacterHeatmapRow } from '../characters/characterService';
import { ChapterService } from '../chapters/chapterService';
import { NovelConfig } from '../types';
import { wrapHtml } from './webviewUtil';

/**
 * 角色引用热力图（规划文档 3.10 / 4.2）
 * 行：角色；列：章节；单元格：出现次数，颜色随次数加深；点击跳转章节；可导出。
 */

export class CharacterHeatmapProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;

  constructor(
    private readonly characterService: CharacterService,
    private readonly chapterService: ChapterService,
    private readonly getConfig: () => Promise<NovelConfig>
  ) {}

  public resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = wrapHtml('角色热力图', '<div class="muted">加载中…</div>');
    webviewView.webview.onDidReceiveMessage(msg => {
      switch (msg.command) {
        case 'refresh':
          void this.render();
          break;
        case 'openChapter':
          void vscode.commands.executeCommand('novelAssistant.openChapterFile', msg.chapter);
          break;
        case 'export':
          void vscode.commands.executeCommand('novelAssistant.exportCharacterHeatmap');
          break;
      }
    });
    void this.render();
  }

  public async render(): Promise<void> {
    if (!this.view) {
      return;
    }
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) {
      this.view.webview.html = wrapHtml('角色热力图', '<div class="muted">请先打开一个小说工作区。</div>');
      return;
    }
    const config = await this.getConfig();
    const chapters = await this.chapterService.findChapterUris(folder, config);
    const chapterTexts = await Promise.all(
      chapters.map(async uri => {
        try {
          const doc = await vscode.workspace.openTextDocument(uri);
          return { name: uri.fsPath.split(/[\\/]/).pop() ?? uri.path, text: doc.getText() };
        } catch {
          return { name: uri.fsPath.split(/[\\/]/).pop() ?? uri.path, text: '' };
        }
      })
    );
    const rows = await this.characterService.buildHeatmap(chapterTexts);

    if (rows.length === 0) {
      this.view.webview.html = wrapHtml('角色热力图',
        '<div class="muted">暂无角色。请先通过「将选中文本设为角色」或在角色管理中创建角色。</div>');
      return;
    }

    const maxCount = Math.max(1, ...rows.flatMap(r => r.occurrences.map(o => o.count)));
    const header = `<tr><th>角色</th><th>总次数</th>${chapterTexts.map(c => `<th title="${c.name}">${shortName(c.name)}</th>`).join('')}</tr>`;
    const trs = rows.map(row => {
      const cells = row.occurrences.map(o => {
        const depth = o.count === 0 ? 0 : 0.25 + (o.count / maxCount) * 0.75;
        return `<td title="${row.character.name} × ${o.chapter}：${o.count} 次" style="background:rgba(55,148,255,${depth});cursor:pointer;" onclick="post('openChapter',{chapter:'${escapeJs(o.chapter)}'})">${o.count || ''}</td>`;
      }).join('');
      return `<tr><td style="text-align:left;">${row.character.name}</td><td><b>${row.total}</b></td>${cells}</tr>`;
    }).join('');

    const body = `
<h2>🧑‍🤝‍🧑 角色引用热力图</h2>
<div class="card row">
  <button onclick="post('refresh')">刷新</button>
  <button class="secondary" onclick="post('export')">导出 CSV</button>
  <span class="muted">点击单元格跳转章节</span>
</div>
<div class="card" style="overflow:auto;max-height:70vh;">
  <table><thead>${header}</thead><tbody>${trs}</tbody></table>
</div>
<script>
const vscode = acquireVsCodeApi();
function post(command, extra = {}) { vscode.postMessage({ command, ...extra }); }
</script>`;
    this.view.webview.html = wrapHtml('角色热力图', body);
  }
}

function shortName(name: string): string {
  const n = name.replace(/\.(txt|md|text|novel)$/i, '');
  return n.length > 8 ? n.slice(0, 8) + '…' : n;
}

function escapeJs(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}
