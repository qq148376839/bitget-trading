'use client';

import React, { useState, useEffect } from 'react';
import { Card, Segmented, App } from 'antd';
import { ThunderboltOutlined, SettingOutlined } from '@ant-design/icons';
import SimpleConfigForm from './SimpleConfigForm';
import ConfigEditor from './ConfigEditor';
import { useStrategyStatus } from '@/hooks/useStrategyStatus';
import { api } from '@/lib/api';
import type { AnyStrategyConfig } from '@/lib/types';

export default function ConfigWizard() {
  const { status, refresh } = useStrategyStatus();
  const { message } = App.useApp();

  // Remember user's preference
  const [mode, setMode] = useState<'simple' | 'advanced'>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('configMode') as 'simple' | 'advanced') || 'simple';
    }
    return 'simple';
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('configMode', mode);
    }
  }, [mode]);

  const handleStartStrategy = async (config: Record<string, unknown>) => {
    try {
      await api.startStrategy(config as Partial<AnyStrategyConfig>);
      message.success('策略已启动');
      refresh();
    } catch (err) {
      message.error(`启动失败: ${err instanceof Error ? err.message : '未知错误'}`);
    }
  };

  return (
    <Card
      title="策略配置"
      extra={
        <Segmented
          options={[
            { label: '简单模式', value: 'simple', icon: <ThunderboltOutlined /> },
            { label: '高级模式', value: 'advanced', icon: <SettingOutlined /> },
          ]}
          value={mode}
          onChange={(v) => setMode(v as 'simple' | 'advanced')}
        />
      }
    >
      {mode === 'simple' ? (
        <SimpleConfigForm
          onStartStrategy={handleStartStrategy}
          loading={status?.status === 'STARTING'}
        />
      ) : (
        <ConfigEditor />
      )}
    </Card>
  );
}
