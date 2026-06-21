import React, { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { logger } from '@lark-apaas/client-toolkit/logger';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Eye, Pencil, Copy } from 'lucide-react';
import { getInstanceIndicators } from '@/api/assessment-publish';
import type { AssessmentInstanceItem, AdjustIndicatorInput, InstanceIndicatorItem } from '@shared/api.interface';

interface AdjustIndicatorsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  instance: AssessmentInstanceItem | null;
  onSubmit: (indicators: AdjustIndicatorInput[]) => void;
  loading: boolean;
}

const EMPTY_INDICATOR: AdjustIndicatorInput = { content: '', description: '', algorithm: '', dataSource: '', maxScore: 100 };

const AdjustIndicatorsDialog: React.FC<AdjustIndicatorsDialogProps> = ({
  open,
  onOpenChange,
  instance,
  onSubmit,
  loading,
}) => {
  const [indicators, setIndicators] = useState<AdjustIndicatorInput[]>([]);
  const [previewMode, setPreviewMode] = useState<boolean>(false);
  const [loadingIndicators, setLoadingIndicators] = useState<boolean>(false);

  const loadIndicators = useCallback(async (instanceId: string): Promise<void> => {
    setLoadingIndicators(true);
    try {
      const res = await getInstanceIndicators(instanceId);
      if (res.indicators.length > 0) {
        setIndicators(
          res.indicators.map((ind: InstanceIndicatorItem) => ({
            content: ind.content,
            description: ind.description,
            algorithm: ind.algorithm,
            dataSource: ind.dataSource,
            maxScore: ind.maxScore,
            dimensionName: ind.dimensionName,
            dimensionWeight: ind.dimensionWeight,
          })),
        );
      } else {
        setIndicators([{ ...EMPTY_INDICATOR }]);
      }
    } catch (err: unknown) {
      logger.error('loadIndicators failed', err);
      toast.error('加载现有指标失败');
      setIndicators([{ ...EMPTY_INDICATOR }]);
    } finally {
      setLoadingIndicators(false);
    }
  }, []);

  useEffect(() => {
    if (open && instance) {
      setPreviewMode(false);
      loadIndicators(instance.id);
    }
  }, [open, instance, loadIndicators]);

  const handleAddIndicator = (): void => {
    setIndicators((prev: AdjustIndicatorInput[]) => [...prev, { ...EMPTY_INDICATOR }]);
  };

  const handleRemoveIndicator = (index: number): void => {
    setIndicators((prev: AdjustIndicatorInput[]) =>
      prev.filter((_: AdjustIndicatorInput, i: number) => i !== index),
    );
  };

  const handleIndicatorChange = (index: number, field: keyof AdjustIndicatorInput, value: string | number): void => {
    setIndicators((prev: AdjustIndicatorInput[]) => {
      const next: AdjustIndicatorInput[] = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const handleCopyTemplate = (): void => {
    if (!instance) return;
    loadIndicators(instance.id);
    toast.success('已重新加载考核指标');
  };

  const handleSubmit = (): void => {
    onSubmit(indicators);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>调整考核指标</DialogTitle>
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
            {indicators.map(
              (ind: AdjustIndicatorInput, index: number) => (
                <div
                  key={index}
                  className="rounded-md border p-4 flex flex-col gap-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">
                      指标 {index + 1}
                      {ind.dimensionName && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          ({ind.dimensionName}
                          {ind.dimensionWeight != null
                            ? ` · 权重${Math.round(ind.dimensionWeight * 100)}%`
                            : ''}
                          )
                        </span>
                      )}
                    </span>
                    {!previewMode && indicators.length > 1 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveIndicator(index)}
                      >
                        删除
                      </Button>
                    )}
                  </div>

                  {previewMode ? (
                    <div className="flex flex-col gap-2 text-sm">
                      <div>
                        <span className="text-muted-foreground">指标内容：</span>
                        <span>{ind.content || '-'}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">描述：</span>
                        <span>{ind.description || '-'}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">算法：</span>
                        <span>{ind.algorithm || '-'}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">数据来源：</span>
                        <span>{ind.dataSource || '-'}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">最高分：</span>
                        <span className="font-medium">{ind.maxScore}</span>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex flex-col gap-2">
                        <Label className="text-xs">指标内容</Label>
                        <Input
                          value={ind.content}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                            handleIndicatorChange(index, 'content', e.target.value)
                          }
                          placeholder="指标内容"
                        />
                      </div>
                      <div className="flex flex-col gap-2">
                        <Label className="text-xs">描述</Label>
                        <Input
                          value={ind.description}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                            handleIndicatorChange(index, 'description', e.target.value)
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
                              handleIndicatorChange(index, 'algorithm', e.target.value)
                            }
                            placeholder="评分算法"
                          />
                        </div>
                        <div className="flex flex-col gap-2">
                          <Label className="text-xs">数据来源</Label>
                          <Input
                            value={ind.dataSource}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                              handleIndicatorChange(index, 'dataSource', e.target.value)
                            }
                            placeholder="数据来源"
                          />
                        </div>
                      </div>
                      <div className="flex flex-col gap-2">
                        <Label className="text-xs">最高分</Label>
                        <Input
                          type="number"
                          value={ind.maxScore}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                            handleIndicatorChange(
                              index,
                              'maxScore',
                              Number(e.target.value),
                            )
                          }
                          placeholder="100"
                        />
                      </div>
                    </>
                  )}
                </div>
              ),
            )}

            {!previewMode && (
              <Button
                variant="outline"
                className="w-full"
                onClick={handleAddIndicator}
              >
                添加指标
              </Button>
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
