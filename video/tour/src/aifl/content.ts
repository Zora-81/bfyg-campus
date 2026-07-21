// content.ts — 功能导览视频全部文案（单一来源，字体子集化脚本也读它）
export const BRAND = '宝丰一高校园频道';
export const KICKER = '校园专属交流平台';
export const TAGLINE = 'bfgzlt.cc.cd';

// 三段字卡（T-A / T-B / T-C）的逐词文案，accent 词用强调色
export const TITLE_CARDS = {
  badge: { words: [{ text: '点一下校徽' }, { text: '，' }, { text: '藏着校园介绍', accent: true }] },
  channels: { words: [{ text: '频道分类' }, { text: '，' }, { text: '各取所需', accent: true }] },
  bg: { words: [{ text: '背景' }, { text: '随心换', accent: true }] },
};

// 底部解说字幕：seg 绑定 TOUR_SHOTS 段，at = 段内偏移帧，dur = 时长
// 字卡段(T-A/T-B/T-C)不加字幕
export const CAPTIONS: { seg: string; at: number; dur: number; text: string }[] = [
  { seg: 's1', at: 90, dur: 60, text: '夜空下的校园入口' },
  { seg: 's2', at: 0, dur: 90, text: '点一下校徽，藏着校园介绍' },
  { seg: 's3', at: 0, dur: 70, text: '一校人的功能地图' },
  { seg: 's4', at: 0, dur: 90, text: '频道分类，各取所需' },
  { seg: 's5', at: 0, dur: 110, text: '实时聊天，互动拉满' },
  { seg: 's6', at: 0, dur: 90, text: '校园动态，随手发布' },
  { seg: 's7', at: 0, dur: 90, text: '背景随心换' },
  { seg: 's8', at: 0, dur: 70, text: '技术支持，随时兜底' },
  { seg: 's9', at: 0, dur: 130, text: '一校人的专属空间 · bfgzlt.cc.cd' },
];

// 频道（QQ 频道风分类，S4）
// 真实侧边栏频道顺序（来自 live-layout.json）— S3 / 片尾
export const CHANNELS = [
  { name: '公告栏', emoji: '📢', desc: '官方发布' },
  { name: '综合大厅', emoji: '🌌', desc: '全校都在聊' },
  { name: '学习园地', emoji: '📚', desc: '资料互助' },
  { name: '生活日常', emoji: '🍜', desc: '随便唠' },
  { name: '二次元世界', emoji: '🎏', desc: '同好聚集' },
];

// 聊天演示消息（已脱敏，虚构用户）— S5
export const CHAT = {
  me: '小宇',
  peer: '阿May',
  messages: [
    { who: 'peer', text: '今晚操场有流星雨，谁一起去？' },
    { who: 'me', text: '我我我，带相机!' },
    { who: 'peer', text: '@小宇 记得带三脚架，不然糊成一片', mention: true },
    { who: 'me', text: '收到！顺手发了张上次拍的星空' },
    { who: 'peer', text: '食堂新窗口绝了，强烈安利' },
    { who: 'me', text: '周末篮球赛缺两人，速来 🏀' },
  ],
  // 消息图片（手搓渐变图占位，S5 beat6）
  image: { who: 'me', caption: '上次拍的英仙座流星雨 ✨', hue: 262 },
  likeFrom: '阿May',
  forwardOptions: ['站内频道', '站外链接'],
};

// 校园动态 feed（脱敏演示）— S6
export const POSTS = [
  { tag: '通知', text: '下周一到校时间调整为 7:20' },
  { tag: '社团', text: '招新啦！动漫社 / 篮球社 / 文学社' },
  { tag: '教务', text: '期中考试安排已出，详见通知' },
  { tag: '活动', text: '校园歌手大赛投票通道开启' },
  { tag: '生活', text: '图书馆三楼插座已修好' },
];

// 热门话题（排名 + 热度 0-100）— S6
export const HOT_TOPICS = [
  { rank: 1, tag: '活动', text: '校园歌手大赛投票', heat: 92 },
  { rank: 2, tag: '社团', text: '动漫社招新作品展', heat: 78 },
  { rank: 3, tag: '生活', text: '图书馆夜读区开放', heat: 64 },
  { rank: 4, tag: '教务', text: '期中安排一键查', heat: 51 },
];

// 背景主题（星空 / 极光）— S7 真截图 + 手搓切换
export const BG_THEMES = {
  star: { name: '星空', glow: 'radial-gradient(ellipse 70% 50% at 75% 20%, rgba(124,92,252,0.42), transparent 55%)', base: 'linear-gradient(180deg,#080b20,#0f1232 30%,#140f35 60%,#0d0f28)' },
  aurora: { name: '极光', glow: 'radial-gradient(ellipse 80% 55% at 40% 25%, rgba(0,210,180,0.40), transparent 55%), radial-gradient(ellipse 70% 50% at 72% 30%, rgba(124,92,252,0.38), transparent 55%)', base: 'linear-gradient(180deg,#04121f,#06283a 35%,#0a2f3a 65%,#0a1830)' },
};

// 技术支持 / 设置项 — S8
export const SUPPORT = {
  items: [
    { icon: '❓', title: '常见问题', desc: '登录 · 消息 · 设置' },
    { icon: '💬', title: '联系管理员', desc: 'admin@baofeng.campus' },
    { icon: '🔔', title: '通知设置', desc: '开关各类提醒' },
    { icon: '👤', title: '账户与安全', desc: '改密 · 绑定' },
    { icon: 'ℹ️', title: '关于', desc: '版本与条款' },
  ],
};
