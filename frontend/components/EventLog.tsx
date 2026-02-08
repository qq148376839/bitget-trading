'use client';

import React from 'react';
import { Card, List, Tag, Typography, Empty } from 'antd';
import { useEvents } from '@/hooks/useEvents';
import { EVENT_CONFIG } from '@/lib/constants';
import { formatTime } from '@/lib/formatters';
import type { StrategyEvent, StrategyEventType } from '@/lib/types';

const { Text } = Typography;

function EventItem({ event }: { event: StrategyEvent }) {
  const config = EVENT_CONFIG[event.type as StrategyEventType] || { label: event.type, color: 'default' };

  const summary = formatEventData(event);

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '4px 0' }}>
      <Tag color={config.color} style={{ flexShrink: 0, margin: 0 }}>
        {config.label}
      </Tag>
      <Text type="secondary" style={{ fontSize: 11, flexShrink: 0, fontFamily: 'monospace' }}>
        {formatTime(event.timestamp)}
      </Text>
      {summary && (
        <Text style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {summary}
        </Text>
      )}
    </div>
  );
}

function formatEventData(event: StrategyEvent): string {
  const d = event.data;
  switch (event.type) {
    case 'BUY_ORDER_PLACED':
      return `价格 ${d.price} 数量 ${d.size}`;
    case 'SELL_ORDER_PLACED':
      return `买价 ${d.buyPrice} → 卖价 ${d.sellPrice}`;
    case 'SELL_ORDER_FILLED':
      return d.netPnl ? `PnL ${d.netPnl}` : `价格 ${d.sellPrice}`;
    case 'BUY_ORDER_CANCELLED':
      return `旧价 ${d.oldPrice}`;
    case 'ORDERS_MERGED':
      return `${d.cancelledCount || '?'}单合并 → ${d.mergedPrice || ''}`;
    case 'STRATEGY_ERROR':
      return `${d.loop}: ${d.error}`;
    case 'CONFIG_UPDATED':
      return JSON.stringify(d.changes).slice(0, 60);
    default:
      return '';
  }
}

export default function EventLog() {
  const { events, isLoading } = useEvents();

  const reversedEvents = events ? [...events].reverse() : [];

  return (
    <Card
      title={`事件日志 (${reversedEvents.length})`}
      styles={{ body: { padding: '8px 16px' } }}
    >
      <div className="event-log-container" style={{ maxHeight: 500, overflowY: 'auto' }}>
        {reversedEvents.length === 0 ? (
          <Empty description="暂无事件" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          <List
            size="small"
            loading={isLoading}
            dataSource={reversedEvents}
            renderItem={(event: StrategyEvent, index: number) => (
              <EventItem key={`${event.timestamp}-${index}`} event={event} />
            )}
          />
        )}
      </div>
    </Card>
  );
}
