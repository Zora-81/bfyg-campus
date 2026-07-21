# 校园频道功能导览视频 — 实现计划（帧级时间轴）

> 分支：`feature/video-tour` · 工程：`video/tour/`（复制 `video/promo` 脚手架，复用字体/主题/流星/字幕/PageCam）
> 复用 skill 铁律：复刻场景走真截图、设计 token 从产品提取、确定性渲染、每镜头静帧自检、交付前独立 subagent 审查。

## 一、帧级时间线（30fps，总 ~2600f ≈ 87s）

单一事实源 = `src/aifl/Main.tsx` 的 `TOUR_SHOTS`。CAPTIONS / SFX / FlashCut 一律用 `SHOTS.x.from + offset` 相对表达式，时间线平移自动跟随。

| 段 | 内容 | 帧区间 | 时长 | 类型 | 字幕 |
|----|------|--------|------|------|------|
| S1 | 开场氛围（登录页流星+校徽+打字机） | 0–240 | 8s | 真截图 | 夜空下的校园入口 |
| T-A | 字卡「点一下校徽，藏着校园介绍」 | 240–285 | 1.5s | 字卡 | — |
| S2 | 隐藏校徽动画（光标→点校徽→展开介绍页） | 285–525 | 8s | 真截图+动效 | 点一下校徽，藏着校园介绍 |
| S3 | 校园介绍页（信息卡+功能地图，下摇） | 525–735 | 7s | 真截图 | 一校人的功能地图 |
| T-B | 字卡「频道分类，各取所需」 | 735–780 | 1.5s | 字卡 | — |
| S4 | 频道总览（侧栏逐个高亮+说明） | 780–1110 | 11s | 真截图 | 频道分类，各取所需 |
| S5 | 实时聊天+@提醒+消息图片+点赞/评论/转发 | 1110–1500 | 13s | 手搓UI(实时层未部署) | 实时聊天，互动拉满 |
| S6 | 校园动态+热门话题（流+热度条） | 1500–1770 | 9s | 手搓UI | 校园动态，随手发布 |
| T-C | 字卡「背景随心换」 | 1770–1815 | 1.5s | 字卡 | — |
| S7 | 背景设置（⚙️→主题切换+模糊/亮度+上传） | 1815–2145 | 11s | 真截图 | 背景随心换 |
| S8 | 技术支持+设置（支持面板+通知/账户/关于） | 2145–2355 | 7s | 真截图 | 技术支持，随时兜底 |
| S9 | 结尾（四元素组装+品牌 slam） | 2355–2595 | 8s | 复用v1收尾 | 一校人的专属空间 · bfgzlt.cc.cd |

## 二、每段实现要点

**S1 开场氛围** — 复用 `live/SceneOpen.tsx`（PageCam 对 `login-full.png` + `badge.png`，校徽浮起+光束+流星），复用 v1 校徽坐标 `{x:880,y:240,w:160,h:160}`。结尾 hold 5f 后淡出。

**S2 隐藏校徽动画** — 新场景 `SceneBadge.tsx`：
- 抓 `main-ui.png`（登录后主界面，左上角校徽可见）+ `campus-intro.png`（点校徽后的介绍页）。
- 用 PageCam 对 `main-ui.png` 推近左上角校徽坐标 → 闪白(FlashCut) → 切 `campus-intro.png` 全屏。
- 加一个手搓光标（圆点+圆环）从屏幕右侧缓移到校徽位置，第 ~40% 处做"点击"缩放 pulse，触发切换。确定性（无随机）。

**S3 校园介绍页** — 新场景 `SceneIntro.tsx`：放 `campus-intro.png` 整图，垂直慢移 pan（interpolate cy），上叠轻微暗角+流星(0.3)。

**S4 频道总览** — 新场景 `SceneChannels.tsx`：用 `main-ui.png` 的右侧/侧栏区域（PageCam 推近 channel-list 坐标），叠加 6 个手搓频道卡（CHANNELS 数据）逐个高亮弹入（spring bezier(0.2,1.25,0.3,1)），每项配一行说明文字。高亮项轻微放大 bounce。

**S5 实时聊天+互动** — 新场景 `SceneChat.tsx`（扩展 v1 SceneDetail 暗色玻璃面板），6 beats：
1. 聊天总览（综合大厅·128人在线）
2. 收到「@小宇」提醒高亮闪一下（@字样琥珀发光）
3. 点赞 → 粒子爆裂（手搓 canvas 粒子，seed 固定）
4. 评论展开（一条回复缩进淡入）
5. 转发弹窗（站内+站外两选项卡）
6. 消息图片渲染（缩略图网格，用 `public/textures/live/chat-img-*.png` 占位图）
- 因实时层未部署，全部手搓；文案用 content.ts 的 CHAT 演示数据（已脱敏）。

**S6 校园动态+热门话题** — 新场景 `SceneFeed.tsx`：暗色玻璃动态流（POSTS 数据卡片流入）+ 右侧热门话题卡（排名+热度条，宽度绑定热度值）。滚动展示。

**S7 背景设置** — 新场景 `SceneBG.tsx`：抓 `settings-bg.png`（⚙️打开的背景设置面板）。前半用真截图+PageCam 推近；主题切换（星空↔极光）用手搓两层全屏渐变 crossfade（极光用青紫流动渐变）；模糊/亮度滑块用真截图上的手搓滑块覆盖+对底层图实时改 filter；自定义上传按钮高亮。

**S8 技术支持+设置** — 新场景 `SceneSupport.tsx`：抓 `tech-support.png`（技术支持面板）+ 通知/账户/关于。PageCam 推近 + 逐项高亮。

**S9 结尾** — 复用 v1 `SceneOutroLive.tsx`（四元素组装 + 品牌 slam `BRAND`/`TAGLINE`），已含 photoFade 修复。

## 三、真站点抓取清单（admin 登录 bfgzlt.cc.cd）

脚本：`video/capture/capture-tour.mjs`（复用 `video/capture/node_modules/puppeteer`），输出 `video/tour/public/textures/live/`：

1. `login-full.png` — 登录页整视口（2x），复用 v1 校徽坐标
2. `badge.png` — 登录页校徽透明底切图（omitBackground）
3. `main-ui.png` — 登录后主界面整视口（含左上角校徽、侧栏频道）
4. `campus-intro.png` — 点左上角校徽后的校园介绍页
5. `settings-bg.png` — ⚙️ 打开的背景/外观设置面板
6. `tech-support.png` — 技术支持（/设置）面板
7. `chat-img-1.png` / `chat-img-2.png` — 两张占位图（S5 消息图片用，可本地生成渐变图）
8. `probe.json` — 主界面元素 bbox（校徽/齿轮/侧栏频道坐标），供 S2/S4/S7 PageCam 定位

抓取脚本含：联网自检、`domcontentloaded`、登录（#welcome-enter→#login-form→#btn-login-submit，admin@baofeng.campus / wzy200812）、各面板按文本/选择器点击后截图、崩溃兜底日志。

## 四、技术复用与约束

- **复用**：`theme.ts`(原样)、`Meteors.tsx`(原样)、`GlobalFonts.tsx`(原样)、`Caption.tsx`(原样)、`PaperTitleCard.tsx`(原样)、`FlashCut.tsx`(原样)、`PageCam.tsx`(原样)、`audio/*`(原样，含 bgm.mp3 0.28 循环 + v1 SFX 钉帧表复用)。
- **字体子集**：`scripts/subset-font.py` 读 `content.ts` 取用字 → 重新生成 `noto-sc-400/700.woff2`。⚠️ tour 文案比 v1 多（@提醒/技术支持/背景等），**必须重跑子集**，否则新字成豆腐块。
- **确定性**：禁 `Math.random`/`Date.now`；粒子/流星用 mulberry32 固定种子。
- **BGM+SFX**：复用 v1 模式（BGM 低音量循环 + 动作钉帧 SFX），不重做节奏分析（与 v1 一致、已验收）。
- **tsc 零错误**，render 前 `node --check` 思路不适用 TS，用 `npx tsc --noEmit`。

## 五、验收

- 每写完一个 Scene：`npx remotion still` 出 2 帧（入场中/落定后）肉眼自检，存 `out/qa/`。
- 每轮改完整片重渲 `out/tour.mp4`。
- 交付前派独立 subagent 对照 `aesthetic-rules.md` 出带帧号证据的审查报告，修复后终渲。
- 关键验收帧：S1@120、S2@400(切换瞬间)、S3@630、S4@950、S5@1300(@提醒)和@1450(图片)、S6@1650、S7@2000(主题切换)、S8@2250、S9@2520(slam)。
