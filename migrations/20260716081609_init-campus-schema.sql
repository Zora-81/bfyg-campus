-- ============================================================================
-- 宝丰一高校园频道 — InsForge 初始 Schema
-- 适配自原 SQLite 5 表；认证移交 InsForge auth.users，应用字段放 profiles。
-- 所有用户外键指向 auth.users(id)（UUID）。不使用 BEGIN/COMMIT（后端事务包裹）。
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. profiles —— 应用专属用户资料（密码/登录由 InsForge Auth 托管）
--    原 users 表的 username/password_hash/nickname/avatar/role/status 拆为：
--    password_hash 移除（Auth 负责），其余进 profiles。
-- ---------------------------------------------------------------------------
CREATE TABLE public.profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username    TEXT UNIQUE NOT NULL,
  nickname    TEXT NOT NULL,
  avatar_url  TEXT DEFAULT '',
  role        TEXT DEFAULT 'student',          -- student | teacher | admin
  status      TEXT DEFAULT 'active',           -- active | disabled
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- 2. channels
-- ---------------------------------------------------------------------------
CREATE TABLE public.channels (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT UNIQUE NOT NULL,
  description TEXT DEFAULT '',
  type        TEXT DEFAULT 'public',           -- public | private
  created_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- 3. messages
-- ---------------------------------------------------------------------------
CREATE TABLE public.messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id  UUID REFERENCES public.channels(id) ON DELETE CASCADE,
  author_id   UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  content     TEXT NOT NULL,
  content_type TEXT DEFAULT 'text',            -- text | image | file
  is_pinned   BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- 4. channel_members
-- ---------------------------------------------------------------------------
CREATE TABLE public.channel_members (
  user_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  channel_id UUID REFERENCES public.channels(id) ON DELETE CASCADE,
  joined_at  TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, channel_id)
);

-- ---------------------------------------------------------------------------
-- 5. notifications
-- ---------------------------------------------------------------------------
CREATE TABLE public.notifications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  type       TEXT NOT NULL DEFAULT 'mention', -- mention | system
  title      TEXT NOT NULL,
  body       TEXT DEFAULT '',
  link       TEXT DEFAULT '',
  is_read    BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- 6. 索引
-- ---------------------------------------------------------------------------
CREATE INDEX idx_messages_channel  ON public.messages(channel_id, created_at);
CREATE INDEX idx_messages_author   ON public.messages(author_id);
CREATE INDEX idx_notifications_user ON public.notifications(user_id, is_read);
CREATE INDEX idx_channel_members_channel ON public.channel_members(channel_id);

-- ---------------------------------------------------------------------------
-- 7. RLS 辅助函数（SECURITY DEFINER 绕过被查表的 RLS，避免递归）
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_channel_member(ch UUID)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.channel_members
    WHERE channel_id = ch AND user_id = (SELECT auth.uid())
  );
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = (SELECT auth.uid()) AND role = 'admin'
  );
$$;

-- ---------------------------------------------------------------------------
-- 8. 启用 RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channels        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channel_members  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications   ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 9. profiles 策略
--    读取：所有已登录用户可见（聊天需展示作者昵称/头像）。
--    写入：只能建/改自己的资料；role/status 用列级授权锁定，防止越权升级。
-- ---------------------------------------------------------------------------
CREATE POLICY "profiles readable by authenticated" ON public.profiles
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "profiles insert self" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (id = (SELECT auth.uid()));

CREATE POLICY "profiles update self" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = (SELECT auth.uid()))
  WITH CHECK (id = (SELECT auth.uid()));

REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (nickname, avatar_url) ON public.profiles TO authenticated;

-- ---------------------------------------------------------------------------
-- 10. channels 策略
--      读取：已登录可见（校园社区频道列表公开）。
--      写入：创建者建/改/删；管理员可改/删任意频道。
-- ---------------------------------------------------------------------------
CREATE POLICY "channels readable" ON public.channels
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "channels insert" ON public.channels
  FOR INSERT TO authenticated
  WITH CHECK (created_by = (SELECT auth.uid()));

CREATE POLICY "channels update" ON public.channels
  FOR UPDATE TO authenticated
  USING (created_by = (SELECT auth.uid()) OR public.is_admin())
  WITH CHECK (created_by = (SELECT auth.uid()) OR public.is_admin());

CREATE POLICY "channels delete" ON public.channels
  FOR DELETE TO authenticated
  USING (created_by = (SELECT auth.uid()) OR public.is_admin());

-- ---------------------------------------------------------------------------
-- 11. messages 策略
--      读取：已登录可见（校园内全员可见，匹配原 UX）。
--      写入：以自己身份发；改/删限作者本人或管理员。
-- ---------------------------------------------------------------------------
CREATE POLICY "messages readable" ON public.messages
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "messages insert" ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (author_id = (SELECT auth.uid()));

CREATE POLICY "messages update" ON public.messages
  FOR UPDATE TO authenticated
  USING (author_id = (SELECT auth.uid()) OR public.is_admin())
  WITH CHECK (author_id = (SELECT auth.uid()) OR public.is_admin());

CREATE POLICY "messages delete" ON public.messages
  FOR DELETE TO authenticated
  USING (author_id = (SELECT auth.uid()) OR public.is_admin());

-- ---------------------------------------------------------------------------
-- 12. channel_members 策略
--      读取：看自己的成员关系，及所在频道的成员列表（经 SECURITY DEFINER 辅助函数，无递归）。
--      写入：只能以自己身份加入/退出。
-- ---------------------------------------------------------------------------
CREATE POLICY "channel_members readable" ON public.channel_members
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR public.is_channel_member(channel_id));

CREATE POLICY "channel_members insert" ON public.channel_members
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "channel_members delete" ON public.channel_members
  FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- ---------------------------------------------------------------------------
-- 13. notifications 策略（仅本人）
-- ---------------------------------------------------------------------------
CREATE POLICY "notifications all self" ON public.notifications
  FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- ---------------------------------------------------------------------------
-- 14. 授权（RLS 不替代 GRANT；运行时角色需有操作权限）
-- ---------------------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO anon, authenticated;

GRANT SELECT ON public.profiles TO authenticated;
GRANT INSERT, UPDATE ON public.profiles TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.channels TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO authenticated;

GRANT SELECT, INSERT, DELETE ON public.channel_members TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
