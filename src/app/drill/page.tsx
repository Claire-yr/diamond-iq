'use client';

import dynamic from 'next/dynamic';

// ─── Lazy-load the entire DrillPage with ssr: false ──────────────────────
// This prevents scenarioBank's buildScenarioBank() from running during
// next build (SSR). The heavy computation only executes on the client.
const DrillPageInner = dynamic(() => import('./DrillPageInner'), { ssr: false });

export default function DrillPage() {
  return <DrillPageInner />;
}