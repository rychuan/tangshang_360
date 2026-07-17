# Shadcn 兼容式全局框架与首页改造实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development`（推荐）or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**目标：** 在不修改后端和 shadcn/ui 基础组件的前提下，完成已经确认的全局框架与绩效工作台首页改造。

**架构：** 全局框架拆分为导航纯函数、`AppSidebar`、`AppTopbar` 和导航命令菜单；首页拆分为视图数据纯函数和职责单一的展示组件。接口仍由 `HomePage.tsx` 通过 React Query 统一请求，子组件只接收整理后的数据和回调。

**技术栈：** React 19、TypeScript、React Router 6、TanStack Query 5、Tailwind CSS 4、shadcn/ui、Radix UI、Lucide、Recharts、Jest。

## 全局约束

- 不修改后端接口和数据库结构。
- 不修改 `client/src/components/ui/` 下的 shadcn/ui 基础组件。
- 不修改 `client/src/tailwind-theme.css` 中的全局字号变量。
- 卡片圆角不超过 8px。
- 导航和主要正文目标字号约为 14px。
- 没有真实数据源的通知按钮不渲染。
- 顶部搜索只搜索当前用户可访问的功能与页面。
- 首页不能硬编码运营数据、截止时间或完成进度。
- 任一首页接口失败时，另一个成功区块继续显示。

---

## 文件结构

### 新增文件

- `client/src/components/app-shell/app-shell-utils.ts`：权限导航过滤、当前标题、周期文本和命令搜索纯函数。
- `client/src/components/app-shell/AppSidebar.tsx`：品牌、周期、导航和邀请入口。
- `client/src/components/app-shell/AppTopbar.tsx`：移动端菜单、页面名称、导航命令、主题和用户头像。
- `client/src/components/app-shell/NavigationCommand.tsx`：基于 shadcn `CommandDialog` 的本地路由搜索。
- `client/src/pages/HomePage/dashboard-utils.ts`：问候语、进度、快捷入口和图表数据转换纯函数。
- `client/src/pages/HomePage/DashboardHero.tsx`：欢迎区域和权限主操作。
- `client/src/pages/HomePage/AssessmentProgressPanel.tsx`：当前周期完成进度。
- `client/src/pages/HomePage/DashboardQuickActions.tsx`：权限快捷入口。
- `client/src/pages/HomePage/DashboardTodoGrid.tsx`：待办评分列表及独立状态。
- `client/src/pages/HomePage/DashboardSummary.tsx`：待处理、平均分、完成率摘要。
- `client/src/pages/HomePage/DashboardCharts.tsx`：趋势和等级分布。
- `test/unit/app-shell-utils.spec.ts`：全局框架纯函数测试。
- `test/unit/dashboard-utils.spec.ts`：首页视图数据纯函数测试。

### 修改文件

- `client/src/app.tsx`：默认入口跳转到 `/dashboard`。
- `client/src/components/navigation.ts`：增加“绩效工作台”导航。
- `client/src/components/Layout.tsx`：组合新的全局框架组件。
- `client/src/pages/HomePage/HomePage.tsx`：组合首页组件并支持局部加载和局部错误。

---

### 任务 1：建立可测试的导航模型

**文件：**

- 新增：`client/src/components/app-shell/app-shell-utils.ts`
- 新增：`test/unit/app-shell-utils.spec.ts`
- 修改：`client/src/components/navigation.ts`
- 修改：`client/src/app.tsx:67-70`

**接口：**

- 输入：现有 `NavGroup[]`、角色检查函数、`PermissionItem[]`、当前路径和查询文本。
- 输出：
  - `filterVisibleNavGroups(...) => NavGroup[]`
  - `flattenNavItems(...) => NavItem[]`
  - `getCurrentNavLabel(...) => string`
  - `filterNavItems(...) => NavItem[]`
  - `formatCurrentCycle(date) => string`

- [ ] **步骤 1：先写导航纯函数失败测试**

```ts
import {
  filterNavItems,
  filterVisibleNavGroups,
  formatCurrentCycle,
  getCurrentNavLabel,
} from '../../client/src/components/app-shell/app-shell-utils';
import type { NavGroup } from '../../client/src/components/navigation';

const groups: NavGroup[] = [
  {
    label: '工作台',
    icon: (() => null) as never,
    items: [
      {
        label: '绩效工作台',
        path: '/dashboard',
        icon: (() => null) as never,
        roles: ['employee'],
        permissionResource: 'dashboard',
      },
      {
        label: '员工管理',
        path: '/employees',
        icon: (() => null) as never,
        roles: ['hrd'],
        permissionResource: 'employees',
      },
    ],
  },
];

describe('app shell navigation utilities', () => {
  it('同时应用角色和资源查看权限', () => {
    const visible = filterVisibleNavGroups({
      groups,
      canRole: (role) => role === 'employee',
      permissions: [{ resource: 'dashboard', actions: ['view'] }],
    });
    expect(visible[0].items.map((item) => item.path)).toEqual(['/dashboard']);
  });

  it('按页面名称过滤命令结果', () => {
    expect(filterNavItems(groups[0].items, '员工').map((item) => item.path))
      .toEqual(['/employees']);
  });

  it('优先匹配完整路径并支持详情页标题回退', () => {
    expect(getCurrentNavLabel('/dashboard', groups, '')).toBe('绩效工作台');
    expect(getCurrentNavLabel('/assessment/1', groups, '')).toBe('绩效详情');
  });

  it('生成中文考核周期', () => {
    expect(formatCurrentCycle(new Date('2026-07-17T00:00:00+08:00')))
      .toBe('2026 年 7 月考核周期');
  });
});
```

- [ ] **步骤 2：运行测试并确认失败**

运行：

```bash
npx jest test/unit/app-shell-utils.spec.ts --runInBand
```

预期：测试因 `app-shell-utils` 尚不存在而失败。

- [ ] **步骤 3：实现导航纯函数**

```ts
import type { PermissionItem } from '@shared/api.interface';
import type { NavGroup, NavItem } from '../navigation';

export function filterVisibleNavGroups(args: {
  groups: NavGroup[];
  canRole: (role: string) => boolean;
  permissions: PermissionItem[];
}): NavGroup[] {
  return args.groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        const roleAllowed = item.roles.some(args.canRole);
        const permissionAllowed =
          !item.permissionResource ||
          args.permissions.some(
            (permission) =>
              permission.resource === item.permissionResource &&
              permission.actions.includes('view'),
          );
        return roleAllowed && permissionAllowed;
      }),
    }))
    .filter((group) => group.items.length > 0);
}

export function flattenNavItems(groups: NavGroup[]): NavItem[] {
  return groups.flatMap((group) => group.items);
}

export function filterNavItems(items: NavItem[], query: string): NavItem[] {
  const normalized = query.trim().toLocaleLowerCase('zh-CN');
  if (!normalized) return items;
  return items.filter((item) =>
    item.label.toLocaleLowerCase('zh-CN').includes(normalized),
  );
}

export function getCurrentNavLabel(
  pathname: string,
  groups: NavGroup[],
  breadcrumbLabel: string,
): string {
  if (breadcrumbLabel) return breadcrumbLabel;
  const items = flattenNavItems(groups);
  const exact = items.find((item) => item.path === pathname);
  if (exact) return exact.label;
  const parent = items.find(
    (item) => item.path !== '/' && pathname.startsWith(item.path),
  );
  if (parent) return parent.label;
  if (pathname.startsWith('/assessment/')) return '绩效详情';
  return '绩效考核';
}

export function formatCurrentCycle(date: Date): string {
  return `${date.getFullYear()} 年 ${date.getMonth() + 1} 月考核周期`;
}
```

- [ ] **步骤 4：增加工作台导航并修改默认入口**

在 `navigation.ts` 的“工作台”分组首项加入：

```ts
{
  label: '绩效工作台',
  path: '/dashboard',
  icon: LayoutDashboard,
  roles: ALL_ROLES,
  permissionResource: 'dashboard',
},
```

在 `app.tsx` 中修改：

```tsx
<Route index element={<Navigate to="/dashboard" replace />} />
```

- [ ] **步骤 5：运行导航测试和前端类型检查**

```bash
npx jest test/unit/app-shell-utils.spec.ts --runInBand
npm run type:check:client
```

预期：测试和类型检查均通过。

- [ ] **步骤 6：提交任务 1**

```bash
git add client/src/app.tsx client/src/components/navigation.ts \
  client/src/components/app-shell/app-shell-utils.ts \
  test/unit/app-shell-utils.spec.ts
git commit -m "feat: add dashboard navigation model"
```

---

### 任务 2：实现 Shadcn 兼容式全局框架

**文件：**

- 新增：`client/src/components/app-shell/AppSidebar.tsx`
- 新增：`client/src/components/app-shell/AppTopbar.tsx`
- 新增：`client/src/components/app-shell/NavigationCommand.tsx`
- 修改：`client/src/components/Layout.tsx`

**接口：**

- 使用任务 1 的 `filterVisibleNavGroups`、`flattenNavItems`、`getCurrentNavLabel`、`formatCurrentCycle`。
- `AppSidebar` 接收 `visibleGroups`、当前路径、应用名和员工管理权限。
- `AppTopbar` 接收当前页面名称、可访问导航和用户信息。
- `NavigationCommand` 接收 `items: NavItem[]`，选择后通过 `useNavigate()` 跳转。

- [ ] **步骤 1：创建导航命令组件**

```tsx
export interface NavigationCommandProps {
  items: NavItem[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NavigationCommand({
  items,
  open,
  onOpenChange,
}: NavigationCommandProps) {
  const navigate = useNavigate();
  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="搜索功能或页面"
      description="仅搜索当前有权访问的系统功能"
      className="max-w-xl rounded-lg"
    >
      <CommandInput placeholder="搜索功能或页面" />
      <CommandList>
        <CommandEmpty>没有匹配的功能</CommandEmpty>
        <CommandGroup heading="可访问页面">
          {items.map((item) => (
            <CommandItem
              key={item.path}
              value={`${item.label} ${item.path}`}
              onSelect={() => {
                navigate(item.path);
                onOpenChange(false);
              }}
            >
              <item.icon className="size-4" />
              <span>{item.label}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
```

- [ ] **步骤 2：创建 `AppSidebar`**

组件必须使用现有 Sidebar 组件，并包含：

```tsx
<Sidebar variant="inset" collapsible="offcanvas" className="[font-size:14px]">
  <SidebarHeader className="gap-3 p-3">
    <Link to="/dashboard" className="flex h-10 items-center gap-3 px-2">
      <span className="grid size-8 place-items-center rounded-lg bg-[#171720] text-white">
        <Gauge className="size-4" />
      </span>
      <span className="truncate text-[16px] font-semibold">
        {appName || '绩效考核'}
      </span>
    </Link>
    <div className="flex h-10 items-center gap-2 rounded-lg border bg-background px-3 text-[12px]">
      <CalendarDays className="size-4 text-warning" />
      <span>{formatCurrentCycle(new Date())}</span>
    </div>
  </SidebarHeader>
  <SidebarContent className="px-2">
    {visibleGroups.map((group) => (
      <SidebarGroup key={group.label} className="px-0">
        <SidebarGroupLabel className="px-3 text-[11px]">
          {group.label}
        </SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            {group.items.map((item) => (
              <SidebarMenuItem key={item.path}>
                <SidebarMenuButton
                  asChild
                  isActive={isActivePath(pathname, item.path)}
                  className="h-10 rounded-lg px-3 text-[14px] data-[active=true]:border data-[active=true]:bg-background data-[active=true]:shadow-xs"
                >
                  <Link to={item.path}>
                    <item.icon className="size-4" />
                    <span>{item.label}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    ))}
  </SidebarContent>
  <SidebarFooter>
    {canViewEmployees && (
      <Button asChild variant="outline" className="h-auto justify-start p-3">
        <Link to="/employees">
          <UserPlus className="size-4" />
          <span>邀请团队成员</span>
        </Link>
      </Button>
    )}
  </SidebarFooter>
  <SidebarRail />
</Sidebar>
```

要求：

- 品牌链接到 `/dashboard`；
- 周期使用只读标签，不显示下拉箭头；
- 导航行高约 40px；
- 活跃导航使用白色背景、细边框和轻微阴影；
- 邀请入口只在 `employees:view` 权限存在时显示；
- 用户头像和主题切换移动到 `AppTopbar`；
- 主题切换保留现有 `localStorage` 行为。

- [ ] **步骤 3：创建 `AppTopbar`**

```tsx
export function AppTopbar({
  currentLabel,
  items,
  userInfo,
}: AppTopbarProps) {
  const [commandOpen, setCommandOpen] = React.useState(false);
  const [isDark, setIsDark] = React.useState(() =>
    document.documentElement.classList.contains('dark'),
  );

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setCommandOpen((open) => !open);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const toggleTheme = () => {
    const nextIsDark = !isDark;
    document.documentElement.classList.toggle('dark', nextIsDark);
    localStorage.setItem('theme', nextIsDark ? 'dark' : 'light');
    setIsDark(nextIsDark);
  };

  return (
    <>
      <header className="flex h-16 shrink-0 items-center gap-3 border-b px-4 lg:px-6">
        <SidebarTrigger className="md:hidden" />
        <p className="min-w-0 truncate text-[14px] font-semibold">
          {currentLabel}
        </p>
        <Button
          variant="ghost"
          onClick={() => setCommandOpen(true)}
          className="ml-auto h-9 w-full max-w-[420px] justify-start bg-muted px-3 text-[12px] text-muted-foreground"
        >
          <Search className="size-4" />
          <span>搜索功能或页面</span>
          <Kbd className="ml-auto hidden sm:inline-flex">⌘ K</Kbd>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          aria-label={isDark ? '切换到明亮主题' : '切换到暗色主题'}
          className="size-9"
        >
          {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </Button>
        <UserDisplay
          value={{ user_id: userInfo?.user_id, name: userInfo?.name }}
          size="medium"
          showLabel={false}
        />
      </header>
      <NavigationCommand
        items={items}
        open={commandOpen}
        onOpenChange={setCommandOpen}
      />
    </>
  );
}
```

- [ ] **步骤 4：重写 `Layout.tsx` 为组合层**

`Layout.tsx` 保留数据获取与 Provider，只负责：

```tsx
const visibleGroups = React.useMemo(
  () =>
    isLoading
      ? []
      : filterVisibleNavGroups({
          groups: navGroups,
          canRole: (role) => ability.can(role, ROLE_SUBJECT),
          permissions,
        }),
  [ability, isLoading, permissions],
);

const allItems = flattenNavItems(visibleGroups);
const currentLabel = getCurrentNavLabel(
  pathname,
  visibleGroups,
  breadcrumbLabel,
);

return (
  <SidebarProvider style={{ '--sidebar-width': '220px' } as React.CSSProperties}>
    <AppSidebar {...shellProps} />
    <SidebarInset className="min-w-0 overflow-hidden bg-white md:rounded-lg">
      <AppTopbar currentLabel={currentLabel} items={allItems} userInfo={userInfo} />
      <div
        key={pathname}
        className="@container/main min-w-0 flex-1 overflow-x-hidden px-4 py-5 lg:px-6"
      >
        <Outlet />
      </div>
    </SidebarInset>
  </SidebarProvider>
);
```

- [ ] **步骤 5：运行类型检查和现有导航测试**

```bash
npm run type:check:client
npx jest test/unit/app-shell-utils.spec.ts --runInBand
```

预期：均通过。

- [ ] **步骤 6：提交任务 2**

```bash
git add client/src/components/Layout.tsx client/src/components/app-shell
git commit -m "feat: redesign application shell"
```

---

### 任务 3：建立首页视图数据纯函数

**文件：**

- 新增：`client/src/pages/HomePage/dashboard-utils.ts`
- 新增：`test/unit/dashboard-utils.spec.ts`

**接口：**

- 输入：`DashboardOverviewResponse`、后端快捷入口、可访问路径和当前时间。
- 输出：
  - `getGreeting(date) => '早上好' | '下午好' | '晚上好'`
  - `buildProgress(stats) => { completed; pending; total; percentage }`
  - `buildQuickActions(shortcuts, visiblePaths) => DashboardQuickAction[]`
  - `mapGradeDistribution(record) => Array<{ grade; count }>`

- [ ] **步骤 1：先写首页纯函数失败测试**

```ts
import {
  buildProgress,
  buildQuickActions,
  getGreeting,
  mapGradeDistribution,
} from '../../client/src/pages/HomePage/dashboard-utils';

describe('dashboard view utilities', () => {
  it.each([
    [8, '早上好'],
    [14, '下午好'],
    [20, '晚上好'],
  ])('根据小时 %s 返回问候语', (hour, expected) => {
    const date = new Date('2026-07-17T00:00:00+08:00');
    date.setHours(hour);
    expect(getGreeting(date)).toBe(expected);
  });

  it('使用完成和待处理数量计算可信进度', () => {
    expect(buildProgress({ completedCount: 39, pendingCount: 11 }))
      .toEqual({ completed: 39, pending: 11, total: 50, percentage: 78 });
  });

  it('总数为零时返回零进度', () => {
    expect(buildProgress({ completedCount: 0, pendingCount: 0 }))
      .toEqual({ completed: 0, pending: 0, total: 0, percentage: 0 });
  });

  it('过滤无权限、根路径和重复快捷入口', () => {
    const result = buildQuickActions(
      [
        { title: '员工管理', path: '/employees' },
        { title: '我的自评', path: '/' },
        { title: '员工管理', path: '/employees' },
      ],
      new Set(['/employees']),
    );
    expect(result.map((item) => item.path)).toEqual(['/employees']);
  });

  it('将等级分布稳定排序', () => {
    expect(mapGradeDistribution({ B: 2, A: 4 })).toEqual([
      { grade: 'A', count: 4 },
      { grade: 'B', count: 2 },
    ]);
  });

  it('有成功数据时不被同一查询的旧错误覆盖', () => {
    expect(
      resolveSectionStatus({
        hasData: true,
        loading: false,
        error: new Error('旧错误'),
      }),
    ).toBe('ready');
  });

  it('两个区块可以独立解析为成功和失败', () => {
    expect(
      resolveSectionStatus({ hasData: true, loading: false, error: null }),
    ).toBe('ready');
    expect(
      resolveSectionStatus({
        hasData: false,
        loading: false,
        error: new Error('概览失败'),
      }),
    ).toBe('error');
  });
});
```

- [ ] **步骤 2：运行测试并确认失败**

```bash
npx jest test/unit/dashboard-utils.spec.ts --runInBand
```

预期：测试因 `dashboard-utils` 尚不存在而失败。

- [ ] **步骤 3：实现首页纯函数和快捷入口元数据**

```ts
export interface DashboardQuickAction {
  title: string;
  path: string;
  icon: LucideIcon;
  tone: 'blue' | 'orange' | 'purple' | 'green';
}

const QUICK_ACTION_META: Record<
  string,
  Pick<DashboardQuickAction, 'icon' | 'tone'>
> = {
  '/template-management': { icon: FileText, tone: 'blue' },
  '/publish-management': { icon: Send, tone: 'orange' },
  '/statistics': { icon: BarChart3, tone: 'purple' },
  '/employees': { icon: UserCog, tone: 'green' },
  '/my-assessments': { icon: ClipboardList, tone: 'blue' },
};

export function getGreeting(date: Date): '早上好' | '下午好' | '晚上好' {
  const hour = date.getHours();
  if (hour < 12) return '早上好';
  if (hour < 18) return '下午好';
  return '晚上好';
}

export function buildProgress(stats: {
  completedCount: number;
  pendingCount: number;
}) {
  const total = stats.completedCount + stats.pendingCount;
  return {
    completed: stats.completedCount,
    pending: stats.pendingCount,
    total,
    percentage: total === 0 ? 0 : Math.round((stats.completedCount / total) * 100),
  };
}

export function buildQuickActions(
  shortcuts: Array<{ title: string; path: string }>,
  visiblePaths: Set<string>,
): DashboardQuickAction[] {
  const seen = new Set<string>();
  return shortcuts.flatMap((shortcut) => {
    if (
      shortcut.path === '/' ||
      seen.has(shortcut.path) ||
      !visiblePaths.has(shortcut.path) ||
      !QUICK_ACTION_META[shortcut.path]
    ) {
      return [];
    }
    seen.add(shortcut.path);
    return [{ ...shortcut, ...QUICK_ACTION_META[shortcut.path] }];
  });
}

export function mapGradeDistribution(
  distribution?: Record<string, number>,
) {
  return Object.entries(distribution ?? {})
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([grade, count]) => ({ grade, count }));
}

export const PERMISSION_RESOURCE_PATHS: Partial<
  Record<PermissionResource, string[]>
> = {
  dashboard: ['/dashboard'],
  my_assessments: ['/my-assessments'],
  employees: ['/employees'],
  template_management: ['/template-management'],
  publish_management: ['/publish-management'],
  statistics: ['/statistics'],
  team_performance: ['/team-performance'],
  permission_management: ['/permissions'],
  grade_config: ['/grade-config'],
  dictionary_config: ['/dictionary'],
};

export function buildVisiblePaths(permissions: PermissionItem[]): Set<string> {
  return new Set(
    permissions
      .filter((permission) => permission.actions.includes('view'))
      .flatMap(
        (permission) => PERMISSION_RESOURCE_PATHS[permission.resource] ?? [],
      ),
  );
}

export type DashboardSectionStatus =
  | 'loading'
  | 'error'
  | 'empty'
  | 'ready';

export function resolveSectionStatus(args: {
  hasData: boolean;
  loading: boolean;
  error: unknown;
}): DashboardSectionStatus {
  if (args.hasData) return 'ready';
  if (args.loading) return 'loading';
  if (args.error) return 'error';
  return 'empty';
}
```

- [ ] **步骤 4：运行测试和类型检查**

```bash
npx jest test/unit/dashboard-utils.spec.ts --runInBand
npm run type:check:client
```

预期：均通过。

- [ ] **步骤 5：提交任务 3**

```bash
git add client/src/pages/HomePage/dashboard-utils.ts \
  test/unit/dashboard-utils.spec.ts
git commit -m "feat: add dashboard view model utilities"
```

---

### 任务 4：实现首页展示组件和局部错误处理

**文件：**

- 新增：`client/src/pages/HomePage/DashboardHero.tsx`
- 新增：`client/src/pages/HomePage/AssessmentProgressPanel.tsx`
- 新增：`client/src/pages/HomePage/DashboardQuickActions.tsx`
- 新增：`client/src/pages/HomePage/DashboardTodoGrid.tsx`
- 新增：`client/src/pages/HomePage/DashboardSummary.tsx`
- 新增：`client/src/pages/HomePage/DashboardCharts.tsx`
- 修改：`client/src/pages/HomePage/HomePage.tsx`

**接口：**

- 使用任务 3 的首页纯函数。
- `HomePage` 是唯一调用 `getTodos()` 和 `getOverview()` 的组件。
- 每个区块接收自己的 `loading`、`error`、`onRetry` 和数据。

- [ ] **步骤 1：实现欢迎区域**

```tsx
export function DashboardHero({
  userName,
  canPublish,
}: {
  userName?: string;
  canPublish: boolean;
}) {
  return (
    <section className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-[clamp(28px,3vw,34px)] font-semibold leading-tight">
          {getGreeting(new Date())}，
          <span className="font-serif font-medium">{userName || '同事'}</span>
        </h1>
        <p className="mt-2 text-[14px] text-muted-foreground">
          掌握考核进度，及时完成评分，让每一次反馈都有价值。
        </p>
      </div>
      {canPublish && (
        <Button asChild className="h-10 rounded-lg bg-[#171720] px-4">
          <Link to="/publish-management">
            <Plus className="size-4" />
            发布考核
          </Link>
        </Button>
      )}
    </section>
  );
}
```

- [ ] **步骤 2：实现进度、快捷入口和待办组件**

统一要求：

- 使用 `Card`，通过 `className="rounded-lg"` 将圆角限制为 8px；
- 进度卡只使用 `buildProgress()` 计算出的真实数据；
- 没有概览数据时显示骨架或区块错误，不硬编码数字；
- 快捷入口使用 `DashboardQuickAction[]`；
- 待办使用三列、两列、一列响应式网格；
- 待办卡片链接到 `/assessment/${todo.id}`；
- 待办区块为空时显示“暂无待办任务”；
- 待办失败只在该区块显示错误和重试按钮。

待办组件签名：

```ts
interface DashboardTodoGridProps {
  items: DashboardTodosResponse['items'];
  loading: boolean;
  error: unknown;
  onRetry: () => void;
}
```

- [ ] **步骤 3：实现摘要和图表组件**

摘要组件签名：

```ts
interface DashboardSummaryProps {
  stats?: DashboardOverviewResponse['stats'];
  loading: boolean;
  error: unknown;
  onRetry: () => void;
}
```

图表组件签名：

```ts
interface DashboardChartsProps {
  stats?: DashboardOverviewResponse['stats'];
  loading: boolean;
  error: unknown;
  onRetry: () => void;
}
```

图表继续使用现有 `ChartContainer`、`AreaChart` 和 `BarChart`。空数据时使用 `Empty`，请求失败时显示局部错误。

- [ ] **步骤 4：重写 `HomePage.tsx` 为组合层**

```tsx
const HomePage: React.FC = () => {
  const userInfo = useCurrentUserProfile();
  const { permissions } = usePermissions();

  const todosQuery = useQuery({
    queryKey: queryKeys.dashboard.todos(),
    queryFn: getTodos,
    select: (data) => data.items,
  });

  const overviewQuery = useQuery({
    queryKey: queryKeys.dashboard.overview(),
    queryFn: getOverview,
  });

  const visiblePaths = buildVisiblePaths(permissions);
  const canPublish = permissions.some(
    (permission) =>
      permission.resource === 'publish_management' &&
      permission.actions.includes('publish'),
  );
  const quickActions = buildQuickActions(
    overviewQuery.data?.shortcuts ?? [],
    visiblePaths,
  );
  const overviewState = {
    stats: overviewQuery.data?.stats,
    loading: overviewQuery.isLoading,
    error: overviewQuery.error,
    onRetry: () => overviewQuery.refetch(),
  };
  const todoState = {
    items: todosQuery.data ?? [],
    loading: todosQuery.isLoading,
    error: todosQuery.error,
    onRetry: () => todosQuery.refetch(),
  };

  return (
    <div className="flex flex-col gap-4 md:gap-5">
      <PageHeader title="绩效工作台" visuallyHidden />
      <DashboardHero userName={userInfo?.name} canPublish={canPublish} />
      <div className="grid gap-4 xl:grid-cols-[minmax(340px,.9fr)_minmax(520px,1.5fr)]">
        <AssessmentProgressPanel {...overviewState} />
        <DashboardQuickActions items={quickActions} loading={overviewQuery.isLoading} />
      </div>
      <DashboardTodoGrid {...todoState} />
      <DashboardSummary {...overviewState} />
      <DashboardCharts {...overviewState} />
    </div>
  );
};
```

`PERMISSION_RESOURCE_PATHS` 和 `buildVisiblePaths()` 在 `dashboard-utils.ts` 中定义为明确映射，不能通过字符串猜测路由。

- [ ] **步骤 5：运行单元测试、类型检查和 Lint**

```bash
npx jest test/unit/app-shell-utils.spec.ts test/unit/dashboard-utils.spec.ts --runInBand
npm run type:check:client
npx eslint client/src/components/Layout.tsx \
  client/src/components/app-shell \
  client/src/pages/HomePage
```

预期：全部通过。

- [ ] **步骤 6：提交任务 4**

```bash
git add client/src/pages/HomePage
git commit -m "feat: redesign performance dashboard"
```

---

### 任务 5：完整回归与响应式浏览器验证

**文件：**

- 仅在验证发现问题时修改任务 1 至任务 4 已涉及的文件。

**接口：**

- 不新增业务接口。
- 验证产物是通过的命令结果和桌面、平板、移动端截图。

- [ ] **步骤 1：运行完整自动化验证**

```bash
npm run type:check:client
npm test -- --runInBand
npm run lint
npm run build:client
```

预期：所有命令退出码为 0。

- [ ] **步骤 2：启动前端开发服务**

```bash
npm run dev:client
```

预期：Vite 输出可访问的本地 URL。若默认端口被占用，使用 Vite 提供的下一个端口。

- [ ] **步骤 3：验证桌面端 1440x900**

检查：

- 首屏与确认后的大字号 Demo 视觉一致；
- 侧边栏约 220px；
- 导航和正文可读；
- 当前周期是只读标签；
- `Cmd/Ctrl+K` 打开导航命令；
- 工作台进度和常用操作并排；
- 待办最多三列；
- 员工管理页没有被额外卡片包裹；
- 页面无意外横向滚动；
- 控制台无错误。

- [ ] **步骤 4：验证平板端 1024px**

检查：

- 进度和常用操作上下排列；
- 待办两列；
- 表格只在自身容器横向滚动；
- 顶部控件无重叠。

- [ ] **步骤 5：验证移动端 390px**

检查：

- 使用 Sheet 侧边栏；
- 首页单列；
- 标题、按钮和状态标签不重叠；
- 导航命令仍可打开和跳转；
- 页面没有整体横向滚动。

- [ ] **步骤 6：验证暗色主题**

检查侧边栏、顶部栏、蓝色进度面板、卡片边框、图表标签和错误状态对比度。

- [ ] **步骤 7：修复验证发现的问题并重复对应检查**

每次只修改一个明确问题，修改后至少重新运行：

```bash
npm run type:check:client
```

并重复出现问题的视口验证。

- [ ] **步骤 8：提交验证修正**

仅在任务 5 产生代码修改时执行：

```bash
git add client/src
git commit -m "fix: polish dashboard responsive layout"
```

---

## 最终完成条件

- 两个新增纯函数测试文件全部通过；
- 前端类型检查通过；
- 现有完整 Jest 测试通过；
- Lint 和前端构建通过；
- 桌面、平板和移动端截图验证通过；
- 暗色主题可读；
- Git 工作区干净；
- 实际页面与确认后的 HTML Demo 在布局、字号和信息层级上保持一致。
