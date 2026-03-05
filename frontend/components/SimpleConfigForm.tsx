'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Steps,
  Form,
  Input,
  InputNumber,
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
import type { StrategyType, TradingType, StrategyDirection, AnyStrategyConfig } from '@/lib/types';

const { Text, Title } = Typography;

interface SimpleConfigFormProps {
  onStartStrategy?: (config: Record<string, unknown>) => void;
  loading?: boolean;
  initialConfig?: Partial<AnyStrategyConfig>;
  compact?: boolean;
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

const AMOUNT_PRESETS = [
  { label: '自动', value: 'auto' },
  { label: '1%', value: 0.01 },
  { label: '2%', value: 0.02 },
  { label: '5%', value: 0.05 },
  { label: '10%', value: 0.10 },
] as const;

function calcAutoAmount(balance: number, minAmount: number, maxAmount: number): number {
  const targetPercent = balance > 10000 ? 0.005 : balance > 1000 ? 0.01 : 0.02;
  let amount = Math.floor(balance * targetPercent * 100) / 100;
  amount = Math.max(amount, minAmount);
  amount = Math.min(amount, maxAmount);
  return amount;
}

export default function SimpleConfigForm({
  onStartStrategy,
  loading,
  initialConfig,
  compact,
}: SimpleConfigFormProps) {
  const [strategyType, setStrategyType] = useState<StrategyType>(
    initialConfig?.strategyType || 'scalping'
  );
  const [tradingType, setTradingType] = useState<TradingType>(
    initialConfig?.tradingType || 'futures'
  );
  const [symbol, setSymbol] = useState<string>(initialConfig?.symbol || '');
  const [orderAmountUsdt, setOrderAmountUsdt] = useState<string>(
    initialConfig?.orderAmountUsdt || ''
  );
  const [direction, setDirection] = useState<StrategyDirection>(
    initialConfig?.direction || 'both'
  );
  const [riskLevel, setRiskLevel] = useState<RiskLevel>('balanced');
  const [selectedPreset, setSelectedPreset] = useState<string | null>(
    initialConfig?.orderAmountUsdt ? null : 'auto'
  );
  const [maxPositionPercent, setMaxPositionPercent] = useState<number | undefined>(
    initialConfig?.maxPositionPercent
  );
  const [maxDailyLossPercent, setMaxDailyLossPercent] = useState<number | undefined>(
    initialConfig?.maxDailyLossPercent
  );

  const isEditMode = !!initialConfig?.symbol;

  // Sync initialConfig when it changes (e.g. modal reopened with new config)
  useEffect(() => {
    if (initialConfig) {
      if (initialConfig.strategyType) setStrategyType(initialConfig.strategyType);
      if (initialConfig.tradingType) setTradingType(initialConfig.tradingType);
      if (initialConfig.symbol) setSymbol(initialConfig.symbol);
      if (initialConfig.orderAmountUsdt) {
        setOrderAmountUsdt(initialConfig.orderAmountUsdt);
        setSelectedPreset(null);
      }
      if (initialConfig.direction) setDirection(initialConfig.direction);
      if (initialConfig.maxPositionPercent != null) setMaxPositionPercent(initialConfig.maxPositionPercent);
      if (initialConfig.maxDailyLossPercent != null) setMaxDailyLossPercent(initialConfig.maxDailyLossPercent);
    }
  }, [initialConfig]);

  // Reset percent overrides when risk level or direction changes (use preset defaults)
  useEffect(() => {
    setMaxPositionPercent(undefined);
    setMaxDailyLossPercent(undefined);
  }, [riskLevel, direction]);

  // When auto preset is selected and amount is empty, use placeholder to bootstrap balance fetch
  const effectiveAmount = orderAmountUsdt || (selectedPreset === 'auto' && symbol ? '10' : '');

  const autoCalcInput = useMemo<SimpleConfigInput | null>(() => {
    if (!symbol || !effectiveAmount) return null;
    return {
      strategyType,
      tradingType,
      symbol,
      orderAmountUsdt: effectiveAmount,
      direction: tradingType === 'futures' ? direction : undefined,
      riskLevel,
      maxPositionPercent,
      maxDailyLossPercent,
    };
  }, [strategyType, tradingType, symbol, effectiveAmount, direction, riskLevel, maxPositionPercent, maxDailyLossPercent]);

  const { result, loading: calcLoading, error: calcError } = useAutoCalc(autoCalcInput);

  // Available balance from auto-calc result
  const availableBalance = result?.availableBalance ? parseFloat(result.availableBalance) : null;
  const bounds = result?.bounds;

  // When balance becomes available and preset is 'auto', calculate auto amount
  const applyPreset = useCallback(
    (preset: string | number, balance: number | null) => {
      if (!balance || balance <= 0) return;
      const minAmount = bounds?.orderAmountUsdt?.min ?? 5;
      const maxAmount = bounds?.orderAmountUsdt?.max ?? balance * 0.5;

      if (preset === 'auto') {
        const amount = calcAutoAmount(balance, minAmount, maxAmount);
        setOrderAmountUsdt(String(amount));
      } else if (typeof preset === 'number') {
        let amount = Math.floor(balance * preset * 100) / 100;
        amount = Math.max(amount, minAmount);
        amount = Math.min(amount, maxAmount);
        setOrderAmountUsdt(String(amount));
      }
    },
    [bounds]
  );

  // Auto-fill amount when balance arrives and 'auto' is selected
  useEffect(() => {
    if (selectedPreset === 'auto' && availableBalance && availableBalance > 0) {
      const minAmount = bounds?.orderAmountUsdt?.min ?? 5;
      const maxAmount = bounds?.orderAmountUsdt?.max ?? availableBalance * 0.5;
      const amount = calcAutoAmount(availableBalance, minAmount, maxAmount);
      setOrderAmountUsdt(String(amount));
    }
  }, [selectedPreset, availableBalance, bounds]);

  const handlePresetClick = (preset: typeof AMOUNT_PRESETS[number]) => {
    setSelectedPreset(String(preset.value));
    if (availableBalance) {
      applyPreset(preset.value, availableBalance);
    }
  };

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
      {!compact && (
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
      )}

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
                  if (!isEditMode) setSymbol('');
                }}
                optionType="button"
                buttonStyle="solid"
                disabled={isEditMode}
              >
                <Radio.Button value="futures">合约</Radio.Button>
                <Radio.Button value="spot">现货</Radio.Button>
              </Radio.Group>
            </Form.Item>
          </Col>
          <Col span={16}>
            <Form.Item label="交易对" style={{ marginBottom: 12 }}>
              {isEditMode ? (
                <Input value={symbol} disabled style={{ width: '100%' }} />
              ) : (
                <TradingPairSelector
                  tradingType={tradingType}
                  value={symbol}
                  onChange={setSymbol}
                />
              )}
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
          <Col span={tradingType === 'futures' ? 16 : 24}>
            <Form.Item
              label="单笔金额"
              required
              tooltip="每次下单使用的 USDT 金额"
              style={{ marginBottom: 8 }}
            >
              {/* Quick select buttons */}
              <Space size={4} style={{ marginBottom: 8 }}>
                {AMOUNT_PRESETS.map((preset) => (
                  <Button
                    key={String(preset.value)}
                    size="small"
                    type={selectedPreset === String(preset.value) ? 'primary' : 'default'}
                    onClick={() => handlePresetClick(preset)}
                    disabled={preset.value !== 'auto' && !availableBalance}
                  >
                    {preset.label}
                  </Button>
                ))}
              </Space>
              <Input
                value={orderAmountUsdt}
                onChange={(e) => {
                  setOrderAmountUsdt(e.target.value);
                  setSelectedPreset(null);
                }}
                suffix="USDT"
                placeholder="例如: 10"
                type="number"
                min={0}
              />
              {/* Balance & bounds hint */}
              <div style={{ marginTop: 4, fontSize: 12, color: '#8c8c8c' }}>
                {availableBalance !== null && (
                  <span>
                    可用余额: <Text strong style={{ fontSize: 12 }}>
                      {availableBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </Text> USDT
                  </span>
                )}
                {bounds?.orderAmountUsdt && (
                  <span style={{ marginLeft: availableBalance !== null ? 12 : 0 }}>
                    范围: {bounds.orderAmountUsdt.min.toFixed(2)} - {bounds.orderAmountUsdt.max.toFixed(2)} USDT
                  </span>
                )}
              </div>
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

        <Form.Item label="风险偏好" style={{ marginBottom: 16 }}>
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

        {/* 风控百分比参数 */}
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              label="仓位上限"
              tooltip="最大仓位占可用余额的百分比。双向模式推荐更高比例（分配给多/空两方向）"
              style={{ marginBottom: 0 }}
            >
              <InputNumber
                value={maxPositionPercent != null ? Math.round(maxPositionPercent * 1000) / 10 : (result?.fullConfig.maxPositionPercent != null ? Math.round(result.fullConfig.maxPositionPercent * 1000) / 10 : undefined)}
                onChange={(val) => {
                  if (val == null) {
                    setMaxPositionPercent(undefined);
                  } else {
                    setMaxPositionPercent(val / 100);
                  }
                }}
                min={(bounds?.maxPositionPercent?.min ?? 0.05) * 100}
                max={(bounds?.maxPositionPercent?.max ?? 0.5) * 100}
                step={1}
                suffix="%"
                placeholder={bounds?.maxPositionPercent ? `${(bounds.maxPositionPercent.recommended * 100).toFixed(0)}` : '—'}
                style={{ width: '100%' }}
              />
              <div style={{ marginTop: 4, fontSize: 12, color: '#8c8c8c' }}>
                {result?.fullConfig.maxPositionUsdt && (
                  <span>= <Text strong style={{ fontSize: 12 }}>{parseFloat(result.fullConfig.maxPositionUsdt).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text> USDT</span>
                )}
                {bounds?.maxPositionPercent && (
                  <span style={{ marginLeft: result?.fullConfig.maxPositionUsdt ? 12 : 0 }}>
                    推荐: {(bounds.maxPositionPercent.recommended * 100).toFixed(0)}%
                  </span>
                )}
              </div>
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              label="日亏上限"
              tooltip="每日最大亏损占可用余额的百分比，触发后策略暂停冷却"
              style={{ marginBottom: 0 }}
            >
              <InputNumber
                value={maxDailyLossPercent != null ? Math.round(maxDailyLossPercent * 1000) / 10 : (result?.fullConfig.maxDailyLossPercent != null ? Math.round(result.fullConfig.maxDailyLossPercent * 1000) / 10 : undefined)}
                onChange={(val) => {
                  if (val == null) {
                    setMaxDailyLossPercent(undefined);
                  } else {
                    setMaxDailyLossPercent(val / 100);
                  }
                }}
                min={(bounds?.maxDailyLossPercent?.min ?? 0.01) * 100}
                max={(bounds?.maxDailyLossPercent?.max ?? 0.2) * 100}
                step={0.5}
                suffix="%"
                placeholder={bounds?.maxDailyLossPercent ? `${(bounds.maxDailyLossPercent.recommended * 100).toFixed(0)}` : '—'}
                style={{ width: '100%' }}
              />
              <div style={{ marginTop: 4, fontSize: 12, color: '#8c8c8c' }}>
                {result?.fullConfig.maxDailyLossUsdt && (
                  <span>= <Text strong style={{ fontSize: 12 }}>{parseFloat(result.fullConfig.maxDailyLossUsdt).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text> USDT</span>
                )}
                {bounds?.maxDailyLossPercent && (
                  <span style={{ marginLeft: result?.fullConfig.maxDailyLossUsdt ? 12 : 0 }}>
                    推荐: {(bounds.maxDailyLossPercent.recommended * 100).toFixed(1)}%
                  </span>
                )}
              </div>
            </Form.Item>
          </Col>
        </Row>
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
        {isEditMode ? '保存并重启' : '启动策略'}
      </Button>
    </div>
  );
}
