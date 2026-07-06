import { CheckCircle2, AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import type { CoverageResult } from './useGradeConfig';

interface CoverageBannerProps {
  coverage: CoverageResult;
}

export function CoverageBanner({ coverage }: CoverageBannerProps) {
  return (
    <Alert
      variant={coverage.covered ? 'default' : 'destructive'}
      className={
        coverage.covered
          ? 'border-success/20 bg-success/10'
          : 'border-warning/20 bg-warning/10'
      }
      data-ai-section-type="card-stat"
    >
      {coverage.covered ? (
        <CheckCircle2 className="size-5 shrink-0 text-success mt-0.5" />
      ) : (
        <AlertTriangle className="size-5 shrink-0 text-warning mt-0.5" />
      )}
      <AlertTitle>
        {coverage.covered ? '配置覆盖正常' : '配置覆盖异常'}
      </AlertTitle>
      <AlertDescription>{coverage.message}</AlertDescription>
    </Alert>
  );
}
