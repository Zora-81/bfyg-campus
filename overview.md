# 校园频道 UI/UX 设计评审

**评审日期**: 2026-07-04
**评审范围**: `html/index.html`, `html/admin.html`, `css/style.css`, `css/admin.css`, `js/app.js`, `js/shooting-stars.js`, `js/main-bg.js`

---

## 1. 总体评价

项目整体完成度较高，设计系统初具规模：
- 统一的深色主题与 Token 体系（颜色、间距、圆角、阴影、过渡）
- QQ/Discord 风格三栏布局清晰，频道、消息、成员面板层次分明
- 登录页视觉冲击力强：学校夜景 + 流星雨 + 3D 轮播 + 毛玻璃卡片
- 响应式已经覆盖了桌面、平板、移动端折叠侧栏

主要问题集中在**过度装饰**、**可访问性**和**移动端细节**三个方向。

---

## 2. 视觉设计

### ✅ 优点
- 色彩系统统一：`--accent: #7c5cfc` 贯穿登录页、聊天主界面、管理后台
- 暗色背景层级清晰：`bg-deeper → bg-surface → bg-elevated → bg-hover`
- 登录卡片毛玻璃效果与背景融合自然

### ⚠️ 待改进
1. **登录页校徽红框与主色调冲突**  
   `.login-badge` 使用 `border: 3px solid rgba(183,28,28,0.7)`，与全局紫色品牌色形成视觉张力，建议改为紫色或金色描边，或与校徽原色更协调的暖白边框。

2. **中文字距过宽**  
   `.login-school-name` 的 `letter-spacing: 4px` 对中文来说过于松散，降低可读性。建议中文标题 `letter-spacing: 1px` 左右，英文可单独处理。

3. **登录入口按钮中英文混杂**  
   “Sign In / Sign Up” 与整体中文界面割裂，建议改为“登录 / 注册”。

4. **移动端左侧面板完全隐藏**  
   `@media (max-width:640px)` 中 `.login-left { display: none }` 隐藏了 3D 轮播，但移动端入口只剩下右侧文字和按钮，视觉过于单薄。可考虑折叠为顶部小 banner 或保留一张静态卡片。

---

## 3. 交互与 UX

### ✅ 优点
- 登录弹窗使用弹簧动画 `cubic-bezier(.34,1.56,.64,1)`，反馈自然
- 消息区支持 @mention、表情、文件上传、图片预览、滚动到底部按钮
- 频道分类可折叠，导航逻辑清晰

### ⚠️ 待改进
1. **触摸目标偏小**  
   `.icon-btn` 只有 28px，低于 WCAG 2.1 推荐的 44×44px 触摸目标。建议主操作按钮至少 36px，关键操作（发送、附件）40px 以上。

2. **移动端侧栏缺少遮罩**  
   `.sidebar.open` 从左侧滑出时没有半透明遮罩，用户容易误触主内容区。建议加一层 `backdrop-filter: blur(4px)` 的遮罩，点击可关闭。

3. **缺少加载/空状态骨架**  
   切换频道、加载历史消息、上传文件时只有简单的 `showToast`，没有骨架屏或 shimmer。建议：
   - 消息区顶部加载历史消息时使用 3-4 行 skeleton
   - 空通知、空成员列表使用统一 empty-state 插图

4. **个人主页信息为占位内容**  
   `profile-stats` 中“身份 / 频道 / 状态”显示的是 `#`、`在线` 等固定占位，数据未实际绑定，建议补齐或隐藏该模块。

---

## 4. 可访问性（WCAG AA）

### ⚠️ 关键问题
1. **未支持 `prefers-reduced-motion`**  
   登录页的流星、校徽呼吸光、标题渐变流动、3D 轮播全部同时运动，对前庭功能障碍用户可能不适。建议：
   ```css
   @media (prefers-reduced-motion: reduce) {
     *, *::before, *::after {
       animation-duration: 0.01ms !important;
       transition-duration: 0.01ms !important;
     }
     #stars-canvas, .login-carousel-container { display: none; }
   }
   ```

2. **部分文字对比度不足**  
   `--text-muted: #5c5e66` 在深色背景上对比度接近 3:1 边缘，用于标签、时间戳等可接受，但用于正文则偏低。建议正文至少使用 `--text-sec: #b5bac1`。

3. **焦点管理缺失**  
   `.view` 使用 `display:none` 切换视图，但没有 `aria-live` 或 `aria-hidden` 处理，屏幕阅读器可能无法感知视图变化。建议给当前视图加 `aria-current="page"`，非活动视图加 `aria-hidden="true"`。

4. **键盘可操作路径不完整**  
   通知下拉、@mention 列表可用键盘选择，但右键菜单、消息 hover 操作（回复、删除、反应）仅支持鼠标。建议为每条消息添加 `aria-label` 和 Tab 可达的操作按钮。

---

## 5. 工程实现与性能

### ✅ 优点
- Token 变量覆盖完整，响应式断点合理
- Canvas 动画已做性能优化：流星层减少、使用 `lighter` 复合、避免每帧创建渐变
- 登录/主界面背景分离，避免动画资源泄漏

### ⚠️ 待改进
1. **CSS 可进一步精简**  
   `style.css` 接近 1900 行，部分通用组件（按钮、卡片、徽章）有重复定义。建议拆分为 `tokens.css`, `components.css`, `pages.css`。

2. **缺少图片懒加载策略**  
   校园轮播图片使用 `loading="eager"`，登录页会一次性加载全部图片。建议改为 `loading="lazy"`，并为首屏保留一张 eager。

3. **字体加载阻塞**  
   Google Fonts 为阻塞加载，弱网环境会影响首屏。建议添加 `display=swap`（已部分设置）和本地 fallback。

---

## 6. 优先级建议（P0/P1/P2）

| 优先级 | 建议 | 影响 |
|--------|------|------|
| P0 | 添加 `prefers-reduced-motion` 媒体查询 | 可访问性、合规 |
| P0 | 统一登录入口语言为中文 | 品牌一致性 |
| P1 | 增大移动端触摸目标至 44px | 移动端体验 |
| P1 | 为移动端侧栏添加遮罩层 | 交互防误触 |
| P1 | 修复个人主页占位数据 | 功能完整性 |
| P2 | 优化校徽边框色彩与品牌一致 | 视觉精致度 |
| P2 | 拆分 CSS 模块 | 可维护性 |
| P2 | 补充加载骨架与空状态 | 感知性能 |

---

## 7. 下一步行动建议

1. 先处理 P0 可访问性问题，避免上线后被用户投诉动效不适。
2. 用真实设备（iPhone SE、安卓中低端机）测试登录页和聊天页的帧率与触摸体验。
3. 做一轮对比度检查（可用 Chrome DevTools 的 CSS Overview 或 axe 插件）。
4. 如果目标是“可上线”，当前版本约 75 分；补齐 P0/P1 后可达 85-90 分。
