-- ============================================================================
-- 公告栏（announcement）放开评论：仅管理员可发布主楼，全员可对公告评论/回复
-- 修改现有 RESTRICTIVE 策略 "messages announcement admin only"：
--   原策略禁止一切非管理员对 announcement 频道的 INSERT（含评论）。
--   现增加例外：当插入的消息带 parent_id（即评论/回复）时，所有已登录用户均可插入；
--   主楼消息（parent_id IS NULL）仍仅限管理员。
-- 与现有 permissive 策略 "messages insert" 叠加：permissive 允许登录用户以作者身份插入，
--   本 RESTRICTIVE 策略在 announcement 频道额外加闸，但为评论开绿灯。
-- ============================================================================

DROP POLICY IF EXISTS "messages announcement admin only" ON public.messages;

CREATE POLICY "messages announcement admin only"
ON public.messages
AS RESTRICTIVE
FOR INSERT
TO authenticated
WITH CHECK (
  -- 非公告频道：不受限
  NOT EXISTS (
    SELECT 1 FROM public.channels
    WHERE id = channel_id AND type = 'announcement'
  )
  OR public.is_admin()                                  -- 管理员：可发布/评论任意
  OR (parent_id IS NOT NULL)                            -- 非管理员：仅可插入评论/回复（带 parent_id）
);
