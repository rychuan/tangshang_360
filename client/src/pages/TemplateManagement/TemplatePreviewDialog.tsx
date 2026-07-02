import React from 'react';
import type {
  AssessmentIndicatorDef,
  AssessmentDimensionDef,
  AssessmentTemplateDetail,
} from '@shared/api.interface';
import { Dialog, DialogContent } from '@client/src/components/ui/dialog';
import { Badge } from '@client/src/components/ui/badge';
import { Card, CardContent, CardHeader } from '@client/src/components/ui/card';

interface TemplatePreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: AssessmentTemplateDetail | null;
}

const TemplatePreviewDialog: React.FC<TemplatePreviewDialogProps> = ({
  open,
  onOpenChange,
  template,
}) => {
  if (!template) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <div className="flex flex-col gap-4">
          <div>
            <h2 className="text-lg font-semibold">{template.name}</h2>
            <div className="flex flex-wrap gap-2 mt-2">
              <Badge variant="secondary">{template.position}</Badge>
              <Badge variant="outline">
                {template.type === 'monthly' ? '月度绩效' : '试用期绩效'}
              </Badge>
              <Badge variant={template.isActive ? 'default' : 'secondary'}>
                {template.isActive ? '启用' : '已停用'}
              </Badge>
            </div>
          </div>

          {template.dimensions.map(
            (dim: AssessmentDimensionDef, dimIdx: number) => (
              <Card key={dim.id || dimIdx}>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-semibold">{dim.name}</h3>
                    <Badge variant="secondary">权重 {dim.weight}%</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-muted-foreground">
                          <th className="text-left py-3 px-2 font-medium text-muted-foreground w-1/4">
                            指标
                          </th>
                          <th className="text-left py-3 px-2 font-medium text-muted-foreground">
                            说明
                          </th>
                          <th className="text-left py-3 px-2 font-medium text-muted-foreground">
                            指标算法/描述
                          </th>
                          <th className="text-left py-3 px-2 font-medium text-muted-foreground">
                            数据来源
                          </th>
                          <th className="text-center py-3 px-2 font-medium text-muted-foreground w-20">
                            权重(分)
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {dim.indicators.map(
                          (ind: AssessmentIndicatorDef, indIdx: number) => (
                            <tr key={ind.id || indIdx} className="border-b">
                              <td className="py-3 px-2 font-medium">
                                {ind.content}
                              </td>
                              <td className="py-3 px-2 text-muted-foreground">
                                {ind.description || '-'}
                              </td>
                              <td className="py-3 px-2 text-muted-foreground">
                                {ind.algorithm || '-'}
                              </td>
                              <td className="py-3 px-2 text-muted-foreground">
                                {ind.dataSource || '-'}
                              </td>
                              <td className="py-3 px-2 text-center">
                                {ind.weight}
                              </td>
                            </tr>
                          ),
                        )}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            ),
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default TemplatePreviewDialog;
