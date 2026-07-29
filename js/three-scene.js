// ===== 记忆树 / 星空档案 · Three.js 场景核心 =====
// 核心视觉：清晰锐利的记忆树 + 旋转星河融为一体。
// 关键修正：
//   1. 粒子纹理从柔光高斯球改为锐利硬点，根治糊、过曝、白饼；
//   2. 星河中心做实心核球（尺寸小、密度高、暖白色），消灭空洞；
//   3. 旋臂对比度拉高，5 条臂自然融合成连续星河；
//   4. 星 / 月 / 雪异形粒子提高清晰度并布满空间。
// 原生 JS，不引 React，关闭真 Bloom，靠 AdditiveBlending 自发光。
// 挂载：window.MTScene.create(opts) -> sceneApi

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl') || c.getContext('experimental-webgl')));
  } catch (e) { return false; }
}

// ---------- 工具 ----------
function lerpColor(out, aHex, bHex, t) {
  const a = new THREE.Color(aHex), b = new THREE.Color(bHex);
  out.copy(a).lerp(b, t);
  return out;
}
function randNormal() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function hashAngle(x) { return Math.sin(x * 12.9898 + 78.233) * 43758.5453 % 1; }

// ---------- 程序化纹理 ----------

// 锐利硬点：实心中心 + 较快衰减边缘，用于银河/树/背景恒星
// 核心更实更亮，保证 Additive 叠加后仍清晰且有光带感
function hardDotTexture(size = 256) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  const cx = size / 2;
  const g = ctx.createRadialGradient(cx, cx, 0, cx, cx, size / 2);
  g.addColorStop(0.00, 'rgba(255,255,255,1)');
  g.addColorStop(0.18, 'rgba(255,255,255,0.95)');
  g.addColorStop(0.36, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.62, 'rgba(255,255,255,0.14)');
  g.addColorStop(1.00, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(cv);
  t.needsUpdate = true;
  return t;
}

// 柔光晕：仅用于照片 hover 光晕
function glowTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)', size = 256) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, inner);
  g.addColorStop(0.30, inner.replace('1)', '0.45)'));
  g.addColorStop(0.72, inner.replace('1)', '0.08)'));
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(cv);
  t.needsUpdate = true;
  return t;
}

// ===== 以下三个纹理严格复制参考仓库 MemoryArchive.jsx 的 StarDust 实现 =====
// 64x64、白色发光（shadowBlur 12）、清晰形状，绝不过度放大或加彩色。
function snowTexture() {
  const s = 64; const cv = document.createElement('canvas'); cv.width = cv.height = s;
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, s, s);
  ctx.fillStyle = 'white'; ctx.shadowBlur = 12; ctx.shadowColor = 'white';
  ctx.strokeStyle = 'white'; ctx.lineWidth = 5; ctx.lineCap = 'round';
  const cx = 32, cy = 32;
  for (let i = 0; i < 6; i++) {
    const angle = (i * 60) * Math.PI / 180;
    ctx.beginPath(); ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(angle) * 28, cy + Math.sin(angle) * 28);
    const bx = cx + Math.cos(angle) * 18, by = cy + Math.sin(angle) * 18;
    ctx.moveTo(bx, by); ctx.lineTo(bx + Math.cos(angle + 0.6) * 10, by + Math.sin(angle + 0.6) * 10);
    ctx.moveTo(bx, by); ctx.lineTo(bx + Math.cos(angle - 0.6) * 10, by + Math.sin(angle - 0.6) * 10);
    ctx.stroke();
  }
  const t2 = new THREE.CanvasTexture(cv); t2.needsUpdate = true; return t2;
}
function starTexture() {
  const s = 64; const cv = document.createElement('canvas'); cv.width = cv.height = s;
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, s, s);
  ctx.fillStyle = 'white'; ctx.shadowBlur = 12; ctx.shadowColor = 'white';
  const cx = 32, cy = 32, spikes = 5, outer = 28, inner = 12;
  let rot = Math.PI / 2 * 3, step = Math.PI / spikes;
  ctx.beginPath(); ctx.moveTo(cx, cy - outer);
  for (let i = 0; i < spikes; i++) {
    ctx.lineTo(cx + Math.cos(rot) * outer, cy + Math.sin(rot) * outer); rot += step;
    ctx.lineTo(cx + Math.cos(rot) * inner, cy + Math.sin(rot) * inner); rot += step;
  }
  ctx.closePath(); ctx.fill();
  const t2 = new THREE.CanvasTexture(cv); t2.needsUpdate = true; return t2;
}
function moonTexture() {
  const s = 64; const cv = document.createElement('canvas'); cv.width = cv.height = s;
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, s, s);
  ctx.fillStyle = 'white'; ctx.shadowBlur = 12; ctx.shadowColor = 'white';
  ctx.beginPath();
  const start = Math.PI * 0.6, end = Math.PI * 1.4;
  ctx.arc(32, 32, 26, start, end, true);
  ctx.bezierCurveTo(44, 19, 44, 45, 32 + Math.cos(start) * 26, 32 + Math.sin(start) * 26);
  ctx.fill();
  const t2 = new THREE.CanvasTexture(cv); t2.needsUpdate = true; return t2;
}

// ---------- 共享点材质（锐利硬点 + Additive 发光） ----------
function basePointsMaterial(map, opts = {}) {
  const { maxSize = 12.0, depthTest = true } = opts;
  return new THREE.ShaderMaterial({
    uniforms: { map: { value: map } },
    vertexShader: `
      attribute float aSize;
      attribute vec3 aColor;
      attribute float aAlpha;
      varying vec3 vColor;
      varying float vAlpha;
      void main(){
        vColor = aColor;
        vAlpha = aAlpha;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = clamp(aSize * (420.0 / -mv.z), 0.3, ${maxSize.toFixed(1)});
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform sampler2D map;
      varying vec3 vColor;
      varying float vAlpha;
      void main(){
        vec4 t = texture2D(map, gl_PointCoord);
        if (t.a < 0.04) discard;
        gl_FragColor = vec4(vColor, vAlpha) * t.a;
      }`,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: depthTest
  });
}

// ---------- 螺旋星系：明亮粗壮、5 臂连续融合的旋转星河（参考图风格） ----------
function buildGalaxyDisk(group, cfg, tex) {
  const count = cfg.galaxyParticles;
  const arms = cfg.galaxyArms;
  const radius = cfg.galaxyRadius;
  const thickness = cfg.galaxyThickness;
  const armWidth = cfg.galaxyArmWidth;
  const tightness = cfg.galaxyTightness;
  const bulgeR = cfg.bulgeRadius || radius * 0.10;

  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const siz = new Float32Array(count);
  const alp = new Float32Array(count);
  const c = new THREE.Color();

  // 颜色：参考图风格——暖白核球 → 饱和粉 → 青蓝外缘
  const colorCore = new THREE.Color(0xfff8f0);  // 暖白核球（更亮，避免中心发黄发暗）
  const colorWarm = new THREE.Color(0xffd0a0);  // 暖橙过渡
  const colorPink = new THREE.Color(0xff7eb8);  // 饱和粉白旋臂
  const colorWhite = new THREE.Color(0xe8f4ff); // 亮白带
  const colorCyan = new THREE.Color(0x6ad4ff);  // 青
  const colorBlue = new THREE.Color(0x4a7cff);  // 蓝
  const colorFar = new THREE.Color(0x203070);   // 暗蓝外缘

  // 密度波：计算某角度/半径处在旋臂上的强度（0~1）
  function armStrength(r, theta) {
    const logR = Math.log(Math.max(1.2, r / bulgeR));
    let maxS = 0;
    for (let a = 0; a < arms; a++) {
      const armBase = (a / arms) * Math.PI * 2;
      const armAngle = armBase + logR * tightness;
      let diff = Math.abs(((theta - armAngle + Math.PI) % (Math.PI * 2)) - Math.PI);
      const w = armWidth * (0.55 + 0.60 * (r / radius));
      const s = Math.exp(-(diff * diff) / (2 * w * w));
      maxS = Math.max(maxS, s);
    }
    // 连续底盘：臂与臂之间保留少量基础强度，既连续融合又不糊成圆球
    return Math.max(maxS, 0.16);
  }

  for (let i = 0; i < count; i++) {
    // 半径分布：较均匀，旋臂区粒子充足
    const t = Math.pow(Math.random(), cfg.galaxyRadialPower);
    const r = bulgeR * 0.12 + t * (radius - bulgeR * 0.12);
    const theta = Math.random() * Math.PI * 2;

    const strength = armStrength(r, theta);

    // 核球区：纵向拉长的椭球，填满中心并与树底融为一体
    const bulgeH = cfg.bulgeHeight || bulgeR * 1.8;
    let y;
    if (r < bulgeR) {
      const hFactor = Math.sqrt(Math.max(0, 1 - Math.pow(r / bulgeR, 2)));
      y = randNormal() * bulgeH * 0.65 * hFactor;
    } else {
      const diskH = thickness * (0.25 + 0.75 * Math.min(1, (r - bulgeR) / (radius * 0.55)));
      y = randNormal() * diskH * 0.28;
    }

    // 旋臂偏移
    const armSpread = (radius * 0.020) * (0.5 + 0.7 * (r / radius));
    const radialJitter = (Math.random() - 0.5) * armSpread * (1.0 - strength * 0.45);
    const finalR = r + radialJitter;
    const angle = theta + randNormal() * armSpread / Math.max(1, r * 0.5);

    pos[i * 3] = Math.cos(angle) * finalR;
    pos[i * 3 + 1] = y;
    pos[i * 3 + 2] = Math.sin(angle) * finalR;

    // 颜色：按半径连续渐变（暖黄核球 → 粉 → 白 → 青 → 蓝 → 暗蓝）
    const distRatio = r / radius;
    if (distRatio < 0.08) {
      c.copy(colorCore).lerp(colorWarm, distRatio / 0.08);
    } else if (distRatio < 0.26) {
      c.copy(colorWarm).lerp(colorPink, (distRatio - 0.08) / 0.18);
    } else if (distRatio < 0.46) {
      c.copy(colorPink).lerp(colorWhite, (distRatio - 0.26) / 0.20);
    } else if (distRatio < 0.66) {
      c.copy(colorWhite).lerp(colorCyan, (distRatio - 0.46) / 0.20);
    } else if (distRatio < 0.84) {
      c.copy(colorCyan).lerp(colorBlue, (distRatio - 0.66) / 0.18);
    } else {
      c.copy(colorBlue).lerp(colorFar, (distRatio - 0.84) / 0.16);
    }
    // 旋臂内部偏亮白，增强光带感
    c.lerp(new THREE.Color(0xffffff), strength * 0.36);
    // 核球更暖白；极中心额外加白色高亮，让核心发光
    if (distRatio < 0.08) c.lerp(colorCore, 0.55);
    if (distRatio < 0.035) c.lerp(new THREE.Color(0xffffff), 0.45);

    // 尺寸：粗壮明亮的旋臂光带，中心更实更亮
    let size;
    if (distRatio < 0.10) size = 0.78 + Math.random() * 0.45;
    else if (distRatio < 0.40) size = 0.95 + Math.random() * 0.75;
    else if (distRatio < 0.72) size = 0.72 + Math.random() * 0.55;
    else size = 0.48 + Math.random() * 0.38;
    size *= (0.52 + strength * 0.68);

    // 透明度：旋臂明亮、底盘可见、核球实心发光
    let alpha = 0.34 + strength * 0.62;
    if (distRatio < 0.10) alpha = 0.72 + strength * 0.22;
    if (distRatio < 0.035) alpha = 0.85 + strength * 0.12;
    alpha *= (1.0 - distRatio * 0.26);
    alpha *= 0.9 + Math.random() * 0.1;

    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    siz[i] = size;
    alp[i] = clamp(alpha, 0.06, 1.0);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(siz, 1));
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(alp, 1));
  const pts = new THREE.Points(geo, basePointsMaterial(tex, { maxSize: 14.0 }));
  pts.name = 'galaxyDisk';
  group.add(pts);
  return pts;
}

// ---------- 尘埃带：嵌在亮臂之间的暗螺旋带 ----------
function buildDustLanes(group, cfg, tex) {
  const count = Math.floor(cfg.galaxyParticles * 0.15);
  const arms = cfg.galaxyArms;
  const radius = cfg.galaxyRadius;
  const thickness = cfg.galaxyThickness * 1.05;
  const tightness = cfg.galaxyTightness;
  const bulgeR = cfg.bulgeRadius || radius * 0.10;

  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const siz = new Float32Array(count);
  const alp = new Float32Array(count);
  const c = new THREE.Color();

  for (let i = 0; i < count; i++) {
    const armIdx = i % arms;
    const armBase = ((armIdx + 0.5) / arms) * Math.PI * 2;
    const t = 0.15 + Math.pow(Math.random(), 1.2) * 0.82;
    const r = t * radius;
    const logR = Math.log(Math.max(1.2, r / bulgeR));
    const armAngle = armBase + logR * tightness;
    const w = cfg.galaxyArmWidth * 1.05 * (0.7 + 0.4 * t);
    const angle = armAngle + randNormal() * w;

    pos[i * 3] = Math.cos(angle) * r;
    pos[i * 3 + 1] = randNormal() * thickness * 0.22;
    pos[i * 3 + 2] = Math.sin(angle) * r;

    lerpColor(c, 0x2a1a3a, 0x1a2a45, Math.random());
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    siz[i] = 0.65 + Math.random() * 0.55;
    alp[i] = 0.16 + Math.random() * 0.16;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(siz, 1));
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(alp, 1));
  const pts = new THREE.Points(geo, basePointsMaterial(tex, { maxSize: 6.0 }));
  pts.name = 'dustLanes';
  group.add(pts);
  return pts;
}

// ---------- 记忆树：实心蓬松的松树/圣诞树，从银河核球中心生长 ----------
function buildMemoryTree(group, cfg, tex) {
  const count = cfg.treeParticles;
  const H = cfg.treeHeight;
  const baseR = cfg.treeBaseRadius;
  const tiers = cfg.treeBranchTiers || 10;
  const branchesPerTier = cfg.treeBranchesPerTier || 8;
  const branchAmp = cfg.treeBranchAmp || 0.32;
  const branchLift = cfg.branchLift || 0.28;
  const trunkW = cfg.treeTrunkWidth || 0.42;
  const trunkFill = cfg.trunkFill || 0.25;

  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const siz = new Float32Array(count);
  const alp = new Float32Array(count);
  const c = new THREE.Color();
  const colorBot = new THREE.Color(0xffe9b0);
  const colorMid = new THREE.Color(0xffb8c8);
  const colorTop = new THREE.Color(0xf0f8ff);

  // 半径轮廓：底宽、向上平滑收窄，但不过尖
  function radiusAt(y) {
    const t = Math.max(0, Math.min(1, y / H));
    return baseR * Math.pow(1 - t, 0.62);
  }

  let i = 0;

  // 1) 实心体积锥：在树轮廓内按体积采样，中心密、外缘疏，根本解决空心
  //    核心策略：专门用高亮白色粒子填满中心柱，外缘用较小粒子过渡
  const volumeCount = Math.floor(count * 0.55);
  for (let k = 0; k < volumeCount && i < count; k++) {
    const y = Math.random() * H;
    const R = radiusAt(y);
    const trunkR = Math.max(1.8, R * trunkW * 1.35);
    const coreR = trunkR * 1.6;

    // 55% 的体积粒子专门放在核心柱内，保证中心不透明
    const inCore = Math.random() < 0.55;
    let r;
    if (inCore) {
      r = Math.pow(Math.random(), 0.75) * coreR;
    } else {
      r = coreR + Math.sqrt(Math.random()) * (R - coreR);
    }
    r = Math.min(r, R * 0.98);
    const theta = Math.random() * Math.PI * 2;
    pos[i * 3] = Math.cos(theta) * r;
    pos[i * 3 + 1] = y;
    pos[i * 3 + 2] = Math.sin(theta) * r;

    const t = y / H;
    if (t < 0.35) c.copy(colorBot).lerp(colorMid, t / 0.35);
    else c.copy(colorMid).lerp(colorTop, (t - 0.35) / 0.65);

    // 核心区域：纯白/暖白高亮，尺寸大、alpha 高，彻底压住暗洞
    const coreRatio = r / Math.max(0.01, coreR);
    if (r < coreR) {
      c.lerp(new THREE.Color(0xfff8f0), 0.75 - coreRatio * 0.35);
    }
    if (Math.random() < 0.08) c.lerp(new THREE.Color(0xffffff), 0.55);

    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    // 核心粒子明显更大更亮，外缘细小
    if (r < coreR) {
      siz[i] = 0.85 + (1 - coreRatio) * 0.55 + Math.random() * 0.25;
      alp[i] = 0.92 + (1 - coreRatio) * 0.07 + Math.random() * 0.02;
    } else {
      siz[i] = 0.36 + (1 - r / Math.max(0.01, R)) * 0.28 + Math.random() * 0.16;
      alp[i] = 0.72 + (1 - r / Math.max(0.01, R)) * 0.16 + Math.random() * 0.06;
    }
    i++;
  }

  // 2) 放射树枝：从树干向外伸出，方向带随机仰角，层间连续
  const branchCount = Math.floor(count * 0.38);
  const ppc = Math.max(60, Math.floor(branchCount / (tiers * branchesPerTier)));
  for (let ti = 0; ti < tiers && i < count; ti++) {
    const yc = ((ti + 0.5) / tiers) * H;
    const R = radiusAt(yc);
    const trunkR = Math.max(1.4, R * trunkW);
    const branchLen = R * (0.48 + branchAmp * 0.55);
    const baseTheta = (ti % 2) * (Math.PI / branchesPerTier);
    for (let bj = 0; bj < branchesPerTier && i < count; bj++) {
      const theta0 = baseTheta + (bj / branchesPerTier) * Math.PI * 2;
      for (let k = 0; k < ppc && i < count; k++) {
        // 沿枝长度：梢端更密（蓬松感）
        const lNorm = Math.pow(Math.random(), 0.55);
        const l = trunkR + lNorm * (branchLen - trunkR);
        // 方向带随机仰角：-20° ~ +55°，既有水平外伸也有上扬下垂，消灭盘子感
        const pitch = (Math.random() - 0.4) * 1.40 + branchLift * 0.55;
        const r = l * Math.cos(pitch);
        const dy = l * Math.sin(pitch);
        // 径向蓬松
        const rFuzz = r + randNormal() * branchLen * (0.10 + 0.18 * lNorm);
        if (rFuzz < 0.8) continue;
        const y = yc + dy + randNormal() * branchLen * 0.22;
        if (y < 0 || y > H) continue;
        // 角度轻微错开
        const th = theta0 + randNormal() * 0.12;
        pos[i * 3] = Math.cos(th) * rFuzz;
        pos[i * 3 + 1] = y;
        pos[i * 3 + 2] = Math.sin(th) * rFuzz;

        const t = y / H;
        if (t < 0.35) c.copy(colorBot).lerp(colorMid, t / 0.35);
        else c.copy(colorMid).lerp(colorTop, (t - 0.35) / 0.65);
        // 枝梢高亮
        const tipRatio = Math.max(0, (l - trunkR) / Math.max(0.01, branchLen - trunkR));
        if (tipRatio > 0.55 || Math.random() < 0.07) c.lerp(new THREE.Color(0xffffff), 0.45 + tipRatio * 0.30);

        col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
        siz[i] = 0.38 + tipRatio * 0.46 + Math.random() * 0.20;
        alp[i] = 0.82 + Math.random() * 0.14;
        i++;
      }
    }
  }

  // 3) 树干：中心实心柱，亮度最高，压住暗洞
  const trunkCount = Math.floor(count * trunkFill);
  for (let k = 0; k < trunkCount && i < count; k++) {
    const y = Math.random() * H;
    const R = radiusAt(y);
    // 树干半径：底部最粗，向上线性收窄
    const trunkR = Math.max(1.6, R * trunkW * (1.45 - 0.55 * (y / H)));
    // 中心加权采样，让树干更实心
    const r = Math.pow(Math.random(), 0.65) * trunkR;
    const theta = Math.random() * Math.PI * 2;
    pos[i * 3] = Math.cos(theta) * r;
    pos[i * 3 + 1] = y;
    pos[i * 3 + 2] = Math.sin(theta) * r;
    const t = y / H;
    if (t < 0.35) c.copy(colorBot).lerp(colorMid, t / 0.35);
    else c.copy(colorMid).lerp(colorTop, (t - 0.35) / 0.65);
    // 树干更暖更亮
    c.lerp(colorBot, 0.25);

    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    siz[i] = 0.44 + Math.random() * 0.28;
    alp[i] = 0.88 + Math.random() * 0.10;
    i++;
  }

  // 4) 少量顶层填充，让顶部更尖更饱满
  const topCount = Math.floor(count * 0.05);
  for (let k = 0; k < topCount && i < count; k++) {
    const y = H * (0.78 + Math.random() * 0.22);
    const R = radiusAt(y);
    const r = Math.pow(Math.random(), 1.4) * R;
    const theta = Math.random() * Math.PI * 2;
    pos[i * 3] = Math.cos(theta) * r;
    pos[i * 3 + 1] = y;
    pos[i * 3 + 2] = Math.sin(theta) * r;
    c.copy(colorMid).lerp(colorTop, (y / H - 0.35) / 0.65);
    if (Math.random() < 0.15) c.lerp(new THREE.Color(0xffffff), 0.6);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    siz[i] = 0.34 + Math.random() * 0.26;
    alp[i] = 0.80 + Math.random() * 0.14;
    i++;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos.subarray(0, i * 3), 3));
  geo.setAttribute('aColor', new THREE.BufferAttribute(col.subarray(0, i * 3), 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(siz.subarray(0, i), 1));
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(alp.subarray(0, i), 1));
  const pts = new THREE.Points(geo, basePointsMaterial(tex, { maxSize: 11.0 }));
  pts.name = 'memoryTree';
  group.add(pts);
  return pts;
}

// ---------- 树顶五角星 ----------
function buildStarTop(group, cfg, tex) {
  const R = 2.0, thick = 0.30, count = cfg.starTopParticles;
  const verts = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 5;
    const rr = (i % 2 === 0) ? R : R * 0.42;
    verts.push([Math.cos(a) * rr, Math.sin(a) * rr]);
  }
  const inside = (x, y) => {
    let inside_ = false;
    for (let i = 0, j = 9; i < 10; j = i++) {
      const [xi, yi] = verts[i], [xj, yj] = verts[j];
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside_ = !inside_;
    }
    return inside_;
  };
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const siz = new Float32Array(count);
  const c = new THREE.Color();
  let n = 0, guard = 0;
  while (n < count && guard < count * 50) {
    guard++;
    const x = (Math.random() * 2 - 1) * R;
    const y = (Math.random() * 2 - 1) * R;
    if (!inside(x, y)) continue;
    const z = (Math.random() - 0.5) * thick;
    pos[n * 3] = x; pos[n * 3 + 1] = y + cfg.treeHeight + 1.0; pos[n * 3 + 2] = z;
    const d = Math.sqrt(x * x + y * y) / R;
    lerpColor(c, 0xfff8e7, 0xffc4a3, d);
    col[n * 3] = c.r; col[n * 3 + 1] = c.g; col[n * 3 + 2] = c.b;
    siz[n] = 0.34 + Math.random() * 0.28;
    n++;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos.subarray(0, n * 3), 3));
  geo.setAttribute('aColor', new THREE.BufferAttribute(col.subarray(0, n * 3), 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(siz.subarray(0, n), 1));
  const alphaArr = new Float32Array(n).fill(0.95);
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(alphaArr, 1));
  const star = new THREE.Points(geo, basePointsMaterial(tex, { maxSize: 5.0 }));
  star.name = 'starTop';
  group.add(star);
}

// ---------- 背景恒星场 ----------
function buildStarField(group, cfg, tex) {
  const count = cfg.starFieldParticles;
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const siz = new Float32Array(count);
  const alp = new Float32Array(count);
  const c = new THREE.Color();
  const inner = cfg.galaxyRadius * 1.05;
  const outer = cfg.galaxyRadius * 3.5;

  for (let i = 0; i < count; i++) {
    const r = inner + Math.pow(Math.random(), 0.7) * (outer - inner);
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(Math.random() * 2 - 1);
    pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    pos[i * 3 + 1] = r * Math.cos(phi);
    pos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    const temp = Math.random();
    if (temp < 0.25) c.set(0xddeeff);
    else if (temp < 0.50) c.set(0xffffff);
    else if (temp < 0.75) c.set(0xfff4e6);
    else c.set(0xbfd8ff);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    siz[i] = 0.08 + Math.random() * 0.18;
    alp[i] = 0.30 + Math.random() * 0.38;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(siz, 1));
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(alp, 1));
  const pts = new THREE.Points(geo, basePointsMaterial(tex, { maxSize: 3.0 }));
  pts.name = 'starField';
  group.add(pts);
  return pts;
}

// ---------- 前景星尘：星 / 雪 / 月（小而密，参考仓库 StarDust 的密度感） ----------
// 参考图特征：粒子小而密、均匀弥漫，包括树周围空间；只避免贴在树干实体上。
function buildAmbientParticles(group, cfg) {
  const totalCount = cfg.ambientParticles || 8000;      // 总数量（三类均分）
  const countPerType = Math.floor(totalCount / 3);
  const starTex = starTexture();
  const snowTex = snowTexture();
  const moonTex = moonTexture();
  const inner = 8;    // 紧贴树周围开始
  const outer = 160;  // 覆盖整个可视空间

  const makeSet = (texture, speedMult, baseSize) => {
    const p = new Float32Array(countPerType * 3);
    const col = new Float32Array(countPerType * 3);
    const c = new THREE.Color();
    let placed = 0;
    while (placed < countPerType) {
      // 球体体积采样：r^2 加权，让各半径密度均匀
      const r = inner + Math.pow(Math.random(), 1 / 3) * (outer - inner);
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 2 - 1);
      const x = r * Math.sin(phi) * Math.cos(theta);
      const y = r * Math.sin(phi) * Math.sin(theta);
      const z = r * Math.cos(phi);
      // 只排除树干实体（半径 < 6，y 0~50），树冠周围和上方允许粒子
      const cylR = Math.sqrt(x * x + z * z);
      if (cylR < 6 && y > 0 && y < 50) continue;
      p[placed * 3] = x;
      p[placed * 3 + 1] = y;
      p[placed * 3 + 2] = z;
      // 颜色：白色为主，极少量淡色点缀
      const temp = Math.random();
      if (temp < 0.25) c.set(0xddeeff);
      else if (temp < 0.50) c.set(0xffffff);
      else if (temp < 0.75) c.set(0xfff4e6);
      else c.set(0xbfd8ff);
      col[placed * 3] = c.r; col[placed * 3 + 1] = c.g; col[placed * 3 + 2] = c.b;
      placed++;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mat = new THREE.PointsMaterial({
      size: baseSize,                                     // 每类大小略有差异
      map: texture,
      transparent: true,
      alphaTest: 0.05,
      vertexColors: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true
    });
    const pts = new THREE.Points(geo, mat);
    pts.name = 'ambient';
    group.add(pts);
    return { points: pts, speedMult };
  };

  return [
    makeSet(starTex, 1.0, 1.2 + Math.random() * 0.4),
    makeSet(snowTex, 0.8, 1.0 + Math.random() * 0.35),
    makeSet(moonTex, 0.6, 1.15 + Math.random() * 0.4)
  ];
}

// ---------- 柔和星云渐变：大尺度彩色光晕，不抢主体但恢复渐变氛围 ----------
function buildNebula(group, cfg) {
  const clouds = [
    { color: 0x5a8cff, r: cfg.galaxyRadius * 0.55, y: cfg.galaxyThickness * 0.6, scale: 80, opacity: 0.10 },
    { color: 0xff6ac8, r: cfg.galaxyRadius * 0.72, y: cfg.galaxyThickness * 0.2, scale: 95, opacity: 0.09 },
    { color: 0x4ad4ff, r: cfg.galaxyRadius * 0.45, y: -cfg.galaxyThickness * 0.5, scale: 70, opacity: 0.11 },
    { color: 0x8a6aff, r: cfg.galaxyRadius * 0.88, y: cfg.galaxyThickness * 0.4, scale: 110, opacity: 0.07 }
  ];
  const sprites = [];
  const tex = glowTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)', 256);
  for (const cloud of clouds) {
    const mat = new THREE.SpriteMaterial({
      map: tex, color: cloud.color, transparent: true, opacity: cloud.opacity,
      blending: THREE.AdditiveBlending, depthWrite: false
    });
    const sprite = new THREE.Sprite(mat);
    const theta = Math.random() * Math.PI * 2;
    sprite.position.set(Math.cos(theta) * cloud.r, cloud.y, Math.sin(theta) * cloud.r);
    sprite.scale.setScalar(cloud.scale);
    sprite.userData = { opacity: cloud.opacity, phase: Math.random() * Math.PI * 2, speed: 0.03 + Math.random() * 0.04 };
    group.add(sprite);
    sprites.push(sprite);
  }
  return sprites;
}

// ---------- 流星拖尾 ----------
function buildMeteors(group, cfg, tex) {
  const n = cfg.meteorCount;
  const verts = new Float32Array(n * 2 * 3);
  const dirs = [];
  for (let i = 0; i < n; i++) {
    const start = new THREE.Vector3((Math.random() - 0.5) * 340, 90 + Math.random() * 100, (Math.random() - 0.5) * 240 - 40);
    const d = new THREE.Vector3(-1 - Math.random(), -0.55 - Math.random() * 0.45, -0.15 - Math.random() * 0.35).normalize();
    dirs.push({ p: start, d, speed: 75 + Math.random() * 85, len: 14 + Math.random() * 22 });
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
  const mat = new THREE.LineBasicMaterial({ color: 0xcce8ff, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false });
  const lines = new THREE.LineSegments(geo, mat);
  group.add(lines);
  return { lines, dirs, verts };
}

// ---------- 照片节点位置：环绕记忆树的中层立体轨道 ----------
function getMemoryPos(idx, total, cfg) {
  const angle = Math.random() * Math.PI * 2;
  const r = 45 + Math.random() * 62;            // 绕树中层（45 ~ 107）
  const y = -cfg.treeHeight * 0.38 + Math.random() * cfg.treeHeight * 0.96; // 高度覆盖整棵树
  const a2 = angle + (r / 100) * 1.4;           // 轻微螺旋感
  return new THREE.Vector3(Math.cos(a2) * r, y, Math.sin(a2) * r);
}

window.MTScene = {
  create(opts) {
    const { canvas, config, data, onProgress, onNodeClick, onReady, reducedMotion } = opts;
    if (!webglAvailable()) return { fallback: true };

    const cfg = config.scene;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    const dpr = Math.min(window.devicePixelRatio || 1, window.innerWidth < 720 ? 1.5 : 2);
    renderer.setPixelRatio(dpr);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x000000, 1);

    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 3000);
    camera.position.set(0, 18, 150);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false;
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.autoRotate = false; // 相机静止，由 galaxyGroup 整体自转实现"星河+树一体旋转"
    controls.autoRotateSpeed = cfg.autoRotateSpeed;
    controls.minDistance = 45;
    controls.maxDistance = 400;
    controls.maxPolarAngle = Math.PI * 0.92;
    controls.target.set(0, 18, 0);

    const sceneRoot = new THREE.Group();
    scene.add(sceneRoot);

    const galaxyGroup = new THREE.Group();
    sceneRoot.add(galaxyGroup);

    const ambientGroup = new THREE.Group();
    sceneRoot.add(ambientGroup);

    const dotTex = hardDotTexture(256);
    const glowTex = glowTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)', 256);

    // 核心视觉：清晰融合的螺旋星河盘
    const disk = buildGalaxyDisk(galaxyGroup, cfg, dotTex);
    const dust = buildDustLanes(galaxyGroup, cfg, dotTex);
    const starField = buildStarField(galaxyGroup, cfg, dotTex);

    // 记忆树（从银河核球生长）
    const memoryTree = buildMemoryTree(galaxyGroup, cfg, dotTex);
    buildStarTop(galaxyGroup, cfg, dotTex);

    // 前景异形粒子
    const ambient = buildAmbientParticles(ambientGroup, cfg);

    // 柔和星云渐变（恢复渐变氛围）
    const nebula = config.features.nebula !== false ? buildNebula(ambientGroup, cfg) : [];

    // 流星
    const metro = config.features.meteors ? buildMeteors(sceneRoot, cfg, dotTex) : null;

    // 进入动画初态（相机初位与缩放由下方「进入动画」段统一设置）
    sceneRoot.scale.setScalar(reducedMotion ? 1 : 0.05);

    // ---------- 媒体节点 ----------
    const manager = new THREE.LoadingManager();
    let loadedCount = 0, totalTex = 0;
    manager.onProgress = () => { loadedCount++; if (onProgress && totalTex) onProgress(Math.min(0.99, loadedCount / totalTex)); };
    const loader = new THREE.TextureLoader(manager);
    loader.setCrossOrigin('anonymous');

    const nodes = [];
    const pickables = [];
    const mediaGroup = new THREE.Group();
    galaxyGroup.add(mediaGroup);

    function createTextCardTexture(post) {
      const w = 512, h = 512;
      const cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      const ctx = cv.getContext('2d');
      const grad = ctx.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0, 'rgba(38,44,92,0.98)');
      grad.addColorStop(1, 'rgba(16,20,44,0.99)');
      ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(255,255,255,0.14)'; ctx.lineWidth = 4;
      ctx.strokeRect(10, 10, w - 20, h - 20);

      const content = String(post.content || '').trim();
      const maxWidth = w - 90;
      const lineHeight = 46;
      const fontSize = content.length > 90 ? 26 : (content.length > 50 ? 30 : 34);
      ctx.font = `${fontSize}px "Noto Sans SC", "Microsoft YaHei", sans-serif`;
      ctx.fillStyle = 'rgba(245,247,255,0.95)';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';

      const chars = content.split('');
      const lines = []; let line = '';
      for (const ch of chars) {
        const test = line + ch;
        if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = ch; }
        else line = test;
      }
      if (line) lines.push(line);
      if (lines.length > 6) { lines.length = 6; lines[5] = lines[5].replace(/.$/, '…'); }
      const startY = h / 2 - ((lines.length - 1) * lineHeight) / 2;
      lines.forEach((l, i) => ctx.fillText(l, w / 2, startY + i * lineHeight));

      ctx.font = '20px "Noto Sans SC", "Microsoft YaHei", sans-serif';
      ctx.fillStyle = 'rgba(180,195,230,0.65)';
      ctx.fillText(`— ${post.authorName || '匿名同学'}`, w / 2, h - 68);

      const t = new THREE.CanvasTexture(cv);
      t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true;
      return t;
    }

    function makeMediaNode(item, idx, texOverride) {
      let tex2;
      if (texOverride) tex2 = texOverride;
      else {
        tex2 = loader.load(item.url || '');
        tex2.colorSpace = THREE.SRGBColorSpace;
        tex2.anisotropy = 4;
      }

      const w = 4.2, h = 4.2;
      const mat = new THREE.MeshBasicMaterial({ map: tex2, transparent: true, side: THREE.DoubleSide, depthWrite: false });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
      const glowMat = new THREE.MeshBasicMaterial({ map: glowTex, color: 0x9ad8ff, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
      const glow = new THREE.Mesh(new THREE.PlaneGeometry(w * 1.5, h * 1.5), glowMat);
      glow.position.z = -0.05;

      const container = new THREE.Group();
      container.add(glow); container.add(mesh);
      const base = getMemoryPos(idx, data.length + (window.MTPosts ? 20 : 0), cfg);
      container.position.copy(base);
      container.userData = { item, baseY: container.position.y, phase: Math.random() * Math.PI * 2, mesh, glow, hovered: false };
      mediaGroup.add(container);
      pickables.push(mesh);
      nodes.push(container);
    }
    data.forEach((it, i) => makeMediaNode(it, i));
    totalTex = data.length;

    // ---------- 交互 ----------
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let hovered = null;
    const dom = renderer.domElement;

    function setPointer(e) {
      const x = (e.touches ? e.touches[0].clientX : e.clientX);
      const y = (e.touches ? e.touches[0].clientY : e.clientY);
      pointer.x = (x / window.innerWidth) * 2 - 1;
      pointer.y = -(y / window.innerHeight) * 2 + 1;
    }
    function pick() {
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(pickables, false);
      return hits.length ? hits[0].object : null;
    }
    function onMove(e) {
      if (reducedMotion) return;
      setPointer(e);
      const obj = pick();
      const cont = obj ? obj.parent : null;
      if (hovered && hovered !== cont) { hovered.userData.hovered = false; api.playSfx('out'); }
      hovered = cont;
      if (cont) {
        cont.userData.hovered = true; api.playSfx('hover'); dom.style.cursor = 'pointer';
      } else {
        dom.style.cursor = 'default';
      }
    }
    function onClick(e) {
      setPointer(e);
      const obj = pick();
      if (obj && obj.parent && obj.parent.userData.item) {
        api.playSfx('click');
        onNodeClick && onNodeClick(obj.parent.userData.item);
      }
    }
    dom.addEventListener('pointermove', onMove);
    dom.addEventListener('click', onClick);

    // ---------- 进入动画（自实现缓动，不依赖外部库，更可靠） ----------
    let entryDone = false, entryStart = 0, firstFrameRendered = false;
    const camFrom = new THREE.Vector3(0, 60, 300);
    const camTo = new THREE.Vector3(0, 18, 150);
    function easeInOut(x) { return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; }
    function finishEntry() {
      if (entryDone) return; entryDone = true;
    }
    if (reducedMotion) {
      camera.position.copy(camTo);
      sceneRoot.scale.setScalar(1);
      finishEntry();
    } else {
      // 初始：远且略高，缓缓推近到观察位
      entryStart = performance.now();
      camera.position.copy(camFrom);
      sceneRoot.scale.setScalar(0.06);
    }
    setTimeout(finishEntry, 9000);

    // ---------- 音频 ----------
    let actx = null, bgmGain = null, masterGain = null, sfxOn = true, musicOn = false;
    function ensureAudio() {
      if (actx) { if (actx.state === 'suspended') actx.resume(); return; }
      try {
        actx = new (window.AudioContext || window.webkitAudioContext)();
        masterGain = actx.createGain(); masterGain.gain.value = 0.9; masterGain.connect(actx.destination);
        bgmGain = actx.createGain(); bgmGain.gain.value = 0; bgmGain.connect(masterGain);
        const filter = actx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 900; filter.connect(bgmGain);
        const chord = config.audio.chord;
        chord.forEach((f) => {
          const o = actx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
          const g = actx.createGain(); g.gain.value = 0.33; o.connect(g); g.connect(filter); o.start();
          const det = actx.createOscillator(); det.type = 'triangle'; det.frequency.value = f * 1.005;
          const g2 = actx.createGain(); g2.gain.value = 0.12; det.connect(g2); g2.connect(filter); det.start();
        });
        const lfo = actx.createOscillator(); lfo.frequency.value = 0.08;
        const lfoG = actx.createGain(); lfoG.gain.value = 300; lfo.connect(lfoG); lfoG.connect(filter.frequency); lfo.start();
      } catch (e) { actx = null; }
    }
    function startBgm() { if (!actx) ensureAudio(); if (!actx) return; musicOn = true; bgmGain.gain.linearRampToValueAtTime(config.audio.bgmGain, actx.currentTime + 1.5); }
    function stopBgm() { if (!actx) return; musicOn = false; bgmGain.gain.linearRampToValueAtTime(0, actx.currentTime + 0.8); }
    function playSfx(type) {
      if (!sfxOn || !actx) return;
      const o = actx.createOscillator(); const g = actx.createGain();
      const map = { hover: [880, 0.05], click: [1320, 0.12], out: [520, 0.04] };
      const [f, dur] = map[type] || [660, 0.08];
      o.type = 'sine'; o.frequency.value = f;
      g.gain.value = config.audio.sfxGain;
      g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + dur);
      o.connect(g); g.connect(masterGain); o.start(); o.stop(actx.currentTime + dur);
    }

    // ---------- 渲染循环 ----------
    const clock = new THREE.Clock();
    const _invQ = new THREE.Quaternion();
    let running = true;
    let rafId = 0;
    function animate() {
      if (!running) return;
      rafId = requestAnimationFrame(animate);
      const t = clock.getElapsedTime();

      // 整个星河盘（含树、尘埃带、照片）一起缓慢旋转，保持一体
      if (!reducedMotion) galaxyGroup.rotation.y = t * cfg.autoRotateSpeed;

      // 异形粒子：严格复制仓库 StarDust 动画（缓慢自转 + 透明度呼吸）
      if (ambient) ambient.forEach(({ points, speedMult }) => {
        points.rotation.y += 0.00015 * speedMult;
        points.rotation.x += 0.00008 * speedMult;
        points.material.opacity = 0.75 + Math.sin(t * 0.6 * speedMult) * 0.25;
      });

      // 星云渐变缓慢旋转/呼吸
      if (nebula) nebula.forEach((s, i) => {
        s.material.rotation = t * 0.02 * (i % 2 === 0 ? 1 : -1);
        s.material.opacity = s.userData.opacity * (0.85 + 0.15 * Math.sin(t * s.userData.speed + s.userData.phase));
      });

      // 媒体节点 billboard + 浮动 + hover 缩放
      for (const c of nodes) {
        // 抵消父级（galaxyGroup）自转，使照片始终正面朝向相机
        c.parent.getWorldQuaternion(_invQ).invert();
        c.quaternion.copy(_invQ).multiply(camera.quaternion);
        c.position.y = c.userData.baseY + Math.sin(t * 0.28 + c.userData.phase) * 0.55;
        const target = c.userData.hovered ? 1.18 : 1.0;
        const s = c.scale.x + (target - c.scale.x) * 0.12;
        c.scale.setScalar(s);
        c.userData.glow.material.opacity = c.userData.hovered ? 0.45 : 0.0;
      }

      // 流星
      if (metro) {
        const { dirs, verts, lines } = metro;
        for (let i = 0; i < dirs.length; i++) {
          const m = dirs[i];
          m.p.addScaledVector(m.d, m.speed * 0.016);
          if (m.p.y < -60 || m.p.x < -220) { m.p.set((Math.random() - 0.5) * 340, 90 + Math.random() * 80, (Math.random() - 0.5) * 240 - 40); }
          const tail = m.p.clone().addScaledVector(m.d, -m.len);
          verts[i * 6] = m.p.x; verts[i * 6 + 1] = m.p.y; verts[i * 6 + 2] = m.p.z;
          verts[i * 6 + 3] = tail.x; verts[i * 6 + 4] = tail.y; verts[i * 6 + 5] = tail.z;
        }
        lines.geometry.attributes.position.needsUpdate = true;
      }

      // 进场相机缓动（自实现，不依赖外部库）
      if (!entryDone && !reducedMotion) {
        const k = Math.min(1, (performance.now() - entryStart) / 3400);
        const e = easeInOut(k);
        camera.position.lerpVectors(camFrom, camTo, e);
        camera.lookAt(controls.target);
        sceneRoot.scale.setScalar(0.06 + (1 - 0.06) * e);
        if (k >= 1) finishEntry();
      }

      controls.update();
      renderer.render(scene, camera);

      // 首帧渲染完成后立即收起加载遮罩，让进场飞入动画完整可见
      if (!firstFrameRendered) {
        firstFrameRendered = true;
        if (onReady) onReady();
      }
    }

    // 先异步编译着色器，编译完成后再启动渲染循环。
    // compileAsync 走 KHR_parallel_shader_compile，在 GPU 后台编译、不阻塞主线程，
    // 因此首帧 render 不再因编译 GLSL 而卡顿；隧道 loader 动画在此期间可继续流畅流动。
    // 注：几何体构建 / 贴图生成仍是同步阻塞，故 memory-tree.js 的 850ms 预热兜底保留。
    let _renderStarted = false;
    const startRender = () => { if (_renderStarted) return; _renderStarted = true; animate(); };
    if (renderer.compileAsync) {
      // 超时兜底：极少数情况下编译可能迟迟不 resolve，避免场景永远不出现
      const _compileTimeout = new Promise((res) => setTimeout(res, 2000));
      Promise.race([renderer.compileAsync(scene, camera), _compileTimeout]).then(startRender).catch(startRender);
    } else {
      try { renderer.compile(scene, camera); } catch (e) {}
      startRender();
    }

    function onResize() {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    }
    window.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { running = false; cancelAnimationFrame(rafId); }
      else if (!running) { running = true; clock.getDelta(); animate(); }
    });

    const fmtTime = (ts) => {
      const d = new Date(ts);
      return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
    };

    const api = {
      fallback: false,
      initAudio: ensureAudio,
      setMusic: (on) => { ensureAudio(); on ? startBgm() : stopBgm(); },
      isMusicOn: () => musicOn,
      setSfx: (on) => { sfxOn = on; },
      isSfxOn: () => sfxOn,
      playSfx,
      focusNode: (id) => {
        const c = nodes.find(n => n.userData.item.id === id);
        if (c) { controls.target.copy(c.position); camera.position.copy(c.position).add(new THREE.Vector3(0, 2, 22)); }
      },
      addPostNode(post) {
        const isImage = !!(post.imageUrl && /^https?:\/\/|\/|images\//.test(post.imageUrl));
        const item = {
          ...post,
          title: (post.content && post.content.length > 18) ? post.content.slice(0, 18) + '…' : (post.content || '记忆'),
          location: post.authorName || '匿名同学',
          year: fmtTime(post.created_at),
          url: isImage ? post.imageUrl : '',
          emoji: '✦', isPost: true
        };
        if (isImage) {
          // 图片帖：先用文字星占位，图片异步加载完成后替换为「照片 + 底部发布人字幕」纹理（失败则保留文字星）
          const tex = createTextCardTexture(post);
          makeMediaNode(item, nodes.length, tex);
          const lastNode = nodes[nodes.length - 1];
          const caption = post.authorName || '匿名同学';
          try {
            loader.load(post.imageUrl, (t) => {
              t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
              let mapTex = t;
              try {
                const img = t.image;
                if (img && img.width) {
                  const cv = document.createElement('canvas');
                  cv.width = img.width; cv.height = img.height;
                  const ctx = cv.getContext('2d');
                  ctx.drawImage(img, 0, 0, cv.width, cv.height);
                  const capH = Math.max(28, Math.round(cv.height * 0.13));
                  const g = ctx.createLinearGradient(0, cv.height - capH, 0, cv.height);
                  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.6)');
                  ctx.fillStyle = g; ctx.fillRect(0, cv.height - capH, cv.width, capH);
                  ctx.font = Math.round(capH * 0.5) + 'px "Noto Sans SC","Microsoft YaHei",sans-serif';
                  ctx.fillStyle = 'rgba(255,255,255,0.94)'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                  ctx.fillText('— ' + caption, cv.width / 2, cv.height - capH / 2);
                  const ct = new THREE.CanvasTexture(cv);
                  ct.colorSpace = THREE.SRGBColorSpace; ct.anisotropy = 4;
                  mapTex = ct;
                }
              } catch (e) { /* 合成失败，回退原图 */ }
              if (lastNode && lastNode.userData && lastNode.userData.mesh) {
                const mat = lastNode.userData.mesh.material;
                if (mat.map && mat.map.dispose) { try { mat.map.dispose(); } catch (e) {} }
                mat.map = mapTex;
                mat.needsUpdate = true;
              }
            }, undefined, () => { /* 加载失败，保留文字星占位 */ });
          } catch (e) { /* 忽略加载异常 */ }
        } else {
          const tex = createTextCardTexture(post);
          makeMediaNode(item, nodes.length, tex);
        }
      },
      // 热移除某个帖子节点（管理员删除时调用，无需刷新页面）
      removeNode(id) {
        const i = nodes.findIndex(n => n.userData && n.userData.item && n.userData.item.id === id);
        if (i < 0) return;
        const c = nodes[i];
        try {
          if (c.userData && c.userData.mesh) {
            const m = c.userData.mesh;
            if (m.geometry) m.geometry.dispose();
            if (m.material) { if (m.material.map && m.material.map.dispose) { try { m.material.map.dispose(); } catch (e) {} } m.material.dispose(); }
          }
          if (c.userData && c.userData.glow) {
            const gl = c.userData.glow;
            if (gl.geometry) gl.geometry.dispose();
            if (gl.material) gl.material.dispose();
          }
        } catch (e) {}
        try { mediaGroup.remove(c); } catch (e) {}
        if (c.userData && c.userData.mesh) {
          const pi = pickables.indexOf(c.userData.mesh);
          if (pi >= 0) pickables.splice(pi, 1);
        }
        nodes.splice(i, 1);
      },
      dispose() {
        running = false; cancelAnimationFrame(rafId);
        window.removeEventListener('resize', onResize);
        dom.removeEventListener('pointermove', onMove);
        dom.removeEventListener('click', onClick);
        renderer.dispose();
      }
    };
    return api;
  }
};
