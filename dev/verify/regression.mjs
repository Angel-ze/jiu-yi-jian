// 就一件 · 回归验收（10 项，可重复运行，跨平台）
//
//   node dev/verify/regression.mjs <url> [index.html]
//
//   本地：node dev/verify/regression.mjs "file://$PWD/index.html" index.html
//   线上：node dev/verify/regression.mjs https://angel-ze.github.io/jiu-yi-jian/
//
// 检查：无 JS 报错 / 所有 $("id") 都存在 / 搭子手艺层挂载 / 行为链因果单向 /
//       天气档位只升不降 / 阴天下限 / 尊重「减少动态效果」/ 台词语气 / 源码体积
// 依赖：本机装一个 Chrome（或用 $CHROME 指定）。零 npm 依赖。
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';

import { existsSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

/* 找一个能用的 Chrome：优先环境变量 $CHROME，其次按各平台常见位置探测。
   —— 这样别人 clone 下来不用改任何路径就能跑。 */
const CHROME = process.env.CHROME || [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
].find((p) => existsSync(p));
if (!CHROME) {
  console.error('找不到 Chrome。装一个，或显式指定：\n  CHROME=/path/to/chrome node ' + process.argv[1] + ' ...');
  process.exit(3);
}
const PROFILE = mkdtempSync(join(tmpdir(), 'jiuyijian-'));
process.on('exit', () => { try { rmSync(PROFILE, { recursive: true, force: true }); } catch {} });

const PORT = Number(process.env.PORT || 9350);
const TARGET = process.argv[2];
const FILE = process.argv[3] || null; // 传了就对源码做静态检查
if (!TARGET) { console.error('用法: node regression.mjs <url> [index.html]'); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, 'about:blank'], { stdio: 'ignore' });
let ws, id = 0; const pending = new Map(); const errs = [];
const send = (m, p = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async (e) => { const r = await send('Runtime.evaluate', { expression: `(function(){${e}})()`, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'eval'); return r.result.value; };
const results = [];
const check = (name, ok, detail) => { results.push({ name, ok: !!ok, detail }); };

(async () => {
  for (let i = 0; i < 60; i++) { try { const r = await fetch(`http://127.0.0.1:${PORT}/json/version`); if (r.ok) break; } catch {} await sleep(300); }
  const t = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find((x) => x.type === 'page');
  ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id) { const p = pending.get(m.id); if (p) { pending.delete(m.id); p.res(m.result); } return; }
    if (m.method === 'Runtime.exceptionThrown') errs.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errs.push('console.error: ' + m.params.args.map((a) => a.value ?? a.description).join(' '));
  };
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await send('Page.navigate', { url: TARGET });
  await sleep(3000);

  /* 1. 所有 $("id") 引用的元素都真的存在 */
  const ids = await ev(`
    var src=''; Array.prototype.forEach.call(document.scripts,function(s){ if((s.textContent||'').indexOf('paintPets')>=0) src+=s.textContent; });
    var seen={}, missing=[], m, re=/\\$\\("([A-Za-z0-9_-]+)"\\)/g;
    while((m=re.exec(src))){ var k=m[1]; if(seen[k]) continue; seen[k]=1; if(!document.getElementById(k)) missing.push(k); }
    return {total:Object.keys(seen).length, missing:missing};`);
  check('所有 $("id") 引用都存在', ids.missing.length === 0, `${ids.total} 个 id，缺失 ${ids.missing.length}${ids.missing.length ? ': ' + ids.missing.join(',') : ''}`);

  /* 2. 手艺层挂载 */
  const craft = await ev(`
    var s=document.querySelector('#petNow svg');
    var eyes=s.querySelectorAll('g.eye').length, hi=s.querySelectorAll('circle.hi').length;
    return {filter:s.getAttribute('filter'), eyes:eyes, hi:hi,
      hasHiInEveryEye: Array.prototype.every.call(s.querySelectorAll('g.eye'),function(g){return !!g.querySelector('circle.hi')})};`);
  check('搭子挂了统一光影层', craft.filter === 'url(#petCraft)', `filter=${craft.filter}`);
  check('每只眼睛都有高光', craft.eyes > 0 && craft.hi === craft.eyes && craft.hasHiInEveryEye, `${craft.eyes} 只眼 / ${craft.hi} 个高光`);

  /* 3. 行为链：她的动作 → 天气变好，且只升不降 */
  const snap = () => ev(`var q=function(s){return document.querySelector(s)};
    var st=null; try{st=JSON.parse(localStorage.getItem('jiuyijian.v1'))}catch(e){}
    return {e: st&&st.jar?Math.round(st.jar.energy*100)/100:null, lv:+q('#jar').getAttribute('data-lv'),
      clouds:q('#jarWeather').children.length};`);
  const a0 = await snap();
  await ev(`document.querySelector('#inboxBtn').click(); return 1;`); await sleep(500);
  await ev(`document.querySelector('#dump').value='交季度小结\\n给妈打电话'; return 1;`);
  await ev(`document.querySelector('#addBtn').click(); return 1;`); await sleep(400);
  await ev(`document.querySelector('#closeInbox').click(); return 1;`); await sleep(400);
  const a1 = await snap();
  await ev(`document.querySelector('#startBtn').click(); return 1;`); await sleep(900);
  const a2 = await snap();
  await ev(`document.querySelector('#doneBtn').click(); return 1;`); await sleep(900);
  const a3 = await snap();
  const chain = [a0, a1, a2, a3];
  check('打开 App 即 +1', a0.e > 0, `energy=${a0.e}`);
  check('她的动作只能让天气变好（单调递增）', chain.every((s, i) => i === 0 || s.e > chain[i - 1].e), chain.map((s) => s.e).join(' → '));
  check('天气档位只升不降', chain.every((s, i) => i === 0 || s.lv >= chain[i - 1].lv), chain.map((s) => s.lv).join(' → '));
  check('下限是阴天：只有云，没有雨/雷/雪', a0.clouds === 2 && a0.lv === 0, `首屏 ${a0.clouds} 个天气元素, lv=${a0.lv}`);

  /* 4. 系统说"减少动态效果"时，真的不动 */
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await sleep(600);
  const rm = await ev(`
    var names=['#petNow','#petNow svg','#petNow .eye','#petNow .glance'];
    var left=names.filter(function(s){var e=document.querySelector(s); return e && getComputedStyle(e).animationName!=='none';});
    return {stillAnimating:left};`);
  check('尊重"减少动态效果"', rm.stillAnimating.length === 0, rm.stillAnimating.length ? '仍在动: ' + rm.stillAnimating.join(',') : '全部已停');

  /* 5. 源码级：台词里没有要求 / 失望 */
  if (FILE) {
    const src = readFileSync(FILE, 'utf8');
    const block = src.slice(src.indexOf('var PET_LINES'), src.indexOf('function pickOne'));
    const bad = ['失望', '没用', '又没', '怎么还', '你应该', '必须', '快点', '别拖', '又忘了', '扣分', '惩罚']
      .filter((w) => block.indexOf(w) >= 0);
    const lines = (block.match(/"/g) || []).length / 2;
    check('台词只有陪伴，没有要求或失望', bad.length === 0, bad.length ? '出现: ' + bad.join(' ') : `检查了约 ${Math.round(lines)} 句`);
  }

  const realErrs = errs.filter((e) => !/manifest|ERR_FAILED|CORS/i.test(e));
  check('页面无 JS 报错', realErrs.length === 0, realErrs.length ? realErrs.join(' | ') : '无');

  console.log('\n=== 就一件 · 回归验收 ===');
  console.log('目标:', TARGET, '\n');
  let pass = true;
  for (const r of results) { if (!r.ok) pass = false; console.log(`${r.ok ? '✅' : '❌'} ${r.name} — ${r.detail}`); }
  if (errs.length && realErrs.length === 0) console.log(`\n（忽略 ${errs.length} 条 file:// 下的 manifest/CORS 提示）`);
  console.log(pass ? '\n✅ 全部通过' : '\n❌ 有未通过项');
  ws.close(); chrome.kill(); process.exit(pass ? 0 : 2);
})().catch((e) => { console.error('脚本异常:', e.message); try { chrome.kill(); } catch {} process.exit(1); });
