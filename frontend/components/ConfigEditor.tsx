'use client';

import React, { useEffect } from 'react';
import { Collapse, Form, InputNumber, Input, Select, Button, Row, Col, Divider, App, Tag } from 'antd';
import { SettingOutlined, SaveOutlined } from '@ant-design/icons';
import { useStrategyStatus } from '@/hooks/useStrategyStatus';
import { api } from '@/lib/api';
import type { ScalpingStrategyConfig } from '@/lib/types';

export default function ConfigEditor() {
  const { status, refresh } = useStrategyStatus();
  const { message } = App.useApp();
  const [form] = Form.useForm();

  const config = status?.config;

  useEffect(() => {
    if (config) {
      form.setFieldsValue(config);
    }
  }, [config, form]);

  const handleSubmit = async () => {
    try {
      const values = form.getFieldsValue();
      if (!config) return;

      // 只发送变更的字段
      const changes: Partial<ScalpingStrategyConfig> = {};
      const editableKeys: (keyof ScalpingStrategyConfig)[] = [
        'orderAmountUsdt', 'priceSpread', 'maxPositionUsdt', 'leverage', 'direction',
        'maxPendingOrders', 'mergeThreshold',
        'pollIntervalMs', 'orderCheckIntervalMs',
        'maxDrawdownPercent', 'stopLossPercent', 'maxDailyLossUsdt', 'cooldownMs',
        'pricePrecision', 'sizePrecision',
      ];

      for (const key of editableKeys) {
        if (values[key] !== undefined && String(values[key]) !== String(config[key])) {
          (changes as Record<string, unknown>)[key] = values[key];
        }
      }

      if (Object.keys(changes).length === 0) {
        message.info('没有需要更新的配置');
        return;
      }

      await api.updateConfig(changes);
      message.success('配置已更新');
      refresh();
    } catch (err) {
      message.error(`更新失败: ${err instanceof Error ? err.message : '未知错误'}`);
    }
  };

  const items = [
    {
      key: 'config',
      label: (
        <span>
          <SettingOutlined /> 策略配置
          <Tag color="blue" style={{ marginLeft: 8 }}>运行时可修改</Tag>
        </span>
      ),
      children: (
        <Form form={form} layout="vertical" size="small">
          <Divider orientation="left" plain>订单参数</Divider>
          <Row gutter={16}>
            <Col span={6}>
              <Form.Item label="单笔金额 (USDT)" name="orderAmountUsdt">
                <Input suffix="USDT" />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item label="价差" name="priceSpread">
                <Input suffix="USDT" />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item label="最大持仓 (USDT)" name="maxPositionUsdt">
                <Input suffix="USDT" />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item label="杠杆" name="leverage">
                <Input />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={6}>
              <Form.Item label="方向" name="direction">
                <Select options={[
                  { label: '做多', value: 'long' },
                  { label: '做空', value: 'short' },
                  { label: '双向', value: 'both' },
                ]} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item label="价格精度" name="pricePrecision">
                <InputNumber min={0} max={8} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item label="数量精度" name="sizePrecision">
                <InputNumber min={0} max={8} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>

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

          <Divider orientation="left" plain>轮询间隔</Divider>
          <Row gutter={16}>
            <Col span={6}>
              <Form.Item label="盘口轮询 (ms)" name="pollIntervalMs">
                <InputNumber min={200} suffix="ms" style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item label="成交检测 (ms)" name="orderCheckIntervalMs">
                <InputNumber min={500} suffix="ms" style={{ width: '100%' }} />
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
              <Form.Item label="产品类型" name="productType">
                <Input disabled />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item label="保证金模式" name="marginMode">
                <Input disabled />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item label="保证金币种" name="marginCoin">
                <Input disabled />
              </Form.Item>
            </Col>
          </Row>

          <Button
            type="primary"
            icon={<SaveOutlined />}
            onClick={handleSubmit}
            disabled={status?.status !== 'RUNNING'}
          >
            更新配置
          </Button>
        </Form>
      ),
    },
  ];

  return <Collapse items={items} />;
}
