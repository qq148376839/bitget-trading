'use client';

import React, { useState, useEffect } from 'react';
import { Card, Form, Input, Button, Space, Switch, App, Descriptions, Tag } from 'antd';
import { SaveOutlined, ApiOutlined, CheckCircleOutlined, CloseCircleOutlined, LockOutlined } from '@ant-design/icons';
import { api } from '@/lib/api';

interface Props {
  section: 'api' | 'system';
}

interface ConfigItem {
  key: string;
  value: string;
  isEncrypted: boolean;
  description: string | null;
}

export default function SystemConfigPanel({ section }: Props) {
  const { message } = App.useApp();
  const [configs, setConfigs] = useState<ConfigItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [testResult, setTestResult] = useState<{ connected: boolean; message: string } | null>(null);
  const [testLoading, setTestLoading] = useState(false);
  const [form] = Form.useForm();

  const loadConfigs = async () => {
    try {
      const data = await api.getSystemConfigs();
      setConfigs(data);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '加载配置失败');
    }
  };

  useEffect(() => {
    loadConfigs();
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  if (section === 'api') {
    return <ApiCredentialsForm configs={configs} onReload={loadConfigs} />;
  }

  return <SystemConfigList configs={configs} onReload={loadConfigs} />;
}

function ApiCredentialsForm({ configs, onReload }: { configs: ConfigItem[]; onReload: () => void }) {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState<{ connected: boolean; message: string } | null>(null);

  const getConfigValue = (key: string) => {
    const c = configs.find(c => c.key === key);
    return c?.isEncrypted ? '' : (c?.value || '');
  };

  const hasConfig = (key: string) => configs.some(c => c.key === key);

  /** 已配置的加密字段标签 */
  const configuredLabel = (key: string) =>
    hasConfig(key) ? (
      <Tag icon={<LockOutlined />} color="green" style={{ marginLeft: 8, fontWeight: 'normal' }}>
        已配置
      </Tag>
    ) : null;

  // configs 异步加载后同步表单值（initialValues 只在首次渲染生效）
  useEffect(() => {
    if (configs.length > 0) {
      form.setFieldsValue({
        simulated: getConfigValue('BITGET_SIMULATED') === '1',
      });
    }
  }, [configs]);  // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = async (values: Record<string, string>) => {
    setSaving(true);
    try {
      const entries = [
        { key: 'BITGET_API_KEY', value: values.apiKey, encrypted: true, desc: 'Bitget API Key' },
        { key: 'BITGET_SECRET_KEY', value: values.secretKey, encrypted: true, desc: 'Bitget Secret Key' },
        { key: 'BITGET_PASSPHRASE', value: values.passphrase, encrypted: true, desc: 'Bitget Passphrase' },
        { key: 'BITGET_SIMULATED', value: values.simulated ? '1' : '0', encrypted: false, desc: '模拟盘模式' },
      ];

      for (const entry of entries) {
        if (entry.value !== undefined && entry.value !== '') {
          await api.updateSystemConfig(entry.key, entry.value, entry.encrypted, entry.desc);
        }
      }
      message.success('API 凭证已保存');
      onReload();
    } catch (err) {
      message.error(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    setTestLoading(true);
    setTestResult(null);
    try {
      const values = form.getFieldsValue();
      const result = await api.testBitgetConnection(
        values.apiKey,
        values.secretKey,
        values.passphrase,
        values.simulated
      );
      setTestResult(result);
    } catch (err) {
      setTestResult({ connected: false, message: err instanceof Error ? err.message : '测试失败' });
    } finally {
      setTestLoading(false);
    }
  };

  return (
    <Card title="Bitget API 凭证" style={{ marginBottom: 16 }}>
      <Form
        form={form}
        layout="vertical"
        onFinish={handleSave}
        initialValues={{
          simulated: getConfigValue('BITGET_SIMULATED') === '1',
        }}
      >
        <Form.Item
          name="apiKey"
          label={<span>API Key{configuredLabel('BITGET_API_KEY')}</span>}
          rules={[{ required: !hasConfig('BITGET_API_KEY'), message: '请输入 API Key' }]}
        >
          <Input.Password
            placeholder={hasConfig('BITGET_API_KEY') ? '已配置（留空保持不变）' : '请输入 API Key'}
          />
        </Form.Item>
        <Form.Item
          name="secretKey"
          label={<span>Secret Key{configuredLabel('BITGET_SECRET_KEY')}</span>}
          rules={[{ required: !hasConfig('BITGET_SECRET_KEY'), message: '请输入 Secret Key' }]}
        >
          <Input.Password
            placeholder={hasConfig('BITGET_SECRET_KEY') ? '已配置（留空保持不变）' : '请输入 Secret Key'}
          />
        </Form.Item>
        <Form.Item
          name="passphrase"
          label={<span>Passphrase{configuredLabel('BITGET_PASSPHRASE')}</span>}
          rules={[{ required: !hasConfig('BITGET_PASSPHRASE'), message: '请输入 Passphrase' }]}
        >
          <Input.Password
            placeholder={hasConfig('BITGET_PASSPHRASE') ? '已配置（留空保持不变）' : '请输入 Passphrase'}
          />
        </Form.Item>
        <Form.Item name="simulated" label="模拟盘模式" valuePropName="checked">
          <Switch checkedChildren="模拟盘" unCheckedChildren="实盘" />
        </Form.Item>

        {testResult && (
          <div style={{ marginBottom: 16 }}>
            <Tag
              icon={testResult.connected ? <CheckCircleOutlined /> : <CloseCircleOutlined />}
              color={testResult.connected ? 'success' : 'error'}
            >
              {testResult.message}
            </Tag>
          </div>
        )}

        <Space>
          <Button
            type="primary"
            htmlType="submit"
            icon={<SaveOutlined />}
            loading={saving}
          >
            保存凭证
          </Button>
          <Button
            icon={<ApiOutlined />}
            onClick={handleTestConnection}
            loading={testLoading}
          >
            测试连接
          </Button>
        </Space>
      </Form>
    </Card>
  );
}

function SystemConfigList({ configs, onReload }: { configs: ConfigItem[]; onReload: () => void }) {
  const { message } = App.useApp();
  const systemConfigs = configs.filter(c => !['BITGET_API_KEY', 'BITGET_SECRET_KEY', 'BITGET_PASSPHRASE', 'BITGET_SIMULATED'].includes(c.key));

  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const handleSave = async (key: string) => {
    try {
      await api.updateSystemConfig(key, editValue);
      message.success('配置已更新');
      setEditingKey(null);
      onReload();
    } catch (err) {
      message.error(err instanceof Error ? err.message : '更新失败');
    }
  };

  const handleExport = async () => {
    try {
      const data = await api.exportConfigs();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bitget-config-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      message.success('配置已导出');
    } catch (err) {
      message.error(err instanceof Error ? err.message : '导出失败');
    }
  };

  return (
    <Card
      title="系统配置"
      extra={<Button onClick={handleExport}>导出配置</Button>}
    >
      {systemConfigs.length === 0 ? (
        <p style={{ color: '#999' }}>暂无自定义配置</p>
      ) : (
        <Descriptions column={1} bordered size="small">
          {systemConfigs.map(c => (
            <Descriptions.Item key={c.key} label={c.key}>
              {editingKey === c.key ? (
                <Space>
                  <Input
                    value={editValue}
                    onChange={e => setEditValue(e.target.value)}
                    style={{ width: 300 }}
                  />
                  <Button type="primary" size="small" onClick={() => handleSave(c.key)}>保存</Button>
                  <Button size="small" onClick={() => setEditingKey(null)}>取消</Button>
                </Space>
              ) : (
                <Space>
                  <span>{c.value}</span>
                  <Button
                    type="link"
                    size="small"
                    onClick={() => { setEditingKey(c.key); setEditValue(c.value); }}
                  >
                    编辑
                  </Button>
                </Space>
              )}
            </Descriptions.Item>
          ))}
        </Descriptions>
      )}
    </Card>
  );
}
