'use client';

import React, { useState } from 'react';
import { Card, Space, Button, Typography, Popconfirm, Alert, Descriptions, Tag, App, Modal } from 'antd';
import {
  PlayCircleOutlined,
  PauseCircleOutlined,
  StopOutlined,
  ClockCircleOutlined,
  SettingOutlined,
  EditOutlined,
} from '@ant-design/icons';
import useSWR from 'swr';
import { useStrategyStatus } from '@/hooks/useStrategyStatus';
import StatusBadge from './StatusBadge';
import SimpleConfigForm from './SimpleConfigForm';
import { api, swrFetcher } from '@/lib/api';
import { formatUptime } from '@/lib/formatters';
import { DIRECTION_LABELS } from '@/lib/constants';
import type { AnyStrategyConfig } from '@/lib/types';

const { Text } = Typography;

export default function StrategyControlPanel() {
  const { status, refresh } = useStrategyStatus();
  const { data: healthData } = useSWR<{ accountType?: string }>('/api/health', swrFetcher, { refreshInterval: 30000 });
  const { message } = App.useApp();
  const [loading, setLoading] = useState<string | null>(null);
  const [configModalVisible, setConfigModalVisible] = useState(false);
  const [isEditingRunning, setIsEditingRunning] = useState(false);

  const isRunning = status?.status === 'RUNNING' || status?.status === 'STARTING';
  const isStopped = status?.status === 'STOPPED';
  const hasConfig = !!status?.config?.symbol;

  const handleStart = async () => {
    // If stopped and no saved config, open config modal
    if (isStopped && !hasConfig) {
      setIsEditingRunning(false);
      setConfigModalVisible(true);
      return;
    }
    // Otherwise start with saved config
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

  const handleConfigAndStart = async (config: Record<string, unknown>) => {
    setLoading('start');
    try {
      if (isEditingRunning) {
        await api.restartStrategy(config as Partial<AnyStrategyConfig>);
        message.success('策略已重启');
      } else {
        await api.startStrategy(config as Partial<AnyStrategyConfig>);
        message.success('策略已启动');
      }
      setConfigModalVisible(false);
      refresh();
    } catch (err) {
      message.error(`操作失败: ${err instanceof Error ? err.message : '未知错误'}`);
    } finally {
      setLoading(null);
    }
  };

  const handleOpenConfig = () => {
    setIsEditingRunning(false);
    setConfigModalVisible(true);
  };

  const handleEditRunning = () => {
    setIsEditingRunning(true);
    setConfigModalVisible(true);
  };

  return (
    <>
      <Card
        title="策略控制"
        extra={
          <Space>
            <Button
              icon={<SettingOutlined />}
              onClick={handleOpenConfig}
            >
              配置参数
            </Button>
            {isRunning && (
              <Button
                icon={<EditOutlined />}
                onClick={handleEditRunning}
              >
                修改参数
              </Button>
            )}
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
            <Descriptions size="small" column={6}>
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
                {status.config?.direction ? DIRECTION_LABELS[status.config.direction] || status.config.direction : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="杠杆">
                {status.config?.leverage ? `${status.config.leverage}x` : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="账户类型">
                <Tag color={healthData?.accountType === 'uta' ? 'green' : 'blue'}>
                  {healthData?.accountType === 'uta' ? 'UTA' : healthData?.accountType === 'classic' ? '经典' : '-'}
                </Tag>
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

      <Modal
        title={isEditingRunning ? '修改策略参数' : '策略配置'}
        open={configModalVisible}
        onCancel={() => setConfigModalVisible(false)}
        footer={null}
        width={800}
        destroyOnClose
      >
        <SimpleConfigForm
          onStartStrategy={handleConfigAndStart}
          loading={loading === 'start'}
          initialConfig={isEditingRunning && status?.config ? status.config : undefined}
          compact
        />
      </Modal>
    </>
  );
}
