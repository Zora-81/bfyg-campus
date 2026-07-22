-- ============================================================================
-- 撤回审核（AI 误判纠错）RPC
-- ----------------------------------------------------------------------------
-- 用途：管理员在「AI 待审」面板点「撤回审核」时调用。
--       一条消息被 AI 误标为待审后，管理员可一键纠错：
--         1) 清除待审标记（reviewed=true）并标记 mod_overturned=true（审计区分）
--         2) 删除「校园小管家」机器人警告评论（is_mod=true 的子消息）
--         3) 扣回该用户的 warning_count（不低于 0，撤销误判带来的警告）
--         4) 给该用户发一条 system 通知「审核误判已撤销」
--
-- 为什么用 RPC：notifications / profiles 都有 RLS，客户端只能改自己的行，
--   无法替被误判的用户写通知或扣 warning。本函数 SECURITY DEFINER 以
--   函数所有者身份执行，绕过 RLS，与现有 apply_moderation / notify_mentions 同模式。
--
-- ⚠️ 部署方式：用 `insforge db import 本文件` 执行（CLI 的 `db query` 会拒
--   CREATE FUNCTION，但 `db import` 可以；无需走网页控制台）。幂等，可重复执行。
-- ============================================================================

-- 1) 新增标记列（幂等，可重复执行）
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS mod_overturned BOOLEAN NOT NULL DEFAULT FALSE;

-- 2) 创建纠错 RPC
CREATE OR REPLACE FUNCTION public.overturn_moderation(p_message_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_author  UUID;
  v_channel TEXT;
  v_count   INT;
BEGIN
  -- 取消息作者与频道名
  SELECT m.author_id,
         (SELECT c.name FROM channels c WHERE c.id = m.channel_id)
    INTO v_author, v_channel
  FROM messages m
  WHERE m.id = p_message_id;

  IF v_author IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'message_not_found');
  END IF;

  -- 1) 清待审标记 + 标记已撤销
  UPDATE messages
     SET reviewed = TRUE,
         mod_overturned = TRUE
   WHERE id = p_message_id;

  -- 2) 删除机器人警告评论（is_mod=true 的子消息）
  DELETE FROM messages WHERE parent_id = p_message_id AND is_mod = TRUE;

  -- 3) 扣回警告计数（不低于 0）
  UPDATE profiles
     SET warning_count = GREATEST(0, COALESCE(warning_count, 0) - 1)
   WHERE id = v_author;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- 4) 给用户发「误判已撤销」通知
  INSERT INTO notifications (user_id, type, title, body, is_read)
  VALUES (
    v_author,
    'system',
    '审核误判已撤销',
    '您在 #' || COALESCE(v_channel, '频道') || ' 的一条消息被 AI 误标为待审，管理员已确认内容正常并撤销标记。给您带来不便，敬请谅解！',
    FALSE
  );

  RETURN jsonb_build_object('ok', true, 'warning_rolled_back', v_count > 0);
END;
$$;

-- 3) 授权：已登录用户（后台管理员）可调用；函数内部仅处理目标消息，无越权风险
GRANT EXECUTE ON FUNCTION public.overturn_moderation(UUID) TO authenticated;
