'use client';

import React from 'react';
import { Layout, Row, Col, Typography, Tag, Space } from 'antd';
import StrategyControlPanel from '@/components/StrategyControlPanel';
import MetricsCards from '@/components/MetricsCards';
import OrderTable from '@/components/OrderTable';
import EventLog from '@/components/EventLog';
import ConfigWizard from '@/components/ConfigWizard';
import { useStrategyStatus } from '@/hooks/useStrategyStatus';
import { STRATEGY_TYPE_LABELS, TRADING_TYPE_LABELS } from '@/lib/constants';

const { Header, Content } = Layout;
const { Title } = Typography;

export default function DashboardPage() {
  const { status } = useStrategyStatus();

  return (
    <Layout style={{ minHeight: '100vh', background: '#f5f5f5' }}>
      <Header style={{ background: '#001529', display: 'flex', alignItems: 'center', padding: '0 24px' }}>
        <Space align="center">
          <Title level={4} style={{ color: '#fff', margin: 0 }}>
            Bitget 策略交易面板
          </Title>
          <Tag color="blue">{STRATEGY_TYPE_LABELS[status?.strategyType || 'scalping']}</Tag>
          <Tag color="cyan">{TRADING_TYPE_LABELS[status?.tradingType || 'futures']}</Tag>
        </Space>
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
            <ConfigWizard />
          </Col>
        </Row>
      </Content>
    </Layout>
  );
}
