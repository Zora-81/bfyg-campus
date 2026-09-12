// 拆信动画 mock：口袋 + slot 高度揭示 + 纸上滑（node scripts/_mailbox_mock.js）
const { chromium } = require('C:/Users/86150/.workbuddy/binaries/node/workspace/node_modules/playwright');
const path = require('path');

const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
body{background:#0f1226;display:flex;justify-content:center;padding-top:40px;font-family:system-ui;}
.mailbox-letter{width:360px;position:relative;}
.mailbox-extract{position:relative;padding-top:44px;}
.mailbox-mouth{position:absolute;top:-6px;left:50%;transform:translateX(-50%);width:200px;height:70px;z-index:5;pointer-events:none;filter:drop-shadow(0 3px 6px rgba(0,0,0,.35));}
.mailbox-mouth-art{width:100%;height:100%;display:block;}
.mailbox-paper-slot{position:relative;z-index:1;overflow:hidden;border-radius:3px 6px 5px 4px;}
.mailbox-letter-paper{position:relative;display:flex;flex-direction:column;max-height:460px;padding:18px 20px 14px;background-color:#f5edd8;background-image:linear-gradient(180deg,#faf4e4 0%,#f5edd8 55%,#efe4c8 100%);color:#3a3226;border-radius:3px 6px 5px 4px;box-shadow:0 1px 0 rgba(255,255,255,.5) inset,0 18px 44px rgba(0,0,0,.5),0 2px 6px rgba(0,0,0,.3);overflow:hidden;}
.mailbox-stamp{position:absolute;top:8px;right:10px;transform:rotate(4deg);filter:drop-shadow(1px 2px 2px rgba(60,40,10,.28));}
.mailbox-stamp-inner{display:flex;flex-direction:column;align-items:center;padding:4px 4px 3px;background:radial-gradient(circle at 50% 0%,transparent 2.2px,#fffdf4 2.4px) top left/8px 8px,radial-gradient(circle at 50% 0%,transparent 2.2px,#fffdf4 2.4px) top right/8px 8px,radial-gradient(circle at 50% 100%,transparent 2.2px,#fffdf4 2.4px) bottom left/8px 8px,radial-gradient(circle at 50% 100%,transparent 2.2px,#fffdf4 2.4px) bottom right/8px 8px,#fffdf4;background-repeat:no-repeat;}
.mailbox-stamp-art{width:40px;height:28px;display:block;}
.mailbox-stamp-val{font-size:.52rem;font-weight:800;color:#8a6d3b;letter-spacing:.1em;}
.mailbox-letter-head{display:flex;align-items:center;justify-content:space-between;padding:0 64px 6px 0;border-bottom:2px solid rgba(140,110,60,.25);}
.mailbox-letter-title{font-family:'KaiTi',serif;font-weight:700;font-size:1.02rem;color:#4a3d28;letter-spacing:.14em;}
.mailbox-salutation{position:relative;align-self:flex-start;margin:10px 0 12px;font-size:1.05rem;letter-spacing:.1em;color:#4a4030;font-family:'KaiTi',serif;padding:0 2px 6px;}
.mailbox-salutation::after{content:'';position:absolute;left:0;right:0;bottom:0;height:5px;background:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='5' viewBox='0 0 120 5'%3E%3Cpath d='M0 2.6 Q10 0.8 20 2.8 T40 2.4 T60 3 T80 2.3 T100 2.9 T120 2.5' fill='none' stroke='%235d7ba8' stroke-width='1.4' opacity='.8'/%3E%3C/svg%3E") repeat-x left center/120px 5px;}
.notify-list{padding:2px 2px 4px;}
.notify-item{position:relative;display:block;margin:0;padding:3px 6px 8px;}
.notify-item .notify-title{display:block;font-size:.86rem;color:#3a3226;line-height:1.45;padding-left:10px;font-weight:700;}
.notify-item .notify-preview{display:block;font-size:.78rem;color:#7a6a4c;line-height:1.5;padding-left:10px;}
.mailbox-signoff{margin:10px 4px 0;text-align:right;font-size:.95rem;color:#5a4c36;font-family:'KaiTi',serif;}
.mailbox-date{margin:2px 4px 0;text-align:right;font-size:.78rem;color:#8a7a58;}
.mb2-wax{transition:opacity .3s ease .25s;}
.mailbox-open .mb2-wax{opacity:0;}
</style></head><body>
<div class="mailbox-letter mailbox-open"><div class="mailbox-extract">
<div class="mailbox-mouth"><svg viewBox="0 0 160 70" class="mailbox-mouth-art">
<defs>
<linearGradient id="mb2-paper" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#efe2c4"/><stop offset="100%" stop-color="#ddcda6"/></linearGradient>
<linearGradient id="mb2-flap" x1="0" y1="1" x2="0" y2="0"><stop offset="0%" stop-color="#d8c5a0"/><stop offset="100%" stop-color="#c9b48c"/></linearGradient>
<radialGradient id="mb2-wax" cx="40%" cy="35%" r="70%"><stop offset="0%" stop-color="#e87a50"/><stop offset="50%" stop-color="#d45a32"/><stop offset="100%" stop-color="#8a2815"/></radialGradient>
</defs>
<path d="M12 38 L80 6 L148 38 L148 44 L80 13 L12 44 Z" fill="url(#mb2-flap)" stroke="rgba(150,124,86,.45)" stroke-width="1"/>
<rect x="6" y="36" width="148" height="32" rx="3" fill="url(#mb2-paper)" stroke="rgba(150,124,86,.5)" stroke-width="1"/>
<path d="M8 38 L80 56 L152 38" fill="none" stroke="rgba(165,138,98,.5)" stroke-width="1.1"/>
<ellipse class="mb2-wax" cx="80" cy="54" rx="7" ry="6.2" fill="url(#mb2-wax)" stroke="rgba(120,40,15,.5)" stroke-width=".8"/>
<circle class="mb2-wax" cx="80" cy="54" r="3.6" fill="none" stroke="rgba(255,220,190,.45)" stroke-width="1"/>
</svg></div>
<div class="mailbox-paper-slot" style="height:210px;"><div class="mailbox-letter-paper" style="transform:translateY(-96px);">
<div class="mailbox-stamp"><div class="mailbox-stamp-inner"><svg viewBox="0 0 100 72" class="mailbox-stamp-art"><circle cx="50" cy="30" r="14" fill="#22d3ee"/><circle cx="44" cy="27" r="3.2" fill="#0f1226"/><circle cx="56" cy="27" r="3.2" fill="#0f1226"/><path d="M42 34 Q50 40 58 34" fill="none" stroke="#0f1226" stroke-width="2.4" stroke-linecap="round"/></svg><span class="mailbox-stamp-val">8分</span></div></div>
<div class="mailbox-letter-head"><span class="mailbox-letter-title">信 箱</span><button class="notify-mark-all" style="color:#a0502c;font-size:.78rem;background:none;border:none;">全部已读</button></div>
<p class="mailbox-salutation">亲爱的同学：</p>
<div class="notify-list">
<div class="notify-item"><div class="notify-title">啵宝 评论了你的内容</div><div class="notify-preview">哇塞，又有一条新评论啦～本宝开心…</div></div>
</div>
<p class="mailbox-signoff">—— 啵宝，愿你今天也开心 (๑•̀ㅂ•́)و✧</p>
<p class="mailbox-date">2026年9月12日</p>
</div></div>
</div></div>
</body></html>`;

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 760 } })).newPage();
  await page.setContent(html);
  await page.waitForTimeout(400);
  await page.locator('.mailbox-letter').screenshot({ path: path.join(__dirname, '..', '_mailbox_extract.png') });
  await browser.close();
  console.log('saved _mailbox_extract.png');
})();
