/* MapHeritage: отрисовка семейной карты поверх Leaflet */
(function () {
  const COLORS = ['#B42A22', '#1F4E79', '#2F6B3A', '#7A3E8E', '#9A5F0C', '#1E7480', '#8A2F52', '#4A5668'];
  const TYPES = {
    birth: 'рождение', childhood: 'детство', study: 'учёба', work: 'работа', service: 'служба',
    war: 'война', evacuation: 'эвакуация', move: 'переезд', marriage: 'свадьба', death: 'смерть', other: '',
  };
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const hasGeo = (e) => Number.isFinite(e.lat) && Number.isFinite(e.lng);
  const keyOf = (e) => e.lat.toFixed(2) + ',' + e.lng.toFixed(2);

  function colors(people) {
    const m = {};
    (people || []).forEach((p, i) => (m[p.id] = COLORS[i % COLORS.length]));
    return m;
  }
  function chrono(events) {
    return events.map((e, i) => ({ e, i }))
      .sort((a, b) => (a.e.year ?? 9999) - (b.e.year ?? 9999) || a.i - b.i)
      .map((x) => x.e);
  }
  function arc(a, b) {
    const [y1, x1] = a, [y2, x2] = b;
    const cx = (x1 + x2) / 2 - (y2 - y1) * 0.22, cy = (y1 + y2) / 2 + (x2 - x1) * 0.22;
    const pts = [];
    for (let i = 0; i <= 24; i++) {
      const t = i / 24, u = 1 - t;
      pts.push([u * u * y1 + 2 * u * t * cy + t * t * y2, u * u * x1 + 2 * u * t * cx + t * t * x2]);
    }
    return pts;
  }
  function eventLine(e, names) {
    const bits = [e.when || (e.year ? String(e.year) : ''), names[e.personId], TYPES[e.type]].filter(Boolean);
    return `<li><b>${esc(bits.shift() || '')}</b> ${esc(bits.join(', '))}${e.note ? `<br><span>${esc(e.note)}</span>` : ''}</li>`;
  }

  function create(el, opts = {}) {
    const map = L.map(el, {
      zoomControl: opts.zoomControl !== false,
      scrollWheelZoom: opts.scrollWheelZoom !== false,
      worldCopyJump: true, zoomSnap: 0.25, minZoom: 2, maxZoom: 12,
    });
    map.attributionControl.setPrefix(false);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> © <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd', maxZoom: 12,
    }).addTo(map);
    map.setView([52, 30], 3);
    const group = L.layerGroup().addTo(map);
    let timers = [];

    function fit(events) {
      const pts = events.filter(hasGeo).map((e) => [e.lat, e.lng]);
      const pad = typeof opts.padding === 'function' ? opts.padding() : opts.padding || {};
      if (pts.length === 1) map.setView(pts[0], 6);
      else if (pts.length > 1) map.fitBounds(pts, {
        paddingTopLeft: pad.topLeft || [40, 40], paddingBottomRight: pad.bottomRight || [40, 40], maxZoom: 7,
      });
    }

    function render(state, o = {}) {
      timers.forEach(clearTimeout); timers = [];
      group.clearLayers();
      const col = colors(state.people), names = {};
      (state.people || []).forEach((p) => (names[p.id] = p.name));
      const events = (state.events || []).filter(hasGeo);
      if (o.fit !== false) fit(events);

      // Места: одно место — один маркер, во всплывающей подсказке все события там.
      const places = {};
      chrono(events).forEach((e) => {
        const k = keyOf(e);
        (places[k] ||= { e, list: [], people: new Set() }).list.push(e);
        places[k].people.add(e.personId);
      });

      // Шаги по хронологии; у каждого шага — откуда пришёл этот человек.
      const steps = [], last = {};
      chrono(events).forEach((e) => {
        const p = last[e.personId];
        const from = p && keyOf(p) !== keyOf(e) ? p : null;
        steps.push({ e, from, color: col[e.personId] || COLORS[7] });
        last[e.personId] = e;
      });

      const drawn = {};
      const highlight = o.highlight || new Set();
      function drawPlace(s) {
        const k = keyOf(s.e);
        if (highlight.has(s.e.id)) pulse(s.e, s.color);
        if (drawn[k]) return;
        const pl = places[k];
        drawn[k] = L.circleMarker([s.e.lat, s.e.lng], {
          radius: Math.min(4.5 + pl.list.length * 0.9, 9), weight: 1.5, color: '#1F2B3D',
          fillColor: pl.people.size > 1 ? '#FAFAF6' : s.color, fillOpacity: 1,
        })
          .bindTooltip(esc(s.e.place || s.e.query), { permanent: true, direction: 'right', offset: [7, 0], className: 'mk-label' })
          .bindPopup(`<div class="mk-pop"><h4>${esc(s.e.place)}</h4><ul>${pl.list.map((e) => eventLine(e, names)).join('')}</ul></div>`)
          .addTo(group);
      }
      function pulse(e, color) {
        const m = L.marker([e.lat, e.lng], {
          interactive: false,
          icon: L.divIcon({ className: 'mk-pulse', html: `<i style="border-color:${color}"></i>`, iconSize: [40, 40], iconAnchor: [20, 20] }),
        }).addTo(group);
        timers.push(setTimeout(() => group.removeLayer(m), 2200));
      }
      function drawRoute(s, animate) {
        const pts = arc([s.from.lat, s.from.lng], [s.e.lat, s.e.lng]);
        const line = L.polyline(pts, { color: s.color, weight: 2.4, opacity: 0.92, interactive: false, className: 'mk-route' }).addTo(group);
        const addArrow = () => {
          const a = map.latLngToLayerPoint(pts[11]), b = map.latLngToLayerPoint(pts[13]);
          const deg = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
          L.marker(pts[12], {
            interactive: false,
            icon: L.divIcon({
              className: 'mk-arrow', iconSize: [14, 14], iconAnchor: [7, 7],
              html: `<svg width="14" height="14" viewBox="-7 -7 14 14" style="transform:rotate(${deg}deg)"><path d="M-5,-4.5 L6,0 L-5,4.5 L-2.5,0 Z" fill="${s.color}"/></svg>`,
            }),
          }).addTo(group);
        };
        const path = line._path;
        if (animate && path && path.getTotalLength) {
          const len = path.getTotalLength();
          path.style.strokeDasharray = len; path.style.strokeDashoffset = len;
          path.getBoundingClientRect();
          path.style.transition = 'stroke-dashoffset .9s ease-in-out';
          path.style.strokeDashoffset = 0;
          timers.push(setTimeout(() => { path.style.strokeDasharray = ''; path.style.transition = ''; addArrow(); }, 950));
        } else addArrow();
      }

      const animate = o.animate && !reduced;
      if (!animate) {
        steps.forEach((s) => { if (s.from) drawRoute(s, false); });
        steps.forEach(drawPlace);
      } else {
        const ms = o.stepMs || 650;
        steps.forEach((s, i) => timers.push(setTimeout(() => {
          if (s.from) { drawRoute(s, true); timers.push(setTimeout(() => drawPlace(s), 850)); }
          else drawPlace(s);
        }, i * ms)));
      }
      return steps.length;
    }

    return { map, render, fit, invalidate: () => map.invalidateSize() };
  }

  window.MapKit = { create, colors, chrono, TYPES, COLORS, esc, hasGeo };
})();
