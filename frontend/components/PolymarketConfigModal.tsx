'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Modal,
  Form,
  Input,
  InputNumber,
  Switch,
  Select,
  Button,
  Table,
  Space,
  Popconfirm,
  message,
  Divider,
  Typography,
} from 'antd';
import {
  SearchOutlined,
  DeleteOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import { usePolymarketConfig } from '@/hooks/usePolymarketSignal';
import { api } from '@/lib/api';
import { POLYMARKET_CATEGORY_LABELS } from '@/lib/constants';
import type {
  PolymarketWatchItem,
  PolymarketSearchResult,
  PolymarketCategory,
} from '@/lib/types';

const { Text } = Typography;

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function PolymarketConfigModal({ open, onClose }: Props) {
  const { config, refresh: refreshConfig } = usePolymarketConfig();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  // Search
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PolymarketSearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (config && open) {
      form.setFieldsValue({
        enabled: config.enabled,
        pollIntervalMs: config.pollIntervalMs / 1000,
        proxyUrl: config.proxyUrl,
        sensitivityMultiplier: config.sensitivityMultiplier,
        maxRiskMultiplier: config.maxRiskMultiplier,
      });
    }
  }, [config, open, form]);

  const handleSave = useCallback(async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      await api.updatePolymarketConfig({
        enabled: values.enabled,
        pollIntervalMs: values.pollIntervalMs * 1000,
        proxyUrl: values.proxyUrl || '',
        sensitivityMultiplier: values.sensitivityMultiplier,
        maxRiskMultiplier: values.maxRiskMultiplier,
      });
      refreshConfig();
      message.success('配置已保存');
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return;
      message.error('保存失败：' + String(err));
    } finally {
      setSaving(false);
    }
  }, [form, refreshConfig]);

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const results = await api.searchPolymarketMarkets(searchQuery);
      setSearchResults(results);
    } catch (err) {
      message.error('搜索失败：' + String(err));
    } finally {
      setSearching(false);
    }
  }, [searchQuery]);

  const handleAddWatch = useCallback(async (result: PolymarketSearchResult) => {
    try {
      const item: PolymarketWatchItem = {
        conditionId: result.conditionId,
        label: result.question.slice(0, 60),
        category: 'custom',
        impactDirection: 'bearish',
        weight: 0.3,
        deltaThresholdPercent: 5,
      };
      await api.addPolymarketWatch(item);
      refreshConfig();
      message.success('已添加到监控列表');
    } catch (err) {
      message.error('添加失败：' + String(err));
    }
  }, [refreshConfig]);

  const handleRemoveWatch = useCallback(async (conditionId: string) => {
    try {
      await api.removePolymarketWatch(conditionId);
      refreshConfig();
      message.success('已移除');
    } catch (err) {
      message.error('移除失败：' + String(err));
    }
  }, [refreshConfig]);

  const watchColumns = [
    {
      title: '名称',
      dataIndex: 'label',
      key: 'label',
      ellipsis: true,
    },
    {
      title: '分类',
      dataIndex: 'category',
      key: 'category',
      width: 100,
      render: (cat: PolymarketCategory) =>
        POLYMARKET_CATEGORY_LABELS[cat] || cat,
    },
    {
      title: '影响',
      dataIndex: 'impactDirection',
      key: 'impactDirection',
      width: 80,
      render: (dir: string) => dir === 'bullish' ? '利多' : '利空',
    },
    {
      title: '权重',
      dataIndex: 'weight',
      key: 'weight',
      width: 60,
    },
    {
      title: '操作',
      key: 'action',
      width: 60,
      render: (_: unknown, record: PolymarketWatchItem) => (
        <Popconfirm title="确认移除？" onConfirm={() => handleRemoveWatch(record.conditionId)}>
          <Button type="link" danger size="small" icon={<DeleteOutlined />} />
        </Popconfirm>
      ),
    },
  ];

  const searchColumns = [
    {
      title: '问题',
      dataIndex: 'question',
      key: 'question',
      ellipsis: true,
    },
    {
      title: '成交量',
      dataIndex: 'volume',
      key: 'volume',
      width: 100,
      render: (vol: number) => vol >= 1000000
        ? `$${(vol / 1000000).toFixed(1)}M`
        : `$${(vol / 1000).toFixed(0)}K`,
    },
    {
      title: '概率',
      dataIndex: 'outcomePrices',
      key: 'prob',
      width: 80,
      render: (prices: string[]) =>
        prices[0] ? `${(parseFloat(prices[0]) * 100).toFixed(0)}%` : '-',
    },
    {
      title: '操作',
      key: 'action',
      width: 60,
      render: (_: unknown, record: PolymarketSearchResult) => {
        const exists = config?.watchList.some(w => w.conditionId === record.conditionId);
        return exists ? (
          <Text type="secondary">已添加</Text>
        ) : (
          <Button
            type="link"
            size="small"
            icon={<PlusOutlined />}
            onClick={() => handleAddWatch(record)}
          />
        );
      },
    },
  ];

  return (
    <Modal
      title="Polymarket 信号配置"
      open={open}
      onCancel={onClose}
      footer={[
        <Button key="cancel" onClick={onClose}>取消</Button>,
        <Button key="save" type="primary" loading={saving} onClick={handleSave}>
          保存
        </Button>,
      ]}
      width={720}
    >
      <Form form={form} layout="vertical" size="small">
        <Form.Item name="enabled" label="启用" valuePropName="checked">
          <Switch />
        </Form.Item>
        <Form.Item name="proxyUrl" label="代理 URL">
          <Input placeholder="http://127.0.0.1:7890" />
        </Form.Item>
        <Form.Item
          name="pollIntervalMs"
          label="轮询间隔（秒）"
          rules={[{ required: true }, { type: 'number', min: 30 }]}
        >
          <InputNumber min={30} max={3600} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item
          name="sensitivityMultiplier"
          label="灵敏度乘数"
          rules={[{ required: true }, { type: 'number', min: 0.1, max: 10 }]}
        >
          <InputNumber min={0.1} max={10} step={0.1} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item
          name="maxRiskMultiplier"
          label="最大风险乘数"
          rules={[{ required: true }, { type: 'number', min: 1, max: 5 }]}
        >
          <InputNumber min={1} max={5} step={0.1} style={{ width: '100%' }} />
        </Form.Item>
      </Form>

      <Divider>监控市场列表</Divider>
      <Table
        dataSource={config?.watchList || []}
        columns={watchColumns}
        rowKey="conditionId"
        size="small"
        pagination={false}
      />

      <Divider>搜索 Polymarket 市场</Divider>
      <Space style={{ marginBottom: 8 }}>
        <Input
          placeholder="搜索关键词..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          onPressEnter={handleSearch}
          style={{ width: 300 }}
        />
        <Button
          icon={<SearchOutlined />}
          loading={searching}
          onClick={handleSearch}
        >
          搜索
        </Button>
      </Space>
      {searchResults.length > 0 && (
        <Table
          dataSource={searchResults}
          columns={searchColumns}
          rowKey="conditionId"
          size="small"
          pagination={{ pageSize: 5 }}
        />
      )}
    </Modal>
  );
}
