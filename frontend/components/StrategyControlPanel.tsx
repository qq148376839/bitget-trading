'use client';

import React, { useState } from 'react';
import { Card, Space, Button, Typography, Popconfirm, Alert, Descriptions, App } from 'antd';
import {
  PlayCircleOutlined,
  PauseCircleOutlined,
  StopOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import { useStrategyStatus } from '@/hooks/useStrategyStatus';
import StatusBadge from './StatusBadge';
import { api } from '@/lib/api';
import { formatUptime } from '@/lib/formatters';
import { DIRECTION_LABELS } from '@/lib/constants';

const { Text } = Typography;

export default function StrategyControlPanel() {
  const { status, refresh } = useStrategyStatus();
  const { message } = App.useApp();
  const [loading, setLoading] = useState<string | null>(null);

  const isRunning = status?.status === 'RUNNING' || status?.status === 'STARTING';
  const isStopped = status?.status === 'STOPPED';

  const handleStart = async () => {
    setLoading('start');
    try {
      await api.startStrategy();
      message.success('策略已启动');
      refresh();
    } catch (err) {
      message.error(`启动失败: ${err instanceof Error ? err.message : '未知错误'}`);
    } finally {
      setLoading(null);
    }
  };

  const handleStop = async () => {
    setLoading('stop');
    try {
      await api.stopStrategy();
      message.success('策略已停止');
      refresh();
    } catch (err) {
      message.error(`停止失败: ${err instanceof Error ? err.message : '未知错误'}`);
    } finally {
      setLoading(null);
    }
  };

  const handleEmergencyStop = async () => {
    setLoading('emergency');
    try {
      await api.emergencyStop();
      message.warning('紧急停止完成，所有挂单已撤销');
      refresh();
    } catch (err) {
      message.error(`紧急停止失败: ${err instanceof Error ? err.message : '未知错误'}`);
    } finally {
      setLoading(null);
    }
  };

  return (
    <Card
      title="策略控制"
      extra={
        <Space>
          <Button
            type="primary"
            icon={<PlayCircleOutlined />}
            onClick={handleStart}
            loading={loading === 'start'}
            disabled={isRunning}
          >
            启动策略
          </Button>
          <Button
            icon={<PauseCircleOutlined />}
            onClick={handleStop}
            loading={loading === 'stop'}
            disabled={isStopped}
          >
            停止策略
          </Button>
          <Popconfirm
            title="紧急停止"
            description="确认紧急停止？所有挂单将被撤销"
            onConfirm={handleEmergencyStop}
            okText="确认"
            cancelText="取消"
            okButtonProps={{ danger: true }}
          >
            <Button
              danger
              icon={<StopOutlined />}
              loading={loading === 'emergency'}
              disabled={isStopped}
            >
              紧急停止
            </Button>
          </Popconfirm>
        </Space>
      }
    >
      {status && (
        <>
          <Descriptions size="small" column={5}>
            <Descriptions.Item label="状态">
              <StatusBadge status={status.status} />
            </Descriptions.Item>
            <Descriptions.Item label="运行时间">
              <Space>
                <ClockCircleOutlined />
                <Text>{formatUptime(status.uptimeMs)}</Text>
              </Space>
            </Descriptions.Item>
            <Descriptions.Item label="交易对">
              <Text strong>{status.config?.symbol || '-'}</Text>
            </Descriptions.Item>
            <Descriptions.Item label="方向">
              {status.config ? DIRECTION_LABELS[status.config.direction] || status.config.direction : '-'}
            </Descriptions.Item>
            <Descriptions.Item label="杠杆">
              {status.config ? `${status.config.leverage}x` : '-'}
            </Descriptions.Item>
          </Descriptions>
          {status.lastError && (
            <Alert
              type="error"
              message="策略错误"
              description={status.lastError}
              showIcon
              style={{ marginTop: 12 }}
            />
          )}
        </>
      )}
    </Card>
  );
}
