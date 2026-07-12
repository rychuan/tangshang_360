-- 严格串行流程引入 supervisor_sign：
-- self_review -> pending_sign(员工签名) -> supervisor_review -> supervisor_sign(上级签名) -> completed
--
-- 兼容旧流程中已经处于 pending_sign 的实例：
-- 1. 已有员工签名且上级评分已正式提交的，进入上级签名阶段。
-- 2. 员工未签但上级已提前签名的，清除上级签名，回到员工签名阶段。
UPDATE assessment_instance AS ai
SET status = 'supervisor_sign'
WHERE ai.status = 'pending_sign'
  AND ai.self_sign_name IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM rating_record AS rr
    WHERE rr.instance_id = ai.id
      AND rr.rating_type = 'supervisor'
      AND rr.is_draft = false
  );

UPDATE assessment_instance
SET
  supervisor_sign_name = NULL,
  supervisor_sign_at = NULL,
  supervisor_sign_image = NULL
WHERE status = 'pending_sign'
  AND self_sign_name IS NULL
  AND supervisor_sign_name IS NOT NULL;
