import type { Metadata } from 'next';
import AntdProvider from '@/providers/AntdProvider';
import SWRProvider from '@/providers/SWRProvider';
import { AuthProvider } from '@/providers/AuthProvider';
import './globals.css';

export const metadata: Metadata = {
  title: 'Bitget 策略交易面板',
  description: '剥头皮策略监控面板',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>
        <SWRProvider>
          <AntdProvider>
            <AuthProvider>{children}</AuthProvider>
          </AntdProvider>
        </SWRProvider>
      </body>
    </html>
  );
}
