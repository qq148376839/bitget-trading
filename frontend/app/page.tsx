'use client';

import React from 'react';
import { Layout, Row, Col, Typography, Tag, Space, Button, Dropdown, Collapse } from 'antd';
import {
  SettingOutlined,
  LogoutOutlined,
  UserOutlined,
} from '@ant-design/icons';
import StrategyControlPanel from '@/components/StrategyControlPanel';
import MetricsCards from '@/components/MetricsCards';
import OrderTable from '@/components/OrderTable';
import EventLog from '@/components/EventLog';
import ConfigWizard from '@/components/ConfigWizard';
import PolymarketSignalPanel from '@/components/PolymarketSignalPanel';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useStrategyStatus } from '@/hooks/useStrategyStatus';
import { useAuth } from '@/providers/AuthProvider';
import { STRATEGY_TYPE_LABELS, TRADING_TYPE_LABELS } from '@/lib/constants';
import { useRouter } from 'next/navigation';

const { Header, Content } = Layout;
const { Title } = Typography;

function DashboardContent() {
  const { status } = useStrategyStatus();
  const { user, logout } = useAuth();
  const router = useRouter();

  const menuItems = [
    {
      key: 'settings',
      icon: <SettingOutlined />,
      label: '系统设置',
      onClick: () => router.push('/settings'),
    },
    { type: 'divider' as const },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: '退出登录',
      onClick: logout,
    },
  ];

  return (
    <Layout style={{ minHeight: '100vh', background: '#f5f5f5' }}>
      <Header style={{ background: '#001529', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px' }}>
        <Space align="center">
          <Title level={4} style={{ color: '#fff', margin: 0 }}>
            Bitget 策略交易面板
          </Title>
          <Tag color="blue">{STRATEGY_TYPE_LABELS[status?.strategyType || 'scalping']}</Tag>
          <Tag color="cyan">{TRADING_TYPE_LABELS[status?.tradingType || 'futures']}</Tag>
        </Space>
        <Dropdown menu={{ items: menuItems }} placement="bottomRight">
          <Button type="text" style={{ color: '#fff' }} icon={<UserOutlined />}>
            {user?.display_name || user?.username || ''}
          </Button>
        </Dropdown>
      </Header>
      <Content style={{ padding: 24, maxWidth: 1440, margin: '0 auto', width: '100%' }}>
        <Row gutter={[16, 16]}>
          <Col span={24}>
            <StrategyControlPanel />
          </Col>
          <Col span={24}>
            <MetricsCards />
          </Col>
          <Col span={16}>
            <OrderTable />
          </Col>
          <Col span={8}>
            <EventLog />
          </Col>
          <Col span={24}>
            <PolymarketSignalPanel />
          </Col>
          <Col span={24}>
            <Collapse
              items={[{
                key: 'advanced-config',
                label: '高级配置',
                children: <ConfigWizard />,
              }]}
            />
          </Col>
        </Row>
      </Content>
    </Layout>
  );
}

export default function DashboardPage() {
  return (
    <ProtectedRoute>
      <DashboardContent />
    </ProtectedRoute>
  );
}
