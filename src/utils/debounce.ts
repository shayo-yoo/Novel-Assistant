/**
 * 通用工具函数
 */

/**
 * 创建一个防抖函数。调用后若在 wait 毫秒内再次调用，则重置计时器。
 */
export function debounce<T extends (...args: any[]) => void>(func: T, wait: number): T & { cancel(): void } {
  let timer: NodeJS.Timeout | undefined;
  const debounced = function (this: unknown, ...args: Parameters<T>) {
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      timer = undefined;
      func.apply(this, args);
    }, wait);
  } as T & { cancel(): void };
  debounced.cancel = () => {
    if (timer) {
      clearTimeout(timer);
      timer = undefined;
    }
  };
  return debounced;
}

/** 简单节流 */
export function throttle<T extends (...args: any[]) => void>(func: T, limit: number): (...args: Parameters<T>) => void {
  let inThrottle = false;
  return function (this: unknown, ...args: Parameters<T>) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => {
        inThrottle = false;
      }, limit);
    }
  };
}

/** 合并任意长度的字符串为单个字符串 */
export function joinLines(lines: string[], eol: string): string {
  return lines.join(eol);
}