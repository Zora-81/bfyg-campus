// 诊断：线上主 feed 评论计数是否为 0；抓取 /messages 两个请求的实际返回
const { chromium } = require('C:/Users/86150/.workbuddy/binaries/node/workspace/node_modules/playwright');

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({ bypassCSP: true });
  const page = await context.newPage();
  const errs = [];
  const msgReqs = [];
  page.on('pageerror', e => errs.push('PAGEERROR: ' + (e.stack || e.message).slice(0, 300)));
  page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE.error: ' + m.text().slice(0, 300)); });
  page.on('response', async (res) => {
    const url = res.url();
    if (url.includes('/api/database/records/messages') && url.includes('parent_id')) {
      try {
        const body = await res.text();
        let n = -1;
        try { n = JSON.parse(body).length; } catch (e) {}
        const isReply = url.includes('not.is.null') || url.includes("parent_id=not") || url.includes('neq');
        msgReqs.push({ url: url.slice(0, 200), status: res.status(), count: n, replyQuery: url.includes('parent_id') });
      } catch (e) {}
    }
  });

  try { await page.goto('https://bfgzlt.cc.cd/', { waitUntil: 'load', timeout: 60000 }); }
  catch (e) { console.log('goto failed:', e.message); }
  await page.waitForTimeout(15000);

  const r = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('.msg-interact-btn[data-act="comment"]'));
    return {
      version: window.__APP_VERSION,
      commentBtns: btns.length,
      counts: btns.map(b => (b.querySelector('.msg-interact-count') || {}).textContent).slice(0, 10),
      channelMsgs: window.channelMessages ? undefined : undefined,
    };
  });
  console.log('version        =', r.version);
  console.log('comment buttons=', r.commentBtns);
  console.log('counts         =', JSON.stringify(r.counts));
  console.log('--- message API responses ---');
  msgReqs.forEach(m => console.log(JSON.stringify(m)));
  console.log('--- errs (' + errs.length + ') ---');
  errs.slice(0, 8).forEach(e => console.log(e));
  await browser.close();
})();
