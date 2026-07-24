import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(here, '../tour/public/textures/live');
fs.mkdirSync(OUT, { recursive: true });

const BASE = 'https://bfgzlt.cc.cd';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'] });
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 2 });

async function waitForIF(timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ready = await page.evaluate(() => typeof window.IF !== 'undefined' && typeof window.IF.signIn === 'function');
    if (ready) return true;
    await sleep(300);
  }
  return false;
}

try {
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await sleep(5000);
  await waitForIF();
  const loginRes = await page.evaluate(async () => {
    try { const u = await window.IF.signIn('admin@baofeng.campus', 'wzy200812'); return { ok: true, id: u.id }; }
    catch (e) { return { ok: false, error: e.message }; }
  });
  console.log('login', loginRes);
  await sleep(3000);
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await sleep(6000);

  // Dump full layout (all elements with id/class/text and rect)
  const layout = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('*'));
    return all
      .map((el) => {
        const r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) return null;
        const cls = (el.className && el.className.toString && el.className.toString()) || '';
        const txt = (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40);
        return {
          tag: el.tagName.toLowerCase(),
          id: el.id || '',
          cls: cls.slice(0, 120),
          txt,
          x: Math.round(r.x),
          y: Math.round(r.y),
          w: Math.round(r.width),
          h: Math.round(r.height),
        };
      })
      .filter(Boolean)
      .filter((e) => e.x + e.w > 0 && e.y + e.h > 0 && e.x < 1920 && e.y < 1080)
      .slice(0, 400);
  });

  fs.writeFileSync(path.resolve(OUT, 'live-layout.json'), JSON.stringify(layout, null, 2));
  console.log('wrote live-layout.json', layout.length, 'elements');
} catch (e) {
  console.error('ERROR', e.message);
} finally {
  await browser.close();
}
