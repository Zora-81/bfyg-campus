/**
 * 啵宝 Bobo —— 站点吉祥物（动态 SVG，替代抽屉头部校徽位）
 *
 * 效果移植自 bloub (https://github.com/jeremy-prt/bloub, MIT License,
 * Copyright (c) 2026 Jérémy Perret)：单形状径向剖面 morph、球面眼睛投影、
 * 眨眼日历、视线跟随、指数缓动 + 眨眼遮罩换状态。engine.sample(t) 为纯函数。
 *
 * 本地化改动：
 * - 身体固定正圆（锁定品牌形象，眼睛修正表 eyefit 因此不需要）
 * - 配色 蓝绿 #22d3ee / 深墨 #0f1226 / 金 #f0b429（呼应校徽金塔）
 * - 庆祝状态：金色星星沿倾斜椭圆轨道绕行（真 3D 前后遮挡），替代原 orbit 彩环
 * - 状态精简为站点事件所需 7 个，由 window.Bobo.setState(name) 驱动
 *
 * 无依赖、单 rAF 循环、页面隐藏自动暂停；命名空间挂在 window.Bobo。
 */
(function () {
  'use strict';

  /* ============ 数学工具（bloub math.ts） ============ */
  var TAU = Math.PI * 2;
  function clamp(v, lo, hi) { lo = lo === undefined ? 0 : lo; hi = hi === undefined ? 1 : hi; return v < lo ? lo : v > hi ? hi : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function r2(v) { return Math.round(v * 100) / 100; }
  var easeOutCubic = function (t) { return 1 - Math.pow(1 - t, 3); };
  var easeInOutCubic = function (t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
  var easeOutQuint = function (t) { return 1 - Math.pow(1 - t, 5); };
  function loopNoise(t, period, seed) {
    var p = t / period * TAU;
    return 0.55 * Math.sin(p + seed) + 0.3 * Math.sin(2 * p + seed * 1.7 + 1.1) + 0.15 * Math.sin(3 * p + seed * 2.3 + 2.4);
  }
  function createRng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ============ 形状：径向剖面 + morph（bloub shape.ts） ============ */
  var NS = 64;
  var COS = new Array(NS), SIN = new Array(NS);
  for (var _i = 0; _i < NS; _i++) { COS[_i] = Math.cos(_i / NS * TAU); SIN[_i] = Math.sin(_i / NS * TAU); }
  function circle(r) { return { radii: new Array(NS).fill(r), rot: 0, cx: 0, cy: 0, sx: 1, sy: 1 }; }
  function blendSil(a, b, t) {
    var radii = new Array(NS);
    for (var i = 0; i < NS; i++) radii[i] = lerp(a.radii[i], b.radii[i], t);
    var d = b.rot - a.rot;
    while (d > Math.PI) d -= TAU;
    while (d < -Math.PI) d += TAU;
    return { radii: radii, rot: a.rot + d * t, cx: lerp(a.cx, b.cx, t), cy: lerp(a.cy, b.cy, t), sx: lerp(a.sx, b.sx, t), sy: lerp(a.sy, b.sy, t) };
  }
  function toPoints(s, R, out) {
    out = out || [];
    var cr = Math.cos(s.rot), sr = Math.sin(s.rot);
    for (var i = 0; i < NS; i++) {
      var r = s.radii[i], x = r * COS[i], y = r * SIN[i];
      var rx = x * cr - y * sr, ry = x * sr + y * cr;
      var p = out[i] || (out[i] = { x: 0, y: 0 });
      p.x = (rx * s.sx + s.cx) * R;
      p.y = (ry * s.sy + s.cy) * R;
    }
    return out;
  }
  function closedPath(pts) {
    var n = pts.length, k = 1 / 6;
    var d = 'M' + r2(pts[0].x) + ' ' + r2(pts[0].y);
    for (var i = 0; i < n; i++) {
      var p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
      d += 'C' + r2(p1.x + (p2.x - p0.x) * k) + ' ' + r2(p1.y + (p2.y - p0.y) * k) +
        ' ' + r2(p2.x - (p3.x - p1.x) * k) + ' ' + r2(p2.y - (p3.y - p1.y) * k) +
        ' ' + r2(p2.x) + ' ' + r2(p2.y);
    }
    return d + 'Z';
  }
  function radiusAtAngle(radii, angle) {
    var t = (((angle / TAU) % 1) + 1) % 1 * NS;
    var i = Math.floor(t);
    return lerp(radii[i % NS], radii[(i + 1) % NS], t - i);
  }
  function capsulePath(w, h) {
    var hw = Math.max(w, 0.01) / 2, hh = Math.max(h, 0.01) / 2, r = Math.min(hw, hh);
    return 'M' + r2(-hw) + ' ' + r2(-hh + r) +
      'A' + r2(r) + ' ' + r2(r) + ' 0 0 1 ' + r2(-hw + r) + ' ' + r2(-hh) +
      'L' + r2(hw - r) + ' ' + r2(-hh) +
      'A' + r2(r) + ' ' + r2(r) + ' 0 0 1 ' + r2(hw) + ' ' + r2(-hh + r) +
      'L' + r2(hw) + ' ' + r2(hh - r) +
      'A' + r2(r) + ' ' + r2(r) + ' 0 0 1 ' + r2(hw - r) + ' ' + r2(hh) +
      'L' + r2(-hw + r) + ' ' + r2(hh) +
      'A' + r2(r) + ' ' + r2(r) + ' 0 0 1 ' + r2(-hw) + ' ' + r2(hh - r) + 'Z';
  }
  function hullOfCircles(x1, y1, r1, x2, y2, r2v, steps) {
    steps = steps || 96;
    var dx = x2 - x1, dy = y2 - y1;
    var dist = Math.hypot(dx, dy) || 1e-6;
    var base = Math.atan2(dy, dx);
    var spread = Math.acos(Math.max(-1, Math.min(1, (r1 - r2v) / dist)));
    var pts = [], i, a;
    for (i = 0; i <= steps / 2; i++) {
      a = base + spread + ((TAU - 2 * spread) * i) / (steps / 2);
      pts.push({ x: x1 + Math.cos(a) * r1, y: y1 + Math.sin(a) * r1 });
    }
    for (i = 0; i <= steps / 2; i++) {
      a = base - spread + ((2 * spread) * i) / (steps / 2);
      pts.push({ x: x2 + Math.cos(a) * r2v, y: y2 + Math.sin(a) * r2v });
    }
    return pts;
  }
  function profileFromPolygon(poly, cx, cy) {
    var radii = new Array(NS).fill(0), n = poly.length, k, i;
    for (k = 0; k < NS; k++) {
      var dx = COS[k], dy = SIN[k], best = 0;
      for (i = 0; i < n; i++) {
        var a = poly[i], b = poly[(i + 1) % n];
        var ex = b.x - a.x, ey = b.y - a.y;
        var den = dx * ey - dy * ex;
        if (Math.abs(den) < 1e-9) continue;
        var px = a.x - cx, py = a.y - cy;
        var t = (px * ey - py * ex) / den;
        var u = (px * dy - py * dx) / den;
        if (t > best && u >= 0 && u <= 1) best = t;
      }
      radii[k] = best;
    }
    return radii;
  }
  function polyPath(pts, scale) {
    scale = scale || 1;
    var d = '';
    for (var i = 0; i < pts.length; i++) d += (i ? 'L' : 'M') + r2(pts[i].x * scale) + ' ' + r2(pts[i].y * scale);
    return d + 'Z';
  }

  /* ============ 球面眼睛 + 生命感（bloub face.ts） ============ */
  var EYE_SPLIT = 15.46, EYE_W = 0.186, EYE_H = 0.412;
  var REST_GAZE = { yaw: 28.49, pitch: 28.62, roll: -13 };
  var deg = function (d) { return d * Math.PI / 180; };
  function spinPair(u, v, ang) {
    var c = Math.cos(ang), s = Math.sin(ang);
    return [
      [u[0] * c + v[0] * s, u[1] * c + v[1] * s, u[2] * c + v[2] * s],
      [v[0] * c - u[0] * s, v[1] * c - u[1] * s, v[2] * c - u[2] * s]
    ];
  }
  function eyePoses(gaze, scale, split) {
    var f = [0, 0, 1], right = [1, 0, 0], down = [0, 1, 0], tmp;
    tmp = spinPair(f, right, deg(gaze.yaw)); f = tmp[0]; right = tmp[1];
    tmp = spinPair(down, f, deg(gaze.pitch)); down = tmp[0]; f = tmp[1];
    tmp = spinPair(right, down, deg(gaze.roll)); right = tmp[0]; down = tmp[1];
    function build(side) {
      var ef = spinPair(f, right, deg(split * side));
      var eF = ef[0], eR = ef[1];
      return { x: eF[0] * scale, y: eF[1] * scale, a: eR[0], b: eR[1], c: down[0], d: down[1], depth: eF[2] };
    }
    return [build(-1), build(1)];
  }
  var BRNG = createRng(0x5eed);
  var BLINKS = (function () {
    var out = [], t = 1.4;
    while (t < 900) {
      out.push(t);
      t += 1.9 + BRNG() * 2.7;
      if (BRNG() < 0.18) { out.push(t); t += 0.24; }
    }
    return out;
  })();
  var BLINK_DUR = 0.18;
  function blinkLid(t) {
    for (var i = 0; i < BLINKS.length; i++) {
      var start = BLINKS[i];
      if (t < start) break;
      var k = (t - start) / BLINK_DUR;
      if (k >= 0 && k <= 1) return k < 0.45 ? 1 - k / 0.45 : (k - 0.45) / 0.55;
    }
    return 1;
  }
  var blinkScale = function (lid) { return 0.06 + 0.94 * clamp(lid); };
  function liveliness(t, wander, blink) {
    return {
      dYaw: (loopNoise(t, 11.3, 0.4) * 5.5 + loopNoise(t, 3.7, 2.1) * 1.6) * wander,
      dPitch: (loopNoise(t, 9.1, 1.3) * 4.2 + loopNoise(t, 4.3, 0.7) * 1.3) * wander,
      dRoll: loopNoise(t, 13.7, 3.2) * 2.2 * wander,
      lid: blink ? blinkLid(t) : 1,
      driftX: loopNoise(t, 7.9, 1.9) * 0.006,
      driftY: loopNoise(t, 5.3, 0.3) * 0.007,
      breath: 1 + Math.sin(t / 3.4 * TAU) * 0.005
    };
  }

  /* ============ 状态目录（精简自 bloub states.ts + 新增 celebrate） ============ */
  function eyeCfg(w, h, tilt, open) { return { w: w, h: h, tilt: tilt || 0, open: open === undefined ? 1 : open }; }
  function pairE(w, h, tilt) { return [eyeCfg(w, h, tilt), eyeCfg(w, h, -(tilt || 0))]; }
  function basePose(o) {
    var p = {
      sil: circle(1), offX: 0, offY: 0,
      gaze: { yaw: REST_GAZE.yaw, pitch: REST_GAZE.pitch, roll: REST_GAZE.roll },
      split: EYE_SPLIT,
      eyes: pairE(EYE_W, EYE_H),
      eyeAlpha: 1, dots: [], notif: null
    };
    if (o) for (var k in o) p[k] = o[k];
    return p;
  }
  var BAR_IT = profileFromPolygon(hullOfCircles(0, -0.2535, 0.1345, 0, 0.2535, 0.1345), 0, 0);
  var TEAR_PTS = hullOfCircles(0, 0, 0.118, 0, 0.172, 0.012);
  var TEAR_D = polyPath(TEAR_PTS, 100);
  function barSil(rot, cx, cy) { return { radii: BAR_IT, rot: rot, cx: cx, cy: cy, sx: 1, sy: 1 }; }
  var DOT_X = [-0.557, -0.013, 0.532], DOT_R = 0.165, DOT_PEAK = 1.25;
  function dotPulse(t, i) {
    var p = (((t - i * 0.5) / 1.5) % 1 + 1) % 1;
    var k = p < 0.5 ? 0.5 - 0.5 * Math.cos(p * TAU) : 0;
    return clamp(k * 2);
  }

  var STATES = {
    idle: { dur: 2.4, morph: 0.45, blinkIn: false, pose: function () { return basePose(); } },
    thinking: {
      dur: 2.6, morph: 0.4, blinkIn: true,
      pose: function (t) {
        var mid = dotPulse(t, 1);
        var emerge = 0.3 + 0.7 * easeOutCubic(clamp(t / 0.3));
        return basePose({
          sil: circle(DOT_R * (1 + (DOT_PEAK - 1) * mid), { cx: DOT_X[1] }),
          eyeAlpha: 0,
          dots: [0, 2].map(function (i) {
            var k = dotPulse(t, i);
            return { x: DOT_X[i] * emerge, y: 0, r: DOT_R * (1 + (DOT_PEAK - 1) * k), opacity: 0.55 + 0.45 * k };
          })
        });
      }
    },
    wink: {
      dur: 1.6, morph: 0.3, blinkIn: true,
      pose: function () {
        return basePose({
          gaze: { yaw: -5.37, pitch: 4.55, roll: 6.7 }, split: 16.25,
          eyes: [eyeCfg(0.236, 0.464), eyeCfg(0.447, 0.089)]
        });
      }
    },
    notify: {
      dur: 2.2, morph: 0.5, blinkIn: true,
      pose: function (t) {
        var p = clamp(t / 0.45);
        var pop = 1 + (1.14 - 1) * Math.sin(p * Math.PI) * (1 - p * 0.35);
        var r = 0.16 * (p < 1 ? pop : 1);
        var a = -50 * Math.PI / 180;
        return basePose({
          gaze: { yaw: -21.94, pitch: -5.82, roll: -12.2 }, split: 18.89,
          eyes: pairE(0.505, 0.498),
          notif: { x: Math.cos(a) * 1.05, y: Math.sin(a) * 1.05, r: r }
        });
      }
    },
    alert: {
      dur: 2.4, morph: 0.45, blinkIn: false,
      pose: function (t) {
        var p = clamp(t / 1.5);
        var travel = easeInOutCubic(p) * 0.82 - 0.087;
        var back = t > 1.6 ? clamp((t - 1.6) / 0.4) : 0;
        var x = travel * (1 - back) + 0.1 * back;
        var buzz = Math.sin(t * 2.5 * TAU) * 0.005;
        var tilt = 17.7 * Math.PI / 180;
        return basePose({
          sil: barSil(tilt, x, -0.325 - buzz), eyeAlpha: 0,
          dots: [{
            x: x - Math.sin(tilt) * 0.58, y: -0.325 + Math.cos(tilt) * 0.58 + buzz * 2.8,
            tear: true, rot: tilt * 180 / Math.PI, opacity: 1
          }]
        });
      }
    },
    sleep: {
      dur: 2.4, morph: 0.5, blinkIn: false,
      pose: function (t) {
        return basePose({
          sil: circle(0.1585, { cy: 0.11 + Math.sin(t * (TAU / 0.6)) * 0.19 }),
          eyeAlpha: 0
        });
      }
    },
    celebrate: {
      dur: 3.2, morph: 0.5, blinkIn: true,
      pose: function (t) {
        var hop = Math.abs(Math.sin(t * TAU / 0.7));
        return basePose({
          sil: circle(1, { cy: -0.14 * hop, sy: 1 - 0.05 * (1 - hop), sx: 1 + 0.04 * (1 - hop) }),
          gaze: { yaw: 8, pitch: -10, roll: 0 }, split: 17,
          eyes: pairE(0.27, 0.17, 14)
        });
      }
    }
  };

  /* ============ 庆祝星星（替代 orbit 彩环，站点新增） ============ */
  var STARS = [
    { a: 1.32, k: 0.35, tilt: -0.55, speed: 0.50, phase: 0.3, r: 0.115 },
    { a: 1.18, k: 0.22, tilt: 0.90, speed: 0.62, phase: 2.4, r: 0.085 },
    { a: 1.40, k: 0.42, tilt: 0.35, speed: 0.44, phase: 4.4, r: 0.070 },
    { a: 1.26, k: 0.30, tilt: -1.10, speed: 0.56, phase: 5.3, r: 0.060 }
  ];
  function starPos(s, t) {
    var th = s.phase + t * s.speed * TAU;
    var cu = Math.cos(s.tilt), su = Math.sin(s.tilt);
    var kz = Math.sqrt(Math.max(0, 1 - s.k * s.k));
    var ct = Math.cos(th), st = Math.sin(th);
    return { x: s.a * (ct * cu + st * -su * s.k), y: s.a * (ct * su + st * cu * s.k), z: s.a * st * kz, th: th };
  }
  function starPath(r, rot) {
    var d = '';
    for (var i = 0; i < 10; i++) {
      var ang = rot + i * Math.PI / 5 - Math.PI / 2;
      var rr = i % 2 === 0 ? r : r * 0.42;
      d += (i ? 'L' : 'M') + r2(Math.cos(ang) * rr) + ' ' + r2(Math.sin(ang) * rr);
    }
    return d + 'Z';
  }

  /* ============ 引擎（精简自 bloub engine.ts） ============ */
  var R = 100;
  function lerpEyeCfg(a, b, t) {
    return { w: lerp(a.w, b.w, t), h: lerp(a.h, b.h, t), open: lerp(a.open, b.open, t), tilt: lerp(a.tilt || 0, b.tilt || 0, t) };
  }
  function blendPose(a, b, t) {
    var o = 1 - t;
    return {
      sil: blendSil(a.sil, b.sil, t),
      offX: lerp(a.offX, b.offX, t), offY: lerp(a.offY, b.offY, t),
      gaze: {
        yaw: lerp(a.gaze.yaw, b.gaze.yaw, t),
        pitch: lerp(a.gaze.pitch, b.gaze.pitch, t),
        roll: lerp(a.gaze.roll, b.gaze.roll, t)
      },
      split: lerp(a.split, b.split, t),
      eyes: [lerpEyeCfg(a.eyes[0], b.eyes[0], t), lerpEyeCfg(a.eyes[1], b.eyes[1], t)],
      eyeAlpha: lerp(a.eyeAlpha, b.eyeAlpha, t),
      dots: a.dots.map(function (d) { var c = Object.assign({}, d); c.opacity = d.opacity * o; return c; })
        .concat(b.dots.map(function (d) { var c = Object.assign({}, d); c.opacity = d.opacity * t; return c; })),
      notif: t < 0.5 ? a.notif : b.notif
    };
  }

  function createBobo(svg, opts) {
    opts = opts || {};
    var COLOR = opts.color || '#22d3ee';
    var INK = opts.ink || '#0f1226';
    var GOLD = opts.gold || '#f0b429';

    var eng = {
      cur: 'idle', prev: null, tCur: 0, tPrev: 0, blinkAt: -10, freeze: null,
      look: null, lookPrev: null, lookAt: -10, lookMorph: 0.24
    };
    var NO_LOOK = { yaw: 0, pitch: 0, mix: 0, spin: 0, wander: 1 };

    function lookAtTime(now) {
      var k = (now - eng.lookAt) / eng.lookMorph;
      if (k >= 1) return eng.look;
      var a = eng.lookPrev, b = eng.look, t = easeOutQuint(clamp(k));
      return {
        yaw: lerp(a.yaw, b.yaw, t), pitch: lerp(a.pitch, b.pitch, t),
        mix: lerp(a.mix, b.mix, t), spin: lerp(a.spin, b.spin, t), wander: lerp(a.wander, b.wander, t)
      };
    }
    eng.setLook = function (target, now) {
      if (target && !Number.isFinite(target.yaw + target.pitch + target.mix + target.wander)) return;
      eng.lookPrev = eng.look ? eng.look : NO_LOOK;
      if (eng.lookAt > -10 && eng.lookAt !== now) eng.lookPrev = lookAtTime(now);
      eng.look = target || NO_LOOK;
      eng.lookAt = now;
    };
    eng.composite = function (now) {
      var since = now - eng.tCur;
      var pose = STATES[eng.cur].pose(Math.max(0, since));
      if (since >= STATES[eng.cur].morph || !eng.prev) return pose;
      var org = eng.freeze || STATES[eng.prev].pose(Math.max(0, now - eng.tPrev));
      return blendPose(org, pose, easeOutQuint(clamp(since / STATES[eng.cur].morph)));
    };
    eng.setState = function (id, now) {
      if (!STATES[id] || id === eng.cur) return;
      var inFade = eng.prev !== null && now - eng.tCur < STATES[eng.cur].morph;
      eng.freeze = inFade ? eng.composite(now) : null;
      eng.prev = eng.cur; eng.tPrev = eng.tCur;
      eng.cur = id; eng.tCur = now;
      if (STATES[id].blinkIn) eng.blinkAt = now;
    };
    eng.sample = function (now) {
      var def = STATES[eng.cur];
      var since = now - eng.tCur;
      var pose = def.pose(Math.max(0, since));
      if (since < def.morph && eng.prev) {
        var org = eng.freeze || STATES[eng.prev].pose(Math.max(0, now - eng.tPrev));
        pose = blendPose(org, pose, easeOutQuint(clamp(since / def.morph)));
      }
      var look = eng.look ? lookAtTime(now) : NO_LOOK;
      var alive = pose.eyeAlpha > 0.01;
      var life = liveliness(now, alive ? look.wander : 0, alive);
      var gaze = {
        yaw: lerp(pose.gaze.yaw, look.yaw, look.mix) + life.dYaw - look.spin,
        pitch: lerp(pose.gaze.pitch, look.pitch, look.mix) + life.dPitch,
        roll: pose.gaze.roll + life.dRoll
      };
      var forced = clamp((now - eng.blinkAt) / 0.2);
      var forcedLid = forced < 1 ? Math.abs(forced * 2 - 1) : 1;
      var lid = Math.min(life.lid, forcedLid);
      var offX = pose.offX + life.driftX, offY = pose.offY + life.driftY;
      var sil = { radii: pose.sil.radii, rot: pose.sil.rot, cx: pose.sil.cx + offX, cy: pose.sil.cy + offY, sx: pose.sil.sx, sy: pose.sil.sy * life.breath };
      var bodyPath = closedPath(toPoints(sil, R));
      var eyes = [];
      if (pose.eyeAlpha > 0.01) {
        var eps = eyePoses(gaze, R, pose.split);
        for (var i = 0; i < 2; i++) {
          var e = eps[i];
          if (e.depth <= 0.02) continue;
          var cfg = pose.eyes[i];
          var fit = radiusAtAngle(pose.sil.radii, Math.atan2(e.y, e.x) - pose.sil.rot);
          var phi = (cfg.tilt || 0) * Math.PI / 180;
          var cp = Math.cos(phi), sp = Math.sin(phi);
          var ax = e.a * cp + e.c * sp, ay = e.b * cp + e.d * sp;
          var cx2 = -e.a * sp + e.c * cp, cy2 = -e.b * sp + e.d * cp;
          var k = blinkScale(Math.min(lid, cfg.open));
          eyes.push({
            d: capsulePath(cfg.w * R, cfg.h * R),
            matrix: 'matrix(' + r2(ax) + ',' + r2(ay * k) + ',' + r2(cx2) + ',' + r2(cy2 * k) + ',' + r2(e.x * fit + offX * R) + ',' + r2(e.y * fit + offY * R) + ')',
            alpha: pose.eyeAlpha * clamp(e.depth / 0.12)
          });
        }
      }
      var dots = pose.dots
        .filter(function (p) { return p.opacity > 0.01 && p.r > 0.0005; })
        .map(function (p) {
          var c = Object.assign({}, p);
          c.x = (p.x + offX) * R; c.y = (p.y + offY) * R; c.r = p.r * R;
          return c;
        });
      var notif = pose.notif ? { x: (pose.notif.x + offX) * R, y: (pose.notif.y + offY) * R, r: pose.notif.r * R } : null;
      return { bodyPath: bodyPath, eyes: eyes, dots: dots, notif: notif };
    };
    eng.reset = function (now) {
      eng.cur = 'idle'; eng.prev = null; eng.freeze = null;
      eng.tCur = now; eng.tPrev = now; eng.blinkAt = -10;
    };

    /* ---------- 渲染 ---------- */
    var svgEl = typeof svg === 'string' ? document.querySelector(svg) : svg;
    if (!svgEl) return null;
    svgEl.setAttribute('viewBox', '-158 -158 316 316');
    var followHost = opts.followHost ? (typeof opts.followHost === 'string' ? document.querySelector(opts.followHost) : opts.followHost) : svgEl;
    var holdMs = opts.holdMs || 2600;
    var order = opts.order || ['idle', 'notify', 'wink', 'idle', 'thinking', 'idle', 'celebrate'];

    var idx = 0, blockStart = 0, clock = 0, last = null, running = true, timer = 0;

    function starSvg(st, alpha, now) {
      var s = st.spec;
      var kz = Math.sqrt(Math.max(0, 1 - s.k * s.k)) || 1;
      var depth01 = clamp(st.z / (s.a * kz) / 2 + 0.5);
      var size = s.r * R * lerp(0.75, 1.12, depth01);
      var op = alpha * (0.72 + 0.28 * Math.sin(now * 6 + s.phase * 7));
      var fill = st.z >= 0 ? '#ffd166' : '#c99a2e';
      return '<path d="' + starPath(size, st.th * 0.6) + '" transform="translate(' + r2(st.x * R) + ' ' + r2(st.y * R) + ')" fill="' + fill + '" opacity="' + r2(op) + '"/>';
    }
    function render(f, now, starAlpha, stars) {
      var s = '';
      var i;
      if (stars) for (i = 0; i < stars.length; i++) if (stars[i].z < 0) s += starSvg(stars[i], starAlpha, now);
      if (f.notif) s += '<circle cx="' + r2(f.notif.x) + '" cy="' + r2(f.notif.y) + '" r="' + r2(f.notif.r) + '" fill="' + GOLD + '"/>';
      s += '<path d="' + f.bodyPath + '" fill="' + COLOR + '"/>';
      if (stars) for (i = 0; i < stars.length; i++) if (stars[i].z >= 0) s += starSvg(stars[i], starAlpha, now);
      for (i = 0; i < f.dots.length; i++) {
        var d = f.dots[i];
        if (d.tear) s += '<g transform="translate(' + r2(d.x) + ' ' + r2(d.y) + ') rotate(' + r2(d.rot) + ')"><path d="' + TEAR_D + '" fill="' + COLOR + '" opacity="' + r2(d.opacity) + '"/></g>';
        else s += '<circle cx="' + r2(d.x) + '" cy="' + r2(d.y) + '" r="' + r2(d.r) + '" fill="' + COLOR + '" opacity="' + r2(d.opacity) + '"/>';
      }
      for (i = 0; i < f.eyes.length; i++) s += '<path d="' + f.eyes[i].d + '" transform="' + f.eyes[i].matrix + '" fill="' + INK + '" opacity="' + r2(f.eyes[i].alpha) + '"/>';
      svgEl.innerHTML = s;
    }
    function tick(ts) {
      if (!running) { last = null; return; }
      requestAnimationFrame(tick);
      if (last === null) { last = ts; return; }
      var dt = (ts - last) / 1000;
      last = ts;
      if (document.hidden || dt > 0.1) return;
      clock += dt;
      timer += dt;
      if (timer >= holdMs / 1000) {
        timer = 0;
        idx = (idx + 1) % order.length;
        eng.setState(order[idx], clock);
      }
      var since = clock - eng.tCur;
      var frame = eng.sample(clock);
      var starAlpha = eng.cur === 'celebrate'
        ? clamp(since / 0.5) * clamp((STATES.celebrate.dur - since) / 0.5)
        : 0;
      var stars = starAlpha > 0.01 ? STARS.map(function (s) {
        var p = starPos(s, clock);
        p.spec = s;
        return p;
      }) : null;
      render(frame, clock, starAlpha, stars);
    }
    requestAnimationFrame(tick);

    /* ---------- 指针跟随 ---------- */
    var MAX_YAW = 16, MAX_PITCH = 13, PITCH = 10;
    if (followHost && window.matchMedia && window.matchMedia('(pointer: fine)').matches) {
      followHost.addEventListener('pointermove', function (e) {
        var r = svgEl.getBoundingClientRect();
        if (!r.width || !r.height) return;
        var nx = clamp((e.clientX - (r.left + r.width / 2)) / (r.width / 2), -1, 1);
        var ny = clamp((e.clientY - (r.top + r.height / 2)) / (r.height / 2), -1, 1);
        eng.setLook({ yaw: nx * MAX_YAW, pitch: PITCH - ny * MAX_PITCH, mix: 1, spin: 0, wander: 0 }, clock);
      });
      followHost.addEventListener('pointerleave', function () { eng.setLook(null, clock); });
    }

    /* ---------- 对外 API ---------- */
    return {
      setState: function (name) { eng.setState(name, clock); return !!STATES[name]; },
      reset: function () { eng.reset(clock); idx = 0; timer = 0; },
      pause: function () { running = false; },
      resume: function () { if (!running) { running = true; requestAnimationFrame(tick); } },
      hasState: function (n) { return !!STATES[n]; }
    };
  }

  /* ============ 自动挂载：抽屉头部图标 ============ */
  var api = { create: createBobo, instance: null, COLOR: '#22d3ee', INK: '#0f1226' };

  function mountDrawer() {
    var host = document.getElementById('bobo-drawer-icon') ||
      document.querySelector('.drawer-header .drawer-server-icon');
    if (!host || host.dataset.bobo) return;
    host.dataset.bobo = '1';
    // 占位即 <svg>（index.html）：直接设置 viewBox 开画；
    // 若命中旧 <img>（兼容）：原位替换成 <svg>。
    if (host.tagName.toLowerCase() !== 'svg') {
      var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', host.getAttribute('class') || '');
      svg.setAttribute('aria-hidden', 'true');
      host.parentNode.replaceChild(svg, host);
      host = svg;
    }
    api.instance = createBobo(host, { color: api.COLOR, ink: api.INK });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountDrawer);
  } else {
    mountDrawer();
  }

  window.Bobo = api;
})();
