-- 宝丰一高校园频道 · 通知实时推送
-- 修复：加好友 / 被接受 / @提及 / 私信 时，接收方收不到实时通知（铃红点、好友列表不即时更新）
--
-- 根因（2026-07-22 排查）：
--   前端已订阅 notifications:<user_id> 通道并监听 new_notification 事件
--   （js/app.js subscribeNotifications），但后端从未对该通道 publish，且
--   realtime.channels 只注册了 chat:%，未注册 notifications:%，导致：
--     1) 订阅被拒（前端静默打印 [notif-rt] 订阅失败）；
--     2) 没有任何触发器在 notifications 插入后推送 new_notification。
--   接收方因此永远收不到实时推送，只能等 15s 轮询或手动打开通知下拉。
--
-- 方案：完全照搬 messages 的 publish_message_realtime 触发器写法。

-- ① 注册 notifications:% 通道（订阅端授权，沿用 chat:% 模式）
INSERT INTO realtime.channels (pattern, description, enabled)
VALUES ('notifications:%', 'Per-user notifications', true)
ON CONFLICT (pattern) DO UPDATE
  SET description = EXCLUDED.description,
      enabled     = EXCLUDED.enabled;

ALTER TABLE realtime.channels ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated subscribe notifications" ON realtime.channels;
CREATE POLICY "authenticated subscribe notifications"
  ON realtime.channels FOR SELECT TO authenticated
  USING (pattern LIKE 'notifications:%');

-- ② 通知插入后实时广播（服务端 SECURITY DEFINER，绕过被读表 RLS）
CREATE OR REPLACE FUNCTION public.publish_notification_realtime()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $func$
BEGIN
  PERFORM realtime.publish(
    'notifications:' || NEW.user_id::text,
    'new_notification',
    jsonb_build_object(
      'record', jsonb_build_object(
        'id',         NEW.id,
        'user_id',    NEW.user_id,
        'type',       NEW.type,
        'title',      NEW.title,
        'body',       NEW.body,
        'link',       NEW.link,
        'is_read',    NEW.is_read,
        'created_at', NEW.created_at
      )
    )
  );
  RETURN NEW;
END;
$func$;

DROP TRIGGER IF EXISTS notification_published ON public.notifications;
CREATE TRIGGER notification_published
AFTER INSERT ON public.notifications
FOR EACH ROW EXECUTE FUNCTION public.publish_notification_realtime();
