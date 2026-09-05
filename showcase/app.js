// app.js - 夜之记忆树 · Three.js 世界引擎
// 参考工艺：Active Theory v6（镜头呼吸 / 10% 强度后期 / GPU 分档 / 配置外置）
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const CFG = window.WORLD || {};
const STOPS = CFG.stops || [];
const REDUCE = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ================= GPU 分档 ================= */
function gpuTier() {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    if (!gl) return 0;
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const name = dbg ? (gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || '') : '';
    const s = String(name).toLowerCase();
    const cores = navigator.hardwareConcurrency || 4;
    if (/rtx|rx \d{4}|geforce (gtx ?1[06]|rtx)|apple m[1-9]|radeon pro|titan|quadro/.test(s)) return 2;
    if (/intel|uhd|iris|hd graphics|mali|adreno|sgx|swiftshader|llvmpipe/.test(s)) {
      if (/iris (xe|plus)/.test(s) && cores >= 8) return 1;
      return 0;
    }
    if (/nvidia|amd|radeon|geforce/.test(s)) return 2;
    return cores >= 8 ? 1 : 0;
  } catch (e) { return 0; }
}
const TIER = gpuTier();
const isPhone = Math.min(innerWidth, innerHeight) < 640;
const COUNTS = CFG.counts || { hi: 2400, mid: 900, low: 380 };
const PARTICLES = TIER === 2 ? COUNTS.hi : (TIER === 1 ? COUNTS.mid : COUNTS.low);
const DPR_CAP = TIER === 2 ? 1.75 : (TIER === 1 ? 1.35 : 1.0);
const USE_TRANSMISSION = TIER >= 1 && !isPhone;

/* ================= 世界常量 ================= */
const BG = CFG.bg ?? 0x05070f;
const FOG = CFG.fogDensity ?? 0.03;
const TOP = CFG.trunkTop ?? 9.2;
const BOT = CFG.trunkBottom ?? -6.4;
const CAM_R = CFG.camRadius ?? 7.6;
const TURNS = CFG.swirlTurns ?? 1.5;
const WOBBLE = CFG.wobble ?? 0.055;
const MOUSE_LERP = CFG.mouseLerp ?? 0.06;

/* ================= 基础渲染 ================= */
let renderer, scene, camera, composer, bloomPass, rgbPass, fxPass;
let canvas = document.getElementById('gl');
const worldEl = document.getElementById('world');
let built = false;
let ready = false;
let progress = 0;          // 0..1 滚动进度（平滑后）
let targetProgress = 0;    // 0..1 滚动目标
let mouseX = 0, mouseY = 0, smx = 0, smy = 0;
const clock = new THREE.Clock();

const RgbShiftShader = {
  uniforms: {
    tDiffuse: { value: null },
    amount: { value: CFG.rgbShift ?? 0.0018 },
    angle: { value: 0.5 }
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float amount; uniform float angle; varying vec2 vUv;
    void main(){
      vec2 dir = vec2(cos(angle), sin(angle));
      vec4 c1 = texture2D(tDiffuse, vUv + dir * amount);
      vec4 c2 = texture2D(tDiffuse, vUv - dir * amount);
      vec4 c0 = texture2D(tDiffuse, vUv);
      gl_FragColor = vec4(c0.r * 0.6 + c1.r * 0.4, c0.g, c0.b * 0.6 + c2.b * 0.4, c0.a);
    }`
};
const GrainVignetteShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uGrain: { value: CFG.grain ?? 0.055 },
    uVig: { value: CFG.vignette ?? 0.32 }
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uTime; uniform float uGrain; uniform float uVig; varying vec2 vUv;
    float rnd(vec2 co){ return fract(sin(dot(co.xy, vec2(12.9898,78.233))) * 43758.5453); }
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      float g = rnd(vUv * vec2(1920.0, 1080.0) + fract(uTime) * 37.0) - 0.5;
      c.rgb += g * uGrain;
      float d = distance(vUv, vec2(0.5, 0.47));
      c.rgb *= 1.0 - smoothstep(0.42, 0.85, d) * uVig;
      gl_FragColor = c;
    }`
};

/* ================= 油膜虹彩钻石材质（枝干/树冠/顶钻共用） ================= */
function diamondMat() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uCamPos: { value: new THREE.Vector3() },
      uLight: { value: new THREE.Vector3(6, TOP + 6, 4) },
      uBase: { value: new THREE.Color(0x0a0c1a) },
      uHueShift: { value: 0.0 }
    },
    vertexShader: `
      flat varying vec3 vNormalW;
      varying vec3 vPosW;
      varying vec3 vPosL;
      void main(){
        vPosL = position;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vPosW = wp.xyz;
        vNormalW = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: `
      flat varying vec3 vNormalW;
      varying vec3 vPosW;
      varying vec3 vPosL;
      uniform vec3 uLight; uniform vec3 uCamPos; uniform vec3 uBase;
      uniform float uTime; uniform float uHueShift;

      vec3 hsv2rgb(vec3 c){
        vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
        vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
        return c.z * mix(vec3(1.0), clamp(p - K.xxx, 0.0, 1.0), c.y);
      }
      void main(){
        vec3 n = normalize(vNormalW);
        vec3 v = normalize(uCamPos - vPosW);
        float ndv = clamp(dot(n, v), 0.0, 1.0);
        vec3 L = normalize(uLight - vPosW);
        float ndl = clamp(dot(n, L), 0.0, 1.0);
        vec3 H = normalize(L + v);
        float ndh = clamp(dot(n, H), 0.0, 1.0);

        // 油膜色相：视角-法线连续驱动
        float film = ndv * 2.4 + vPosW.y * 0.045 + uTime * 0.02;
        float hue = fract(film * 0.5 + uHueShift + vPosW.y * 0.012);
        float sat = mix(0.15, 0.9, pow(ndv, 0.6));
        vec3 filmCol = hsv2rgb(vec3(hue, sat, 1.0));

        vec3 col = uBase * (0.55 + 0.45 * ndl);
        float fres = pow(1.0 - ndv, 1.6);
        col += filmCol * fres * 0.85;
        float spec = pow(ndh, 90.0);
        col += vec3(1.0, 0.98, 1.0) * spec * 2.2;
        float glow = pow(ndh, 18.0);
        col += filmCol * glow * 0.35;
        float edgeLine = smoothstep(0.30, 0.0, ndv) * smoothstep(0.0, 0.06, ndv);
        col += filmCol * edgeLine * 0.9;
        gl_FragColor = vec4(col, 1.0);
      }`
  });
}

function initRenderer() {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: TIER >= 1, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, DPR_CAP));
  renderer.setSize(innerWidth, innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  if (THREE.SRGBColorSpace) renderer.outputColorSpace = THREE.SRGBColorSpace;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(BG);
  scene.fog = new THREE.FogExp2(BG, FOG);

  // 微弱深紫环境底光晕（大球壳）
  const skyGeo = new THREE.SphereGeometry(120, 24, 24);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { uTop: { value: new THREE.Color(0x0a0d20) }, uBot: { value: new THREE.Color(0x141038) } },
    vertexShader: `varying vec3 vP; void main(){ vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `
      varying vec3 vP; uniform vec3 uTop; uniform vec3 uBot;
      void main(){
        float h = clamp(vP.y/120.0*0.5+0.5, 0.0, 1.0);
        vec3 c = mix(uBot, uTop, smoothstep(0.35, 0.75, h));
        gl_FragColor = vec4(c, 1.0);
      }`
  });
  scene.add(new THREE.Mesh(skyGeo, skyMat));

  camera = new THREE.PerspectiveCamera(CFG.fov ?? 42, innerWidth / innerHeight, 0.1, 200);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = env;

  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  bloomPass = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), CFG.bloomStrength ?? 0.42, CFG.bloomRadius ?? 0.7, CFG.bloomThreshold ?? 0.82);
  composer.addPass(bloomPass);
  if (TIER >= 1 && !REDUCE) {
    rgbPass = new ShaderPass(RgbShiftShader);
    composer.addPass(rgbPass);
  }
  fxPass = new ShaderPass(GrainVignetteShader);
  composer.addPass(fxPass);
}

/* ================= 材质库 ================= */
function iridescentMat(opts = {}) {
  if (USE_TRANSMISSION) {
    return new THREE.MeshPhysicalMaterial(Object.assign({
      color: new THREE.Color(0x39406b),
      metalness: 1.0, roughness: 0.16,
      iridescence: 1.0, iridescenceIOR: 1.32,
      iridescenceThicknessRange: [100, 480],
      clearcoat: 1.0, clearcoatRoughness: 0.18,
      envMapIntensity: 2.4
    }, opts));
  }
  // 低档：fresnel 假玻璃
  return new THREE.MeshStandardMaterial(Object.assign({
    color: new THREE.Color(0x2c3762),
    metalness: 0.85, roughness: 0.22, envMapIntensity: 1.5
  }, opts));
}

/* ================= 粗壮沟壑树干（老树质感） ================= */
function barkMat() {
  // 深色树皮：油膜虹彩弱化 + 沟壑明暗（AO 感）+ 湿润高光
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uCamPos: { value: new THREE.Vector3() },
      uLight: { value: new THREE.Vector3(6, 16, 4) }
    },
    vertexShader: `
      varying vec3 vNormalW; varying vec3 vPosW; varying vec2 vUvL;
      uniform float uTime;
      // 沟壑：顶点沿法线按角度噪声位移
      float hash1(float n){ return fract(sin(n)*43758.5453); }
      float noise1(float x){
        float i=floor(x), f=fract(x);
        float u=f*f*(3.0-2.0*f);
        return mix(hash1(i), hash1(i+1.0), u);
      }
      void main(){
        vUvL = uv;
        vec3 p = position;
        // 纵向沟壑：按圆周角度 + 高度噪声，向内凹 0~0.22
        float ang = atan(p.z, p.x);
        float groove = noise1(ang*4.7 + p.y*0.8) * 0.7 + noise1(ang*9.3 - p.y*1.7) * 0.3;
        float depth = smoothstep(0.35, 0.75, groove);
        p -= normal * depth * 0.22;
        // 低频弯曲呼吸
        p += normal * sin(uTime*0.4 + p.y*0.5) * 0.012;
        vec4 wp = modelMatrix * vec4(p, 1.0);
        vPosW = wp.xyz;
        vNormalW = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: `
      varying vec3 vNormalW; varying vec3 vPosW; varying vec2 vUvL;
      uniform vec3 uCamPos; uniform vec3 uLight; uniform float uTime;
      float hash3(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,45.164)))*43758.5453); }
      float noise(vec3 p){
        vec3 i=floor(p), f=fract(p);
        f=f*f*(3.0-2.0*f);
        return mix(mix(mix(hash3(i),hash3(i+vec3(1,0,0)),f.x),
                       mix(hash3(i+vec3(0,1,0)),hash3(i+vec3(1,1,0)),f.x),f.y),
                   mix(mix(hash3(i+vec3(0,0,1)),hash3(i+vec3(1,0,1)),f.x),
                       mix(hash3(i+vec3(0,1,1)),hash3(i+vec3(1,1,1)),f.x),f.y),f.z);
      }
      vec3 hsv2rgb(vec3 c){
        vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
        vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
        return c.z * mix(vec3(1.0), clamp(p - K.xxx, 0.0, 1.0), c.y);
      }
      void main(){
        vec3 n = normalize(vNormalW);
        vec3 v = normalize(uCamPos - vPosW);
        float ndv = clamp(dot(n,v), 0.0, 1.0);
        vec3 L = normalize(uLight - vPosW);
        float ndl = clamp(dot(n,L), 0.0, 1.0);
        vec3 H = normalize(L+v);
        float ndh = clamp(dot(n,H),0.0,1.0);

        float bark = noise(vPosW*2.1) * 0.6 + noise(vPosW*6.5) * 0.4;
        float grooveAO = 0.45 + 0.55 * smoothstep(0.0, 0.5, bark);

        vec3 base = mix(vec3(0.045,0.04,0.085), vec3(0.12,0.10,0.18), bark);
        // 微弱油膜苔痕
        float filmHue = fract(ndv*1.6 + vPosW.y*0.03 + uTime*0.01);
        vec3 film = hsv2rgb(vec3(filmHue, 0.5, 1.0));
        float fres = pow(1.0-ndv, 2.2);

        vec3 col = base * (0.35 + 0.65*ndl) * grooveAO;
        col += film * fres * 0.22;
        // 湿润高光
        float spec = pow(ndh, 42.0);
        col += vec3(0.85,0.9,1.0) * spec * 0.55;
        // 沟壑深处塞一点发光苔藓（克制）
        float moss = smoothstep(0.68, 0.92, noise(vPosW*3.3+vec3(0.0,uTime*0.05,0.0)));
        col += vec3(0.16,0.13,0.34) * moss * (1.0-ndl) * 0.4;
        gl_FragColor = vec4(col, 1.0);
      }`
  });
}

/* ================= 树枝 + 玻璃叶卡锚点 ================= */
const leafCards = [];
const drops = [];
let vertebrae = [];
function trunkAnchor(y) {
  const bend = (yy) => Math.sin(yy * 0.3) * 0.55 + Math.sin(yy * 0.11 + 1.7) * 0.35;
  return new THREE.Vector3(bend(y), y, 0);
}
function buildTrunk() {
  const g = new THREE.Group();
  const mat = barkMat();
  g.userData.mat = mat;

  const R = CFG.trunkRadius || 1.05;
  const yTop = CFG.trunkTop ?? 10.5, yBot = CFG.trunkBottom ?? -7.5;
  const bend = (y) => Math.sin(y * 0.3) * 0.55 + Math.sin(y * 0.11 + 1.7) * 0.35;

  const geo = new THREE.CylinderGeometry(R * 0.62, R, yTop - yBot + 3.4, TIER >= 1 ? 96 : 44, TIER >= 1 ? 56 : 28, true);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const y = v.y;
    const ang = Math.atan2(v.z, v.x);
    const g1 = Math.sin(ang * 5.0 + Math.sin(y * 0.8) * 1.3) * 0.5 + 0.5;
    const g2 = Math.sin(ang * 11.0 - y * 1.9) * 0.5 + 0.5;
    const groove = g1 * 0.65 + g2 * 0.35;
    let r = 1.0 - groove * 0.20;
    r += Math.sin(ang * 3.0 + y * 0.4) * 0.05;
    const t = THREE.MathUtils.clamp((y - yBot) / (yTop - yBot), 0, 1);
    const taper = 0.5 + 0.5 * Math.sin(t * Math.PI * 0.6) + (1 - t) * (1 - t) * 0.55;
    v.x *= r * taper; v.z *= r * taper;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  const trunk = new THREE.Mesh(geo, mat);
  trunk.position.set(bend(0), 0, 0);
  trunk.userData.bx = 1; trunk.userData.bz = 1;
  g.add(trunk);

  // 板根
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.4;
    const fin = new THREE.Mesh(new THREE.CylinderGeometry(0.02, R * 0.4, 2.8, 4, 1, true), mat);
    fin.position.set(Math.cos(a) * R * 1.12, yBot - 0.5, Math.sin(a) * R * 1.12);
    fin.rotation.z = Math.cos(a) * 0.5;
    fin.rotation.x = -Math.sin(a) * 0.5;
    fin.scale.set(1, 1, 0.26);
    fin.userData.bx = 1; fin.userData.bz = 1;
    g.add(fin);
  }
  return { group: g, curve: null };
}

function buildBranches() {
  const g = new THREE.Group();
  const branchMat = barkMat();
  g.userData.mat = branchMat;
  STOPS.forEach((s, i) => {
    const dir = new THREE.Vector3(Math.cos(s.angle), Math.sin(s.tilt) * 0.4, Math.sin(s.angle)).normalize();
    const anchor = trunkAnchor(s.y);
    const end = anchor.clone().addScaledVector(dir, s.len * 0.8);

    const cpts = [
      anchor.clone(),
      anchor.clone().addScaledVector(dir, s.len * 0.42).add(new THREE.Vector3(0, 0.35, 0)),
      end.clone().add(new THREE.Vector3(0, -0.25, 0))
    ];
    const bcurve = new THREE.CatmullRomCurve3(cpts);
    const branch = new THREE.Mesh(new THREE.TubeGeometry(bcurve, TIER >= 1 ? 40 : 22, 0.22 - i * 0.012, 8, false), branchMat);
    g.add(branch);

    // 玻璃叶卡
    const card = buildLeafCard(s, i);
    card.position.copy(end);
    // 面朝外（相机在站点时位于同角度外侧），文字不镜像
    card.lookAt(end.x + dir.x, end.y + dir.y, end.z + dir.z);
    card.userData.stop = s;
    card.userData.sway = Math.random() * Math.PI * 2;
    g.add(card);
    leafCards.push(card);

    // 枝头垂挂光种
    const drop = new THREE.Mesh(
      new THREE.SphereGeometry(0.055, 12, 12),
      new THREE.MeshBasicMaterial({ color: i % 2 ? 0x9d84ff : 0x6fe0ff })
    );
    drop.position.copy(end).add(new THREE.Vector3(0, -0.55, 0));
    drop.userData.seed = Math.random() * 10;
    drop.userData.baseY = drop.position.y;
    g.add(drop);
    drops.push(drop);
  });
  return g;
}

/* ================= 玻璃叶卡（程序化题板） ================= */
function cardTexture(s) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 340;
  const x = c.getContext('2d');
  const bg = x.createLinearGradient(0, 0, 512, 340);
  bg.addColorStop(0, '#0b0e20');
  bg.addColorStop(0.55, '#10142c');
  bg.addColorStop(1, '#0a0d1e');
  x.fillStyle = bg; x.fillRect(0, 0, 512, 340);
  // 云雾噪声
  for (let i = 0; i < 46; i++) {
    const gx = Math.random() * 512, gy = Math.random() * 340, r = 40 + Math.random() * 120;
    const glow = x.createRadialGradient(gx, gy, 0, gx, gy, r);
    const hue = [262, 195, 152, 318][i % 4];
    glow.addColorStop(0, `hsla(${hue},80%,66%,0.10)`);
    glow.addColorStop(1, 'hsla(0,0%,0%,0)');
    x.fillStyle = glow; x.fillRect(0, 0, 512, 340);
  }
  // 细网格
  x.strokeStyle = 'rgba(157,132,255,0.07)'; x.lineWidth = 1;
  for (let gx = 0; gx <= 512; gx += 64) { x.beginPath(); x.moveTo(gx, 0); x.lineTo(gx, 340); x.stroke(); }
  for (let gy = 0; gy <= 340; gy += 68) { x.beginPath(); x.moveTo(0, gy); x.lineTo(512, gy); x.stroke(); }
  // 题字
  x.fillStyle = 'rgba(238,240,255,0.96)';
  x.font = '800 92px "HarmonyOS Sans SC","PingFang SC","Microsoft YaHei",sans-serif';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(s.cn, 256, 150);
  x.fillStyle = 'rgba(157,132,255,0.9)';
  x.font = '600 22px "HarmonyOS Sans SC","PingFang SC",sans-serif';
  x.letterSpacing = '10px';
  x.fillText(s.en, 256, 226);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function buildLeafCard(s, i) {
  const card = new THREE.Group();
  const w = s.w || 3.6, h = s.h || 2.4;

  // 照片纹理：用回调确保加载后翻转到可见
  const photoMat0 = new THREE.MeshBasicMaterial({ color: 0x0a0d1e, toneMapped: true });
  const tex = new THREE.TextureLoader().load(s.img, (t) => {
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    photoMat0.map = t;
    photoMat0.color.set(0xffffff);
    photoMat0.needsUpdate = true;
  });

  // 深色玻璃框体（圆角矩形 + 照片窗口）
  const frameMat = new THREE.MeshPhysicalMaterial({
    color: 0x0d1024, metalness: 0.6, roughness: 0.32,
    clearcoat: 0.8, clearcoatRoughness: 0.3,
    envMapIntensity: 1.0
  });
  const frame = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, h + 0.3, 0.1), frameMat);
  card.add(frame);

  // 照片面（加载前深色兜底，回调后显示照片）
  const photo = new THREE.Mesh(new THREE.PlaneGeometry(w, h), photoMat0);
  photo.position.z = 0.056;
  card.add(photo);
  card.userData.texPlane = photo;

  // 霓虹描边
  const edge = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.PlaneGeometry(w + 0.3, h + 0.3)),
    new THREE.LineBasicMaterial({ color: 0x9d84ff, transparent: true, opacity: 0.75 })
  );
  edge.position.z = 0.06;
  card.add(edge);
  card.userData.edge = edge;

  // 底部辉光
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture('rgba(157,132,255,0.8)'), color: 0x9d84ff,
    transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false
  }));
  glow.scale.set(w * 1.3, h * 1.2, 1);
  glow.position.z = -0.3;
  card.add(glow);
  return card;
}

/* ================= glow 贴图 ================= */
function glowTexture(colorCss) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, colorCss);
  g.addColorStop(0.4, colorCss.replace(/[\d.]+\)$/, '0.22)'));
  g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

/* ================= 树冠叶晶 ================= */
function buildCanopy() {
  const g = new THREE.Group();
  // 三团叶簇球（中间大、两侧小），每团用 InstancedMesh 圆片铺
  const clumps = [
    { x: 0,    y: TOP + 1.2, r: 5.6, n: TIER >= 1 ? 420 : 180, flat: 0.34 },
    { x: -4.6, y: TOP + 0.2, r: 3.0, n: TIER >= 1 ? 200 : 90,  flat: 0.5 },
    { x: 4.7,  y: TOP + 0.4, r: 2.9, n: TIER >= 1 ? 190 : 86,  flat: 0.5 },
    { x: -2.4, y: TOP + 1.6, r: 2.6, n: TIER >= 1 ? 150 : 66,  flat: 0.6 },
    { x: 2.5,  y: TOP + 1.7, r: 2.5, n: TIER >= 1 ? 145 : 64,  flat: 0.6 }
  ];
  const leafGeo = new THREE.CircleGeometry(0.32, 5);
  const leafMat = new THREE.ShaderMaterial({
    side: THREE.DoubleSide, transparent: true, depthWrite: false,
    uniforms: { uTime: { value: 0 }, uCamPos: { value: new THREE.Vector3() } },
    vertexShader: `
      varying vec3 vN; varying vec3 vW; varying vec3 vL;
      void main(){
        vL = position;
        vec4 wp = modelMatrix * instanceMatrix * vec4(position,1.0);
        vW = wp.xyz;
        vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: `
      varying vec3 vN; varying vec3 vW; varying vec3 vL;
      uniform vec3 uCamPos; uniform float uTime;
      void main(){
        vec3 n = normalize(vN);
        vec3 v = normalize(uCamPos - vW);
        float ndv = clamp(dot(n,v),0.0,1.0);
        // 绿色系油膜：叶正面亮绿、背面深绿，边缘泛青紫
        float facing = abs(ndv);
        vec3 front = vec3(0.24, 0.62, 0.30);
        vec3 back  = vec3(0.05, 0.18, 0.12);
        vec3 col = mix(back, front, pow(facing, 0.8));
        // 微虹彩叶脉流光
        float flow = sin(vW.y*2.0 + vW.x*1.4 + uTime*0.5)*0.5+0.5;
        col += vec3(0.10,0.22,0.16) * flow;
        // 边缘透光（叶缘亮线）
        float edge = pow(1.0-facing, 2.2);
        col += vec3(0.35,0.55,0.45) * edge * 0.55;
        // 高光露珠感
        vec3 L = normalize(vec3(6.0, 18.0, 4.0) - vW);
        vec3 H = normalize(L+v);
        col += vec3(1.0) * pow(clamp(dot(n,H),0.0,1.0), 42.0) * 0.8;
        gl_FragColor = vec4(col, 0.94);
      }`
  });
  g.userData.mat = leafMat;

  clumps.forEach(cl => {
    const m = new THREE.InstancedMesh(leafGeo, leafMat, cl.n);
    const d = new THREE.Object3D();
    const flat = cl.flat || 0.72;
    for (let i = 0; i < cl.n; i++) {
      // 球面分布，按 flat 压扁 → 宽大的"草地"层
      const u = Math.random()*2-1, a = Math.random()*Math.PI*2;
      const rr = Math.cbrt(Math.random()) * cl.r;
      const sx = Math.sqrt(1-u*u);
      d.position.set(cl.x + Math.cos(a)*sx*rr, cl.y + u*rr*flat, Math.sin(a)*sx*rr);
      // 叶片大多朝上（草地感）
      d.rotation.set((Math.random()-0.5)*0.9, Math.random()*Math.PI, (Math.random()-0.5)*0.9);
      d.scale.setScalar(0.9 + Math.random()*1.6);
      d.updateMatrix();
      m.setMatrixAt(i, d.matrix);
    }
    g.add(m);
  });

  // 树冠内部点几盏绿光，让叶团有体积
  const cl1 = new THREE.PointLight(0x2e8b57, 22, 16, 1.8);
  cl1.position.set(0, TOP + 2.6, 0);
  const cl2 = new THREE.PointLight(0x7cfca0, 10, 12, 1.9);
  cl2.position.set(-4.6, TOP + 1.0, 1.5);
  g.add(cl1, cl2);
  return g;
}

/* ================= 树顶云层 ================= */
const cloudSprites = [];
function buildClouds() {
  const g = new THREE.Group();
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d');
  for (let i = 0; i < 26; i++) {
    const gx = 40 + Math.random() * 176, gy = 60 + Math.random() * 140;
    const r = 26 + Math.random() * 62;
    const grad = x.createRadialGradient(gx, gy, 0, gx, gy, r);
    grad.addColorStop(0, 'rgba(190,196,255,0.16)');
    grad.addColorStop(1, 'rgba(190,196,255,0)');
    x.fillStyle = grad;
    x.fillRect(0, 0, 256, 256);
  }
  const cloudTex = new THREE.CanvasTexture(c);

  const N = TIER >= 1 ? 26 : 12;
  for (let i = 0; i < N; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 5.5 + Math.random() * 6.5;
    const y = TOP + 1.8 + Math.random() * 3.2;
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({
      map: cloudTex, color: 0xbcc4ff,
      transparent: true, opacity: 0.26 + Math.random() * 0.22,
      depthWrite: false
    }));
    spr.position.set(Math.cos(a) * r, y, Math.sin(a) * r);
    const sc = 5 + Math.random() * 7;
    spr.scale.set(sc, sc * 0.55, 1);
    spr.userData = { seed: Math.random() * 20, base: spr.position.clone(), sc };
    g.add(spr);
    cloudSprites.push(spr);
  }
  return g;
}

/* ================= 记忆果实 ================= */
const fruits = [];
function buildFruits() {
  const g = new THREE.Group();
  const texA = glowTexture('rgba(255,180,120,0.85)');
  const texB = glowTexture('rgba(157,132,255,0.85)');
  const N = TIER >= 1 ? 90 : 40;
  for (let i = 0; i < N; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 0.6 + Math.random() * 2.6;
    const y = BOT + 1 + Math.random() * (TOP - BOT - 1.6);
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({
      map: i % 5 === 0 ? texA : texB,
      color: i % 5 === 0 ? 0xffc08a : 0x9d84ff,
      transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false
    }));
    spr.position.set(Math.cos(a) * r * 1.15, y, Math.sin(a) * r * 0.95);
    spr.scale.setScalar(0.3 + Math.random() * 0.55);
    spr.userData = { seed: Math.random() * 12, base: spr.position.y };
    g.add(spr);
    fruits.push(spr);
  }
  return g;
}

/* ================= 三组粒子 ================= */
const fireflies = [], fallers = [], risers = [];
function buildParticles() {
  const g = new THREE.Group();
  const soft = glowTexture('rgba(255,255,255,0.9)');
  const palette = [0x9dffce, 0xff9ad5, 0x9d84ff, 0x6fe0ff, 0xffffff];

  function cloud(count, place, sizeMin, sizeMax, speedFn, opacity) {
    for (let i = 0; i < count; i++) {
      const col = palette[(Math.random() * palette.length) | 0];
      const spr = new THREE.Sprite(new THREE.SpriteMaterial({
        map: soft, color: col, transparent: true,
        opacity: opacity * (0.5 + Math.random() * 0.5),
        blending: THREE.AdditiveBlending, depthWrite: false
      }));
      place(spr);
      spr.scale.setScalar(sizeMin + Math.random() * (sizeMax - sizeMin));
      spr.userData = { seed: Math.random() * 100, speed: speedFn(), base: spr.position.clone() };
      g.add(spr);
      returnArr(spr);
    }
  }
  function returnArr(s) {
    // 分组：按 y 与半径决定所属行为组
    const r = Math.hypot(s.position.x, s.position.z);
    if (r < 3.4 && s.position.y > 2.2) fireflies.push(s);
    else if (Math.random() < 0.62) fallers.push(s);
    else risers.push(s);
  }

  const total = PARTICLES;
  cloud(total, (spr) => {
    const a = Math.random() * Math.PI * 2;
    const r = Math.pow(Math.random(), 0.6) * 6.5;
    spr.position.set(Math.cos(a) * r, BOT + Math.random() * (TOP - BOT + 3), Math.sin(a) * r);
  }, 0.05, 0.22, () => 0.2 + Math.random() * 0.5, 0.85);
  return g;
}

/* ================= 地面与根光纹 ================= */
function buildGround() {
  const g = new THREE.Group();
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(30, 48),
    new THREE.MeshStandardMaterial({ color: 0x04060e, metalness: 0.6, roughness: 0.75, envMapIntensity: 0.22 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = BOT - 1.45;
  g.add(floor);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(2.6, 2.72, 90),
    new THREE.MeshBasicMaterial({ color: 0x7c5cfc, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = BOT - 1.43;
  g.add(ring);
  return g;
}

/* ================= 氛围光 ================= */
function buildLights() {
  const g = new THREE.Group();
  g.add(new THREE.AmbientLight(0x223055, 1.4));
  const moon = new THREE.DirectionalLight(0xbfd9ff, 1.5);
  moon.position.set(6, TOP + 6, 4);
  g.add(moon);
  const warm = new THREE.PointLight(0x7c5cfc, 30, 40, 1.8);
  warm.position.set(-5, BOT + 1.2, -3);
  g.add(warm);
  const cool = new THREE.PointLight(0x6fe0ff, 16, 34, 1.9);
  cool.position.set(5.5, TOP - 1.5, -5);
  g.add(cool);
  const rimA = new THREE.PointLight(0xff9ad5, 26, 26, 1.8);
  rimA.position.set(-3.2, TOP * 0.55, 3.4);
  g.add(rimA);
  const rimB = new THREE.PointLight(0x9dffce, 18, 26, 1.8);
  rimB.position.set(3.4, BOT + 3.4, 3.0);
  g.add(rimB);

  const glowL = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture('rgba(124,92,252,0.9)'), color: 0x7c5cfc,
    transparent: true, opacity: 0.33, blending: THREE.AdditiveBlending, depthWrite: false
  }));
  glowL.position.set(-7, BOT + 0.6, -4);
  glowL.scale.set(13, 9, 1);
  g.add(glowL);
  const glowR = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture('rgba(111,224,255,0.75)'), color: 0x6fe0ff,
    transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false
  }));
  glowR.position.set(8, TOP - 2, -6);
  glowR.scale.set(10, 8, 1);
  g.add(glowR);
  return g;
}

/* ================= 世界组装 ================= */
let trunkGroup, canopyGroup, cloudGroup, fruitGroup, particleGroup, groundGroup, lightGroup, branchGroup;

function buildWorld() {
  const t = buildTrunk();
  trunkGroup = t.group;
  branchGroup = buildBranches();
  canopyGroup = buildCanopy();
  cloudGroup = buildClouds();
  fruitGroup = buildFruits();
  particleGroup = buildParticles();
  groundGroup = buildGround();
  lightGroup = buildLights();
  scene.add(trunkGroup, branchGroup, canopyGroup, cloudGroup, fruitGroup, particleGroup, groundGroup, lightGroup);
}

/* ================= 相机 rig ================= */
/* 锚点插值（非均匀参数位）：镜头在每个站点自然减速停留 */
function knotLerp(p, stops, vals) {
  const n = vals.length;
  const x = THREE.MathUtils.clamp(p, 0, 1);
  if (x <= stops[0]) return vals[0];
  if (x >= stops[n - 1]) return vals[n - 1];
  let i = 0;
  while (i < n - 2 && x > stops[i + 1]) i++;
  let t = (x - stops[i]) / (stops[i + 1] - stops[i]);
  t = t * t * (3 - 2 * t);
  return THREE.MathUtils.lerp(vals[i], vals[i + 1], t);
}

function camPose(p, tSec) {
  const n = STOPS.length;
  // 开场：在树顶上方，看着"校园频道"题字与树冠
  const ps = [0];
  const ys = [TOP + 6.0];
  const th = [STOPS[0].angle - 0.55];
  const rr = [14.0];
  STOPS.forEach((s, i) => {
    ps.push((i + 0.5) / n);
    ys.push(s.y + 0.6);
    th.push(s.angle);
    rr.push(10.6);
  });
  ps.push(1);
  ys.push(BOT + 2.6); th.push(STOPS[n - 1].angle + 0.55); rr.push(20.5);

  const y = knotLerp(p, ps, ys);
  const theta = knotLerp(p, ps, th);
  const radius = knotLerp(p, ps, rr);
  const wob = REDUCE ? 0 : 1;

  const x = Math.cos(theta) * radius;
  const z = Math.sin(theta) * radius;

  // 视线：开场看树冠题字区（y≈TOP），站点看卡片，终章仰望
  const startK = 1 - THREE.MathUtils.smoothstep(p, 0.0, 0.12);
  const endK = THREE.MathUtils.smoothstep(p, 0.88, 1.0);
  let lookR = radius * 0.24;
  for (let i = 0; i < n; i++) {
    const c = (i + 0.5) / n;
    const d = Math.abs(p - c);
    const well = 1 - THREE.MathUtils.smoothstep(d, 0.0, 0.085);
    lookR += well * (radius * 0.58 - radius * 0.24);
  }
  let lookY = THREE.MathUtils.lerp(y - 0.4, TOP * 0.14, endK);
  lookY = THREE.MathUtils.lerp(lookY, TOP + 0.9, startK);
  const lookRfin = THREE.MathUtils.lerp(lookR, radius * 0.12, startK);

  const look = new THREE.Vector3(
    Math.cos(theta) * lookRfin,
    lookY,
    Math.sin(theta) * lookRfin
  );
  return { x, y: y + Math.sin(tSec * 0.5) * WOBBLE * wob, z, look };
}

function applyCamera(tSec) {
  const pose = camPose(progress, tSec);
  camera.position.set(pose.x + smx * 0.55, pose.y + smy * 0.35, pose.z);
  camera.lookAt(pose.look.x + smx * 0.3, pose.look.y + smy * 0.2, pose.look.z);
}

/* ================= HUD 同步 ================= */
const capEl = document.getElementById('caption');
const capK = document.getElementById('capKicker');
const capT = document.getElementById('capTitle');
const capD = document.getElementById('capDesc');
let activeStop = -2;
let finaleShown = false;

function updateHUD() {
  const n = STOPS.length;
  let idx = -1;
  for (let i = 0; i < n; i++) {
    const c = (i + 0.5) / n;
    if (Math.abs(progress - c) < 0.5 / n) { idx = i; break; }
  }
  if (idx >= 0 && idx !== activeStop) {
    activeStop = idx;
    const s = STOPS[idx];
    capK.textContent = s.en;
    capT.textContent = s.cn;
    capD.textContent = s.desc;
    capEl.classList.add('show');
  } else if (idx < 0 && activeStop >= 0) {
    activeStop = -1;
    capEl.classList.remove('show');
  }
  if (progress > 0.9 && !finaleShown) {
    finaleShown = true;
    capK.textContent = CFG.finale.en;
    capT.textContent = CFG.finale.cn;
    capD.textContent = CFG.finale.desc;
    capEl.classList.add('show');
  } else if (progress <= 0.88 && finaleShown) {
    finaleShown = false;
    if (activeStop >= 0) {
      const s = STOPS[activeStop];
      capK.textContent = s.en; capT.textContent = s.cn; capD.textContent = s.desc;
    } else capEl.classList.remove('show');
  }
}

/* ================= 详情面板 ================= */
const panel = document.getElementById('panel');
const panelK = document.getElementById('panelKicker');
const panelT = document.getElementById('panelTitle');
const panelD = document.getElementById('panelDesc');
const panelF = document.getElementById('panelFeats');
function openPanel(s) {
  panelK.textContent = s.en;
  panelT.textContent = s.cn;
  panelD.textContent = s.desc;
  panelF.innerHTML = (s.feats || []).map(f => `<li>${f}</li>`).join('');
  panel.classList.add('open');
  panel.setAttribute('aria-hidden', 'false');
}
function closePanel() {
  panel.classList.remove('open');
  panel.setAttribute('aria-hidden', 'true');
}
document.getElementById('panelClose').addEventListener('click', closePanel);
addEventListener('keydown', (e) => { if (e.key === 'Escape') closePanel(); });

/* ================= 交互：鼠标 / 射线 ================= */
const raycaster = new THREE.Raycaster();
const pointerV = new THREE.Vector2();
let hovered = null;
addEventListener('pointermove', (e) => {
  mouseX = (e.clientX / innerWidth) * 2 - 1;
  mouseY = -((e.clientY / innerHeight) * 2 - 1);
  pointerV.set(mouseX, mouseY);
});
addEventListener('click', () => {
  if (hovered) openPanel(hovered.userData.stop);
});

function updateRay() {
  if (!built) return;
  raycaster.setFromCamera(pointerV, camera);
  const faces = [];
  leafCards.forEach(c => faces.push(c.children[0]));
  const hits = raycaster.intersectObjects(faces, false);
  const hit = hits.length ? hits[0].object.parent : null;
  if (hit !== hovered) {
    if (hovered) {
      hovered.userData.edge.material.color.set(0x9d84ff);
      gsap.to(hovered.userData.edge.material, { opacity: 0.75, duration: 0.4 });
      hovered.scale.set(1, 1, 1);
    }
    hovered = hit;
    if (hovered) {
      hovered.userData.edge.material.color.set(0xbfe9ff);
      gsap.to(hovered.userData.edge.material, { opacity: 1, duration: 0.3 });
      gsap.to(hovered.scale, { x: 1.05, y: 1.05, z: 1.05, duration: 0.45, ease: 'power2.out' });
      document.body.style.cursor = 'pointer';
    } else document.body.style.cursor = '';
  }
}

/* ================= 询问面板：飞到板块 ================= */
function flyToStop(i) {
  const n = STOPS.length;
  const c = (i + 0.5) / n;
  const y = window.scrollY;
  const worldTop = worldEl.getBoundingClientRect().top + y;
  const dist = (CFG.scrollVH / 100) * innerHeight;
  window.scrollTo({ top: worldTop + c * dist, behavior: 'smooth' });
  closePanel();
}
document.querySelectorAll('[data-fly]').forEach(btn => {
  btn.addEventListener('click', () => flyToStop(+btn.dataset.fly));
});

/* 问答匹配 */
const inqForm = document.getElementById('inqForm');
const inqInput = document.getElementById('inqInput');
const inqHint = document.getElementById('inqHint');
inqForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const q = inqInput.value.trim().toLowerCase();
  if (!q) { inqHint.textContent = '输入关键词，比如 树洞 / 作业 / 球赛'; return; }
  let best = -1, bestScore = 0;
  STOPS.forEach((s, i) => {
    let score = 0;
    (s.keywords || []).forEach(k => { if (q.includes(k.toLowerCase()) || k.toLowerCase().includes(q)) score += 2; });
    if (s.cn.toLowerCase().includes(q) || s.en.toLowerCase().includes(q)) score += 2;
    (s.feats || []).forEach(f => { if (f.toLowerCase().includes(q)) score += 1; });
    if (score > bestScore) { bestScore = score; best = i; }
  });
  if (best >= 0) {
    inqHint.textContent = `带你去「${STOPS[best].cn}」`;
    flyToStop(best);
  } else {
    inqHint.textContent = '这个问题去论坛问同学更快，点击右上角进入。';
  }
});

/* ================= 渲染循环 ================= */
let rafAlive = false;
function tick() {
  try { requestAnimationFrame(tick); } catch(e) {}
  window.__TICKS = (window.__TICKS||0)+1;
  if (!built) return;
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  // 滚动平滑（替代 scroll 监听：ScrollTrigger 直接写 targetProgress）
  progress += (targetProgress - progress) * 0.08;
  smx += (mouseX - smx) * MOUSE_LERP;
  smy += (mouseY - smy) * MOUSE_LERP;

  trunkGroup.rotation.y = t * 0.02;
  vertebrae.forEach((v) => {
    if (v.mesh.userData.bx === undefined) return;
    const k = 1 + Math.sin(t * 0.8 + v.seed) * 0.035;
    v.mesh.scale.x = v.mesh.userData.bx * k;
    v.mesh.scale.z = v.mesh.userData.bz * k;
  });
  if (trunkGroup.userData.mat) {
    trunkGroup.userData.mat.uniforms.uTime.value = t;
    trunkGroup.userData.mat.uniforms.uCamPos.value.copy(camera.position);
  }
  if (branchGroup && branchGroup.userData.mat && branchGroup.userData.mat.uniforms && branchGroup.userData.mat.uniforms.uTime) {
    branchGroup.userData.mat.uniforms.uTime.value = t;
    branchGroup.userData.mat.uniforms.uCamPos.value.copy(camera.position);
  }
  if (canopyGroup && canopyGroup.userData.mat) {
    canopyGroup.userData.mat.uniforms.uTime.value = t;
    canopyGroup.userData.mat.uniforms.uCamPos.value.copy(camera.position);
  }
  leafCards.forEach((card) => {
    if (card.userData.texPlane) {
      card.userData.texPlane.rotation.z = Math.sin(t * 0.6 + card.userData.sway) * 0.02;
    }
  });
  // 玻璃叶卡：完整 billboard 朝相机（正面永对镜头，不镜像）
  leafCards.forEach((card) => {
    card.lookAt(camera.position);
  });
  cloudSprites.forEach(cs => {
    const u = cs.userData;
    cs.position.x = u.base.x + Math.sin(t * 0.05 + u.seed) * 1.4;
    cs.position.z = u.base.z + Math.cos(t * 0.04 + u.seed * 1.3) * 1.4;
  });
  fruits.forEach(f => {
    f.position.y = f.userData.base + Math.sin(t * 0.7 + f.userData.seed) * 0.22;
    f.material.opacity = 0.5 + 0.3 * Math.sin(t * 1.1 + f.userData.seed * 2);
  });
  fireflies.forEach(s => {
    const u = s.userData;
    s.position.x = u.base.x + Math.sin(t * u.speed + u.seed) * 0.55;
    s.position.y = u.base.y + Math.sin(t * u.speed * 0.8 + u.seed * 1.7) * 0.4;
    s.position.z = u.base.z + Math.cos(t * u.speed * 0.9 + u.seed) * 0.55;
    s.material.opacity = 0.35 + 0.5 * (0.5 + 0.5 * Math.sin(t * 2 + u.seed * 3));
  });
  fallers.forEach(s => {
    const u = s.userData;
    s.position.y -= dt * u.speed * 0.5;
    s.position.x = u.base.x + Math.sin(t * 0.4 + u.seed) * 0.35;
    if (s.position.y < BOT - 1.2) s.position.y = TOP + 2;
  });
  risers.forEach(s => {
    const u = s.userData;
    s.position.y += dt * u.speed * 0.42;
    if (s.position.y > TOP + 1.6) s.position.y = BOT + 0.4;
  });
  drops.forEach(d => {
    d.position.y = d.userData.baseY + Math.sin(t * 0.9 + d.userData.seed) * 0.08;
  });

  // 开场题字：滚动 8% 后淡出
  const titleCard = document.getElementById('titleCard');
  if (titleCard) titleCard.classList.toggle('fade', progress > 0.06);

  updateRay();
  updateHUD();
  applyCamera(t);
  if (fxPass) fxPass.uniforms.uTime.value = t;
  composer.render();
}

/* ================= 启动 ================= */
function start() {
  try {
    initRenderer();
    buildWorld();
    built = true;
  } catch (e) {
        showFallback();
    return;
  }

  // ScrollTrigger：pin 世界段，驱动 targetProgress
  if (window.gsap && window.ScrollTrigger) {
    gsap.registerPlugin(ScrollTrigger);
    ScrollTrigger.create({
      trigger: '#world',
      start: 'top top',
      end: '+=' + ((CFG.scrollVH || 600) * (isPhone ? 0.7 : 1)) + '%',
      pin: true,
      scrub: true,
      anticipatePin: 1,
      invalidateOnRefresh: true,
      onUpdate: (self) => { targetProgress = self.progress; }
    });
    // 右缘进度条
    ScrollTrigger.create({
      trigger: '#world',
      start: 'top top',
      end: '+=' + (CFG.scrollVH || 600) + '%',
      onUpdate: (self) => {
        const f = document.getElementById('railFill');
        if (f) f.style.height = (self.progress * 100).toFixed(1) + '%';
      }
    });
  } else {
    // 无 GSAP 兜底：原生滚动映射（不含 scroll 监听，用 rAF 读）
    const worldTop = () => worldEl.getBoundingClientRect().top + window.scrollY;
    let raf = () => {
      const dist = (CFG.scrollVH / 100) * innerHeight;
      const p = THREE.MathUtils.clamp((window.scrollY - worldTop()) / dist, 0, 1);
      targetProgress = p;
      const f = document.getElementById('railFill');
      if (f) f.style.height = (p * 100).toFixed(1) + '%';
      requestAnimationFrame(raf);
    };
    requestAnimationFrame(raf);
  }

  window.__MATINFO = () => JSON.stringify({
    trunkMat: trunkGroup.userData.mat ? trunkGroup.userData.mat.type : 'none',
    trunkUniformKeys: trunkGroup.userData.mat ? Object.keys(trunkGroup.userData.mat.uniforms||{}) : [],
    branchMat: branchGroup.userData.mat ? branchGroup.userData.mat.type : 'none',
    branchUniformKeys: branchGroup.userData.mat ? Object.keys(branchGroup.userData.mat.uniforms||{}) : []
  });
  tick();
  // headless 兜底：若 1.5s 内 rAF 从未触发，用 setInterval 驱动（真实浏览器不受影响）
  setTimeout(() => {
    if (!window.__TICKS) {
      const iv = setInterval(() => { tick(); if (window.__TICKS > 999999) clearInterval(iv); }, 16);
    }
  }, 1500);
}

/* ================= 加载进度 ================= */
const loaderEl = document.getElementById('loader');
const loaderFill = document.getElementById('loaderFill');
const loaderPct = document.getElementById('loaderPct');
let loadVal = 0;
const loadTimer = setInterval(() => {
  loadVal = Math.min(96, loadVal + 4 + Math.random() * 9);
  if (loaderFill) loaderFill.style.width = loadVal + '%';
  if (loaderPct) loaderPct.textContent = Math.round(loadVal);
  if (loadVal >= 96) clearInterval(loadTimer);
}, 90);

function finishLoad() {
  loadVal = 100;
  if (loaderFill) loaderFill.style.width = '100%';
  if (loaderPct) loaderPct.textContent = '100';
  setTimeout(() => {
    loaderEl && loaderEl.classList.add('done');
    if (window.anime && !REDUCE) {
      anime({ targets: '.inquiry', opacity: [0, 1], translateY: [18, 0], duration: 900, delay: 250, easing: 'easeOutCubic' });
    }
  }, 320);
}

/* ================= 降级 ================= */
function showFallback() {
  // WebGL 不可用时只保留 HUD 与提示
  const w = document.getElementById('world');
  if (w) w.style.display = 'none';
  loaderEl && loaderEl.classList.add('done');
}

/* ================= resize ================= */
addEventListener('resize', () => {
  if (!built) return;
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
});

/* ================= boot ================= */
let started = false;
function boot() {
  if (started) return;
  started = true;
  setTimeout(start, 30);
}
if (document.readyState === 'complete' || document.readyState === 'interactive') {
  boot();
} else {
  addEventListener('DOMContentLoaded', boot);
}
setTimeout(() => { finishLoad(); ready = true; }, 1400);
