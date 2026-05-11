'use client';

import dynamic from 'next/dynamic';

// ─── Lazy-load PositionTrainPage with ssr: false ──────────────────────
// This prevents scenarioBank's buildScenarioBank() from running during
// next build (SSR). getAllScenariosForPosition() in useMemo would trigger
// the heavy computation at build time.
const PositionTrainPageInner = dynamic(() => import('./PositionTrainPageInner'), { ssr: false });

export default function PositionTrainPage({ params }: { params: { position: string } }) {
  return <PositionTrainPageInner params={params} />;
}