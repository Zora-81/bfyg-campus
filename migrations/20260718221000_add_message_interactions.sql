-- ============================================================================
-- 宝丰一高校园频道 — 消息互动系统（点赞 / 转发）
-- 设计原则（规避 InsForge 限制）：
--   1) 点赞 = 独立关联表 message_likes(message_id, user_id)，Flarum 范式；
--      计数全前端聚合（一次查 message_likes 再 JS 计数），不维护计数列、
--      不建触发器，规避 "CLI 不能 CREATE FUNCTION" + "点赞者≠作者致 UPDATE 被 RLS 拒"。
--   2) 转发 = messages 加 forward_from + 快照列（HuLa 范式），转发是 INSERT 消息，
--      走现有 publish_message_realtime 触发器广播 new_message，天然实时。
--   3) 评论 = 复用现有 parent_id 真实回复（不发独立评论，扁平引用模型）。
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. 点赞关联表
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.message_likes (
  message_id UUID REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (message_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_likes_message ON public.message_likes(message_id);

-- ---------------------------------------------------------------------------
-- 2. 转发列（HuLa 范式：新消息引用原消息 + 快照作者/预览，原消息删了转发仍可读）
-- ---------------------------------------------------------------------------
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS forward_from   UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS forward_author TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS forward_preview TEXT DEFAULT '';

-- ---------------------------------------------------------------------------
-- 3. message_likes RLS
--    读取：所有已登录可见（计数 / 本人是否已赞都靠查这张表）。
--    写入：只能以自己身份赞 / 取消自己的赞。
-- ---------------------------------------------------------------------------
ALTER TABLE public.message_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "likes readable" ON public.message_likes
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "likes insert self" ON public.message_likes
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "likes delete self" ON public.message_likes
  FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- ---------------------------------------------------------------------------
-- 4. 授权
-- ---------------------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.message_likes TO authenticated;
