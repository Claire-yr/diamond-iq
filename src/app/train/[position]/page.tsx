import dynamic from 'next/dynamic';

// ─── Lazy-load PositionTrainPage with ssr: false ──────────────────────
// This prevents scenarioBank's buildScenarioBank() from running during
// next build (SSR). getAllScenariosForPosition() in useMemo would trigger
// the heavy computation at build time.
const PositionTrainPageInner = dynamic(() => import('./PositionTrainPageInner'), { ssr: false });

export function generateStaticParams() {
  const positions = ['投手','捕手','一垒手','二垒手','三垒手','游击手','左外野','中外野','右外野'];
  return positions.map((pos) => ({ position: pos }));
}

export default function PositionTrainPage({ params }: { params: { position: string } }) {
  return <PositionTrainPageInner params={params} />;
}