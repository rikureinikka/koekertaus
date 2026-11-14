// Yksikkötestit: node test/test.js
const KK = require('../src/core.js'); const assert = require('assert');
let n = 0, fail = 0; function t(name, fn) { n++; try { fn(); console.log('ok   ' + name); } catch (e) { fail++; console.log('FAIL ' + name + '\n     ' + e.message); } }
function rng(seed) { return function () { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; }

const raw = [
  { tyyppi: 'monivalinta', kysymys: 'Milloin Ranskan vallankumous alkoi?', vaihtoehdot: ['1789', '1689', '1889', '1776'], oikea_vastaus: '1789', selitys: 'Bastilji vallattiin 1789.' },
  { tyyppi: 'tosi_epatosi', kysymys: 'Ludvig XVI oli Ranskan kuningas.', totta: true, selitys: 'Kyllä.' },
  { tyyppi: 'aukko', kysymys: 'Vallankumouksen iskulause oli vapaus, veljeys ja ___.', oikea_vastaus: 'tasa-arvo', hyvaksytyt: ['tasaarvo'], selitys: '' },
  { tyyppi: 'yhdista', kysymys: 'Yhdistä', parit: [{ vasen: 'Bastilji', oikea: 'vankila' }, { vasen: 'Napoleon', oikea: 'keisari' }, { vasen: 'Giljotiini', oikea: 'teloitusväline' }], selitys: '' },
  { tyyppi: 'monivalinta', kysymys: 'Rikki', vaihtoehdot: [], oikea_vastaus: 'b' },
  { tyyppi: 'outo', kysymys: 'x' },
  { tyyppi: 'tosi_epatosi', kysymys: 'Ludvig XVI oli Ranskan kuningas.', totta: true }
];

t('normalisointi suodattaa virheelliset ja kaksoiskappaleet', () => {
  const qs = KK.normalizeQuestions(raw);
  assert.strictEqual(qs.length, 4);
  assert.deepStrictEqual(qs.map(q => q.type), ['mc', 'tf', 'fill', 'match']);
  assert.strictEqual(qs[0].correct, 0);
});
t('monivalinta: oikea vastaus puuttuu listasta → lisätään', () => {
  const q = KK.normalizeQuestion({ tyyppi: 'monivalinta', kysymys: 'K?', vaihtoehdot: ['a', 'b'], oikea_vastaus: 'c' });
  assert.strictEqual(q.options[q.correct], 'c');
});
t('aukko ilman ___ saa aukon', () => { const q = KK.normalizeQuestion({ tyyppi: 'aukko', kysymys: 'Pääkaupunki on', oikea_vastaus: 'Pariisi' }); assert.ok(q.q.includes('___')); });
t('tosi/epätosi merkkijonona', () => { assert.strictEqual(KK.normalizeQuestion({ tyyppi: 'tosi_epatosi', kysymys: 'x', totta: 'Epätosi' }).answer, false); });

const qs = KK.normalizeQuestions(raw);
t('tarkistus: mc, tf', () => { assert.ok(KK.check(qs[0], 0)); assert.ok(!KK.check(qs[0], 1)); assert.ok(KK.check(qs[1], true)); assert.ok(!KK.check(qs[1], false)); });
t('tarkistus: aukko sallii kirjoitusvirheen ja vaihtoehdot', () => {
  assert.ok(KK.check(qs[2], 'Tasa-arvo')); assert.ok(KK.check(qs[2], 'tasa arvo')); assert.ok(KK.check(qs[2], 'tasaarvo')); assert.ok(KK.check(qs[2], 'tasa-arco'));
  assert.ok(!KK.check(qs[2], 'vapaus')); assert.ok(!KK.check(qs[2], ''));
  const y = KK.normalizeQuestion({ tyyppi: 'aukko', kysymys: 'Vuonna ___', oikea_vastaus: '1789' });
  assert.ok(KK.check(y, 'vuonna 1789')); assert.ok(!KK.check(y, '1788'));
  const short = KK.normalizeQuestion({ tyyppi: 'aukko', kysymys: '___', oikea_vastaus: 'Rooma' });
  assert.ok(KK.check(short, 'roma')); assert.ok(!KK.check(short, 'Ruotsi'));
});
t('tarkistus: yhdistä', () => {
  assert.ok(KK.check(qs[3], { Bastilji: 'vankila', Napoleon: 'keisari', Giljotiini: 'teloitusväline' }));
  assert.ok(!KK.check(qs[3], { Bastilji: 'keisari', Napoleon: 'vankila', Giljotiini: 'teloitusväline' }));
  assert.ok(!KK.check(qs[3], { Bastilji: 'vankila' }));
});
t('pisteet: perus, putki, aika, vaikeus', () => {
  assert.strictEqual(KK.scoreAnswer({ correct: false, streak: 3 }), 0);
  assert.strictEqual(KK.scoreAnswer({ correct: true, streak: 0, difficulty: 'helppo' }), 100);
  assert.strictEqual(KK.scoreAnswer({ correct: true, streak: 2, difficulty: 'helppo' }), 140);
  assert.strictEqual(KK.scoreAnswer({ correct: true, streak: 99, difficulty: 'helppo' }), 200);
  assert.strictEqual(KK.scoreAnswer({ correct: true, streak: 0, timeLeft: 15, timeLimit: 30, difficulty: 'helppo' }), 125);
  assert.strictEqual(KK.scoreAnswer({ correct: true, streak: 0, difficulty: 'haastava' }), 150);
});
t('tähdet ja tasot', () => {
  assert.deepStrictEqual([0.4, 0.5, 0.75, 0.9, 1].map(KK.starsFor), [0, 1, 2, 3, 3]);
  assert.strictEqual(KK.levelFor(0).level, 1); assert.strictEqual(KK.levelFor(249).level, 1); assert.strictEqual(KK.levelFor(250).level, 2);
  assert.strictEqual(KK.levelFor(750).level, 3); const L = KK.levelFor(1000); assert.strictEqual(L.level, 3); assert.strictEqual(L.xpInto, 250); assert.strictEqual(L.xpNeeded, 750);
});
t('kertaus: väärä → laatikko 1 heti, oikeat siirtävät eteenpäin', () => {
  const now = 1e12; let s = KK.srsUpdate(null, false, now);
  assert.strictEqual(s.box, 1); assert.strictEqual(s.due, now); assert.strictEqual(s.wrong, 1);
  s = KK.srsUpdate(s, true, now); assert.strictEqual(s.box, 2); assert.strictEqual(s.due, now + 864e5);
  s = KK.srsUpdate(s, false, now); assert.strictEqual(s.box, 1);
  for (let i = 0; i < 10; i++) s = KK.srsUpdate(s, true, now); assert.strictEqual(s.box, 5);
});
t('kertausjono: vain väärin menneet, erääntyneet ensin, opitut pois', () => {
  const now = 1e12, srs = {};
  srs[qs[0].id] = { box: 1, due: now - 1, wrong: 1 };
  srs[qs[1].id] = { box: 2, due: now + 1e6, wrong: 1 };
  srs[qs[2].id] = { box: 3, due: now, wrong: 0 }; // ei koskaan väärin
  srs[qs[3].id] = { box: 4, due: now - 5, wrong: 2 }; // opittu
  assert.deepStrictEqual(KK.reviewQueue(qs, srs, now).map(q => q.id), [qs[0].id]);
  srs[qs[0].id].due = now + 10; // ei erääntyneitä → kaikki keskeneräiset
  assert.deepStrictEqual(KK.reviewQueue(qs, srs, now).map(q => q.id), [qs[0].id, qs[1].id]);
  assert.strictEqual(KK.reviewCount(qs, {}, now), 0);
});
t('kierros: koko, sekoitus säilyttää oikean vastauksen, uudet ensin', () => {
  const many = []; for (let i = 0; i < 25; i++) many.push(KK.normalizeQuestion({ id: 'q' + i, tyyppi: 'monivalinta', kysymys: 'K' + i, vaihtoehdot: ['a' + i, 'b' + i, 'c' + i], oikea_vastaus: 'b' + i }));
  const srs = {}; for (let i = 0; i < 15; i++) srs['q' + i] = { box: 5, due: 0, wrong: 0 };
  const r = KK.buildRound(many, srs, { size: 10, rnd: rng(7) });
  assert.strictEqual(r.length, 10); assert.ok(r.every(q => !srs[q.id]), 'näkemättömät ensin');
  r.forEach(q => assert.strictEqual(q.options[q.correct], 'b' + q.id.slice(1)));
  assert.strictEqual(KK.buildRound(many, srs, { mode: 'all' }).length, 25);
  const m = KK.buildRound([qs[3]], {}, { mode: 'all', rnd: rng(3) })[0]; assert.strictEqual(m.rightOrder.length, 3);
});
t('pelikierros: pisteet, putki ja yhteenveto', () => {
  const r = KK.buildRound(qs, {}, { mode: 'all', rnd: rng(1) }); const g = KK.newGame(r, { difficulty: 'helppo' });
  const right = q => q.type === 'mc' ? q.correct : q.type === 'tf' ? q.answer : q.type === 'fill' ? q.answer : Object.fromEntries(q.pairs.map(p => [p.left, p.right]));
  KK.answer(g, right(r[0])); KK.next(g); KK.answer(g, right(r[1])); KK.next(g);
  KK.answer(g, null); KK.next(g); KK.answer(g, right(r[3])); assert.ok(!KK.next(g));
  const s = KK.summary(g); assert.strictEqual(s.correct, 3); assert.strictEqual(s.total, 4); assert.strictEqual(s.bestStreak, 2);
  assert.strictEqual(s.stars, 2); assert.deepStrictEqual(s.missed, [r[2].id]);
  assert.ok(s.score > 300);
});
t('Gemini-pyyntö vaihe 1 (lukeminen): kuvat, ei kysymyksiä, tokenraja, ajattelu', () => {
  const b = KK.buildRequest({ stage: 'read', images: [{ mime: 'image/jpeg', data: 'AAA' }], grade: 7, subject: 'Historia', title: 'Ranskan vallankumous', model: 'gemini-3.8-flash' });
  assert.strictEqual(b.contents[0].parts[1].inline_data.data, 'AAA');
  assert.ok(b.contents[0].parts[0].text.includes('7. luokan'));
  const sc = b.generationConfig.responseJsonSchema; assert.ok(sc.required.includes('lahdeteksti')); assert.ok(!sc.properties.kysymykset);
  assert.strictEqual(b.generationConfig.maxOutputTokens, 65536);
  assert.strictEqual(b.generationConfig.thinkingConfig.thinkingLevel, 'low');
  assert.ok(!JSON.stringify(b).toLowerCase().includes('api-key'));
});
t('Gemini-pyyntö vaihe 2 (kysymykset): teksti, ei kuvia, erän koko', () => {
  const b2 = KK.buildRequest({ stage: 'questions', images: [{ data: 'X' }], sourceText: 'TEKSTI', count: 10, avoid: ['vanha?'], model: 'gemini-3.5-flash-lite' });
  const txt = b2.contents[0].parts[0].text;
  assert.strictEqual(b2.contents[0].parts.length, 1); assert.ok(txt.includes('TEKSTI') && txt.includes('vanha?') && txt.includes('täsmälleen 10'));
  assert.ok(b2.generationConfig.responseJsonSchema.properties.kysymykset);
  assert.strictEqual(b2.generationConfig.thinkingConfig.thinkingLevel, 'minimal');
  const b3 = KK.buildRequest({ stage: 'questions', sourceText: 'T', schemaField: 'responseSchema', model: 'gemini-2.5-flash-lite', noThinking: true });
  assert.strictEqual(b3.generationConfig.responseSchema.type, 'OBJECT'); assert.ok(!b3.generationConfig.thinkingConfig);
});
t('ajattelutaso mallin mukaan', () => {
  assert.strictEqual(KK.thinkingLevelFor('gemini-3.8-flash'), 'low'); assert.strictEqual(KK.thinkingLevelFor('gemini-3.5-flash-lite'), 'minimal');
  assert.strictEqual(KK.thinkingLevelFor('gemini-4-hydrogen'), 'low'); assert.strictEqual(KK.thinkingLevelFor('gemini-2.5-flash'), null);
});
const wrapT = (text, fr, usage) => ({ candidates: [{ content: { parts: [{ text: 'ajatus', thought: true }, { text }] }, finishReason: fr || 'STOP' }], usageMetadata: usage });
const QJSON = JSON.stringify({ kysymykset: raw.slice(0, 4) });
t('vastaus: lukuvaihe ja kysymysvaihe', () => {
  const rd = KK.parseResponse(wrapT(JSON.stringify({ luettavuus: { ok: true }, lahdeteksti: 'Vuonna 1789 Ranskassa puhkesi vallankumous ja kansa valtasi Bastiljin.', tiivistelma: 'T', avainkasitteet: [{ kasite: 'Bastilji', selitys: 'vankila' }] })), 'read');
  assert.strictEqual(rd.summary, 'T'); assert.strictEqual(rd.terms[0].term, 'Bastilji'); assert.ok(!rd.truncated);
  const q = KK.parseResponse(wrapT(QJSON, 'STOP', { totalTokenCount: 900 }), 'questions');
  assert.strictEqual(q.questions.length, 4); assert.strictEqual(q.usage.totalTokenCount, 900);
  assert.throws(() => KK.parseResponse(wrapT(JSON.stringify({ luettavuus: { ok: false, ongelma: 'kuva on sumea' }, lahdeteksti: '' })), 'read'), e => e.code === 'blurry' && /sumea/.test(e.message));
});
t('katkennut JSON (MAX_TOKENS): valmiit kysymykset pelastetaan', () => {
  const cut = QJSON.slice(0, QJSON.indexOf('"Napoleon"') + 5); // katkeaa yhdistä-tehtävän keskelle
  const q = KK.parseResponse(wrapT(cut, 'MAX_TOKENS', { thoughtsTokenCount: 60000, candidatesTokenCount: 5000 }), 'questions');
  assert.ok(q.truncated && q.salvaged); assert.deepStrictEqual(q.questions.map(x => x.type), ['mc', 'tf', 'fill']);
  // Katkeaa ensimmäisen kysymyksen sisällä → toolong, viesti ei puhu kuvista
  assert.throws(() => KK.parseResponse(wrapT('{"kysymykset":[{"tyyppi":"monivalinta","kysymys":"Mi', 'MAX_TOKENS'), 'questions'), e => e.code === 'toolong' && !/kuvi/.test(e.message) && e.info.finishReason === 'MAX_TOKENS');
  // Ajattelu söi koko budjetin → ei tekstiä
  assert.throws(() => KK.parseResponse({ candidates: [{ content: { parts: [{ text: 'mietin', thought: true }] }, finishReason: 'MAX_TOKENS' }] }, 'questions'), e => e.code === 'toolong');
  // Ei MAX_TOKENS mutta rikkinäinen JSON loppupäästä → pelastetaan silti
  const q2 = KK.parseResponse(wrapT(QJSON.slice(0, -3)), 'questions'); assert.strictEqual(q2.questions.length, 4); assert.ok(q2.salvaged);
  assert.throws(() => KK.parseResponse(wrapT('ei jsonia'), 'questions'), e => e.code === 'parse');
});
t('katkennut lukuvaihe: teksti pelastetaan, tiivistelmä merkitään keskeneräiseksi', () => {
  const full = JSON.stringify({ luettavuus: { ok: true }, lahdeteksti: 'Vuonna 1789 Ranskassa puhkesi vallankumous. Kansa valtasi Bastiljin vankilan.', tiivistelma: 'Tämä on pitkä tiivistelmä joka kat' });
  const rd = KK.parseResponse(wrapT(full.slice(0, -10), 'MAX_TOKENS'), 'read');
  assert.ok(rd.sourceText.includes('Bastiljin')); assert.ok(rd.truncated);
});
t('repairJson', () => {
  assert.deepStrictEqual(KK.repairJson('{"a":[1,2,{"b":"x"},{"c":"y'), { a: [1, 2, { b: 'x' }] });
  assert.deepStrictEqual(KK.repairJson('```json\n{"a":true,"b":[tr'), { a: true });
  assert.strictEqual(KK.repairJson('ei'), null);
});
t('eräsuunnitelma', () => { assert.deepStrictEqual(KK.batchPlan(20), [10, 10]); assert.deepStrictEqual(KK.batchPlan(15), [10, 5]); assert.deepStrictEqual(KK.batchPlan(30), [10, 10, 10]); });
const mkQs = (n, p) => Array.from({ length: n }, (_, i) => KK.normalizeQuestion({ tyyppi: 'tosi_epatosi', kysymys: p + ' väite ' + i, totta: true, selitys: 's' }));
const asyncTests = [];
function at(name, fn) { asyncTests.push([name, fn]); }
at('erä: katkeaminen → uusi yritys puolella määrällä', async () => {
  const calls = []; const call = o => { calls.push(o.count); return calls.length === 1 ? Promise.reject(KK.err('toolong', 'x')) : Promise.resolve({ questions: mkQs(o.count, 'a') }); };
  const r = await KK.runBatch(call, { count: 10 }); assert.deepStrictEqual(calls, [10, 5]); assert.strictEqual(r.questions.length, 5);
});
at('erä: aikakatkaisu → yksi uusinta samalla määrällä, sitten virhe', async () => {
  const calls = []; const call = o => { calls.push(o.count); return Promise.reject(KK.err('timeout', 'x')); };
  await assert.rejects(KK.runBatch(call, { count: 10 }), e => e.code === 'timeout'); assert.deepStrictEqual(calls, [10, 10]);
  const c2 = []; await assert.rejects(KK.runBatch(o => { c2.push(1); return Promise.reject(KK.err('key', 'x')); }, { count: 10 })); assert.strictEqual(c2.length, 1);
});
at('erät: osittainen onnistuminen säilyy ja tallennetaan erä kerrallaan', async () => {
  let n = 0; const saved = [];
  const call = o => { n++; if (n === 3 || n === 4) return Promise.reject(KK.err('server', 'häiriö')); return Promise.resolve({ questions: mkQs(o.count, 'erä' + n) }); };
  const r = await KK.runBatches(call, { avoid: [] }, [10, 10, 10], add => { saved.push(add.length); });
  assert.strictEqual(r.questions.length, 20); assert.strictEqual(r.failed, 1); assert.deepStrictEqual(saved, [10, 10]); assert.strictEqual(r.lastError.code, 'server');
});
at('erät: kiintiö loppuu → lopetetaan, valmiit säilyvät', async () => {
  let n = 0; const call = o => { n++; return n === 1 ? Promise.resolve({ questions: mkQs(10, 'x') }) : Promise.reject(KK.err('quota', 'täynnä')); };
  const r = await KK.runBatches(call, {}, [10, 10, 10]); assert.strictEqual(r.questions.length, 10); assert.ok(r.stopped); assert.strictEqual(n, 2); assert.strictEqual(r.failed, 2);
});
at('erät: toistuvat kysymykset karsitaan ja välitetään avoid-listaan', async () => {
  const avoids = []; const call = o => { avoids.push(o.avoid.length); return Promise.resolve({ questions: mkQs(5, 'sama') }); };
  const r = await KK.runBatches(call, { avoid: ['vanha'] }, [5, 5]); assert.strictEqual(r.questions.length, 5); assert.deepStrictEqual(avoids, [1, 6]);
});
t('HTTP-virheet suomeksi', () => {
  assert.strictEqual(KK.mapHttpError(400, { error: { code: 400, message: 'API key not valid. Please pass a valid API key.', status: 'INVALID_ARGUMENT', details: [{ reason: 'API_KEY_INVALID' }] } }).code, 'key');
  assert.strictEqual(KK.mapHttpError(429, { error: { message: 'Resource has been exhausted (e.g. check quota).', status: 'RESOURCE_EXHAUSTED' } }).code, 'quota');
  assert.strictEqual(KK.mapHttpError(404, { error: { message: 'models/x is not found', status: 'NOT_FOUND' } }).code, 'model');
  assert.strictEqual(KK.mapHttpError(400, { error: { message: 'Invalid JSON payload received. Unknown name "responseJsonSchema"' } }).code, 'schema');
  assert.strictEqual(KK.mapHttpError(503, 'x').code, 'server');
  assert.ok(/kiintiö/.test(KK.mapHttpError(429, '').message));
});
(async () => { for (const [name, fn] of asyncTests) { n++; try { await fn(); console.log('ok   ' + name); } catch (e) { fail++; console.log('FAIL ' + name + '\n     ' + e.message); } }
  console.log(`\n${n - fail}/${n} testiä läpi`); if (fail) process.exit(1); })();
