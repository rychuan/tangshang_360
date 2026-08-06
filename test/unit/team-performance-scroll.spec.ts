import * as fs from 'node:fs';
import * as path from 'node:path';

const pageSource = fs.readFileSync(
  path.resolve(
    __dirname,
    '../../client/src/pages/TeamPerformance/TeamPerformancePage.tsx',
  ),
  'utf8',
);

describe('team performance list scroll isolation', () => {
  it('passes maxHeight to PageTable when scrollable', () => {
    // scrollable 模式依赖 maxHeight 约束内部滚动容器（flex-1 overflow-auto）。
    // 漏传时表格按内容撑满，外层 Card 的 maxHeight + overflow-hidden 会直接裁剪
    // 超出行，列表无法滚动 —— 回归见 644d525。
    expect(pageSource).toMatch(
      /<PageTable[\s\S]{0,600}?scrollable[\s\S]{0,200}?maxHeight=\{tableMaxHeight\}/,
    );
  });

  it('caps only the PageTable wrapper, not the Card (mobile list page-scrolls)', () => {
    // maxHeight 只应作用于桌面 PageTable 的包裹层；Card 被 maxHeight 限制会
    // 裁剪移动端列表（md:hidden 分支）使其无法随页面滚动。
    const wrapperStart = pageSource.indexOf('<div ref={tableRef}');
    expect(wrapperStart).toBeGreaterThan(-1);
    const wrapperBlock = pageSource.slice(wrapperStart, wrapperStart + 400);
    expect(wrapperBlock).toMatch(
      /ref=\{tableRef\}\s*style=\{\{\s*maxHeight: tableMaxHeight/,
    );
    expect(pageSource).not.toMatch(/<Card[^>]*style=\{\{\s*maxHeight/);
  });
});
