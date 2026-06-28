import { CheckCircle2, AlertTriangle } from 'lucide-react';
import type { CoverageResult } from './useGradeConfig';

interface CoverageBannerProps {
  coverage: CoverageResult;
}

export function CoverageBanner({ coverage }: CoverageBannerProps) {
  return (
    <div
      className={`flex items-start gap-3 rounded-lg border px-4 py-3 ${
        coverage.covered
          ? 'border-emerald-200 bg-emerald-50'
          : 'border-amber-200 bg-amber-50'
      }`}
      data-ai-section-type="card-stat"
    >
      {coverage.covered ? (
        <CheckCircle2 className="size-5 shrink-0 text-emerald-600 mt-0.5" />
      ) : (
        <AlertTriangle className="size-5 shrink-0 text-amber-600 mt-0.5" />
      )}
      <div className="text-sm">
        <p
          className={`font-medium ${
            coverage.covered ? 'text-emerald-800' : 'text-amber-800'
          }`}
        >
          {coverage.covered ? '配置覆盖正常' : '配置覆盖异常'}
        </p>
        <p className={coverage.covered ? 'text-emerald-700' : 'text-amber-700'}>
          {coverage.message}
        </p>
      </div>
    </div>
  );
}
