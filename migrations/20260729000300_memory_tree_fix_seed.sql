-- 修正记忆树云端种子数据：发布人应为真实管理员账户（管理员T0），而非 'W'
-- 同时补充管理员 UPDATE 策略，便于未来后台编辑。

-- 1) 修正种子帖子发布人
UPDATE public.memory_posts
  SET author_name = '管理员T0',
      author_id   = '176a6707-9234-4e1c-bda6-42f8d5231bc1'
  WHERE author_name = 'W'
     OR author_id IS NULL;

-- 2）修正种子评论作者（若仍是占位）
UPDATE public.memory_comments
  SET author_name = 'AI 记忆档案员'
  WHERE author_name IS NULL OR author_name = '';

-- 3）补充管理员 UPDATE 策略（帖子/评论），与 DELETE 策略一致
DROP POLICY IF EXISTS "memory_posts admin update" ON public.memory_posts;
CREATE POLICY "memory_posts admin update"
  ON public.memory_posts FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "memory_comments admin update" ON public.memory_comments;
CREATE POLICY "memory_comments admin update"
  ON public.memory_comments FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
