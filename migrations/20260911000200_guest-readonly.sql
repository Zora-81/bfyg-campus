-- ============================================================================
-- 2026-09-11  游客只读访问（guest read-only）
-- ----------------------------------------------------------------------------
-- 目标：未登录游客可读全站公开内容（频道 / 消息 / 用户资料 / 记忆树），
--       但不能写入任何内容。发言由前端弹注册面板引导（见 P6）。
--
-- 改前实测（anon key，无会话）：
--   profiles  -> []        channels -> []        messages -> []
--   memory_posts -> 有数据（已对 anon 开放）
-- 原因：channels/messages/profiles 的 SELECT 策略均为 TO authenticated，
--       且未授予 anon 表级 SELECT（虽然存在列级 GRANT，但没有策略仍读不到行）。
--
-- 本迁移只做三件事：
--   1) 为 channels / messages / profiles 新增 anon 的 SELECT 策略；
--   2) 补 anon 的表级 SELECT 授权（策略通过后仍需 GRANT 才能读到列）；
--   3) 收紧 anon 的写权限：撤销 profiles 的写授权（游客绝不能改资料），
--      并把敏感列（email / warning_count / muted_until）对 anon 收回。
--
-- 安全说明（重要）：
--   profiles 含 email 等敏感列。为不让游客读到这些，
--   先 REVOKE anon 在 profiles 上的全部授权，再**按列**精确授予展示所需字段。
--   同时撤销 anon 在 profiles 上的 INSERT/UPDATE/DELETE（游客不可注册/改资料 —— 注册走正式 auth）。
--
-- 不做的事（避免扩大范围）：
--   · 不给 anon 开放 notifications（游客无通知）
--   · 不给 anon 开放 message_likes（点赞已整体砍掉）
--   · 不改 memory_posts / memory_comments 的既有策略（记忆树匿名读写按产品决策保留）
--
-- 幂等：DROP POLICY IF EXISTS + CREATE POLICY；GRANT/REVOKE 可重复执行。
-- 回滚：见文件末尾。
-- ============================================================================

BEGIN;

-- ── 1. 撤销 anon 在 profiles 上的过宽授权，改为按列精确授予 ──────────────────
REVOKE ALL PRIVILEGES ON public.profiles FROM anon;
-- 仅授予公开展示所需列（**不含** email / warning_count / muted_until）
--   · status   : 禁言状态标记，前端需据此隐藏输入框，非敏感
--   · cvv      : 产品定义即「幸运数字，全员可见」（见 app.js 卡面编辑提示文案）
GRANT SELECT (id, username, nickname, avatar_url, role, title, status, created_at, card_skin, signature, cvv)
  ON public.profiles TO anon;

-- ── 2. channels / messages：补表级 SELECT 给 anon ───────────────────────────
GRANT SELECT ON public.channels TO anon;
GRANT SELECT ON public.messages TO anon;

-- ── 3. RLS 策略：让 anon 读得到行 ──────────────────────────────────────────
DROP POLICY IF EXISTS "channels readable" ON public.channels;
CREATE POLICY "channels readable" ON public.channels
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "messages readable" ON public.messages;
CREATE POLICY "messages readable" ON public.messages
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "profiles readable by authenticated" ON public.profiles;
DROP POLICY IF EXISTS "profiles readable" ON public.profiles;
CREATE POLICY "profiles readable" ON public.profiles
  FOR SELECT TO anon, authenticated USING (true);

-- ── 4. 游客绝不能写 ────────────────────────────────────────────────────────
-- profiles：撤销写授权（注册流程走正式 auth.signUp，不依赖 anon 直写）
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.profiles FROM anon;

-- channels / messages：撤销写授权，确保游客只能读
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.channels FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.messages FROM anon;

-- notifications：游客无通知，撤销一切
REVOKE ALL PRIVILEGES ON public.notifications FROM anon;

COMMIT;

-- ============================================================================
-- 回滚：
--   DROP POLICY IF EXISTS "channels readable" ON public.channels;
--   CREATE POLICY "channels readable" ON public.channels FOR SELECT TO authenticated USING (true);
--   -- 同理恢复 messages / profiles 的旧策略（见 migrations/20260716081609_init-campus-schema.sql）
--   REVOKE SELECT ON public.channels, public.messages FROM anon;
--   REVOKE SELECT (id,username,...) ON public.profiles FROM anon;
--   GRANT ALL PRIVILEGES ON public.profiles, public.channels, public.messages TO anon;  -- 恢复原先的宽松授权
-- ============================================================================
