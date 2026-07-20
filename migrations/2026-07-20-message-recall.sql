-- ============================================================================
-- 消息撤回功能
-- 1) messages 表增加撤回标记字段
-- 2) RESTRICTIVE RLS 策略：限制只有「作者本人且发送 1 分钟内」或「管理员」
--    才能把 is_recalled 置为 true，且禁止借机篡改其他字段（content/置顶等）。
--    叠加在现有 permissive "messages update" 之上，收紧 UPDATE 权限。
-- ============================================================================

-- 1) 字段 -------------------------------------------------------------------
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS is_recalled  BOOLEAN     DEFAULT false,
  ADD COLUMN IF NOT EXISTS recalled_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS recalled_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- 2) RLS：撤回策略（RESTRICTIVE，否决一切不满足条件的 UPDATE） --------------
-- ⚠️ InsForge 的 RLS 不支持在策略中引用 NEW/OLD（报 "missing FROM-clause entry
--    for table new"），因此无法做「列不变」校验。改用 USING 限定「可被更新的行」：
--    仅「作者本人且发送 1 分钟内」或「管理员」的行允许 UPDATE；其余行一律拒绝。
--    时间闸由服务端 NOW() 判断，前端无法伪造；撤回只 PATCH is_recalled 字段。
DROP POLICY IF EXISTS "messages recall restrictive" ON public.messages;

CREATE POLICY "messages recall restrictive"
ON public.messages
AS RESTRICTIVE
FOR UPDATE TO authenticated
USING (
  public.is_admin()
  OR
  (
    author_id = (SELECT auth.uid())
    AND NOW() - created_at < interval '1 minute'
  )
)
WITH CHECK (true);
