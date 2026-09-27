/* MapHeritage map renderer (Leaflet). Modernist atlas style: flat base, bold routes, station dots. */
(function () {
  const COLORS = ['#E0301E', '#1F3FBF', '#F2B705', '#00875A', '#F26B1D', '#6B3FA0', '#0097B2', '#000000'];
  const FONT = "'Jost', 'Futura', 'Century Gothic', 'Segoe UI', Arial, sans-serif";
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const hasGeo = (e) => Number.isFinite(e.lat) && Number.isFinite(e.lng);
  const keyOf = (e) => e.lat.toFixed(2) + ',' + e.lng.toFixed(2);
  const typeLabel = (t) => (window.I18N ? I18N.t('type.' + t) : t);

  function colors(people) {
    const m = {};
    (people || []).forEach((p, i) => (m[p.id] = /^#[0-9a-f]{6}$/i.test(p.color || '') ? p.color : COLORS[i % COLORS.length]));
    return m;
  }
  function chrono(events) {
    return events.map((e, i) => ({ e, i }))
      .sort((a, b) => (a.e.year ?? 9999) - (b.e.year ?? 9999) || a.i - b.i).map((x) => x.e);
  }
  function arc(a, b, n = 32) {
    const [y1, x1] = a, [y2, x2] = b;
    const cx = (x1 + x2) / 2 - (y2 - y1) * 0.16, cy = (y1 + y2) / 2 + (x2 - x1) * 0.16;
    const pts = [];
    for (let i = 0; i <= n; i++) { const t = i / n, u = 1 - t; pts.push([u * u * y1 + 2 * u * t * cy + t * t * y2, u * u * x1 + 2 * u * t * cx + t * t * x2]); }
    return pts;
  }
  // Pure layout shared by the live map and the PNG export.
  function layout(state) {
    const col = colors(state.people), names = {};
    (state.people || []).forEach((p) => (names[p.id] = p.name));
    const events = chrono((state.events || []).filter(hasGeo));
    const places = {}, steps = [], last = {};
    for (const e of events) {
      const k = keyOf(e);
      (places[k] ||= { e, list: [], people: new Set() }).list.push(e);
      places[k].people.add(e.personId);
      const p = last[e.personId];
      steps.push({ e, from: p && keyOf(p) !== k ? p : null, color: col[e.personId] || COLORS[7] });
      last[e.personId] = e;
    }
    for (const k in places) places[k].color = col[places[k].e.personId] || COLORS[7];
    return { col, names, places, steps, events };
  }

  function create(el, opts = {}) {
    const map = L.map(el, {
      zoomControl: opts.zoomControl !== false, scrollWheelZoom: opts.scrollWheelZoom !== false,
      worldCopyJump: true, zoomSnap: 0.25, minZoom: 2, maxZoom: 12,
    });
    map.attributionControl.setPrefix(false);
    const tiles = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> © <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd', maxZoom: 12, crossOrigin: 'anonymous',
    }).addTo(map);
    map.setView([52, 30], 3);
    const group = L.layerGroup().addTo(map);
    const temp = L.layerGroup().addTo(map);
    let timers = [], last = null;

    function fit(events) {
      const pts = (events || []).filter(hasGeo).map((e) => [e.lat, e.lng]);
      const pad = typeof opts.padding === 'function' ? opts.padding() : opts.padding || {};
      if (pts.length === 1) map.setView(pts[0], 6);
      else if (pts.length > 1) map.fitBounds(pts, { paddingTopLeft: pad.topLeft || [48, 48], paddingBottomRight: pad.bottomRight || [48, 48], maxZoom: 7 });
    }

    function render(state, o = {}) {
      last = state;
      timers.forEach(clearTimeout); timers = [];
      group.clearLayers();
      const { names, places, steps, events } = layout(state);
      if (o.fit !== false) fit(events);
      const drawn = {}, highlight = o.highlight || new Set();

      function drawPlace(s) {
        const k = keyOf(s.e), pl = places[k];
        if (highlight.has(s.e.id)) pulse(s.e, s.color);
        if (drawn[k]) return;
        const multi = pl.people.size > 1;
        drawn[k] = L.circleMarker([s.e.lat, s.e.lng], {
          radius: multi ? 8 : 6.5, weight: multi ? 3 : 2.5, color: '#000', fillColor: multi ? '#fff' : pl.color, fillOpacity: 1,
        })
          .bindTooltip(esc(s.e.place || s.e.query), { permanent: true, direction: 'right', offset: [9, 0], className: 'mk-label' })
          .bindPopup(`<div class="mk-pop"><h4>${esc(s.e.place)}</h4><ul>${pl.list.map((e) => {
            const head = e.when || (e.year ? String(e.year) : '');
            const rest = [names[e.personId], e.type !== 'other' ? typeLabel(e.type) : ''].filter(Boolean).join(', ');
            return `<li><b>${esc(head)}</b> ${esc(rest)}${e.note ? `<br><span>${esc(e.note)}</span>` : ''}</li>`;
          }).join('')}</ul></div>`)
          .on('click', () => opts.onPlace && opts.onPlace(pl.list))
          .addTo(group);
      }
      function pulse(e, color) {
        const m = L.marker([e.lat, e.lng], { interactive: false, icon: L.divIcon({ className: 'mk-pulse', html: `<i style="border-color:${color}"></i>`, iconSize: [44, 44], iconAnchor: [22, 22] }) }).addTo(group);
        timers.push(setTimeout(() => group.removeLayer(m), 2300));
      }
      function drawRoute(s, animate) {
        const pts = arc([s.from.lat, s.from.lng], [s.e.lat, s.e.lng]);
        const line = L.polyline(pts, { color: s.color, weight: 4, opacity: 1, lineCap: 'round', interactive: false }).addTo(group);
        const arrow = () => {
          const a = map.latLngToLayerPoint(pts[15]), b = map.latLngToLayerPoint(pts[17]);
          const deg = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
          L.marker(pts[16], { interactive: false, icon: L.divIcon({ className: 'mk-arrow', iconSize: [16, 16], iconAnchor: [8, 8],
            html: `<svg width="16" height="16" viewBox="-8 -8 16 16" style="transform:rotate(${deg}deg)"><path d="M-6,-6 L7,0 L-6,6 Z" fill="${s.color}" stroke="#000" stroke-width="1.2" stroke-linejoin="round"/></svg>` }) }).addTo(group);
        };
        const path = line._path;
        if (animate && path && path.getTotalLength) {
          const len = path.getTotalLength();
          path.style.strokeDasharray = len; path.style.strokeDashoffset = len;
          path.getBoundingClientRect();
          path.style.transition = 'stroke-dashoffset .85s cubic-bezier(.6,0,.3,1)';
          path.style.strokeDashoffset = 0;
          timers.push(setTimeout(() => { path.style.strokeDasharray = ''; path.style.transition = ''; arrow(); }, 900));
        } else arrow();
      }

      if (!(o.animate && !reduced)) {
        steps.forEach((s) => s.from && drawRoute(s, false));
        steps.forEach(drawPlace);
      } else {
        const ms = o.stepMs || 600;
        steps.forEach((s, i) => timers.push(setTimeout(() => {
          if (s.from) { drawRoute(s, true); timers.push(setTimeout(() => drawPlace(s), 800)); } else drawPlace(s);
        }, i * ms)));
      }
      return steps.length;
    }

    // One-shot location picking for the editor.
    function pick(cb) {
      el.classList.add('mk-picking');
      const done = (e) => { el.classList.remove('mk-picking'); cb(e ? e.latlng : null); };
      map.once('click', done);
      return () => { map.off('click', done); el.classList.remove('mk-picking'); };
    }
    function preview(lat, lng) {
      temp.clearLayers();
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      L.marker([lat, lng], { interactive: false, icon: L.divIcon({ className: 'mk-target', html: '<i></i>', iconSize: [34, 34], iconAnchor: [17, 17] }) }).addTo(temp);
      if (!map.getBounds().pad(-0.1).contains([lat, lng])) map.setView([lat, lng], Math.max(map.getZoom(), 5));
    }
    function waitTiles(ms = 2500) {
      return new Promise((res) => { let t = setTimeout(res, ms); tiles.once('load', () => { clearTimeout(t); setTimeout(res, 150); }); if (!tiles.isLoading || !tiles.isLoading()) setTimeout(res, 300); });
    }

    // Draws the current view + title band into a PNG (2x). Returns { blob, tiles: bool }.
    async function exportPNG(state, info = {}) {
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
      const size = map.getSize(), W = size.x, H = size.y, S = 2, box = el.getBoundingClientRect();
      const { col, names, places, steps } = layout(state);
      const P = (lat, lng) => map.latLngToContainerPoint([lat, lng]);

      // Legend rows measured first so the band fits.
      const meas = document.createElement('canvas').getContext('2d');
      meas.font = `500 15px ${FONT}`;
      const used = [...new Set(steps.map((s) => s.e.personId))];
      const rows = [[]]; let x = 0; const maxW = W - 48;
      for (const id of used) {
        const w = 18 + meas.measureText(names[id] || '').width + 26;
        if (x + w > maxW && rows[rows.length - 1].length) { rows.push([]); x = 0; }
        rows[rows.length - 1].push({ id, x }); x += w;
      }
      const band = 24 + 40 + (info.subtitle ? 24 : 0) + 12 + rows.length * 26 + 22;

      const cv = document.createElement('canvas');
      cv.width = W * S; cv.height = (H + band) * S;
      const c = cv.getContext('2d'); c.scale(S, S);
      c.fillStyle = '#F2F3EF'; c.fillRect(0, 0, W, H);

      // Tiles go through a scratch canvas so a CORS failure can't taint the export.
      let tilesOk = true;
      try {
        const tc = document.createElement('canvas'); tc.width = W * S; tc.height = H * S;
        const tx = tc.getContext('2d'); tx.scale(S, S);
        const f = getComputedStyle(el.querySelector('.leaflet-tile-pane')).filter;
        if ('filter' in tx && f && f !== 'none') tx.filter = f;
        el.querySelectorAll('.leaflet-tile-pane img.leaflet-tile-loaded').forEach((img) => {
          const r = img.getBoundingClientRect();
          tx.drawImage(img, r.left - box.left, r.top - box.top, r.width, r.height);
        });
        tx.getImageData(0, 0, 1, 1);
        c.drawImage(tc, 0, 0, W, H);
      } catch { tilesOk = false; }

      c.save(); c.beginPath(); c.rect(0, 0, W, H); c.clip();
      c.lineCap = 'round'; c.lineJoin = 'round';
      for (const s of steps) {
        if (!s.from) continue;
        const pts = arc([s.from.lat, s.from.lng], [s.e.lat, s.e.lng]).map((p) => P(p[0], p[1]));
        c.strokeStyle = s.color; c.lineWidth = 4; c.beginPath();
        pts.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y))); c.stroke();
        const a = pts[15], b = pts[17], m = pts[16], ang = Math.atan2(b.y - a.y, b.x - a.x);
        c.save(); c.translate(m.x, m.y); c.rotate(ang);
        c.beginPath(); c.moveTo(-6, -6); c.lineTo(7, 0); c.lineTo(-6, 6); c.closePath();
        c.fillStyle = s.color; c.fill(); c.lineWidth = 1.2; c.strokeStyle = '#000'; c.stroke(); c.restore();
      }
      const pl = Object.values(places);
      for (const p of pl) {
        const q = P(p.e.lat, p.e.lng), multi = p.people.size > 1;
        c.beginPath(); c.arc(q.x, q.y, multi ? 8 : 6.5, 0, Math.PI * 2);
        c.fillStyle = multi ? '#fff' : p.color; c.fill(); c.lineWidth = multi ? 3 : 2.5; c.strokeStyle = '#000'; c.stroke();
      }
      c.font = `500 14px ${FONT}`; c.textBaseline = 'middle';
      for (const p of pl) {
        const q = P(p.e.lat, p.e.lng), t = p.e.place || p.e.query || '';
        c.lineWidth = 4; c.strokeStyle = 'rgba(255,255,255,.95)'; c.strokeText(t, q.x + 13, q.y);
        c.fillStyle = '#000'; c.fillText(t, q.x + 13, q.y);
      }
      c.restore();
      c.font = `400 10px ${FONT}`; c.fillStyle = 'rgba(0,0,0,.55)'; c.textAlign = 'right'; c.textBaseline = 'alphabetic';
      c.fillText('© OpenStreetMap, © CARTO', W - 8, H - 8); c.textAlign = 'left';

      // Title band.
      c.fillStyle = '#fff'; c.fillRect(0, H, W, band);
      c.fillStyle = '#000'; c.fillRect(0, H, W, 4);
      let y = H + 24 + 32;
      c.textBaseline = 'alphabetic'; c.font = `600 34px ${FONT}`; c.fillText(info.title || '', 24, y);
      c.font = `500 15px ${FONT}`; c.fillStyle = '#000'; c.textAlign = 'right'; c.fillText('MapHeritage', W - 24, y); c.textAlign = 'left';
      if (info.subtitle) { y += 24; c.font = `400 16px ${FONT}`; c.fillStyle = '#444'; c.fillText(info.subtitle, 24, y); }
      y += 12;
      c.font = `500 15px ${FONT}`;
      rows.forEach((row) => {
        y += 26;
        row.forEach(({ id, x }) => { c.fillStyle = col[id]; c.fillRect(24 + x, y - 12, 12, 12); c.fillStyle = '#000'; c.fillText(names[id] || '', 24 + x + 18, y - 1); });
      });

      const blob = await new Promise((r) => cv.toBlob(r, 'image/png'));
      return { blob, tiles: tilesOk };
    }

    return { map, render, fit, pick, preview, waitTiles, exportPNG, invalidate: () => map.invalidateSize(), rerender: () => last && render(last, { fit: false }) };
  }

  function download(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  function slug(s) { return (s || 'family-map').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 60) || 'family-map'; }

  const rel = (r) => (/^(me|я|myself|сам|сама)$/i.test((r || '').trim()) ? '' : r || '');
  window.MapKit = { rel, create, colors, chrono, layout, COLORS, esc, hasGeo, download, slug, typeLabel };
})();
