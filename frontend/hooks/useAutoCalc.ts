'use client';

import { useState, useEffect, useRef } from 'react';
import type { StrategyType, TradingType, StrategyDirection, BaseStrategyConfig } from '@/lib/types';

export type RiskLevel = 'conservative' | 'balanced' | 'aggressive';

export interface Derivation {
  field: string;
  value: string;
  formula: string;
  explanation: string;
}

export interface ParameterBounds {
  priceSpread?: { min: number; recommended: number; max: number };
  orderAmountUsdt?: { min: number; max: number };
  gridCount?: { min: number; max: number };
  upperPrice?: { min: number; max: number };
  lowerPrice?: { min: number; max: number };
}

export interface AutoCalcResult {
  fullConfig: BaseStrategyConfig;
  derivations: Derivation[];
  bounds: ParameterBounds;
}

export interface SimpleConfigInput {
  strategyType: StrategyType;
  tradingType: TradingType;
  symbol: string;
  orderAmountUsdt: string;
  direction?: StrategyDirection;
  riskLevel: RiskLevel;
}

async function fetchAutoCalc(input: SimpleConfigInput): Promise<AutoCalcResult> {
  const res = await fetch('/api/strategy/auto-calc', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error?.message || '自动计算失败');
  return json.data;
}

export function useAutoCalc(input: SimpleConfigInput | null) {
  const [result, setResult] = useState<AutoCalcResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!input || !input.symbol || !input.orderAmountUsdt) {
      setResult(null);
      return;
    }

    // Debounce 500ms
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchAutoCalc(input);
        setResult(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : '计算失败');
      } finally {
        setLoading(false);
      }
    }, 500);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [input?.strategyType, input?.tradingType, input?.symbol, input?.orderAmountUsdt, input?.direction, input?.riskLevel]);

  return { result, loading, error };
}
