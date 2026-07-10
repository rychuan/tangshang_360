"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * 从 Excel 生成绩效考核模板迁移 SQL
 * 用法: npx tsx scripts/import-template.ts "/path/to/file.xlsx"
 * 输出: server/database/migrations/009_import_template.sql
 */
var XLSX = require("xlsx");
var fs_1 = require("fs");
var path_1 = require("path");
var filePath = process.argv[2];
if (!filePath) {
    console.error('用法: npx tsx scripts/import-template.ts <excel文件路径>');
    process.exit(1);
}
var workbook = XLSX.readFile(filePath);
var sheet = workbook.Sheets[workbook.SheetNames[0]];
var rows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: null,
});
var metaRow = rows[2] || [];
var position = String(metaRow[4] || '未知岗位')
    .replace('岗位：', '')
    .trim();
var dimensions = [];
var currentDim = null;
for (var i = 4; i < rows.length; i++) {
    var row = rows[i];
    if (!row)
        continue;
    var rawDimName = String(row[0] || '').trim();
    var content = String(row[2] || '').trim();
    if (rawDimName.includes('合计') ||
        rawDimName.includes('说明') ||
        rawDimName.startsWith('本人已知晓'))
        break;
    if (rawDimName && content) {
        var m = rawDimName.match(/（(\d+)%）/);
        currentDim = {
            name: rawDimName.replace(/（\d+%）/, '').trim(),
            weight: m ? parseInt(m[1]) : 0,
            indicators: [],
        };
        dimensions.push(currentDim);
    }
    if (currentDim && content) {
        currentDim.indicators.push({
            content: content,
            description: String(row[3] || '').trim(),
            algorithm: String(row[4] || '').trim(),
            dataSource: String(row[5] || '').trim(),
            weight: parseFloat(String(row[7] || '0')),
        });
    }
}
var esc = function (s) { return "E'".concat(s.replace(/'/g, "\\'").replace(/\n/g, '\\n'), "'"); };
var sql = "-- \u5BFC\u5165\u7EE9\u6548\u6A21\u677F: ".concat(position, "\u6708\u5EA6\u7EE9\u6548\u8003\u6838\n");
sql += "-- ".concat(dimensions.length, " \u4E2A\u7EF4\u5EA6\uFF0C").concat(dimensions.reduce(function (s, d) { return s + d.indicators.length; }, 0), " \u4E2A\u6307\u6807\n\n");
sql += "DO $$\nDECLARE\n  tpl_id uuid := gen_random_uuid();\n";
var dimVars = [];
for (var di = 0; di < dimensions.length; di++) {
    var varName = "dim".concat(di + 1, "_id");
    dimVars.push(varName);
    sql += "  ".concat(varName, " uuid := gen_random_uuid();\n");
}
sql += "BEGIN\n\n";
sql += "  -- \u521B\u5EFA\u6A21\u677F\n";
sql += "  INSERT INTO assessment_template (id, name, position, type, is_active)\n";
sql += "  VALUES (tpl_id, ".concat(esc("".concat(position, "\u6708\u5EA6\u7EE9\u6548\u8003\u6838")), ", ").concat(esc(position), ", 'monthly', true);\n\n");
for (var di = 0; di < dimensions.length; di++) {
    var dim = dimensions[di];
    sql += "  -- \u7EF4\u5EA6: ".concat(dim.name, " (\u6743\u91CD").concat(dim.weight, "%)\n");
    sql += "  INSERT INTO assessment_dimension (id, template_id, name, weight, sort_order)\n";
    sql += "  VALUES (".concat(dimVars[di], ", tpl_id, ").concat(esc(dim.name), ", ").concat(esc(String(dim.weight)), ", ").concat(di, ");\n\n");
    for (var ii = 0; ii < dim.indicators.length; ii++) {
        var ind = dim.indicators[ii];
        sql += "  INSERT INTO assessment_indicator (id, dimension_id, content, description, algorithm, data_source, weight, sort_order)\n";
        sql += "  VALUES (gen_random_uuid(), ".concat(dimVars[di], ", ").concat(esc(ind.content), ", ").concat(esc(ind.description), ", ").concat(esc(ind.algorithm), ", ").concat(esc(ind.dataSource), ", ").concat(esc(String(ind.weight)), ", ").concat(ii, ");\n");
    }
    sql += "\n";
}
sql += "END $$;\n";
var outPath = (0, path_1.resolve)(process.cwd(), 'server/database/migrations/009_import_template_主播.sql');
(0, fs_1.writeFileSync)(outPath, sql);
console.log("\u2705 \u5DF2\u751F\u6210: ".concat(outPath));
console.log("".concat(dimensions.length, " \u7EF4\u5EA6, ").concat(dimensions.reduce(function (s, d) { return s + d.indicators.length; }, 0), " \u6307\u6807"));
