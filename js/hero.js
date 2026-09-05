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
  if (!window.gsap) return;
  if (window.__heroInited) return;
  window.__heroInited = true;

  if (window.ScrollTrigger) gsap.registerPlugin(ScrollTrigger);

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
  function splitChars(el) {
    const text = el.textContent;
    el.textContent = "";
    const chars = [];
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      const span = document.createElement("span");
      span.className = "gsap-char";
      span.style.display = "inline-block";
      span.style.willChange = "transform, opacity";
      if (c === " ") {
        span.innerHTML = "&nbsp;";
        span.style.minWidth = "0.3em";
      } else {
        span.textContent = c;
      }
      el.appendChild(span);
      chars.push(span);
    }
    return { chars };
  }

  const $intro      = document.getElementById("intro");
  const $introLines = document.querySelectorAll("#intro-title [data-line]");
  const $introCount = document.getElementById("intro-count");
  const $introBar   = document.getElementById("intro-bar-fill");
  const $introFoot  = document.querySelector(".intro-foot");

  const $logo = document.getElementById("logo");
  const $row1 = document.getElementById("t-row-1");
  const $row2 = document.getElementById("t-row-2");
  const $sub  = document.getElementById("t-sub");

  gsap.set($logo, { opacity: 0, y: 30, scale: 0.92 });
  gsap.set($sub,  { opacity: 0, y: 30 });
  if ($introFoot) gsap.set($introFoot, { opacity: 0, y: 16 });

  // ===== 遮罩开场时间线 =====
  const introTL = gsap.timeline({
    onComplete() {
      gsap.to($intro, {
        yPercent: -100,
        duration: 1.1,
        ease: "expo.inOut",
        onComplete() { $intro.style.display = "none"; }
      });
      playHero();
    }
  });

  const counter = { v: 0 };
  introTL.to(counter, {
    v: 100, duration: 1.8, ease: "power1.inOut",
    onUpdate() {
      $introCount.textContent = String(Math.round(counter.v)).padStart(2, "0");
    }
  }, 0);
  introTL.fromTo($introBar, { scaleX: 0 }, { scaleX: 1, duration: 1.8, ease: "power1.inOut" }, 0);

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

  // ============================================================
  // HERO 标题入场 — 拉满
  // ============================================================
  function playHero() {
    const tl = gsap.timeline({ defaults: { ease: "power3.out" } });

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

    // 入场完成后：每个字符独立永久 idle 浮动（GSAP 那种"每个字母都有生命"）
    // 只保 y 浮动，rotation 0 → 避免大字号下 ±1.2° 让左右相邻字符笔画穿插看起来重叠
    tl.add(() => {
      chars.forEach((ch, i) => {
        const ampY = gsap.utils.random(1.5, 3);       // 收紧到 1.5~3px
        const dur  = gsap.utils.random(2.6, 4.2);
        gsap.to(ch, {
          y: `+=${ampY}`,
          rotation: 0,
          duration: dur,
          ease: "sine.inOut",
          repeat: -1,
          yoyo: true,
          delay: i * 0.07  // 错开，营造群体呼吸不齐
        });
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
  // 现在只让 logo 视差，标题字符完全稳定，title 由 quickTo 加锁住 transformOrigin 仍做最轻微的视差。
  const $titleEl = document.querySelector(".hero-title");
  const logoXTo  = gsap.quickTo($logo, "x", { duration: 0.9, ease: "power3.out" });
  const logoYTo  = gsap.quickTo($logo, "y", { duration: 0.9, ease: "power3.out" });
  document.addEventListener("mousemove", (e) => {
    const cx = window.innerWidth / 2, cy = window.innerHeight / 2;
    const dx = (e.clientX - cx) / cx, dy = (e.clientY - cy) / cy;
    logoXTo(dx * 6);
    logoYTo(dy * 4);
    // 标题字符不整体位移（避免 GPU 重绘错位）
  });
})();
