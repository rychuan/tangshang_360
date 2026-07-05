/**
 * 从 Excel 生成绩效考核模板迁移 SQL
 * 用法: npx tsx scripts/import-template.ts "/path/to/file.xlsx"
 * 输出: server/database/migrations/009_import_template.sql
 */
import * as XLSX from 'xlsx';
import { writeFileSync } from 'fs';
import { resolve } from 'path';

const filePath = process.argv[2];
if (!filePath) {
  console.error('用法: npx tsx scripts/import-template.ts <excel文件路径>');
  process.exit(1);
}

const workbook = XLSX.readFile(filePath);
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const rows: (string | null)[][] = XLSX.utils.sheet_to_json(sheet, {
  header: 1, defval: null,
});

const metaRow = rows[2] || [];
const position = String(metaRow[4] || '未知岗位').replace('岗位：', '').trim();

interface Indicator { content: string; description: string; algorithm: string; dataSource: string; weight: number }
interface Dimension { name: string; weight: number; indicators: Indicator[] }

const dimensions: Dimension[] = [];
let currentDim: Dimension | null = null;

for (let i = 4; i < rows.length; i++) {
  const row = rows[i]; if (!row) continue;
  const rawDimName = String(row[0] || '').trim();
  const content = String(row[2] || '').trim();
  if (rawDimName.includes('合计') || rawDimName.includes('说明') || rawDimName.startsWith('本人已知晓')) break;
  if (rawDimName && content) {
    const m = rawDimName.match(/（(\d+)%）/);
    currentDim = { name: rawDimName.replace(/（\d+%）/, '').trim(), weight: m ? parseInt(m[1]) : 0, indicators: [] };
    dimensions.push(currentDim);
  }
  if (currentDim && content) {
    currentDim.indicators.push({
      content, description: String(row[3] || '').trim(), algorithm: String(row[4] || '').trim(),
      dataSource: String(row[5] || '').trim(), weight: parseFloat(String(row[7] || '0')),
    });
  }
}

const esc = (s: string) => `E'${s.replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`;

let sql = `-- 导入绩效模板: ${position}月度绩效考核\n`;
sql += `-- ${dimensions.length} 个维度，${dimensions.reduce((s, d) => s + d.indicators.length, 0)} 个指标\n\n`;

sql += `DO $$
DECLARE
  tpl_id uuid := gen_random_uuid();\n`;

const dimVars: string[] = [];
for (let di = 0; di < dimensions.length; di++) {
  const varName = `dim${di + 1}_id`;
  dimVars.push(varName);
  sql += `  ${varName} uuid := gen_random_uuid();\n`;
}
sql += `BEGIN\n\n`;

sql += `  -- 创建模板\n`;
sql += `  INSERT INTO assessment_template (id, name, position, type, is_active)\n`;
sql += `  VALUES (tpl_id, ${esc(`${position}月度绩效考核`)}, ${esc(position)}, 'monthly', true);\n\n`;

for (let di = 0; di < dimensions.length; di++) {
  const dim = dimensions[di];
  sql += `  -- 维度: ${dim.name} (权重${dim.weight}%)\n`;
  sql += `  INSERT INTO assessment_dimension (id, template_id, name, weight, sort_order)\n`;
  sql += `  VALUES (${dimVars[di]}, tpl_id, ${esc(dim.name)}, ${esc(String(dim.weight))}, ${di});\n\n`;

  for (let ii = 0; ii < dim.indicators.length; ii++) {
    const ind = dim.indicators[ii];
    sql += `  INSERT INTO assessment_indicator (id, dimension_id, content, description, algorithm, data_source, weight, sort_order)\n`;
    sql += `  VALUES (gen_random_uuid(), ${dimVars[di]}, ${esc(ind.content)}, ${esc(ind.description)}, ${esc(ind.algorithm)}, ${esc(ind.dataSource)}, ${esc(String(ind.weight))}, ${ii});\n`;
  }
  sql += `\n`;
}

sql += `END $$;\n`;

const outPath = resolve(process.cwd(), 'server/database/migrations/009_import_template_主播.sql');
writeFileSync(outPath, sql);
console.log(`✅ 已生成: ${outPath}`);
console.log(`${dimensions.length} 维度, ${dimensions.reduce((s, d) => s + d.indicators.length, 0)} 指标`);
