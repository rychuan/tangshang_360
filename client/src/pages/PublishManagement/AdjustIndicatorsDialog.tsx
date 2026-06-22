import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { logger } from '@lark-apaas/client-toolkit/logger';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Eye, Pencil, Copy, Trash2, Plus, AlertTriangle } from 'lucide-react';
import { getEmployeeSnapshot } from '@/api/assessment-publish';
import type { AdjustIndicatorInput, InstanceIndicatorItem } from '@shared/api.interface';

interface AdjustIndicatorsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employee: { employeeId: string; employeeName: string; templateName: string } | null;
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
  weight: 100,
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

  const loadIndicators = useCallback(async (employeeId: string): Promise<void> => {
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
  }, []);

  useEffect(() => {
    if (open && employee?.employeeId) {
      setPreviewMode(false);
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

  const dimensionWeightValidation = useMemo(() => {
    const totalWeight: number = dimensionGroups.reduce(
      (sum: number, g) => sum + g.dimensionWeight,
      0,
    );
    return {
      totalWeight,
      isValid: Math.abs(totalWeight - 100) < 0.01,
    };
  }, [dimensionGroups]);

  const handleAddIndicator = (dimensionName: string, dimensionWeight: number): void => {
    setIndicators((prev: AdjustIndicatorInput[]) => [
      ...prev,
      { ...EMPTY_INDICATOR, dimensionName, dimensionWeight },
    ]);
  };

  const handleRemoveIndicator = (flatIndex: number): void => {
    setIndicators((prev: AdjustIndicatorInput[]) =>
      prev.filter((_: AdjustIndicatorInput, i: number) => i !== flatIndex),
    );
  };

  const handleIndicatorChange = (flatIndex: number, field: keyof AdjustIndicatorInput, value: string | number): void => {
    setIndicators((prev: AdjustIndicatorInput[]) => {
      const next: AdjustIndicatorInput[] = [...prev];
      next[flatIndex] = { ...next[flatIndex], [field]: value };
      return next;
    });
  };

  const handleCopyTemplate = (): void => {
    if (!employee) return;
    loadIndicators(employee.employeeId);
    toast.success('已重新加载考核指标');
  };

  const handleSubmit = (): void => {
    onSubmit(indicators);
  };

  const handleDeleteSnapshot = (): void => {
    onDeleteSnapshot();
  };

  const renderPreviewGroup = (group: DimensionGroup, groupIdx: number): React.ReactNode => (
    <Card key={groupIdx}>
      <CardHeader>
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold">
            {group.dimensionName || '未分组'}
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
                <th className="text-left py-3 px-2 font-medium whitespace-nowrap">指标</th>
                <th className="text-left py-3 px-2 font-medium whitespace-nowrap max-w-[120px]">说明</th>
                <th className="text-left py-3 px-2 font-medium whitespace-nowrap max-w-[120px]">指标算法/描述</th>
                <th className="text-left py-3 px-2 font-medium whitespace-nowrap max-w-[120px]">数据来源</th>
                <th className="text-center py-3 px-2 font-medium w-16">权重(分)</th>
              </tr>
            </thead>
            <tbody>
              {group.indicators.map((ind: AdjustIndicatorInput, idx: number) => (
                <tr key={idx} className="border-b last:border-0">
                  <td className="py-2 px-2 font-medium whitespace-nowrap">{ind.content || '-'}</td>
                  <td className="py-2 px-2 text-muted-foreground max-w-[120px] break-words">{ind.description || '-'}</td>
                  <td className="py-2 px-2 text-muted-foreground max-w-[120px] break-words">{ind.algorithm || '-'}</td>
                  <td className="py-2 px-2 text-muted-foreground max-w-[120px] break-words">{ind.dataSource || '-'}</td>
                  <td className="py-2 px-2 text-center">{ind.weight}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );

  const renderEditGroup = (group: DimensionGroup, groupIdx: number): React.ReactNode => (
    <Card key={groupIdx}>
      <CardHeader>
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold">
            {group.dimensionName || '未分组'}
          </h3>
          <span className="inline-flex items-center px-3 py-1 rounded-md bg-primary/10 text-primary text-sm font-bold border border-primary/20">
            权重 {group.dimensionWeight}%
          </span>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {group.indicators.map((ind: AdjustIndicatorInput, idx: number) => {
          const flatIndex: number = group.flatIndices[idx];
          return (
            <div key={flatIndex} className="rounded-md border p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">
                  指标 {idx + 1}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRemoveIndicator(flatIndex)}
                >
                  <Trash2 className="size-3.5 mr-1" />
                  删除
                </Button>
              </div>
              <div className="flex flex-col gap-2">
                <Label className="text-xs">指标内容</Label>
                <Input
                  value={ind.content}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    handleIndicatorChange(flatIndex, 'content', e.target.value)
                  }
                  placeholder="指标内容"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label className="text-xs">描述</Label>
                <Input
                  value={ind.description}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    handleIndicatorChange(flatIndex, 'description', e.target.value)
                  }
                  placeholder="指标描述"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-2">
                  <Label className="text-xs">算法</Label>
                  <Input
                    value={ind.algorithm}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      handleIndicatorChange(flatIndex, 'algorithm', e.target.value)
                    }
                    placeholder="评分算法"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label className="text-xs">数据来源</Label>
                  <Input
                    value={ind.dataSource}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      handleIndicatorChange(flatIndex, 'dataSource', e.target.value)
                    }
                    placeholder="数据来源"
                  />
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Label className="text-xs">最高分</Label>
                <Input
                  type="number"
                  value={ind.weight}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    handleIndicatorChange(flatIndex, 'weight', Number(e.target.value))
                  }
                  placeholder="100"
                />
              </div>
            </div>
          );
        })}
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => handleAddIndicator(group.dimensionName, group.dimensionWeight)}
        >
          <Plus className="size-3.5 mr-1" />
          添加指标
        </Button>
      </CardContent>
    </Card>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            调整考核指标
            {employee && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                {employee.employeeName} · {employee.templateName}
              </span>
            )}
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
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            加载中...
          </div>
        ) : indicators.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            暂无指标数据
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {!dimensionWeightValidation.isValid && (
              <Alert variant="destructive">
                <AlertTriangle className="size-4" />
                <AlertDescription>
                  维度权重之和应为 100%，当前为 {dimensionWeightValidation.totalWeight}%，请检查模板配置
                </AlertDescription>
              </Alert>
            )}
            {dimensionGroups.map((group: DimensionGroup, groupIdx: number) =>
              previewMode
                ? renderPreviewGroup(group, groupIdx)
                : renderEditGroup(group, groupIdx),
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
                data-ai-section-type="button"
                onClick={handleSubmit}
                disabled={loading || previewMode}
              >
                {loading ? '调整中...' : '确认调整'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default AdjustIndicatorsDialog;
