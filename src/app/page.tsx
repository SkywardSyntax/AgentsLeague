import { Suspense } from 'react';
import { AppShell } from '@/components/app/AppShell';

export default function Home() {
  return (
    <Suspense fallback={<div className="flex h-screen w-screen items-center justify-center bg-gray-950"><div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-600 border-t-white" /></div>}>
      <AppShell />
    </Suspense>
  );
}
