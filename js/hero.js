/* ============================================================
   hero.js — GSAP 官网式遮罩开场 + HERO 全拉满入场 + 滚动联动
   1) 首屏遮罩 intro：scramble reveal 乱码定格 + 计数 + 揭幕
   2) HERO 标题：logo 弹性入 → WELCOME/CAMPUS 每字符 per-element 升入
      （skewX 手写笔触感 + random y/rotation/scale + stagger）
      → 入场完成后保留永久 idle 浮动（yoyo）
   3) 滚动：大标题缩放让位、quickTo 鼠标视差、quickTo 高频写入
   ============================================================ */
(function () {
  "use strict";
  if (window.__heroInited) return;
  window.__heroInited = true;

  // v1.7.4：减少动效偏好。原文件完全没接这个开关（app.js 里有 REDUCED_MOTION，
  // hero.js 漏了），系统开了"减少动效"的用户依然会看完整段 scramble + 揭幕。
  var REDUCED = !!(window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  const $intro      = document.getElementById("intro");
  const $introLines = document.querySelectorAll("#intro-title [data-line]");
  const $introCount = document.getElementById("intro-count");
  const $introBar   = document.getElementById("intro-bar-fill");
  const $introFoot  = document.querySelector(".intro-foot");

  const $logo = document.getElementById("logo");
  const $row1 = document.getElementById("t-row-1");
  const $row2 = document.getElementById("t-row-2");
  const $sub  = document.getElementById("t-sub");
  const $hint = document.getElementById("scroll-hint");
  const $heroSection = document.getElementById("sec-hero");

  // idle tween 池：后台/离屏时统一暂停（v1.7.4）
  var idleTweens = [];
  function pauseIdle() { idleTweens.forEach(function (t) { t && t.pause && t.pause(); }); }
  function resumeIdle() { idleTweens.forEach(function (t) { t && t.resume && t.resume(); }); }

  // ============================================================
  // 兜底（v1.7.4 生死线）
  // 原实现里 .intro-overlay 的 display:none 只写在 introTL.onComplete 内。
  // 只要 GSAP 没加载 / 下面任一环节抛错 / 动画被别处 kill，这层 z-index:9999
  // 的全屏米黄就会永久盖住整站 —— 用户什么都点不了，且没有任何提示。
  // 现在：① 任何异常路径都会撤幕；② 5s 硬看门狗；③ CSS 里还有 6s 兜底动画。
  // ============================================================
  var introKilled = false;
  function killIntro() {
    if (introKilled || !$intro) return;
    introKilled = true;
    $intro.classList.add("intro-done");   // 停掉 CSS 兜底动画
    $intro.style.display = "none";
    $intro.setAttribute("aria-hidden", "true");
  }

  // 静态 hero 兜底：GSAP 缺失或动画失败时，把入场前被设成 opacity:0 的元素放出来
  function showStaticHero() {
    [$logo, $sub, $row1, $row2].forEach(function (el) {
      if (!el) return;
      el.style.opacity = "1";
      el.style.transform = "none";
    });
    if ($hint) $hint.classList.add("is-in");
  }

  function showScrollHint() {
    if ($hint) $hint.classList.add("is-in");
  }

  // 滚动提示点击 → 滚到登录卡（滚动容器是 #view-login，不是 window）
  if ($hint) {
    $hint.addEventListener("click", function () {
      var $ml = document.getElementById("monster-login");
      var scroller = document.getElementById("view-login");
      if (!$ml) return;
      try {
        if (scroller) {
          var top = $ml.getBoundingClientRect().top + scroller.scrollTop;
          scroller.scrollTo({ top: top, behavior: REDUCED ? "auto" : "smooth" });
        } else {
          $ml.scrollIntoView({ behavior: REDUCED ? "auto" : "smooth", block: "start" });
        }
      } catch (e) {
        if (scroller) scroller.scrollTop = $ml.offsetTop;
      }
    });
  }

  // GSAP 缺失：直接撤幕 + 静态 hero，绝不允许遮罩留在屏上
  if (!window.gsap) { killIntro(); showStaticHero(); return; }

  // 硬看门狗：5s 后无论动画状态如何，强制撤幕
  setTimeout(killIntro, 5000);

  if (window.ScrollTrigger) gsap.registerPlugin(ScrollTrigger);

  // 整体 try/catch：任何一步炸了也要把遮罩撤掉
  try {
    runHero();
  } catch (err) {
    console.error("[hero] 开场动画异常，已回退静态 hero:", err);
    killIntro();
    showStaticHero();
  }

function runHero() {

  // ============================================================
  // scrambleReveal(el, finalText, opts) — 自写 ScrambleText 行为
  // - 把 el 改成 inline-block span 序列（.gsap-scramble）
  // - onUpdate 按 progress 驱动：前 revealStart 全乱码、之后逐字符定格到 finalText
  // - 空格保持空白不参与 scramble
  // - 返回 gsap.timeline（可 add 进主时间线）
  // ============================================================
  function scrambleReveal(target, finalText, opts) {
    opts = opts || {};
    const pool = opts.chars || "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%&*?/";
    const dur = opts.duration || 1.4;
    const revealStart = (opts.revealStart != null) ? opts.revealStart : 0.22;
    const revealSpread = (opts.revealSpread != null) ? opts.revealSpread : 0.55;

    // 重建内部结构：每个字符一个 inline span（空格用 .spc 占位）
    target.textContent = "";
    target.classList.add("gsap-scramble");
    const chars = [];
    const spans = [];
    for (let i = 0; i < finalText.length; i++) {
      const c = finalText[i];
      const s = document.createElement("span");
      if (c === " ") {
        s.className = "spc";
        s.innerHTML = "&nbsp;";
        target.appendChild(s);
        chars.push(" ");
        spans.push(s);
        continue;
      }
      s.textContent = pool.charAt(Math.floor(Math.random() * pool.length));
      target.appendChild(s);
      chars.push(c);
      spans.push(s);
    }

    // 每个非空格字符的 reveal 时刻（0~1）
    const revealAt = chars.map((c) => {
      if (c === " ") return -1;
      return revealStart + Math.random() * revealSpread * 0.6; // 抖动，每个字符 reveal 时刻略不同
    });

    const tl = gsap.timeline();
    tl.to({}, {
      duration: dur,
      ease: "none",
      onUpdate: function () {
        const p = this.progress();
        for (let i = 0; i < chars.length; i++) {
          if (chars[i] === " ") continue;
          if (p >= revealAt[i]) {
            if (spans[i].textContent !== chars[i]) {
              spans[i].textContent = chars[i];
            }
          } else {
            // 还在乱码期，每帧抽一次
            spans[i].textContent = pool.charAt(Math.floor(Math.random() * pool.length));
          }
        }
      }
    });
    return tl;
  }

  // 自写 SplitText（避免付费插件）
  // v1.7.4：空格字符打 data-space 标记，配合 CSS 的固定 em 宽度锁死格子 ——
  // WELCOME / CAMPUS 全是等宽拉丁大写，字体从 fallback 切到 Inter 时字宽会变，
  // per-char 的 inline-block 会整体重排，表现就是“字母左右穿插/重叠”。
  function splitChars(el) {
    const text = el.textContent;
    el.textContent = "";
    const chars = [];
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      const span = document.createElement("span");
      span.className = "gsap-char";
      span.style.willChange = "transform, opacity";
      if (c === " ") {
        span.innerHTML = "&nbsp;";
        span.dataset.space = "1";
      } else {
        span.textContent = c;
      }
      el.appendChild(span);
      chars.push(span);
    }
    return { chars };
  }

  // $intro / $introLines / $introCount / $introBar / $introFoot / $logo /
  // $row1 / $row2 / $sub 已在 IIFE 顶部取过，这里不再重复查询 DOM。

  gsap.set($logo, { opacity: 0, y: 30, scale: 0.92 });
  gsap.set($sub,  { opacity: 0, y: 30 });
  if ($introFoot) gsap.set($introFoot, { opacity: 0, y: 16 });

  // ============================================================
  // v1.7.4 回访跳过：同一个 session 内第二次进入不再重放 3s 开场
  // 开场是纯仪式，首次看有倨值，第二次就是纯等待。
  // 用 sessionStorage 而非 localStorage：换个标签页/新会话仍然会看到完整开场。
  // ============================================================
  var SKIP_KEY = "campus_intro_seen";
  var seenBefore = false;
  try { seenBefore = sessionStorage.getItem(SKIP_KEY) === "1"; } catch (e) {}
  function markSeen() {
    try { sessionStorage.setItem(SKIP_KEY, "1"); } catch (e) {}
  }

  // ============================================================
  // v1.7.4 真实进度：原来的 0→100 是固定 1.8s 的假计时，跟页面实际加载没有任何关系。
  // 现在铺到真实信号上：文档 readyState + 字体就绪（字体是唯一会导致
  // 标题重排的资源），两个各占一半权重；不支持的浏览器直接给满分。
  // 但依然保留上限：最少 0.6s（否则一闪而过看不清）、最多 1.8s（不能让开场变等待）。
  // ============================================================
  var docReady = (document.readyState === "complete" || document.readyState === "interactive");
  var fontsDone = false;
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () { fontsDone = true; })
      .catch(function () { fontsDone = true; });
  } else {
    fontsDone = true;
  }

  function realProgress() {
    var p = 0;
    if (docReady) p += 0.5;
    if (fontsDone) p += 0.5;
    if (!docReady && document.readyState !== "loading") { docReady = true; p += 0.5; }
    return Math.max(0, Math.min(1, p));
  }

  // 计算本次开场时长（秒）
  var INTRO_MIN = 0.6, INTRO_MAX = 1.8;
  var introDur = INTRO_MAX;
  if (docReady && fontsDone) {
    introDur = INTRO_MIN;          // 资源已就绪（回访 / 缓存命中）→ 快速揭幕
  }

  // ============================================================
  // v1.7.4 两种“不演开场”的情况：
  //   a) 用户开了减少动效 → 不演 scramble（闪烁字符是典型的光敏诱发因素）
  //   b) 本次 session 已看过 → 不重放，只做一个 0.35s 渐隐
  // 两者都直接撤幕 + 进 playHero（内部会再按 REDUCED 去掉大幅位移）。
  // ============================================================
  function skipIntro() {
    markSeen();
    showScrollHint();   // 跳过开场时没有 idle 回调，提示必须自己出来
    if ($intro) {
      gsap.to($intro, {
        opacity: 0, duration: REDUCED ? 0 : 0.35, ease: "power1.out",
        onComplete: killIntro
      });
    } else {
      killIntro();
    }
    playHero();
  }

  if (REDUCED || seenBefore) {
    skipIntro();
  } else {
    buildIntroTL();
  }

  function buildIntroTL() {
  // ===== 遮罩开场时间线 =====
  const introTL = gsap.timeline({
    onComplete() {
      markSeen();
      gsap.to($intro, {
        yPercent: -100,
        duration: 1.1,
        ease: "expo.inOut",
        onComplete() { killIntro(); }
      });
      playHero();
    }
  });

  const counter = { v: 0 };
  introTL.to(counter, {
    v: 100, duration: introDur, ease: "power1.inOut",
    onUpdate() {
      // 显示值 = min(动画进度, 真实进度)，让数字不会跑在实际加载前面
      var shown = Math.min(counter.v, realProgress() * 100);
      if ($introCount) $introCount.textContent = String(Math.round(shown)).padStart(2, "0");
    }
  }, 0);
  introTL.fromTo($introBar, { scaleX: 0 }, { scaleX: 1, duration: introDur, ease: "power1.inOut" }, 0);

  // ===== 标题 Scramble reveal：每行乱码翻飞后定格成 WELCOME / CAMPUS =====
  $introLines.forEach((line, i) => {
    const finalText = line.dataset.line || line.textContent;
    // 第一行 WELCOME 0.30s 起、第二行 CAMPUS 0.55s 起，错峰
    introTL.add(
      scrambleReveal(line, finalText, {
        duration: 1.2,
        chars: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
        revealStart: 0.22,
        revealSpread: 0.55
      }),
      0.30 + i * 0.25
    );
  });

  // ===== 底部三行小字（带实时 TIME flip counter）淡入 =====
  if ($introFoot) {
    introTL.to($introFoot, { opacity: 1, y: 0, duration: 0.7, ease: "power2.out" }, 0.95);
  }

  }  // end buildIntroTL

  // ============================================================
  // HERO 标题入场 — 拉满
  // ============================================================
  function playHero() {
    const tl = gsap.timeline({ defaults: { ease: "power3.out" } });

    // v1.7.4：减少动效时只做平淡的渐入（仍然是动效，但没有大幅位移/旋转/弹跳）。
    if (REDUCED) {
      [$logo, $row1, $row2, $sub].forEach(function (el, i) {
        if (!el) return;
        gsap.set(el, { opacity: 0 });
        tl.to(el, { opacity: 1, duration: 0.4, ease: "none" }, i * 0.05);
      });
      showScrollHint();
      return tl;
    }

    // logo 弹性入场
    tl.fromTo($logo,
      { opacity: 0, y: 30, scale: 0.92, rotation: -3 },
      { opacity: 1, y: 0, scale: 1, rotation: 0, duration: 1.0, ease: "back.out(1.6)" }
    );

    // 每字符 per-element 升入：加 skewX 手写笔触感（缩到 ±10° 避免入场穿插）
    const chars1 = splitChars($row1).chars;
    const chars2 = splitChars($row2).chars;
    const chars  = chars1.concat(chars2);
    const easePool = ["power2.out", "power3.out", "power4.out", "back.out(1.5)"];
    chars.forEach((ch, i) => {
      const fromY      = gsap.utils.random(80, 160);
      const fromRot    = gsap.utils.random(-8, 8);
      const fromSkewX  = gsap.utils.random(-10, 10);   // 原 ±22° 太狠，缩到 ±10°
      const fromScale  = gsap.utils.random(0.78, 1.2);
      const dur        = gsap.utils.random(0.85, 1.5);
      gsap.set(ch, {
        opacity: 0, y: fromY, rotation: fromRot, skewX: fromSkewX, scale: fromScale
      });
      tl.to(ch, {
        opacity: 1, y: 0, rotation: 0, skewX: 0, scale: 1,
        duration: dur, ease: easePool[i % easePool.length]
      }, 0.15 + i * 0.05);
    });

    // 副标入场（紧跟）
    tl.fromTo($sub, { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.7 }, "-=0.35");

    // v1.7.4：提示在副标出现后立刹亮（原先挂在 idle 回调里，
    // 一旦 idle 被省略或延迟，用户就看不到任何“能往下走”的信号）。
    tl.add(showScrollHint, "+=0.15");

    // 入场完成后：每个字符独立永久 idle 浮动（GSAP 那种“每个字母都有生命”）
    // 只保 y 浮动，rotation 0 → 避免大字号下 ±1.2° 让左右相邻字符笔画穿插看起来重叠
    tl.add(() => {
      chars.forEach((ch, i) => {
        const ampY = gsap.utils.random(1.5, 3);       // 收紧到 1.5~3px
        const dur  = gsap.utils.random(2.6, 4.2);
        idleTweens.push(gsap.to(ch, {
          y: `+=${ampY}`,
          rotation: 0,
          duration: dur,
          ease: "sine.inOut",
          repeat: -1,
          yoyo: true,
          delay: i * 0.07  // 错开，营造群体呼吸不齐
        }));
      });
    }, "+=0.5");

    return tl;
  }

  // ===== 滚动驱动：大标题缩放让位（仅在 ScrollTrigger 可用时启用） =====
  // 单页滚动模式下，滚动容器是 #view-login（不是 window），必须指定 scroller
  if (window.ScrollTrigger) {
    ScrollTrigger.create({
      trigger: "#sec-hero",
      scroller: "#view-login",
      start: "top top",
      end: "bottom top",
      scrub: -0.6,
      onUpdate(self) {
        const p = self.progress;
        gsap.to(".hero-title", {
          scale: 1 - p * 0.35, y: p * -120, opacity: 1 - p * 0.6,
          duration: 0.2, ease: "none", overwrite: "auto"
        });
        gsap.to($logo, {
          scale: 1 - p * 0.4, opacity: 1 - p * 0.5,
          duration: 0.2, ease: "none", overwrite: "auto"
        });
      }
    });
  }

  // ===== 登录卡滚动入场：滚动到 #monster-login 时加 .active 触发小怪兽掉落动画 =====
  const $monster = document.getElementById("monster-login");
  if ($monster && "IntersectionObserver" in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          $monster.classList.add("active");
          io.unobserve($monster);
        }
      });
    }, { root: document.getElementById("view-login"), threshold: 0.25 });
    io.observe($monster);
  } else if ($monster) {
    $monster.classList.add("active");
  }

  // ===== 鼠标视差（quickTo 高效写法，60fps 不掉帧） =====
  // 之前 mouse quickTo 把整 .hero-title 移 ±14px 造成 inline-block 字符 GPU 重绘偶发错位（看着像字母重叠）。
  // 现在只让 logo 视差，标题字符完全稳定。
  // v1.7.4：减少动效时不挂视差（持续跟随鼠标的位移就是动效）。
  if (!REDUCED) {
    const logoXTo = gsap.quickTo($logo, "x", { duration: 0.9, ease: "power3.out" });
    const logoYTo = gsap.quickTo($logo, "y", { duration: 0.9, ease: "power3.out" });
    document.addEventListener("mousemove", (e) => {
      const cx = window.innerWidth / 2, cy = window.innerHeight / 2;
      const dx = (e.clientX - cx) / cx, dy = (e.clientY - cy) / cy;
      logoXTo(dx * 6);
      logoYTo(dy * 4);
    });
  }

  // ============================================================
  // v1.7.4 后台暂停：13 个 idle tween + ScrollTrigger + 视差
  // 在标签页被切走后仍然每帧写 transform（白费 CPU / 电量）。
  // 显式暂停：hidden 时停 idle，回来恢复；滚到登录区后 hero 已离屏，一并停掉。
  // ============================================================
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) pauseIdle(); else resumeIdle();
  });

  var heroVisible = true;
  if ("IntersectionObserver" in window && $heroSection) {
    new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        heroVisible = en.isIntersecting;
        if (!heroVisible) pauseIdle(); else if (!document.hidden) resumeIdle();
      });
    }, { root: document.getElementById("view-login"), threshold: 0.05 }).observe($heroSection);
  }
}
})();
