import * as fs from 'node:fs';
import * as path from 'node:path';

function readClient(relativePath: string): string {
  return fs.readFileSync(
    path.resolve(__dirname, '../../client/src', relativePath),
    'utf8',
  );
}

// 模板表单保存无反馈的三层根因（回归约束）：
// 1. 保存按钮因权重不满足而 disabled → 点击无任何反应，连权重 toast 都触发不了
// 2. zod 必填校验（zodResolver）失败时 RHF 阻止 submit，但页面从不渲染 errors
// 3. 权重校验兜底 toast 存在但被 disabled 挡住
describe('template form save feedback', () => {
  it('save button is disabled only while submitting, not by weight state', () => {
    const source = readClient(
      'pages/TemplateManagement/TemplateFormDialog.tsx',
    );
    // 权重不满足时必须能点击，让 handleSubmit 里的权重 toast 有机会触发
    expect(source).toContain('disabled={submitting}');
    expect(source).not.toContain('!canSubmit');
  });

  it('renders required-field errors for name and position', () => {
    const source = readClient(
      'pages/TemplateManagement/TemplateFormDialog.tsx',
    );
    expect(source).toMatch(/errors\.name\?\.message/);
    expect(source).toMatch(/errors\.position\?\.message/);
  });

  it('renders dimension and indicator required-field errors', () => {
    const source = readClient('pages/TemplateManagement/DimensionCard.tsx');
    expect(source).toMatch(/errors\.dimensions\?\.\[dimIdx\]\?\.name/);
    expect(source).toMatch(
      /errors\.dimensions\?\.\[dimIdx\]\?\.indicators\?\.\[indIdx\]\?\.content/,
    );
  });

  it('keeps weight validation toast fallback on submit', () => {
    const source = readClient(
      'pages/TemplateManagement/TemplateFormDialog.tsx',
    );
    expect(source).toContain('权重分总和必须等于 100');
    // 提交前对加减分维度置底后再校验
    expect(source).toContain('validateTotalWeight(sortedDimensions)');
  });

  it('excludes bonus dimensions from 100% weight validation', () => {
    const typesSource = readClient(
      'pages/TemplateManagement/TemplateFormDialog.types.ts',
    );
    // 加减分维度允许无指标（普通维度仍要求至少一个指标）
    expect(typesSource).toContain('isBonus: z.boolean().default(false)');
    expect(typesSource).toMatch(/!val\.isBonus && val\.indicators\.length === 0/);

    const weightSource = readClient('utils/weight-validation.ts');
    expect(weightSource).toContain('dimensions.filter((d) => !d.isBonus)');
    expect(weightSource).toContain('if (dim.isBonus) continue;');
  });

  it('sorts bonus dimensions to the end on submit', () => {
    const source = readClient(
      'pages/TemplateManagement/TemplateFormDialog.tsx',
    );
    expect(source).toMatch(/Number\(a\.isBonus \?\? false\) - Number\(b\.isBonus \?\? false\)/);
  });
});
