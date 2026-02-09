'use client';

import React, { useEffect, useRef, useCallback } from 'react';
import { Collapse, Form, InputNumber, Input, Select, Button, Row, Col, Divider, App, Tag, Descriptions } from 'antd';
import { SettingOutlined, SaveOutlined } from '@ant-design/icons';
import { useStrategyStatus } from '@/hooks/useStrategyStatus';
import { useContractSpec } from '@/hooks/useContractSpec';
import { api } from '@/lib/api';
import type { AnyStrategyConfig, ScalpingStrategyConfig } from '@/lib/types';
import { STRATEGY_TYPE_LABELS, TRADING_TYPE_LABELS } from '@/lib/constants';

export default function ConfigEditor() {
  const { status, refresh } = useStrategyStatus();
  const { message } = App.useApp();
  const [form] = Form.useForm();

  const config = status?.config;
  const isScalping = config?.strategyType === 'scalping';
  const isGrid = config?.strategyType === 'grid';
  const { spec } = useContractSpec(config?.symbol);

  // 标记用户是否正在编辑（防止 SWR 轮询覆盖用户输入）
  const userEditingRef = useRef(false);
  const lastConfigJsonRef = useRef<string>('');

  const handleFieldsChange = useCallback(() => {
    userEditingRef.current = true;
  }, []);

  useEffect(() => {
    if (!config) return;
    // 只在后端配置真正改变 且 用户未在编辑时同步表单
    const configJson = JSON.stringify(config);
    if (configJson !== lastConfigJsonRef.current && !userEditingRef.current) {
      form.setFieldsValue(config);
      lastConfigJsonRef.current = configJson;
    }
  }, [config, form]);

  const handleSubmit = async () => {
    try {
      const values = form.getFieldsValue();
      if (!config) return;

      // 只发送变更的字段
      const changes: Partial<AnyStrategyConfig> = {};
      const editableKeys: string[] = [
        'orderAmountUsdt', 'maxPositionUsdt', 'leverage', 'direction',
        'pollIntervalMs', 'orderCheckIntervalMs',
        'maxDrawdownPercent', 'stopLossPercent', 'maxDailyLossUsdt', 'cooldownMs',
        'pricePrecision', 'sizePrecision',
      ];

      // Add strategy-specific editable keys
      if (isScalping) {
        editableKeys.push('priceSpread', 'maxPendingOrders', 'mergeThreshold');
      }
      if (isGrid) {
        editableKeys.push('upperPrice', 'lowerPrice', 'gridCount', 'gridType');
      }

      for (const key of editableKeys) {
        const configRecord = config as unknown as Record<string, unknown>;
        if (values[key] !== undefined && String(values[key]) !== String(configRecord[key])) {
          (changes as Record<string, unknown>)[key] = values[key];
        }
      }

      if (Object.keys(changes).length === 0) {
        message.info('没有需要更新的配置');
        return;
      }

      await api.updateConfig(changes);
      message.success('配置已更新');
      // 重置编辑标记，允许后端新配置同步回表单
      userEditingRef.current = false;
      lastConfigJsonRef.current = '';
      refresh();
    } catch (err) {
      message.error(`更新失败: ${err instanceof Error ? err.message : '未知错误'}`);
    }
  };

  const strategyLabel = config
    ? `${STRATEGY_TYPE_LABELS[config.strategyType] || config.strategyType} / ${TRADING_TYPE_LABELS[config.tradingType] || config.tradingType}`
    : '策略配置';

  const items = [
    {
      key: 'config',
      label: (
        <span>
          <SettingOutlined /> {strategyLabel}
          <Tag color="blue" style={{ marginLeft: 8 }}>运行时可修改</Tag>
        </span>
      ),
      children: (
        <Form form={form} layout="vertical" size="small" onValuesChange={handleFieldsChange}>
          <Divider orientation="left" plain>订单参数</Divider>
          <Row gutter={16}>
            <Col span={6}>
              <Form.Item
                label="单笔金额 (USDT)"
                name="orderAmountUsdt"
                tooltip="需确保金额 / 当前币价 > 最小精度，否则数量为零无法下单"
              >
                <Input suffix="USDT" />
              </Form.Item>
            </Col>
            {isScalping && (
              <Col span={6}>
                <Form.Item label="价差" name="priceSpread">
                  <Input suffix="USDT" />
                </Form.Item>
              </Col>
            )}
            <Col span={6}>
              <Form.Item label="最大持仓 (USDT)" name="maxPositionUsdt">
                <Input suffix="USDT" />
              </Form.Item>
            </Col>
            {config?.tradingType === 'futures' && (
              <Col span={6}>
                <Form.Item label="杠杆" name="leverage">
                  <Input />
                </Form.Item>
              </Col>
            )}
          </Row>
          <Row gutter={16}>
            {config?.tradingType === 'futures' && (
              <Col span={6}>
                <Form.Item label="方向" name="direction">
                  <Select options={[
                    { label: '做多', value: 'long' },
                    { label: '做空', value: 'short' },
                    { label: '双向', value: 'both' },
                  ]} />
                </Form.Item>
              </Col>
            )}
            <Col span={6}>
              <Form.Item
                label={<span>价格精度 {spec && <Tag color="green">交易所: {spec.pricePlace}</Tag>}</span>}
                name="pricePrecision"
              >
                <InputNumber min={0} max={8} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item
                label={<span>数量精度 {spec && <Tag color="green">交易所: {spec.volumePlace} | 最小: {spec.minTradeNum}</Tag>}</span>}
                name="sizePrecision"
                tooltip="BTC 等高价币建议 6，低价山寨币可设 2-4"
              >
                <InputNumber min={0} max={8} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>

          {isScalping && (
            <>
              <Divider orientation="left" plain>挂单管理</Divider>
              <Row gutter={16}>
                <Col span={6}>
                  <Form.Item label="最大挂单数" name="maxPendingOrders">
                    <InputNumber min={1} max={500} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col span={6}>
                  <Form.Item label="合并阈值" name="mergeThreshold">
                    <InputNumber min={2} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
              </Row>
            </>
          )}

          {isGrid && (
            <>
              <Divider orientation="left" plain>网格参数</Divider>
              <Row gutter={16}>
                <Col span={6}>
                  <Form.Item label="上界价格" name="upperPrice">
                    <Input suffix="USDT" />
                  </Form.Item>
                </Col>
                <Col span={6}>
                  <Form.Item label="下界价格" name="lowerPrice">
                    <Input suffix="USDT" />
                  </Form.Item>
                </Col>
                <Col span={6}>
                  <Form.Item label="网格数量" name="gridCount">
                    <InputNumber min={2} max={200} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col span={6}>
                  <Form.Item label="网格类型" name="gridType">
                    <Select options={[
                      { label: '等差', value: 'arithmetic' },
                      { label: '等比', value: 'geometric' },
                    ]} />
                  </Form.Item>
                </Col>
              </Row>
            </>
          )}

          <Divider orientation="left" plain>轮询间隔</Divider>
          <Row gutter={16}>
            <Col span={6}>
              <Form.Item label="盘口轮询 (ms)" name="pollIntervalMs">
                <InputNumber min={200} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item label="成交检测 (ms)" name="orderCheckIntervalMs">
                <InputNumber min={500} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>

          <Divider orientation="left" plain>风控参数</Divider>
          <Row gutter={16}>
            <Col span={6}>
              <Form.Item label="最大回撤 (%)" name="maxDrawdownPercent">
                <InputNumber min={0.1} max={100} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item label="止损 (%)" name="stopLossPercent">
                <InputNumber min={0.1} max={100} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item label="日亏上限 (USDT)" name="maxDailyLossUsdt">
                <Input suffix="USDT" />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item label="冷却时间 (ms)" name="cooldownMs">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>

          <Divider orientation="left" plain>只读参数</Divider>
          <Row gutter={16}>
            <Col span={6}>
              <Form.Item label="交易对" name="symbol">
                <Input disabled />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item label="策略类型" name="strategyType">
                <Input disabled />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item label="交易类型" name="tradingType">
                <Input disabled />
              </Form.Item>
            </Col>
            {config?.tradingType === 'futures' && (
              <Col span={6}>
                <Form.Item label="保证金币种" name="marginCoin">
                  <Input disabled />
                </Form.Item>
              </Col>
            )}
          </Row>

          {spec && (
            <>
              <Divider orientation="left" plain>交易对规格（自动获取）</Divider>
              <Descriptions size="small" column={4} bordered>
                <Descriptions.Item label="baseCoin">{spec.baseCoin}</Descriptions.Item>
                <Descriptions.Item label="quoteCoin">{spec.quoteCoin}</Descriptions.Item>
                <Descriptions.Item label="minTradeNum">{spec.minTradeNum}</Descriptions.Item>
                <Descriptions.Item label="sizeMultiplier">{spec.sizeMultiplier}</Descriptions.Item>
                <Descriptions.Item label="pricePlace">{spec.pricePlace}</Descriptions.Item>
                <Descriptions.Item label="volumePlace">{spec.volumePlace}</Descriptions.Item>
                <Descriptions.Item label="makerFeeRate">{(spec.makerFeeRate * 100).toFixed(4)}%</Descriptions.Item>
                <Descriptions.Item label="takerFeeRate">{(spec.takerFeeRate * 100).toFixed(4)}%</Descriptions.Item>
              </Descriptions>
            </>
          )}

          <Button
            type="primary"
            icon={<SaveOutlined />}
            onClick={handleSubmit}
            disabled={!status || (status.status !== 'RUNNING' && status.status !== 'STOPPED')}
            style={{ marginTop: 16 }}
          >
            更新配置
          </Button>
        </Form>
      ),
    },
  ];

  return <Collapse items={items} />;
}
