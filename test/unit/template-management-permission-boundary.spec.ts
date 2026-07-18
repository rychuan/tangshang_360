import * as React from 'react';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';

jest.mock('@client/src/components/ui/dialog', () => ({
  Dialog: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', null, children),
  DialogContent: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', null, children),
  DialogHeader: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', null, children),
  DialogTitle: ({ children }: { children: React.ReactNode }) =>
    React.createElement('h2', null, children),
}));

jest.mock('@client/src/components/ui/button', () => ({
  Button: ({ children }: { children: React.ReactNode }) =>
    React.createElement('button', null, children),
}));

jest.mock('@client/src/components/ui/badge', () => ({
  Badge: ({ children }: { children: React.ReactNode }) =>
    React.createElement('span', null, children),
}));

jest.mock('@client/src/components/ui/card', () => ({
  Card: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', null, children),
  CardContent: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', null, children),
  CardHeader: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', null, children),
}));

jest.mock('@client/src/components/ui/input', () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) =>
    React.createElement('input', props),
}));

jest.mock('@client/src/components/ui/select', () => ({
  Select: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', null, children),
  SelectContent: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', null, children),
  SelectItem: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', null, children),
  SelectTrigger: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', null, children),
  SelectValue: () => React.createElement('span', null, 'value'),
  SelectGroup: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', null, children),
}));

jest.mock('@client/src/components/ui/table', () => ({
  Table: ({ children }: { children: React.ReactNode }) =>
    React.createElement('table', null, children),
  TableBody: ({ children }: { children: React.ReactNode }) =>
    React.createElement('tbody', null, children),
  TableCell: ({ children }: { children: React.ReactNode }) =>
    React.createElement('td', null, children),
  TableHead: ({ children }: { children: React.ReactNode }) =>
    React.createElement('th', null, children),
  TableHeader: ({ children }: { children: React.ReactNode }) =>
    React.createElement('thead', null, children),
  TableRow: ({ children }: { children: React.ReactNode }) =>
    React.createElement('tr', null, children),
}));

jest.mock('@client/src/components/ui/spinner', () => ({
  Spinner: () => React.createElement('span', null, 'spinner'),
}));

jest.mock('@lark-apaas/client-toolkit/logger', () => ({
  logger: {
    error: jest.fn(),
  },
}));

jest.mock('@client/src/utils/api-error', () => ({
  handleApiError: jest.fn(),
}));

jest.mock('@client/src/utils/weight-validation', () => ({
  validateTotalWeight: () => ({ isValid: true, totalWeight: 100 }),
  validateIndicatorWeights: () => ({ isValid: true, errors: [] }),
}));

import TemplateFormDialog from '../../client/src/pages/TemplateManagement/TemplateFormDialog';

const template = {
  id: 'tpl-1',
  name: '季度模板',
  position: '销售经理',
  type: 'monthly' as const,
  isActive: true,
  dimensions: [
    {
      id: 'dim-1',
      name: '业绩',
      weight: 100,
      indicators: [
        {
          id: 'ind-1',
          content: '达成率',
          description: '销售目标完成率',
          algorithm: '',
          dataSource: '',
          weight: 100,
        },
      ],
    },
  ],
} as const;

describe('template management permission boundary', () => {
  it('hides edit mode and save for view-only template viewers', () => {
    const html = renderToStaticMarkup(
      React.createElement(TemplateFormDialog as React.ComponentType<any>, {
        open: true,
        onOpenChange: jest.fn(),
        template,
        onSave: jest.fn(),
        positions: ['销售经理'],
        canEdit: false,
      }),
    );

    expect(html).not.toContain('编辑模式');
    expect(html).not.toContain('保存');
  });

  it('keeps the edit toggle for template editors', () => {
    const html = renderToStaticMarkup(
      React.createElement(TemplateFormDialog as React.ComponentType<any>, {
        open: true,
        onOpenChange: jest.fn(),
        template,
        onSave: jest.fn(),
        positions: ['销售经理'],
        canEdit: true,
      }),
    );

    expect(html).toContain('编辑模式');
  });

  it('uses edit permission to deactivate and delete permission to permanently delete', () => {
    const source = fs.readFileSync(
      path.resolve(
        __dirname,
        '../../client/src/pages/TemplateManagement/TemplateManagementPage.tsx',
      ),
      'utf8',
    );

    expect(source).toMatch(
      /item\.isActive && \(\s*<CanDo resource="template_management" action="edit">/,
    );
    expect(source).toMatch(
      /!item\.isActive && \(\s*<CanDo resource="template_management" action="delete">/,
    );
  });
});
