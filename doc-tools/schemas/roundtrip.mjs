import { chromium } from 'playwright'; import fs from 'fs';
if (process.argv.length !== 3) { console.error('usage: node roundtrip.mjs <excalidraw_dir>'); process.exit(1); }
const dir = process.argv[2].replace(/\/?$/, '/');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.excalidraw.md'));
const b = await chromium.launch(); const p = await b.newPage();
await p.setContent('<html><body></body></html>'); await p.addScriptTag({ path: 'bundle3.js' });
let bad = 0;
for (const f of files) {
  const txt = fs.readFileSync(dir + f, 'utf8');
  const m = txt.match(/```json\n([\s\S]*?)\n```/);
  try {
    const d = JSON.parse(m[1]);
    const ids = new Set(d.elements.map(e => e.id));
    const dangling = d.elements.filter(e => (e.containerId && !ids.has(e.containerId)) || (e.startBinding && !ids.has(e.startBinding.elementId)) || (e.endBinding && !ids.has(e.endBinding.elementId))).length;
    if (dangling) { bad++; console.log('DANGLING', f, dangling); }
    if (f.includes('omnissiah-architecture')) {
      const png = await p.evaluate(e => window.render(e), d.elements);
      fs.writeFileSync('roundtrip-arch.png', Buffer.from(png, 'base64'));
    }
  } catch (e) { bad++; console.log('ERR', f, String(e).slice(0, 120)); }
}
console.log(files.length, 'files,', bad, 'problems');
await b.close();
