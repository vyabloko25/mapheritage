#!/usr/bin/env python3
"""Builds the MapHeritage vector base map from Natural Earth (public domain).

Output (public/geo/):
  l0.json          110m world (small scale)
  l1.json          50m world
  t/<x>-<y>.json   10m data cut into an 8x8 Web-Mercator grid (loaded on demand)
  relief.jpg       hillshade in Web Mercator (grey 128 = flat), from ETOPO5 classes (NOAA, public domain)
  depth.jpg        shallow water mask in Web Mercator (white = shelf)

Format: coordinates are normalised Web Mercator (x, y in 0..1, y down), quantised to 2^Q
and delta-encoded: [x0, y0, dx1, dy1, ...]. Layers:
  land:    [polygon] polygon = [ring, ...]              (fill only; may be cut at tile edges)
  coast:   [line]                                       (the real coastline, for strokes)
  lakes:   [[min_zoom, polygon]]
  lakeEdge:[[min_zoom, line]]
  rivers:  [[min_zoom, line]]
  borders: [[disputed 0/1, line]]

Usage: python3 tools/build_geo.py <natural-earth-geojson-dir> <etopo-poly.shp> <out-dir>
Data: https://github.com/nvkelso/natural-earth-vector (geojson/), ETOPO5 polygons:
https://github.com/jonahadkins/five-minute-topo
"""
import json, math, os, sys
from shapely.geometry import shape, box, LineString, MultiLineString, Polygon, MultiPolygon, GeometryCollection
from shapely.ops import transform
import numpy as np
import shapely

SRC, SHP, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
MAXLAT = 85.0511287798

def merc(lng, lat, z=None):
    lat = max(-MAXLAT, min(MAXLAT, lat))
    x = (lng + 180.0) / 360.0
    s = math.sin(math.radians(lat))
    y = 0.5 - math.log((1 + s) / (1 - s)) / (4 * math.pi)
    return (x, y)

def _merc_arr(c):
    lng, lat = c[:, 0], np.clip(c[:, 1], -MAXLAT, MAXLAT)
    s = np.sin(np.radians(lat))
    return np.column_stack([(lng + 180.0) / 360.0, 0.5 - np.log((1 + s) / (1 - s)) / (4 * math.pi)])

def proj(g):
    return shapely.transform(g, _merc_arr)

def load(name):
    with open(os.path.join(SRC, name + '.geojson')) as f:
        return json.load(f)['features']

def enc(coords, Q):
    k = 2 ** Q
    out, px, py, first = [], 0, 0, True
    for x, y in coords:
        ix, iy = int(round(x * k)), int(round(y * k))
        if first:
            out += [ix, iy]; first = False
        elif ix != px or iy != py:
            out += [ix - px, iy - py]
        else:
            continue
        px, py = ix, iy
    return out if len(out) >= 4 else None

def polys(g):
    if g.is_empty: return []
    if isinstance(g, Polygon): return [g]
    if isinstance(g, (MultiPolygon, GeometryCollection)):
        r = []
        for p in g.geoms: r += polys(p)
        return r
    return []

def lines(g):
    if g.is_empty: return []
    if isinstance(g, LineString): return [g]
    if isinstance(g, (MultiLineString, GeometryCollection)):
        r = []
        for p in g.geoms: r += lines(p)
        return r
    if isinstance(g, Polygon): return [LineString(g.exterior.coords)] + [LineString(i.coords) for i in g.interiors]
    return []

def enc_poly(p, Q, minring=3):
    rings = [enc(p.exterior.coords, Q)] + [enc(i.coords, Q) for i in p.interiors]
    rings = [r for r in rings if r and len(r) >= 2 * minring]
    return rings if rings else None

def build(level, clip=None, tol=0.0, Q=20):
    """level: '110m' | '50m' | '10m'. clip: shapely box in mercator or None."""
    out = {'land': [], 'coast': [], 'lakes': [], 'lakeEdge': [], 'rivers': [], 'borders': []}
    def prep(geom):
        g = proj(shape(geom))
        if tol: g = g.simplify(tol, preserve_topology=True)
        return g
    for f in cache[level]['land']:
        g = f['_g']
        if clip is not None:
            if not g.intersects(clip): continue
            g = g.intersection(clip)
        for p in polys(g):
            r = enc_poly(p, Q)
            if r: out['land'].append(r)
    for f in cache[level]['coast']:
        g = f['_g']
        if clip is not None:
            if not g.intersects(clip): continue
            g = g.intersection(clip)
        for l in lines(g):
            r = enc(l.coords, Q)
            if r: out['coast'].append(r)
    for f in cache[level]['lakes']:
        g, mz = f['_g'], f['_mz']
        if clip is not None:
            if not g.intersects(clip): continue
            gg = g.intersection(clip); edge = g.boundary.intersection(clip)
        else:
            gg = g; edge = g.boundary
        for p in polys(gg):
            r = enc_poly(p, Q)
            if r: out['lakes'].append([mz, r])
        if clip is None: continue  # untiled levels: lake outlines are the lake rings themselves
        for l in lines(edge):
            r = enc(l.coords, Q)
            if r: out['lakeEdge'].append([mz, r])
    for key, arr in (('rivers', 'rivers'), ('borders', 'borders')):
        for f in cache[level][key]:
            g = f['_g']
            if clip is not None:
                if not g.intersects(clip): continue
                g = g.intersection(clip)
            for l in lines(g):
                r = enc(l.coords, Q)
                if r: out[arr].append([f['_mz'], r])
    return out

names = {
    '110m': dict(land='ne_110m_land', coast='ne_110m_coastline', lakes='ne_110m_lakes', rivers='ne_110m_rivers_lake_centerlines', borders='ne_110m_admin_0_boundary_lines_land'),
    '50m': dict(land='ne_50m_land', coast='ne_50m_coastline', lakes='ne_50m_lakes', rivers='ne_50m_rivers_lake_centerlines', borders='ne_50m_admin_0_boundary_lines_land'),
    '10m': dict(land='ne_10m_land', coast='ne_10m_coastline', lakes='ne_10m_lakes', rivers='ne_10m_rivers_lake_centerlines', borders='ne_10m_admin_0_boundary_lines_land'),
}
TOL = {'110m': 0.0, '50m': 2.5e-5, '10m': 3e-6}
cache = {}
for lv, nm in names.items():
    cache[lv] = {}
    for k, fn in nm.items():
        feats = []
        for f in load(fn):
            if not f.get('geometry'): continue
            p = f['properties']
            g = proj(shape(f['geometry']))
            if TOL[lv]: g = g.simplify(TOL[lv], preserve_topology=True)
            if not g.is_valid and k in ('land', 'lakes'): g = g.buffer(0)
            mz = p.get('min_zoom', p.get('MIN_ZOOM', 0)) or 0
            if k == 'borders':
                cls = (p.get('FEATURECLA') or p.get('featurecla') or '').lower()
                mz = 1 if ('disputed' in cls or 'line of control' in cls or 'indefinite' in cls) else 0
            feats.append({'_g': g, '_mz': round(float(mz), 1)})
        cache[lv][k] = feats
    print('loaded', lv, {k: len(v) for k, v in cache[lv].items()})

os.makedirs(os.path.join(OUT, 't'), exist_ok=True)
def dump(obj, path):
    with open(path, 'w') as f: json.dump(obj, f, separators=(',', ':'))
    return os.path.getsize(path)

print('l0', dump({'q': 18, **build('110m', Q=18)}, os.path.join(OUT, 'l0.json')))
print('l1', dump({'q': 20, **build('50m', Q=20)}, os.path.join(OUT, 'l1.json')))
N, total, index = 8, 0, []
for tx in range(N):
    for ty in range(N):
        pad = 0.0005
        clip = box(tx / N - pad, ty / N - pad, (tx + 1) / N + pad, (ty + 1) / N + pad)
        d = build('10m', clip=clip, Q=22)
        if not any(d[k] for k in d): continue
        total += dump({'q': 22, **d}, os.path.join(OUT, 't', f'{tx}-{ty}.json'))
        index.append(f'{tx}-{ty}')
dump({'n': N, 'tiles': index}, os.path.join(OUT, 't', 'index.json'))
print('10m tiles', len(index), total)

# ---------- relief from ETOPO5 elevation classes ----------
import shapefile
from PIL import Image, ImageDraw
W, H = 4320, 2160
ELEV = {'L1': 75, 'L2': 225, 'L3': 450, 'L4': 1000, 'L5': 2200, 'L6': 4000, 'W1': -100, 'W2': -3000, 'W3': -7000}
elev = np.zeros((H, W), np.float32) - 3000
r = shapefile.Reader(SHP)
order = ['W3', 'W2', 'W1', 'L1', 'L2', 'L3', 'L4', 'L5', 'L6']
recs = {rec['class']: i for i, rec in enumerate(r.records())}
for cls in order:
    s = r.shape(recs[cls])
    mask = np.zeros((H, W), bool)
    pts = s.points; parts = list(s.parts) + [len(pts)]
    for a, b in zip(parts[:-1], parts[1:]):
        ring = pts[a:b]
        xs = [(p[0] + 180) / 360 * W for p in ring]; ys = [(90 - p[1]) / 180 * H for p in ring]
        x0, x1 = max(0, int(min(xs)) - 1), min(W, int(max(xs)) + 2); y0, y1 = max(0, int(min(ys)) - 1), min(H, int(max(ys)) + 2)
        if x1 - x0 < 1 or y1 - y0 < 1: continue
        im = Image.new('1', (x1 - x0, y1 - y0), 0)
        ImageDraw.Draw(im).polygon([(x - x0, y - y0) for x, y in zip(xs, ys)], fill=1)
        mask[y0:y1, x0:x1] ^= np.array(im, bool)
    elev[mask] = ELEV[cls]
    print('class', cls, int(mask.sum()))

def blur(a, r, n=3):
    for _ in range(n):
        for ax in (0, 1):
            c = np.cumsum(np.pad(a, [(r + 1, r) if i == ax else (0, 0) for i in range(2)], mode='wrap' if ax == 1 else 'edge'), axis=ax)
            a = (np.take(c, range(2 * r + 1, c.shape[ax]), axis=ax) - np.take(c, range(0, c.shape[ax] - 2 * r - 1), axis=ax)) / (2 * r + 1)
    return a

land = elev > 0
e = np.where(land, elev, 0).astype(np.float32)
e = blur(e, 2) * 0.6 + blur(e, 6) * 0.4
lat = np.radians(90 - (np.arange(H) + 0.5) / H * 180)[:, None]
cell = 2 * math.pi * 6371000 / W
dzdx = (np.roll(e, -1, 1) - np.roll(e, 1, 1)) / (2 * cell * np.maximum(np.cos(lat), 0.05))
dzdy = (np.vstack([e[1:], e[-1:]]) - np.vstack([e[:1], e[:-1]])) / (2 * cell)
zf = 18.0
slope = np.arctan(zf * np.hypot(dzdx, dzdy)); aspect = np.arctan2(dzdy, -dzdx)
az, alt = math.radians(315), math.radians(42)
shade = np.sin(alt) * np.cos(slope) + np.cos(alt) * np.sin(slope) * np.cos(az - (math.pi / 2 - aspect) + math.pi)
flat = math.sin(alt)
val = np.clip(128 + (shade - flat) * 260, 0, 255)
landsoft = blur(land.astype(np.float32), 1, 1)
val = 128 + (val - 128) * landsoft
shelf = blur(((elev > -200) & (elev <= 0)).astype(np.float32), 3, 2)

def to_merc(img, size):
    ys = (np.arange(size) + 0.5) / size
    lat_m = np.degrees(np.arctan(np.sinh(math.pi * (1 - 2 * ys))))
    src_y = np.clip((90 - lat_m) / 180 * H - 0.5, 0, H - 1)
    xs = np.clip((np.arange(size) + 0.5) / size * W - 0.5, 0, W - 1)
    y0 = np.floor(src_y).astype(int); y1 = np.minimum(y0 + 1, H - 1); fy = (src_y - y0)[:, None]
    x0 = np.floor(xs).astype(int); x1 = np.minimum(x0 + 1, W - 1); fx = (xs - x0)[None, :]
    a = img[y0][:, x0] * (1 - fx) + img[y0][:, x1] * fx
    b = img[y1][:, x0] * (1 - fx) + img[y1][:, x1] * fx
    return a * (1 - fy) + b * fy

Image.fromarray(to_merc(val, 4096).astype(np.uint8), 'L').save(os.path.join(OUT, 'relief.jpg'), quality=82, optimize=True)
Image.fromarray(np.clip(to_merc(shelf, 2048) * 255, 0, 255).astype(np.uint8), 'L').save(os.path.join(OUT, 'depth.jpg'), quality=85, optimize=True)
print('relief', os.path.getsize(os.path.join(OUT, 'relief.jpg')), 'depth', os.path.getsize(os.path.join(OUT, 'depth.jpg')))
