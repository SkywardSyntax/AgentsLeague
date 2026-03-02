import type { Metadata } from 'next';
import { ThemeProvider } from '@/components/app/ThemeProvider';
import './globals.css';

export const metadata: Metadata = {
  title: 'AgentsLeague',
  description: 'Interleaved AI chat and animated whiteboard',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
