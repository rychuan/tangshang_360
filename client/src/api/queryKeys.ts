export const queryKeys = {
  myAssessments: {
    records: (params: { page: number; pageSize: number; periodStart: string; periodEnd: string }) =>
      ['my-assessments', 'records', params] as const,
    trend: (year: string) => ['my-assessments', 'trend', year] as const,
    summary: () => ['my-assessments', 'summary'] as const,
  },
  assessmentDetail: (id: string) => ['assessment-detail', id] as const,
  assessmentInstances: (params: Record<string, string | number>) =>
    ['assessment-instances', params] as const,
  publishEmployees: (period: string, filters?: Record<string, string>) =>
    ['publish-employees', period, filters] as const,
  statistics: {
    records: (params: Record<string, unknown>) => ['statistics', 'records', params] as const,
    charts: (params: Record<string, unknown>) => ['statistics', 'charts', params] as const,
  },
  dashboard: () => ['dashboard'] as const,
  employees: {
    list: (params: Record<string, unknown>) => ['employees', 'list', params] as const,
    detail: (id: string) => ['employees', 'detail', id] as const,
    positions: () => ['employees', 'positions'] as const,
  },
  grades: {
    list: () => ['grades', 'list'] as const,
    active: () => ['grades', 'active'] as const,
  },
  templates: {
    list: (params: Record<string, unknown>) => ['templates', 'list', params] as const,
    detail: (id: string) => ['templates', 'detail', id] as const,
  },
  teamPerformance: {
    overview: () => ['team-performance', 'overview'] as const,
    subordinates: (params: Record<string, unknown>) => ['team-performance', 'subordinates', params] as const,
  },
  department: {
    list: () => ['department', 'list'] as const,
  },
  dictionary: {
    list: (type: string) => ['dictionary', type] as const,
  },
} as const;
