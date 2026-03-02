'use client';

import React from 'react';
import { Layout, Typography, Tabs, Button, Space } from 'antd';
import { ArrowLeftOutlined, ApiOutlined, SettingOutlined, TeamOutlined, FileTextOutlined } from '@ant-design/icons';
import ProtectedRoute from '@/components/ProtectedRoute';
import SystemConfigPanel from '@/components/SystemConfigPanel';
import UserManagement from '@/components/UserManagement';
import LogViewer from '@/components/LogViewer';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/providers/AuthProvider';

const { Header, Content } = Layout;
const { Title } = Typography;

function SettingsContent() {
  const router = useRouter();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const tabItems = [
    {
      key: 'api',
      label: <span><ApiOutlined /> API 凭证</span>,
      children: <SystemConfigPanel section="api" />,
    },
    {
      key: 'system',
      label: <span><SettingOutlined /> 系统配置</span>,
      children: <SystemConfigPanel section="system" />,
    },
    {
      key: 'logs',
      label: <span><FileTextOutlined /> 系统日志</span>,
      children: <LogViewer />,
    },
    ...(isAdmin ? [{
      key: 'users',
      label: <span><TeamOutlined /> 用户管理</span>,
      children: <UserManagement />,
    }] : []),
  ];

  return (
    <Layout style={{ minHeight: '100vh', background: '#f5f5f5' }}>
      <Header style={{ background: '#001529', display: 'flex', alignItems: 'center', padding: '0 24px' }}>
        <Space align="center">
          <Button
            type="text"
            icon={<ArrowLeftOutlined />}
            style={{ color: '#fff' }}
            onClick={() => router.push('/')}
          />
          <Title level={4} style={{ color: '#fff', margin: 0 }}>
            系统设置
          </Title>
        </Space>
      </Header>
      <Content style={{ padding: 24, maxWidth: 1200, margin: '0 auto', width: '100%' }}>
        <Tabs items={tabItems} defaultActiveKey="api" />
      </Content>
    </Layout>
  );
}

export default function SettingsPage() {
  return (
    <ProtectedRoute>
      <SettingsContent />
    </ProtectedRoute>
  );
}
