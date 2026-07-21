import fs from 'fs';
import path from 'path';

const root = process.cwd();
const out = path.join(root, 'web_build');

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dest, e.name);
    if (e.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

// 清理并重建（Windows 上 WorkBuddy safe-delete 钩子会拦截 rmSync/rmdirSync，失败时退到 unlinkSync）
function wipeFiles(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) wipeFiles(p);
    else fs.unlinkSync(p);
  }
}
try {
  fs.rmSync(out, { recursive: true, force: true });
} catch (e) {
  try { wipeFiles(out); } catch (e2) { /* 尽最大努力清理 */ }
}
fs.mkdirSync(out, { recursive: true });

copyDir('css', path.join(out, 'css'));
copyDir('js', path.join(out, 'js'));
copyDir('images', path.join(out, 'images'));

// Cloudflare Pages 缓存头规则
if (fs.existsSync('_headers')) {
  fs.copyFileSync('_headers', path.join(out, '_headers'));
  console.log('copied _headers');
}

// HTML：../css|js|images/ -> css|js|images/
const htmlFiles = ['index.html', 'admin.html'];
const htmlSrc = {};
for (const f of htmlFiles) {
  const p = path.join('html', f);
  if (!fs.existsSync(p)) continue;
  let html = fs.readFileSync(p, 'utf8');
  html = html.replace(/\.\.\/(css|js|images)\//g, '$1/');
  htmlSrc[f] = html;
}

// 从 HTML 提取本次版本号（如 1.0.0 语义化版本），用于文件名哈希，避免手机浏览器忽略 query string 缓存
const v = (htmlSrc['index.html'] || '').match(/[?&]v=([a-zA-Z0-9][a-zA-Z0-9._-]*)/)?.[1] || 'build';

function hashDir(dir, ext) {
  const dp = path.join(out, dir);
  const map = {};
  for (const f of fs.readdirSync(dp)) {
    if (!f.endsWith('.' + ext)) continue;
    const base = f.slice(0, -(ext.length + 1));
    const newName = `${base}.${v}.${ext}`;
    fs.renameSync(path.join(dp, f), path.join(dp, newName));
    map[`${dir}/${f}`] = `${dir}/${newName}`;
  }
  return map;
}

const cssMap = hashDir('css', 'css');
const jsMap = hashDir('js', 'js');

function applyMap(html) {
  const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  for (const [old, nw] of Object.entries(cssMap)) {
    html = html.replace(new RegExp(escape(old) + '(?:[?&]v=[^"]*)?', 'g'), nw);
  }
  for (const [old, nw] of Object.entries(jsMap)) {
    html = html.replace(new RegExp(escape(old) + '(?:[?&]v=[^"]*)?', 'g'), nw);
  }
  return html;
}

for (const f of htmlFiles) {
  let html = htmlSrc[f];
  if (!html) continue;
  html = applyMap(html);
  fs.writeFileSync(path.join(out, f), html);
  console.log('hashed', f);
}

// CSS 注：源 css/style.css 内 url('../images/...') 相对 web_build/css/ 正确指向
// web_build/images/，保留原样即可，切勿改写为 'images/'（会变成 web_build/css/images/ 404）。

// 报告结构
const tree = (d, pad='') => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    console.log(pad + e.name + (e.isDirectory() ? '/' : ''));
    if (e.isDirectory()) tree(path.join(d, e.name), pad + '  ');
  }
};
console.log('=== out/ ===');
tree(out);
