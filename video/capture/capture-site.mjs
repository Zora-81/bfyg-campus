// capture-site.mjs (v2, resilient) — 抓宝丰一高校园频道真实页面素材
import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(here, '../promo/public/textures/live');
fs.mkdirSync(OUT, { recursive: true });

const BASE = 'https://bfgzlt.cc.cd';
const VIEWPORT = { width: 1920, height: 1080, deviceScaleFactor: 2 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log('[capture]', ...a);

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'] });
const page = await browser.newPage();
await page.setViewport(VIEWPORT);
page.on('requestfailed', (r) => log('reqfail', r.url().slice(0, 60), r.failure()?.errorText));
const log2 = (...a) => log(...a);

try {
  // 联网能力自检
  try {
    await page.goto('https://example.com', { waitUntil: 'load', timeout: 15000 });
    log('connectivity OK:', await page.title());
  } catch (e) {
    log('connectivity FAIL:', e.message);
  }

  // 1. 欢迎屏（片头主视觉）
  try {
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 45000 });
  } catch (e) { log('goto site warn:', e.message); }
  await sleep(5000);
  const html = await page.content();
  log('site html length:', html.length, 'title:', await page.title());
  await page.screenshot({ path: `${OUT}/login-full.png` });
  log('captured login-full.png');

  const badge = await page.$('.welcome-campus-img');
  if (badge) { await badge.screenshot({ path: `${OUT}/badge.png`, omitBackground: true }); log('captured badge.png'); }
  else log('badge not found');

  // 2. 尝试登录抓聊天页
  const enter = await page.$('#welcome-enter');
  if (enter) { await enter.click(); await sleep(1400); log('clicked welcome-enter'); }
  const filled = await page.evaluate(() => {
    const inputs = document.querySelectorAll('#login-form input');
    if (inputs.length < 2) return false;
    const set = (el, v) => { const d = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value'); d.set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
    set(inputs[0], 'admin@baofeng.campus'); set(inputs[1], 'wzy200812'); return true;
  });
  log('login filled:', filled);
  const submit = await page.$('#btn-login-submit');
  if (submit) { await submit.click(); }
  await sleep(6000);
  await page.screenshot({ path: `${OUT}/chat-view.png` });
  log('captured chat-view.png');
  try { await page.screenshot({ path: `${OUT}/chat-full.png`, fullPage: true }); log('captured chat-full.png'); } catch (e) { log('chat-full fail', e.message); }
  const probe = await page.evaluate(() => {
    const pick = (s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { s, w: Math.round(r.width), h: Math.round(r.height), t: (e.textContent || '').slice(0, 30) }; };
    return [pick('#view-main'), pick('.channel-list'), pick('.server-list'), pick('#channel-list'), pick('.chat-messages'), pick('#chat-messages'), pick('.message-list'), pick('.sidebar'), pick('#welcome-title')].filter(Boolean);
  });
  log('probes:', JSON.stringify(probe));
} catch (e) {
  log('ERROR', e.message, e.stack);
} finally {
  await browser.close();
  log('done');
}
