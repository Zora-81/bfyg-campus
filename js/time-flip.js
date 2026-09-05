/* ============================================================
   time-flip.js — 实时时钟 Flip Counter
   - 把 #intro-time 渲染成 4 个 flip-cell (HH:MM) + 1 个 colon
   - 每秒检查时间变化，gsap.to yPercent -digit*100 翻页
   - 进场 stagger：cell 渐入 + y 浮上
   - 自写，不依赖 ScrambleTextPlugin
   ============================================================ */
(function () {
  "use strict";
  if (!window.gsap) return;
  if (window.__timeFlipInited) return;
  window.__timeFlipInited = true;

  const $time = document.getElementById("intro-time");
  if (!$time) return;

  const STACK_DIGITS = 10;

  function buildStack(initialDigit) {
    const stack = document.createElement("span");
    stack.className = "flip-stack";
    for (let d = 0; d < STACK_DIGITS; d++) {
      const s = document.createElement("span");
      s.textContent = d;
      stack.appendChild(s);
    }
    // stack 总高 10em（10 个 span 垂直叠），要显示第 k 位 = yPercent -k*10
    gsap.set(stack, { yPercent: -initialDigit * 10, rotationX: 0 });
    return stack;
  }

  function renderInitial(timeStr) {
    $time.innerHTML = "";
    $time.classList.add("flip-counter");
    const stacks = [];
    for (let k = 0; k < timeStr.length; k++) {
      const ch = timeStr[k];
      if (ch === ":") {
        const c = document.createElement("span");
        c.className = "flip-colon";
        c.textContent = ":";
        $time.appendChild(c);
        continue;
      }
      const cell = document.createElement("span");
      cell.className = "flip-cell";
      const stack = buildStack(parseInt(ch, 10));
      cell.appendChild(stack);
      $time.appendChild(cell);
      stacks.push(stack);
    }
    return stacks;
  }

  function flipToDigit(stack, newDigit) {
    if (newDigit < 0 || newDigit > 9) return;
    // 翻页：gsap.to yPercent -digit*100 + rotationX 0~90~0 给出"翻板"感
    // 简化版：单次 tween 同时做 yPercent + 轻量 rotationX 抖动
    const cur = gsap.getProperty(stack, "yPercent") || 0;
    const target = -newDigit * 10;
    if (Math.abs(cur - target) < 0.5) return; // 已经在这一位就不动
    gsap.fromTo(
      stack,
      { rotationX: 0 },
      {
        yPercent: target,
        rotationX: 0,
        duration: 0.75,
        ease: "power2.inOut",
        overwrite: "auto",
        onStart() {
          // 进翻页：轻微下沉效果（rotationX 抖一下）
          gsap.fromTo(
            stack,
            { rotationX: 0 },
            { rotationX: 35, duration: 0.18, ease: "power1.out", yoyo: true, repeat: 1, overwrite: "auto" }
          );
        }
      }
    );
  }

  function formatTime(d) {
    return [
      String(d.getHours()).padStart(2, "0"),
      String(d.getMinutes()).padStart(2, "0")
    ].join(":");
  }

  // 初次渲染（用本地时区）
  const initial = formatTime(new Date());
  const stacks = renderInitial(initial);

  // 进场 stagger：cell + colon 渐入 + y 浮上
  gsap.from($time.querySelectorAll(".flip-cell, .flip-colon"), {
    opacity: 0, y: 14,
    duration: 0.55, ease: "power2.out",
    stagger: 0.07,
    delay: 0.95
  });

  // 每秒检查变化
  let last = initial;
  setInterval(() => {
    const t = formatTime(new Date());
    if (t === last) return;
    let i = 0;
    for (let k = 0; k < t.length; k++) {
      const ch = t[k];
      if (ch === ":") continue;
      if (ch !== last[k]) {
        flipToDigit(stacks[i], parseInt(ch, 10));
      }
      i++;
    }
    last = t;
  }, 1000);
})();
