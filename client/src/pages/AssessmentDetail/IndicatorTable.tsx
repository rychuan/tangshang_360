import React from 'react';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardHeader,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
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
    const canEditThis =
      type === 'self' ? canEditSelf : canEditSupervisor;
    const existingScore =
      type === 'self'
        ? indicator.selfScore
        : indicator.supervisorScore;

    if (canEditThis) {
      const currentScore =
        ratings[indicator.id]?.score ?? 0;
      return (
        <div className="flex flex-col items-center gap-0.5">
          <Input
            type="number"
            min={0}
            max={indicator.weight}
            className="w-20 mx-auto text-center"
            value={currentScore}
            onChange={(
              e: React.ChangeEvent<HTMLInputElement>,
            ) =>
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
      {groups.map((group) => (
        <Card key={group.dimensionName}>
          <CardHeader>
            <div className="flex items-center gap-3">
              <h3 className="text-lg font-semibold">
                {group.dimensionName}
              </h3>
              <span className="inline-flex items-center px-3 py-1 rounded-md bg-primary/10 text-primary text-sm font-bold border border-primary/20">
                权重 {group.dimensionWeight}%
              </span>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left py-3 px-2 font-medium text-muted-foreground whitespace-nowrap">
                      指标
                    </th>
                    <th className="text-left py-3 px-2 font-medium text-muted-foreground whitespace-nowrap max-w-[120px]">
                      说明
                    </th>
                    <th className="text-left py-3 px-2 font-medium text-muted-foreground whitespace-nowrap max-w-[120px]">
                      指标算法/描述
                    </th>
                    <th className="text-left py-3 px-2 font-medium text-muted-foreground whitespace-nowrap max-w-[120px]">
                      数据来源
                    </th>
                    <th className="text-center py-3 px-2 font-medium text-muted-foreground w-16">
                      权重(分)
                    </th>
                    <th className="text-center py-3 px-2 font-medium text-muted-foreground w-28">
                      自评
                    </th>
                    <th className="text-center py-3 px-2 font-medium text-muted-foreground w-28">
                      上级评分
                    </th>
                    <th className="text-left py-3 px-2 font-medium text-muted-foreground w-48">
                      备注
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {group.indicators.map((indicator) => (
                    <tr
                      key={indicator.id}
                      className="border-b last:border-0"
                    >
                      <td className="py-2 px-2 font-medium whitespace-nowrap">
                        {indicator.content}
                      </td>
                      <td className="py-2 px-2 text-sm text-muted-foreground max-w-[120px] break-words">
                        {indicator.description || '-'}
                      </td>
                      <td className="py-2 px-2 text-sm text-muted-foreground max-w-[120px] break-words">
                        {indicator.algorithm || '-'}
                      </td>
                      <td className="py-2 px-2 text-sm text-muted-foreground max-w-[120px] break-words">
                        {indicator.dataSource || '-'}
                      </td>
                      <td className="py-2 px-2 text-center">
                        {indicator.weight}
                      </td>
                      <td className="py-2 px-2 text-center">
                        {renderScoreCell(indicator, 'self')}
                      </td>
                      <td className="py-2 px-2 text-center">
                        {renderScoreCell(indicator, 'supervisor')}
                      </td>
                      <td className="py-2 px-2">
                        {canEdit ? (
                          <Input
                            className="w-full"
                            placeholder="备注"
                            value={
                              ratings[indicator.id]?.comment ??
                              ''
                            }
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
                          <span className="text-muted-foreground">
                            {(() => {
                              const selfC =
                                indicator.selfComment;
                              const supC =
                                indicator.supervisorComment;
                              if (selfC && supC) {
                                return `自: ${selfC} | 上: ${supC}`;
                              }
                              if (selfC)
                                return `自: ${selfC}`;
                              if (supC)
                                return `上: ${supC}`;
                              return '-';
                            })()}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ))}
    </>
  );
};

export default IndicatorTable;
