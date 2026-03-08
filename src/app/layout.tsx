import type { Metadata } from 'next';
import { ThemeProvider } from '@/components/app/ThemeProvider';
import './globals.css';

export const metadata: Metadata = {
  title: 'AgentsLeague — AI Whiteboard',
  description: 'Interleaved AI chat and animated whiteboard for math, diagrams, and visual problem-solving',
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
