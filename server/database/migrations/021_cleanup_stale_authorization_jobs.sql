BEGIN;

-- 清理孤儿授权同步任务：
-- 017 迁移只 bump 了 authorization_version 并置 synced，未为旧版本建 job，
-- 且正常情况下每员工只有一个 job 会走到终态，历史版本残留的 pending/processing
-- job 永远不会再被处理（process 按当前版本取 job）。统一置为 superseded，
-- 避免审计/排查时看到永远 pending 的任务。幂等，可重复执行。

UPDATE authorization_sync_job AS job
SET status = 'superseded',
    error_message = COALESCE(
      job.error_message,
      'Superseded: stale job for an older authorization version'
    ),
    completed_at = COALESCE(job.completed_at, CURRENT_TIMESTAMP)
FROM employee AS emp
WHERE (emp.employee_id).user_id = (job.employee_id).user_id
  AND job.status IN ('pending', 'processing')
  AND job.authorization_version < emp.authorization_version;

COMMIT;
