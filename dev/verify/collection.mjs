// 就一件 ·「就一点」全链路验收（11 项，跨平台）
//
//   node dev/verify/collection.mjs [url] [截图输出目录]
//
//   本地：node dev/verify/collection.mjs
//   线上：node dev/verify/collection.mjs https://angel-ze.github.io/jiu-yi-jian/
//
// 检查：存档只有一个货币 / 做完一件 +1 / 没做完不给点但天气照常 / 完成屏与记录页显示 /
//       第 2 点解锁第一间茅草屋 / 老存档 7:1 折算不丢东西 / 老字段被丢弃 / 无报错
// 依赖：本机装一个 Chrome（或用 $CHROME 指定）。零 npm 依赖。
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

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

const PORT = Number(process.env.PORT || 9390);
/* 默认打仓库根目录的 index.html（从 dev/verify/ 往上数三层） */
const DEFAULT_HTML = resolve(process.argv[1], '../../../index.html');
const FILE = process.argv[2] || pathToFileURL(DEFAULT_HTML).href;
const OUT = resolve(process.argv[3] || join(tmpdir(), 'jiuyijian-shots'));
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, 'about:blank'], { stdio: 'ignore' });
let ws, id = 0; const pending = new Map(); const errs = [];
const send = (m, p = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async (e) => { const r = await send('Runtime.evaluate', { expression: `(function(){${e}})()`, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'eval'); return r.result.value; };
const shot = async (n) => { const s = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(`${OUT}/${n}.png`, Buffer.from(s.data, 'base64')); };
const results = [];
const ck = (name, ok, detail) => results.push({ name, ok: !!ok, detail });

const SAVE = () => ev(`var s=JSON.parse(localStorage.getItem('jiuyijian.v1')||'{}'); return s.jar||{};`);
// 走一遍：倒一件事 → 开始 → 做完
const doOne = async () => {
  await ev(`document.querySelector('#inboxBtn').click(); return 1;`); await sleep(400);
  await ev(`document.querySelector('#dump').value='把桌上的杯子拿到厨房'; return 1;`);
  await ev(`document.querySelector('#addBtn').click(); return 1;`); await sleep(350);
  await ev(`document.querySelector('#closeInbox').click(); return 1;`); await sleep(350);
  await ev(`document.querySelector('#startBtn').click(); return 1;`); await sleep(700);
  await ev(`document.querySelector('#doneBtn').click(); return 1;`); await sleep(700);
};

(async () => {
  for (let i = 0; i < 60; i++) { try { const r = await fetch(`http://127.0.0.1:${PORT}/json/version`); if (r.ok) break; } catch {} await sleep(300); }
  const t = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find((x) => x.type === 'page');
  ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id) { const p = pending.get(m.id); if (p) { pending.delete(m.id); p.res(m.result); } return; }
    if (m.method === 'Runtime.exceptionThrown') errs.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text); };
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await send('Page.navigate', { url: FILE });
  await sleep(2200);

  /* ---- 1. 干净存档：先清空 ---- */
  await send('Page.navigate', { url: 'about:blank' }); await sleep(300);
  await send('Page.navigate', { url: FILE }); await sleep(1600);
  await ev(`localStorage.removeItem('jiuyijian.v1'); return 1;`);
  await send('Page.navigate', { url: FILE }); await sleep(1800);

  const j0 = await SAVE();
  ck('干净存档里就有 dots 字段', typeof j0.dots === 'number', `dots=${j0.dots}`);
  ck('存档里只有一个货币（没有第二累加器 total）', !('total' in j0),
     '存档字段: ' + Object.keys(j0).join(','));

  /* ---- 2. 做完一件 → 就一点 +1 ---- */
  await doOne();
  const j1 = await SAVE();
  ck('做完一件事，获得 1 点「就一点」', j1.dots === 1, `dots: ${j0.dots} → ${j1.dots}`);
  const dotText = await ev(`return document.querySelector('#doneDot') ? document.querySelector('#doneDot').textContent : '(缺元素)';`);
  ck('完成屏上出现了它的名字', /就一点/.test(dotText) && /\+1/.test(dotText), `完成屏文字 = "${dotText}"`);
  await shot('dots-1-完成屏');

  /* ---- 3. 再做一件 → dots=2，且第 2 点解锁第一间茅草屋 ---- */
  await ev(`document.querySelector('#againBtn').click(); return 1;`); await sleep(400);
  await doOne();
  const j2 = await SAVE();
  const folk = await ev(`return document.querySelectorAll('#jarFolk i').length;`);
  ck('第二点就解锁了第一间茅草屋（阶梯 1→2）', j2.dots === 2 && folk >= 1, `dots=${j2.dots}, 房子=${folk}`);

  /* ---- 4. 别的动作不给就一点（倒事情/开始/卡住只动天气）---- */
  const before = (await SAVE()).dots;
  await ev(`document.querySelector('#inboxBtn').click(); return 1;`); await sleep(350);
  await ev(`document.querySelector('#dump').value='给妈打电话'; return 1;`);
  await ev(`document.querySelector('#addBtn').click(); return 1;`); await sleep(350);
  await ev(`document.querySelector('#closeInbox').click(); return 1;`); await sleep(300);
  await ev(`document.querySelector('#startBtn').click(); return 1;`); await sleep(600);
  await ev(`document.querySelector('#endBtn').click(); return 1;`); await sleep(600);   // 结束这次（没做完）
  const after = (await SAVE()).dots;
  const energy = (await SAVE()).energy;
  ck('没做完就不给就一点（只有"做完了"才算）', after === before, `dots 保持 ${after}`);
  ck('但那一下仍然让天气变好了（动作照样算数）', energy > 0, `天气能量=${Math.round(energy)}`);

  /* ---- 5. 记录页显示总数 ---- */
  await ev(`document.querySelector('#logBtn').click(); return 1;`); await sleep(700);
  const logTxt = await ev(`var e=document.querySelector('.log-dots'); return e ? e.textContent.replace(/\\s+/g,' ') : '(没有这一块)';`);
  ck('记录页能看到攒下的就一点', /就一点/.test(logTxt), logTxt.slice(0, 60));
  await shot('dots-2-记录页');

  /* ---- 6. 老存档迁移：只有 total、没有 dots ---- */
  await send('Page.navigate', { url: 'about:blank' }); await sleep(300);
  await send('Page.navigate', { url: FILE }); await sleep(1500);
  await ev(`localStorage.setItem('jiuyijian.v1', JSON.stringify({jar:{energy:40,total:280,seen:99999,lastAt:Date.now()},stats:{opens:1,done:0},pet:{species:'cat'}})); return 1;`);
  await send('Page.navigate', { url: FILE }); await sleep(1800);
  const jm = await SAVE();
  const folkM = await ev(`return document.querySelectorAll('#jarFolk i').length;`);
  const buddyM = await ev(`return document.querySelectorAll('#jarBuddies .pet, #jarBuddies2 .pet').length;`);
  /* 40 点 → 茅草屋在 2/8/13/23/35 共 5 间 → 三合一：1 间木屋 + 2 间茅草屋 = 3 间房 */
  ck('老存档（280 分）折算成 dots 且进度一点没少', jm.dots === 40 && folkM === 3 && buddyM === 4,
     `280 分 → ${jm.dots} 点；5 间茅草屋按三合一成 ${folkM} 间房（1 木屋 + 2 茅草屋）；住户 ${buddyM} 只`);
  ck('迁移之后老字段 total 被丢掉（不会一直留着）', !('total' in jm),
     '迁移后存档字段: ' + Object.keys(jm).join(','));

  const realErrs = errs.filter((e) => !/manifest|ERR_FAILED|CORS/i.test(e));
  ck('页面无 JS 报错', realErrs.length === 0, realErrs.length ? realErrs.join(' | ') : '无');

  console.log('\n=== 「就一点」验收 ===\n');
  let pass = true;
  for (const r of results) { if (!r.ok) pass = false; console.log(`${r.ok ? '✅' : '❌'} ${r.name} — ${r.detail}`); }
  console.log(pass ? '\n✅ 全部通过' : '\n❌ 有未通过项');
  ws.close(); chrome.kill(); process.exit(pass ? 0 : 2);
})().catch((e) => { console.error('异常:', e.message); try { chrome.kill(); } catch {} process.exit(1); });
