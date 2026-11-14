# Koekertaus (PWA)
Lapsille (peruskoulu) kokeisiin lukemiseen: kuvaa koealueen sivut oppikirjasta → Google Gemini lukee tekstin ja tekee tiivistelmän sekä peli­tehtävät (monivalinta, totta/tarua, aukko, yhdistä parit).

Julkaistu: https://rikureinikka.github.io/koekertaus/

- Ei palvelinta eikä tilejä. Kokeet, tehtävät, kuvista luettu teksti ja pisteet tallentuvat laitteen IndexedDB:hen; kuvia ei tallenneta.
- Gemini API -avain syötetään Asetuksissa ja tallennetaan vain selaimen localStorageen. **Avainta ei koskaan tallenneta repoon.**
- Generointi vaiheittain: (1) kuvat → lähdeteksti + tiivistelmä + käsitteet, tallennetaan heti; (2) kysymykset 10 kpl erissä tallennetusta tekstistä ilman kuvia, jokainen erä tallennetaan. Ohimenevä virhe → 1 uusinta; katkennut erä (MAX_TOKENS) → uusinta puolella määrällä; katkennut JSON → valmiit kysymykset pelastetaan (`repairJson`). `maxOutputTokens` 65536; thinkingLevel `low` (3.8-flash) / `minimal` (3.5-flash-lite).
- Ruuhka (429/500/502/503/504): uusinnat 2 s / 5 s / 10 s (±25 %, Retry-After / RetryInfo huomioiden, max 30 s), sitten varamalli (3.8-flash ⇄ 3.5-flash-lite) samoilla viiveillä; ruuhkainen malli ohitetaan 5 min. Kirjataan vianetsintään (`event: retry-wait / fallback`).
- Kamera/muisti: kuvat käsitellään yksi kerrallaan; mitat luetaan JPEG/PNG-otsakkeesta ja `createImageBitmap` pienentää jo dekoodauksessa (varapolku `<img>`), tulos JPEG-blobina. Keskeneräinen koe (aine, nimi, kuvat) tallentuu IndexedDB:n `drafts`-säiliöön jokaisen muutoksen ja kameran avauksen yhteydessä; jos sivu latautuu kameran ollessa auki, palataan lomakkeelle. Globaali virhekortti + vahtikoira.
- Vianetsintä: Asetukset → Näytä viimeisin virhe (finishReason, usageMetadata, kesto, virhe; ei avainta), localStorage `koekertaus.debug`.
- Kutsu: `POST https://generativelanguage.googleapis.com/v1beta/models/{malli}:generateContent`, otsake `x-goog-api-key`, `generationConfig.responseMimeType=application/json` + `responseJsonSchema` (varapolku `responseSchema`), `thinkingConfig.thinkingLevel=low` (Gemini 3+).
- Oletusmalli `gemini-3.8-flash` (vaihtoehto `gemini-3.5-flash-lite`). `gemini-2.5-flash` on vanhentunut (sulkeutuu 1.12.2026).
- Kertaus: Leitner-laatikot (0, 10 min, 1 vrk, 3 vrk, 7 vrk, 14 vrk); "Kertaa väärät" = väärin menneet, joita ei vielä ole opittu (laatikko < 4).
- Pisteet: 100 + putkibonus 20/putki (max 5) + aikabonus (max 50) × vaikeuskerroin (1 / 1,2 / 1,5). Tähdet 50/75/90 %. Tasot 250·n(n−1)/2 XP.

## Rakenne
- `src/core.js` – logiikka (validointi, tarkistus, pisteet, kertaus, Gemini-pyyntö ja -vastaus), testattavissa Nodella
- `src/app.html` – käyttöliittymä; `src/sw.js`, `src/manifest.webmanifest`, `src/icons.py`
- `./build.sh` → `dist/`
- Testit: `node test/test.js`; e2e (Gemini mockattu): `cd e2e && npm i && node e2e.js`
- Julkaisu: `./deploy.sh` – repon juuressa on `dist/`-sisältö (GitHub Pages, main /), lähdekoodi kansiossa `source/`
