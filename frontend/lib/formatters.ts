import dayjs from 'dayjs';

export function formatTimestamp(ms: number): string {
  return dayjs(ms).format('MM-DD HH:mm:ss');
}

export function formatTime(ms: number): string {
  return dayjs(ms).format('HH:mm:ss');
}

export function formatUptime(ms: number): string {
  if (ms <= 0) return '-';
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}天 ${hours % 24}小时 ${minutes % 60}分`;
  if (hours > 0) return `${hours}小时 ${minutes % 60}分`;
  if (minutes > 0) return `${minutes}分 ${seconds % 60}秒`;
  return `${seconds}秒`;
}

export function formatPnl(value: string): { text: string; color: string } {
  const num = parseFloat(value);
  if (isNaN(num)) return { text: '0.0000', color: '#000' };
  const prefix = num > 0 ? '+' : '';
  return {
    text: `${prefix}${num.toFixed(4)}`,
    color: num > 0 ? '#3f8600' : num < 0 ? '#cf1322' : '#000',
  };
}

export function formatUsdt(value: string): string {
  const num = parseFloat(value);
  if (isNaN(num)) return '0';
  return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

export function formatPercent(value: string): string {
  return `${value}%`;
}

export function truncateOrderId(orderId: string): string {
  if (orderId.length <= 12) return orderId;
  return `${orderId.slice(0, 6)}...${orderId.slice(-6)}`;
}
