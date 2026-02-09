'use client';

import React, { useCallback } from 'react';
import { Card, Row, Col, Typography, Space } from 'antd';
import { ThunderboltOutlined, AppstoreOutlined } from '@ant-design/icons';
import type { StrategyType } from '@/lib/types';

const { Title, Text, Paragraph } = Typography;

interface StrategyTypeSelectorProps {
  value?: StrategyType;
  onChange?: (type: StrategyType) => void;
}

interface StrategyOption {
  type: StrategyType;
  icon: React.ReactNode;
  name: string;
  description: string;
  scenarios: string;
}

const STRATEGY_OPTIONS: StrategyOption[] = [
  {
    type: 'scalping',
    icon: <ThunderboltOutlined style={{ fontSize: 28 }} />,
    name: '剥头皮',
    description: '高频低价差交易，在买一价挂单，成交后加价差卖出',
    scenarios: '适合波动小、流动性好的交易对',
  },
  {
    type: 'grid',
    icon: <AppstoreOutlined style={{ fontSize: 28 }} />,
    name: '网格策略',
    description: '在价格区间内设置网格，自动低买高卖',
    scenarios: '适合震荡行情，无需判断方向',
  },
];

export default function StrategyTypeSelector({
  value,
  onChange,
}: StrategyTypeSelectorProps) {
  const handleSelect = useCallback(
    (type: StrategyType) => {
      onChange?.(type);
    },
    [onChange]
  );

  return (
    <Row gutter={16}>
      {STRATEGY_OPTIONS.map((option) => {
        const isSelected = value === option.type;
        return (
          <Col span={12} key={option.type}>
            <Card
              hoverable
              onClick={() => handleSelect(option.type)}
              style={{
                borderColor: isSelected ? '#1677ff' : undefined,
                borderWidth: isSelected ? 2 : 1,
                cursor: 'pointer',
              }}
              styles={{
                body: { padding: 20 },
              }}
            >
              <Space direction="vertical" size={8} style={{ width: '100%' }}>
                <Space align="center" size={12}>
                  <span
                    style={{
                      color: isSelected ? '#1677ff' : '#8c8c8c',
                      display: 'inline-flex',
                    }}
                  >
                    {option.icon}
                  </span>
                  <Title
                    level={5}
                    style={{
                      margin: 0,
                      color: isSelected ? '#1677ff' : undefined,
                    }}
                  >
                    {option.name}
                  </Title>
                </Space>
                <Paragraph
                  type="secondary"
                  style={{ margin: 0, fontSize: 13 }}
                >
                  {option.description}
                </Paragraph>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {option.scenarios}
                </Text>
              </Space>
            </Card>
          </Col>
        );
      })}
    </Row>
  );
}
