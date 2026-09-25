/**
 * 文本工具：文件扩展名、自然排序、文件名提取、本地日期键等。
 */

/** 从路径中提取文件名 */
export function basename(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || path;
}

/** 获取文件扩展名（小写，含点，如 .txt） */
export function extname(path: string): string {
  const name = basename(path);
  const idx = name.lastIndexOf('.');
  if (idx <= 0) {
    return '';
  }
  return name.slice(idx).toLowerCase();
}

/** 判断文件名是否匹配某扩展名列表 */
export function hasExtension(path: string, extensions: string[]): boolean {
  if (!extensions || extensions.length === 0) {
    return false;
  }
  const ext = extname(path);
  return extensions.some(e => e.toLowerCase() === ext);
}

/** 自然排序比较器（数字感知），适合章节文件名排序 */
export function naturalCompare(a: string, b: string): number {
  const re = /(\d+)|(\D+)/g;
  const pa = a.match(re) ?? [a];
  const pb = b.match(re) ?? [b];
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] ?? '';
    const y = pb[i] ?? '';
    const nx = Number(x);
    const ny = Number(y);
    if (/^\d+$/.test(x) && /^\d+$/.test(y)) {
      if (nx !== ny) {
        return nx - ny;
      }
    } else {
      const cmp = x.localeCompare(y, 'zh-CN');
      if (cmp !== 0) {
        return cmp;
      }
    }
  }
  return 0;
}

/** 本地时区日期键 YYYY-MM-DD */
export function localDateKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** 本地时区时间 ISO（带时区偏移） */
export function localIso(date: Date = new Date()): string {
  const tzOffset = -date.getTimezoneOffset();
  const sign = tzOffset >= 0 ? '+' : '-';
  const abs = Math.abs(tzOffset);
  const hh = String(Math.floor(abs / 60)).padStart(2, '0');
  const mm = String(abs % 60).padStart(2, '0');
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  const s = String(date.getSeconds()).padStart(2, '0');
  return `${y}-${m}-${d}T${h}:${min}:${s}${sign}${hh}:${mm}`;
}

/** 生成短 id */
export function shortId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** 将秒格式化为 "1h23m" / "45m" */
export function formatDuration(seconds: number): string {
  const totalMinutes = Math.floor(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) {
    return `${hours}h${minutes}m`;
  }
  return `${minutes}m`;
}

/** 将秒格式化为 "01:23" 倒计时 */
export function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
