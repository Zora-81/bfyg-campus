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

  try { await page.goto('http://localhost:8080/', { waitUntil: 'load', timeout: 60000 }); }
  catch (e) { console.log('goto failed:', e.message); }
  await page.waitForTimeout(6000);

  const r = await page.evaluate(() => ({
    href: location.href,
    APP_START: typeof window.__APP_START !== 'undefined' ? window.__APP_START : 'MISSING',
    APP_BEFORE_OPENIMG: typeof window.__APP_BEFORE_OPENIMG !== 'undefined' ? window.__APP_BEFORE_OPENIMG : 'MISSING',
    APP_ERROR: typeof window.__APP_ERROR !== 'undefined' ? window.__APP_ERROR : 'MISSING',
    openImg: typeof window.openImg,
    openUserProfile: typeof window.openUserProfile,
    _carousel: typeof window._carousel,
    captured: window.__errs || []
  }));
  console.log('location.href            =', r.href);
  console.log('window.__APP_START       =', r.APP_START);
  console.log('window.__APP_BEFORE_OPENIMG =', r.APP_BEFORE_OPENIMG);
  console.log('window.__APP_ERROR       =', (typeof r.APP_ERROR === 'string' && r.APP_ERROR.length > 600) ? r.APP_ERROR.slice(0,600) + ' ...' : r.APP_ERROR);
  console.log('window.openImg           =', r.openImg);
  console.log('window.openUserProfile   =', r.openUserProfile);
  console.log('window._carousel         =', r._carousel);
  console.log('--- captured (' + r.captured.length + ') ---');
  r.captured.slice(0,30).forEach(e=>console.log(e));
  console.log('--- errs (' + errs.length + ') ---');
  errs.slice(0,30).forEach(e=>console.log(e));

  // 功能测试：真实调用 openUserProfile，确认资料卡 DOM 真的被插入
  const f = await page.evaluate(() => {
    try {
      window.openUserProfile('test-user-123');
      const modal = document.querySelector('.user-card-modal');
      const name = modal ? (modal.querySelector('.profile-name')||{}).textContent : null;
      return { ok: true, modalExists: !!modal, name: name };
    } catch (e) { return { ok: false, err: e.message }; }
  });
  console.log('--- functional openUserProfile ---');
  console.log(JSON.stringify(f));
  await browser.close();
})();
