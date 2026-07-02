# 绩效模板删除功能 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans.

**Goal:** 在模板管理模块增加软删除功能 — 后端 DELETE 端点 + 前端删除按钮。

**Architecture:** 现有 `assessment-template` 模块追加 `delete` 方法，前端已停用模板行显示删除按钮。

**Tech Stack:** NestJS 10 + Drizzle ORM + React 19 + shadcn/ui。

## Global Constraints

- 软删除：设 `deleted_at`，不物理删除
- 级联停用关联的 `employee_binding`（status = 'inactive'）
- 权限：admin + hrd，使用已有 `template_management` `delete` action
- schema.ts 自动生成，`deleted_at` 字段已存在

---

### Task 1: 后端 Service — delete 方法 + list 过滤

**Files:**
- Modify: `server/modules/assessment-template/assessment-template.service.ts`

- [ ] **Step 1: 添加 import 和 delete 方法**

新增 import（顶部追加）：
```typescript
import { employeeBinding, auditLog } from '@server/database/schema';
```

`list()` 方法 conditions 开头插入：`isNull(assessmentTemplate.deletedAt)`

新增方法（在 `activate()` 之后）：
```typescript
async delete(id: string, userId: string): Promise<SuccessResponse> {
  const templates = await this.db
    .select()
    .from(assessmentTemplate)
    .where(and(eq(assessmentTemplate.id, id), isNull(assessmentTemplate.deletedAt)))
    .limit(1);

  if (templates.length === 0) {
    throw new NotFoundException('模板不存在');
  }

  // 级联停用关联绑定
  await this.db
    .update(employeeBinding)
    .set({ status: 'inactive' })
    .where(eq(employeeBinding.templateId, id));

  // 软删除
  await this.db
    .update(assessmentTemplate)
    .set({ deletedAt: new Date() as any })
    .where(eq(assessmentTemplate.id, id));

  // 审计
  await this.db.insert(auditLog).values({
    operatorId: userId,
    action: 'delete_template',
    targetType: 'assessment_template',
    targetId: id,
    changes: { before: { name: templates[0].name } },
  });

  return { success: true };
}
```

- [ ] **Step 2: 提交**

```bash
git add server/modules/assessment-template/assessment-template.service.ts
git commit -m "feat: add template soft-delete service method"
```

---

### Task 2: 后端 Controller — DELETE 端点

**Files:**
- Modify: `server/modules/assessment-template/assessment-template.controller.ts`

- [ ] **Step 1: 添加 DELETE 端点**

在 import 中添加 `Delete, Req`，在 `activate()` 方法后添加：
```typescript
@CanRole(['admin', 'hrd'])
@RequirePermission('template_management', 'delete')
@NeedLogin()
@Delete(':id')
async delete(
  @Req() req: any,
  @Param('id') id: string,
): Promise<SuccessResponse> {
  const { userId } = req.userContext as { userId: string };
  return this.service.delete(id, userId);
}
```

- [ ] **Step 2: 提交**

```bash
git add server/modules/assessment-template/assessment-template.controller.ts
git commit -m "feat: add DELETE endpoint for template"
```

---

### Task 3: 前端 API Client

**Files:**
- Modify: `client/src/api/assessment-template.ts`

- [ ] **Step 1: 添加 remove 函数**

在文件末尾添加：
```typescript
export async function remove(id: string): Promise<SuccessResponse> {
  const res = await axiosForBackend<SuccessResponse>({
    url: `/api/assessment-templates/${id}`,
    method: 'DELETE',
  });
  return res.data;
}
```

- [ ] **Step 2: 提交**

```bash
git add client/src/api/assessment-template.ts
git commit -m "feat: add template remove API client"
```

---

### Task 4: 前端页面 — 删除按钮 + 确认对话框

**Files:**
- Modify: `client/src/pages/TemplateManagement/TemplateManagementPage.tsx`

- [ ] **Step 1: 添加删除按钮和对话框**

a) 新增 import：`Trash2` from lucide-react

b) 新增 state：`const [deleteId, setDeleteId] = useState<string | null>(null);`

c) 新增 handleDelete：
```typescript
const handleDelete = async () => {
  if (!deleteId) return;
  try {
    await assessmentTemplateApi.remove(deleteId);
    toast.success('模板已删除');
    setDeleteId(null);
    await fetchList();
  } catch (err: unknown) {
    handleApiError(err);
  }
};
```

d) 操作列中，停用按钮之后新增删除按钮（仅已停用模板）：
```tsx
{!item.isActive && (
  <CanRole roles={['admin', 'hrd']}>
    <CanDo resource="template_management" action="delete">
      <Button
        variant="destructive"
        size="sm"
        onClick={() => setDeleteId(item.id)}
      >
        <Trash2 data-icon="inline-start" />
        删除
      </Button>
    </CanDo>
  </CanRole>
)}
```

e) 在 JSX 末尾（停用 AlertDialog 之后）新增删除确认对话框：
```tsx
<AlertDialog
  open={!!deleteId}
  onOpenChange={(open: boolean) => { if (!open) setDeleteId(null); }}
>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>确认删除</AlertDialogTitle>
      <AlertDialogDescription>
        删除后模板将被移除（关联数据保留、绑定关系自动停用）。此操作不可撤销，确认删除？
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>取消</AlertDialogCancel>
      <AlertDialogAction
        onClick={handleDelete}
        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
      >
        确认删除
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

- [ ] **Step 2: 提交**

```bash
git add client/src/pages/TemplateManagement/TemplateManagementPage.tsx
git commit -m "feat: add delete button and confirmation dialog for templates"
```
