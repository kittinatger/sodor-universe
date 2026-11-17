"""Build terrain.js from reference/sodor-outline.png.

Tunnels listed in railways.js get a ridge raised over them, so run
tools/build_railways.py first. Requires numpy, pillow, scipy. Run from the repo root:
    python tools/build_terrain.py
"""
import base64
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "reference" / "sodor-outline.png"
OUT = ROOT / "terrain.js"
PREVIEW = Path(sys.argv[1]) if len(sys.argv) > 1 else None

STEP = 3          # map pixels per terrain grid cell
H_SCALE = 2000    # int16 encoding: stored = round(height * H_SCALE)

# Peaks in map-pixel coords (1200x883 outline map): x, y, height (world units), sigma (px)
PEAKS = [
    (650, 250, 8.5, 45),   # Culdee Fell
    (720, 330, 5.5, 60),   # Skarloey highlands / The Peak
    (600, 370, 4.5, 45),   # Shane Dooney
    (610, 430, 3.8, 40),   # Shen Ven
    (640, 500, 3.5, 45),   # Ward Fell
    (390, 250, 4.0, 50),   # Goby Deighan
    (330, 160, 3.5, 45),   # Clagh Ooyre
    (520, 300, 2.5, 120),  # central uplands
    (900, 330, 2.0, 80),   # eastern hills
    (760, 620, 1.5, 90),   # southern hills
]


def land_mask(rgb):
    r, g, b = (rgb[..., i].astype(np.int16) for i in range(3))
    # Land is green (G well above B); sea is blue; the white key box, black text
    # and scale bar have G ~= B and fall to sea. Threshold sits midway between
    # the land (G-B=109) and sea (G-B=-64) colours so the blurred NE coast
    # resolves at its true midpoint.
    return (g - b) > 22


def fractal_noise(shape, rng, octaves=5, base=6):
    out = np.zeros(shape, np.float32)
    amp, total = 1.0, 0.0
    for o in range(octaves):
        n = base * (2 ** o)
        grid = rng.standard_normal((n + 3, int(n * shape[1] / shape[0]) + 3)).astype(np.float32)
        up = ndimage.zoom(grid, (shape[0] / (grid.shape[0] - 3), shape[1] / (grid.shape[1] - 3)), order=3)
        out += amp * up[: shape[0], : shape[1]]
        total += amp
        amp *= 0.5
    return out / total


def tunnel_ridges(xx, yy):
    """A ridge over each tunnel: zero at both portals, highest midway."""
    out = np.zeros_like(xx)
    rail = ROOT / "railways.js"
    if not rail.exists():
        return out
    data = json.loads(rail.read_text(encoding="utf-8").split("=", 1)[1].strip().rstrip(";"))
    for t in data.get("tunnels", []):
        (ax, ay), (bx, by) = t["a"], t["b"]
        vx, vy = bx - ax, by - ay
        L2 = vx * vx + vy * vy or 1.0
        u = ((xx - ax) * vx + (yy - ay) * vy) / L2
        along = np.where((u > 0) & (u < 1), np.sin(np.pi * np.clip(u, 0, 1)), 0.0)
        cx, cy = ax + np.clip(u, 0, 1) * vx, ay + np.clip(u, 0, 1) * vy
        across = np.exp(-((xx - cx) ** 2 + (yy - cy) ** 2) / (2 * 17.0 ** 2))
        out = np.maximum(out, (2.3 + 0.05 * np.sqrt(L2)) * np.sqrt(along) * across)
    return out


def main():
    rgb = np.asarray(Image.open(SRC).convert("RGB"))
    H, W = rgb.shape[:2]

    land = land_mask(rgb)
    land = ndimage.binary_fill_holes(land)                 # labels inside Isle of Man / England
    land = ndimage.binary_opening(land, iterations=1)       # drop stray anti-aliased specks
    labels, n = ndimage.label(land)
    sizes = ndimage.sum(land, labels, range(1, n + 1))
    keep = [i + 1 for i, s in enumerate(sizes) if s > 500]
    land = np.isin(labels, keep)
    labels, n = ndimage.label(land)
    sizes = ndimage.sum(land, labels, range(1, n + 1))
    sodor_id = int(np.argmax(sizes)) + 1

    region = np.zeros((H, W), np.uint8)
    region[land] = 3                                        # other land (England / Isle of Man)
    for i in range(1, n + 1):
        if i == sodor_id:
            continue
        xs = np.nonzero(labels == i)[1]
        if xs.mean() < W / 2:
            region[labels == i] = 2                         # Isle of Man (west)
    region[labels == sodor_id] = 1

    d_in = ndimage.distance_transform_edt(land)
    d_out = ndimage.distance_transform_edt(~land)
    sdf = np.where(land, d_in, -d_out).astype(np.float32)
    sdf = ndimage.gaussian_filter(sdf, 1.0)

    rng = np.random.default_rng(1945)                       # Railway Series first published
    noise = fractal_noise((H, W), rng)

    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    peaks = np.zeros((H, W), np.float32)
    for px, py, ph, sg in PEAKS:
        peaks += ph * np.exp(-((xx - px) ** 2 + (yy - py) ** 2) / (2 * sg * sg))

    d = np.maximum(sdf, 0)
    rise = 1 - np.exp(-d / 35)
    inland = 1 - np.exp(-d / 25)
    sodor_h = 0.25 + 2.2 * rise + peaks * inland + 0.9 * noise * inland + tunnel_ridges(xx, yy)
    other_h = 0.25 + 1.6 * rise + 0.8 * noise * inland
    land_h = np.where(region == 1, sodor_h, other_h)
    land_h = np.maximum(land_h, 0.12)

    sea_d = np.maximum(-sdf, 0)
    sea_h = -0.35 - 3.0 * (1 - np.exp(-sea_d / 40)) + 0.25 * noise
    sea_h = np.minimum(sea_h, -0.08)

    height = np.where(land, land_h, sea_h).astype(np.float32)
    height = ndimage.gaussian_filter(height, 1.2)
    # Re-pin the shoreline: smoothing must not move the coast off the traced edge.
    height = np.where(land, np.maximum(height, 0.06), np.minimum(height, -0.06))

    rows = (H - 1) // STEP + 1
    cols = (W - 1) // STEP + 1
    gy = np.arange(rows) * STEP
    gx = np.arange(cols) * STEP
    hg = height[np.ix_(gy, gx)]
    rg = region[np.ix_(gy, gx)]

    h16 = np.clip(np.round(hg * H_SCALE), -32768, 32767).astype("<i2")
    payload = {
        "cols": int(cols), "rows": int(rows), "step": STEP,
        "imgW": int(W), "imgH": int(H), "hScale": H_SCALE,
        "heights": base64.b64encode(h16.tobytes()).decode(),
        "region": base64.b64encode(rg.astype(np.uint8).tobytes()).decode(),
    }
    OUT.write_text("window.SODOR_TERRAIN = " + json.dumps(payload) + ";\n", encoding="utf-8")

    grid_land = hg > 0
    ref_land = land[np.ix_(gy, gx)]
    iou = (grid_land & ref_land).sum() / (grid_land | ref_land).sum()
    print(f"grid {cols}x{rows}, sodor px={int((region == 1).sum())}, "
          f"height range {hg.min():.2f}..{hg.max():.2f}, coastline IoU vs map = {iou:.4f}")
    print(f"wrote {OUT} ({OUT.stat().st_size / 1024:.0f} KB)")

    if PREVIEW:
        shade = np.clip((hg + 3.5) / 12.5, 0, 1)
        img = np.zeros((rows, cols, 3), np.uint8)
        img[..., 0] = np.where(hg > 0, 60 + 160 * shade, 20)
        img[..., 1] = np.where(hg > 0, 120 + 120 * shade, 60 + 60 * shade)
        img[..., 2] = np.where(hg > 0, 50 + 60 * shade, 140 + 100 * shade)
        img[rg == 1, 0] = np.minimum(255, img[rg == 1, 0] + 25)
        Image.fromarray(img).resize((cols * 2, rows * 2), Image.NEAREST).save(PREVIEW)
        print(f"preview {PREVIEW}")


if __name__ == "__main__":
    main()
