import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { UserDisplay } from '@/components/business-ui/user-display';
import type { AssessmentInstanceDetail } from '@shared/api.interface';

const STATUS_LABELS: Record<string, string> = {
  self_review: '待自评',
  supervisor_review: '待上级评分',
  pending_sign: '待签名',
  completed: '已完成',
};

const STATUS_VARIANTS: Record<
  string,
  'default' | 'secondary' | 'outline' | 'destructive'
> = {
  self_review: 'default',
  supervisor_review: 'secondary',
  pending_sign: 'outline',
  completed: 'outline',
};

interface AssessmentHeaderCardProps {
  detail: AssessmentInstanceDetail;
  previewScore?: number | null;
  previewGrade?: string | null;
  gradeStyleMap?: Record<string, string>;
}

function getGradeStyle(
  grade: string | undefined | null,
  styleMap?: Record<string, string>,
): string {
  if (!grade) return '';
  if (styleMap?.[grade]) return styleMap[grade];
  return 'bg-muted text-muted-foreground';
}

const AssessmentHeaderCard: React.FC<AssessmentHeaderCardProps> = ({
  detail,
  previewScore,
  previewGrade,
  gradeStyleMap,
}) => {
  const hasFinalScore = detail.totalScore != null;
  const showPreview = !hasFinalScore && previewScore != null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-xl font-semibold">{detail.period}</h2>
              <Badge variant={STATUS_VARIANTS[detail.status]}>
                {STATUS_LABELS[detail.status] || detail.status}
              </Badge>
            </div>
          </div>
          {hasFinalScore && (
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-sm text-muted-foreground">总分</p>
                <p className="text-2xl font-bold text-primary">
                  {detail.totalScore}
                </p>
              </div>
              {detail.grade && (
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">等级</p>
                  <span
                    className={`inline-block px-3 py-1 rounded-md text-lg font-bold ${getGradeStyle(detail.grade, gradeStyleMap)}`}
                  >
                    {detail.grade}
                  </span>
                </div>
              )}
              {detail.coefficient && (
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">系数</p>
                  <p className="text-xl font-bold text-primary">
                    {detail.coefficient}
                  </p>
                </div>
              )}
            </div>
          )}
          {showPreview && (
            <div className="flex items-center gap-4 rounded-md bg-muted px-4 py-2">
              <div className="text-right">
                <p className="text-sm text-muted-foreground">预览总分</p>
                <p className="text-2xl font-bold text-muted-foreground">
                  {previewScore}
                </p>
              </div>
              {previewGrade && (
                <div className="flex flex-col items-center gap-0.5">
                  <span
                    className={`px-3 py-1 rounded-md text-lg font-bold ${getGradeStyle(previewGrade, gradeStyleMap)}`}
                  >
                    {previewGrade}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    仅供参考
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-sm text-muted-foreground">员工</p>
            <UserDisplay userId={detail.employeeId} size="medium" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">岗位</p>
            <p className="text-sm font-medium">{detail.position}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">上级</p>
            {detail.supervisorId ? (
              <UserDisplay userId={detail.supervisorId} size="medium" />
            ) : (
              <p className="text-sm text-muted-foreground">-</p>
            )}
          </div>
          <div>
            <p className="text-sm text-muted-foreground">签名状态</p>
            <div className="text-sm flex flex-col gap-0.5 mt-0.5">
              <p>
                本人：
                {detail.selfSignName ? (
                  <span className="font-medium">
                    {detail.selfSignImage && (
                      <img
                        src={detail.selfSignImage}
                        alt="本人签名"
                        className="inline-block max-h-10 align-middle"
                      />
                    )}
                    {detail.selfSignName}{' '}
                    {detail.selfSignAt
                      ? new Date(detail.selfSignAt).toLocaleDateString('zh-CN')
                      : ''}
                  </span>
                ) : (
                  <span className="text-muted-foreground">未签</span>
                )}
              </p>
              <p>
                上级：
                {detail.supervisorSignName ? (
                  <span className="font-medium">
                    {detail.supervisorSignImage && (
                      <img
                        src={detail.supervisorSignImage}
                        alt="上级签名"
                        className="inline-block max-h-10 align-middle"
                      />
                    )}
                    {detail.supervisorSignName}{' '}
                    {detail.supervisorSignAt
                      ? new Date(detail.supervisorSignAt).toLocaleDateString(
                          'zh-CN',
                        )
                      : ''}
                  </span>
                ) : (
                  <span className="text-muted-foreground">未签</span>
                )}
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default AssessmentHeaderCard;
