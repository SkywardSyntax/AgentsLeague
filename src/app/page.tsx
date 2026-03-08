import { Suspense } from 'react';
import { AppShell } from '@/components/app/AppShell';

export default function Home() {
  return (
    <Suspense fallback={<div className="flex h-screen w-screen items-center justify-center bg-[#09090F]"><div className="h-8 w-8 animate-spin rounded-full border-2 border-[#2A2A3E] border-t-[#4F6BFF]" /></div>}>
      <AppShell />
    </Suspense>
  );
}
