// Koekertaus – ydinlogiikka (puhdas JS, testattavissa Nodella)
(function (root) {
  'use strict';
  var KK = {};
  KK.DEFAULT_MODEL = 'gemini-3.8-flash';
  KK.MODELS = [
    { id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash (suositus, paras laatu)' },
    { id: 'gemini-3.5-flash-lite', name: 'Gemini 3.5 Flash-Lite (nopea ja edullinen)' }
  ];
  KK.API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models/';

  // ---------- apufunktiot ----------
  KK.uid = function () { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); };
  KK.shuffle = function (a, rnd) { rnd = rnd || Math.random; a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; };
  function str(x) { return (x === null || x === undefined) ? '' : String(x).trim(); }
  KK.normText = function (s) {
    return str(s).toLowerCase().replace(/[.,;:!?"'´`()\[\]{}«»”“’\-–—]/g, ' ').replace(/\s+/g, ' ').trim();
  };
  KK.levenshtein = function (a, b) {
    if (a === b) return 0; var m = a.length, n = b.length; if (!m) return n; if (!n) return m;
    var prev = [], cur = [], i, j; for (j = 0; j <= n; j++) prev[j] = j;
    for (i = 1; i <= m; i++) { cur = [i]; for (j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = cur; }
    return prev[n];
  };

  // ---------- kysymysten validointi ----------
  // Sisäinen muoto: {id, type:'mc'|'tf'|'fill'|'match', q, options, correct, answer, accept, pairs, explanation, difficulty}
  KK.normalizeQuestion = function (r) {
    if (!r || typeof r !== 'object') return null;
    var t = str(r.tyyppi || r.type).toLowerCase();
    var map = { monivalinta: 'mc', mc: 'mc', tosi_epatosi: 'tf', 'tosi/epätosi': 'tf', tf: 'tf', aukko: 'fill', fill: 'fill', yhdista: 'match', yhdistä: 'match', match: 'match' };
    t = map[t]; if (!t) return null;
    var q = { id: str(r.id) || KK.uid(), type: t, q: str(r.kysymys || r.q), explanation: str(r.selitys || r.explanation), difficulty: str(r.vaikeus || r.difficulty) || 'normaali' };
    if (!q.q) return null;
    if (t === 'mc') {
      var opts = (r.vaihtoehdot || r.options || []).map(str).filter(Boolean);
      var seen = {}; opts = opts.filter(function (o) { var k = o.toLowerCase(); if (seen[k]) return false; seen[k] = 1; return true; });
      var ci = -1, ok = str(r.oikea_vastaus || r.answer);
      if (typeof r.oikea_indeksi === 'number') ci = r.oikea_indeksi;
      if (ok) { var f = opts.map(function (o) { return o.toLowerCase(); }).indexOf(ok.toLowerCase()); if (f >= 0) ci = f; else if (ci < 0 && opts.length < 6) { opts.push(ok); ci = opts.length - 1; } }
      if (opts.length < 2 || ci < 0 || ci >= opts.length) return null;
      q.options = opts; q.correct = ci;
    } else if (t === 'tf') {
      var a = r.totta; if (a === undefined) a = r.answer;
      if (typeof a === 'string') a = /^(tosi|totta|true|kyllä)$/i.test(a.trim()) ? true : /^(epätosi|tarua|false|ei)$/i.test(a.trim()) ? false : null;
      if (typeof a !== 'boolean') return null; q.answer = a;
    } else if (t === 'fill') {
      var ans = str(r.oikea_vastaus || r.answer); if (!ans) return null;
      if (q.q.indexOf('___') < 0) { if (q.q.indexOf('__') >= 0) q.q = q.q.replace(/_{2,}/, '___'); else q.q = q.q + ' ___'; }
      q.answer = ans; q.accept = (r.hyvaksytyt || r.accept || []).map(str).filter(Boolean);
    } else if (t === 'match') {
      var pairs = (r.parit || r.pairs || []).map(function (p) { return { left: str(p.vasen || p.left), right: str(p.oikea || p.right) }; }).filter(function (p) { return p.left && p.right; });
      if (pairs.length > 6) pairs = pairs.slice(0, 6);
      if (pairs.length < 2) return null; q.pairs = pairs;
    }
    return q;
  };
  KK.normalizeQuestions = function (arr) {
    var out = [], seen = {};
    (arr || []).forEach(function (r) { var q = KK.normalizeQuestion(r); if (!q) return; var k = q.type + '|' + KK.normText(q.q); if (seen[k]) return; seen[k] = 1; out.push(q); });
    return out;
  };

  // ---------- vastausten tarkistus ----------
  KK.checkFill = function (q, given) {
    var g = KK.normText(given); if (!g) return false;
    var cands = [q.answer].concat(q.accept || []).map(KK.normText).filter(Boolean);
    for (var i = 0; i < cands.length; i++) {
      var c = cands[i]; if (g === c) return true;
      var tol = c.length >= 9 ? 2 : c.length >= 5 ? 1 : 0;
      if (tol && KK.levenshtein(g, c) <= tol) return true;
      // numerot: 1789 vs "vuonna 1789"
      if (/^\d+$/.test(c) && g.split(' ').indexOf(c) >= 0) return true;
    }
    return false;
  };
  // answer: mc → valitun vaihtoehdon indeksi; tf → boolean; fill → teksti; match → {vasen: oikea} -olio tai taulukko pareja
  KK.check = function (q, answer) {
    if (q.type === 'mc') return answer === q.correct;
    if (q.type === 'tf') return answer === q.answer;
    if (q.type === 'fill') return KK.checkFill(q, answer);
    if (q.type === 'match') {
      if (!answer) return false;
      return q.pairs.every(function (p) { return answer[p.left] === p.right; });
    }
    return false;
  };
  KK.correctText = function (q) {
    if (q.type === 'mc') return q.options[q.correct];
    if (q.type === 'tf') return q.answer ? 'Totta' : 'Tarua';
    if (q.type === 'fill') return q.answer;
    if (q.type === 'match') return q.pairs.map(function (p) { return p.left + ' – ' + p.right; }).join(', ');
    return '';
  };

  // ---------- pisteet ----------
  KK.DIFF_MULT = { helppo: 1, normaali: 1.2, haastava: 1.5 };
  // opts: {correct, streak (putki ennen tätä vastausta), timeLeft, timeLimit, difficulty}
  KK.scoreAnswer = function (o) {
    if (!o.correct) return 0;
    var base = 100, streakBonus = 20 * Math.min(o.streak || 0, 5);
    var timeBonus = 0;
    if (o.timeLimit > 0 && o.timeLeft > 0) timeBonus = Math.round(50 * Math.min(1, o.timeLeft / o.timeLimit));
    var mult = KK.DIFF_MULT[o.difficulty] || 1;
    return Math.round((base + streakBonus + timeBonus) * mult);
  };
  KK.starsFor = function (accuracy) { return accuracy >= 0.9 ? 3 : accuracy >= 0.75 ? 2 : accuracy >= 0.5 ? 1 : 0; };
  // Tasot: taso n vaatii 250·n·(n−1)/2 XP:tä → 0, 250, 750, 1500, 2500 ...
  KK.levelFor = function (xp) {
    xp = Math.max(0, xp || 0); var n = 1; while (250 * n * (n + 1) / 2 <= xp) n++;
    var cur = 250 * n * (n - 1) / 2, next = 250 * n * (n + 1) / 2;
    return { level: n, xpInto: xp - cur, xpNeeded: next - cur, progress: (xp - cur) / (next - cur) };
  };
  KK.LEVEL_NAMES = ['Aloittelija', 'Opiskelija', 'Tietäjä', 'Mestari', 'Asiantuntija', 'Professori', 'Nero', 'Legenda'];
  KK.levelName = function (lv) { return KK.LEVEL_NAMES[Math.min(lv - 1, KK.LEVEL_NAMES.length - 1)]; };

  // ---------- kertaus (Leitner-laatikot) ----------
  var MIN = 60e3, DAY = 864e5;
  KK.SRS_INTERVALS = [0, 10 * MIN, DAY, 3 * DAY, 7 * DAY, 14 * DAY];
  KK.srsUpdate = function (item, correct, now) {
    item = item ? { box: item.box, due: item.due, right: item.right || 0, wrong: item.wrong || 0, last: item.last } : { box: 0, due: 0, right: 0, wrong: 0 };
    if (correct) { item.right++; item.box = Math.min((item.box || 0) + 1, KK.SRS_INTERVALS.length - 1); }
    else { item.wrong++; item.box = 1; }
    item.due = now + (correct ? KK.SRS_INTERVALS[item.box] : 0);
    item.last = now; item.lastCorrect = !!correct;
    return item;
  };
  // Kertaa väärät: kysymykset, joihin on joskus vastattu väärin ja jotka eivät vielä ole "opittu" (laatikko < 4)
  KK.reviewQueue = function (questions, srs, now) {
    srs = srs || {};
    var cand = questions.filter(function (q) { var s = srs[q.id]; return s && s.wrong > 0 && s.box < 4; });
    var due = cand.filter(function (q) { return srs[q.id].due <= now; });
    var list = due.length ? due : cand;
    return list.slice().sort(function (a, b) { var A = srs[a.id], B = srs[b.id]; return (A.box - B.box) || (A.due - B.due); });
  };
  KK.reviewCount = function (questions, srs, now) { return KK.reviewQueue(questions, srs, now).length; };

  // ---------- kierroksen rakentaminen ----------
  // mode: 'normal' | 'all' | 'review'; prioritoi kysymykset, joita ei ole vielä nähty tai joissa on epäonnistuttu
  KK.buildRound = function (questions, srs, opts) {
    opts = opts || {}; var rnd = opts.rnd || Math.random, now = opts.now || Date.now(); srs = srs || {};
    var pool;
    if (opts.mode === 'review') pool = KK.reviewQueue(questions, srs, now).slice(0, opts.size || 10);
    else if (opts.mode === 'all') pool = KK.shuffle(questions, rnd);
    else {
      var scored = KK.shuffle(questions, rnd).map(function (q) { var s = srs[q.id]; var p = !s ? 1 : (s.box < 2 ? 2 : s.box < 4 ? 3 : 4); return { q: q, p: p }; });
      scored.sort(function (a, b) { return a.p - b.p; });
      pool = scored.slice(0, opts.size || 10).map(function (x) { return x.q; });
      pool = KK.shuffle(pool, rnd);
    }
    return pool.map(function (q) {
      var c = JSON.parse(JSON.stringify(q));
      if (c.type === 'mc') { var idx = KK.shuffle(c.options.map(function (_, i) { return i; }), rnd); c.options = idx.map(function (i) { return q.options[i]; }); c.correct = idx.indexOf(q.correct); }
      if (c.type === 'match') c.rightOrder = KK.shuffle(c.pairs.map(function (p) { return p.right; }), rnd);
      return c;
    });
  };

  // Kierroksen tila
  KK.newGame = function (round, opts) { opts = opts || {}; return { round: round, i: 0, score: 0, streak: 0, bestStreak: 0, correct: 0, answers: [], timeLimit: opts.timeLimit || 0, difficulty: opts.difficulty || 'normaali' }; };
  KK.answer = function (g, answer, timeLeft) {
    var q = g.round[g.i]; var ok = KK.check(q, answer);
    var pts = KK.scoreAnswer({ correct: ok, streak: g.streak, timeLeft: timeLeft, timeLimit: g.timeLimit, difficulty: q.difficulty || g.difficulty });
    g.score += pts; if (ok) { g.streak++; g.correct++; g.bestStreak = Math.max(g.bestStreak, g.streak); } else g.streak = 0;
    var rec = { id: q.id, correct: ok, points: pts, given: answer }; g.answers.push(rec); return rec;
  };
  KK.next = function (g) { g.i++; return g.i < g.round.length; };
  KK.summary = function (g) { var n = g.round.length; var acc = n ? g.correct / n : 0; return { total: n, correct: g.correct, accuracy: acc, score: g.score, bestStreak: g.bestStreak, stars: KK.starsFor(acc), missed: g.answers.filter(function (a) { return !a.correct; }).map(function (a) { return a.id; }) }; };

  KK.FEEDBACK_OK = ['Mahtavaa!', 'Oikein! 🎉', 'Huippua!', 'Juuri niin!', 'Loistavaa!', 'Täsmälleen!', 'Hienoa työtä!'];
  KK.FEEDBACK_BAD = ['Melkein! Katso selitys.', 'Ei haittaa – tästä oppii!', 'Hups! Seuraava menee varmasti.', 'Hyvä yritys!'];
  KK.endMessage = function (acc) { return acc >= 0.9 ? 'Olet valmis kokeeseen! 🏆' : acc >= 0.75 ? 'Tosi hyvä! Vielä vähän kertausta.' : acc >= 0.5 ? 'Hyvä alku! Kertaa väärät, niin muistat ne.' : 'Harjoitus tekee mestarin – kokeile uudestaan!'; };

  // ---------- Gemini ----------
  // Kaksi vaihetta: 'read' = kuvat → lähdeteksti + tiivistelmä + käsitteet; 'questions' = tallennettu teksti → kysymyserä (ei kuvia)
  KK.MAX_OUTPUT_TOKENS = 65536; // gemini-3.8-flash ja gemini-3.5-flash-lite: output token limit 65 536
  KK.BATCH_SIZE = 10;
  KK.GRADE_TEXT = function (grade) { return grade ? grade + '. luokan oppilas (peruskoulu)' : 'peruskoulun oppilas'; };
  KK.questionSchema = function () {
    return {
      type: 'object',
      properties: {
        tyyppi: { type: 'string', enum: ['monivalinta', 'tosi_epatosi', 'aukko', 'yhdista'] },
        kysymys: { type: 'string', description: 'Kysymys tai väite. Aukkotehtävässä lause, jossa puuttuva sana on merkitty ___' },
        vaihtoehdot: { type: 'array', items: { type: 'string' }, description: 'Monivalinnassa 3–4 vaihtoehtoa, muuten tyhjä' },
        oikea_vastaus: { type: 'string', description: 'Monivalinnassa oikean vaihtoehdon teksti täsmälleen, aukkotehtävässä puuttuva sana' },
        totta: { type: 'boolean', description: 'Tosi/epätosi-väitteessä onko väite totta' },
        hyvaksytyt: { type: 'array', items: { type: 'string' }, description: 'Aukkotehtävässä muut hyväksyttävät kirjoitusasut' },
        parit: { type: 'array', items: { type: 'object', properties: { vasen: { type: 'string' }, oikea: { type: 'string' } }, required: ['vasen', 'oikea'] }, description: 'Yhdistä-tehtävässä 3–5 paria' },
        selitys: { type: 'string', description: 'Lyhyt 1–2 lauseen selitys' },
        vaikeus: { type: 'string', enum: ['helppo', 'normaali', 'haastava'] }
      },
      required: ['tyyppi', 'kysymys', 'selitys']
    };
  };
  KK.responseSchema = function (stage) {
    if (stage === 'read') return {
      type: 'object',
      properties: {
        luettavuus: { type: 'object', properties: { ok: { type: 'boolean' }, ongelma: { type: 'string', description: 'Jos kuvat ovat epätarkkoja, tummia, rajattuja tai niissä ei ole oppimateriaalia, kerro lyhyesti suomeksi' } }, required: ['ok'] },
        lahdeteksti: { type: 'string', description: 'Kuvien teksti puhtaaksi kirjoitettuna (otsikot, kappaleet, kuvatekstit)' },
        tiivistelma: { type: 'string', description: 'Selkeä tiivistelmä koealueesta oppilaalle, 5–12 ranskalaista viivaa' },
        avainkasitteet: { type: 'array', items: { type: 'object', properties: { kasite: { type: 'string' }, selitys: { type: 'string' } }, required: ['kasite', 'selitys'] } }
      },
      required: ['luettavuus', 'lahdeteksti', 'tiivistelma', 'avainkasitteet']
    };
    return { type: 'object', properties: { kysymykset: { type: 'array', items: KK.questionSchema() } }, required: ['kysymykset'] };
  };
  KK.buildPrompt = function (o) {
    var L = [];
    L.push('Olet suomalainen opettaja, joka tekee kokeeseen valmistavaa materiaalia. Oppija: ' + KK.GRADE_TEXT(o.grade) + '.');
    L.push('Oppiaine: ' + (o.subject || '-') + '. Koealue: ' + (o.title || '-') + '.');
    if (o.stage === 'read') {
      L.push('Liitteenä on valokuvia oppikirjan sivuista. Lue kuvista kaikki koealueen teksti (myös kuvatekstit ja laatikot) ja kirjoita se kenttään lahdeteksti. Jätä pois sivunumerot ja toistuvat ylä-/alatunnisteet. Tee sitten tiivistelmä ja 5–15 avainkäsitettä selityksineen. Älä tee kysymyksiä tässä vaiheessa.');
      L.push('Jos kuvat ovat lukukelvottomia tai niissä ei ole oppimateriaalia, aseta luettavuus.ok=false ja kerro ongelma.');
    } else {
      L.push('Alla on koealueen lähdeteksti, joka on luettu oppikirjan sivuilta.\n---\n' + o.sourceText + '\n---');
      L.push('Tee täsmälleen ' + o.count + ' uutta harjoitustehtävää. Vaikeustaso: ' + o.difficulty + '.');
      L.push('Säännöt: Käytä VAIN lähdetekstin tietoja, älä keksi asioita. Kirjoita hyvällä, ikätasolle sopivalla suomen kielellä. Sekoita tyyppejä: noin 45 % monivalinta (3–4 uskottavaa vaihtoehtoa, vain yksi oikea), 20 % tosi_epatosi, 20 % aukko (yksi selvä puuttuva sana tai luku, merkitse ___), 15 % yhdista (3–5 paria). Jokaiseen tehtävään lyhyt selitys (1–2 lausetta), miksi vastaus on oikea. Kata koealue tasaisesti ja painota tärkeitä asioita.' + (o.focus ? ' ' + o.focus : ''));
      if (o.avoid && o.avoid.length) L.push('Älä toista näitä jo olemassa olevia kysymyksiä:\n- ' + o.avoid.slice(-60).join('\n- '));
    }
    return L.join('\n\n');
  };
  KK.thinkingLevelFor = function (model) {
    model = model || KK.DEFAULT_MODEL;
    if (!/^gemini-([3-9]|\d\d)/.test(model)) return null; // vanhemmat mallit: ei thinkingLevel-kenttää
    // Dokumentaatio 11/2026: gemini-3.8-flash ja Gemini 4: low/medium/high (minimal → virhe); 3.5/3.6/3.1 flash(-lite): minimal tuettu
    if (/^gemini-(3\.8|4)|pro/.test(model)) return 'low';
    return 'minimal';
  };
  KK.supportsThinkingLevel = function (model) { return !!KK.thinkingLevelFor(model); };
  // o: {stage:'read'|'questions', images, sourceText, grade, subject, title, count, difficulty, avoid, model, schemaField}
  KK.buildRequest = function (o) {
    var stage = o.stage || ((o.images && o.images.length) ? 'read' : 'questions');
    var parts = [{ text: KK.buildPrompt({ stage: stage, grade: o.grade, subject: o.subject, title: o.title, count: o.count || KK.BATCH_SIZE, difficulty: o.difficulty || 'normaali', sourceText: o.sourceText, avoid: o.avoid, focus: o.focus }) }];
    if (stage === 'read') (o.images || []).forEach(function (im) { parts.push({ inline_data: { mime_type: im.mime || 'image/jpeg', data: im.data } }); });
    var gc = { responseMimeType: 'application/json', maxOutputTokens: KK.MAX_OUTPUT_TOKENS };
    if (o.schemaField === 'responseSchema') gc.responseSchema = KK.toOpenApiSchema(KK.responseSchema(stage));
    else gc.responseJsonSchema = KK.responseSchema(stage);
    var tl = o.noThinking ? null : KK.thinkingLevelFor(o.model); if (tl) gc.thinkingConfig = { thinkingLevel: tl };
    return { contents: [{ role: 'user', parts: parts }], generationConfig: gc };
  };
  // Varapolku: vanha responseSchema (OpenAPI-osajoukko, tyypit isoilla kirjaimilla)
  KK.toOpenApiSchema = function (s) {
    if (Array.isArray(s)) return s.map(KK.toOpenApiSchema);
    if (!s || typeof s !== 'object') return s;
    var o = {}; Object.keys(s).forEach(function (k) { if (k === 'type') o.type = String(s.type).toUpperCase(); else if (k === 'properties') { o.properties = {}; Object.keys(s.properties).forEach(function (p) { o.properties[p] = KK.toOpenApiSchema(s.properties[p]); }); } else if (k === 'items') o.items = KK.toOpenApiSchema(s.items); else o[k] = s[k]; });
    return o;
  };
  KK.endpoint = function (model) { return KK.API_BASE + encodeURIComponent(model || KK.DEFAULT_MODEL) + ':generateContent'; };

  function err(code, msg, detail) { var e = new Error(msg); e.code = code; e.detail = detail; return e; }
  KK.err = err;
  // Ohimenevät virheet, jotka kannattaa yrittää kerran uudelleen
  KK.isRetryable = function (e) { return !!e && !e.backoffDone && ['net', 'timeout', 'server', 'parse', 'empty', 'toolong'].indexOf(e.code) >= 0; };
  KK.mapHttpError = function (status, body, retryAfterHeader) { var e = KK._mapHttpError(status, body); e.status = status; e.retryAfter = KK.retryAfterMs(retryAfterHeader, body); return e; };
  KK._mapHttpError = function (status, body) {
    var m = '', reason = '';
    try { var j = typeof body === 'string' ? JSON.parse(body) : body; m = (j && j.error && j.error.message) || ''; reason = JSON.stringify((j && j.error && j.error.details) || '') + ' ' + ((j && j.error && j.error.status) || ''); } catch (e) { m = String(body || '').slice(0, 200); }
    var all = (m + ' ' + reason);
    if (/API_KEY_INVALID|API key not valid|invalid api key/i.test(all)) return err('key', 'API-avain ei kelpaa. Tarkista avain Asetuksista (kopioi se uudelleen AI Studiosta).', m);
    if (status === 429 || /RESOURCE_EXHAUSTED|quota/i.test(all)) return err('quota', 'Tekoälyn käyttöraja on täynnä (kiintiö ylittyi). Odota hetki tai kokeile huomenna uudelleen. Asetuksista voi myös vaihtaa kevyempään malliin.', m);
    if (status === 403 || /PERMISSION_DENIED/i.test(all)) return err('key', 'API-avaimella ei ole oikeutta Gemini-palveluun. Tee uusi avain osoitteessa aistudio.google.com/apikey.', m);
    if (status === 404 || /not found|is not supported/i.test(all)) return err('model', 'Tekoälymallia ei löytynyt. Valitse Asetuksista toinen malli.', m);
    if (status === 400 && /location|region|country/i.test(all)) return err('region', 'Gemini ei ole käytettävissä tällä alueella tai tilillä.', m);
    if (status === 400 && /schema|Unknown name|Invalid JSON payload|thinking/i.test(all)) return err('schema', 'Tekoälypalvelu ei hyväksynyt pyynnön asetuksia.', m);
    if (status === 400 && /image|inline_data|too large|payload size|request size/i.test(all)) return err('image', 'Kuvien lähetys epäonnistui (kuvat liian suuria). Kokeile vähemmillä kuvilla.', m);
    if (status >= 500) return err('server', 'Tekoälypalvelussa on häiriö. Yritä hetken päästä uudelleen.', m);
    return err('http', 'Tekoälypalvelu palautti virheen (' + status + ').', m);
  };

  // ---------- ruuhka: uusinnat viiveellä + varamalli ----------
  KK.BACKOFF_MS = [2000, 5000, 10000];
  KK.OVERLOAD_STATUSES = [429, 500, 502, 503, 504];
  KK.isOverload = function (e) { return !!e && KK.OVERLOAD_STATUSES.indexOf(e.status) >= 0; };
  KK.fallbackModel = function (model) { return model === 'gemini-3.5-flash-lite' ? 'gemini-3.8-flash' : 'gemini-3.5-flash-lite'; };
  // Retry-After (sekunteja tai HTTP-päiväys) tai Googlen RetryInfo.retryDelay ("7s") → ms
  KK.retryAfterMs = function (header, body, now) {
    if (header) { var n = Number(header); if (isFinite(n) && n >= 0) return n * 1000; var d = Date.parse(header); if (!isNaN(d)) return Math.max(0, d - (now || Date.now())); }
    try { var j = typeof body === 'string' ? JSON.parse(body) : body; var det = (j && j.error && j.error.details) || [];
      for (var i = 0; i < det.length; i++) { var rd = det[i] && det[i].retryDelay; if (rd) { var m = String(rd).match(/^([\d.]+)s$/); if (m) return parseFloat(m[1]) * 1000; } } } catch (e) { /* ei */ }
    return null;
  };
  // Viive: perusviive ±25 % satunnaisuudella; Retry-After voittaa jos se on pidempi (enintään 30 s)
  KK.backoffDelay = function (i, retryAfter, rnd) {
    var base = KK.BACKOFF_MS[Math.min(i, KK.BACKOFF_MS.length - 1)];
    var ms = Math.round(base * (0.75 + 0.5 * (rnd || Math.random)()));
    if (retryAfter != null) ms = Math.max(ms, Math.min(retryAfter, 30000));
    return ms;
  };
  // fn(model, meta) → Promise. Uusii ruuhkavirheet viiveillä, sitten vaihtaa varamalliin (samat viiveet).
  // opts: {model, sleep(ms), onStatus(msg, meta), rnd, fallback:true}
  KK.withBackoff = function (fn, opts) {
    var sleep = opts.sleep || function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
    var models = [opts.model]; if (opts.fallback !== false) models.push(KK.fallbackModel(opts.model));
    var tries = [];
    function run(mi, i) {
      var model = models[mi], meta = { model: model, attempt: i + 1, fallback: mi > 0, tries: tries };
      return fn(model, meta).then(function (r) { if (r && typeof r === 'object') { r.usedModel = model; r.usedFallback = mi > 0; } return r; }, function (e) {
        tries.push({ model: model, status: e.status, code: e.code });
        if (!KK.isOverload(e)) throw e;
        if (i < KK.BACKOFF_MS.length) {
          var ms = KK.backoffDelay(i, e.retryAfter, opts.rnd);
          if (opts.onStatus) opts.onStatus((e.status === 429 ? 'Käyttöraja tuli vastaan' : 'Palvelu ruuhkassa') + ', yritetään uudelleen ' + Math.round(ms / 1000) + ' s kuluttua… (' + (i + 1) + '/' + KK.BACKOFF_MS.length + ')', { model: model, waitMs: ms, attempt: i + 1, fallback: mi > 0 });
          return sleep(ms).then(function () { return run(mi, i + 1); });
        }
        if (mi + 1 < models.length) {
          if (opts.onStatus) opts.onStatus('Käytetään varamallia (' + models[mi + 1] + ')…', { model: models[mi + 1], switchFrom: model, fallback: true });
          return run(mi + 1, 0);
        }
        e.backoffDone = true;
        e.message = (e.status === 429 ? 'Tekoälyn käyttöraja on täynnä molemmissa malleissa. Odota hetki tai kokeile myöhemmin uudelleen.' : 'Tekoälypalvelu on ruuhkassa (myös varamalli). Odota pari minuuttia ja yritä uudelleen.');
        throw e;
      });
    }
    return run(0, 0);
  };

  // Katkenneen JSONin pelastus: etsitään viimeinen kohta, jossa arvo päättyi kokonaan, ja suljetaan avoimet sulut
  KK.repairJson = function (text) {
    var s = String(text || ''), start = s.indexOf('{'); if (start < 0) return null; s = s.slice(start);
    var stack = [], inStr = false, esc = false, cuts = [];
    for (var i = 0; i < s.length; i++) {
      var c = s[i];
      if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') { inStr = false; cuts.push([i + 1, stack.slice()]); } continue; }
      if (c === '"') inStr = true;
      else if (c === '{' || c === '[') stack.push(c === '{' ? '}' : ']');
      else if (c === '}' || c === ']') { stack.pop(); cuts.push([i + 1, stack.slice()]); if (!stack.length) break; }
      else if (c === ',') cuts.push([i, stack.slice()]);
      else if (/[0-9el]/.test(c) && /[,\]}\s]/.test(s[i + 1] || ' ')) cuts.push([i + 1, stack.slice()]); // luvut, true/false/null
    }
    for (var k = cuts.length - 1, tries = 0; k >= 0 && tries < 400; k--, tries++) {
      var cand = s.slice(0, cuts[k][0]).replace(/,\s*$/, '') + cuts[k][1].slice().reverse().join('');
      try { return JSON.parse(cand); } catch (e) { /* kokeillaan aiempaa kohtaa */ }
    }
    return null;
  };

  // Palauttaa {stage, data, finishReason, usage, truncated, salvaged, text}
  KK.parseResponse = function (json, stage) {
    if (stage === true) stage = 'read'; if (!stage || stage === false) stage = 'questions';
    var info = { stage: stage, finishReason: null, usage: json && json.usageMetadata || null, truncated: false, salvaged: false };
    function fail(code, msg) { var e = err(code, msg); e.info = info; throw e; }
    if (json && json.promptFeedback && json.promptFeedback.blockReason) fail('blocked', 'Tekoäly kieltäytyi käsittelemästä sisältöä (' + json.promptFeedback.blockReason + '). Kokeile muita sivuja.');
    var c = json && json.candidates && json.candidates[0];
    if (!c) fail('empty', 'Tekoäly ei palauttanut vastausta.');
    info.finishReason = c.finishReason || null;
    if (c.finishReason === 'SAFETY' || c.finishReason === 'PROHIBITED_CONTENT' || c.finishReason === 'RECITATION') fail('blocked', 'Tekoäly esti vastauksen (' + c.finishReason + '). Kokeile muita sivuja.');
    var text = ((c.content && c.content.parts) || []).filter(function (p) { return p.text && !p.thought; }).map(function (p) { return p.text; }).join('');
    info.textTail = text.slice(-300); info.textLength = text.length;
    info.truncated = c.finishReason === 'MAX_TOKENS';
    if (!text) fail(info.truncated ? 'toolong' : 'empty', info.truncated ? 'Tekoälyn vastaus katkesi ennen kuin siihen tuli sisältöä (tokenraja täyttyi).' : 'Tekoäly palautti tyhjän vastauksen.');
    var data = null;
    try { data = JSON.parse(text); } catch (e) { data = KK.repairJson(text); if (data) info.salvaged = true; }
    if (!data) fail(info.truncated ? 'toolong' : 'parse', info.truncated ? 'Tekoälyn vastaus katkesi kesken (tokenraja täyttyi).' : 'Tekoälyn vastausta ei voitu lukea (viallinen JSON).');
    info.data = data;
    if (stage === 'read') {
      if (data.luettavuus && data.luettavuus.ok === false) fail('blurry', 'Kuvista ei saatu selvää: ' + (data.luettavuus.ongelma || 'kuvat ovat epätarkkoja tai tummia') + '. Ota kuvat uudelleen hyvässä valossa ja suoraan ylhäältä.');
      info.sourceText = str(data.lahdeteksti); info.summary = str(data.tiivistelma);
      info.terms = (data.avainkasitteet || []).map(function (t) { return { term: str(t && t.kasite), def: str(t && t.selitys) }; }).filter(function (t) { return t.term; });
      if (info.sourceText.length < 40) fail(info.truncated ? 'toolong' : 'blurry', info.truncated ? 'Tekoälyn vastaus katkesi kesken tekstin lukemisen.' : 'Kuvista ei löytynyt luettavaa tekstiä. Varmista, että sivu on tarkka ja kokonaan kuvassa.');
      if (info.truncated && !info.summary) info.summary = '(Tiivistelmä jäi kesken.)';
      return info;
    }
    info.questions = KK.normalizeQuestions(data.kysymykset);
    if (!info.questions.length) fail(info.truncated ? 'toolong' : 'empty', info.truncated ? 'Tekoälyn vastaus katkesi ennen ensimmäistä valmista kysymystä.' : 'Tekoäly ei palauttanut kelvollisia kysymyksiä.');
    return info;
  };
  // Kysymyserien koot: 20 → [10,10], 15 → [10,5], 30 → [10,10,10]
  KK.batchPlan = function (total, size) { size = size || KK.BATCH_SIZE; var out = []; while (total > 0) { out.push(Math.min(size, total)); total -= size; } return out; };

  // Yksi erä uusintayrityksineen. call(o) → Promise<info>. Katkeamisessa yritetään puolella määrällä.
  KK.runBatch = function (call, o, log) {
    function attempt(count, tryNo) {
      return call(Object.assign({}, o, { count: count })).then(function (info) {
        if (log) log({ ok: true, count: count, tryNo: tryNo, info: info });
        return info;
      }, function (e) {
        if (log) log({ ok: false, count: count, tryNo: tryNo, error: e });
        if (tryNo >= 2 || !KK.isRetryable(e)) throw e;
        var next = e.code === 'toolong' ? Math.max(3, Math.ceil(count / 2)) : count;
        return attempt(next, tryNo + 1);
      });
    }
    return attempt(o.count, 1);
  };
  // Erät peräkkäin; onBatch(questions) tallentaa välitulokset. Palauttaa {questions, failed, lastError}
  KK.runBatches = function (call, o, plan, onBatch, log) {
    var all = [], failed = 0, lastError = null, avoid = (o.avoid || []).slice();
    return plan.reduce(function (p, count, idx) {
      return p.then(function () {
        if (o.onProgress) o.onProgress(idx, plan.length);
        return KK.runBatch(call, Object.assign({}, o, { count: count, avoid: avoid.slice() }), log).then(function (info) {
          var have = {}; all.forEach(function (q) { have[q.type + '|' + KK.normText(q.q)] = 1; }); (o.avoid || []).forEach(function (t) { have['*' + KK.normText(t)] = 1; });
          var add = info.questions.filter(function (q) { return !have[q.type + '|' + KK.normText(q.q)] && !have['*' + KK.normText(q.q)]; });
          all = all.concat(add); add.forEach(function (q) { avoid.push(q.q); });
          return onBatch ? onBatch(add) : null;
        }, function (e) {
          failed++; lastError = e;
          if (['key', 'quota', 'model', 'region', 'offline', 'nokey', 'blocked'].indexOf(e.code) >= 0) { failed += plan.length - idx - 1; throw { stop: true, e: e }; }
        });
      });
    }, Promise.resolve()).then(function () { return { questions: all, failed: failed, lastError: lastError }; }, function (x) { if (x && x.stop) return { questions: all, failed: failed, lastError: x.e, stopped: true }; throw x; });
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = KK; else root.KK = KK;
})(this);
