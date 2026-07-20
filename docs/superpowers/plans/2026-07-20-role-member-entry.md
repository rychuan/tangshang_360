# Role Member Entry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a persistent blue member entry button to each role card that selects the role and opens its existing member management tab.

**Architecture:** `PermissionPage` remains the owner of the selected role and active tab state. `RoleListPanel` receives a focused `onOpenMembers` callback and invokes it from a button that stops card click propagation.

**Tech Stack:** React 19, TypeScript, Tailwind CSS 4, shadcn/ui, lucide-react

## Global Constraints

- Keep the existing “权限配置” and “成员管理” tabs.
- Do not change backend APIs, member queries, member mutations, or authorization rules.
- Keep role card selection, editing, and deletion behavior intact.

---

### Task 1: Add the role member entry

**Files:**

- Modify: `client/src/pages/EmployeeManagement/PermissionPage.tsx`
- Modify: `client/src/pages/EmployeeManagement/RoleListPanel.tsx`

**Interfaces:**

- Consumes: `setSelectedRole(role: ForceRoleDTO)` and `setActiveTab('members')` in `PermissionPage`.
- Produces: `onOpenMembers(role: ForceRoleDTO): void` prop on `RoleListPanel`.

- [ ] **Step 1: Add the page-level member navigation callback**

Add this handler in `PermissionPage`:

```tsx
const handleOpenMembers = (role: ForceRoleDTO) => {
  setSelectedRole(role);
  setActiveTab('members');
};
```

Pass it to `RoleListPanel`:

```tsx
onOpenMembers = { handleOpenMembers };
```

- [ ] **Step 2: Add the member callback to the role list interface**

Extend `RoleListPanelProps`:

```tsx
onOpenMembers: (role: ForceRoleDTO) => void;
```

Destructure `onOpenMembers` in the component arguments.

- [ ] **Step 3: Render the persistent blue member button**

Import the `Users` icon and add this button before the existing edit/delete controls:

```tsx
<Button
  size="sm"
  className="h-7 shrink-0 gap-1 px-2"
  onClick={(event) => {
    event.stopPropagation();
    onOpenMembers(role);
  }}
>
  <Users className="size-3.5" />
  成员
</Button>
```

Keep the edit/delete controls in their existing hover-only wrapper so only the member entry is permanently visible.

- [ ] **Step 4: Format and type-check the modified files**

Run:

```bash
npx prettier --write client/src/pages/EmployeeManagement/PermissionPage.tsx client/src/pages/EmployeeManagement/RoleListPanel.tsx
npm run type:check:client
```

Expected: Prettier completes and TypeScript exits with status `0`.

- [ ] **Step 5: Build and manually verify**

Run:

```bash
npm run build:client
```

Expected: production client build exits with status `0`.

In the browser verify:

1. Every role card shows a blue “成员” button on its right side.
2. Clicking the button selects that role and activates “成员管理”.
3. The member count and content correspond to the selected role.
4. Clicking the card, switching tabs, editing, and deleting behave as before.

- [ ] **Step 6: Commit the implementation**

```bash
git add client/src/pages/EmployeeManagement/PermissionPage.tsx client/src/pages/EmployeeManagement/RoleListPanel.tsx docs/superpowers/plans/2026-07-20-role-member-entry.md
git commit -m "feat: add role member entry button"
```
