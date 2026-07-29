-- ============================================================================
-- 记忆树（星空档案）数据模型
-- 先发后审：留言/评论发完即可见；管理员可删帖（待接入 service key 走 Worker）。
-- created_at 用 bigint 毫秒，与前端 localStorage 行为一致（new Date(ts) 兼容）。
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.memory_posts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content     text NOT NULL,
  author_name text NOT NULL DEFAULT '匿名同学',
  anonymous   boolean NOT NULL DEFAULT false,
  image_url   text NOT NULL DEFAULT '',
  author_id   uuid,
  reviewed    boolean NOT NULL DEFAULT false,
  created_at  bigint NOT NULL DEFAULT (extract(epoch from now()) * 1000)::bigint
);

CREATE TABLE IF NOT EXISTS public.memory_comments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id     uuid NOT NULL REFERENCES public.memory_posts(id) ON DELETE CASCADE,
  content     text NOT NULL,
  author_name text NOT NULL DEFAULT '匿名同学',
  author_id   uuid,
  status      integer NOT NULL DEFAULT 1,   -- 1 已审/可见, 0 待审, -1 驳回
  created_at  bigint NOT NULL DEFAULT (extract(epoch from now()) * 1000)::bigint
);

CREATE INDEX IF NOT EXISTS idx_memory_posts_created ON public.memory_posts (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_memory_comments_item ON public.memory_comments (item_id, created_at ASC);

-- ---------- RLS ----------
ALTER TABLE public.memory_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memory_comments ENABLE ROW LEVEL SECURITY;

-- 帖子：任何人可读（全员可见）；任何人可发（先发后审）；删除/改仅管理员
DROP POLICY IF EXISTS "memory_posts anon read" ON public.memory_posts;
CREATE POLICY "memory_posts anon read"
  ON public.memory_posts FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "memory_posts anon insert" ON public.memory_posts;
CREATE POLICY "memory_posts anon insert"
  ON public.memory_posts FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "memory_posts admin write" ON public.memory_posts;
CREATE POLICY "memory_posts admin write"
  ON public.memory_posts FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- 评论：仅已审(1)可见；任何人可评（默认已审=先发后审）；删除/改仅管理员
DROP POLICY IF EXISTS "memory_comments anon read" ON public.memory_comments;
CREATE POLICY "memory_comments anon read"
  ON public.memory_comments FOR SELECT
  TO anon, authenticated
  USING (status = 1);

DROP POLICY IF EXISTS "memory_comments anon insert" ON public.memory_comments;
CREATE POLICY "memory_comments anon insert"
  ON public.memory_comments FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "memory_comments admin write" ON public.memory_comments;
CREATE POLICY "memory_comments admin write"
  ON public.memory_comments FOR DELETE
  TO authenticated
  USING (public.is_admin());
