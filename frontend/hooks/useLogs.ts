import useSWR from 'swr';
import { swrFetcher } from '@/lib/api';

interface LogEntry {
  level: string;
  module: string;
  message: string;
  data: unknown;
  correlationId: string | null;
  timestamp: string;
}

interface LogsResult {
  logs: LogEntry[];
  total: number;
}

export function useLogs(params: {
  level?: string;
  module?: string;
  keyword?: string;
  limit?: number;
  offset?: number;
}, autoRefresh = false) {
  const query = new URLSearchParams();
  if (params.level) query.set('level', params.level);
  if (params.module) query.set('module', params.module);
  if (params.keyword) query.set('keyword', params.keyword);
  if (params.limit) query.set('limit', String(params.limit));
  if (params.offset) query.set('offset', String(params.offset));

  const url = `/api/logs?${query.toString()}`;

  const { data, error, mutate } = useSWR<LogsResult>(
    url,
    swrFetcher,
    { refreshInterval: autoRefresh ? 5000 : 0 }
  );

  return {
    logs: data?.logs || [],
    total: data?.total || 0,
    isLoading: !error && !data,
    error,
    refresh: mutate,
  };
}
