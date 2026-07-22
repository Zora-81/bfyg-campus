// capture-tour.mjs — 抓宝丰一高校园频道「功能导览」真实素材
// 复用 video/capture/node_modules/puppeteer（与本文件同目录可解析）
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
const log = (...a) => console.log('[tour-cap]', ...a);

const probe = { elements: [], shots: [] };

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

async function captureShot(name, opts = {}) {
  const p = `${OUT}/${name}.png`;
  await page.screenshot(opts.fullPage ? { path: p, fullPage: true } : { path: p });
  probe.shots.push(`${name}.png`);
  log(`captured ${name}.png`);
}

async function evalClick(sel, label) {
  try {
    const clicked = await page.evaluate((s) => {
      const el = document.querySelector(s);
      if (!el) return false;
      el.click();
      return true;
    }, sel);
    log(label, clicked ? 'clicked' : 'not found', sel);
    return clicked;
  } catch (e) { log(label, 'error', e.message); return false; }
}

async function dumpKeywords() {
  const list = await page.evaluate(() => {
    const KW = ['drawer', 'server', 'badge', 'campus', 'intro', '介绍', 'setting', '设置', 'support', '技术', '帮助', '反馈', 'about', '关于', 'theme', '背景', '外观'];
    const out = [];
    const all = document.querySelectorAll('*');
    for (const el of all) {
      const cls = (el.className && el.className.toString && el.className.toString()) || '';
      const txt = (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 28);
      const id = el.id || '';
      const tag = el.tagName.toLowerCase();
      const hit = KW.some((k) => (id + ' ' + cls + ' ' + txt).toLowerCase().includes(k.toLowerCase()));
      if (hit && (tag === 'button' || tag === 'a' || tag === 'div' || tag === 'img' || tag === 'li' || tag === 'span')) {
        const r = el.getBoundingClientRect();
        out.push({ tag, id, cls: cls.slice(0, 60), txt, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) });
      }
    }
    return out.slice(0, 120);
  });
  probe.elements.push(...list);
  return list;
}

try {
  // 联网自检
  try {
    await page.goto('https://example.com', { waitUntil: 'load', timeout: 15000 });
    log('connectivity OK:', await page.title());
  } catch (e) { log('connectivity FAIL:', e.message); }

  // 1. 登录页
  try { await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 45000 }); } catch (e) { log('goto site warn:', e.message); }
  await sleep(5000);
  await captureShot('login-full');

  const badgeSel = await page.$('.welcome-campus-img');
  if (badgeSel) { await badgeSel.screenshot({ path: `${OUT}/badge.png`, omitBackground: true }); probe.shots.push('badge.png'); log('captured badge.png'); }
  else log('login badge .welcome-campus-img NOT found');

  // 2. 用 SDK 直接登录（绕过表单验证码 UI）
  const ifReady = await waitForIF();
  log('window.IF ready:', ifReady);
  if (!ifReady) throw new Error('window.IF not ready');

  const loginRes = await page.evaluate(async (u, p) => {
    try {
      const user = await window.IF.signIn(u, p);
      return { ok: true, user: { id: user.id, email: user.email, nickname: user.nickname } };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }, 'admin@baofeng.campus', 'wzy200812');
  log('IF.signIn result:', JSON.stringify(loginRes));
  await sleep(3000);

  // 刷新让 app.js initAuth 读取会话
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await sleep(6000);

  // 3. 主界面
  const viewMain = await page.evaluate(() => {
    const el = document.querySelector('#view-main');
    return el ? el.getBoundingClientRect() : null;
  });
  log('view-main rect:', JSON.stringify(viewMain));
  await captureShot('main-ui');
  await captureShot('main-full', { fullPage: true });
  await dumpKeywords();

  // 4. 打开设置面板 (#btn-drawer-settings)
  let ok = await evalClick('#btn-drawer-settings', 'open-settings');
  if (!ok) ok = await evalClick('.drawer-settings-btn', 'open-settings2');
  if (!ok) ok = await evalClick('.settings-btn', 'open-settings3');
  await sleep(1500);
  await captureShot('settings-bg');

  // 5. 关闭设置，点校徽/校园入口（drawer-server-icon / drawer-server / drawer-header）
  await evalClick('#settings-close-btn', 'close-settings');
  await sleep(500);

  ok = await evalClick('.drawer-server-icon', 'open-campus');
  if (!ok) ok = await evalClick('.drawer-server', 'open-campus2');
  if (!ok) ok = await evalClick('.drawer-header', 'open-campus3');
  await sleep(1500);
  await captureShot('campus-intro');
  try { await captureShot('campus-intro-full', { fullPage: true }); } catch (e) {}

  // 6. 找技术支持/帮助入口（再点 drawer 里可能的按钮）
  await page.evaluate(() => {
    const close = document.querySelector('#settings-close-btn, .popup-close, .avatar-popup .close, .modal-close');
    if (close) close.click();
  });
  await sleep(500);
  const supportSel = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('button,a,div,span'));
    const el = all.find((e) => /技术|帮助|支持|客服|反馈|关于/.test((e.textContent || '').trim()));
    return el ? { tag: el.tagName, id: el.id, cls: el.className.toString().slice(0, 60), txt: (el.textContent || '').trim().slice(0, 20) } : null;
  });
  log('support candidate:', JSON.stringify(supportSel));
  if (supportSel && supportSel.cls) {
    await evalClick(`.${supportSel.cls.split(/\s+/).join('.')}`, 'open-support');
    await sleep(1500);
    await captureShot('tech-support');
  }

  fs.writeFileSync(`${OUT}/probe.json`, JSON.stringify(probe, null, 2));
  log('wrote probe.json');
} catch (e) {
  log('ERROR', e.message, e.stack);
  fs.writeFileSync(`${OUT}/probe.json`, JSON.stringify(probe, null, 2));
} finally {
  await browser.close();
  log('done. shots:', probe.shots.join(', '));
}
