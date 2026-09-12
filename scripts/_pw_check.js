const { chromium } = require('C:/Users/86150/.workbuddy/binaries/node/workspace/node_modules/playwright');

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({ bypassCSP: true });
  const page = await context.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR: ' + (e.stack || e.message)));
  page.on('console', m => { if (m.type()==='error') errs.push('CONSOLE.error: ' + m.text()); });
  await page.addInitScript(() => {
    window.__errs = [];
    window.addEventListener('error', e => { window.__errs.push('ERR: ' + (e.error && e.error.stack || e.message)); });
    window.addEventListener('unhandledrejection', e => { window.__errs.push('REJECT: ' + (e.reason && (e.reason.stack || e.reason.message) || e.reason)); });
  });

  try { await page.goto('https://bfgzlt.cc.cd/?v=1.3.8', { waitUntil: 'networkidle', timeout: 60000 }); }
  catch (e) { console.log('goto failed:', e.message); }
  await page.waitForTimeout(5000);

  const r = await page.evaluate(() => ({
    href: location.href,
    APP_START: typeof window.__APP_START !== 'undefined' ? window.__APP_START : 'MISSING',
    APP_BEFORE_OPENIMG: typeof window.__APP_BEFORE_OPENIMG !== 'undefined' ? window.__APP_BEFORE_OPENIMG : 'MISSING',
    openImg: typeof window.openImg,
    openUserProfile: typeof window.openUserProfile,
    _carousel: typeof window._carousel,
    captured: window.__errs || []
  }));
  console.log('location.href            =', r.href);
  console.log('window.__APP_START       =', r.APP_START);
  console.log('window.__APP_BEFORE_OPENIMG =', r.APP_BEFORE_OPENIMG);
  console.log('window.openImg           =', r.openImg);
  console.log('window.openUserProfile   =', r.openUserProfile);
  console.log('window._carousel         =', r._carousel);
  console.log('--- captured (' + r.captured.length + ') ---');
  r.captured.slice(0,30).forEach(e=>console.log(e));
  console.log('--- errs (' + errs.length + ') ---');
  errs.slice(0,30).forEach(e=>console.log(e));
  await browser.close();
})();
