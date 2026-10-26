/* Landing page layout audit, run in the browser console (or by automation).
   It does not just look for page overflow: it measures elements spilling out of their own box or out of the
   visible box/circle around them, and the hero heading running into the game card.
   Verified against real bugs: the old TR heading (99 px overflow) and the TR/ES circle labels (Oct 2026).
   Usage: paste this file into the console, then: await __audit('tr'); await __audit('en'); await __audit('es')
   Run at every width: 1280, 1024, 768, 375. */
window.__audit = async function (lang) {
  // On the static multilingual build (dist/<lang>/) the language switch is a link: audit the current page
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
    if (r.right > right + tol && el.textContent.trim()) out.issues.push(`${el.tagName.toLowerCase()}.${(el.className || '').toString().split(' ')[0]} "${el.textContent.trim().slice(0, 30)}" ${Math.round(r.right - right)}px overflow`);
    // 26 Oct lesson: a label can fit its own wrapper yet spill out of the circle/card that wraps it → compare with the nearest visible box too
    let box = el.parentElement;
    while (box && box !== document.body) { const cs = getComputedStyle(box); if (parseFloat(cs.borderLeftWidth) > 0 || (cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.backgroundColor !== 'transparent')) break; box = box.parentElement; }
    if (box && box !== document.body && el.textContent.trim() && el.children.length === 0) {
      const b = box.getBoundingClientRect(), rr = getComputedStyle(box).borderTopLeftRadius, radPx = rr.endsWith('%') ? parseFloat(rr) / 100 * b.width : parseFloat(rr), round = radPx >= b.width / 2 - 1;
      // inside a circle, the usable width shrinks away from the centre line; use the chord at the text's vertical position
      let left = b.left, rightEdge = b.right;
      if (round) { const cy = b.top + b.height / 2, rad = b.width / 2, dy = Math.max(Math.abs(r.top - cy), Math.abs(r.bottom - cy)); const half = dy < rad ? Math.sqrt(rad * rad - dy * dy) : 0; left = b.left + rad - half; rightEdge = b.left + rad + half; }
      if (r.right > rightEdge + 2 || r.left < left - 2) out.issues.push(`${el.tagName.toLowerCase()} "${el.textContent.trim().slice(0, 30)}" spills out of its box/circle (${Math.round(Math.max(r.right - rightEdge, left - r.left))}px)`);
    }
  });
  const h1 = document.querySelector('h1').getBoundingClientRect(), card = document.querySelector('[data-game="g1"]').getBoundingClientRect();
  const sameRow = h1.bottom > card.top && h1.top < card.bottom;
  if (sameRow && h1.right > card.left) out.issues.push(`Heading runs into the game card (${Math.round(h1.right - card.left)}px)`);
  out.issues = [...new Set(out.issues)];
  return out;
};
