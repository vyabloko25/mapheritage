"""Relief data for MapHeritage (all sources public domain):
  - elevation: ETOPO10, a 10 arc-minute model derived from NOAA ETOPO1 (https://github.com/g2e/etopo10)
  - hillshade detail: Natural Earth "Cross Blended Hypso with Shaded Relief" 1:50m (shadedrelief.jpg, as shipped with basemap-data)
Writes to public/geo:
  elev.png   4096² Web Mercator, land elevation coded as 255 * sqrt(h / 6000) (0 = sea or below 0 m)
  relief.jpg 4096² Web Mercator hillshade, grey 128 = flat, darker = shadow (light from the north-west)
Usage: python3 tools/build_relief.py etopo10_ice_g_i2.bin shadedrelief.jpg public/geo
"""
import sys, os, math
import numpy as np
from PIL import Image
BIN, NE, OUT = sys.argv[1:4]
NC, NR = 2161, 1081
dem = np.fromfile(BIN, '<i2').reshape(NR, NC).astype(np.float32)[:, :2160]  # rows run north to south; drop the duplicate 180° column

def merc_rows(size, src_h):
    ys = (np.arange(size) + 0.5) / size
    lat = np.degrees(np.arctan(np.sinh(math.pi * (1 - 2 * ys))))
    return np.clip((90 - lat) / 180 * src_h - 0.5, 0, src_h - 1)

def resample(img, size):
    """Equirectangular → Web Mercator, bicubic (via PIL) on float data."""
    h, w = img.shape
    big = np.array(Image.fromarray(img, 'F').resize((size, h * 2), Image.BICUBIC))  # widen first
    rows = merc_rows(size, big.shape[0]); r0 = np.floor(rows).astype(int); r1 = np.minimum(r0 + 1, big.shape[0] - 1); fr = (rows - r0)[:, None]
    return big[r0] * (1 - fr) + big[r1] * fr

N = 4096
h = resample(dem, N)
land = h > 0
# ---- elevation field
code = np.where(land, 255 * np.sqrt(np.clip(h, 0, 6000) / 6000), 0)
code = np.where(land & (code < 1), 1, code)
Image.fromarray(np.clip(np.round(code), 0, 255).astype(np.uint8), 'L').save(os.path.join(OUT, 'elev.png'), optimize=True)

# ---- broad hillshade from the DEM (multi-directional, soft)
lat = np.degrees(np.arctan(np.sinh(math.pi * (1 - 2 * (np.arange(N) + 0.5) / N))))[:, None]
cell = 2 * math.pi * 6371000 / N * np.cos(np.radians(lat))  # metres per mercator pixel
hz = np.where(land, h, 0)
gx = (np.roll(hz, -1, 1) - np.roll(hz, 1, 1)) / (2 * cell)
gy = (np.vstack([hz[1:], hz[-1:]]) - np.vstack([hz[:1], hz[:-1]])) / (2 * cell)
def shade(az, alt, zf):
    slope = np.arctan(zf * np.hypot(gx, gy)); aspect = np.arctan2(-gy, gx)
    a = math.radians(90 - az)
    return np.sin(math.radians(alt)) * np.cos(slope) + np.cos(math.radians(alt)) * np.sin(slope) * np.cos(a - aspect)
s = 0.6 * shade(315, 40, 9) + 0.25 * shade(270, 45, 9) + 0.15 * shade(0, 45, 9)
flat = math.sin(math.radians(40)) * 0.6 + math.sin(math.radians(45)) * 0.4
broad = (s - flat)

# ---- fine detail from the Natural Earth shaded relief: luminance high-pass (the hypsometric colours vary slowly)
ne = np.asarray(Image.open(NE).convert('L'), np.float32)
def blur(a, r):
    for _ in range(3):
        for ax in (0, 1):
            c = np.cumsum(np.pad(a, [(r + 1, r) if i == ax else (0, 0) for i in range(2)], mode='wrap' if ax == 1 else 'edge'), axis=ax)
            a = (np.take(c, range(2 * r + 1, c.shape[ax]), axis=ax) - np.take(c, range(0, c.shape[ax] - 2 * r - 1), axis=ax)) / (2 * r + 1)
    return a
# land mask on the Natural Earth grid (from the DEM), so the high-pass ignores the sea and fades out at the coast
dne = np.array(Image.fromarray(dem, 'F').resize((ne.shape[1], ne.shape[0]), Image.BILINEAR)) > 0
lm = dne.astype(np.float32)
mean = blur(ne * lm, 10) / np.maximum(blur(lm, 10), 1e-3)
detail = np.where(dne, ne / np.maximum(mean, 1) - 1, 0)  # ~0 on flat ground
detail *= np.clip((blur(lm, 5) - 0.55) * 3, 0, 1)
dm = np.array(Image.fromarray(detail.astype(np.float32), 'F').resize((N, ne.shape[0] * N // ne.shape[1] * 1), Image.BILINEAR))
rows = merc_rows(N, dm.shape[0]); r0 = np.floor(rows).astype(int); r1 = np.minimum(r0 + 1, dm.shape[0] - 1); fr = (rows - r0)[:, None]
dmm = dm[r0] * (1 - fr) + dm[r1] * fr

val = 128 + broad * 210 + dmm * 330
soft = blur(land.astype(np.float32), 1)
val = 128 + (val - 128) * soft
Image.fromarray(np.clip(val, 0, 255).astype(np.uint8), 'L').save(os.path.join(OUT, 'relief.jpg'), quality=86, optimize=True)
print('elev', os.path.getsize(os.path.join(OUT, 'elev.png')), 'relief', os.path.getsize(os.path.join(OUT, 'relief.jpg')), 'max h', float(h.max()))
