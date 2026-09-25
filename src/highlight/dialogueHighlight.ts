import * as vscode from 'vscode';

/**
 * 对话标记增强（规划文档 3.14）
 * 识别以中文/英文引号、破折号开头的对话行，应用可配置前景/背景/斜体/加粗样式。
 * 使用装饰器实现，不修改文本。
 */

const DIALOGUE_START = /^[\s]*[“‘「『"'——]/;

export class DialogueHighlightService implements vscode.Disposable {
  private decoration: vscode.TextEditorDecorationType | undefined;
  private enabled = false;

  public setEnabled(enabled: boolean): void {
    if (this.enabled === enabled) {
      return;
    }
    this.enabled = enabled;
    if (enabled) {
      this.decoration = vscode.window.createTextEditorDecorationType({
        color: '#8ecae6',
        fontStyle: 'italic',
        backgroundColor: 'rgba(142, 202, 230, 0.15)'
      });
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        this.apply(editor);
      }
    } else {
      this.clear();
    }
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public apply(editor: vscode.TextEditor): void {
    if (!this.enabled || !this.decoration) {
      return;
    }
    const text = editor.document.getText();
    const ranges: vscode.Range[] = [];
    const lines = text.split(/\r?\n/);
    let offset = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) {
        offset += line.length + 1;
        continue;
      }
      if (DIALOGUE_START.test(line)) {
        const start = editor.document.positionAt(offset);
        const end = editor.document.positionAt(offset + line.length);
        ranges.push(new vscode.Range(start, end));
      }
      offset += line.length + 1;
    }
    editor.setDecorations(this.decoration, ranges);
  }

  public clear(): void {
    if (this.decoration) {
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        editor.setDecorations(this.decoration, []);
      }
      this.decoration.dispose();
      this.decoration = undefined;
    }
  }

  public dispose(): void {
    this.clear();
  }
}
