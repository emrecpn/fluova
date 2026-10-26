#!/usr/bin/env node
/* Fluova landing — çok dilli statik derleme (I18N-ARCHITECTURE.md §1–2).
   Şablon: index.html + i18n.js  →  dist/<dil>/index.html (+ dist/index.html = x-default/EN)
   - data-i18n öğelerini dilin sözlüğünden basar; eksik anahtar → uyarı + İngilizceye düşer
   - <html lang>, başlık, açıklama, Open Graph, canonical, hreflang (tüm diller + x-default)
   - dil seçici gerçek bağlantıya dönüşür (/en/ ↔ /tr/)
   Kullanım: node build.js   (çıktı: landing/dist/) */
const fs = require('fs'), path = require('path');
// Public URL of the site. CI sets SITE_URL from GitHub Pages (e.g. https://<user>.github.io/fluova or a custom domain).
const SITE = (process.env.SITE_URL || 'https://emrecpn.github.io/fluova').replace(/\/$/, '');
const DIR = __dirname, OUT = path.join(DIR, 'dist');
const LOCALE = { en: 'en_US', tr: 'tr_TR', es: 'es_ES', pt: 'pt_BR' };

const tpl = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8');
global.window = {}; new Function('window', fs.readFileSync(path.join(DIR, 'i18n.js'), 'utf8'))(global.window);
const I18N = global.window.FLUOVA_I18N, LANGS = Object.keys(I18N), EN = I18N.en;
const esc = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

let warnings = 0;
function render(lang, { base, canonical }) {
  const d = I18N[lang];
  let html = tpl;
  // 1) data-i18n içerikleri (iç içe aynı etiket yok varsayımı; şablonda kontrol edildi)
  html = html.replace(/(<(\w+)\b[^>]*\bdata-i18n="([^"]+)"[^>]*>)([\s\S]*?)(<\/\2>)/g, (m, open, tag, key, inner, close) => {
    let v = d[key];
    if (v == null) { console.warn(`  ⚠ [${lang}] eksik anahtar: ${key} → İngilizce kullanıldı`); warnings++; v = EN[key] ?? inner; }
    return open + v + close;
  });
  // 2) <html> etiketi
  html = html.replace(/<html lang="[^"]*">/, `<html lang="${lang}" data-static="1" data-base="${base}">`);
  // 3) başlık + meta
  html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(d.meta_title)}</title>`);
  html = html.replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${esc(d.meta_desc)}">`);
  html = html.replace(/<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${esc(d.og_title)}">`);
  html = html.replace(/<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${esc(d.og_desc)}">`);
  const alt = LANGS.map(l => `<link rel="alternate" hreflang="${l}" href="${SITE}/${l}/">`).join('\n')
    + `\n<link rel="alternate" hreflang="x-default" href="${SITE}/">`;
  html = html.replace('<meta name="twitter:card" content="summary_large_image">',
    `<meta name="twitter:card" content="summary_large_image">\n<meta property="og:locale" content="${LOCALE[lang] || lang}">\n<meta property="og:url" content="${canonical}">\n<link rel="canonical" href="${canonical}">\n${alt}`);
  html = html.split('https://emrecpn.github.io/fluova/og.png').join(`${SITE}/og.png`);
  // 4) dil seçici → bağlantı
  html = html.replace(/<button data-lang="(\w+)" aria-pressed="(?:true|false)">(\w+)<\/button>/g,
    (m, l, label) => `<a data-lang="${l}" href="${base}${l}/" hreflang="${l}"${l === lang ? ' aria-current="page"' : ''}>${label}</a>`);
  // 5) sınav motoru bağlantıları (dil seçimi motora taşınır)
  html = html.replace(/href="\.\.\/engine\/index\.html"/g, `href="${base}engine/index.html${base === './' ? '' : '?lang=' + lang}"`);
  // 6) varlık yolları
  html = html.replace('<script src="i18n.js"></script>', `<script src="${base}i18n.js"></script>`)
             .replace('<script src="app.js"></script>', `<script src="${base}app.js"></script>`);
  return html;
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
for (const lang of LANGS) {
  fs.mkdirSync(path.join(OUT, lang), { recursive: true });
  fs.writeFileSync(path.join(OUT, lang, 'index.html'), render(lang, { base: '../', canonical: `${SITE}/${lang}/` }));
  console.log(`✓ dist/${lang}/index.html`);
}
// kök: x-default (İngilizce içerik), canonical → /en/ (kopya içerik cezası olmasın)
fs.writeFileSync(path.join(OUT, 'index.html'), render('en', { base: './', canonical: `${SITE}/en/` }));
console.log('✓ dist/index.html (x-default)');
for (const f of ['i18n.js', 'app.js', 'og.png']) fs.copyFileSync(path.join(DIR, f), path.join(OUT, f));
console.log(warnings ? `\n${warnings} eksik çeviri uyarısı.` : '\nEksik çeviri yok.');
