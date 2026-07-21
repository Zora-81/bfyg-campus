# PC 端三栏布局：频道抽屉常驻左栏

日期：2026-07-20
状态：已确认设计 + 已实现（css/style.css）

## 背景

PC 宽屏下主界面（社交信息流）中间消息流 `messages-area` 为 `align-items:flex-end` 且子元素 `max-width:720px`，
消息被压到右侧贴近右栏，导致中间偏左出现大片空白。而频道列表却藏在"点汉堡才滑出"的浮层抽屉里，
无法利用这片空间。

## 决策（已与用户确认）

1. **布局**：PC 三栏 = [频道列表左栏] + [消息流中间列] + [右栏热门话题/频道推荐]。对标 Discord/Slack。
2. **左栏内容**：频道分类列表 + 底部用户栏（头像/昵称/退出登录），原样保留。
3. **汉堡按钮**：PC（≥901px）隐藏；移动端仍用于滑出浮层抽屉。
4. **消息流**：PC 端改为左对齐、铺满中间列（去掉 720px 上限）。
5. **左栏宽度**：260px（标准 Discord 接近值）。

## 实现方案

纯 CSS 改造，**不改动 HTML 结构、不改动 JS**。

- 在 `css/style.css` 末尾新增 `@media (min-width:901px)` 块：
  - `.app-shell` 由 `flex 纵向` 改为 `display:grid`：列 `var(--left-w,260px) 1fr`，行 `52px 1fr`，区域 `"nav nav" / "side main"`。
  - `.channel-drawer` 在 PC 端：`position:static`、移除 `transform`/`box-shadow`、改右边框分隔、`.open` 失效；`.drawer-overlay` 隐藏；`.hamburger-btn` 隐藏。
  - `.messages-area`：`align-items:flex-start`；`.messages-area > *`：`max-width:none`。
  - 给 `.channel-drawer` / `.channel-main` 加 `min-height:0` 保证 grid 拉伸下内部滚动正常。
- 移动端（≤900px）完全保持原样（抽屉浮层、右栏隐藏、汉堡可见）。断点统一在 900px。

## 兼容性确认

- `app.js` 的 `openDrawer/closeDrawer`、汉堡点击、外部点击关闭均依赖 `.open` 类与 `hamburger-btn`。
  PC 上汉堡隐藏、抽屉不会进入 `.open` 状态，这些逻辑变为无害空操作，无需改 JS。
- 浮层（`.drawer-overlay` / `.avatar-popup` / `.avatar-popup-overlay`）均为 `position:fixed`，不参与 grid 布局。
- 右上角头像菜单（个人菜单/背景/成员）照常；左栏底部用户栏照常；右栏照常。

## 验证方式

在 PC 浏览器打开主界面（或把窗口拉宽到 >900px）即可看到三栏；缩到 ≤900px 回到原移动布局。
