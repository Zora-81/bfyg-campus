const { chromium } = require('C:/Users/86150/.workbuddy/binaries/node/workspace/node_modules/playwright');

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({ bypassCSP: true });
  const page = await context.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR: ' + (e.stack || e.message)));
  page.on('console', m => { if (m.type()==='error') errs.push('CONSOLE.error: ' + m.text()); });

  try { await page.goto('https://bfgzlt.cc.cd/?v=1.4.0', { waitUntil: 'load', timeout: 60000 }); }
  catch (e) { console.log('goto failed:', e.message); }
  await page.waitForTimeout(7000);

  const r = await page.evaluate(() => ({
    href: location.href,
    openImg: typeof window.openImg,
    openUserProfile: typeof window.openUserProfile,
    _carousel: typeof window._carousel
  }));
  console.log('location.href          =', r.href);
  console.log('window.openImg         =', r.openImg);
  console.log('window.openUserProfile =', r.openUserProfile);
  console.log('window._carousel       =', r._carousel);

  const f = await page.evaluate(() => {
    try {
      window.openUserProfile('prod-test-user');
      const modal = document.querySelector('.user-card-modal');
      const name = modal ? (modal.querySelector('.profile-name')||{}).textContent : null;
      return { ok: true, modalExists: !!modal, name: name };
    } catch (e) { return { ok: false, err: e.message }; }
  });
  console.log('--- functional openUserProfile (prod) ---');
  console.log(JSON.stringify(f));
  console.log('--- errs (' + errs.length + ') ---');
  errs.slice(0,10).forEach(e=>console.log(e));
  await browser.close();
})();
