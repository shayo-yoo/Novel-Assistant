import * as vscode from 'vscode';

/**
 * Webview 公共工具：统一主题样式与消息通信。
 */

export const WEBVIEW_STYLE = `
:root {
  --bg: var(--vscode-sideBar-background, #252526);
  --fg: var(--vscode-foreground, #cccccc);
  --border: var(--vscode-widget-border, #454545);
  --accent: var(--vscode-textLink-foreground, #3794ff);
}
* { box-sizing: border-box; }
body {
  margin: 0; padding: 12px;
  background: var(--bg); color: var(--fg);
  font-family: var(--vscode-font-family, "Microsoft YaHei", sans-serif);
  font-size: 13px;
}
h1, h2, h3 { margin: 0 0 8px; }
.card {
  background: var(--vscode-editor-background, #1e1e1e);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 10px;
  margin-bottom: 10px;
}
.grid { display: grid; gap: 8px; }
.row { display: flex; align-items: center; gap: 8px; }
button {
  background: var(--vscode-button-background, #0e639c);
  color: var(--vscode-button-foreground, #ffffff);
  border: none; border-radius: 4px;
  padding: 6px 12px; cursor: pointer;
}
button.secondary { background: var(--vscode-button-secondaryBackground, #3a3d41); }
button:hover { opacity: 0.9; }
button:disabled { opacity: 0.4; cursor: default; }
table { border-collapse: collapse; width: 100%; }
th, td { border: 1px solid var(--border); padding: 4px 6px; text-align: center; }
th { position: sticky; top: 0; background: var(--bg); }
.muted { opacity: 0.7; }
.big { font-size: 22px; font-weight: 700; }
`;

/** 设置 webview 公共选项 */
export function setWebviewOptions(webview: vscode.Webview, localResourceRoots?: vscode.Uri[]): void {
  webview.options = {
    enableScripts: true,
    localResourceRoots: localResourceRoots ?? []
  };
}

/** 包裹 HTML */
export function wrapHtml(title: string, body: string, extraStyle = ''): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<style>${WEBVIEW_STYLE}${extraStyle}</style>
</head>
<body>
${body}
</body>
</html>`;
}

/** 获取 webview 面板或视图的 webview 实例 */
export function webviewOf(target: vscode.WebviewPanel | vscode.WebviewView): vscode.Webview {
  return 'webview' in target ? (target as vscode.WebviewView).webview : (target as vscode.WebviewPanel).webview;
}
