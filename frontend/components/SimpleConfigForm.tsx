'use client';

import React, { useState, useMemo } from 'react';
import {
  Steps,
  Form,
  Input,
  Select,
  Radio,
  Button,
  Card,
  Descriptions,
  Alert,
  Spin,
  Row,
  Col,
  Typography,
  Divider,
  Space,
  Tag,
  Tooltip,
} from 'antd';
import {
  RocketOutlined,
  SafetyCertificateOutlined,
  AimOutlined,
  ThunderboltOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';
import TradingPairSelector from './TradingPairSelector';
import StrategyTypeSelector from './StrategyTypeSelector';
import { useAutoCalc, type RiskLevel, type SimpleConfigInput } from '@/hooks/useAutoCalc';
import type { StrategyType, TradingType, StrategyDirection } from '@/lib/types';

const { Text, Title } = Typography;

interface SimpleConfigFormProps {
  onStartStrategy?: (config: Record<string, unknown>) => void;
  loading?: boolean;
}

const RISK_LEVEL_OPTIONS: Array<{
  value: RiskLevel;
  label: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  recommended?: boolean;
}> = [
  {
    value: 'conservative',
    label: '保守',
    description: '宽价差/窄范围，低杠杆，紧止损',
    icon: <SafetyCertificateOutlined />,
    color: '#52c41a',
  },
  {
    value: 'balanced',
    label: '均衡',
    description: '中等参数，适合大多数场景',
    icon: <AimOutlined />,
    color: '#1677ff',
    recommended: true,
  },
  {
    value: 'aggressive',
    label: '激进',
    description: '窄价差/宽范围，高频交易，松止损',
    icon: <ThunderboltOutlined />,
    color: '#fa541c',
  },
];

export default function SimpleConfigForm({ onStartStrategy, loading }: SimpleConfigFormProps) {
  const [strategyType, setStrategyType] = useState<StrategyType>('scalping');
  const [tradingType, setTradingType] = useState<TradingType>('futures');
  const [symbol, setSymbol] = useState<string>('');
  const [orderAmountUsdt, setOrderAmountUsdt] = useState<string>('');
  const [direction, setDirection] = useState<StrategyDirection>('long');
  const [riskLevel, setRiskLevel] = useState<RiskLevel>('balanced');

  const autoCalcInput = useMemo<SimpleConfigInput | null>(() => {
    if (!symbol || !orderAmountUsdt) return null;
    return {
      strategyType,
      tradingType,
      symbol,
      orderAmountUsdt,
      direction: tradingType === 'futures' ? direction : undefined,
      riskLevel,
    };
  }, [strategyType, tradingType, symbol, orderAmountUsdt, direction, riskLevel]);

  const { result, loading: calcLoading, error: calcError } = useAutoCalc(autoCalcInput);

  const isFormComplete = symbol && orderAmountUsdt && Number(orderAmountUsdt) > 0;

  const handleStart = () => {
    if (!result?.fullConfig || !onStartStrategy) return;
    onStartStrategy(result.fullConfig as unknown as Record<string, unknown>);
  };

  // Determine current step based on filled fields
  const currentStep = useMemo(() => {
    if (!strategyType) return 0;
    if (!symbol) return 1;
    if (!orderAmountUsdt || Number(orderAmountUsdt) <= 0) return 2;
    return 3;
  }, [strategyType, symbol, orderAmountUsdt]);

  return (
    <div>
      <Steps
        current={currentStep}
        size="small"
        style={{ marginBottom: 24 }}
        items={[
          { title: '策略类型' },
          { title: '交易对' },
          { title: '参数设置' },
          { title: '确认启动' },
        ]}
      />

      {/* Step 1: Strategy Type */}
      <div style={{ marginBottom: 24 }}>
        <Title level={5} style={{ marginBottom: 12 }}>
          选择策略类型
        </Title>
        <StrategyTypeSelector value={strategyType} onChange={setStrategyType} />
      </div>

      <Divider />

      {/* Step 2: Trading Type + Symbol */}
      <div style={{ marginBottom: 24 }}>
        <Title level={5} style={{ marginBottom: 12 }}>
          选择交易市场和交易对
        </Title>
        <Row gutter={16}>
          <Col span={8}>
            <Form.Item label="交易类型" style={{ marginBottom: 12 }}>
              <Radio.Group
                value={tradingType}
                onChange={(e) => {
                  setTradingType(e.target.value as TradingType);
                  setSymbol(''); // Reset symbol when trading type changes
                }}
                optionType="button"
                buttonStyle="solid"
              >
                <Radio.Button value="futures">合约</Radio.Button>
                <Radio.Button value="spot">现货</Radio.Button>
              </Radio.Group>
            </Form.Item>
          </Col>
          <Col span={16}>
            <Form.Item label="交易对" style={{ marginBottom: 12 }}>
              <TradingPairSelector
                tradingType={tradingType}
                value={symbol}
                onChange={setSymbol}
              />
            </Form.Item>
          </Col>
        </Row>
      </div>

      <Divider />

      {/* Step 3: Amount + Direction + Risk Level */}
      <div style={{ marginBottom: 24 }}>
        <Title level={5} style={{ marginBottom: 12 }}>
          交易参数
        </Title>
        <Row gutter={16}>
          <Col span={8}>
            <Form.Item
              label="单笔金额"
              required
              tooltip="每次下单使用的 USDT 金额"
              style={{ marginBottom: 16 }}
            >
              <Input
                value={orderAmountUsdt}
                onChange={(e) => setOrderAmountUsdt(e.target.value)}
                suffix="USDT"
                placeholder="例如: 10"
                type="number"
                min={0}
              />
            </Form.Item>
          </Col>
          {tradingType === 'futures' && (
            <Col span={8}>
              <Form.Item label="交易方向" style={{ marginBottom: 16 }}>
                <Select
                  value={direction}
                  onChange={(val) => setDirection(val as StrategyDirection)}
                  options={[
                    { label: '做多', value: 'long' },
                    { label: '做空', value: 'short' },
                    { label: '双向', value: 'both' },
                  ]}
                  style={{ width: '100%' }}
                />
              </Form.Item>
            </Col>
          )}
        </Row>

        <Form.Item label="风险偏好" style={{ marginBottom: 0 }}>
          <Row gutter={12}>
            {RISK_LEVEL_OPTIONS.map((option) => {
              const isSelected = riskLevel === option.value;
              return (
                <Col span={8} key={option.value}>
                  <Card
                    hoverable
                    size="small"
                    onClick={() => setRiskLevel(option.value)}
                    style={{
                      borderColor: isSelected ? option.color : undefined,
                      borderWidth: isSelected ? 2 : 1,
                      cursor: 'pointer',
                      background: isSelected ? `${option.color}08` : undefined,
                    }}
                  >
                    <Space direction="vertical" size={4} style={{ width: '100%' }}>
                      <Space>
                        <span style={{ color: isSelected ? option.color : '#8c8c8c' }}>
                          {option.icon}
                        </span>
                        <Text strong style={{ color: isSelected ? option.color : undefined }}>
                          {option.label}
                        </Text>
                        {option.recommended && (
                          <Tag color="blue" style={{ fontSize: 11 }}>推荐</Tag>
                        )}
                      </Space>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {option.description}
                      </Text>
                    </Space>
                  </Card>
                </Col>
              );
            })}
          </Row>
        </Form.Item>
      </div>

      <Divider />

      {/* Auto-calc Preview */}
      <div style={{ marginBottom: 24 }}>
        <Title level={5} style={{ marginBottom: 12 }}>
          <Space>
            自动计算预览
            <Tooltip title="基于您选择的参数，系统自动计算其余策略配置">
              <InfoCircleOutlined style={{ fontSize: 14, color: '#8c8c8c' }} />
            </Tooltip>
          </Space>
        </Title>

        {!isFormComplete && (
          <Alert
            message="请完成上方配置"
            description="选择交易对并填写单笔金额后，系统将自动计算完整配置。"
            type="info"
            showIcon
          />
        )}

        {isFormComplete && calcLoading && (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <Spin tip="正在计算参数..." />
          </div>
        )}

        {isFormComplete && calcError && (
          <Alert
            message="计算失败"
            description={calcError}
            type="error"
            showIcon
          />
        )}

        {isFormComplete && result && !calcLoading && (
          <>
            <Descriptions
              size="small"
              column={3}
              bordered
              style={{ marginBottom: 16 }}
            >
              {Object.entries(result.fullConfig).map(([key, value]) => {
                if (value === undefined || value === null) return null;
                return (
                  <Descriptions.Item key={key} label={key}>
                    {String(value)}
                  </Descriptions.Item>
                );
              })}
            </Descriptions>

            {result.derivations.length > 0 && (
              <>
                <Title level={5} style={{ marginBottom: 8, fontSize: 14 }}>
                  参数推导说明
                </Title>
                <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                  {result.derivations.map((d, i) => (
                    <Card
                      key={i}
                      size="small"
                      style={{ marginBottom: 8 }}
                      styles={{ body: { padding: '8px 12px' } }}
                    >
                      <Space direction="vertical" size={2} style={{ width: '100%' }}>
                        <Space>
                          <Text strong>{d.field}</Text>
                          <Tag color="blue">{d.value}</Tag>
                        </Space>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {d.formula}
                        </Text>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {d.explanation}
                        </Text>
                      </Space>
                    </Card>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* Start Button */}
      <Button
        type="primary"
        size="large"
        icon={<RocketOutlined />}
        onClick={handleStart}
        loading={loading}
        disabled={!result || calcLoading}
        block
      >
        启动策略
      </Button>
    </div>
  );
}
