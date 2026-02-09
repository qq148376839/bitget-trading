'use client';

import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { Select, Tag, Space, Typography, Spin, Descriptions } from 'antd';
import { SearchOutlined, FireOutlined } from '@ant-design/icons';
import { useInstruments, useHotInstruments } from '@/hooks/useInstruments';
import type { TradingType, InstrumentSpec } from '@/lib/types';

const { Text } = Typography;

interface TradingPairSelectorProps {
  tradingType: TradingType;
  value?: string;
  onChange?: (symbol: string) => void;
}

const DEBOUNCE_MS = 300;

export default function TradingPairSelector({
  tradingType,
  value,
  onChange,
}: TradingPairSelectorProps) {
  const [search, setSearch] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { instruments, isLoading: isSearchLoading } = useInstruments(tradingType, debouncedSearch);
  const { hotInstruments, isLoading: isHotLoading } = useHotInstruments(tradingType);

  // Debounce the search input
  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      setDebouncedSearch(search);
    }, DEBOUNCE_MS);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [search]);

  const handleSearch = useCallback((val: string) => {
    setSearch(val);
  }, []);

  const handleChange = useCallback(
    (symbol: string) => {
      onChange?.(symbol);
      setSearch('');
      setDebouncedSearch('');
    },
    [onChange]
  );

  const handleHotPairClick = useCallback(
    (symbol: string) => {
      onChange?.(symbol);
    },
    [onChange]
  );

  // Find the selected instrument from either list
  const selectedSpec = useMemo(() => {
    if (!value) return null;
    const fromInstruments = instruments.find((i) => i.symbol === value);
    if (fromInstruments) return fromInstruments;
    return hotInstruments.find((i) => i.symbol === value) || null;
  }, [value, instruments, hotInstruments]);

  // Build select options from search results
  const selectOptions = useMemo(() => {
    return instruments.map((inst) => ({
      value: inst.symbol,
      label: (
        <Space>
          <Text strong>{inst.symbol}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {inst.baseCoin}/{inst.quoteCoin}
          </Text>
          <Text type="secondary" style={{ fontSize: 11 }}>
            min: {inst.minTradeNum}
          </Text>
        </Space>
      ),
    }));
  }, [instruments]);

  return (
    <div>
      {/* Hot pairs quick select */}
      <div style={{ marginBottom: 8 }}>
        <Space size={[4, 4]} wrap>
          <Text type="secondary" style={{ fontSize: 12 }}>
            <FireOutlined /> 热门:
          </Text>
          {isHotLoading ? (
            <Spin size="small" />
          ) : (
            hotInstruments.map((inst) => (
              <Tag
                key={inst.symbol}
                color={value === inst.symbol ? 'blue' : undefined}
                style={{ cursor: 'pointer' }}
                onClick={() => handleHotPairClick(inst.symbol)}
              >
                {inst.symbol}
              </Tag>
            ))
          )}
        </Space>
      </div>

      {/* Search select */}
      <Select
        showSearch
        value={value}
        placeholder="搜索交易对..."
        style={{ width: '100%' }}
        filterOption={false}
        onSearch={handleSearch}
        onChange={handleChange}
        loading={isSearchLoading}
        options={selectOptions}
        suffixIcon={<SearchOutlined />}
        notFoundContent={
          isSearchLoading ? <Spin size="small" /> : <Text type="secondary">未找到交易对</Text>
        }
      />

      {/* Selected instrument spec info */}
      {selectedSpec && (
        <Descriptions
          size="small"
          column={4}
          style={{ marginTop: 8 }}
          bordered
        >
          <Descriptions.Item label="最小数量">{selectedSpec.minTradeNum}</Descriptions.Item>
          <Descriptions.Item label="价格精度">{selectedSpec.pricePlace}</Descriptions.Item>
          <Descriptions.Item label="数量精度">{selectedSpec.volumePlace}</Descriptions.Item>
          <Descriptions.Item label="Maker 费率">
            {(selectedSpec.makerFeeRate * 100).toFixed(4)}%
          </Descriptions.Item>
          <Descriptions.Item label="Taker 费率">
            {(selectedSpec.takerFeeRate * 100).toFixed(4)}%
          </Descriptions.Item>
          <Descriptions.Item label="乘数">{selectedSpec.sizeMultiplier}</Descriptions.Item>
        </Descriptions>
      )}
    </div>
  );
}
