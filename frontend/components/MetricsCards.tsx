'use client';

import React from 'react';
import { Row, Col, Card, Statistic } from 'antd';
import {
  ArrowUpOutlined,
  ArrowDownOutlined,
  SwapOutlined,
  OrderedListOutlined,
  WalletOutlined,
  DollarOutlined,
  TrophyOutlined,
  FundOutlined,
} from '@ant-design/icons';
import { useStrategyStatus } from '@/hooks/useStrategyStatus';
import { usePnl } from '@/hooks/usePnl';

export default function MetricsCards() {
  const { status } = useStrategyStatus();
  const { pnl } = usePnl();

  const realizedPnl = parseFloat(pnl?.realizedPnl || '0');
  const dailyPnl = parseFloat(pnl?.dailyPnl || '0');

  return (
    <Row gutter={[12, 12]}>
      <Col span={3}>
        <Card size="small">
          <Statistic
            title="现货余额"
            value={status?.spotAvailableUsdt || '0'}
            precision={2}
            prefix={<DollarOutlined />}
            suffix="USDT"
          />
        </Card>
      </Col>
      <Col span={3}>
        <Card size="small">
          <Statistic
            title="合约余额"
            value={status?.futuresAvailableUsdt || '0'}
            precision={2}
            prefix={<FundOutlined />}
            suffix="USDT"
          />
        </Card>
      </Col>
      <Col span={4}>
        <Card size="small">
          <Statistic
            title="已实现盈亏"
            value={pnl?.realizedPnl || '0'}
            precision={4}
            valueStyle={{ color: realizedPnl >= 0 ? '#3f8600' : '#cf1322' }}
            prefix={realizedPnl >= 0 ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
            suffix="USDT"
          />
        </Card>
      </Col>
      <Col span={4}>
        <Card size="small">
          <Statistic
            title="今日盈亏"
            value={pnl?.dailyPnl || '0'}
            precision={4}
            valueStyle={{ color: dailyPnl >= 0 ? '#3f8600' : '#cf1322' }}
            prefix={dailyPnl >= 0 ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
            suffix="USDT"
          />
        </Card>
      </Col>
      <Col span={3}>
        <Card size="small">
          <Statistic
            title="交易次数"
            value={status?.tradeCount || 0}
            prefix={<SwapOutlined />}
          />
        </Card>
      </Col>
      <Col span={3}>
        <Card size="small">
          <Statistic
            title="持仓 USDT"
            value={status?.totalPositionUsdt || '0'}
            precision={2}
            prefix={<WalletOutlined />}
          />
        </Card>
      </Col>
      <Col span={2}>
        <Card size="small">
          <Statistic
            title="挂卖单数"
            value={status?.pendingSellCount || 0}
            prefix={<OrderedListOutlined />}
          />
        </Card>
      </Col>
      <Col span={2}>
        <Card size="small">
          <Statistic
            title="胜率"
            value={pnl?.winRate || '0'}
            suffix="%"
            prefix={<TrophyOutlined />}
          />
        </Card>
      </Col>
    </Row>
  );
}
