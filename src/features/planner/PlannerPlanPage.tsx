import { Navigate } from 'react-router-dom';

import { AppBar } from '@/components/AppBar';
import { useT } from '@/lib/i18n';
import { useGoBack } from '@/lib/useGoBack';

import { useIsPlanner } from './isPlanner';
import { PumpOpenCard } from './PlannerHome';
import { PlanStateCard } from './PlanStateCard';

/**
 * Settings → New Pump Guide: the plan's state with its one button, and the way to
 * Dealer Kavach once the pump opens. Someone who is not a planner (or who has just
 * switched) has nothing here and goes to Settings.
 */
export function PlannerPlanPage() {
  const t = useT();
  const goBack = useGoBack('/settings');
  const planner = useIsPlanner();
  if (!planner) return <Navigate to="/settings" replace />;
  return (
    <>
      <AppBar title={t('planner.title')} onBack={goBack} />
      <div className="flex flex-1 flex-col gap-6 bg-bg px-4 pb-10 pt-4">
        <PlanStateCard />
        <PumpOpenCard />
        <p className="text-meta leading-relaxed text-text-subtle">{t('planner.notAdvice')}</p>
      </div>
    </>
  );
}
