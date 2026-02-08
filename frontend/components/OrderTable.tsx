'use client';

import React, { useMemo, useState } from 'react';
import { Card, Table, Tag, Select, Space, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useOrders } from '@/hooks/useOrders';
import type { TrackedOrder, TrackedOrderStatus } from '@/lib/types';
import { formatTimestamp, truncateOrderId } from '@/lib/formatters';
import { SIDE_LABELS, ORDER_STATUS_LABELS } from '@/lib/constants';

const { Text } = Typography;

const statusTagColors: Record<TrackedOrderStatus, string> = {
  pending: 'processing',
  filled: 'success',
  cancelled: 'default',
  failed: 'error',
};

const sideTagColors: Record<string, string> = {
  buy: 'blue',
  sell: 'red',
};

export default function OrderTable() {
  const { orders, isLoading } = useOrders();
  const [statusFilter, setStatusFilter] = useState<TrackedOrderStatus | 'all'>('all');

  const filteredOrders = useMemo(() => {
    if (!orders?.orders) return [];
    const sorted = [...orders.orders].sort((a, b) => b.createdAt - a.createdAt);
    if (statusFilter === 'all') return sorted;
    return sorted.filter(o => o.status === statusFilter);
  }, [orders, statusFilter]);

  const columns: ColumnsType<TrackedOrder> = [
    {
      title: '订单ID',
      dataIndex: 'orderId',
      width: 140,
      render: (id: string) => (
        <Typography.Text copyable={{ text: id }} style={{ fontFamily: 'monospace', fontSize: 12 }}>
          {truncateOrderId(id)}
        </Typography.Text>
      ),
    },
    {
      title: '方向',
      dataIndex: 'side',
      width: 80,
      render: (side: string) => (
        <Tag color={sideTagColors[side]}>{SIDE_LABELS[side] || side}</Tag>
      ),
    },
    {
      title: '价格',
      dataIndex: 'price',
      width: 120,
      align: 'right',
      render: (price: string) => <span className="mono-number">{price}</span>,
    },
    {
      title: '数量',
      dataIndex: 'size',
      width: 100,
      align: 'right',
      render: (size: string) => <span className="mono-number">{size}</span>,
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: (status: TrackedOrderStatus) => (
        <Tag color={statusTagColors[status]}>
          {ORDER_STATUS_LABELS[status] || status}
        </Tag>
      ),
    },
    {
      title: '时间',
      dataIndex: 'createdAt',
      width: 140,
      render: (ts: number) => <Text type="secondary" style={{ fontSize: 12 }}>{formatTimestamp(ts)}</Text>,
    },
  ];

  return (
    <Card
      title={
        <Space>
          <span>订单追踪</span>
          {orders && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              共 {orders.total} | 挂单 {orders.pending} | 成交 {orders.filled} | 撤销 {orders.cancelled}
            </Text>
          )}
        </Space>
      }
      extra={
        <Select
          value={statusFilter}
          onChange={setStatusFilter}
          style={{ width: 120 }}
          size="small"
          options={[
            { label: '全部', value: 'all' },
            { label: '挂单中', value: 'pending' },
            { label: '已成交', value: 'filled' },
            { label: '已撤销', value: 'cancelled' },
            { label: '失败', value: 'failed' },
          ]}
        />
      }
    >
      <Table<TrackedOrder>
        columns={columns}
        dataSource={filteredOrders}
        rowKey="orderId"
        size="small"
        loading={isLoading}
        pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (total) => `共 ${total} 条` }}
        scroll={{ y: 400 }}
      />
    </Card>
  );
}
