// Selain ilman createImageBitmapia (vanha Samsung Internet tms.): kuva käsitellään <img>-varapolulla
const puppeteer = require('puppeteer-core'); const http = require('http'); const fs = require('fs'); const path = require('path');
const dist = path.join(__dirname, '../dist');
const srv = http.createServer((q, r) => { let f = q.url.split('?')[0]; if (f === '/') f = '/index.html'; const p = path.join(dist, f); if (!fs.existsSync(p)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': f.endsWith('.html') ? 'text/html; charset=utf-8' : f.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' }); fs.createReadStream(p).pipe(r); }).listen(8767);
(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--js-flags=--max-old-space-size=128'] });
  const pg = await b.newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.evaluateOnNewDocument(() => { delete window.createImageBitmap; window.createImageBitmap = undefined; });
  await pg.setViewport({ width: 360, height: 740 });
  await pg.goto('http://localhost:8767/'); await new Promise(r => setTimeout(r, 600));
  await pg.click('[data-pid=aino]'); await new Promise(r => setTimeout(r, 300));
  await pg.click('#v-home [data-go=create]'); await new Promise(r => setTimeout(r, 200));
  await (await pg.$('#galIn')).uploadFile(path.join(__dirname, 'big_rot6.jpg'), path.join(__dirname, 'page1.jpg'));
  await pg.waitForFunction(() => document.querySelectorAll('#thumbs .thumb').length === 2 && document.querySelector('#cBusy').classList.contains('hidden'), { timeout: 30000 });
  const dims = await pg.$$eval('#thumbs img', is => Promise.all(is.map(i => i.decode().then(() => i.naturalWidth + 'x' + i.naturalHeight))));
  const ok = dims[0] === '1200x1600' && dims[1] === '1200x1600' && !errs.length;
  console.log((ok ? 'ok   ' : 'FAIL ') + 'varapolku ilman createImageBitmapia: ' + dims.join(', ') + (errs.length ? ' virheet: ' + errs.join(' | ') : ''));
  await b.close(); srv.close(); process.exit(ok ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
