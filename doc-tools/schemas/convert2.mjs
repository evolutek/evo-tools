import { chromium } from 'playwright'; import fs from 'fs';
const only = process.argv.slice(2);
const diags = JSON.parse(fs.readFileSync('diagrams.json', 'utf8')).filter(d => !only.length || only.includes(d.name));
const prev = fs.existsSync('results2.json') ? JSON.parse(fs.readFileSync('results2.json', 'utf8')) : [];
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1600, height: 1000 } });
p.on('pageerror', e => console.error('pageerror', e.message));
await p.setContent('<html><body></body></html>'); await p.addScriptTag({ path: 'bundle3.js' });
await p.evaluate(() => window.warmup());
fs.mkdirSync('prev2', { recursive: true });
for (const d of diags) {
  try {
    const r = await p.evaluate(s => window.convertMermaid2(s), d.conv);
    const png = await p.evaluate(e => window.render(e), r.elements);
    fs.writeFileSync(`prev2/${d.name}.png`, Buffer.from(png, 'base64'));
    const rec = { name: d.name, elements: r.elements, files: {} };
    const i = prev.findIndex(x => x.name === d.name);
    if (i >= 0) prev[i] = rec; else prev.push(rec);
    console.log('OK ', d.name, r.elements.length);
  } catch (e) { console.log('ERR', d.name, String(e).slice(0, 300)); }
}
fs.writeFileSync('results2.json', JSON.stringify(prev));
await b.close();
