// ===== 记忆树配置 & 静态记忆数据（前端仅放非密钥项）=====
// 挂载：window.MT_CONFIG / window.MT_DATA
// 后续接 InsForge 时，把 MT_DATA 换成从 memory_items 表拉取即可，结构保持一致。

window.MT_CONFIG = {
  // 功能开关（按你的需求：去掉地图，保留粒子/音画/评论/AI）
  features: {
    audio: true,        // 背景音乐 + 交互音效（Web Audio 程序化生成，无需音频文件）
    meteors: true,      // 流星拖尾
    bloom: false,       // 真 Bloom 已关闭：改用 AdditiveBlending 原生发光，根治过曝
    nebula: true,       // 柔和星云渐变（大尺度彩色光晕）
    volumetricFog: false,// 体积光晕关闭
    comments: true,     // 留言（先审后发）
    ai: true            // AI 摘要（优先走 Pages Function，失败自动本地诗意兜底）
  },
  // 评论后端：'local' = 浏览器 localStorage（不接也行，现在就能用）；
  // 'insforge' = 接 InsForge 真实后端 + admin 审核（需要 functions/comments.ts + 建表，后续开启）
  commentsBackend: 'local',
  // 音频
  audio: { bgmGain: 0.05, sfxGain: 0.18, chord: [130.81, 164.81, 196.00] }, // C3 E3 G3 柔和 pad
    // 场景调参
  scene: {
    // 记忆树：分层树枝的松树/圣诞树形状，从银河核球中心生长
    treeParticles: 42000,
    treeHeight: 42,
    treeBaseRadius: 16,       // 底部放宽，更稳；仍坐在核球内
    treeBranchTiers: 10,      // 层数适中
    treeBranchesPerTier: 8,   // 每层放射枝数
    treeBranchAmp: 0.32,      // 枝短，不外摊
    treeTrunkWidth: 0.42,     // 树干更粗，中心实心发光
    branchLift: 0.28,         // 树枝轻微上扬，降低塔感
    trunkFill: 0.25,          // 树干+填充粒子占比

    // 旋转星河：主体视觉——明亮粗壮的螺旋星系，5 臂连续融合
    galaxyParticles: 72000,
    galaxyArms: 5,
    galaxyRadius: 132,
    galaxyThickness: 16,      // 盘稍厚，与树底融合
    galaxyArmWidth: 0.72,     // 更宽的旋臂，肉眼可见粗壮光带
    galaxyTightness: 1.42,    // 螺旋舒展
    galaxyRadialPower: 1.45,  // 粒子分布更均匀，旋臂区充足
    bulgeRadius: 17,          // 核球略大，托住收窄的树底
    bulgeHeight: 30,          // 核球纵向拉长，填住中心空洞

    // 背景恒星场
    starFieldParticles: 16000,
    // 前景异形魔法粒子：星 / 雪 / 月（小而密，均匀弥漫在树周围空间）
    ambientParticles: 8000,
    // 树顶五角星
    starTopParticles: 2400,
    meteorCount: 18,
    autoRotateSpeed: 0.14
  },
  commentsStorageKey: 'mt_comments_v1',
  postsStorageKey: 'mt_posts_v1'
};

// ===== 静态记忆数据（移植参考仓库 photos.js 思路）=====
// 注意：URL 用相对 web_build 根的路径（images/...），因为构建后脚本在 web_build/js/，
// 而图片被复制到 web_build/images/；构建脚本只改写 HTML 内的 ../ 引用，不会改写 JS 内部字符串。
// 所有节点均使用真实照片 url 加载（来自 images/ 校园真实素材），不再生成 AI 占位图。
// 字段：id, media_type('image'|'video'), url, title, location, year
window.MT_DATA = [
  { id: 'm01', media_type: 'image', url: 'images/campus-aerial.jpg', title: '校园航拍 · 香山路新校区', location: '宝丰一高', year: '2025' },
  { id: 'm02', media_type: 'image', url: 'images/campus-01.jpg', title: '晨光里的教学楼', location: '教学楼 A 区', year: '2024' },
  { id: 'm03', media_type: 'image', url: 'images/campus-02.jpg', title: '林荫道与读书声', location: '中央大道', year: '2024' },
  { id: 'm04', media_type: 'image', url: 'images/campus-03.jpg', title: '实验室的午后', location: '人工智能实验室', year: '2025' },
  { id: 'm05', media_type: 'image', url: 'images/campus-04.jpg', title: '操场与晚风', location: '田径场', year: '2024' },
  { id: 'm06', media_type: 'image', url: 'images/school-night.jpg', title: '夜色中的校园', location: '宝丰一高', year: '2025' },
  { id: 'm07', media_type: 'image', url: 'images/starry-nebula.png', title: '星河下的记忆', location: '记忆星海', year: '—' }
];
