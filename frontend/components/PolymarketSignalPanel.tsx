'use client';

import React, { useState, useCallback } from 'react';
import {
  Card,
  Tag,
  Table,
  Switch,
  Button,
  Progress,
  Space,
  Typography,
  Tooltip,
  Descriptions,
  message,
} from 'antd';
import {
  ReloadOutlined,
  SettingOutlined,
  AlertOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import { usePolymarketSignal, usePolymarketConfig } from '@/hooks/usePolymarketSignal';
import { api } from '@/lib/api';
import {
  SIGNAL_DIRECTION_LABELS,
  SIGNAL_DIRECTION_COLORS,
  POLYMARKET_CATEGORY_LABELS,
} from '@/lib/constants';
import type { MarketSignalSnapshot } from '@/lib/types';
import PolymarketConfigModal from './PolymarketConfigModal';

const { Text } = Typography;

function getRiskColor(score: number): string {
  if (score < 30) return '#52c41a';
  if (score <= 50) return '#73d13d';
  if (score <= 70) return '#faad14';
  if (score <= 85) return '#fa541c';
  return '#f5222d';
}

function getRiskLabel(score: number): string {
  if (score < 30) return '低风险';
  if (score <= 70) return '中性';
  if (score <= 85) return '高风险';
  return '极高风险';
}

export default function PolymarketSignalPanel() {
  const { signal, refresh: refreshSignal } = usePolymarketSignal();
  const { config, refresh: refreshConfig } = usePolymarketConfig();
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [polling, setPolling] = useState(false);

  const handleToggle = useCallback(async (checked: boolean) => {
    try {
      await api.updatePolymarketConfig({ enabled: checked });
      refreshConfig();
      refreshSignal();
      message.success(checked ? 'Polymarket 信号已启用' : 'Polymarket 信号已禁用');
    } catch (err) {
      message.error('操作失败：' + String(err));
    }
  }, [refreshConfig, refreshSignal]);

  const handlePollNow = useCallback(async () => {
    setPolling(true);
    try {
      await api.pollPolymarket();
      refreshSignal();
      message.success('轮询完成');
    } catch (err) {
      message.error('轮询失败：' + String(err));
    } finally {
      setPolling(false);
    }
  }, [refreshSignal]);

  const riskScore = signal?.riskScore ?? 50;
  const enabled = signal?.enabled ?? false;

  const columns = [
    {
      title: '市场',
      dataIndex: 'label',
      key: 'label',
      width: 200,
      render: (text: string, record: MarketSignalSnapshot) => (
        <Space>
          {record.alertTriggered && (
            <Tooltip title="告警触发">
              <AlertOutlined style={{ color: '#f5222d' }} />
            </Tooltip>
          )}
          <Text ellipsis style={{ maxWidth: 160 }}>{text}</Text>
        </Space>
      ),
    },
    {
      title: '分类',
      dataIndex: 'category',
      key: 'category',
      width: 100,
      render: (cat: string) => (
        <Tag>{POLYMARKET_CATEGORY_LABELS[cat as keyof typeof POLYMARKET_CATEGORY_LABELS] || cat}</Tag>
      ),
    },
    {
      title: '当前概率',
      dataIndex: 'currentProb',
      key: 'currentProb',
      width: 100,
      render: (prob: number) => `${(prob * 100).toFixed(1)}%`,
    },
    {
      title: '1h 变化',
      dataIndex: 'delta1h',
      key: 'delta1h',
      width: 90,
      render: (delta: number) => {
        const pct = (delta * 100).toFixed(2);
        const color = delta > 0 ? '#52c41a' : delta < 0 ? '#f5222d' : undefined;
        return <Text style={{ color }}>{delta > 0 ? '+' : ''}{pct}%</Text>;
      },
    },
    {
      title: '24h 变化',
      dataIndex: 'delta24h',
      key: 'delta24h',
      width: 90,
      render: (delta: number) => {
        const pct = (delta * 100).toFixed(2);
        const color = delta > 0 ? '#52c41a' : delta < 0 ? '#f5222d' : undefined;
        return <Text style={{ color }}>{delta > 0 ? '+' : ''}{pct}%</Text>;
      },
    },
    {
      title: '成交量',
      dataIndex: 'volume',
      key: 'volume',
      width: 100,
      render: (vol: number) => vol >= 1000000
        ? `$${(vol / 1000000).toFixed(1)}M`
        : vol >= 1000
          ? `$${(vol / 1000).toFixed(0)}K`
          : `$${vol.toFixed(0)}`,
    },
  ];

  return (
    <>
      <Card
        title={
          <Space>
            <span>Polymarket 宏观信号</span>
            {signal?.hasAlert && (
              <Tag color="red" icon={<AlertOutlined />}>告警</Tag>
            )}
          </Space>
        }
        size="small"
        extra={
          <Space>
            <Switch
              checked={enabled}
              onChange={handleToggle}
              checkedChildren="ON"
              unCheckedChildren="OFF"
              size="small"
            />
            <Button
              size="small"
              icon={<ReloadOutlined spin={polling} />}
              onClick={handlePollNow}
              disabled={!enabled}
            >
              轮询
            </Button>
            <Button
              size="small"
              icon={<SettingOutlined />}
              onClick={() => setConfigModalOpen(true)}
            >
              配置
            </Button>
          </Space>
        }
      >
        {/* Risk Score + Direction */}
        <Descriptions size="small" column={4} style={{ marginBottom: 12 }}>
          <Descriptions.Item label="风险评分">
            <Space>
              <Progress
                type="circle"
                percent={riskScore}
                size={48}
                strokeColor={getRiskColor(riskScore)}
                format={() => riskScore.toFixed(0)}
              />
              <Tag color={getRiskColor(riskScore)}>{getRiskLabel(riskScore)}</Tag>
            </Space>
          </Descriptions.Item>
          <Descriptions.Item label="方向">
            <Tag color={SIGNAL_DIRECTION_COLORS[signal?.direction || 'neutral']}>
              {SIGNAL_DIRECTION_LABELS[signal?.direction || 'neutral']}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label="信心度">
            {((signal?.confidence ?? 0) * 100).toFixed(0)}%
          </Descriptions.Item>
          <Descriptions.Item label="上次更新">
            {signal?.lastPollAt
              ? new Date(signal.lastPollAt).toLocaleTimeString()
              : '-'}
          </Descriptions.Item>
        </Descriptions>

        {/* Markets table */}
        {enabled && (signal?.markets?.length ?? 0) > 0 ? (
          <Table
            dataSource={signal?.markets || []}
            columns={columns}
            rowKey="conditionId"
            size="small"
            pagination={false}
            scroll={{ x: 680 }}
          />
        ) : (
          <div style={{ textAlign: 'center', padding: '16px 0', color: '#999' }}>
            {enabled
              ? '暂无监控市场，点击配置添加'
              : '信号服务未启用'}
          </div>
        )}
      </Card>

      <PolymarketConfigModal
        open={configModalOpen}
        onClose={() => {
          setConfigModalOpen(false);
          refreshConfig();
          refreshSignal();
        }}
      />
    </>
  );
}
