// world.config.js - 世界参数（mini-UIL）
window.WORLD = {
  scrollVH: 700,
  fov: 42,
  wobble: 0.05,
  mouseLerp: 0.06,
  bg: 0x05070f,
  fogDensity: 0.022,
  bloomStrength: 0.5,
  bloomThreshold: 0.78,
  bloomRadius: 0.7,
  rgbShift: 0.0016,
  grain: 0.05,
  vignette: 0.3,
  counts: { hi: 2400, mid: 900, low: 380 },
  // 树干：粗壮多棱，沟壑由噪声位移产生
  trunkRadius: 1.05,
  trunkTop: 10.5,
  trunkBottom: -7.5,
  swirlTurns: 1.35,
  // 树顶开场
  intro: {
    title: "校园频道",
    sub: "BAOFENG CAMPUS CHANNEL"
  },
  // 照片屏：angle / y / 屏宽屏高 / 照片
  stops: [
    { key:"aerial", angle:0.55, y:6.6, len:5.6, tilt:0.10, w:3.6, h:2.4, img:"assets/campus-aerial.jpg",
      cn:"校园全景", en:"CAMPUS AERIAL", desc:"先从天上认识这座校园。",
      feats:["俯瞰全城","香山路新校区","开学第一站"],
      keywords:["全景","航拍","校园","鸟瞰"] },
    { key:"teach", angle:2.05, y:4.2, len:6.0, tilt:-0.12, w:3.8, h:2.5, img:"assets/campus-03.jpg",
      cn:"教学楼", en:"TEACHING BUILDING", desc:"教室、走廊、黑板报，都是帖子里的常客。",
      feats:["提问与解答","笔记共享","真题区","打卡组队"],
      keywords:["教学","楼","教室","上课","自习"] },
    { key:"grove", angle:3.45, y:1.7, len:5.4, tilt:0.14, w:3.6, h:2.4, img:"assets/campus-02.jpg",
      cn:"林荫道", en:"THE GROVE", desc:"树荫下面的树洞和热榜，路过就能刷到。",
      feats:["匿名发布","审核兜底","情绪树洞","夜间热榜"],
      keywords:["树洞","林荫","匿名","吐槽","心情"] },
    { key:"field", angle:4.8, y:-0.8, len:6.1, tilt:-0.10, w:3.8, h:2.5, img:"assets/campus-04.jpg",
      cn:"操场与球赛", en:"THE FIELD", desc:"招新、球赛、社团，都在日历上。",
      feats:["社团主页","活动日历","报名签到","球赛回放"],
      keywords:["操场","球赛","社团","招新","活动","报名"] },
    { key:"night", angle:6.1, y:-3.4, len:5.2, tilt:0.12, w:3.6, h:2.4, img:"assets/school-night.jpg",
      cn:"夜色校园", en:"CAMPUS NIGHT", desc:"晚自习后，论坛才是最后一场热闹。",
      keywords:["夜","晚自习","宿舍","失物","招领","饭卡"] }
  ],
  finale: {
    cn: "回到你的频道",
    desc: "无论你在教室、宿舍，还是晚自习后走在路上，频道都亮着。",
    en: "CAMPUS CHANNEL"
  }
};
