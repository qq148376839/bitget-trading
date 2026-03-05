'use client';

import React from 'react';
import { Row, Col, Card, Statistic, Tooltip } from 'antd';
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
  const unrealizedPnl = parseFloat(status?.unrealizedPnl || '0');
  const dailyPnl = parseFloat(pnl?.dailyPnl || '0');

  const isBidirectional = status?.config?.direction === 'both';
  const positionByDir = status?.positionUsdtByDirection;
  const pendingExitByDir = status?.pendingExitCounts;

  // 持仓 USDT tooltip
  const positionTooltip = isBidirectional && positionByDir
    ? `多: ${positionByDir.long || '0'} / 空: ${positionByDir.short || '0'}`
    : undefined;

  // 挂单数 tooltip
  const pendingTooltip = isBidirectional && pendingExitByDir
    ? `多: ${pendingExitByDir.long || 0} / 空: ${pendingExitByDir.short || 0}`
    : undefined;

  return (
    <>
      <Row gutter={[12, 12]}>
        <Col xs={12} sm={6} md={3}>
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
        <Col xs={12} sm={6} md={3}>
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
        <Col xs={12} sm={6} md={3}>
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
        <Col xs={12} sm={6} md={3}>
          <Card size="small">
            <Statistic
              title="未实现盈亏"
              value={status?.unrealizedPnl || '0'}
              precision={4}
              valueStyle={{ color: unrealizedPnl >= 0 ? '#3f8600' : '#cf1322' }}
              prefix={unrealizedPnl >= 0 ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
              suffix="USDT"
            />
          </Card>
        </Col>
        <Col xs={12} sm={6} md={3}>
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
        <Col xs={12} sm={6} md={3}>
          <Card size="small">
            <Statistic
              title="交易次数"
              value={status?.tradeCount || 0}
              prefix={<SwapOutlined />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6} md={3}>
          <Card size="small">
            <Tooltip title={positionTooltip}>
              <Statistic
                title={isBidirectional ? '持仓 USDT (多/空)' : '持仓 USDT'}
                value={status?.totalPositionUsdt || '0'}
                precision={2}
                prefix={<WalletOutlined />}
              />
            </Tooltip>
          </Card>
        </Col>
        <Col xs={12} sm={6} md={2}>
          <Card size="small">
            <Tooltip title={pendingTooltip}>
              <Statistic
                title={isBidirectional ? '出场挂单 (多/空)' : '挂卖单数'}
                value={status?.pendingSellCount || 0}
                prefix={<OrderedListOutlined />}
              />
            </Tooltip>
          </Card>
        </Col>
      </Row>
      <Row gutter={[12, 12]} style={{ marginTop: 0 }}>
        <Col xs={12} sm={6} md={2}>
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
    </>
  );
}
