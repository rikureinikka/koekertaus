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
t('Gemini-pyyntö: kuvat, skeema, ajattelutaso', () => {
  const b = KK.buildRequest({ images: [{ mime: 'image/jpeg', data: 'AAA' }], grade: 7, subject: 'Historia', title: 'Ranskan vallankumous', difficulty: 'normaali', count: 20, model: 'gemini-3.8-flash' });
  assert.strictEqual(b.contents[0].parts[1].inline_data.data, 'AAA');
  assert.ok(b.contents[0].parts[0].text.includes('7. luokan')); assert.ok(b.contents[0].parts[0].text.includes('Tee 20'));
  assert.strictEqual(b.generationConfig.responseMimeType, 'application/json');
  assert.ok(b.generationConfig.responseJsonSchema.required.includes('lahdeteksti'));
  assert.strictEqual(b.generationConfig.thinkingConfig.thinkingLevel, 'low');
  const b2 = KK.buildRequest({ sourceText: 'TEKSTI', count: 10, avoid: ['vanha?'], schemaField: 'responseSchema', model: 'gemini-2.5-flash-lite' });
  assert.ok(b2.contents[0].parts[0].text.includes('TEKSTI')); assert.ok(b2.contents[0].parts[0].text.includes('vanha?'));
  assert.strictEqual(b2.generationConfig.responseSchema.type, 'OBJECT'); assert.ok(!b2.generationConfig.responseSchema.required.includes('lahdeteksti'));
  assert.ok(!b2.generationConfig.thinkingConfig);
  assert.ok(!JSON.stringify(b).includes('key'));
});
t('Gemini-vastauksen jäsennys', () => {
  const data = { luettavuus: { ok: true }, lahdeteksti: 'L', tiivistelma: 'T', avainkasitteet: [{ kasite: 'Bastilji', selitys: 'vankila' }], kysymykset: raw };
  const res = KK.parseResponse({ candidates: [{ content: { parts: [{ text: 'ajatus', thought: true }, { text: JSON.stringify(data) }] }, finishReason: 'STOP' }] }, true);
  assert.strictEqual(res.questions.length, 4); assert.strictEqual(res.summary, 'T'); assert.strictEqual(res.terms[0].term, 'Bastilji');
  assert.throws(() => KK.parseResponse({ candidates: [{ content: { parts: [{ text: JSON.stringify({ luettavuus: { ok: false, ongelma: 'kuva on sumea' }, kysymykset: [] }) }] } }] }, true), e => e.code === 'blurry' && /sumea/.test(e.message));
  assert.throws(() => KK.parseResponse({ candidates: [{ content: { parts: [{ text: '{"kysym' }] }, finishReason: 'MAX_TOKENS' }] }, true), e => e.code === 'toolong');
  assert.throws(() => KK.parseResponse({ promptFeedback: { blockReason: 'SAFETY' } }, true), e => e.code === 'blocked');
  assert.throws(() => KK.parseResponse({}, true), e => e.code === 'empty');
});
t('HTTP-virheet suomeksi', () => {
  assert.strictEqual(KK.mapHttpError(400, { error: { code: 400, message: 'API key not valid. Please pass a valid API key.', status: 'INVALID_ARGUMENT', details: [{ reason: 'API_KEY_INVALID' }] } }).code, 'key');
  assert.strictEqual(KK.mapHttpError(429, { error: { message: 'Resource has been exhausted (e.g. check quota).', status: 'RESOURCE_EXHAUSTED' } }).code, 'quota');
  assert.strictEqual(KK.mapHttpError(404, { error: { message: 'models/x is not found', status: 'NOT_FOUND' } }).code, 'model');
  assert.strictEqual(KK.mapHttpError(400, { error: { message: 'Invalid JSON payload received. Unknown name "responseJsonSchema"' } }).code, 'schema');
  assert.strictEqual(KK.mapHttpError(503, 'x').code, 'server');
  assert.ok(/kiintiö/.test(KK.mapHttpError(429, '').message));
});
console.log(`\n${n - fail}/${n} testiä läpi`); if (fail) process.exit(1);
