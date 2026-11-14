// E2E: headless Chrome, Gemini-vastaukset mockattu. node e2e.js
const puppeteer = require('puppeteer-core'); const http = require('http'); const fs = require('fs'); const path = require('path');
const dist = path.join(__dirname, '../dist');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const srv = http.createServer((q, r) => { let f = q.url.split('?')[0]; if (f === '/') f = '/index.html'; const p = path.join(dist, f); if (!fs.existsSync(p)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(r); }).listen(8766);
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };

const QS = [
  { tyyppi: 'monivalinta', kysymys: 'Minä vuonna Ranskan vallankumous alkoi?', vaihtoehdot: ['1789', '1689', '1889', '1917'], oikea_vastaus: '1789', selitys: 'Vallankumous alkoi 1789.', vaikeus: 'helppo' },
  { tyyppi: 'monivalinta', kysymys: 'Mikä Bastilji oli?', vaihtoehdot: ['Vankila', 'Kirkko', 'Linna', 'Tori'], oikea_vastaus: 'Vankila', selitys: 'Kansa valtasi Bastiljin vankilan.' },
  { tyyppi: 'tosi_epatosi', kysymys: 'Ludvig XVI menetti valtansa.', totta: true, selitys: 'Kuningas menetti valtansa vallankumouksessa.' },
  { tyyppi: 'tosi_epatosi', kysymys: 'Napoleon oli Bastiljin vanginvartija.', totta: false, selitys: 'Napoleonista tuli keisari.' },
  { tyyppi: 'aukko', kysymys: 'Iskulause oli vapaus, ___ ja veljeys.', oikea_vastaus: 'tasa-arvo', hyvaksytyt: ['tasaarvo'], selitys: 'Vapaus, tasa-arvo, veljeys.' },
  { tyyppi: 'aukko', kysymys: 'Bastilji vallattiin 14. ___.', oikea_vastaus: 'heinäkuuta', selitys: '14.7.1789.' },
  { tyyppi: 'yhdista', kysymys: 'Yhdistä henkilö tai paikka ja kuvaus.', parit: [{ vasen: 'Bastilji', oikea: 'vankila' }, { vasen: 'Napoleon', oikea: 'keisari' }, { vasen: 'Ludvig XVI', oikea: 'kuningas' }], selitys: 'Hyvä!' },
  { tyyppi: 'monivalinta', kysymys: 'Kuka nousi keisariksi?', vaihtoehdot: ['Napoleon Bonaparte', 'Ludvig XVI', 'Robespierre'], oikea_vastaus: 'Napoleon Bonaparte', selitys: 'Napoleon.' },
  { tyyppi: 'tosi_epatosi', kysymys: 'Vallankumous tapahtui Ranskassa.', totta: true, selitys: 'Kyllä.' },
  { tyyppi: 'monivalinta', kysymys: 'Mitä kansa valtasi?', vaihtoehdot: ['Bastiljin', 'Versaillesin', 'Louvren'], oikea_vastaus: 'Bastiljin', selitys: 'Bastiljin vankilan.' },
  { tyyppi: 'aukko', kysymys: 'Vallankumous alkoi vuonna ___.', oikea_vastaus: '1789', selitys: '1789.' },
  { tyyppi: 'tosi_epatosi', kysymys: 'Iskulauseessa oli sana veljeys.', totta: true, selitys: 'Kyllä.' }
];
const full = { luettavuus: { ok: true }, lahdeteksti: 'Vuonna 1789 Ranskassa puhkesi vallankumous. Kansa valtasi Bastiljin vankilan 14. heinäkuuta.', tiivistelma: '• Vallankumous alkoi 1789.\n• Bastilji vallattiin 14.7.\n• Iskulause: vapaus, tasa-arvo, veljeys.', avainkasitteet: [{ kasite: 'Bastilji', selitys: 'Pariisin vankila' }] };
const b1 = JSON.stringify({ kysymykset: QS.slice(0, 8) }); const b1cut = b1.slice(0, b1.lastIndexOf('"vaihtoehdot"') + 20); // 8. kysymys katkeaa
const wrapRaw = (text, fr, usage) => JSON.stringify({ candidates: [{ content: { parts: [{ text }], role: 'model' }, finishReason: fr }], usageMetadata: usage });
const more = { kysymykset: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(i => ({ tyyppi: 'tosi_epatosi', kysymys: 'Lisäväite numero ' + i + ' on totta.', totta: i % 2 === 0, selitys: 'Testi.' })) };
const wrap = obj => JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }], role: 'model' }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 1500, candidatesTokenCount: 2000, totalTokenCount: 3500 } });

(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  const pg = await b.newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  pg.on('dialog', d => d.accept());
  await pg.setViewport({ width: 400, height: 860, deviceScaleFactor: 2 });
  let mock = []; const reqs = [];
  await pg.setRequestInterception(true);
  pg.on('request', r => {
    const u = r.url();
    if (!u.includes('generativelanguage.googleapis.com')) return r.continue();
    reqs.push({ url: u, method: r.method(), headers: r.headers(), body: r.postData() });
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
    if (r.method() === 'OPTIONS') return r.respond({ status: 204, headers: cors });
    if (r.method() === 'GET') return r.respond({ status: 200, headers: cors, contentType: 'application/json', body: '{"name":"models/gemini-3.8-flash"}' });
    const m = mock.shift() || { status: 500, body: '{}' };
    r.respond({ status: m.status, headers: cors, contentType: 'application/json', body: m.body });
  });
  const shot = n => pg.screenshot({ path: path.join(__dirname, 'shot-' + n + '.png') });
  const txt = s => pg.$eval(s, e => e.innerText);
  const visible = s => pg.$eval(s, e => !e.classList.contains('hidden') && e.offsetParent !== null).catch(() => false);
  const view = () => pg.$eval('.view.on', e => e.id);

  await pg.goto('http://localhost:8766/'); await sleep(600);
  ok(await view() === 'v-players', 'ensimmäisellä kerralla valitaan pelaaja');
  ok((await txt('#plist')).includes('Lauri') && (await txt('#plist')).includes('Aino'), 'Lauri ja Aino valmiina');
  await shot('players');
  await pg.click('[data-pid=lauri]'); await sleep(300);
  ok(await view() === 'v-home' && await visible('#keyWarn'), 'koti + avain puuttuu -ilmoitus');
  await shot('home-empty');

  // Ilman avainta
  await pg.click('#v-home [data-go=create]'); await sleep(200);
  await pg.type('#cSubject', 'Historia'); await pg.type('#cName', 'Ranskan vallankumous');
  const gal = await pg.$('#galIn'); await gal.uploadFile(path.join(__dirname, 'page1.jpg'), path.join(__dirname, 'blurry.jpg'));
  await pg.waitForFunction(() => document.querySelectorAll('#thumbs .thumb').length === 2, { timeout: 10000 });
  ok(await pg.$$eval('#thumbs .blur', e => e.length) === 1, 'epätarkka kuva tunnistettu (1/2)');
  ok(await visible('#blurWarn'), 'epätarkkuusvaroitus näkyy');
  ok(await pg.$eval('.info', e => e.textContent.includes('Gemini')), 'tietosuojahuomautus näkyy');
  await shot('create');
  await pg.click('[data-rm="1"]'); await sleep(200);
  await pg.click('#cGo'); await sleep(400);
  ok(await view() === 'v-create' && (await txt('#cErr')).includes('avain puuttuu'), 'virhe: avain puuttuu');
  ok(await pg.$eval('#cSubject', e => e.value) === 'Historia', 'lomakkeen tiedot säilyvät virheen jälkeen');

  // Avain asetuksiin + testaus
  await pg.click('nav [data-go=settings]'); await sleep(200);
  await pg.type('#sKey', 'TEST-KEY-123'); await pg.click('#sSave'); await pg.click('#sTest'); await sleep(500);
  ok((await txt('#sMsg')).includes('Avain toimii'), 'avaimen testaus (GET models)');
  const g0 = reqs.find(r => r.method === 'GET'); ok(g0 && g0.headers['x-goog-api-key'] === 'TEST-KEY-123' && !g0.url.includes('TEST-KEY'), 'avain otsakkeessa, ei URL:ssa');
  ok(await pg.evaluate(() => JSON.parse(localStorage.getItem('koekertaus.settings')).apiKey) === 'TEST-KEY-123', 'avain localStoragessa');

  // Kiintiö täynnä
  await pg.click('nav [data-go=home]'); await sleep(200); await pg.click('#v-home [data-go=create]'); await sleep(200);
  await pg.type('#cSubject', 'Historia'); await pg.type('#cName', 'Ranskan vallankumous');
  await (await pg.$('#camIn')).uploadFile(path.join(__dirname, 'page1.jpg'));
  await pg.waitForFunction(() => document.querySelectorAll('#thumbs .thumb').length === 1);
  mock.push({ status: 429, body: JSON.stringify({ error: { code: 429, message: 'You exceeded your current quota', status: 'RESOURCE_EXHAUSTED' } }) });
  await pg.click('#cGo'); await pg.waitForFunction(() => !document.querySelector('#cErr').classList.contains('hidden'), { timeout: 10000 });
  ok((await txt('#cErr')).includes('kiintiö'), 'virhe: kiintiö ylittyi');
  // Sumea kuva -vastaus
  mock.push({ status: 200, body: wrap({ luettavuus: { ok: false, ongelma: 'teksti on sumeaa' }, lahdeteksti: '', tiivistelma: '', kysymykset: [] }) });
  await pg.click('#cGo'); await sleep(800);
  ok((await txt('#cErr')).includes('sumeaa'), 'virhe: kuvista ei saatu selvää');
  await shot('error');
  // Onnistuu (ensin skeemavirhe → varapolku)
  mock.push({ status: 400, body: JSON.stringify({ error: { code: 400, message: 'Invalid JSON payload received. Unknown name "responseJsonSchema"', status: 'INVALID_ARGUMENT' } }) });
  mock.push({ status: 200, body: wrap(full) });
  mock.push({ status: 200, body: wrapRaw(b1cut, 'MAX_TOKENS', { promptTokenCount: 900, thoughtsTokenCount: 60000, candidatesTokenCount: 5536, totalTokenCount: 66436 }) });
  mock.push({ status: 200, body: wrapRaw('', 'MAX_TOKENS', { thoughtsTokenCount: 65536 }) });
  mock.push({ status: 200, body: wrap({ kysymykset: QS.slice(7) }) });
  const before = reqs.length;
  await pg.click('#cGo'); await pg.waitForFunction(() => document.querySelector('.view.on').id === 'v-exam', { timeout: 15000 });
  const posts = reqs.slice(before).filter(r => r.method === 'POST');
  const body = JSON.parse(posts[0].body), body2 = JSON.parse(posts[1].body);
  ok(posts.length === 5, 'kutsut: luku (+varapolku) ja kysymyserät uusintoineen: ' + posts.length);
  const qb = posts.slice(2).map(p => JSON.parse(p.body));
  ok(qb.every(b => !b.contents[0].parts.some(p => p.inline_data)), 'kysymyserät ilman kuvia');
  ok(qb[0].contents[0].parts[0].text.includes('täsmälleen 10') && qb[2].contents[0].parts[0].text.includes('täsmälleen 5'), 'katkennut erä uusitaan pienempänä (10 → 5)');
  ok(body.generationConfig.maxOutputTokens === 65536 && body.generationConfig.thinkingConfig.thinkingLevel === 'low', 'maxOutputTokens 65536, thinkingLevel low');
  ok(body.contents[0].parts.some(p => p.inline_data && p.inline_data.mime_type === 'image/jpeg'), 'kuva lähetetään inline_data-kenttänä');
  const imgB64 = body.contents[0].parts.find(p => p.inline_data).inline_data.data;
  ok(imgB64.length * 0.75 < 600e3, 'kuva pienennetty (' + Math.round(imgB64.length * 0.75 / 1024) + ' kt)');
  ok(body.generationConfig.responseJsonSchema && body2.generationConfig.responseSchema, 'responseJsonSchema → varapolku responseSchema');
  ok(posts[0].url.includes('gemini-3.8-flash:generateContent'), 'malli gemini-3.8-flash');
  ok(body.contents[0].parts[0].text.includes('7. luokan'), 'Laurin luokka promptissa');
  console.log('   stats:', await txt('#eStats'), JSON.stringify(errs)); ok((await txt('#eStats')).startsWith('12 kysymystä'), 'koe tallennettu, 12 kysymystä');
  await shot('exam');
  await pg.click('nav [data-go=settings]'); await sleep(200); await pg.click('#sDbg'); await sleep(100);
  const dbg = await txt('#sDbgOut');
  ok(dbg.includes('MAX_TOKENS') && dbg.includes('thoughtsTokenCount') && dbg.includes('"salvaged":true') && !dbg.includes('TEST-KEY'), 'vianetsintä näyttää finishReasonin ja usageMetadatan, ei avainta');
  await shot('debug-panel');
  await pg.click('nav [data-go=home]'); await sleep(200); await pg.click('#myExams [data-exam]'); await sleep(300);
  await pg.click('#eSummary'); await sleep(200);
  ok((await txt('#sText')).includes('Bastilji vallattiin') && (await txt('#sTerms')).includes('Pariisin vankila'), 'tiivistelmä ja käsitteet');
  await shot('summary');
  await pg.click('#sBack'); await sleep(200);

  // Pelikierros: 1. väärin, muut oikein
  async function play(wrongIdx) {
    for (let k = 0; ; k++) {
      const q = await pg.evaluate(() => { const G = window.__kk.state.game; return G.round[G.i]; });
      const wrong = wrongIdx.includes(k);
      if (q.type === 'mc') await pg.click(`#gArea [data-i="${wrong ? (q.correct + 1) % q.options.length : q.correct}"]`);
      else if (q.type === 'tf') await pg.click(`#gArea [data-v="${(q.answer !== wrong) ? 1 : 0}"]`);
      else if (q.type === 'fill') { await pg.type('#fillIn', wrong ? 'väärä' : q.answer.toUpperCase()); await pg.click('#fillGo'); }
      else if (q.type === 'match') {
        const order = q.pairs.map(p => q.rightOrder.indexOf(p.right)); if (wrong) order.reverse();
        for (let i = 0; i < q.pairs.length; i++) { await pg.click(`#gArea [data-l="${i}"]`); await pg.click(`#gArea [data-r="${order[i]}"]`); }
        if (k === 0) await shot('game-match');
        await pg.click('#mGo');
      }
      await sleep(150);
      if (k === 0) await shot('game-feedback');
      if (!(await pg.$('#gNext'))) { console.log('   ei gNext, kysymys:', JSON.stringify(q), await txt('#gArea')); await shot('debug'); console.log('   errs:', JSON.stringify(errs)); }
      const hasNext = await pg.$eval('#gNext', e => e.textContent.includes('Seuraava'));
      await pg.click('#gNext'); await sleep(150);
      if (!hasNext) break;
    }
  }
  await pg.click('#ePlay'); await sleep(200);
  ok(await view() === 'v-game', 'peli alkoi');
  await shot('game');
  await play([0]);
  ok(await view() === 'v-result', 'tulosnäkymä');
  const rs = await txt('#rStats'); console.log('   tulos:', rs.replace(/\n/g, ' / '));
  ok(rs.startsWith('9 / 10'), '9/10 oikein');
  ok(await pg.$eval('#rStars', e => e.textContent) === '⭐⭐⭐', '3 tähteä (90 %)');
  ok((await txt('#rReview')).includes('(1)'), 'Kertaa väärät (1)');
  await shot('result');
  await pg.click('#rReview'); await sleep(200);
  ok(await pg.evaluate(() => window.__kk.state.game.round.length) === 1, 'kertauskierroksessa 1 kysymys');
  await play([]);
  ok(await view() === 'v-result' && (await txt('#rStats')).startsWith('1 / 1'), 'kertaus oikein');
  await pg.click('#rHome'); await sleep(300);
  ok((await txt('#eReview')).includes('(1)'), 'kertauksessa yhä 1 kunnes opittu (ei vielä erääntynyt)');
  const prog = await pg.evaluate(() => window.__kk.state.prog);
  ok(prog.stars === 3 && prog.plays === 2 && Object.keys(prog.srs).length === 10, 'edistyminen tallessa (tähdet 3, pelattu 2, 10 nähty)');

  // Lisää kysymyksiä
  mock.push({ status: 200, body: wrap(more) }); const b3 = reqs.length;
  await pg.$eval('#eMore', e => e.click()); await pg.waitForFunction(() => document.querySelector('.view.on').id === 'v-exam' && document.querySelector('#eStats').innerText.startsWith('22'), { timeout: 10000 }).catch(async e => { console.log('   more:', await txt('#mErr'), await view(), JSON.stringify(errs.slice(-3))); });
  const mb = JSON.parse(reqs.slice(b3).find(r => r.method === 'POST').body);
  ok(!mb.contents[0].parts.some(p => p.inline_data) && mb.contents[0].parts[0].text.includes('Bastiljin vankilan'), 'lisäkysymykset tehdään tallennetusta tekstistä (ei kuvia)');
  ok((await txt('#eStats')).startsWith('22 kysymystä'), 'kysymyksiä nyt 22');

  // Pelaajan vaihto
  await pg.click('#playerChip'); await sleep(200); await pg.click('[data-pid=aino]'); await sleep(400);
  ok(await visible('#otherTitle') && (await txt('#otherExams')).includes('Ranskan vallankumous') && (await txt('#otherExams')).includes('☆☆☆'), 'Ainolla erilliset pisteet');
  ok((await txt('#pcName')) === 'Aino', 'pelaaja vaihtui');
  await pg.click('#playerChip'); await sleep(200); await pg.click('[data-pid=lauri]'); await sleep(400);
  ok((await txt('#myExams')).includes('⭐⭐⭐') && /Taso \d/.test(await txt('#pcLvl')), 'Laurin tähdet ja taso');
  await shot('home');

  // Kaikki erät epäonnistuvat → teksti säilyy, voi yrittää uudelleen
  await pg.click('#v-home [data-go=create]'); await sleep(200);
  await pg.type('#cSubject', 'Biologia'); await pg.type('#cName', 'Solut');
  await (await pg.$('#camIn')).uploadFile(path.join(__dirname, 'page1.jpg'));
  await pg.waitForFunction(() => document.querySelectorAll('#thumbs .thumb').length === 1);
  await pg.$$eval('#cCount .chip', cs => cs.find(c => c.dataset.v === '15').click());
  mock.push({ status: 200, body: wrap(full) }); for (let i = 0; i < 4; i++) mock.push({ status: 503, body: '{"error":{"code":503,"message":"The model is overloaded.","status":"UNAVAILABLE"}}' });
  await pg.$eval('#cGo', e => e.click()); await pg.waitForFunction(() => document.querySelector('.view.on').id === 'v-exam' && !document.querySelector('#mErr').classList.contains('hidden'), { timeout: 15000 });
  const me = await txt('#mErr'); console.log('   ', me);
  ok(/häiriö/.test(me) && /Tee 10 lisää/.test(me) && !/vähemmillä kuvilla/.test(me), 'oikea syy + ohje, ei "vähemmillä kuvilla"');
  ok(await pg.$eval('#ePlay', e => e.disabled) && (await txt('#eStats')).startsWith('0 kysymystä'), 'koe ja teksti tallessa, pelaaminen estetty kunnes kysymyksiä on');
  mock.push({ status: 200, body: wrap(more) });
  await pg.$eval('#eMore', e => e.click()); await pg.waitForFunction(() => document.querySelector('.view.on').id === 'v-exam' && document.querySelector('#eStats').innerText.startsWith('10'), { timeout: 10000 });
  ok(true, 'uusi yritys "Tee 10 lisää" onnistui ilman kuvia');
  await shot('partial');
  await pg.click('nav [data-go=home]'); await sleep(300);

  // Offline: sovellus latautuu välimuistista
  await pg.evaluate(() => navigator.serviceWorker.ready); await sleep(500);
  await pg.setOfflineMode(true); await pg.reload(); await sleep(800);
  ok((await txt('#myExams')).includes('Ranskan vallankumous'), 'offline: sovellus ja kokeet toimivat');
  await pg.$$eval('#myExams [data-exam]', c => c[c.length - 1].click()); await sleep(300);
  await pg.$eval('#eMore', e => e.click()); await sleep(400);
  ok((await txt('#mErr')).includes('verkkoyhteyttä'), 'offline: selkeä virhe uusia kysymyksiä tehtäessä');
  await pg.setOfflineMode(false);
  await pg.click('nav [data-go=help]'); await sleep(200);
  ok((await txt('#v-help')).includes('aistudio.google.com/apikey'), 'ohje sisältää avainlinkin');
  await shot('help');

  errs.splice(0, errs.length, ...errs.filter(e => !/Failed to load resource: the server responded with a status of (429|400|503)/.test(e) && !/ERR_INTERNET_DISCONNECTED/.test(e))); ok(errs.length === 0, 'ei JS-virheitä' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await b.close(); srv.close();
  console.log(fails ? `\n${fails} epäonnistui` : '\nKaikki e2e-tarkistukset läpi'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
