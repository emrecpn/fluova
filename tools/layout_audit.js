/* Landing yerleşim denetimi — tarayıcı konsolunda (ya da otomasyonla) çalıştırılır.
   Sayfa taşmasını DEĞİL, öğelerin kendi kutusundan taşmasını ve hero başlığının oyun kartına binmesini ölçer.
   Doğrulandı (21 Eki): eski TR başlığındaki hatayı yakaladı (99 px taşma, karta 55 px binme).
   Kullanım: önce bu dosyanın içeriğini konsola yapıştır, sonra: await __audit('tr'); await __audit('en');
   Her genişlikte (1280, 1024, 768, 375) ayrı çalıştır. */
window.__audit = async function (lang) {
  // Statik çok dilli sayfada (dist/<dil>/) dil seçici bağlantıdır → tıklama; mevcut sayfayı denetle
  if (document.documentElement.dataset.static !== '1') document.querySelector('[data-lang="' + lang + '"]').click();
  lang = document.documentElement.dataset.static === '1' ? document.documentElement.lang : lang;
  await document.fonts.ready; await new Promise(r => setTimeout(r, 150));
  const out = { lang, vw: innerWidth, pageOverflow: document.documentElement.scrollWidth > innerWidth, issues: [] };
  const blockOf = el => { let p = el.parentElement; while (p && getComputedStyle(p).display.startsWith('inline')) p = p.parentElement; return p; };
  document.querySelectorAll('main *, header *, footer *').forEach(el => {
    if (!el.offsetParent && getComputedStyle(el).position !== 'fixed') return;
    if (['svg', 'path', 'circle', 'i', 'input'].includes(el.tagName.toLowerCase())) return;
    const r = el.getBoundingClientRect(); if (!r.width) return;
    const p = blockOf(el); if (!p) return; const pr = p.getBoundingClientRect(); const ps = getComputedStyle(p);
    const right = pr.right - parseFloat(ps.paddingRight) - parseFloat(ps.borderRightWidth);
    const tol = getComputedStyle(el).transform !== 'none' ? 8 : 2;
    if (r.right > right + tol && el.textContent.trim()) out.issues.push(`${el.tagName.toLowerCase()}.${(el.className || '').toString().split(' ')[0]} "${el.textContent.trim().slice(0, 30)}" ${Math.round(r.right - right)}px taşıyor`);
  });
  const h1 = document.querySelector('h1').getBoundingClientRect(), card = document.querySelector('[data-game="g1"]').getBoundingClientRect();
  const sameRow = h1.bottom > card.top && h1.top < card.bottom;
  if (sameRow && h1.right > card.left) out.issues.push(`Başlık oyun kartına biniyor (${Math.round(h1.right - card.left)}px)`);
  out.issues = [...new Set(out.issues)];
  return out;
};
