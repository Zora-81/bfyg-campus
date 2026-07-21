-- ============================================================================
-- 公告栏（announcement 类型频道）仅允许管理员发消息
-- 与现有 permissive 策略 "messages insert" 叠加：
--   permissive 策略允许所有已登录用户以作者身份插入；
--   本 RESTRICTIVE 策略额外要求：目标频道为 announcement 时必须是管理员。
-- ============================================================================

DROP POLICY IF EXISTS "messages announcement admin only" ON public.messages;

CREATE POLICY "messages announcement admin only"
ON public.messages
AS RESTRICTIVE
FOR INSERT
TO authenticated
WITH CHECK (
  NOT EXISTS (
    SELECT 1 FROM public.channels
    WHERE id = channel_id AND type = 'announcement'
  )
  OR public.is_admin()
);
