import React from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { AssessmentIndicatorDetail } from '@shared/api.interface';
import type { RatingsState, DimensionGroup } from './assessment-utils';

/* ------------------------------------------------------------------ */
/*  维度权重分布概览组件                                                 */
/* ------------------------------------------------------------------ */

const WEIGHT_COLORS = [
  'bg-chart-1',
  'bg-chart-2',
  'bg-chart-3',
  'bg-chart-4',
  'bg-chart-5',
] as const;

function WeightDistributionBar({ groups }: { groups: DimensionGroup[] }) {
  const totalWeight = groups.reduce((sum, g) => sum + g.dimensionWeight, 0);

  return (
    <div className="mb-5 rounded-xl border border-border bg-card p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">
          维度权重分布
        </span>
        <span className="text-xs text-muted-foreground">
          合计 {totalWeight}%
        </span>
      </div>

      {/* 分段条形图 */}
      <div className="flex h-2.5 overflow-hidden rounded-full bg-muted">
        {groups.map((group, i) => (
          <div
            key={group.dimensionName}
            className={`h-full transition-all first:rounded-l-full last:rounded-r-full ${WEIGHT_COLORS[i % WEIGHT_COLORS.length]}`}
            style={{ width: `${Math.max(group.dimensionWeight, 2)}%` }}
          />
        ))}
      </div>

      {/* 图例 */}
      <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1">
        {groups.map((group, i) => (
          <span
            key={group.dimensionName}
            className="flex items-center gap-1.5 text-[11px] text-muted-foreground"
          >
            <span
              className={`inline-block size-2.5 rounded-full ${WEIGHT_COLORS[i % WEIGHT_COLORS.length]}`}
            />
            <span>{group.dimensionName}</span>
            <span className="font-medium text-foreground">
              {group.dimensionWeight}%
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  主组件                                                             */
/* ------------------------------------------------------------------ */

interface IndicatorTableProps {
  groups: DimensionGroup[];
  ratings: RatingsState;
  canEditSelf: boolean;
  canEditSupervisor: boolean;
  updateRating: (
    id: string,
    field: 'score' | 'comment',
    value: string,
    weight?: number,
  ) => void;
}

const IndicatorTable: React.FC<IndicatorTableProps> = ({
  groups,
  ratings,
  canEditSelf,
  canEditSupervisor,
  updateRating,
}) => {
  const canEdit = canEditSelf || canEditSupervisor;

  const renderScoreCell = (
    indicator: AssessmentIndicatorDetail,
    type: 'self' | 'supervisor',
  ) => {
    const canEditThis = type === 'self' ? canEditSelf : canEditSupervisor;
    const existingScore =
      type === 'self' ? indicator.selfScore : indicator.supervisorScore;

    if (canEditThis) {
      const currentScore = ratings[indicator.id]?.score ?? 0;
      return (
        <div className="flex flex-col items-center gap-0.5">
          <Input
            type="number"
            min={0}
            max={indicator.weight}
            className="w-20 mx-auto text-center"
            value={currentScore}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              updateRating(
                indicator.id,
                'score',
                e.target.value,
                indicator.weight,
              )
            }
          />
          <span className="text-xs text-muted-foreground">
            {currentScore}/{indicator.weight}
          </span>
        </div>
      );
    }
    if (existingScore != null) {
      return <span className="font-medium">{existingScore}</span>;
    }
    return <span className="text-muted-foreground">-</span>;
  };

  return (
    <>
      {/* 维度权重分布概览 */}
      <WeightDistributionBar groups={groups} />

      {/* 维度卡片 + 左侧时间轴连接线 */}
      <div className="relative">
        {/* 垂直连接线 — 贯穿所有维度卡片 */}
        <div className="absolute left-[22px] top-0 bottom-0 w-px bg-border/60 hidden sm:block" />

        <div className="flex flex-col gap-5">
          {groups.map((group, idx) => (
            <div
              key={group.dimensionName}
              className="relative flex items-stretch gap-4"
            >
              {/* 步骤编号圆圈 — 移动端隐藏 */}
              <div className="hidden sm:flex flex-col items-center pt-6 w-11 shrink-0 z-10">
                <div className="flex size-[42px] items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground ring-[6px] ring-background">
                  {idx + 1}
                </div>
              </div>

              {/* 维度卡片 — 左侧强调色边框 */}
              <Card className="flex-1 min-w-0 border-l-2 border-l-primary/20">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-3">
                    <h3 className="text-base font-semibold">
                      {group.dimensionName}
                    </h3>
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-md bg-primary/10 text-primary text-xs font-bold border border-primary/20">
                      权重 {group.dimensionWeight}%
                    </span>
                  </div>

                  {/* 微型权重进度条 */}
                  <div className="mt-2.5 h-1.5 w-full rounded-full bg-primary/10">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${group.dimensionWeight}%` }}
                    />
                  </div>
                </CardHeader>

                <CardContent>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/30">
                          <TableHead className="whitespace-nowrap w-[140px]">
                            指标
                          </TableHead>
                          <TableHead className="whitespace-nowrap w-[160px] hidden md:table-cell">
                            说明
                          </TableHead>
                          <TableHead className="whitespace-nowrap max-w-[140px] hidden lg:table-cell">
                            指标算法/描述
                          </TableHead>
                          <TableHead className="whitespace-nowrap max-w-[100px] hidden lg:table-cell">
                            数据来源
                          </TableHead>
                          <TableHead className="text-center w-16">
                            权重(分)
                          </TableHead>
                          <TableHead className="text-center w-24">
                            自评
                          </TableHead>
                          <TableHead className="text-center w-24">
                            上级评分
                          </TableHead>
                          <TableHead className="w-40">备注</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {group.indicators.map((indicator) => (
                          <TableRow key={indicator.id}>
                            <TableCell className="font-medium whitespace-pre-wrap break-words w-[140px]">
                              {indicator.content}
                            </TableCell>
                            <TableCell className="text-muted-foreground text-[0.625rem] leading-4 whitespace-pre-wrap break-words w-[160px] hidden md:table-cell">
                              {indicator.description || '-'}
                            </TableCell>
                            <TableCell className="text-muted-foreground text-xs whitespace-pre-wrap break-words max-w-[140px] hidden lg:table-cell">
                              {indicator.algorithm || '-'}
                            </TableCell>
                            <TableCell className="text-muted-foreground text-xs whitespace-pre-wrap break-words max-w-[100px] hidden lg:table-cell">
                              {indicator.dataSource || '-'}
                            </TableCell>
                            <TableCell className="text-center text-sm">
                              {indicator.weight}
                            </TableCell>
                            <TableCell className="text-center">
                              {renderScoreCell(indicator, 'self')}
                            </TableCell>
                            <TableCell className="text-center">
                              {renderScoreCell(indicator, 'supervisor')}
                            </TableCell>
                            <TableCell>
                              {canEdit ? (
                                <Input
                                  className="w-full text-xs"
                                  placeholder="备注"
                                  value={ratings[indicator.id]?.comment ?? ''}
                                  onChange={(
                                    e: React.ChangeEvent<HTMLInputElement>,
                                  ) =>
                                    updateRating(
                                      indicator.id,
                                      'comment',
                                      e.target.value,
                                    )
                                  }
                                />
                              ) : (
                                <span className="text-muted-foreground text-xs">
                                  {(() => {
                                    const selfC = indicator.selfComment?.trim();
                                    const supC =
                                      indicator.supervisorComment?.trim();
                                    if (selfC && supC) {
                                      return (
                                        <span className="flex flex-col gap-0.5">
                                          <span>自评：{selfC}</span>
                                          <span>上级：{supC}</span>
                                        </span>
                                      );
                                    }
                                    if (selfC) return <>自评：{selfC}</>;
                                    if (supC) return <>上级：{supC}</>;
                                    return '-';
                                  })()}
                                </span>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </div>
          ))}
        </div>
      </div>
    </>
  );
};

export default IndicatorTable;
