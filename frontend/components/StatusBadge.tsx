'use client';

import React from 'react';
import { Badge } from 'antd';
import type { StrategyStatus } from '@/lib/types';
import { STATUS_LABELS, STATUS_COLORS } from '@/lib/constants';

interface StatusBadgeProps {
  status: StrategyStatus;
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <Badge
      status={STATUS_COLORS[status] as 'default' | 'processing' | 'success' | 'warning' | 'error'}
      text={
        <span style={{ fontSize: 16, fontWeight: 500 }}>
          {STATUS_LABELS[status]}
        </span>
      }
    />
  );
}
