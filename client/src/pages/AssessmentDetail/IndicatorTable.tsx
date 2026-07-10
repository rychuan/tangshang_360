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
import { ChevronDown, BarChart3 } from 'lucide-react';
import type { AssessmentIndicatorDetail } from '@shared/api.interface';
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
      <span className="text-[0.625rem] leading-3 text-warning">
        超过1.2系数
      </span>
    ) : null;

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
          <span className="text-xs text-muted-foreground">
            {score != null ? `${score}` : '-'}
          </span>
          {scoreWarning}
        </div>
      );
    }
    if (existingScore != null) {
      return (
        <span className="inline-flex flex-col items-center gap-0.5">
          <span className="font-medium">{existingScore}</span>
          {scoreWarning}
        </span>
      );
    }
    return <span className="text-muted-foreground">-</span>;
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
    <div className="flex flex-col">
      {groups.map((group, idx) => (
        <React.Fragment key={group.dimensionName}>
          {/* 卡片间连接指示 — 向下箭头表示下方还有维度卡片 */}
          {idx > 0 && (
            <div className="flex justify-center py-1" aria-hidden="true">
              <ChevronDown className="size-4 text-primary/25" />
            </div>
          )}

          <Card>
            <CardHeader className="pb-4 bg-muted">
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
              <div className="overflow-x-auto">
                <Table className="table-fixed w-full">
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      <TableHead className="w-[18%] text-xs">指标</TableHead>
                      <TableHead className="w-[16%] text-xs hidden md:table-cell">
                        说明
                      </TableHead>
                      <TableHead className="w-[8%] text-xs hidden lg:table-cell">
                        算法/描述
                      </TableHead>
                      <TableHead className="w-[8%] text-xs hidden lg:table-cell">
                        数据来源
                      </TableHead>
                      <TableHead className="w-[15%] text-xs">
                        完成情况
                      </TableHead>
                      <TableHead className="text-center w-[5%] text-xs">
                        权重分
                      </TableHead>
                      <TableHead className="text-center w-[10%] text-xs">
                        自评
                      </TableHead>
                      <TableHead className="text-center w-[10%] text-xs">
                        上级评分
                      </TableHead>
                      <TableHead className="w-[10%] text-xs">备注</TableHead>
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
        </React.Fragment>
      ))}
    </div>
  );
};

export default IndicatorTable;
