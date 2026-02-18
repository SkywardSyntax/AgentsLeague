'use client';

import dynamic from 'next/dynamic';

/**
 * Lazy-loaded heavy components for code splitting.
 * These are loaded on-demand to reduce First Load JS.
 */

export const LazyChatPanel = dynamic(
  () => import('@/components/ai/ChatPanel'),
  { ssr: false },
);

export const LazyOldChatPanel = dynamic(
  () => import('@/components/chat/ChatPanel').then((m) => ({ default: m.ChatPanel })),
  { ssr: false },
);

export const LazyToolbar = dynamic(
  () => import('@/components/ui/Toolbar'),
  { ssr: false },
);

export const LazyPropertyPanel = dynamic(
  () => import('@/components/ui/PropertyPanel'),
  { ssr: false },
);
