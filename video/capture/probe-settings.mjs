// probe-settings.mjs — 打开设置面板，导出所有可见元素 bbox（供 S7/S8 页面空间动画定位）
import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(here, '../tour/public/textures/live');
fs.mkdirSync(OUT, { recursive: true });

const BASE = 'https://bfgzlt.cc.cd';
const VIEWPORT = { width: 1920, height: 1080, deviceScaleFactor: 2 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log('[probe-settings]', ...a);

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'] });
const page = await browser.newPage();
await page.setViewport(VIEWPORT);
page.on('requestfailed', (r) => log('reqfail', r.url().slice(0, 60), r.failure()?.errorText));

async function waitForIF(timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ready = await page.evaluate(() => typeof window.IF !== 'undefined' && typeof window.IF.signIn === 'function');
    if (ready) return true;
    await sleep(300);
  }
  return false;
}
async function evalClick(sel, label) {
  try {
    const clicked = await page.evaluate((s) => { const el = document.querySelector(s); if (!el) return false; el.click(); return true; }, sel);
    log(label, clicked ? 'clicked' : 'not found', sel);
    return clicked;
  } catch (e) { log(label, 'error', e.message); return false; }
}

try {
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await sleep(5000);
  const ifReady = await waitForIF();
  log('window.IF ready:', ifReady);
  if (!ifReady) throw new Error('window.IF not ready');
  const loginRes = await page.evaluate(async (u, p) => { try { const user = await window.IF.signIn(u, p); return { ok: true, id: user.id }; } catch (e) { return { ok: false, error: e.message }; } }, 'admin@baofeng.campus', 'wzy200812');
  log('IF.signIn:', JSON.stringify(loginRes));
  await sleep(3000);
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await sleep(6000);

  // open settings
  let ok = await evalClick('#btn-drawer-settings', 'open-settings');
  if (!ok) ok = await evalClick('.drawer-settings-btn', 'open-settings2');
  if (!ok) ok = await evalClick('.settings-btn', 'open-settings3');
  await sleep(2000);

  // dump full settings panel tree
  const dump = await page.evaluate(() => {
    const out = [];
    const all = document.querySelectorAll('*');
    for (const el of all) {
      const cls = (el.className && el.className.toString && el.className.toString()) || '';
      const id = el.id || '';
      const txt = (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 28);
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      // only elements inside the settings panel (right side) or settings-related
      const isSettings = /setting|背景|主题|外观|通知|账户|关于|壁纸|模糊|暗角|profile|account|about|appearance|theme|notification/.test(id + ' ' + cls + ' ' + txt);
      if (isSettings && r.x >= 600) {
        out.push({ tag: el.tagName.toLowerCase(), id, cls: cls.slice(0, 50), txt, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), cx: Math.round(r.x + r.width / 2), cy: Math.round(r.y + r.height / 2) });
      }
    }
    return out;
  });
  log('settings elements found:', dump.length);
  fs.writeFileSync(`${OUT}/settings-layout.json`, JSON.stringify(dump, null, 2));
  log('wrote settings-layout.json');

  // also capture a fresh settings-bg at this exact state for consistency
  await page.screenshot({ path: `${OUT}/settings-bg.png` });
  log('recaptured settings-bg.png');
} catch (e) {
  log('ERROR', e.message, e.stack);
} finally {
  await browser.close();
  log('done');
}
