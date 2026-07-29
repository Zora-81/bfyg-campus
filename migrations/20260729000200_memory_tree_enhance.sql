-- ============================================================================
-- 记忆树 1.4.25：补齐帖子展示字段 + AI 评论标记 + 激活 AI 记忆档案员账号
-- ============================================================================

-- 1. 帖子展示字段（预置照片需要 title/location/year，与用户 content 帖区分）
ALTER TABLE public.memory_posts
  ADD COLUMN IF NOT EXISTS title      TEXT,
  ADD COLUMN IF NOT EXISTS location   TEXT,
  ADD COLUMN IF NOT EXISTS year       TEXT;

-- 2. 评论增加 AI 标记，便于前端展示特殊身份
ALTER TABLE public.memory_comments
  ADD COLUMN IF NOT EXISTS is_ai BOOLEAN NOT NULL DEFAULT false;

-- 3. 激活 AI 记忆档案员（跳过邮箱验证，仅供系统署名使用）
UPDATE auth.users
SET email_verified = true,
    raw_user_meta_data = jsonb_build_object('name', 'AI 记忆档案员')
WHERE email = 'ai-archivist@baofeng.campus';

-- 4. 确保 profiles 行存在（signup 因未验证邮箱未自动建档）
INSERT INTO public.profiles (id, email, username, nickname, role, status, email_verified, title)
SELECT id,
       email,
       'ai-archivist',
       'AI 记忆档案员',
       'ai',
       'active',
       true,
       'AI 记忆档案员'
FROM auth.users
WHERE email = 'ai-archivist@baofeng.campus'
ON CONFLICT (id) DO UPDATE
SET email_verified = true,
    nickname       = 'AI 记忆档案员',
    role           = 'ai',
    title          = 'AI 记忆档案员';
