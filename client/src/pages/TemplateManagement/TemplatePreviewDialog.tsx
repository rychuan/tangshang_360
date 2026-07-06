import React from 'react';
import type {
  AssessmentIndicatorDef,
  AssessmentDimensionDef,
  AssessmentTemplateDetail,
} from '@shared/api.interface';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@client/src/components/ui/dialog';
import { Badge } from '@client/src/components/ui/badge';
import { Card, CardContent, CardHeader } from '@client/src/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@client/src/components/ui/table';

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
      <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{template.name}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">{template.position}</Badge>
            <Badge variant="outline">
              {template.type === 'monthly' ? '月度绩效' : '试用期绩效'}
            </Badge>
            <Badge variant={template.isActive ? 'default' : 'secondary'}>
              {template.isActive ? '启用' : '已停用'}
            </Badge>
          </div>

          {template.dimensions.map(
            (dim: AssessmentDimensionDef, dimIdx: number) => (
              <Card key={dim.id || dimIdx}>
                <CardHeader className="pb-2 bg-muted">
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-semibold">{dim.name}</h3>
                    <Badge variant="secondary" className="text-xs">
                      权重分 {dim.weight}%
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <Table className="table-fixed w-full">
                    <TableHeader>
                      <TableRow className="bg-muted/30">
                        <TableHead className="w-[25%] text-xs">指标</TableHead>
                        <TableHead className="w-[20%] text-xs hidden md:table-cell">
                          说明
                        </TableHead>
                        <TableHead className="w-[22%] text-xs hidden lg:table-cell">
                          算法/描述
                        </TableHead>
                        <TableHead className="w-[20%] text-xs hidden lg:table-cell">
                          数据来源
                        </TableHead>
                        <TableHead className="text-center w-[13%] text-xs">
                          权重分
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {dim.indicators.map(
                        (ind: AssessmentIndicatorDef, indIdx: number) => (
                          <TableRow key={ind.id || indIdx}>
                            <TableCell className="text-xs whitespace-pre-wrap break-words">
                              {ind.content}
                            </TableCell>
                            <TableCell className="text-muted-foreground text-xs whitespace-pre-wrap break-words hidden md:table-cell">
                              {ind.description || '-'}
                            </TableCell>
                            <TableCell className="text-muted-foreground text-xs whitespace-pre-wrap break-words hidden lg:table-cell">
                              {ind.algorithm || '-'}
                            </TableCell>
                            <TableCell className="text-muted-foreground text-xs whitespace-pre-wrap break-words hidden lg:table-cell">
                              {ind.dataSource || '-'}
                            </TableCell>
                            <TableCell className="text-center text-xs">
                              {ind.weight}
                            </TableCell>
                          </TableRow>
                        ),
                      )}
                    </TableBody>
                  </Table>
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
