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
    <section className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-[clamp(28px,3vw,34px)] font-semibold leading-tight">
          {getGreeting(new Date())}，
          <span className="font-serif font-medium">{userName || '同事'}</span>
        </h1>
        <p className="mt-2 text-[14px] text-muted-foreground">
          掌握考核进度，及时完成评分，让每一次反馈都有价值。
        </p>
      </div>
      {canPublish && (
        <Button
          asChild
          className="h-10 rounded-lg bg-foreground px-4 text-background hover:bg-foreground/90"
        >
          <Link to="/publish-management">
            <Plus className="size-4" />
            发布考核
          </Link>
        </Button>
      )}
    </section>
  );
}
