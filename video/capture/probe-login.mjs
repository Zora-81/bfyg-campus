import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'] });
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 2 });

await page.goto('https://bfgzlt.cc.cd/', { waitUntil: 'domcontentloaded', timeout: 45000 });
await sleep(5000);
const enter = await page.$('#welcome-enter');
if (enter) { await enter.click(); await sleep(1500); }
await sleep(2000);

const dump = await page.evaluate(() => {
  const out = [];
  const login = document.querySelector('#monster-login, #login-card, .login-card');
  const area = login || document.body;
  const inputs = area.querySelectorAll('input');
  const buttons = area.querySelectorAll('button');
  inputs.forEach((el, i) => out.push({ tag: 'input', i, id: el.id, type: el.type, name: el.name, cls: el.className.slice(0,80), placeholder: el.placeholder }));
  buttons.forEach((el, i) => out.push({ tag: 'button', i, id: el.id, type: el.type, cls: el.className.slice(0,80), text: (el.textContent||'').trim().slice(0,30) }));
  return out;
});

fs.writeFileSync(path.resolve(here, 'probe-login.json'), JSON.stringify(dump, null, 2));
console.log(JSON.stringify(dump, null, 2));
await browser.close();
