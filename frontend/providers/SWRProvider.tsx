'use client';

import React from 'react';
import { SWRConfig } from 'swr';

const swrOptions = {
  revalidateOnFocus: false,
  errorRetryCount: 3,
  dedupingInterval: 1000,
};

export default function SWRProvider({ children }: { children: React.ReactNode }) {
  return <SWRConfig value={swrOptions}>{children}</SWRConfig>;
}
