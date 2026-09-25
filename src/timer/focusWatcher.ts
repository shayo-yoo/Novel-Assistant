import * as vscode from 'vscode';

/**
 * 焦点监视器：监听窗口活动状态（规划文档 2.4）。
 * 仅当 VSCode 窗口为 OS 前台窗口且 window.state.focused 时视为活动。
 */
export class FocusWatcher {
  private readonly emitter = new vscode.EventEmitter<boolean>();
  public readonly onFocusChange = this.emitter.event;
  public focused = vscode.window.state.focused;

  constructor() {
    vscode.window.onDidChangeWindowState(state => {
      this.focused = state.focused;
      this.emitter.fire(state.focused);
    });
  }

  public dispose(): void {
    this.emitter.dispose();
  }
}
