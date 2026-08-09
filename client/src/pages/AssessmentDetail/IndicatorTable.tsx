import React from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { ChevronDown, BarChart3 } from '@/components/ui/hugeicons';
import type { AssessmentIndicatorDetail } from '@shared/api.interface';
import { BONUS_SCORE_LIMIT } from '@shared/types/assessment.types';
import {
  type RatingsState,
  type DimensionGroup,
  exceedsScoreCoefficient,
} from './assessment-utils';

interface IndicatorTableProps {
  groups: DimensionGroup[];
  ratings: RatingsState;
  canEditSelf: boolean;
  canEditSupervisor: boolean;
  updateRating: (
    id: string,
    field: 'score' | 'completionStatus' | 'comment',
    value: string,
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
    const score = canEditThis ? ratings[indicator.id]?.score : existingScore;
    const showScoreWarning = exceedsScoreCoefficient(score, indicator.weight);
    const scoreWarning = showScoreWarning ? (
      <span className="flex h-3 items-center text-xs leading-3 text-warning">
        超过1.2系数
      </span>
    ) : (
      <span className="h-3" aria-hidden="true" />
    );

    if (canEditThis) {
      return (
        <div className="flex flex-col items-center gap-0.5">
          <Input
            type="number"
            min={0}
            placeholder="0"
            className="w-20 mx-auto text-center"
            value={score ?? ''}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              updateRating(indicator.id, 'score', e.target.value)
            }
          />
          {scoreWarning}
        </div>
      );
    }
    if (existingScore != null) {
      return (
        <span className="inline-flex min-h-9 flex-col items-center justify-start gap-0.5">
          <span className="flex h-5 items-center font-medium leading-none">
            {existingScore}
          </span>
          {scoreWarning}
        </span>
      );
    }
    return (
      <span className="inline-flex min-h-9 flex-col items-center justify-start gap-0.5">
        <span className="flex h-5 items-center text-muted-foreground leading-none">
          -
        </span>
        <span className="h-3" aria-hidden="true" />
      </span>
    );
  };

  /**
   * 加减分维度卡片：维度名称+说明+员工/上级说明（两个长文本）+评分（可为负分）。
   * 注意：员工说明/上级说明共用同一 comment 状态（与普通指标「备注」单字段一致），
   * 依赖 self_review / supervisor_review 阶段互斥保证不同时可编辑，不会互相覆盖。
   */
  const renderBonusCard = (group: DimensionGroup): React.ReactNode => {
    const indicator = group.indicators[0];
    const canEdit = canEditSelf || canEditSupervisor;
    return (
      <Card>
        <CardHeader className="pb-4 bg-muted/60">
          <div className="flex items-center gap-3">
            <h3 className="text-base font-semibold">
              {group.dimensionName}
            </h3>
            <Badge
              variant="outline"
              className="bg-warning/10 text-warning border-warning/20 text-xs font-bold"
            >
              加减分
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4">
            {indicator?.description && (
              <p className="text-sm text-muted-foreground whitespace-pre-wrap break-words">
                {indicator.description}
              </p>
            )}
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <p className="mb-1 text-xs text-muted-foreground">员工说明</p>
                {canEditSelf && indicator ? (
                  <Textarea
                    className="min-h-20 w-full resize-y text-xs"
                    placeholder="填写员工说明"
                    value={ratings[indicator.id]?.comment ?? ''}
                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                      updateRating(indicator.id, 'comment', e.target.value)
                    }
                  />
                ) : (
                  <p className="whitespace-pre-wrap break-words text-xs text-muted-foreground">
                    {indicator?.selfComment || '-'}
                  </p>
                )}
              </div>
              <div>
                <p className="mb-1 text-xs text-muted-foreground">上级说明</p>
                {canEditSupervisor && indicator ? (
                  <Textarea
                    className="min-h-20 w-full resize-y text-xs"
                    placeholder="填写上级说明"
                    value={ratings[indicator.id]?.comment ?? ''}
                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                      updateRating(indicator.id, 'comment', e.target.value)
                    }
                  />
                ) : (
                  <p className="whitespace-pre-wrap break-words text-xs text-muted-foreground">
                    {indicator?.supervisorComment || '-'}
                  </p>
                )}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-xs text-muted-foreground shrink-0">
                评分{canEdit ? `（可为负分，±${BONUS_SCORE_LIMIT} 以内）` : ''}
              </p>
              {indicator && canEdit ? (
                <Input
                  type="number"
                  step="0.1"
                  min={-BONUS_SCORE_LIMIT}
                  max={BONUS_SCORE_LIMIT}
                  placeholder="0"
                  className="w-28 text-center"
                  value={ratings[indicator.id]?.score ?? ''}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    updateRating(indicator.id, 'score', e.target.value)
                  }
                />
              ) : (
                <span className="text-sm font-medium tabular-nums">
                  自评 {indicator?.selfScore ?? '-'} 分 · 上级{' '}
                  {indicator?.supervisorScore ?? '-'} 分
                </span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  if (groups.length === 0) {
    return (
      <div className="py-12">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <BarChart3 className="size-6" />
            </EmptyMedia>
            <EmptyTitle>暂无指标数据</EmptyTitle>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  return (
    <div className="flex flex-col @container/indicator">
      {groups.map((group, idx) => (
        <React.Fragment key={idx}>
          {/* 卡片间连接指示 — 向下箭头表示下方还有维度卡片 */}
          {idx > 0 && (
            <div className="flex justify-center py-1" aria-hidden="true">
              <ChevronDown className="size-4 text-primary/25" />
            </div>
          )}

          {group.isBonus ? (
            renderBonusCard(group)
          ) : (
          <Card>
            <CardHeader className="pb-4 bg-muted/60">
              <div className="flex items-center gap-3">
                <h3 className="text-base font-semibold">
                  {group.dimensionName}
                </h3>
                <Badge
                  variant="outline"
                  className="bg-primary/10 text-primary border-primary/20 text-xs font-bold"
                >
                  权重分 {group.dimensionWeight}%
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-3.5 @2xl:hidden">
                {group.indicators.map((indicator) => (
                  <div
                    key={indicator.id}
                    className="rounded-xl border bg-background p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium leading-5">
                          {indicator.content}
                        </p>
                        {indicator.description && (
                          <p className="mt-1 text-xs leading-4 text-muted-foreground">
                            {indicator.description}
                          </p>
                        )}
                      </div>
                      <Badge variant="outline" className="shrink-0 text-xs">
                        {indicator.weight}分
                      </Badge>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-3">
                      <div>
                        <p className="mb-1 text-xs text-muted-foreground">
                          自评
                        </p>
                        {renderScoreCell(indicator, 'self')}
                      </div>
                      <div>
                        <p className="mb-1 text-xs text-muted-foreground">
                          上级评分
                        </p>
                        {renderScoreCell(indicator, 'supervisor')}
                      </div>
                    </div>

                    <div className="mt-3">
                      <p className="mb-1 text-xs text-muted-foreground">
                        完成情况
                      </p>
                      {canEditSelf ? (
                        <Textarea
                          className="min-h-20 w-full resize-y text-xs"
                          placeholder="填写完成情况"
                          value={ratings[indicator.id]?.completionStatus ?? ''}
                          onChange={(
                            e: React.ChangeEvent<HTMLTextAreaElement>,
                          ) =>
                            updateRating(
                              indicator.id,
                              'completionStatus',
                              e.target.value,
                            )
                          }
                        />
                      ) : (
                        <p className="whitespace-pre-wrap break-words text-xs text-muted-foreground">
                          {indicator.selfCompletionStatus || '-'}
                        </p>
                      )}
                    </div>

                    <div className="mt-3">
                      <p className="mb-1 text-xs text-muted-foreground">备注</p>
                      {canEdit ? (
                        <Input
                          className="w-full text-xs"
                          placeholder="备注"
                          value={ratings[indicator.id]?.comment ?? ''}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                            updateRating(
                              indicator.id,
                              'comment',
                              e.target.value,
                            )
                          }
                        />
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {(() => {
                            const selfC = indicator.selfComment?.trim();
                            const supC = indicator.supervisorComment?.trim();
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
                    </div>
                  </div>
                ))}
              </div>

              {/* 容器宽度 ≥ 42rem(672px) 才展示表格，避免窄屏挤压；
                  说明/算法/数据来源等次要列在 ≥ 56rem(896px) 时再展开 */}
              <div className="hidden overflow-x-auto @2xl:block">
                <Table className="table-fixed w-full">
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      <TableHead className="w-[16%] text-xs @4xl:w-[10%]">指标</TableHead>
                      <TableHead className="w-[12%] text-xs hidden @4xl:table-cell">
                        说明
                      </TableHead>
                      <TableHead className="w-[20%] text-xs hidden @4xl:table-cell">
                        算法/描述
                      </TableHead>
                      <TableHead className="w-[8%] text-xs hidden @4xl:table-cell">
                        数据来源
                      </TableHead>
                      <TableHead className="w-[26%] text-xs @4xl:w-[15%]">
                        完成情况
                      </TableHead>
                      <TableHead className="text-center w-[5%] text-xs">
                        权重分
                      </TableHead>
                      <TableHead className="text-center w-[14%] text-xs @4xl:w-[10%]">
                        自评
                      </TableHead>
                      <TableHead className="text-center w-[14%] text-xs @4xl:w-[10%]">
                        上级评分
                      </TableHead>
                      <TableHead className="w-[17%] text-xs @4xl:w-[10%]">备注</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {group.indicators.map((indicator) => (
                      <TableRow key={indicator.id}>
                        <TableCell className="font-medium whitespace-pre-wrap break-words">
                          {indicator.content}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs leading-4 whitespace-pre-wrap break-words hidden @4xl:table-cell">
                          {indicator.description || '-'}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs whitespace-pre-wrap break-words hidden @4xl:table-cell">
                          {indicator.algorithm || '-'}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs whitespace-pre-wrap break-words hidden @4xl:table-cell">
                          {indicator.dataSource || '-'}
                        </TableCell>
                        <TableCell className="align-top">
                          {canEditSelf ? (
                            <Textarea
                              className="min-h-20 w-full resize-y text-xs"
                              placeholder="填写完成情况"
                              value={
                                ratings[indicator.id]?.completionStatus ?? ''
                              }
                              onChange={(
                                e: React.ChangeEvent<HTMLTextAreaElement>,
                              ) =>
                                updateRating(
                                  indicator.id,
                                  'completionStatus',
                                  e.target.value,
                                )
                              }
                            />
                          ) : (
                            <span className="block whitespace-pre-wrap break-words text-xs text-muted-foreground">
                              {indicator.selfCompletionStatus || '-'}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-center text-sm">
                          <span className="inline-flex min-h-9 flex-col items-center justify-start gap-0.5">
                            <span className="flex h-5 items-center leading-none">
                              {indicator.weight}
                            </span>
                            <span className="h-3" aria-hidden="true" />
                          </span>
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
          )}
        </React.Fragment>
      ))}
    </div>
  );
};

export default IndicatorTable;
