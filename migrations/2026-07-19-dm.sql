-- ============================================================================
-- 宝丰一高校园频道 — 好友私聊（DM）+ 安全修复
-- 复用 channels / channel_members / messages，type='dm' 区分私聊房间。
-- 注意：db query 不支持 CREATE FUNCTION，须用 db import 执行本文件。
-- ============================================================================

-- 1. 开/取私聊房间（幂等，仅好友可开）
CREATE OR REPLACE FUNCTION public.find_or_create_dm(p_friend_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_me       uuid := auth.uid();
  v_existing uuid;
  v_chan_id  uuid;
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('error', 'not authenticated');
  END IF;
  IF p_friend_id IS NULL OR p_friend_id = v_me THEN
    RETURN jsonb_build_object('error', 'invalid friend');
  END IF;

  -- 必须双方已为好友关系（accepted），陌生人无法打开 DM
  IF NOT EXISTS (
    SELECT 1 FROM public.friends f
    WHERE ((f.user_id = v_me AND f.friend_id = p_friend_id)
        OR (f.user_id = p_friend_id AND f.friend_id = v_me))
      AND f.status = 'accepted'
  ) THEN
    RETURN jsonb_build_object('error', 'only friends can chat');
  END IF;

  -- 已存在两人私有房间则直接返回
  SELECT c.id INTO v_existing
  FROM channels c
  WHERE c.type = 'dm'
    AND EXISTS (SELECT 1 FROM channel_members cm1 WHERE cm1.channel_id = c.id AND cm1.user_id = v_me)
    AND EXISTS (SELECT 1 FROM channel_members cm2 WHERE cm2.channel_id = c.id AND cm2.user_id = p_friend_id)
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('id', v_existing, 'existing', true);
  END IF;

  -- name 用内部唯一标识避免 UNIQUE 冲突；type='dm' 使前端可过滤不进公共频道列表
  INSERT INTO channels (name, description, type, created_by)
  VALUES ('dm:' || v_me::text || ':' || p_friend_id::text, 'private chat', 'dm', v_me)
  RETURNING id INTO v_chan_id;

  INSERT INTO channel_members (channel_id, user_id) VALUES (v_chan_id, v_me);
  INSERT INTO channel_members (channel_id, user_id) VALUES (v_chan_id, p_friend_id);

  RETURN jsonb_build_object('id', v_chan_id, 'existing', false);
END;
$$;

-- 2. 服务端防注入搜索用户
CREATE OR REPLACE FUNCTION public.search_users_safe(p_keyword text, p_limit int)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $func$
DECLARE
  v_kw text;
  v_base text;
BEGIN
  v_kw := COALESCE(p_keyword, '') || '';
  IF length(v_kw) = 0 OR length(v_kw) > 30 THEN
    RETURN '[]'::jsonb;
  END IF;
  -- LIKE 元字符转义
  v_base := replace(replace(replace(v_kw, '\', '\\'), '%', '\%'), '_', '\_');
  RETURN (
    SELECT COALESCE(
      jsonb_agg(jsonb_build_object(
        'id', p.id,
        'username', p.username,
        'nickname', p.nickname,
        'avatar_url', p.avatar_url
      )), '[]'::jsonb
    )
    FROM profiles p
    WHERE p.username ILIKE '%' || v_base || '%' ESCAPE '\'
       OR p.nickname ILIKE '%' || v_base || '%' ESCAPE '\'
    LIMIT LEAST(COALESCE(p_limit, 5), 20)
  );
END;
$func$;

-- 3. 私信通知（给对方写 dm 类型通知）
CREATE OR REPLACE FUNCTION public.notify_dm(
  p_message_id uuid,
  p_author_id  uuid,
  p_channel_id uuid,
  p_friend_id  uuid,
  p_content    text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_name text;
BEGIN
  SELECT COALESCE(nickname, username, '有人') INTO v_name FROM profiles WHERE id = p_author_id;
  INSERT INTO notifications (user_id, type, title, body, link, is_read)
  VALUES (
    p_friend_id,
    'dm',
    v_name || ' 给你发了私信',
    COALESCE(left(p_content, 80), ''),
    '/dm/' || p_channel_id::text || '/' || p_friend_id::text,
    false
  );
END;
$$;
