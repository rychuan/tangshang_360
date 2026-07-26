import { Plus } from '@/components/ui/hugeicons';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { getGreeting } from './dashboard-utils';

export function DashboardHero({
  userName,
  canPublish,
}: {
  userName?: string;
  canPublish: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-lg font-semibold">
        {getGreeting(new Date())}，{userName || '同事'}
      </h1>
      {canPublish && (
        <Button asChild size="sm">
          <Link to="/publish-management">
            <Plus data-icon="inline-start" />
            发布考核
          </Link>
        </Button>
      )}
    </div>
  );
}
