'use client';

import React, { useMemo, useCallback } from 'react';
import {
  Card,
  Form,
  InputNumber,
  Input,
  Slider,
  Radio,
  Row,
  Col,
  Statistic,
  Divider,
  Typography,
} from 'antd';
import { CalculatorOutlined } from '@ant-design/icons';
import type { GridStrategyConfig } from '@/lib/types';

const { Text } = Typography;

interface GridConfigEditorProps {
  config?: Partial<GridStrategyConfig>;
  onChange?: (changes: Partial<GridStrategyConfig>) => void;
}

const MIN_GRID_COUNT = 2;
const MAX_GRID_COUNT = 200;

export default function GridConfigEditor({
  config,
  onChange,
}: GridConfigEditorProps) {
  const upperPrice = parseFloat(config?.upperPrice || '0');
  const lowerPrice = parseFloat(config?.lowerPrice || '0');
  const gridCount = config?.gridCount || 10;
  const gridType = config?.gridType || 'arithmetic';
  const orderAmountUsdt = parseFloat(config?.orderAmountUsdt || '0');

  // Calculate grid preview metrics
  const gridPreview = useMemo(() => {
    if (upperPrice <= 0 || lowerPrice <= 0 || upperPrice <= lowerPrice || gridCount < 2) {
      return null;
    }

    let gridSpacing: string;
    if (gridType === 'arithmetic') {
      const spacing = (upperPrice - lowerPrice) / gridCount;
      gridSpacing = spacing.toFixed(6);
    } else {
      const ratio = Math.pow(upperPrice / lowerPrice, 1 / gridCount);
      gridSpacing = `x${ratio.toFixed(6)}`;
    }

    // Each grid level needs investment
    const investmentPerGrid =
      orderAmountUsdt > 0 ? orderAmountUsdt : (upperPrice + lowerPrice) / 2;
    const totalEstimatedInvestment = investmentPerGrid * gridCount;

    // Estimate fee per cycle (buy + sell, using typical taker fee 0.06%)
    const typicalFeeRate = 0.0006;
    const feePerCycle = investmentPerGrid * typicalFeeRate * 2;

    return {
      gridCount,
      gridSpacing,
      investmentPerGrid: investmentPerGrid.toFixed(2),
      totalEstimatedInvestment: totalEstimatedInvestment.toFixed(2),
      feePerCycle: feePerCycle.toFixed(4),
    };
  }, [upperPrice, lowerPrice, gridCount, gridType, orderAmountUsdt]);

  const handleFieldChange = useCallback(
    (field: keyof GridStrategyConfig, val: string | number | null) => {
      if (val === null) return;
      onChange?.({ [field]: val } as Partial<GridStrategyConfig>);
    },
    [onChange]
  );

  const handleGridTypeChange = useCallback(
    (val: 'arithmetic' | 'geometric') => {
      onChange?.({ gridType: val });
    },
    [onChange]
  );

  return (
    <Card
      title={
        <span>
          <CalculatorOutlined /> 网格配置
        </span>
      }
      size="small"
    >
      <Form layout="vertical" size="small">
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item label="上界价格">
              <Input
                value={config?.upperPrice || ''}
                suffix="USDT"
                placeholder="网格价格上限"
                onChange={(e) => handleFieldChange('upperPrice', e.target.value)}
              />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="下界价格">
              <Input
                value={config?.lowerPrice || ''}
                suffix="USDT"
                placeholder="网格价格下限"
                onChange={(e) => handleFieldChange('lowerPrice', e.target.value)}
              />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={16}>
            <Form.Item label={`网格数量: ${gridCount}`}>
              <Slider
                min={MIN_GRID_COUNT}
                max={MAX_GRID_COUNT}
                value={gridCount}
                onChange={(val) => handleFieldChange('gridCount', val)}
                marks={{
                  2: '2',
                  50: '50',
                  100: '100',
                  150: '150',
                  200: '200',
                }}
              />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label="网格类型">
              <Radio.Group
                value={gridType}
                onChange={(e) => handleGridTypeChange(e.target.value as 'arithmetic' | 'geometric')}
                optionType="button"
                buttonStyle="solid"
              >
                <Radio.Button value="arithmetic">等差</Radio.Button>
                <Radio.Button value="geometric">等比</Radio.Button>
              </Radio.Group>
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              label="单格投资金额 (USDT)"
              tooltip="每个网格级别的投资金额，即 orderAmountUsdt"
            >
              <Input
                value={config?.orderAmountUsdt || ''}
                suffix="USDT"
                placeholder="每格投入金额"
                onChange={(e) => handleFieldChange('orderAmountUsdt', e.target.value)}
              />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="最大持仓 (USDT)">
              <Input
                value={config?.maxPositionUsdt || ''}
                suffix="USDT"
                placeholder="最大持仓限制"
                onChange={(e) => handleFieldChange('maxPositionUsdt', e.target.value)}
              />
            </Form.Item>
          </Col>
        </Row>
      </Form>

      {/* Grid preview */}
      <Divider orientation="left" plain>
        网格预览
      </Divider>
      {gridPreview ? (
        <Row gutter={[16, 16]}>
          <Col span={6}>
            <Statistic
              title="网格数量"
              value={gridPreview.gridCount}
              suffix="格"
            />
          </Col>
          <Col span={6}>
            <Statistic
              title={gridType === 'arithmetic' ? '格间距' : '格比例'}
              value={gridPreview.gridSpacing}
              suffix={gridType === 'arithmetic' ? 'USDT' : ''}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="单格投资"
              value={gridPreview.investmentPerGrid}
              suffix="USDT"
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="预估总投资"
              value={gridPreview.totalEstimatedInvestment}
              suffix="USDT"
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="预估单轮手续费"
              value={gridPreview.feePerCycle}
              suffix="USDT"
            />
          </Col>
        </Row>
      ) : (
        <Text type="secondary">
          请输入有效的上界/下界价格和网格数量以查看预览
        </Text>
      )}
    </Card>
  );
}
