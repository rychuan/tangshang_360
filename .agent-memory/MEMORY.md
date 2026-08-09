# 项目记忆

## JSONB `?` 操作符在 drizzle sql 模板中被 monkey-patch 误判为参数占位符

- 现象：`sql`\`col ? ${param}`\`` 生成 SQL 含 `?` 字符，平台 drizzle-monkey-patch（@lark-apaas/nestjs-datapaas）的 queryWithCache 将 `?` 当作参数占位符，导致 500 "Failed query"
- 根因：monkey-patch 对 `?` 字符做了参数替换处理，与 PostgreSQL JSONB `?`（top-level key exists）操作符冲突
- 修复：用 `jsonb_exists(col, param)` 函数替代 `col ? param` 操作符；`jsonb_exists_any()` 替代 `?|`，`jsonb_exists_all()` 替代 `?&`

## pg_advisory_xact_lock 经 drizzle execute 报 "Failed query"

- 现象：事务内 `tx.execute(sql\`SELECT pg_advisory_xact_lock(...)\`)` 报 500 "Failed query"，cause 被 monkey-patch 序列化为 {}
- 根因：平台 drizzle-monkey-patch（@lark-apaas/nestjs-datapaas）的 queryWithCache 对 void 返回的 pg 函数调用处理失败；`pg_advisory_xact_lock` 返回 void 必失败，`pg_try_advisory_xact_lock` 返回 boolean 能正常执行（返回数组 `[{got_lock:true}]`）
- 修复：用 `pg_try_advisory_xact_lock(KEY) AS got_lock` 替代，取 `result[0].got_lock`，false 时抛 ConflictException

## isUserInRole presetGroup.isContainsAdmin 误判导致 reconciliation mismatch

- 现象：role 变更 update 时 processAuthorization 报 "Authorization role reconciliation mismatch"，verified 含 desired 之外的角色（如 admin）
- 根因：isUserInRole 用 `Boolean(presetGroup.isContainsAdmin)` 判定成员，该属性表示"角色含平台超管"，但代码不检查 userId 是否超管，导致所有用户被误判为该角色成员
- 修复：strict 模式（reconciliation）只看显式成员 userListMatch，忽略 allEmployees/isContainsAdmin 预设组（平台自动管理，不通过 add/remove 控制）

## getMyPermissions 并行调用重复触发 fetchUserRoles 导致 504 超时

- 现象：GET /api/employees/my/permissions 返回 504 `function_invoke_timeout`（120s，CPU 0.04 低 → I/O 等待型，非死循环）
- 根因：getMyPermissions 用 `Promise.all` 并行 `getUserEffectivePermissions` + `getScope`，两者内部都调 `getUserRoles(userId)`；缓存未命中时各自触发 `fetchUserRoles`（对每个角色调 `authzSDK.members.list` 分页，N+1 外部鉴权调用），外部调用翻倍打爆平台鉴权服务
- 修复：getMyPermissions 先 `await getUserRoles` 预取填充 60s 缓存，下游两方法命中缓存，避免重复外部调用

## AuthorizationSDK 成员列表分页导致非首页成员 403

- 现象：employee 角色有 56 个成员，但非 admin 用户打开系统显示 403；`GET /api/role_manager/roles/employee/members` 只返回 10 个成员，`hasMore: true`
- 根因：`fetchUserRoles` 用 `authzSDK.roles.list({ needMember: true, userID })` → `isUserInRoleMembers` 检查 `roleMembers.userList`，但 SDK 对 `userList` 默认分页 10 条/页；排名 10 以后的员工不在首页 → `fetchUserRoles` 返回空 → `getUserEffectivePermissions` 返回空 → 403
- 修复：①`fetchUserRoles` 在 `roles.length === 0 && !strict` 时回退查询 employee 表 `role` 字段（逗号分隔，如 `"employee,dept_head"`）；②`listMembers` 控制器在无 `page`/`pageSize` 参数时自动循环分页返回全部成员
- 注意：`authorization_roles` 字段不可靠（65 个员工中仅 6 个非空），用 `role` 字段兜底；strict 模式（reconciliation）不走兜底

## 全站 403：hasActiveEmployee 阻断 admin 权限 + 缺少初始 admin 引导

- 现象：所有页面重定向到 /403，`my-roles` 返回空 `roleList`，`my/permissions` 返回空 permissions
- 根因：`getUserEffectivePermissions` 和 `getScope` 均先检查 `hasActiveEmployee`，非员工用户直接返回空，不检查角色；新部署/沙箱中当前用户无角色且不在 employee 表
- 修复：①两方法改为先查 `getUserRoles`，admin 旁路 `hasActiveEmployee`；②新增 `POST /api/role_manager/bootstrap` 端点（`@NeedLogin` 无鉴权），开发环境直接将当前用户加入 admin 角色；③前端 `DefaultLandingRoute` 无权限时自动调 bootstrap 并刷新
- 注意：`rbac_role_manager` MOCK 对 `authzSDK.roles.list` 和 `@CanRole` 均无效，真正添加角色成员须用 `authzSDK.members.add`
