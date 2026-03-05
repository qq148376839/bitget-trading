'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, Form, Input, Button, Space, Switch, App, Descriptions, Tag, Row, Col } from 'antd';
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

interface ProfileInfo {
  activeProfile: string | null;
  profiles: {
    simulated: { configured: boolean };
    real: { configured: boolean };
  };
}

export default function SystemConfigPanel({ section }: Props) {
  const { message } = App.useApp();
  const [configs, setConfigs] = useState<ConfigItem[]>([]);

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
  const [profileInfo, setProfileInfo] = useState<ProfileInfo | null>(null);
  const [switching, setSwitching] = useState(false);

  const loadProfileInfo = useCallback(async () => {
    try {
      const info = await api.getActiveProfile();
      setProfileInfo(info);
    } catch {
      // Profile API not available, fallback to legacy mode
    }
  }, []);

  useEffect(() => {
    loadProfileInfo();
  }, [loadProfileInfo]);

  const handleSwitchProfile = async (profile: 'simulated' | 'real') => {
    setSwitching(true);
    try {
      const result = await api.switchProfile(profile);
      message.success(result.message);
      await loadProfileInfo();
      onReload();
    } catch (err) {
      message.error(err instanceof Error ? err.message : '切换失败');
    } finally {
      setSwitching(false);
    }
  };

  const activeProfile = profileInfo?.activeProfile as 'simulated' | 'real' | null;
  const isSimulated = activeProfile === 'simulated' || (!activeProfile && configs.some(c => c.key === 'BITGET_SIMULATED' && c.value === '1'));

  return (
    <div>
      {/* 环境切换 */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space align="center">
          <span style={{ fontWeight: 500 }}>当前环境：</span>
          <Tag color={isSimulated ? 'blue' : 'red'} style={{ fontSize: 14, padding: '2px 12px' }}>
            {isSimulated ? '模拟盘' : '实盘'}
          </Tag>
          <Switch
            checked={!isSimulated}
            onChange={(checked) => handleSwitchProfile(checked ? 'real' : 'simulated')}
            loading={switching}
            checkedChildren="实盘"
            unCheckedChildren="模拟盘"
          />
        </Space>
      </Card>

      {/* 双 Profile 凭证卡片 */}
      <Row gutter={16}>
        <Col xs={24} lg={12}>
          <ProfileCard
            profile="simulated"
            label="模拟盘"
            isActive={isSimulated}
            configured={profileInfo?.profiles.simulated.configured ?? false}
            onSaved={() => { loadProfileInfo(); onReload(); }}
          />
        </Col>
        <Col xs={24} lg={12}>
          <ProfileCard
            profile="real"
            label="实盘"
            isActive={!isSimulated}
            configured={profileInfo?.profiles.real.configured ?? false}
            onSaved={() => { loadProfileInfo(); onReload(); }}
          />
        </Col>
      </Row>
    </div>
  );
}

function ProfileCard({
  profile,
  label,
  isActive,
  configured,
  onSaved,
}: {
  profile: 'simulated' | 'real';
  label: string;
  isActive: boolean;
  configured: boolean;
  onSaved: () => void;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState<{ connected: boolean; message: string } | null>(null);

  const handleSave = async (values: { apiKey: string; secretKey: string; passphrase: string }) => {
    setSaving(true);
    try {
      await api.saveProfileCredentials(profile, values.apiKey, values.secretKey, values.passphrase);
      message.success(`${label}凭证已保存`);
      form.resetFields();
      onSaved();
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
      if (!values.apiKey || !values.secretKey || !values.passphrase) {
        setTestResult({ connected: false, message: '请先填写完整凭证' });
        setTestLoading(false);
        return;
      }
      const result = await api.testBitgetConnection(
        values.apiKey,
        values.secretKey,
        values.passphrase,
        profile === 'simulated'
      );
      setTestResult(result);
    } catch (err) {
      setTestResult({ connected: false, message: err instanceof Error ? err.message : '测试失败' });
    } finally {
      setTestLoading(false);
    }
  };

  return (
    <Card
      title={
        <Space>
          <span>{label}凭证</span>
          {isActive && <Tag color="green">活跃</Tag>}
          {configured && <Tag icon={<LockOutlined />} color="blue">已配置</Tag>}
        </Space>
      }
      style={{
        marginBottom: 16,
        borderColor: isActive ? '#52c41a' : undefined,
        borderWidth: isActive ? 2 : 1,
      }}
    >
      <Form form={form} layout="vertical" onFinish={handleSave}>
        <Form.Item
          name="apiKey"
          label="API Key"
          rules={[{ required: true, message: '请输入 API Key' }]}
        >
          <Input.Password
            placeholder={configured ? '已配置（重新输入以更新）' : '请输入 API Key'}
          />
        </Form.Item>
        <Form.Item
          name="secretKey"
          label="Secret Key"
          rules={[{ required: true, message: '请输入 Secret Key' }]}
        >
          <Input.Password
            placeholder={configured ? '已配置（重新输入以更新）' : '请输入 Secret Key'}
          />
        </Form.Item>
        <Form.Item
          name="passphrase"
          label="Passphrase"
          rules={[{ required: true, message: '请输入 Passphrase' }]}
        >
          <Input.Password
            placeholder={configured ? '已配置（重新输入以更新）' : '请输入 Passphrase'}
          />
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
  // Filter out all Bitget credential keys (including profile keys)
  const credentialKeys = [
    'BITGET_API_KEY', 'BITGET_SECRET_KEY', 'BITGET_PASSPHRASE', 'BITGET_SIMULATED',
    'BITGET_SIM_API_KEY', 'BITGET_SIM_SECRET_KEY', 'BITGET_SIM_PASSPHRASE',
    'BITGET_REAL_API_KEY', 'BITGET_REAL_SECRET_KEY', 'BITGET_REAL_PASSPHRASE',
    'BITGET_ACTIVE_PROFILE',
  ];
  const systemConfigs = configs.filter(c => !credentialKeys.includes(c.key));

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
