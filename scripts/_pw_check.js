const { chromium } = require('C:/Users/86150/.workbuddy/binaries/node/workspace/node_modules/playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=path.join(process.cwd(),'web_build');
const MIME={'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.mp3':'audio/mpeg','.woff2':'font/woff2','.jpg':'image/jpeg','.webp':'image/webp','.json':'application/json'};
const srv=http.createServer((req,res)=>{let u=decodeURIComponent(req.url.split('?')[0]);if(u==='/')u='/index.html';const f=path.join(ROOT,u);if(!f.startsWith(ROOT)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){res.writeHead(404);return res.end('nf');}res.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream'});fs.createReadStream(f).pipe(res);});
(async()=>{
  await new Promise(r=>srv.listen(8099,r));
  const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const ctx=await browser.newContext({viewport:{width:1920,height:1001}});
  const page=await ctx.newPage();
  const errs=[]; page.on('pageerror',e=>errs.push(e.message));
  page.on('console',m=>{if(m.type()==='error'&&!/401|Insforge|Failed to load/.test(m.text()))errs.push(m.text());});
  await page.goto('http://localhost:8099/',{waitUntil:'load',timeout:60000});
  await page.waitForTimeout(2500);
  await page.evaluate(()=>{
    const lg=document.getElementById('view-login'); if(lg) lg.classList.remove('active');
    const mn=document.getElementById('view-main'); if(mn) mn.classList.add('active');
    document.body.classList.add('main-active');
  });
  await page.waitForTimeout(2500);
  const r=await page.evaluate(()=>{
    const dots=document.getElementById('main-dots');
    const c=dots.getContext('2d'); const d=c.getImageData(0,0,dots.width,dots.height).data;
    let lit=0; for(let i=3;i<d.length;i+=4) if(d[i]>8) lit++;
    return { litPixels:lit, canvas:dots.width+'x'+dots.height };
  });
  console.log(JSON.stringify(r));
  console.log('errors:', errs.length?errs.slice(0,3):'none');
  await page.screenshot({path:'_after.png'});
  await browser.close(); srv.close();
})();
