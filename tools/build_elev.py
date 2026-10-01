"""Elevation-class field for the relief styles (hypsometric tints, contours, hachures, pictorial mountains).

Writes public/geo/elev.png: 4096x4096 Web Mercator, grey = smoothed class index * 40
(0 = sea/below 0 m, 1 = 0–150 m, 2 = 150–300, 3 = 300–600, 4 = 600–1500, 5 = 1500–3000, 6 = over 3000 m).
Source: ETOPO5 elevation classes (NOAA, public domain), https://github.com/jonahadkins/five-minute-topo
Usage: python3 tools/build_elev.py /path/to/etopo-poly.shp public/geo
"""
import sys, os, math
import numpy as np, shapefile
from PIL import Image, ImageDraw

SHP, OUT = sys.argv[1], sys.argv[2]
W, H = 4320, 2160
LEVEL = {'L1': 1, 'L2': 2, 'L3': 3, 'L4': 4, 'L5': 5, 'L6': 6, 'W1': 0, 'W2': 0, 'W3': 0}
lev = np.zeros((H, W), np.float32)
r = shapefile.Reader(SHP)
recs = {rec['class']: i for i, rec in enumerate(r.records())}
for cls in ['W3', 'W2', 'W1', 'L1', 'L2', 'L3', 'L4', 'L5', 'L6']:
    s = r.shape(recs[cls]); pts = s.points; parts = list(s.parts) + [len(pts)]
    mask = np.zeros((H, W), bool)
    for a, b in zip(parts[:-1], parts[1:]):
        ring = pts[a:b]
        xs = [(p[0] + 180) / 360 * W for p in ring]; ys = [(90 - p[1]) / 180 * H for p in ring]
        x0, x1 = max(0, int(min(xs)) - 1), min(W, int(max(xs)) + 2); y0, y1 = max(0, int(min(ys)) - 1), min(H, int(max(ys)) + 2)
        if x1 - x0 < 1 or y1 - y0 < 1: continue
        im = Image.new('1', (x1 - x0, y1 - y0), 0)
        ImageDraw.Draw(im).polygon([(x - x0, y - y0) for x, y in zip(xs, ys)], fill=1)
        mask[y0:y1, x0:x1] ^= np.array(im, bool)
    lev[mask] = LEVEL[cls]

def blur(a, r, n=3):
    for _ in range(n):
        for ax in (0, 1):
            c = np.cumsum(np.pad(a, [(r + 1, r) if i == ax else (0, 0) for i in range(2)], mode='wrap' if ax == 1 else 'edge'), axis=ax)
            a = (np.take(c, range(2 * r + 1, c.shape[ax]), axis=ax) - np.take(c, range(0, c.shape[ax] - 2 * r - 1), axis=ax)) / (2 * r + 1)
    return a

lev = blur(lev, 1, 2)

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

out = np.clip(to_merc(lev, 4096) * 40, 0, 255).astype(np.uint8)
Image.fromarray(out, 'L').save(os.path.join(OUT, 'elev.png'), optimize=True)
print('elev.png', os.path.getsize(os.path.join(OUT, 'elev.png')))
