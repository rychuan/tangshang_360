# UI 组件使用规范

> 本文档为绩效考核系统全局 UI 组件使用标准，所有新增/修改页面必须严格遵循。

## 1. 基础规范

### 1.1 页面容器

- Layout 已统一提供 `container mx-auto p-6` 外层容器，**页面组件内部禁止重复添加 `p-6`**
- 页面内部布局使用 `space-y-6` 作为区块间距
- 页面根元素推荐：`<div className="space-y-6">`

### 1.2 标题层级

| 层级 | 用途 | 样式 |
|------|------|------|
| 一级标题 | 页面标题 | `text-2xl font-semibold tracking-tight` |
| 二级标题 | 区块标题 | `text-lg font-semibold mb-3` |
| 卡片标题 | Card 内标题 | `text-base` |

### 1.3 图标尺寸

| 场景 | 尺寸 |
|------|------|
| 按钮内图标 | `size-4` |
| 指标卡图标 | `size-5` |
| 标题旁图标 | `size-5` |
| 小按钮内图标 | `size-3` |

### 1.4 间距规范

| 场景 | 间距 |
|------|------|
| 按钮组 | `gap-2` |
| 表单元素 | `gap-3` |
| 页面区块 | `space-y-6` |
| 表格操作按钮 | `gap-1` |
| 筛选栏 | `gap-3` |

### 1.5 圆角与阴影

- 全局圆角由 `--radius: 0.125rem` (2px) 控制，禁止自定义 `rounded-*` 覆盖
- 全局无阴影（shadow 均为 transparent），禁止添加 `shadow-*` 类
- hover 效果统一使用 shadcn 组件内置的 `hover-elevate` 机制，禁止自定义 hover 背景色

---

## 2. 指标卡（Stat Card）规范

所有统计类指标卡必须使用以下统一结构：

```tsx
import { Card, CardContent } from '@/components/ui/card';

<Card data-ai-section-type="card-stat">
  <CardContent className="flex items-center gap-3 p-4">
    <div className="flex items-center justify-center size-10 rounded-lg bg-primary/10 text-primary">
      <Icon className="size-5" />
    </div>
    <div>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold text-foreground">{value}</p>
    </div>
  </CardContent>
</Card>
```

### 规则

- **必须**使用 shadcn `<Card>` + `<CardContent>` 作为容器，禁止自定义 div
- 图标容器固定 `size-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center`
- 标签固定 `text-sm text-muted-foreground`
- 数值固定 `text-2xl font-semibold text-foreground`
- 布局固定 `flex items-center gap-3 p-4`
- 如需区分颜色语义，使用语义 token：`text-success`、`text-warning`、`text-destructive` 等，禁止硬编码 `text-green-600` 等具体色值
- 网格布局：`grid grid-cols-2 gap-4 md:grid-cols-4` 或 `grid gap-3 sm:grid-cols-3`

### 禁止写法

```tsx
// ❌ 自定义 div 实现指标卡
<div className="rounded-lg border bg-card p-4">
  <span className="text-sm">{label}</span>
  <p className="text-2xl font-semibold">{value}</p>
</div>

// ❌ 硬编码颜色
<div className="bg-amber-50 text-amber-600">...</div>
```

---

## 3. 按钮规范

### 3.1 尺寸

| 场景 | 规则 |
|------|------|
| 主操作按钮 | 默认 `<Button>`（高度由组件控制） |
| 表格操作按钮 | `<Button variant="ghost" size="sm">` |
| 工具栏按钮 | `<Button variant="outline" size="sm">` |
| 图标按钮 | `<Button variant="outline" size="icon">` |

### 3.2 图标与文本

- 图标在文本左侧：`<Icon className="size-4 mr-2" />`（主按钮）或 `<Icon className="size-4 mr-1" />`（小按钮）
- 纯图标按钮不加文本

### 3.3 变体选择

| 场景 | variant |
|------|---------|
| 主要操作（创建/提交/发布） | `default`（不写 variant） |
| 次要操作（取消/返回） | `outline` |
| 危险操作（删除/停用） | `destructive` |
| 表格行内操作 | `ghost` |
| 筛选/工具栏 | `outline` |

### 3.4 按钮组间距

```tsx
<div className="flex items-center gap-2">
  <Button>主操作</Button>
  <Button variant="outline">次要操作</Button>
</div>
```

---

## 4. 卡片规范

### 4.1 容器卡片

- **必须**使用 shadcn `<Card>` 组件，禁止自定义 `div` + `border` 模拟卡片
- 边框由组件内置 `border` 提供，禁止额外添加 `border-border`
- 内边距使用 `<CardContent className="p-4">` 或默认 `p-6`

### 4.2 可点击卡片

```tsx
<Card className="hover:bg-accent/50 transition-colors cursor-pointer h-full">
  <CardContent className="flex items-center gap-4 p-4">
    {/* 内容 */}
  </CardContent>
</Card>
```

- hover 效果统一使用 `hover:bg-accent/50 transition-colors`
- 禁止自定义 hover 背景色

### 4.3 图表卡片

```tsx
<Card>
  <CardHeader>
    <CardTitle className="text-base">图表标题</CardTitle>
  </CardHeader>
  <CardContent>
    <ReactECharts option={option} className="h-[300px]" />
  </CardContent>
</Card>
```

---

## 5. 表单规范

### 5.1 输入框

- **必须**使用 shadcn `<Input>`，禁止原生 `<input>`
- 输入框高度由组件控制（默认 h-10），禁止覆盖
- 搜索框带图标时：

```tsx
<div className="relative flex-1 min-w-[200px]">
  <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
  <Input className="pl-9" placeholder="搜索..." />
</div>
```

### 5.2 标签

- 表单标签统一：`text-xs text-muted-foreground mb-1.5`
- 使用 `<Label>` 组件或原生 `<label>`

### 5.3 下拉选择

- **必须**使用 shadcn `<Select>` 组件，禁止原生 `<select>`（特殊情况可用 `NativeSelect`）
- SelectItem 的 value 禁止空值，占位用 `<SelectValue placeholder="..." />`

### 5.4 筛选栏布局

```tsx
<div className="flex flex-wrap gap-3 items-end">
  <div className="flex flex-col gap-1.5">
    <label className="text-xs text-muted-foreground">字段名</label>
    <Input className="w-36" />
  </div>
  {/* 更多筛选项 */}
  <Button>查询</Button>
</div>
```

- 筛选栏元素间距统一 `gap-3`
- 每个筛选项用 `flex flex-col gap-1.5` 包裹标签和控件

### 5.5 弹窗内表单

- 提交按钮统一放在弹窗右下角
- 按钮顺序：取消在左（`variant="outline"`），确认在右（`variant="default"`）
- 弹窗使用 shadcn `<Dialog>` 组件，禁止 `alert`/`confirm`/`prompt`

---

## 6. 表格规范

### 6.1 数据表格

- 使用 `@lark-apaas/client-toolkit/antd-table` 的 `<Table>` 组件
- 表头高度统一，行高统一
- 操作列宽度根据按钮数量设置（通常 200px）

### 6.2 操作按钮

```tsx
{
  title: '操作',
  key: 'actions',
  width: 200,
  render: (_, record) => (
    <div className="flex items-center gap-1">
      <Button variant="ghost" size="sm" onClick={() => handleView(record.id)}>
        <Eye className="size-4 mr-1" />
        查看
      </Button>
      <Button variant="ghost" size="sm" onClick={() => handleEdit(record.id)}>
        <Pencil className="size-4 mr-1" />
        编辑
      </Button>
    </div>
  ),
}
```

- 操作按钮统一 `variant="ghost" size="sm"`
- 操作区间距 `gap-1`
- 危险操作按钮额外加 `className="text-destructive"`

### 6.3 状态 Badge

- 使用 shadcn `<Badge>` 组件
- 状态映射使用语义化 className：
  - 待处理/进行中：`bg-warning text-warning-foreground`
  - 待签名：`bg-info text-info-foreground`
  - 已完成：`bg-success text-success-foreground`
  - 默认：`variant="secondary"`

---

## 7. 加载与空状态规范

### 7.1 加载状态

```tsx
// 页面级加载
<div className="flex items-center justify-center h-64">
  <Spinner className="size-8" />
</div>

// 区块级加载
<div className="flex items-center justify-center py-20">
  <Spinner className="size-6" />
</div>
```

- **必须**使用 `<Spinner>` 组件，禁止 `<p>加载中...</p>` 文本

### 7.2 空状态

```tsx
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from '@/components/ui/empty';

<Empty>
  <EmptyHeader>
    <EmptyMedia variant="icon">
      <SearchIcon className="size-6" />
    </EmptyMedia>
    <EmptyTitle>暂无数据</EmptyTitle>
    <EmptyDescription>当前没有找到相关内容</EmptyDescription>
  </EmptyHeader>
</Empty>
```

### 7.3 错误状态

```tsx
<div className="flex flex-col items-center justify-center h-64 gap-4">
  <p className="text-muted-foreground">{errorMessage}</p>
  <Button variant="outline" onClick={handleRetry}>重试</Button>
</div>
```

---

## 8. 图标规范

- **唯一图标库**：`lucide-react`，禁止 Emoji 和其他图标库
- 导入示例：`import { Plus, Search, Eye } from 'lucide-react'`
- 图标尺寸严格按 1.3 节执行

---

## 9. 图片规范

- **必须**使用 `@client/src/components/ui/image` 组件，禁止原生 `<img>`
- 响应式图片设置 `sizes`，固定尺寸设置 `width`

---

## 10. 签名图片例外

考核详情页的签名图片为 base64 数据 URL，允许使用原生 `<img>` 标签内联展示，因为：
- 数据来自数据库 `text` 字段（base64 编码）
- 需要内联展示在文本流中（`inline-block`）
- 非静态资源，无需响应式优化

```tsx
<img
  src={detail.selfSignImage}
  alt="本人签名"
  className="inline-block max-h-10 align-middle"
/>
```

---

## 11. 页面标题规范

每个页面顶部标题区域统一格式：

```tsx
<div className="flex items-center justify-between flex-wrap gap-4">
  <h1 className="text-2xl font-semibold tracking-tight">页面标题</h1>
  <div className="flex items-center gap-2">
    {/* 右侧操作按钮 */}
  </div>
</div>
```

- 标题样式统一 `text-2xl font-semibold tracking-tight`
- 标题与操作按钮使用 `justify-between` 布局
- 窄屏使用 `flex-wrap gap-4` 确保不溢出
