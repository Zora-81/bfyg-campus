-- 宝丰一高校园频道 · 社交中心后端 schema
-- 说明：notifications 表已存在；新增 friends 表 + RLS + 4 个 SECURITY DEFINER RPC。
-- 参照已有 apply_moderation 的写法（SECURITY DEFINER + SET search_path + 直插 notifications）。

-- ① friends 表
CREATE TABLE IF NOT EXISTS public.friends (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  friend_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status     text NOT NULL DEFAULT 'pending',   -- pending | accepted
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, friend_id)
);

-- ② RLS
ALTER TABLE public.friends ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS friends_select ON public.friends;
CREATE POLICY friends_select ON public.friends
  FOR SELECT USING (user_id = auth.uid() OR friend_id = auth.uid());

DROP POLICY IF EXISTS friends_insert ON public.friends;
CREATE POLICY friends_insert ON public.friends
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS friends_update ON public.friends;
CREATE POLICY friends_update ON public.friends
  FOR UPDATE USING (user_id = auth.uid() OR friend_id = auth.uid());

DROP POLICY IF EXISTS friends_delete ON public.friends;
CREATE POLICY friends_delete ON public.friends
  FOR DELETE USING (user_id = auth.uid() OR friend_id = auth.uid());

-- ③ notify_mentions：发消息时由客户端调用，解析 @ 并写 mention 通知
CREATE OR REPLACE FUNCTION public.notify_mentions(
  p_message_id uuid, p_author_id uuid, p_channel_id uuid, p_content text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog','public','pg_temp'
AS $func$
DECLARE
  v_author text; v_channel text; v_name text; v_target uuid;
BEGIN
  SELECT nickname INTO v_author FROM public.profiles WHERE id = p_author_id;
  SELECT name INTO v_channel FROM public.channels WHERE id = p_channel_id;
  FOR v_name IN
    SELECT DISTINCT m[1] FROM regexp_matches(p_content, '@([^[:space:]@]+)', 'g') m
  LOOP
    SELECT id INTO v_target FROM public.profiles WHERE username = v_name OR nickname = v_name LIMIT 1;
    IF v_target IS NOT NULL AND v_target <> p_author_id THEN
      INSERT INTO public.notifications (user_id, type, title, body, link, is_read)
      VALUES (
        v_target, 'mention',
        COALESCE(v_author,'有人') || ' 在 #' || COALESCE(v_channel,'频道') || ' 提到了你',
        CASE WHEN length(p_content) > 60 THEN left(p_content,60) || '…' ELSE p_content END,
        '/channel/' || p_channel_id::text || '#msg-' || p_message_id::text,
        false
      );
    END IF;
  END LOOP;
END;
$func$;

-- ④ create_friend_request：发起好友申请（写 friends pending + 通知对方）
-- 注意：通知 link 必须带上 friendship id，否则前端「同意/拒绝」按钮无法定位请求（2026-07-19 修复）
CREATE OR REPLACE FUNCTION public.create_friend_request(p_friend_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog','public','pg_temp'
AS $func$
DECLARE
  v_me uuid := auth.uid(); v_nick text; v_exist int; v_new_id uuid;
BEGIN
  IF v_me IS NULL THEN RETURN jsonb_build_object('ok',false,'error','noauth'); END IF;
  IF v_me = p_friend_id THEN RETURN jsonb_build_object('ok',false,'error','self'); END IF;
  SELECT count(*) INTO v_exist FROM public.friends
    WHERE (user_id=v_me AND friend_id=p_friend_id) OR (user_id=p_friend_id AND friend_id=v_me);
  IF v_exist > 0 THEN RETURN jsonb_build_object('ok',false,'error','exists'); END IF;
  INSERT INTO public.friends (user_id, friend_id, status) VALUES (v_me, p_friend_id, 'pending') RETURNING id INTO v_new_id;
  SELECT nickname INTO v_nick FROM public.profiles WHERE id = v_me;
  INSERT INTO public.notifications (user_id, type, title, body, link, is_read)
    VALUES (p_friend_id, 'friend_request', COALESCE(v_nick,'有人') || ' 想加你为好友', '点击同意或拒绝', '/friends/request?id=' || v_new_id::text, false);
  RETURN jsonb_build_object('ok',true);
END;
$func$;

-- ⑤ respond_friend_request：接受/拒绝好友申请（仅目标可操作）
-- 修复：① 幂等校验（已接受不再重复插入通知）；② 处理后删除原始 friend_request 通知
CREATE OR REPLACE FUNCTION public.respond_friend_request(p_friendship_id uuid, p_action text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog','public','pg_temp'
AS $func$
DECLARE
  v_me uuid := auth.uid(); v_row public.friends; v_nick text;
BEGIN
  SELECT * INTO v_row FROM public.friends WHERE id = p_friendship_id AND friend_id = v_me;
  IF v_row.id IS NULL THEN RETURN jsonb_build_object('ok',false,'error','notfound'); END IF;
  -- 幂等：已接受的重复点击直接返回成功，不重复插通知
  IF v_row.status = 'accepted' THEN RETURN jsonb_build_object('ok',true,'msg','already_accepted'); END IF;
  IF p_action = 'accept' THEN
    UPDATE public.friends SET status='accepted' WHERE id = p_friendship_id;
    SELECT nickname INTO v_nick FROM public.profiles WHERE id = v_me;
    INSERT INTO public.notifications (user_id, type, title, body, link, is_read)
      VALUES (v_row.user_id, 'friend_accepted', COALESCE(v_nick,'对方') || ' 已接受你的好友申请', '', '', false);
  ELSE
    DELETE FROM public.friends WHERE id = p_friendship_id;
  END IF;
  -- 清理原始 friend_request 通知（防止已处理的请求反复显示"同意/拒绝"按钮）
  DELETE FROM public.notifications
    WHERE type = 'friend_request' AND link = '/friends/request?id=' || p_friendship_id::text;
  RETURN jsonb_build_object('ok',true);
END;
$func$;

-- ⑥ remove_friend：移除好友（双向删除）
CREATE OR REPLACE FUNCTION public.remove_friend(p_friend_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog','public','pg_temp'
AS $func$
DECLARE v_me uuid := auth.uid();
BEGIN
  DELETE FROM public.friends
    WHERE (user_id=v_me AND friend_id=p_friend_id) OR (user_id=p_friend_id AND friend_id=v_me);
  RETURN jsonb_build_object('ok',true);
END;
$func$;
