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
    <div className="flex flex-col gap-6">
      {groups.map((group) => (
        <Card key={group.dimensionName}>
          <CardHeader className="pb-4">
            <div className="flex items-center gap-3">
              <h3 className="text-base font-semibold">{group.dimensionName}</h3>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-md bg-primary/10 text-primary text-xs font-bold border border-primary/20">
                权重 {group.dimensionWeight}%
              </span>
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
                    <TableHead className="whitespace-normal max-w-[160px] hidden md:table-cell">
                      说明与算法描述
                    </TableHead>
                    <TableHead className="whitespace-nowrap max-w-[100px] hidden lg:table-cell">
                      数据来源
                    </TableHead>
                    <TableHead className="text-center w-16">权重(分)</TableHead>
                    <TableHead className="text-center w-24">自评</TableHead>
                    <TableHead className="text-center w-24">上级评分</TableHead>
                    <TableHead className="w-40">备注</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {group.indicators.map((indicator) => (
                    <TableRow key={indicator.id}>
                      <TableCell className="font-medium whitespace-nowrap">
                        {indicator.content}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs whitespace-normal break-words max-w-[160px] hidden md:table-cell">
                        <div className="line-clamp-3">
                          {indicator.description && (
                            <p className="mb-1">{indicator.description}</p>
                          )}
                          {indicator.algorithm && (
                            <p className="text-muted-foreground/70">
                              {indicator.algorithm}
                            </p>
                          )}
                          {!indicator.description &&
                            !indicator.algorithm &&
                            '-'}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs whitespace-normal break-words max-w-[100px] hidden lg:table-cell">
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
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export default IndicatorTable;
