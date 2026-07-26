# 项目记忆

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
