-- ============================================================================
-- 宝丰一高校园频道 — 好友私聊（DM）
-- 复用 channels / channel_members / messages，type='dm' 区分私聊房间。
-- find_or_create_dm：幂等开/取两人私聊房间（SECURITY DEFINER，前端不传 uid）。
-- notify_dm：私信到达时给对方写 dm 类型通知（顶部铃不冒红点，仅好友列表显示未读）。
-- 注意：db query 不支持 CREATE FUNCTION，须用 db import 执行本文件。
-- ============================================================================

-- 1. 开/取私聊房间（幂等）
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
  v_fname    text;
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('error', 'not authenticated');
  END IF;
  IF p_friend_id IS NULL OR p_friend_id = v_me THEN
    RETURN jsonb_build_object('error', 'invalid friend');
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

  -- 取对方昵称（仅用于建频道后的可读名，UI 顶部实际显示对方昵称由前端覆盖）
  SELECT COALESCE(nickname, username, '好友') INTO v_fname FROM profiles WHERE id = p_friend_id;

  -- name 用内部唯一标识避免 UNIQUE 冲突；type='dm' 使前端可过滤不进公共频道列表
  INSERT INTO channels (name, description, type, created_by)
  VALUES ('dm:' || v_me::text || ':' || p_friend_id::text, 'private chat', 'dm', v_me)
  RETURNING id INTO v_chan_id;

  INSERT INTO channel_members (channel_id, user_id) VALUES (v_chan_id, v_me);
  INSERT INTO channel_members (channel_id, user_id) VALUES (v_chan_id, p_friend_id);

  RETURN jsonb_build_object('id', v_chan_id, 'existing', false);
END;
$$;

-- 2. 私信通知（给对方写 dm 类型通知）
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
  INSERT INTO notifications (user_id, type, title, body, link)
  VALUES (
    p_friend_id,
    'dm',
    v_name || ' 给你发了私信',
    COALESCE(left(p_content, 80), ''),
    '/dm/' || p_channel_id::text || '/' || p_friend_id::text
  );
END;
$$;
