import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { logger } from '@lark-apaas/client-toolkit/logger';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Spinner } from '@/components/ui/spinner';
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Eye,
  Pencil,
  Copy,
  Trash2,
  Plus,
  AlertTriangle,
  FolderPlus,
  X,
  Check,
} from 'lucide-react';
import { getEmployeeSnapshot } from '@/api/assessment-publish';
import {
  validateTotalWeight,
  validateIndicatorWeights,
} from '@/utils/weight-validation';
import type {
  AdjustIndicatorInput,
  InstanceIndicatorItem,
} from '@shared/api.interface';

interface AdjustIndicatorsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employee: {
    employeeId: string;
    employeeName: string;
    templateName: string;
  } | null;
  onSubmit: (indicators: AdjustIndicatorInput[]) => void;
  onDeleteSnapshot: () => void;
  loading: boolean;
}

interface DimensionGroup {
  dimensionName: string;
  dimensionWeight: number;
  indicators: AdjustIndicatorInput[];
  flatIndices: number[];
}

const EMPTY_INDICATOR: AdjustIndicatorInput = {
  content: '',
  description: '',
  algorithm: '',
  dataSource: '',
  weight: 0,
  dimensionName: '',
  dimensionWeight: 0,
};

const AdjustIndicatorsDialog: React.FC<AdjustIndicatorsDialogProps> = ({
  open,
  onOpenChange,
  employee,
  onSubmit,
  onDeleteSnapshot,
  loading,
}) => {
  const [indicators, setIndicators] = useState<AdjustIndicatorInput[]>([]);
  const [previewMode, setPreviewMode] = useState<boolean>(false);
  const [loadingIndicators, setLoadingIndicators] = useState<boolean>(false);
  const [addingDimension, setAddingDimension] = useState<boolean>(false);
  const [newDimName, setNewDimName] = useState<string>('');
  const [newDimWeight, setNewDimWeight] = useState<string>('');

  const loadIndicators = useCallback(
    async (employeeId: string): Promise<void> => {
      setLoadingIndicators(true);
      try {
        const res = await getEmployeeSnapshot(employeeId);
        if (res.indicators.length > 0) {
          setIndicators(
            res.indicators.map((ind: InstanceIndicatorItem) => ({
              content: ind.content,
              description: ind.description,
              algorithm: ind.algorithm,
              dataSource: ind.dataSource,
              weight: ind.weight,
              dimensionName: ind.dimensionName,
              dimensionWeight: ind.dimensionWeight,
            })),
          );
        } else {
          setIndicators([]);
        }
      } catch (err: unknown) {
        logger.error('loadIndicators failed', err);
        toast.error('加载指标快照失败');
        setIndicators([]);
      } finally {
        setLoadingIndicators(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (open && employee?.employeeId) {
      setPreviewMode(false);
      setAddingDimension(false);
      setNewDimName('');
      setNewDimWeight('');
      loadIndicators(employee.employeeId);
    }
  }, [open, employee?.employeeId, loadIndicators]);

  const dimensionGroups: DimensionGroup[] = useMemo(() => {
    const groups: Record<string, DimensionGroup> = {};
    indicators.forEach((ind: AdjustIndicatorInput, i: number) => {
      const key = ind.dimensionName || '未分组';
      if (!groups[key]) {
        groups[key] = {
          dimensionName: ind.dimensionName,
          dimensionWeight: ind.dimensionWeight,
          indicators: [],
          flatIndices: [],
        };
      }
      groups[key].indicators.push(ind);
      groups[key].flatIndices.push(i);
    });
    return Object.values(groups);
  }, [indicators]);

  const dimensionWeightValidation = useMemo(
    () =>
      validateTotalWeight(
        dimensionGroups.map((g) => ({ weight: g.dimensionWeight })),
      ),
    [dimensionGroups],
  );

  const indicatorWeightValidation = useMemo(
    () =>
      validateIndicatorWeights(
        dimensionGroups.map((g) => ({
          name: g.dimensionName,
          weight: g.dimensionWeight,
          indicators: g.indicators.map((i) => ({ weight: i.weight ?? 0 })),
        })),
      ),
    [dimensionGroups],
  );

  const handleAddIndicator = (
    dimensionName: string,
    dimensionWeight: number,
  ): void => {
    setIndicators((prev: AdjustIndicatorInput[]) => {
      const existingSum: number = prev
        .filter(
          (ind: AdjustIndicatorInput) =>
            (ind.dimensionName || '未分组') === (dimensionName || '未分组'),
        )
        .reduce(
          (sum: number, ind: AdjustIndicatorInput) => sum + (ind.weight ?? 0),
          0,
        );
      const remaining: number = Math.max(0, dimensionWeight - existingSum);
      return [
        ...prev,
        {
          ...EMPTY_INDICATOR,
          weight: remaining,
          dimensionName,
          dimensionWeight,
        },
      ];
    });
  };

  const handleRemoveIndicator = (flatIndex: number): void => {
    setIndicators((prev: AdjustIndicatorInput[]) =>
      prev.filter((_: AdjustIndicatorInput, i: number) => i !== flatIndex),
    );
  };

  const handleIndicatorChange = (
    flatIndex: number,
    field: keyof AdjustIndicatorInput,
    value: string | number,
  ): void => {
    setIndicators((prev: AdjustIndicatorInput[]) => {
      const next: AdjustIndicatorInput[] = [...prev];
      next[flatIndex] = { ...next[flatIndex], [field]: value };
      return next;
    });
  };

  const handleDimensionChange = (
    group: DimensionGroup,
    field: 'dimensionName' | 'dimensionWeight',
    value: string | number,
  ): void => {
    setIndicators((prev: AdjustIndicatorInput[]) => {
      const next: AdjustIndicatorInput[] = [...prev];
      for (const idx of group.flatIndices) {
        next[idx] = { ...next[idx], [field]: value };
      }
      return next;
    });
  };

  const handleRemoveDimension = (group: DimensionGroup): void => {
    const removeSet: Set<number> = new Set(group.flatIndices);
    setIndicators((prev: AdjustIndicatorInput[]) =>
      prev.filter((_: AdjustIndicatorInput, i: number) => !removeSet.has(i)),
    );
  };

  const handleConfirmAddDimension = (): void => {
    const name: string = newDimName.trim();
    const weight: number = Number(newDimWeight);
    if (!name) {
      toast.error('请输入维度名称');
      return;
    }
    if (isNaN(weight) || weight < 0) {
      toast.error('请输入有效的维度权重分');
      return;
    }
    setIndicators((prev: AdjustIndicatorInput[]) => [
      ...prev,
      {
        ...EMPTY_INDICATOR,
        weight,
        dimensionName: name,
        dimensionWeight: weight,
      },
    ]);
    setAddingDimension(false);
    setNewDimName('');
    setNewDimWeight('');
  };

  const handleCancelAddDimension = (): void => {
    setAddingDimension(false);
    setNewDimName('');
    setNewDimWeight('');
  };

  const handleCopyTemplate = (): void => {
    if (!employee) return;
    loadIndicators(employee.employeeId);
    toast.success('已重新加载绩效指标');
  };

  const handleSubmit = (): void => {
    if (!dimensionWeightValidation.isValid) {
      toast.error(
        `权重分总和必须等于 100，当前为 ${dimensionWeightValidation.totalWeight}`,
      );
      return;
    }
    if (!indicatorWeightValidation.isValid) {
      toast.error(
        `以下维度的权重分总和不等于维度权重分：${indicatorWeightValidation.errors.map((e) => e.dimensionName).join('、')}`,
      );
      return;
    }
    onSubmit(indicators);
  };

  const handleDeleteSnapshot = (): void => {
    onDeleteSnapshot();
  };

  const renderPreviewGroup = (
    group: DimensionGroup,
    groupIdx: number,
  ): React.ReactNode => (
    <Card key={groupIdx}>
      <CardHeader className="pb-2 bg-muted">
        <div className="flex items-center gap-3">
          <h3 className="text-base font-semibold">
            {group.dimensionName || '未分组'}
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
                <TableHead className="w-[20%] text-xs">指标</TableHead>
                <TableHead className="w-[30%] text-xs hidden md:table-cell">
                  说明
                </TableHead>
                <TableHead className="w-[20%] text-xs hidden lg:table-cell">
                  算法/描述
                </TableHead>
                <TableHead className="w-[18%] text-xs hidden lg:table-cell">
                  数据来源
                </TableHead>
                <TableHead className="text-center w-[12%] text-xs">
                  权重分
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {group.indicators.map(
                (ind: AdjustIndicatorInput, idx: number) => (
                  <TableRow key={idx}>
                    <TableCell className="text-xs whitespace-pre-wrap break-words">
                      {ind.content || '-'}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground hidden md:table-cell whitespace-pre-wrap break-words">
                      {ind.description || '-'}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground hidden lg:table-cell whitespace-pre-wrap break-words">
                      {ind.algorithm || '-'}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground hidden lg:table-cell whitespace-pre-wrap break-words">
                      {ind.dataSource || '-'}
                    </TableCell>
                    <TableCell className="text-xs text-center">
                      {ind.weight}
                    </TableCell>
                  </TableRow>
                ),
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );

  const renderEditGroup = (
    group: DimensionGroup,
    groupIdx: number,
  ): React.ReactNode => {
    const indicatorSum: number = group.indicators.reduce(
      (sum: number, ind: AdjustIndicatorInput) => sum + (ind.weight ?? 0),
      0,
    );
    const mismatch: boolean =
      Math.abs(indicatorSum - group.dimensionWeight) > 0.01;

    return (
      <Card key={groupIdx}>
        <CardHeader className="pb-2 bg-muted">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground shrink-0">
              维度 {groupIdx + 1}：
            </span>
            <Input
              value={group.dimensionName}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                handleDimensionChange(group, 'dimensionName', e.target.value)
              }
              className="flex-1 text-sm font-semibold h-8"
              placeholder="维度名称"
            />
            <span className="text-xs text-muted-foreground shrink-0">
              权重分
            </span>
            <Input
              type="number"
              value={group.dimensionWeight}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                handleDimensionChange(
                  group,
                  'dimensionWeight',
                  Number(e.target.value),
                )
              }
              className="w-20 h-8 text-center text-sm"
            />
            <span className="text-xs text-muted-foreground">%</span>
            <Button
              variant="ghost"
              size="icon"
              className="text-destructive"
              onClick={() => handleRemoveDimension(group)}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {mismatch && (
            <Alert variant="destructive" className="mb-3">
              <AlertTriangle className="size-4" />
              <AlertDescription>
                权重分总和({indicatorSum})不等于维度权重分(
                {group.dimensionWeight})
              </AlertDescription>
            </Alert>
          )}
          <Table className="table-fixed w-full">
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="w-[20%] text-[11px]">
                  指标 <span className="text-destructive">*</span>
                </TableHead>
                <TableHead className="w-[30%] hidden md:table-cell text-[11px]">
                  说明
                </TableHead>
                <TableHead className="w-[20%] hidden lg:table-cell text-[11px]">
                  算法/描述
                </TableHead>
                <TableHead className="w-[18%] hidden lg:table-cell text-[11px]">
                  数据来源
                </TableHead>
                <TableHead className="text-center w-[12%] text-[11px]">
                  权重分
                </TableHead>
                <TableHead className="w-[0%] text-xs" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {group.indicators.map(
                (ind: AdjustIndicatorInput, idx: number) => {
                  const flatIndex: number = group.flatIndices[idx];
                  return (
                    <TableRow key={flatIndex}>
                      <TableCell className="p-1">
                        <Textarea
                          className="text-xs min-h-[32px] resize-none"
                          rows={2}
                          placeholder="指标名称"
                          value={ind.content}
                          onChange={(
                            e: React.ChangeEvent<HTMLTextAreaElement>,
                          ) =>
                            handleIndicatorChange(
                              flatIndex,
                              'content',
                              e.target.value,
                            )
                          }
                        />
                      </TableCell>
                      <TableCell className="p-1 hidden md:table-cell">
                        <Textarea
                          className="text-xs min-h-[32px] resize-none"
                          rows={2}
                          placeholder="说明"
                          value={ind.description}
                          onChange={(
                            e: React.ChangeEvent<HTMLTextAreaElement>,
                          ) =>
                            handleIndicatorChange(
                              flatIndex,
                              'description',
                              e.target.value,
                            )
                          }
                        />
                      </TableCell>
                      <TableCell className="p-1 hidden lg:table-cell">
                        <Textarea
                          className="text-xs min-h-[32px] resize-none"
                          rows={2}
                          placeholder="算法"
                          value={ind.algorithm}
                          onChange={(
                            e: React.ChangeEvent<HTMLTextAreaElement>,
                          ) =>
                            handleIndicatorChange(
                              flatIndex,
                              'algorithm',
                              e.target.value,
                            )
                          }
                        />
                      </TableCell>
                      <TableCell className="p-1 hidden lg:table-cell">
                        <Input
                          className="h-8 text-xs"
                          placeholder="数据来源"
                          value={ind.dataSource}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                            handleIndicatorChange(
                              flatIndex,
                              'dataSource',
                              e.target.value,
                            )
                          }
                        />
                      </TableCell>
                      <TableCell className="p-1 text-center">
                        <Input
                          type="number"
                          min="0"
                          className="h-8 w-20 text-xs text-center mx-auto"
                          placeholder="0"
                          value={ind.weight}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                            handleIndicatorChange(
                              flatIndex,
                              'weight',
                              Number(e.target.value),
                            )
                          }
                        />
                      </TableCell>
                      <TableCell className="p-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive size-7"
                          onClick={() => handleRemoveIndicator(flatIndex)}
                        >
                          <Trash2 className="size-3" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                },
              )}
            </TableBody>
          </Table>
          <div className="flex items-center justify-between mt-2">
            <span
              className={`text-xs font-medium ${!mismatch ? 'text-success' : 'text-destructive'}`}
            >
              权重分总和：{indicatorSum} / {group.dimensionWeight}
              {mismatch && ' （必须等于维度权重分）'}
            </span>
            <Button
              size="sm"
              onClick={() =>
                handleAddIndicator(group.dimensionName, group.dimensionWeight)
              }
            >
              <Plus className="size-3 mr-1" />
              添加指标
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  };

  const renderAddDimensionForm = (): React.ReactNode => (
    <Card className="border-dashed">
      <CardContent className="pt-6">
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <FolderPlus className="size-4 text-muted-foreground" />
            <span className="text-sm font-medium">新增维度</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <label className="text-xs text-muted-foreground">维度名称</label>
              <Input
                value={newDimName}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setNewDimName(e.target.value)
                }
                placeholder="请输入维度名称"
                autoFocus
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-xs text-muted-foreground">权重分</label>
              <Input
                type="number"
                value={newDimWeight}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setNewDimWeight(e.target.value)
                }
                placeholder="0"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCancelAddDimension}
            >
              <X className="size-3.5 mr-1" />
              取消
            </Button>
            <Button size="sm" onClick={handleConfirmAddDimension}>
              <Check className="size-3.5 mr-1" />
              确认
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {employee
              ? `${employee.employeeName} · ${employee.templateName}`
              : '调整绩效指标'}
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <Button
            variant={previewMode ? 'outline' : 'secondary'}
            size="sm"
            onClick={() => setPreviewMode(false)}
          >
            <Pencil className="size-3.5" />
            编辑模式
          </Button>
          <Button
            variant={!previewMode ? 'outline' : 'secondary'}
            size="sm"
            onClick={() => setPreviewMode(true)}
          >
            <Eye className="size-3.5" />
            预览模式
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCopyTemplate}
            disabled={loadingIndicators}
          >
            <Copy className="size-3.5" />
            重新加载指标
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDeleteSnapshot}
            className="text-destructive"
          >
            <Trash2 className="size-3.5" />
            删除快照
          </Button>
        </div>

        {loadingIndicators ? (
          <div className="flex items-center justify-center py-12">
            <Spinner className="size-6" />
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {!dimensionWeightValidation.isValid &&
              dimensionGroups.length > 0 && (
                <Alert variant="destructive">
                  <AlertTriangle className="size-4" />
                  <AlertDescription>
                    权重分总和应为 100，当前为{' '}
                    {dimensionWeightValidation.totalWeight}，请检查权重分配
                  </AlertDescription>
                </Alert>
              )}

            {dimensionGroups.length === 0 && !addingDimension ? (
              <div className="flex flex-col items-center justify-center py-12 gap-4">
                <Empty>
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <FolderPlus className="size-6" />
                    </EmptyMedia>
                    <EmptyTitle>暂无指标数据</EmptyTitle>
                  </EmptyHeader>
                </Empty>
                {!previewMode && (
                  <Button
                    variant="outline"
                    onClick={() => setAddingDimension(true)}
                  >
                    <FolderPlus className="size-4 mr-2" />
                    添加维度
                  </Button>
                )}
              </div>
            ) : (
              <>
                {dimensionGroups.map(
                  (group: DimensionGroup, groupIdx: number) =>
                    previewMode
                      ? renderPreviewGroup(group, groupIdx)
                      : renderEditGroup(group, groupIdx),
                )}

                {!previewMode &&
                  (addingDimension ? (
                    renderAddDimensionForm()
                  ) : (
                    <Button
                      variant="outline"
                      className="w-full border-dashed"
                      onClick={() => setAddingDimension(true)}
                    >
                      <FolderPlus className="size-4 mr-2" />
                      添加维度
                    </Button>
                  ))}
              </>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={loading}
              >
                取消
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={
                  loading ||
                  previewMode ||
                  !dimensionWeightValidation.isValid ||
                  !indicatorWeightValidation.isValid
                }
              >
                {loading && <Spinner className="mr-2 size-4" />}
                确认调整
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default AdjustIndicatorsDialog;
