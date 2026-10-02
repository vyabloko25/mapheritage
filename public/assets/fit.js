/* Headings keep the same number of lines in every language: each heading gets one font size,
   small enough that its longest translation wraps no more than its shortest one. */
(function () {
  const SEL = 'h2[data-i18n], h3[data-i18n], .kicker[data-i18n]';
  function lines(el, text, size) {
    const c = el.cloneNode(false), cs = getComputedStyle(el);
    c.removeAttribute('data-i18n');
    c.style.cssText = `position:absolute;visibility:hidden;left:-9999px;top:0;margin:0;width:${el.clientWidth}px;font-size:${size}px;max-width:none`;
    c.textContent = text; el.parentNode.appendChild(c);
    const lh = parseFloat(getComputedStyle(c).lineHeight) || size * parseFloat(cs.lineHeight || 1.2);
    const n = Math.round(c.getBoundingClientRect().height / lh); c.remove(); return n;
  }
  function fitOne(el) {
    el.style.fontSize = ''; el.style.minHeight = '';
    if (!el.clientWidth) return;
    const base = parseFloat(getComputedStyle(el).fontSize), texts = I18N.langs.map((l) => I18N.tIn(l, el.dataset.i18n));
    const count = (size) => texts.map((tx) => lines(el, tx, size));
    let n = count(base), target = Math.min(...n);
    if (Math.max(...n) === target) return;
    let size = base;
    while (size > base * 0.74) { size *= 0.96; n = count(size); if (Math.max(...n) <= target) break; }
    if (Math.max(...n) <= target) el.style.fontSize = size + 'px';
    else { // cannot shrink enough without losing legibility: reserve the space instead, so nothing jumps
      n = count(base); el.style.minHeight = Math.max(...n) * parseFloat(getComputedStyle(el).lineHeight) + 'px';
    }
  }
  // Paragraphs marked data-fit="reserve" keep the height of their longest translation, so the layout around them stays put.
  function reserve(el) {
    el.style.minHeight = ''; if (!el.clientWidth) return;
    const size = parseFloat(getComputedStyle(el).fontSize), lh = parseFloat(getComputedStyle(el).lineHeight) || size * 1.5;
    const n = Math.max(...I18N.langs.map((l) => lines(el, I18N.tIn(l, el.dataset.i18n), size)));
    el.style.minHeight = n * lh + 'px';
  }
  function fitAll() { document.querySelectorAll(SEL).forEach(fitOne); document.querySelectorAll('[data-fit="reserve"][data-i18n]').forEach(reserve); }
  let tm = 0; const later = () => { clearTimeout(tm); tm = setTimeout(fitAll, 120); };
  window.addEventListener('resize', later);
  I18N.on(() => requestAnimationFrame(fitAll));
  (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(fitAll);
  fitAll();
})();
