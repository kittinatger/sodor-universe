"""Build railways.js: stations, track routes and tunnels for the 3D scene.

Station positions, line names and tunnels follow the TV-series map
"TVSeriesSodorMapMk11_Feb2016" (Thomas the Tank Engine Wiki), read at the
positions given here in the pixel space of reference/sodor-railways.png
(the detailed railway map, which shares that map's base: TV px * 0.2289 + 18.9,
* 0.2302 + 24.3). Tracks are routed along the detailed map's drawn line colours
with a least-cost path between consecutive stops where both maps agree, and
straight through steering points where they don't; everything is then warped
onto the outline map used for the terrain (reference/sodor-outline.png).

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
STATIONS = {
    "Tidmouth": (99, 587), "Lower Tidmouth": (91, 610), "Knapford": (86, 647), "Knapford Harbour": (75.7, 667),
    "Crosby": (206.6, 669.3), "Wellsworth": (341.5, 659), "Maron": (511, 659), "Cronk": (608.5, 648),
    "Killdane": (658.5, 677), "Balladrine": (699.5, 731), "Kellaby": (745, 782), "Lower Kellsthorpe": (866.7, 823),
    "Kellsthorpe Road": (931, 819.5), "Crovan's Gate": (1091.5, 705.5), "Great Waterton": (1093.3, 612.9),
    "Vicarstown": (1273.5, 445.5), "Barrow-in-Furness": (1301.8, 425.8), "Sodor Search and Rescue Centre": (543, 772),
    "Tidmouth Hault": (104.5, 508.6), "Haultraugh": (132.5, 480), "Callan": (148, 460), "Bluff's Cove": (161.8, 445),
    "Arlesburgh West": (201.2, 415), "Arlesburgh": (242.8, 401.8), "Callandale": (132.9, 558.4),
    "Elsbridge": (198.6, 575), "Dryaw": (138, 654.6), "Toryreck": (149, 619.2), "Upper Toryreck": (163.8, 593.4),
    "Maithwaite": (237.3, 513.2), "Hackenbeck": (283.4, 481), "Ffarquhar": (313.9, 493.7),
    "Tidmouth Bay": (250, 442), "Lower Arlesburgh": (301.4, 445.6), "Arlesdale End": (375, 463),
    "Upper Ulfstead": (430, 472.7), "Ulfstead": (448.8, 481.9),
    "Arlesburgh Bridge Street": (295.4, 389.9), "Marthwaite": (330, 368.7), "Arlesdale Green": (367.7, 362.7),
    "Arlesdale": (392, 388),
    "Arlesdale Old Station": (404, 364), "Ulfstead Road": (479, 359.5), "Elm Farm": (497.8, 366.4),
    "Ballamoddey": (518.4, 369.6), "Valesbridge": (564.1, 371), "King Orry's Bridge": (607.2, 360.4),
    "Cas-ny-Hawin": (469.8, 388.5),
    "Abbey": (630.5, 595.5), "Hawin Lake": (630.8, 545.5), "Callan Castle": (630, 495),
    "Dooiney Valley": (625.5, 427.3), "Kirk Machan": (632, 400), "Peel Godred": (613.1, 325.6),
    "Shiloh": (654.5, 356), "Skarloey Road": (719.5, 353), "Devil's Back": (753.5, 329),
    "Culdee Fell Summit": (777.5, 329),
    "Blue Mountain Quarry": (665.8, 490.9), "Cronk Abbey": (610.6, 539.5), "Hawin Tea Room": (577.5, 544.3),
    "Elephant Park": (556.7, 557.9), "Rumblin Bridge": (459.3, 563), "Ulfstead Castle": (408, 511.5),
    "Cros-ny-Cuirn": (1040.7, 658.3), "Glennock": (923.3, 576.8), "Rheneas": (864.6, 455.2),
    "Lakeside": (835.9, 449.6), "Skarloey": (841.5, 485.9), "Mountain Village": (797.7, 461.3),
    "Bluebell Valley": (1131.1, 649.5), "The Wharf": (1181, 643), "Sodor Ironworks": (1248, 433),
    "Ballahoo": (1159.5, 582.4), "Norramby Church Halt": (1239.4, 636.6), "Norramby": (1265, 651.8),
    "Rolf's Castle": (857.9, 867), "Kirk Ronan": (797.2, 939.6),
    "Suddery": (484.3, 744.3), "Lower Suddery": (494.5, 767.6), "Upper Brendam": (504.8, 904.8),
    "Brendam Docks": (494.5, 923), "China Clay Works": (441.5, 850.5),
    "Harwick": (422.7, 134.8), "Droghan-y-Claghan": (564.8, 155.5), "Cregwir": (657.5, 190),
    "Vicarstown Dieselworks": (1195.4, 447.9),
}

# ---------------------------------------------------------------- lines
# stops: station names in order. ("via", x, y) steers the route without a stop;
# ("mask", name|None) switches the track colour followed for the segments after it.
def V(x, y): return ("via", x, y)
def M(m): return ("mask", m)

LINES = [
    dict(id="main", name="Main Line", color="e0446f", kind="standard", mask="pink", stops=[
        "Tidmouth", "Lower Tidmouth", "Knapford", V(94, 669), V(130, 708), V(176, 682), "Crosby", "Wellsworth",
        "Maron", "Cronk", "Killdane", "Balladrine", "Kellaby", V(814, 826), "Lower Kellsthorpe", "Kellsthorpe Road",
        V(991, 784), "Crovan's Gate", V(1105, 688), V(1110, 580), V(1131, 484), "Vicarstown", "Barrow-in-Furness"]),
    dict(id="greatwaterton", name="Great Waterton Spur", color="f290b0", kind="standard", mask="pink", stops=[
        "Crovan's Gate", V(1105, 688), V(1109, 630), M(None), V(1111, 607), "Great Waterton"]),
    dict(id="rescue", name="Search and Rescue Branch", color="f290b0", kind="standard", mask="pink", stops=[
        "Maron", V(538, 700), "Sodor Search and Rescue Centre"]),
    dict(id="harbour", name="Knapford Harbour Spur", color="f290b0", kind="standard", mask=None, stops=[
        "Knapford", "Knapford Harbour"]),
    dict(id="littlewest", name="Duck's Branch Line", color="2f9e5a", kind="standard", mask="blue", stops=[
        "Tidmouth", V(101, 553), V(103, 534), "Tidmouth Hault", "Haultraugh", "Callan", "Bluff's Cove",
        "Arlesburgh West", "Arlesburgh"]),
    dict(id="callandale", name="Callandale Line", color="5aa0d8", kind="standard", mask="blue", stops=[
        "Tidmouth", V(100, 556), "Callandale", "Elsbridge"]),
    dict(id="ffarquhar", name="Thomas's Branch Line", color="3d8fe0", kind="standard", mask="blue", stops=[
        "Knapford", "Dryaw", "Toryreck", "Upper Toryreck", "Elsbridge", V(219, 552), V(226, 538), "Maithwaite",
        "Hackenbeck", "Ffarquhar"]),
    dict(id="loop", name="The Loop Line", color="7ab4ee", kind="standard", mask="blue", stops=[
        "Elsbridge", V(234, 614), V(240, 659)]),
    dict(id="toby", name="Toby's Branch Line (Sodor Tramway)", color="46b0c8", kind="standard", mask="blue", stops=[
        "Bluff's Cove", "Tidmouth Bay", "Lower Arlesburgh", "Arlesdale End", "Upper Ulfstead", "Ulfstead",
        V(410, 513), V(475, 556), V(465, 598), V(459, 626), "Maron"]),
    dict(id="brendam", name="Edward's Branch Line", color="2a55c8", kind="standard", mask="blue", stops=[
        "Wellsworth", M(None), V(382, 692), V(459.5, 734), "Suddery", M("blue"), "Lower Suddery", V(512, 799),
        V(516, 822), V(512, 885), "Upper Brendam", "Brendam Docks"]),
    dict(id="peelgodred", name="Peel Godred Branch Line", color="9b4dd6", kind="standard", mask="blue", stops=[
        "Killdane", "Abbey", "Hawin Lake", "Callan Castle", "Dooiney Valley", "Kirk Machan", "Peel Godred"]),
    dict(id="bmq", name="Blue Mountain Quarry Branch", color="8a9ab0", kind="standard", mask=None, stops=[
        "Hawin Lake", V(639.7, 524.5), V(657.1, 512.5), "Blue Mountain Quarry"]),
    dict(id="kirkronan", name="Kirk Ronan Branch Line", color="8bd35a", kind="standard", mask="blue", stops=[
        "Kellsthorpe Road", "Rolf's Castle", "Kirk Ronan"]),
    dict(id="bluebell", name="Stepney's Branch Line (The Bluebell Line)", color="4fc0a0", kind="standard",
         mask="blue", stops=["Bluebell Valley", "Ballahoo"]),
    dict(id="norramby", name="Arthur's Branch Line (Norramby Branch)", color="b07a40", kind="standard",
         mask="blue", stops=["Ballahoo", V(1225, 632), "Norramby Church Halt", "Norramby"]),
    dict(id="harwick", name="Harwick Branch", color="6f9fd8", kind="standard", mask=None, stops=[
        "Arlesburgh", V(252.4, 335.1), V(300.4, 252.2), V(362.3, 179.7), V(410.3, 138.3), "Harwick"]),
    dict(id="dieselworks", name="Dieselworks Spur", color="8a9ab0", kind="standard", mask=None, stops=[
        "Vicarstown", V(1252.7, 434), V(1206.9, 436.4), "Vicarstown Dieselworks"]),
    dict(id="skarloey", name="Skarloey Railway", color="f08a2a", kind="narrow", mask="ng", stops=[
        "Crovan's Gate", "Cros-ny-Cuirn", V(1002, 615), V(974, 588), "Glennock", M(None), V(913, 532),
        V(906, 516), V(897, 472), "Rheneas", "Lakeside", "Mountain Village", V(738, 469.5), V(690, 482.6),
        "Blue Mountain Quarry", V(657.1, 512.5), V(639.7, 524.5), V(625, 532), "Cronk Abbey", "Hawin Tea Room",
        "Elephant Park", V(540.8, 570), V(499.6, 567.6), "Rumblin Bridge", "Ulfstead Castle"]),
    dict(id="skarloeyloop", name="Skarloey Railway", color="f08a2a", kind="narrow", mask="ng", stops=[
        "Lakeside", "Skarloey", "Rheneas"]),
    dict(id="wharf", name="Skarloey Railway", color="f08a2a", kind="narrow", mask="ng", stops=[
        "Crovan's Gate", V(1105, 688), "Bluebell Valley", "The Wharf"]),
    dict(id="rockyway", name="The Rocky Way", color="f5a862", kind="narrow", mask="ng", stops=[
        "Rheneas", V(897, 472), V(927, 497.5), V(967.9, 472), V(1012.6, 464.6), V(1075.9, 444), "Sodor Ironworks"]),
    dict(id="culdeefell", name="Culdee Fell Railway", color="d8d8d8", kind="rack", mask="cfr", stops=[
        "Kirk Machan", "Shiloh", "Skarloey Road", "Devil's Back", "Culdee Fell Summit"]),
    dict(id="arlesdale", name="Arlesdale Railway", color="d9a066", kind="miniature", mask=None, stops=[
        "Arlesburgh", "Arlesburgh Bridge Street", "Marthwaite", "Arlesdale Green", "Arlesdale"]),
    dict(id="chinaclay", name="China Clay Railway", color="c9a46a", kind="industrial", mask=None, stops=[
        "Brendam Docks", V(464.7, 941), V(420.8, 904.8), V(418.3, 863.4), "China Clay Works"]),
    dict(id="dukes", name="Duke's Old Railway (closed)", color="8f8f8f", kind="closed", mask=None, stops=[
        "Arlesdale Green", "Arlesdale Old Station", "Ulfstead Road", "Elm Farm", "Ballamoddey", "Valesbridge",
        "King Orry's Bridge"]),
    dict(id="dukes_spur", name="Duke's Old Railway (closed)", color="8f8f8f", kind="closed", mask=None, stops=[
        "Arlesdale Old Station", V(416, 378), "Cas-ny-Hawin"]),
    dict(id="crank", name="Old Crank and Harwick Railway (closed)", color="8f8f8f", kind="closed", mask=None, stops=[
        "Harwick", V(451.5, 141.7), "Droghan-y-Claghan", "Cregwir"]),
]

# ---------------------------------------------------------------- tunnels (portal to portal)
TUNNELS = [
    ("Knapford Tunnel", ["main"], (91.7, 613.6), (90.3, 634.3)),
    ("Crosby Tunnel", ["main"], (115, 704.8), (131.1, 710.3)),
    ("Henry's Tunnel", ["main"], (1129.1, 482.4), (1156.6, 474.6)),
    ("Conrad's Tunnel", ["littlewest"], (101.3, 548), (100.6, 537.6)),
    ("Tidmouth Tunnel", ["littlewest"], (102, 530.7), (102.4, 521.5)),
    ("Callandale Castellated Tunnel", ["callandale"], (151.7, 558.4), (166.5, 565.3)),
    ("Hackenbeck Tunnel", ["ffarquhar"], (242.5, 495.2), (264.1, 483.7)),
    ("Rheneas Tunnel", ["skarloey"], (911.4, 523.7), (901.0, 508.7)),
    ("Blue Mountain Tunnel", ["skarloey", "bmq"], (657.1, 512.5), (639.7, 524.5)),
]

# ---------------------------------------------------------------- warp anchors
# Coastline landmarks: railway-map (x, y) -> outline-map (x, y). Both maps share one
# coastline at different scales, so the fit is near-affine with small local corrections.
ANCHORS = [
    ((440,950),(372,797)), ((800,913),(686,764)), ((581,728),(492,606)), ((1278,662),(1104,548)),
    ((1188,640),(1035,530)), ((1205,710),(1052,598)), ((45,600),(25,492)), ((560,40),(482,10)),
    ((200,397),(157,317)), ((800,1043),(690,876)), ((95,735),(62,606)), ((345,690),(298,578)),
    ((715,985),(610,828)), ((1110,1008),(955,846)), ((1350,550),(1170,445)), ((1000,345),(870,270)),
    ((290,215),(232,165)),
]


def load_masks():
    im = np.asarray(Image.open(SRC).convert("RGB")).astype(int)
    r, g, b = im[..., 0], im[..., 1], im[..., 2]
    red = (r > 170) & (g < 70) & (b < 70)
    coral = (r > 200) & (g < 130) & (b < 145) & (r - g > 100)
    dark = im.sum(-1) < 160
    blue = (b > 150) & (r < 100) & (g > 105) & (g < 180) & (b - r > 85)
    lakes = ndimage.distance_transform_edt(blue) > 3.5
    blue &= ~ndimage.binary_dilation(lakes, iterations=5)
    return {
        "pink": (r > 190) & (g > 45) & (g < 140) & (b > 115) & (b < 175) & (r - g > 90),
        "blue": blue,
        "ng": coral | dark,
        "cfr": red | coral | (im.min(-1) > 215),
    }


def route(cost, a, b, pad=60):
    H, W = cost.shape
    x0 = int(max(0, min(a[0], b[0]) - pad)); x1 = int(min(W, max(a[0], b[0]) + pad))
    y0 = int(max(0, min(a[1], b[1]) - pad)); y1 = int(min(H, max(a[1], b[1]) + pad))
    sub = cost[y0:y1, x0:x1]
    path, _ = route_through_array(sub, (int(a[1]) - y0, int(a[0]) - x0), (int(b[1]) - y0, int(b[0]) - x0),
                                  fully_connected=True, geometric=True)
    pts = [(float(x + x0), float(y + y0)) for y, x in path]
    pts[0], pts[-1] = tuple(map(float, a)), tuple(map(float, b))
    return pts


def simplify(pts, eps=1.0):
    pts = np.asarray(pts, float)
    if len(pts) < 3: return pts
    a, b = pts[0], pts[-1]
    ab = b - a; n = np.hypot(*ab) or 1.0
    d = np.abs(ab[0] * (pts[:, 1] - a[1]) - ab[1] * (pts[:, 0] - a[0])) / n
    i = int(np.argmax(d))
    if d[i] > eps:
        return np.vstack([simplify(pts[:i + 1], eps)[:-1], simplify(pts[i:], eps)])
    return np.vstack([a, b])


def nearest_index(path, p):
    d = np.hypot(path[:, 0] - p[0], path[:, 1] - p[1])
    return int(np.argmin(d)), float(d.min())


def main():
    masks = load_masks()
    costs = {k: np.where(ndimage.binary_dilation(m, iterations=1), 1.0, 45.0) for k, m in masks.items()}
    names = list(STATIONS)
    index = {n: i for i, n in enumerate(names)}

    lines_out, src_paths = [], {}
    for L in LINES:
        mask, seq, stops = L["mask"], [], []
        for s in L["stops"]:
            if isinstance(s, tuple) and s[0] == "mask":
                seq.append(("mask", s[1])); continue
            if isinstance(s, tuple):
                seq.append(("pt", (s[1], s[2])))
            else:
                if s not in STATIONS: raise SystemExit(f"{L['id']}: unknown station {s}")
                stops.append(index[s]); seq.append(("pt", STATIONS[s]))
        pts, prev = [], None
        for kind, val in seq:
            if kind == "mask":
                mask = val; continue
            if prev is not None:
                seg = route(costs[mask], prev, val) if mask else [prev, val]
                if mask and len(seg) > 6:
                    s = np.asarray(seg); s[1:-1] = ndimage.uniform_filter1d(s, 5, axis=0, mode="nearest")[1:-1]
                    seg = s.tolist()
                pts.extend(seg if not pts else seg[1:])
            prev = val
        src = simplify(pts)
        src_paths[L["id"]] = src
        out = {k: L[k] for k in ("id", "name", "color", "kind")}
        out["stops"] = stops
        lines_out.append(out)
        print(f"{L['id']:14s} stops={len(stops):2d} path pts={len(src):4d}")

    src = np.array([a for a, _ in ANCHORS], float)
    dst = np.array([b for _, b in ANCHORS], float)
    warp = RBFInterpolator(src, dst, kernel="thin_plate_spline", smoothing=40.0)

    outline = np.asarray(Image.open(OUTLINE).convert("RGB")).astype(int)
    land = ndimage.binary_fill_holes((outline[..., 1] - outline[..., 2]) > 22)
    lab, _ = ndimage.label(land)
    sodor = lab == np.argmax(np.bincount(lab.ravel())[1:]) + 1
    inland = ndimage.binary_erosion(sodor, iterations=3)
    _, (jy, jx) = ndimage.distance_transform_edt(~inland, return_indices=True)

    served = sorted({k for L in lines_out for k in L["stops"]})
    remap, st_out, snapped = {}, [], []
    closed_only = {k for k in served if all(L["kind"] == "closed" for L in lines_out if k in L["stops"])}
    for k in served:
        n = names[k]
        wx, wy = warp([STATIONS[n]])[0]
        cx, cy = int(np.clip(round(wx), 0, 1199)), int(np.clip(round(wy), 0, 882))
        if n != "Barrow-in-Furness" and not inland[cy, cx]:
            wx, wy = float(jx[cy, cx]), float(jy[cy, cx]); snapped.append(n)
        remap[k] = len(st_out)
        st_out.append(dict(name=n, kind="closed" if k in closed_only else "station",
                           px=[round(float(wx), 1), round(float(wy), 1)]))
    unused = [n for i, n in enumerate(names) if i not in remap]
    print(f"stations: {len(st_out)} served; snapped onto land: {snapped or 'none'}; unused: {unused or 'none'}")

    warped = {}
    for L in lines_out:
        w = warp(src_paths[L["id"]])
        if L["stops"]:
            first, last = L["stops"][0], L["stops"][-1]
            if np.allclose(src_paths[L["id"]][0], STATIONS[names[first]]): w[0] = st_out[remap[first]]["px"]
            if np.allclose(src_paths[L["id"]][-1], STATIONS[names[last]]): w[-1] = st_out[remap[last]]["px"]
        L["stops"] = [remap[k] for k in L["stops"]]
        L["path"] = np.round(w, 1).tolist()
        warped[L["id"]] = np.asarray(L["path"])

    tunnels_out = []
    for name, ids, a, b in TUNNELS:
        wa, wb = warp([a, b])
        for lid in ids:
            path = warped[lid]
            (ia, da), (ib, db) = nearest_index(path, wa), nearest_index(path, wb)
            if max(da, db) > 6:
                print(f"  warning: {name} sits {max(da, db):.1f}px off {lid}")
            tunnels_out.append(dict(name=name, line=lid, a=[round(float(v), 1) for v in wa],
                                    b=[round(float(v), 1) for v in wb]))
    print(f"tunnels: {len(TUNNELS)} named, {len(tunnels_out)} line segments")

    OUT.write_text("window.SODOR_RAIL = " + json.dumps(
        {"stations": st_out, "lines": lines_out, "tunnels": tunnels_out}) + ";\n", encoding="utf-8")
    print(f"wrote {OUT} ({OUT.stat().st_size / 1024:.0f} KB)")

    if PREVIEW:
        for target, use_warp, fname in [(SRC, False, "rail_src.png"), (OUTLINE, True, "rail_warped.png")]:
            img = Image.open(target).convert("RGB"); dr = ImageDraw.Draw(img)
            for L in lines_out:
                pts = warped[L["id"]] if use_warp else src_paths[L["id"]]
                dr.line([tuple(p) for p in pts], fill="#" + L["color"], width=3)
            for name, ids, a, b in TUNNELS:
                pa, pb = (warp([a, b]) if use_warp else (a, b))
                dr.line([tuple(pa), tuple(pb)], fill=(0, 0, 0), width=5)
            for k in served:
                x, y = st_out[remap[k]]["px"] if use_warp else STATIONS[names[k]]
                dr.ellipse((x - 3, y - 3, x + 3, y + 3), fill=(255, 255, 255), outline=(0, 0, 0))
            img.save(PREVIEW / fname)
        print("previews written")


if __name__ == "__main__":
    main()
