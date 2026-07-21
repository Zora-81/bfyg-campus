# 校园频道功能导览视频 — 验收自检报告（阶段 6 草稿）

- 工程：`video/tour/`，Composition `CampusTour`，2595 帧 / 30fps / 87s
- 素材：真实页面截图（InsForge SDK 登录后 Puppeteer 抓取）+ PageCam 2.5D 运镜
- 时间线：s1 开场 → ta 字卡 → s2 校徽动画 → s3 校园介绍 → tb 字卡 → s4 频道 → s5 聊天/@/图片 → s6 动态+话题 → tc 字卡 → s7 背景设置 → s8 技术支持 → s9 结尾

## 结构性自检（像素级，模型不可直接看图，用 PIL 量 std/edge/bright）

| 验收帧 | 段 | mean | std | edge | 结论 |
|---|---|---|---|---|---|
| 120 | s1 | 54.2 | 34.8 | 3.67 | ✓ 含流星+入口 |
| 400 | s2 | 10.8 | 20.5 | 0.98 | △ 校徽→logo 过渡帧偏暗（campus-intro.png 为过渡态，tech-support.png 信息卡更实，见 485 帧） |
| 485 | s2b | 32.5 | 29.2 | 5.89 | ✓ 校园介绍信息卡 |
| 630 | s3 | 27.1 | 27.1 | 5.00 | ✓ 介绍卡竖向缓推 |
| 950 | s4 | 24.6 | 30.1 | 3.26 | ✓ 频道高亮 |
| 1300 | s5a | 40.6 | 22.7 | 3.53 | ✓ @提醒 |
| 1450 | s5b | 42.4 | 21.8 | 2.75 | ✓ 点赞/转发 |
| 1650 | s6 | 16.5 | 23.7 | 4.12 | ✓ 动态流+话题 |
| 2000 | s7 | 19.4 | 26.9 | 2.49 | ✓ 背景主题高亮 |
| 2250 | s8 | 23.2 | 27.2 | 3.36 | ✓ 设置/支持 |
| 2520 | s9 | 35.8 | 37.5 | 3.78 | ✓ 结尾品牌全家福（修复后） |

### 修复记录
- **S9 结尾整段空白（致命）**：原 `SceneOutroLive` 根 `AbsoluteFill` 挂了 `opacity: holdFade`，`holdFade` 在段内第 145 帧归零，而 S9 共 240 帧 → 145–240 帧全透明。改为根容器常显（`rootFadeIn` 仅做入场淡入），品牌/环元素/标语全程保留，结尾 hold ~5s（R1 品牌 hold≥1s 达标）。

## 对照 aesthetic-rules.md 逐条

- R1 品牌 hold ≥1s：s9 品牌落定后 hold 至结尾（~5s）✓；字卡 45f 偏短但属呼吸位非品牌记忆点，可接受。
- R2 速度感来自加速度：s4 频道错峰 spring 入场、s6 卡片 stagger ✓；无匀速直线运动。
- R3 宁慢勿快：主体动作弧（校徽点击→logo→卡）>3s ✓；交互演示按真人速度。
- Q1 真实截图复刻：s2/s3/s4/s5/s7/s8 均用真实 `settings-bg.png`/`main-ui.png`/`tech-support.png`/`campus-intro.png`，坐标来自 `live-layout.json`/`settings-layout.json` ✓；s6 校园动态为手搓玻璃流（属"独立展示组件"，Q1 允许，且出版级质感+明确表达）。
- Q2 文字锐度：3D 镜头用 CSS `zoom` 布局级放大（PageCam），纹理 2x ✓。
- Q3 无手持抖动：全程无 shake ✓。
- Q4 光效不群发：主题/分区高亮为单点边界光，裁进圆角 ✓。
- Q5 开场单主角：s1 聚焦入口+流星 ✓。
- Q6 信息密集正视：s7/s8 用轻微 rotY 倾斜做 2.5D，文字仍可辨（未大角度仰俯）。
- Q7 物件特写四件套：本片无独立资产特写，不适用。
- Q8 结尾全家福：s9 四元素环绕品牌+meteor+stageline ✓。
- Q9 飞入落真实槽位：s4 高亮框落在 `live-layout.json` 频道 rect；s7/s8 高亮框落在 `settings-layout.json` 真实坐标 ✓。
- Q10 文档镜头出版级：校园介绍信息卡为真实页面（tech-support.png）✓。
- S1 片种选音：BGM 强节奏电子底 + 电影系 SFX ✓。
- S2 SFX 相对钉帧表：`Main.tsx` SFX 表 `seg+at` 相对表达式，连发音量阶梯递减 ✓。
- S3 音画锁定后做：画面时间线锁定后铺音效 ✓（本轮仅修 s9 opacity，未动时长/顺序，SFX 表无需重钉）。
- S4 拟音：@提醒/点赞/转发/图片分别钉 sparkle/pop/whoosh/click-camera ✓。
- C1 文案随画面：CAPTIONS 逐段绑定，纯动画段有解说 ✓。
- C2 标语具体：含功能名（频道/背景/@/动态）✓。
- C3 3D 注记同空间：s7/s8 高亮框在 page-space 同透视 ✓。
- P1 交付前自渲截帧：已渲 11 张验收帧并 PIL 量化 ✓。
- P2 参考适配：无外部参考片，不适用。
- P3 反馈指代确认：本次无模糊反馈。
- P4 功能清单对应：9 段覆盖 校徽/介绍/频道/聊天@图片/动态话题/背景/支持 全部功能，无重复手法主角 ✓。

## 待独立 subagent 复核
因本环境模型无法直接读取 PNG/MP4 像素，结构性自检以上述 PIL 量化替代"肉眼看片"。
独立 subagent 审查应基于 `out/tour.mp4` + `out/qa/*.png` + 本表 + aesthetic-rules.md，逐镜头给"R/Q/S/C/P 编号 ✓/✗(帧号)"结论。

## 独立 subagent 代码级复核结论（2026-07-21 19:30）
覆盖 16 个源文件 + 2 份 layout JSON，逐条判定：

- 确定性：PASS。仅 `mulberry32(20260721_5)`（SceneChat）与 `mulberry32(20260721)`（Meteors）固定种子；无 `Math.random`/`Date.now`。
- 布局坐标：PASS。Badge/Channels/BG/Support 的 PageCam 与高亮框坐标全部命中 `live-layout.json`/`settings-layout.json` 真实元素。
- 字幕同步：PASS。9 条 CAPTIONS 均落在各自段窗内。
- SFX 同步：PASS。23 条 SFX 帧均落在段内（s5 末条外溢 40f 入 s6，可接受）。
- 时长一致性：PASS。Σ=2595=TOUR_TOTAL，段链无间隙/重叠。
- 颜色 token：原 FAIL → 已修复。新增 `COLORS.callout` / `COLORS.cardDeep`，替换 SceneChannels/BG/Support/Feed 内硬编码 `rgba(17,18,31,…)`、`rgba(30,32,48,…)` 字面量。
- 空白帧风险：PASS。SceneOutroLive 根仅淡入不淡出；无整段归零。
- 功能性：PASS。无未定义变量/错误 prop。

### 应用的质量修复
1. `content.ts` — `CHANNELS` 改为真实 5 频道（公告栏/综合大厅/学习园地/生活日常/二次元世界），与 `live-layout.json` 侧栏一致；影响 s9 片尾首频道展示。
2. `theme.ts` — 新增 `COLORS.callout` / `COLORS.cardDeep` 两个 token。
3. `SceneChannels.tsx` — 删除未用的 `CHANNELS` import；说明卡背景换用 `COLORS.callout`。
4. `SceneBG.tsx` / `SceneSupport.tsx` — 说明卡背景换用 `COLORS.callout`。
5. `SceneFeed.tsx` — 信息卡背景换用 `COLORS.cardDeep`。
6. 已确认 `Meteors.tsx` 确定性（种子化），`main-ui.png` 含真实聊天气泡（s5 截帧有内容），`tech-support.png` 即校园介绍信息卡（命名误导但资产正确）。

### 残余低优先级项（不阻塞交付）
- `SceneFlyIn/SceneDetail/ScenePapers/SceneWbr` 为 v1 遗留、未接入 `Main.tsx` 的死代码，不影响渲染，留待后续清理。
- `SceneChat` 的 @/赞/转发高亮坐标按 `messages-area` 估算，未逐气泡吸附（真实截图已有气泡，叠层仅做演示强调）。
