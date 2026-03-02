'use client';

import React, { useState } from 'react';
import { Table, Select, Input, Space, Tag, Button, Switch, App } from 'antd';
import { ReloadOutlined, DeleteOutlined } from '@ant-design/icons';
import { useLogs } from '@/hooks/useLogs';
import { api } from '@/lib/api';
import dayjs from 'dayjs';

const LEVEL_COLORS: Record<string, string> = {
  DEBUG: 'default',
  INFO: 'blue',
  WARN: 'orange',
  ERROR: 'red',
};

export default function LogViewer() {
  const { message } = App.useApp();
  const [level, setLevel] = useState<string | undefined>(undefined);
  const [module, setModule] = useState<string | undefined>(undefined);
  const [keyword, setKeyword] = useState<string | undefined>(undefined);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 50;

  const { logs, total, isLoading, refresh } = useLogs(
    { level, module, keyword, limit: pageSize, offset: (page - 1) * pageSize },
    autoRefresh
  );

  const handleCleanup = async () => {
    try {
      const res = await fetch('/api/logs/cleanup?days=7', {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('bitget_auth_token')}`,
        },
      });
      const json = await res.json();
      message.success(json.data?.message || '清理完成');
      refresh();
    } catch {
      message.error('清理失败');
    }
  };

  const columns = [
    {
      title: '时间',
      dataIndex: 'timestamp',
      key: 'timestamp',
      width: 180,
      render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm:ss'),
    },
    {
      title: '级别',
      dataIndex: 'level',
      key: 'level',
      width: 80,
      render: (v: string) => <Tag color={LEVEL_COLORS[v] || 'default'}>{v}</Tag>,
    },
    {
      title: '模块',
      dataIndex: 'module',
      key: 'module',
      width: 140,
    },
    {
      title: '消息',
      dataIndex: 'message',
      key: 'message',
      ellipsis: true,
    },
    {
      title: 'Correlation ID',
      dataIndex: 'correlationId',
      key: 'correlationId',
      width: 120,
      ellipsis: true,
      render: (v: string | null) => v ? <Tag>{v.substring(0, 8)}...</Tag> : '-',
    },
  ];

  return (
    <div>
      <Space style={{ marginBottom: 16 }} wrap>
        <Select
          allowClear
          placeholder="日志级别"
          style={{ width: 120 }}
          value={level}
          onChange={v => { setLevel(v); setPage(1); }}
          options={[
            { value: 'DEBUG', label: 'DEBUG' },
            { value: 'INFO', label: 'INFO' },
            { value: 'WARN', label: 'WARN' },
            { value: 'ERROR', label: 'ERROR' },
          ]}
        />
        <Input
          allowClear
          placeholder="模块名"
          style={{ width: 150 }}
          value={module}
          onChange={e => { setModule(e.target.value || undefined); setPage(1); }}
        />
        <Input.Search
          allowClear
          placeholder="关键词搜索"
          style={{ width: 200 }}
          onSearch={v => { setKeyword(v || undefined); setPage(1); }}
        />
        <Switch
          checkedChildren="自动刷新"
          unCheckedChildren="手动"
          checked={autoRefresh}
          onChange={setAutoRefresh}
        />
        <Button icon={<ReloadOutlined />} onClick={() => refresh()}>刷新</Button>
        <Button icon={<DeleteOutlined />} danger onClick={handleCleanup}>清理 7 天前</Button>
      </Space>
      <Table
        dataSource={logs}
        columns={columns}
        rowKey={(_, i) => String(i)}
        loading={isLoading}
        size="small"
        pagination={{
          current: page,
          pageSize,
          total,
          onChange: setPage,
          showSizeChanger: false,
          showTotal: t => `共 ${t} 条`,
        }}
        expandable={{
          expandedRowRender: record => (
            <pre style={{ margin: 0, fontSize: 12, maxHeight: 200, overflow: 'auto' }}>
              {record.data ? JSON.stringify(record.data, null, 2) : '(无附加数据)'}
            </pre>
          ),
        }}
      />
    </div>
  );
}
