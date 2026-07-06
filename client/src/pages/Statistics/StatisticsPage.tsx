import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  DownloadIcon,
  SearchIcon,
  BarChart3Icon,
  PieChartIcon,
  TrendingUpIcon,
  Eye,
  FileDown,
  Upload,
} from 'lucide-react';
import { logger } from '@lark-apaas/client-toolkit/logger';
import { toast } from 'sonner';
import { CanRole } from '@lark-apaas/client-toolkit/auth';
import { CanDo } from '@/hooks/usePermissions';
import { handleApiError } from '@/utils/api-error';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { detail as getAssessmentDetail } from '@/api/assessment-operation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ActionBadge } from '@/components/business-ui/action-badge';
import { PageHeader } from '@/components/business-ui/page-header';
import {
  StatusBadge,
  GradeBadge,
  ASSESSMENT_STATUS_LABELS,
} from '@/components/business-ui/status-badge';
import { UserSelect } from '@client/src/components/business-ui/user-select';
import MultiMonthPicker from '@/components/ui/multi-month-picker';
import MultiDepartmentTreeSelect from '@/components/ui/multi-department-tree-select';
import MultiSelect, {
  type MultiSelectOption,
} from '@/components/ui/multi-select';
import { Spinner } from '@/components/ui/spinner';
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import {
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
  PieChart,
  Pie,
  Cell,
  Area,
  AreaChart,
} from 'recharts';
import {
  getRecords,
  getCharts,
  exportData,
  type StatisticsRecordsParams,
  type StatisticsChartsParams,
} from '@/api/assessment-statistics';
import { exportPerformanceToBitable } from '@/api/bitable-sync';
import { getPositions } from '@/api/employee-management';
import { listActive } from '@/api/performance-grade';
import type {
  StatisticsRecordItem,
  ChartsResponse,
} from '@shared/api.interface';

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const DEFAULT_GRADE_OPTIONS: MultiSelectOption[] = [
  { label: 'S', value: 'S' },
  { label: 'A', value: 'A' },
  { label: 'B', value: 'B' },
  { label: 'C', value: 'C' },
  { label: 'D', value: 'D' },
];

const CHART_COLORS = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
];

interface FilterState {
  periods: string[];
  departments: string[];
  positions: string[];
  grades: string[];
  employeeIds: string[];
}

const chartConfig = {
  count: { label: '人数', color: 'hsl(var(--chart-1))' },
  score: { label: '平均分', color: 'hsl(var(--chart-2))' },
  avgScore: { label: '平均分', color: 'hsl(var(--chart-3))' },
};

const StatisticsPage: React.FC = () => {
  const [filters, setFilters] = useState<FilterState>({
    periods: [currentMonth()],
    departments: [],
    positions: [],
    grades: [],
    employeeIds: [],
  });
  const [positionOptions, setPositionOptions] = useState<MultiSelectOption[]>(
    [],
  );
  const [records, setRecords] = useState<StatisticsRecordItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [loading, setLoading] = useState(false);
  const [charts, setCharts] = useState<ChartsResponse | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportingPdfId, setExportingPdfId] = useState<string | null>(null);
  const [syncingOut, setSyncingOut] = useState(false);
  const [gradeSelectOptions, setGradeSelectOptions] = useState<
    MultiSelectOption[]
  >(DEFAULT_GRADE_OPTIONS);
  const navigate = useNavigate();
  const pdfRef = useRef<HTMLDivElement>(null);

  const buildParams = useCallback(
    (p: number): StatisticsRecordsParams => ({
      page: p,
      pageSize,
      periods: filters.periods.length > 0 ? filters.periods : undefined,
      departments:
        filters.departments.length > 0 ? filters.departments : undefined,
      positions: filters.positions.length > 0 ? filters.positions : undefined,
      grades: filters.grades.length > 0 ? filters.grades : undefined,
      employeeIds:
        filters.employeeIds.length > 0 ? filters.employeeIds : undefined,
    }),
    [filters, pageSize],
  );

  const loadRecords = useCallback(async () => {
    try {
      setLoading(true);
      const res = await getRecords(buildParams(page));
      setRecords(res?.items ?? []);
      setTotal(res.total);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '加载失败';
      logger.error(`Statistics records load error: ${msg}`);
      handleApiError(e);
    } finally {
      setLoading(false);
    }
  }, [buildParams, page]);

  const loadCharts = useCallback(async () => {
    try {
      const chartParams: StatisticsChartsParams = {
        periods: filters.periods.length > 0 ? filters.periods : undefined,
        departments:
          filters.departments.length > 0 ? filters.departments : undefined,
        positions: filters.positions.length > 0 ? filters.positions : undefined,
        grades: filters.grades.length > 0 ? filters.grades : undefined,
      };
      const res = await getCharts(chartParams);
      setCharts(res);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '加载图表失败';
      logger.error(`Statistics charts load error: ${msg}`);
    }
  }, [filters.periods, filters.departments, filters.positions, filters.grades]);

  useEffect(() => {
    loadRecords();
  }, [loadRecords]);
  useEffect(() => {
    loadCharts();
  }, [loadCharts]);

  useEffect(() => {
    getPositions()
      .then((res: { positions: string[] }) => {
        setPositionOptions(
          res.positions.map((p: string) => ({ label: p, value: p })),
        );
      })
      .catch((err: unknown) =>
        logger.error('Failed to load positions', err as Error),
      );
  }, []);

  // 从等级配置同步等级筛选选项
  useEffect(() => {
    listActive()
      .then((res) => {
        if (res?.rules?.length) {
          const names = [...new Set(res.rules.map((r) => r.name))];
          setGradeSelectOptions(names.map((n) => ({ label: n, value: n })));
        }
      })
      .catch(() => {
        // 非关键数据，加载失败使用默认选项
      });
  }, []);

  const handleSyncToBitable = async () => {
    try {
      setSyncingOut(true);
      const res = await exportPerformanceToBitable();
      toast.success(res.message);
      loadRecords();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '同步到多维表格失败';
      logger.error(`Sync to bitable error: ${msg}`);
      handleApiError(e);
    } finally {
      setSyncingOut(false);
    }
  };

  const handleSearch = () => setPage(1);

  const handleExport = async () => {
    try {
      setExporting(true);
      const data = await exportData({
        periods: filters.periods.length > 0 ? filters.periods : undefined,
        departments:
          filters.departments.length > 0 ? filters.departments : undefined,
        positions: filters.positions.length > 0 ? filters.positions : undefined,
        grades: filters.grades.length > 0 ? filters.grades : undefined,
        employeeIds:
          filters.employeeIds.length > 0 ? filters.employeeIds : undefined,
      });
      if (data.length === 0) {
        toast.warning('没有可导出的数据');
        return;
      }
      const ws = XLSX.utils.json_to_sheet(
        data.map((r: StatisticsRecordItem) => ({
          绩效周期: r.period,
          员工姓名: r.employeeName,
          部门: r.department,
          岗位: r.position,
          上级: r.supervisorName,
          总分: r.totalScore,
          等级: r.grade,
          状态: ASSESSMENT_STATUS_LABELS[r.status] || r.status,
          完成时间: r.completedAt || '',
        })),
      );
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, '绩效记录');
      XLSX.writeFile(wb, '绩效记录导出.xlsx');
      toast.success(`导出成功，共 ${data.length} 条记录`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '导出失败';
      logger.error(`Export error: ${msg}`);
      handleApiError(e);
    } finally {
      setExporting(false);
    }
  };

  const handleExportPdf = async (
    id: string,
    employeeName: string,
    period: string,
  ) => {
    const pdfEl = pdfRef.current;
    if (!pdfEl) return;

    try {
      setExportingPdfId(id);
      const detail = await getAssessmentDetail(id);

      // Build group data
      const groupMap = new Map<
        string,
        {
          dimensionName: string;
          dimensionWeight: number;
          indicators: typeof detail.indicators;
        }
      >();
      for (const ind of detail.indicators) {
        if (!groupMap.has(ind.dimensionName)) {
          groupMap.set(ind.dimensionName, {
            dimensionName: ind.dimensionName,
            dimensionWeight: ind.dimensionWeight,
            indicators: [],
          });
        }
        groupMap.get(ind.dimensionName)!.indicators.push(ind);
      }
      const groups = Array.from(groupMap.values());

      // Build raw HTML with inline hex colors (avoids html2canvas oklch parsing error)
      const statusLabel: string =
        ASSESSMENT_STATUS_LABELS[detail.status] || detail.status;

      // Status helpers for process stepper
      const selfDone = detail.status !== 'self_review';
      const supDone =
        detail.status === 'pending_sign' || detail.status === 'completed';
      const selfSignDone = !!detail.selfSignName;
      const supSignDone =
        !!detail.supervisorSignName || detail.status === 'completed';

      const stepperHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;margin-top:12px;padding:10px 8px;border:1px solid #e5e7eb;border-radius:8px;font-size:11px;">
          ${[
            { label: '员工自评', done: selfDone },
            { label: '上级评分', done: supDone },
            { label: '员工签名', done: selfSignDone },
            { label: '上级签名', done: supSignDone },
          ]
            .map(
              (s, i) => `
            <div style="display:flex;align-items:center;flex:1;min-width:0;">
              <div style="display:flex;flex-direction:column;align-items:center;width:100%;">
                <div style="width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;${
                  s.done
                    ? 'background:#16a34a;color:#fff;'
                    : 'background:#e5e7eb;color:#9ca3af;'
                }">${s.done ? '✓' : i + 1}</div>
                <span style="margin-top:4px;font-weight:${s.done ? '600' : '400'};color:${s.done ? '#111' : '#9ca3af'};">${s.label}</span>
              </div>
              ${i < 3 ? '<div style="flex:1;height:1px;background:#e5e7eb;margin:0 4px;margin-bottom:16px;"></div>' : ''}
            </div>`,
            )
            .join('')}
        </div>`;

      const html = `<div style="padding:20px;font-family:sans-serif;color:#111;background:#fff;width:780px;">
        <div style="display:flex;justify-content:space-between;align-items:center;padding-bottom:12px;border-bottom:1px solid #e5e7eb;">
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="font-size:18px;font-weight:600;">${detail.period}</span>
            <span style="font-size:12px;padding:2px 8px;border-radius:4px;background:#e0e7ff;color:#3730a3;">${statusLabel}</span>
          </div>
          ${
            detail.totalScore != null
              ? `<div style="display:flex;align-items:center;gap:8px;">
            <div style="text-align:right;">
              <div style="font-size:11px;color:#6b7280;">总分</div>
              <div style="font-size:22px;font-weight:700;color:#2563eb;">${detail.totalScore}</div>
            </div>
            ${detail.grade ? `<span style="font-size:16px;font-weight:700;padding:4px 10px;border-radius:4px;background:#dbeafe;color:#1e40af;">${detail.grade}</span>` : ''}
          </div>`
              : ''
          }
        </div>

        ${stepperHTML}

        <div style="margin-top:12px;padding:12px;border:1px solid #e5e7eb;border-radius:8px;">
          <div style="font-size:14px;font-weight:600;margin-bottom:8px;">${detail.employeeName} <span style="font-weight:400;color:#6b7280;font-size:12px;">【${detail.position}】的绩效评分</span></div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:12px;">
            <div><span style="color:#6b7280;">上级：</span>${detail.supervisorName || '-'}</div>
            <div><span style="color:#6b7280;">状态：</span>${statusLabel}</div>
            ${
              detail.selfSignName
                ? `<div><span style="color:#6b7280;">自评签名：</span>${detail.selfSignName}${detail.selfSignAt ? ` (${new Date(detail.selfSignAt).toLocaleDateString('zh-CN')})` : ''}</div>`
                : ''
            }
            ${
              detail.supervisorSignName
                ? `<div><span style="color:#6b7280;">上级签名：</span>${detail.supervisorSignName}${detail.supervisorSignAt ? ` (${new Date(detail.supervisorSignAt).toLocaleDateString('zh-CN')})` : ''}</div>`
                : ''
            }
          </div>
          ${
            detail.selfSignImage || detail.supervisorSignImage
              ? `<div style="display:flex;gap:16px;margin-top:8px;padding-top:8px;border-top:1px solid #f3f4f6;">
            ${detail.selfSignImage ? `<div><div style="font-size:10px;color:#6b7280;margin-bottom:4px;">自评签名图片</div><img src="${detail.selfSignImage}" style="max-width:160px;max-height:60px;border:1px solid #e5e7eb;border-radius:4px;" /></div>` : ''}
            ${detail.supervisorSignImage ? `<div><div style="font-size:10px;color:#6b7280;margin-bottom:4px;">上级签名图片</div><img src="${detail.supervisorSignImage}" style="max-width:160px;max-height:60px;border:1px solid #e5e7eb;border-radius:4px;" /></div>` : ''}
          </div>`
              : ''
          }
        </div>
        ${groups
          .map(
            (group) => `
        <div style="margin-top:12px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
          <div style="padding:8px 12px;background:#f9fafb;font-size:13px;font-weight:600;">
            ${group.dimensionName} <span style="font-weight:400;font-size:11px;color:#6b7280;">权重 ${group.dimensionWeight} 分</span>
          </div>
          <table style="width:100%;border-collapse:collapse;font-size:11px;table-layout:fixed;">
            <thead>
              <tr style="background:#f3f4f6;">
                <th style="padding:6px 8px;text-align:left;border-bottom:1px solid #e5e7eb;">指标</th>
                <th style="padding:6px 8px;text-align:left;border-bottom:1px solid #e5e7eb;">说明</th>
                <th style="padding:6px 8px;text-align:right;border-bottom:1px solid #e5e7eb;width:42px;">权重</th>
                <th style="padding:6px 8px;text-align:right;border-bottom:1px solid #e5e7eb;width:42px;">自评</th>
                <th style="padding:6px 8px;text-align:right;border-bottom:1px solid #e5e7eb;width:52px;">上级评分</th>
              </tr>
            </thead>
            <tbody>
              ${group.indicators
                .map(
                  (ind) => `
              <tr style="border-bottom:1px solid #f3f4f6;">
                <td style="padding:6px 8px;word-wrap:break-word;">${ind.content}</td>
                <td style="padding:6px 8px;color:#6b7280;font-size:10px;">${ind.description || '-'}</td>
                <td style="padding:6px 8px;text-align:right;">${ind.weight}</td>
                <td style="padding:6px 8px;text-align:right;">${ind.selfScore != null ? ind.selfScore : '-'}</td>
                <td style="padding:6px 8px;text-align:right;">${ind.supervisorScore != null ? ind.supervisorScore : '-'}</td>
              </tr>
              `,
                )
                .join('')}
            </tbody>
          </table>
        </div>
        `,
          )
          .join('')}
      </div>`;

      pdfEl.innerHTML = html;

      // Wait for render
      await new Promise((resolve) => setTimeout(resolve, 100));

      const canvas = await html2canvas(pdfEl, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        onclone: (clonedDoc: Document) => {
          clonedDoc
            .querySelectorAll('style, link[rel="stylesheet"]')
            .forEach((el: Element) => el.remove());
        },
      });
      const imgData = canvas.toDataURL('image/png');
      const imgWidth = 297; // A4 landscape full width
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      const pdf = new jsPDF('l', 'mm', 'a4');
      const pageHeight = 210; // A4 landscape full height
      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;

      while (heightLeft > 0) {
        position = position - pageHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      pdf.save(`绩效详情_${employeeName}_${period}.pdf`);

      // Clean up
      pdfEl.innerHTML = '';
      toast.success('PDF 导出成功');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'PDF 导出失败';
      logger.error(`PDF export error: ${msg}`);
      handleApiError(e);
    } finally {
      setExportingPdfId(null);
    }
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="@container/main flex flex-1 flex-col gap-4 md:gap-6">
      <PageHeader title="绩效统计查询" visuallyHidden />

      {/* Filters */}
      <Card className="rounded-xl">
        <CardContent className="p-4">
          <div className="flex items-start gap-3 flex-wrap">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground h-4 leading-4">
                绩效周期
              </Label>
              <MultiMonthPicker
                value={filters.periods}
                onChange={(value: string[]) =>
                  setFilters((f: FilterState) => ({ ...f, periods: value }))
                }
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground h-4 leading-4">
                部门
              </Label>
              <MultiDepartmentTreeSelect
                value={filters.departments}
                onChange={(value: string[]) =>
                  setFilters((f: FilterState) => ({ ...f, departments: value }))
                }
                className="h-8 text-xs w-36"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground h-4 leading-4">
                岗位
              </Label>
              <MultiSelect
                options={positionOptions}
                value={filters.positions}
                onChange={(value: string[]) =>
                  setFilters((f: FilterState) => ({ ...f, positions: value }))
                }
                placeholder="选择岗位"
                className="h-8 text-xs w-32"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground h-4 leading-4">
                等级
              </Label>
              <MultiSelect
                options={gradeSelectOptions}
                value={filters.grades}
                onChange={(value: string[]) =>
                  setFilters((f: FilterState) => ({ ...f, grades: value }))
                }
                placeholder="选择等级"
                className="h-8 text-xs w-28"
              />
            </div>
            <div className="flex flex-col gap-1.5 ml-auto">
              <Label className="text-xs text-muted-foreground h-4 leading-4 invisible">
                &nbsp;
              </Label>
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={handleSearch} className="shrink-0">
                  <SearchIcon data-icon="inline-start" />
                  查询
                </Button>
                <CanRole roles={['admin', 'hrd', 'dept_head']}>
                  <CanDo resource="statistics" action="export">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleExport}
                      disabled={exporting}
                      className="shrink-0"
                    >
                      <DownloadIcon data-icon="inline-start" />
                      {exporting && <Spinner className="mr-2 size-4" />}导出
                    </Button>
                  </CanDo>
                </CanRole>
                <CanRole roles={['admin', 'hrd']}>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSyncToBitable}
                    disabled={syncingOut}
                    className="shrink-0"
                  >
                    <Upload data-icon="inline-start" />
                    {syncingOut && <Spinner className="mr-2 size-4" />}
                    同步
                  </Button>
                </CanRole>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Charts Section */}
      <div className="grid gap-4 md:grid-cols-3">
        {/* Grade Distribution - Pie Chart */}
        <Card className="rounded-xl">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <PieChartIcon className="size-4 text-muted-foreground" />
              等级分布
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!charts || charts.gradeDistribution.length === 0 ? (
              <div className="flex items-center justify-center h-[250px] text-sm text-muted-foreground">
                暂无数据
              </div>
            ) : (
              <ChartContainer config={chartConfig} className="h-[250px] w-full">
                <PieChart>
                  <Pie
                    data={charts.gradeDistribution}
                    dataKey="count"
                    nameKey="grade"
                    cx="50%"
                    cy="45%"
                    innerRadius={50}
                    outerRadius={90}
                  >
                    {charts.gradeDistribution.map((_, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={CHART_COLORS[index % CHART_COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <ChartTooltip content={<ChartTooltipContent />} />
                </PieChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        {/* Department Avg - Bar Chart */}
        <Card className="rounded-xl">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <BarChart3Icon className="size-4 text-muted-foreground" />
              部门平均分
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!charts || charts.departmentAvg.length === 0 ? (
              <div className="flex items-center justify-center h-[250px] text-sm text-muted-foreground">
                暂无数据
              </div>
            ) : (
              <ChartContainer config={chartConfig} className="h-[250px] w-full">
                <BarChart
                  data={[...charts.departmentAvg].sort(
                    (a, b) => b.avgScore - a.avgScore,
                  )}
                  layout="vertical"
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    className="stroke-muted"
                  />
                  <XAxis
                    type="number"
                    tickLine={false}
                    axisLine={false}
                    className="text-xs text-muted-foreground"
                    domain={[0, 100]}
                  />
                  <YAxis
                    type="category"
                    dataKey="department"
                    tickLine={false}
                    axisLine={false}
                    className="text-xs text-muted-foreground"
                    width={80}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar
                    dataKey="avgScore"
                    fill="hsl(var(--chart-1))"
                    radius={[0, 4, 4, 0]}
                  />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        {/* Trend - Area Chart */}
        <Card className="rounded-xl">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUpIcon className="size-4 text-muted-foreground" />
              月度趋势
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!charts || charts.trend.length === 0 ? (
              <div className="flex items-center justify-center h-[250px] text-sm text-muted-foreground">
                暂无数据
              </div>
            ) : (
              <ChartContainer config={chartConfig} className="h-[250px] w-full">
                <AreaChart data={charts.trend}>
                  <defs>
                    <linearGradient id="fillTrend" x1="0" y1="0" x2="0" y2="1">
                      <stop
                        offset="5%"
                        stopColor="hsl(var(--chart-3))"
                        stopOpacity={0.3}
                      />
                      <stop
                        offset="95%"
                        stopColor="hsl(var(--chart-3))"
                        stopOpacity={0.05}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    className="stroke-muted"
                  />
                  <XAxis
                    dataKey="month"
                    tickLine={false}
                    axisLine={false}
                    className="text-xs text-muted-foreground"
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    className="text-xs text-muted-foreground"
                    domain={[0, 100]}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Area
                    type="monotone"
                    dataKey="avgScore"
                    fill="url(#fillTrend)"
                    stroke="hsl(var(--chart-3))"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Records Table */}
      <Card className="rounded-xl">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">绩效记录（共 {total} 条）</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <Spinner className="size-8" />
            </div>
          ) : records.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <BarChart3Icon className="size-6" />
                  </EmptyMedia>
                  <EmptyTitle>暂无数据</EmptyTitle>
                </EmptyHeader>
              </Empty>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      <TableHead className="text-left py-3 px-4 font-medium">
                        绩效周期
                      </TableHead>
                      <TableHead className="text-left py-3 px-4 font-medium">
                        员工
                      </TableHead>
                      <TableHead className="text-left py-3 px-4 font-medium hidden sm:table-cell">
                        部门
                      </TableHead>
                      <TableHead className="text-left py-3 px-4 font-medium hidden md:table-cell">
                        岗位
                      </TableHead>
                      <TableHead className="text-left py-3 px-4 font-medium hidden md:table-cell">
                        上级
                      </TableHead>
                      <TableHead className="text-right py-3 px-4 font-medium">
                        总分
                      </TableHead>
                      <TableHead className="py-3 px-4 font-medium hidden sm:table-cell">
                        等级
                      </TableHead>
                      <TableHead className="py-3 px-4 font-medium">
                        状态
                      </TableHead>
                      <TableHead className="text-left py-3 px-4 font-medium hidden lg:table-cell">
                        完成时间
                      </TableHead>
                      <CanRole roles={['admin', 'hrd', 'dept_head']}>
                        <TableHead className="py-3 px-4 font-medium sticky right-0 bg-background z-20 border-l">
                          操作
                        </TableHead>
                      </CanRole>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {records.map((r: StatisticsRecordItem) => (
                      <TableRow
                        key={r.id}
                        className="group border-b hover:bg-muted/50"
                      >
                        <TableCell className="py-3 px-4">{r.period}</TableCell>
                        <TableCell className="py-3 px-4 font-medium">
                          {r.employeeName}
                        </TableCell>
                        <TableCell className="py-3 px-4 hidden sm:table-cell text-muted-foreground">
                          {r.department}
                        </TableCell>
                        <TableCell className="py-3 px-4 hidden md:table-cell text-muted-foreground">
                          {r.position}
                        </TableCell>
                        <TableCell className="py-3 px-4 hidden md:table-cell text-muted-foreground">
                          {r.supervisorName}
                        </TableCell>
                        <TableCell className="py-3 px-4 text-right font-mono">
                          {r.totalScore}
                        </TableCell>
                        <TableCell className="py-3 px-4 hidden sm:table-cell">
                          <GradeBadge grade={r.grade} />
                        </TableCell>
                        <TableCell className="py-3 px-4">
                          <StatusBadge status={r.status} />
                        </TableCell>
                        <TableCell className="py-3 px-4 hidden lg:table-cell text-muted-foreground">
                          {r.completedAt
                            ? new Date(r.completedAt).toLocaleDateString(
                                'zh-CN',
                              )
                            : '-'}
                        </TableCell>
                        <CanRole roles={['admin', 'hrd', 'dept_head']}>
                          <TableCell className="py-3 px-4 sticky right-0 bg-background group-hover:bg-muted/50 z-10 border-l">
                            <div className="flex items-center gap-1">
                              <ActionBadge
                                actionType="view"
                                icon={<Eye className="size-3" />}
                                label="详情"
                                onClick={() =>
                                  navigate(`../assessment/${r.id}`)
                                }
                              />
                              <ActionBadge
                                actionType="preview"
                                icon={<FileDown className="size-3" />}
                                label="导出"
                                disabled={exportingPdfId === r.id}
                                onClick={() =>
                                  handleExportPdf(
                                    r.id,
                                    r.employeeName,
                                    r.period,
                                  )
                                }
                              />
                            </div>
                          </TableCell>
                        </CanRole>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t">
                  <span className="text-sm text-muted-foreground">
                    第 {page} / {totalPages} 页
                  </span>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page <= 1}
                      onClick={() => setPage((p: number) => Math.max(1, p - 1))}
                    >
                      上一页
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page >= totalPages}
                      onClick={() =>
                        setPage((p: number) => Math.min(totalPages, p + 1))
                      }
                    >
                      下一页
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Hidden div for PDF rendering */}
      <div
        ref={pdfRef}
        style={{
          position: 'absolute',
          left: '-9999px',
          top: 0,
          width: '820px',
          background: '#fff',
          color: '#111',
          overflow: 'hidden',
        }}
      />
    </div>
  );
};

export default StatisticsPage;
