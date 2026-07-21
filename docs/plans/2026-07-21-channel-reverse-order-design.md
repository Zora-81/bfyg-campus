# 频道消息倒序流改造设计

## 背景
用户需求：在频道发送消息时，默认让消息显示在最上面（而非现状的「沉底」自动滚到底部）。

## 方案选择
对比业界范式后选定 **整体倒序流**（微博 / 朋友圈 / 小红书 / 贴吧范式）：
- 最新消息在最顶，最旧在底部；向下滚动浏览更早历史。
- 进入频道默认停在顶部看最新；自己发的、他人实时发来的新消息都置顶。
- 翻历史时别人发新消息不打断阅读，仅亮「↑ 回到顶部」按钮。

未选方案：
- 保持聊天范式（最新沉底跟随，微信/QQ/Discord 标准）——最稳但不满足需求。
- 置顶固定 + 其余正序（群公告）——不符合「新消息最上」。

## 实现改动（js/app.js）
1. `renderMessages()`：`msgs.slice().reverse().forEach` 渲染（数据本身升序，这里反转），最新在顶；自动跟随由 `isNearBottom` 改为 `isNearTop` 并滚到 `top:0`。
2. `appendMessageNode()`：`messagesArea.prepend(node)` 新消息插到列表最顶（原 appendChild 到底部）。
3. `handleIncomingMessage()`：跟随判断 `wasAtBottom`→`wasAtTop`；不在顶且非自己消息时 `scrollTop=0`。
4. `replaceMessageNode()`：`wasAtBottom`→`wasAtTop`；`scrollTo({top:0})`。
5. 发送流程：自己发的消息 **总是** `scrollTo({top:0})`（无条件跟随顶，确保发完立刻在最上看到）。
6. `isNearBottom()` 改为 `isNearTop()`（`scrollTop < 80`）；`scroll` 监听在 `isNearTop()` 时 `hideScrollBtn()`。
7. `scrollBottomBtn` 点击：`scrollTo({top:0})`（回到顶部）。
- 进入频道 `messagesArea.scrollTop = 0` 天然停在顶部看最新（无需改）。
- 无分页逻辑（`getMessages` 一次取全频道），无需处理「加载历史」方向。

## HTML（html/index.html）
- `#scroll-bottom-btn` SVG 箭头由向下翻转为向上，`title` 改为「回到顶部（最新）」。

## UX 权衡
输入框在底部、最新在顶部：发完消息自动跳到顶看自己刚发的（类似发朋友圈看自己动态）。这是倒序聊天 + 底部输入的唯一别扭点，可接受。

## 验证方式
需登录后进入任意频道：
- 发消息 → 出现在最顶并自动滚到顶；
- 进入频道 → 默认看最新（顶部）；
- 向下翻历史时他人发新消息 → 不打断，仅亮「↑ 回到顶部」按钮。
