import React from 'react';
import { Users, CheckCircle, TrendingUp, Clock } from '@/components/ui/hugeicons';
import type { PeriodStatisticsResponse } from '@shared/api.interface';
import { Card, CardContent } from '@/components/ui/card';

interface StatisticsCardsProps {
  statistics: PeriodStatisticsResponse | null;
  loading: boolean;
}

interface CardConfig {
  label: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  iconBgClass: string;
}

const StatisticsCards: React.FC<StatisticsCardsProps> = ({
  statistics,
  loading,
}) => {
  const cards: CardConfig[] = [
    {
      label: '待发布人数',
      value: statistics?.toPublishCount ?? 0,
      icon: Users,
      iconBgClass: 'bg-primary/10 text-primary',
    },
    {
      label: '已发布人数',
      value: statistics?.publishedCount ?? 0,
      icon: CheckCircle,
      iconBgClass: 'bg-success/10 text-success',
    },
    {
      label: '自评完成率',
      value: `${statistics?.selfReviewCompletedRate ?? 0}%`,
      icon: TrendingUp,
      iconBgClass: 'bg-warning/10 text-warning',
    },
    {
      label: '待处理绩效',
      value: statistics?.pendingCount ?? 0,
      icon: Clock,
      iconBgClass: 'bg-destructive/10 text-destructive',
    },
  ];

  return (
    <div
      data-ai-section-type="card-stat"
      className="grid grid-cols-2 gap-4 md:grid-cols-4"
    >
      {cards.map((card: CardConfig) => {
        const Icon: React.ComponentType<{ className?: string }> = card.icon;
        return (
          <Card key={card.label} className="rounded-xl">
            <CardContent className="flex items-center gap-4 p-6">
              <div
                className={`flex items-center justify-center size-12 rounded-lg ${card.iconBgClass}`}
              >
                <Icon className="size-6" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{card.label}</p>
                <p className="text-3xl font-bold text-foreground tabular-nums">
                  {loading ? '-' : card.value}
                </p>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};

export default StatisticsCards;
