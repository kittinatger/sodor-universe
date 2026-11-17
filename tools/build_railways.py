"""Build railways.js: stations and track routes for the 3D scene.

Source: reference/sodor-railways.png (detailed railway map, 1400x1085).
Tracks are routed along the drawn line colours with a least-cost path between
consecutive stops, then warped onto the outline map used for the terrain
(reference/sodor-outline.png, 1200x883) with a thin-plate spline fitted on
stations that appear on both maps.

Requires numpy, pillow, scipy, scikit-image. Run from the repo root:
    python tools/build_railways.py [preview_dir]
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage
from scipy.interpolate import RBFInterpolator
from skimage.graph import route_through_array

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "reference" / "sodor-railways.png"
OUTLINE = ROOT / "reference" / "sodor-outline.png"
OUT = ROOT / "railways.js"
PREVIEW = Path(sys.argv[1]) if len(sys.argv) > 1 else None

# ---------------------------------------------------------------- stations
# (x, y) on the railway map -> name (None = unnamed halt). Matched to the
# nearest detected dot; kind "M" entries are added by hand (not drawn as dots).
NAMES = {
    (613, 325): "Peel Godred", (752, 328): "Devil's Back", (778, 329): "Culdee Fell Summit",
    (649, 333): None, (720, 353): "Skarloey Road", (656, 356): "Shiloh",
    (367, 364): "Arlesdale Green", (329, 369): "Marthwaite", (393, 389): "Arlesdale",
    (296, 390): "Arlesburgh Bridge Street", (664, 399): "Strawberry Grove", (633, 400): "Kirk Machan",
    (243, 402): "Arlesburgh Harbour", (720, 404): "Mountain Village", (202, 416): "Arlesburgh West",
    (1302, 426): "Barrow-in-Furness", (1057, 433): "Middle Station", (1250, 434): None,
    (248, 441): "Tidmouth Bay", (163, 445): "Bluff's Cove", (1274, 445): "Vicarstown",
    (836, 448): "Lakeside", (322, 449): "Lower Arlesburgh", (595, 450): None,
    (864, 454): "Rheneas", (796, 455): "Tea Room", (370, 460): "Arlesdale End",
    (438, 478): "Ulfstead", (133, 480): "Haultraugh", (283, 482): "Hackenbeck",
    (509, 486): None, (842, 486): "Skarloey", (314, 493): "Ffarquhar",
    (1015, 509): "Great Waterton", (238, 506): "Maithwaite", (105, 509): "Tidmouth Hault",
    (635, 529): "Hawin Lane", (120, 551): "Callandale", (198, 574): "Elsbridge",
    (922, 576): "Glennock", (1161, 582): "Ballahoo", (99, 587): "Tidmouth",
    (631, 594): "Abbey", (91, 611): "Lower Tidmouth", (149, 619): "Toryreck",
    (1239, 636): None, (609, 647): "Cronk", (1265, 652): "Norramby",
    (139, 653): "Dryaw", (1041, 657): "Cros-ny-Cuirn", (154, 659): None,
    (342, 659): "Wellsworth", (397, 659): "Miner's Halt", (511, 659): "Maron",
    (205, 668): "Crosby", (659, 675): "Killdane", (1092, 705): "Crovan's Gate",
    (700, 730): "Balladrine", (606, 749): "Killaban", (495, 767): "Lower Suddery",
    (754, 792): "Kellaby", (931, 818): "Kellsthorpe Road", (854, 866): "Rolf's Castle",
    (716, 867): "Cabalnoo", (504, 900): "Brendam", (492, 922): "Brendam Docks",
    (784, 949): "Kirk Ronan",
    (702, 413): "Slate Quarry", (358, 469): "Ffarquhar Quarry", (974, 588): "Bluebell Valley",
    (543, 770): "Search and Rescue Centre", (87, 630): "Knapford",
}
MANUAL = [
    (477, 742, "Suddery"), (721, 301, "Callan Castle"),
    (385, 362, None), (404, 365, None), (416, 378, None), (471, 389, "Cas-ny-Hawin"),
    (478, 360, "Ulfstead Road"), (498, 367, None), (520, 369, "Ballamoodey"),
    (564, 372, None), (607, 361, None),
]
SKIP = {(1285, 443), (100, 578), (349, 662), (435, 844)}   # bridge marker, platform doubles, off-rail

# ---------------------------------------------------------------- lines
# stops: station coords (x, y) in order; ("via", x, y) steers the router without a stop.
LINES = [
    dict(id="main", name="Main Line", color="e0446f", kind="standard", mask="pink", stops=[
        (99,587),(91,611),(87,630),(130,708),(176,682),(205,668),(248,653),(294,653),(342,659),
        (397,659),(447,666),(511,659),(573,654),(609,647),(659,675),(700,730),(754,792),(814,826),
        (849,824),(931,818),(991,784),(1092,705),(1105,688),("via",1110,580),(1131,484),
        (1274,445),(1302,426)]),
    dict(id="cabalnoo", name="Cabalnoo Loop", color="f290b0", kind="standard", mask="pink", stops=[
        (511,659),("via",538,700),(543,770),("via",575,724),(606,749),("via",640,840),(716,867),
        (754,914),("via",790,880),(814,826)]),
    dict(id="waterton", name="Great Waterton Spur", color="f290b0", kind="standard", mask="pink", stops=[
        (1131,484),("via",1075,512),(1015,509)]),
    dict(id="littlewest", name="The Little Western", color="2f9e5a", kind="standard", mask="blue", stops=[
        (99,587),(101,553),(103,534),(105,509),(133,480),(163,445),(202,416),(243,402)]),
    dict(id="ffarquhar", name="Ffarquhar Branch", color="3d8fe0", kind="standard", mask="blue", stops=[
        (139,653),(148,632),(149,619),(150,609),(198,574),(219,552),(226,538),(238,506),(283,482),(314,493)]),
    dict(id="elsbridge", name="Elsbridge Link", color="7ab4ee", kind="standard", mask="blue", stops=[
        (198,574),(234,614),(248,653)]),
    dict(id="callandale", name="Callandale Line", color="5aa0d8", kind="standard", mask="blue", stops=[
        (101,553),(120,551),(198,574)]),
    dict(id="ulfstead", name="Ulfstead Branch", color="46b0c8", kind="standard", mask="blue", stops=[
        (163,445),(248,441),(322,449),(370,460),(438,478),(410,513),(475,556),(465,598),(459,626),(511,659)]),
    dict(id="brendam", name="Brendam Branch", color="2a55c8", kind="standard", mask="blue", stops=[
        (395,671),(418,690),(477,742),(495,767),(512,799),(516,822),(512,885),(504,900),(506,912),(492,922)]),
    dict(id="peelgodred", name="Peel Godred Branch", color="9b4dd6", kind="standard", mask="blue", stops=[
        (659,675),(631,594),(635,529),(633,497),(633,400),(649,333),(613,325)]),
    dict(id="callan", name="Callan Castle Spur", color="b98ae6", kind="standard", mask="blue", stops=[
        (649,333),(721,301)]),
    dict(id="slate", name="Slate Quarry Spur", color="8a9ab0", kind="standard", mask="blue", stops=[
        (633,497),(702,413)]),
    dict(id="kirkronan", name="Kirk Ronan Branch", color="8bd35a", kind="standard", mask="blue", stops=[
        (931,818),(854,866),("via",815,905),(784,949)]),
    dict(id="norramby", name="Norramby Branch", color="b07a40", kind="standard", mask="blue", stops=[
        (1092,705),(1142,638),(1161,582),(1225,632),(1239,636),(1265,652)]),
    dict(id="hawin", name="Hawin Valley Line", color="4fc0a0", kind="standard", mask="blue", stops=[
        (1015,509),("via",950,494),(914,534),(974,588),(1002,615),("via",1080,640),(1142,638)]),
    dict(id="skarloey", name="Skarloey Railway", color="f08a2a", kind="narrow", mask="ng", stops=[
        (1092,705),(1041,657),(1002,615),(974,588),(922,576),(842,486),(836,448),(796,455),
        (720,404),(664,399),(633,400),(595,450),(509,486),(475,556),(410,513)]),
    dict(id="rheneas", name="Rheneas Spur", color="f08a2a", kind="narrow", mask="ng", stops=[
        (836,448),(864,454),(883,458)]),
    dict(id="vicarstown_ng", name="Vicarstown Extension", color="f5a862", kind="narrow", mask="ng", stops=[
        (883,458),("via",905,492),(1057,433),(1250,434)]),
    dict(id="culdeefell", name="Culdee Fell Railway", color="d8d8d8", kind="rack", mask="cfr", stops=[
        (633,400),(656,356),(720,353),(752,328),(778,329)]),
    dict(id="arlesdale", name="Arlesdale Railway", color="d9a066", kind="miniature", mask=None, stops=[
        (243,402),(296,390),(329,369),(367,364),(393,389)]),
    dict(id="midsodor", name="Mid Sodor Railway (closed)", color="8f8f8f", kind="closed", mask=None, stops=[
        (367,364),(385,362),(404,365),(416,378),(471,389),(498,367),(520,369),(564,372),(607,361)]),
    dict(id="midsodor_ur", name="Mid Sodor Railway (closed)", color="8f8f8f", kind="closed", mask=None, stops=[
        (498,367),(478,360)]),
]

# ---------------------------------------------------------------- warp anchors
# Coastline landmarks: railway-map (x, y) -> outline-map (x, y). Both maps share one
# coastline at different scales, so the fit is near-affine with small local corrections.
ANCHORS = [
    ((440,950),(372,797)),   # Brendam peninsula tip
    ((800,913),(686,764)),   # Kirk Ronan inlet head
    ((581,728),(492,606)),   # Brendam Bay spike
    ((1278,662),(1104,548)), # Norramby hook
    ((1188,640),(1035,530)), # Norramby inlet head
    ((1205,710),(1052,598)), # second east inlet head
    ((45,600),(25,492)),     # Knapford west tip
    ((560,40),(482,10)),     # north coast top
    ((200,397),(157,317)),   # Arlesburgh notch
    ((800,1043),(690,876)),  # Kirk Ronan peninsula south
    ((95,735),(62,606)),     # south-west lobe bottom
    ((345,690),(298,578)),   # Wellsworth coast corner
    ((715,985),(610,828)),   # Cabalnoo coast bottom
    ((1110,1008),(955,846)), # south-east coast
    ((1350,550),(1170,445)), # east coast bulge
    ((1000,345),(870,270)),  # north-east coast
    ((290,215),(232,165)),   # north-west coast
]


def load():
    im = np.asarray(Image.open(SRC).convert("RGB")).astype(int)
    r, g, b = im[..., 0], im[..., 1], im[..., 2]
    red = (r > 170) & (g < 70) & (b < 70)
    coral = (r > 200) & (g < 130) & (b < 145) & (r - g > 100)
    dark = im.sum(-1) < 160
    blue = (b > 150) & (r < 100) & (g > 105) & (g < 180) & (b - r > 85)
    lakes = ndimage.distance_transform_edt(blue) > 3.5
    blue &= ~ndimage.binary_dilation(lakes, iterations=5)
    masks = {
        "pink": (r > 190) & (g > 45) & (g < 140) & (b > 115) & (b < 175) & (r - g > 90),
        "blue": blue,
        "ng": coral | dark,
        "cfr": red | coral | (im.min(-1) > 215),
    }
    return im, red, dark, masks


def detect_dots(im, red, dark):
    H, W = red.shape
    frame = np.zeros((H, W), bool); frame[40:1045, 30:1370] = True; frame[970:, 1220:] = False
    disk = np.array([[0,1,1,1,0],[1,1,1,1,1],[1,1,1,1,1],[1,1,1,1,1],[0,1,1,1,0]], bool)
    found = []
    for mask, kind, amin, amax, rnd in [(ndimage.binary_closing(red, iterations=1), "R", 18, 260, False),
                                        (ndimage.binary_opening(dark, structure=disk), "B", 14, 110, True)]:
        lab, _ = ndimage.label(mask)
        for i, sl in enumerate(ndimage.find_objects(lab), 1):
            comp = lab[sl] == i; a = comp.sum(); h, w = comp.shape
            if not (amin <= a <= amax): continue
            if rnd and not (0.55 <= a / (h * w) <= 0.92 and 0.7 <= h / w <= 1.45): continue
            cy, cx = ndimage.center_of_mass(comp)
            cx += sl[1].start; cy += sl[0].start
            if frame[int(cy), int(cx)]:
                found.append((float(cx), float(cy), kind))
    return found


def build_stations(found):
    stations, by_key = [], {}
    for (kx, ky), name in NAMES.items():
        best = min(found, key=lambda f: (f[0] - kx) ** 2 + (f[1] - ky) ** 2)
        if (best[0] - kx) ** 2 + (best[1] - ky) ** 2 > 36:
            raise SystemExit(f"no dot near {kx},{ky} ({name})")
        by_key[(kx, ky)] = len(stations)
        stations.append(dict(name=name, kind=best[2], x=best[0], y=best[1]))
    for kx, ky, name in MANUAL:
        by_key[(kx, ky)] = len(stations)
        stations.append(dict(name=name, kind="W" if name not in ("Suddery", "Callan Castle") else "R", x=kx, y=ky))
    used = {(round(s["x"]), round(s["y"])) for s in stations}
    for x, y, kind in found:
        if any(abs(x - sx) < 4 and abs(y - sy) < 4 for sx, sy in SKIP): continue
        if any(abs(x - s["x"]) < 3 and abs(y - s["y"]) < 3 for s in stations): continue
        by_key[(round(x), round(y))] = len(stations)
        stations.append(dict(name=None, kind=kind, x=x, y=y))
    return stations, by_key


def lookup(by_key, stations, x, y):
    if (x, y) in by_key: return by_key[(x, y)]
    k = min(range(len(stations)), key=lambda i: (stations[i]["x"] - x) ** 2 + (stations[i]["y"] - y) ** 2)
    if (stations[k]["x"] - x) ** 2 + (stations[k]["y"] - y) ** 2 > 36:
        raise SystemExit(f"stop {x},{y} has no station")
    return k


def route(cost, a, b, pad=60):
    H, W = cost.shape
    x0 = int(max(0, min(a[0], b[0]) - pad)); x1 = int(min(W, max(a[0], b[0]) + pad))
    y0 = int(max(0, min(a[1], b[1]) - pad)); y1 = int(min(H, max(a[1], b[1]) + pad))
    sub = cost[y0:y1, x0:x1]
    path, _ = route_through_array(sub, (int(a[1]) - y0, int(a[0]) - x0), (int(b[1]) - y0, int(b[0]) - x0),
                                  fully_connected=True, geometric=True)
    on = np.mean([sub[p] <= 1.0 for p in path])
    return [(x + x0, y + y0) for y, x in path], on


def simplify(pts, eps=1.2):
    pts = np.asarray(pts, float)
    if len(pts) < 3: return pts
    a, b = pts[0], pts[-1]
    ab = b - a; n = np.hypot(*ab) or 1.0
    d = np.abs(ab[0] * (pts[:, 1] - a[1]) - ab[1] * (pts[:, 0] - a[0])) / n
    i = int(np.argmax(d))
    if d[i] > eps:
        return np.vstack([simplify(pts[:i + 1], eps)[:-1], simplify(pts[i:], eps)])
    return np.vstack([a, b])


def main():
    im, red, dark, masks = load()
    stations, by_key = build_stations(detect_dots(im, red, dark))
    costs = {k: np.where(ndimage.binary_dilation(m, iterations=1), 1.0, 45.0) for k, m in masks.items()}

    lines_out = []
    for L in LINES:
        stops, pts = [], []
        seq = []
        for s in L["stops"]:
            if s[0] == "via":
                seq.append(("via", (s[1], s[2])))
            else:
                k = lookup(by_key, stations, *s)
                stops.append(k); seq.append(("stop", (stations[k]["x"], stations[k]["y"])))
        worst = 1.0
        for (_, a), (_, b) in zip(seq, seq[1:]):
            if L["mask"]:
                seg, on = route(costs[L["mask"]], a, b)
                worst = min(worst, on)
            else:
                seg = [a, b]
            pts.extend(seg if not pts else seg[1:])
        if L["mask"]:
            pts = ndimage.uniform_filter1d(np.asarray(pts, float), 5, axis=0, mode="nearest")
        L2 = {k: L[k] for k in ("id", "name", "color", "kind")}
        L2["stops"] = stops
        L2["src"] = simplify(pts).tolist()
        lines_out.append(L2)
        print(f"{L['id']:14s} stops={len(stops):2d} pts={len(L2['src']):4d} on-track(min seg)={worst:.2f}")

    served = {k for L in lines_out for k in L["stops"]}
    stations = [dict(s, id=i) for i, s in enumerate(stations)]

    src = np.array([a for a, _ in ANCHORS], float)
    dst = np.array([b for _, b in ANCHORS], float)
    A, *_ = np.linalg.lstsq(np.c_[src, np.ones(len(src))], dst, rcond=None)
    aff = np.hypot(*((np.c_[src, np.ones(len(src))] @ A) - dst).T)
    print(f"affine fit: x'={A[0,0]:.3f}x{A[1,0]:+.3f}y{A[2,0]:+.1f}  y'={A[0,1]:.3f}x{A[1,1]:+.3f}y{A[2,1]:+.1f}  "
          f"residual mean {aff.mean():.1f}px max {aff.max():.1f}px")
    warp = RBFInterpolator(src, dst, kernel="thin_plate_spline", smoothing=40.0)
    resid = np.hypot(*(warp(src) - dst).T)
    print(f"warp anchor residual: mean {resid.mean():.1f}px max {resid.max():.1f}px (outline map px)")

    outline = np.asarray(Image.open(OUTLINE).convert("RGB")).astype(int)
    land = (outline[..., 1] - outline[..., 2]) > 22
    land = ndimage.binary_fill_holes(land)
    lab, _ = ndimage.label(land)
    sodor = lab == np.argmax(np.bincount(lab.ravel())[1:]) + 1
    _, (iy, ix) = ndimage.distance_transform_edt(~sodor, return_indices=True)
    inland = ndimage.binary_erosion(sodor, iterations=3)
    _, (jy, jx) = ndimage.distance_transform_edt(~inland, return_indices=True)

    keep = {i for i in served}
    st_out, remap, snapped = [], {}, 0
    for s in stations:
        if s["id"] not in keep: continue
        wx, wy = warp([[s["x"], s["y"]]])[0]
        cx, cy = int(np.clip(round(wx), 0, 1199)), int(np.clip(round(wy), 0, 882))
        if s["name"] != "Barrow-in-Furness" and not inland[cy, cx]:
            cx, cy = int(jx[cy, cx]), int(jy[cy, cx]); snapped += 1
            wx, wy = cx, cy
        remap[s["id"]] = len(st_out)
        st_out.append(dict(name=s["name"], kind=s["kind"], px=[round(float(wx), 1), round(float(wy), 1)]))
    print(f"stations: {len(st_out)} served ({sum(1 for s in st_out if s['name'])} named), {snapped} snapped onto land")

    src_paths = {L["id"]: L["src"] for L in lines_out}
    for L in lines_out:
        L["stops"] = [remap[k] for k in L["stops"]]
        w = warp(np.asarray(L["src"]))
        w[0] = st_out[L["stops"][0]]["px"]; w[-1] = st_out[L["stops"][-1]]["px"]
        L["path"] = np.round(w, 1).tolist()
        del L["src"]

    OUT.write_text("window.SODOR_RAIL = " + json.dumps({"stations": st_out, "lines": lines_out}) + ";\n", encoding="utf-8")
    print(f"wrote {OUT} ({OUT.stat().st_size / 1024:.0f} KB)")

    if PREVIEW:
        for target, warped, fname in [(SRC, False, "rail_src.png"), (OUTLINE, True, "rail_warped.png")]:
            img = Image.open(target).convert("RGB"); dr = ImageDraw.Draw(img)
            for L in lines_out:
                pts = L["path"] if warped else src_paths[L["id"]]
                dr.line([tuple(p) for p in pts], fill="#" + L["color"], width=3)
            for s in (st_out if warped else [s for s in stations if s["id"] in keep]):
                x, y = s["px"] if warped else (s["x"], s["y"])
                dr.ellipse((x - 3, y - 3, x + 3, y + 3), fill=(255, 255, 255), outline=(0, 0, 0))
            img.save(PREVIEW / fname)
        print("previews written")


if __name__ == "__main__":
    main()
