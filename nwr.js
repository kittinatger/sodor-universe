// North Western Railway: every engine, coach, wagon, crane and road vehicle, life-size.
// Loaded after characters.js and built from its kit and train runner (window.SODOR_KIT).
// Models here are in metres (1 model unit = 1 m) and scaled by METRE into the world.
(function(){
'use strict';
const t0 = performance.now();
const K = window.SODOR_KIT;
const {mat, add, box, cylZ, cylX, cylY, domeCap, arcZ, roof, canvasTex, plateMat, sidePlates, sidePlatesTex, glassMat, brassMat} = K;
const M = METRE, HG = 0.7175;                        // half the standard gauge (rail centres)
const BLACK = 0x18191b, IRON = 0x2b2c2e, BEAM = 0xb3201c, BRASS = 0xc9a23a, COPPER = 0xc07a3c, ROOFGREY = 0x55585c;
const hex = c => '#' + c.toString(16).padStart(6, '0');
window.SODOR_CRANES = [];           // working portal cranes (harbours, docks) with a g.userData.crane to slew; filled as they're built

// ------------------------------------------------------------------ baking with vertex colours
// Every plain-coloured part of a vehicle is merged into one mesh per surface type, so a whole
// engine is a handful of draw calls however much detail it has.
const vcMats = new Map();
function vcMat(rough, metal, side){
  const k = rough + '|' + metal + '|' + side;
  if(!vcMats.has(k)) vcMats.set(k, new THREE.MeshStandardMaterial({vertexColors: true, roughness: rough, metalness: metal, side}));
  return vcMats.get(k);
}
function bakeVC(group, shadow = true){
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert(), m4 = new THREE.Matrix4();
  const buckets = new Map();
  group.traverse(o => {
    if(!o.isMesh) return;
    // textured, see-through and glowing materials keep their own material (merged per material)
    const m = o.material, tex = !!m.map || m.transparent || (m.emissive && m.emissive.getHex() !== 0);
    // a few surface classes only (paint, matt, rough, metal), so a vehicle bakes to a handful of meshes
    const metal = m.metalness > 0.3 ? 0.65 : 0;
    const rough = metal ? 0.35 : m.roughness < 0.5 ? 0.42 : m.roughness < 0.8 ? 0.65 : 0.92;
    const key = tex ? m : rough + '|' + metal + '|' + m.side;
    const g = (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone()).applyMatrix4(m4.multiplyMatrices(inv, o.matrixWorld));
    if(!tex){
      const n = g.attributes.position.count, c = new Float32Array(n * 3);
      for(let i = 0; i < n; i++){ c[i * 3] = m.color.r; c[i * 3 + 1] = m.color.g; c[i * 3 + 2] = m.color.b; }
      g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    }
    if(!buckets.has(key)) buckets.set(key, {mat: tex ? m : vcMat(rough, metal, m.side), geos: []});
    buckets.get(key).geos.push(g);
  });
  while(group.children.length) group.remove(group.children[0]);
  buckets.forEach(({mat: mm, geos}) => {
    let n = 0; geos.forEach(g => n += g.attributes.position.count);
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2), col = mm.vertexColors ? new Float32Array(n * 3) : null;
    let o = 0;
    geos.forEach(g => {
      pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3);
      if(g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
      if(col) col.set(g.attributes.color.array, o * 3);
      o += g.attributes.position.count; g.dispose();
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    if(col) geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mesh = new THREE.Mesh(geo, mm);
    mesh.castShadow = shadow;
    group.add(mesh);
  });
  return group;
}

// ------------------------------------------------------------------ faces, lettering, lining
const faceCache = new Map();
function faceMat(f = {}){
  const key = JSON.stringify(f);
  if(faceCache.has(key)) return faceCache.get(key);
  const tex = canvasTex(256, 256, (g) => {
    g.scale(2, 2);
    g.fillStyle = f.skin || '#c4c7ca'; g.beginPath(); g.arc(64, 64, 63, 0, 7); g.fill();
    g.fillStyle = 'rgba(0,0,0,0.07)'; g.beginPath(); g.arc(64, 74, 48, 0, 7); g.fill();
    if(f.grime){ g.fillStyle = 'rgba(60,45,30,0.22)'; for(let k = 0; k < 9; k++){ g.beginPath(); g.arc(30 + (k * 37) % 70, 30 + (k * 53) % 70, 6 + k % 4 * 3, 0, 7); g.fill(); } }
    if(f.hat){ g.fillStyle = f.hat; g.fillRect(12, 12, 104, 13); }
    const brow = f.brow || 0, smile = f.smile === undefined ? 0.6 : f.smile, look = f.look || 0, ey = 52;
    for(const s of [-1, 1]){
      const ex = 64 + s * 21;
      if(f.shadow){ g.fillStyle = f.shadow; g.globalAlpha = 0.5; g.beginPath(); g.ellipse(ex, ey - 6, 14, 8, 0, Math.PI, 0); g.fill(); g.globalAlpha = 1; }
      g.fillStyle = '#fff'; g.beginPath(); g.ellipse(ex, ey, 12.5, f.wide ? 13.5 : 10.5, 0, 0, 7); g.fill();
      g.fillStyle = f.eye || '#20262b'; g.beginPath(); g.arc(ex + look * 4, ey + 1, 5.5, 0, 7); g.fill();
      g.fillStyle = '#fff'; g.beginPath(); g.arc(ex + look * 4 + 1.8, ey - 1, 1.6, 0, 7); g.fill();
      if(f.lashes){
        g.strokeStyle = '#1e1e1e'; g.lineWidth = 2.2; g.lineCap = 'round';
        for(let k = 0; k < 3; k++){ const a = -Math.PI / 2 + s * (0.25 + k * 0.38); g.beginPath(); g.moveTo(ex + Math.cos(a) * 12, ey + Math.sin(a) * 10.5); g.lineTo(ex + Math.cos(a) * 17.5, ey + Math.sin(a) * 15.5); g.stroke(); }
      }
      g.strokeStyle = f.browColor || '#3a3c40'; g.lineWidth = f.thick ? 6.5 : 4.5; g.lineCap = 'round'; g.beginPath();
      g.moveTo(64 + s * 33, 36 - brow * 3); g.lineTo(64 + s * 11, 36 + brow * 6); g.stroke();
      if(f.blush){ g.fillStyle = 'rgba(235,110,135,0.35)'; g.beginPath(); g.arc(64 + s * 33, 76, 8, 0, 7); g.fill(); }
      if(f.sideburns){ g.fillStyle = f.sideburns; g.fillRect(64 + s * 47 - 5, 38, 10, 34); }
    }
    if(f.glasses){ g.strokeStyle = '#151515'; g.lineWidth = 3.5; for(const s of [-1, 1]){ g.beginPath(); g.arc(64 + s * 21, ey, 15.5, 0, 7); g.stroke(); } g.beginPath(); g.moveTo(56, ey - 3); g.lineTo(72, ey - 3); g.stroke(); }
    g.fillStyle = 'rgba(0,0,0,0.12)'; g.beginPath(); g.arc(64, 71, 7, 0, 7); g.fill();
    if(f.mustache){ g.strokeStyle = f.mustache; g.lineWidth = 6; g.beginPath(); g.moveTo(47, 82); g.quadraticCurveTo(64, 74, 81, 82); g.stroke(); }
    if(f.lips){ g.fillStyle = f.lips; g.beginPath(); g.moveTo(45, 88); g.quadraticCurveTo(64, 88 + smile * 26, 83, 88); g.quadraticCurveTo(64, 88 + smile * 10, 45, 88); g.fill(); }
    else { g.strokeStyle = '#4a2a2a'; g.lineWidth = 4.5; g.lineCap = 'round'; g.beginPath(); g.moveTo(44, 88); g.quadraticCurveTo(64, 88 + smile * 22, 84, 88); g.stroke(); }
    g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 3; g.beginPath(); g.arc(64, 64, 61, 0, 7); g.stroke();
  });
  const m = new THREE.MeshStandardMaterial({map: tex, roughness: 0.55});
  faceCache.set(key, m);
  return m;
}
function faceOn(p, r, f, x, y, z, back = false){
  const me = add(p, new THREE.CircleGeometry(r, 32), faceMat(f), x, y, z);
  if(back) me.rotation.y = Math.PI;
  return me;
}

const STYLES = {
  nwr:    {fg: '#f6c624', line: '#c8262b', font: 'bold 100px Georgia, serif'},
  gold:   {fg: '#e7c35a', line: '#4a300c', font: 'bold 92px Georgia, serif'},
  goldW:  {fg: '#e7c35a', line: '#ffffff', font: 'bold 92px Georgia, serif'},
  white:  {fg: '#f4f4f0', line: null, font: 'bold 92px Arial, sans-serif'},
  cream:  {fg: '#efe6c8', line: null, font: 'bold 92px Georgia, serif'},
  yellow: {fg: '#f2c419', line: null, font: 'bold 92px Arial, sans-serif'},
  yellowB:{fg: '#f2c419', line: '#151515', font: 'bold 92px Arial, sans-serif'},
  black:  {fg: '#151515', line: null, font: 'bold 92px Arial, sans-serif'},
  red:    {fg: '#c8262b', line: '#f6c624', font: 'bold 92px Georgia, serif'},
  gwr:    {fg: '#e9c45a', line: '#7a1a12', font: 'bold 92px Georgia, serif'},
  blue:   {fg: '#1f3f8a', line: null, font: 'bold 92px Arial, sans-serif'},
};
const paintCache = new Map(), _measure = document.createElement('canvas').getContext('2d');
function paintMat(text, st){
  const s = typeof st === 'string' ? STYLES[st] : st, key = text + '|' + JSON.stringify(s);
  if(paintCache.has(key)) return paintCache.get(key);
  _measure.font = s.font;
  const W = Math.ceil((_measure.measureText(text).width + 40) / 32) * 32, H = 128;
  const tex = canvasTex(W, H, (g) => {
    g.font = s.font; g.textAlign = 'center'; g.textBaseline = 'middle';
    if(s.line){ g.lineJoin = 'round'; g.lineWidth = 14; g.strokeStyle = s.line; g.strokeText(text, W / 2, H / 2 + 4); }
    g.fillStyle = s.fg; g.fillText(text, W / 2, H / 2 + 4);
  });
  const m = new THREE.MeshStandardMaterial({map: tex, alphaTest: 0.45, roughness: 0.45});
  m.userData.aspect = W / H;
  paintCache.set(key, m);
  return m;
}
// Lettering on both sides of a body at |x| = sx; h is the height of the capitals in metres.
function letter(p, text, st, h, sx, y, z){
  const m = paintMat(text, st), ph = h / 0.7;
  sidePlates(p, m, ph * m.userData.aspect, ph, sx + 0.014, y, z);
}
function nameplate(p, text, bg, fg, border, w, h, sx, y, z){
  sidePlates(p, plateMat(text, bg, fg, border, 'bold 36px Georgia, serif'), w, h, sx + 0.02, y, z);
}
// A lining rectangle on both side faces at |x| = sx.
function lining(p, m, sx, y0, y1, z0, z1, inset = 0.08, t = 0.035){
  const yc = (y0 + y1) / 2, zc = (z0 + z1) / 2, H = y1 - y0 - 2 * inset, W = z1 - z0 - 2 * inset;
  if(H <= 0 || W <= 0) return;
  for(const s of [-1, 1]){
    const x = s * (sx + 0.008);
    box(p, 0.012, t, W, m, x, y0 + inset, zc); box(p, 0.012, t, W, m, x, y1 - inset, zc);
    box(p, 0.012, H, t, m, x, yc, z0 + inset); box(p, 0.012, H, t, m, x, yc, z1 - inset);
  }
}
// Hazard stripes (yellow and black diagonals) for bufferbeams and cab ends.
const hazardTex = canvasTex(256, 64, (g, w, h) => {
  g.fillStyle = '#f2c400'; g.fillRect(0, 0, w, h); g.fillStyle = '#151515';
  for(let x = -h; x < w + h; x += 40){ g.beginPath(); g.moveTo(x, h); g.lineTo(x + 20, h); g.lineTo(x + 20 + h, 0); g.lineTo(x + h, 0); g.closePath(); g.fill(); }
});
const hazardMat = new THREE.MeshStandardMaterial({map: hazardTex, roughness: 0.5});
function hazard(p, w, h, x, y, z, back = false){ const me = add(p, new THREE.PlaneGeometry(w, h), hazardMat, x, y, z); if(back) me.rotation.y = Math.PI; return me; }
const grilleMat = new THREE.MeshStandardMaterial({roughness: 0.7, map: canvasTex(128, 128, (g, w, h) => {
  g.fillStyle = '#141414'; g.fillRect(0, 0, w, h); g.strokeStyle = '#3c3c3c'; g.lineWidth = 5;
  for(let y = 8; y < h; y += 12){ g.beginPath(); g.moveTo(6, y); g.lineTo(w - 6, y); g.stroke(); }
})});

// ------------------------------------------------------------------ primitives
function disc(p, r, m, x, y, z, s){ const me = add(p, new THREE.CircleGeometry(r, 24), m, x, y, z); me.rotation.y = s * Math.PI / 2; return me; }
function ring(p, r0, r1, m, x, y, z, s){ const me = add(p, new THREE.RingGeometry(r0, r1, 28), m, x, y, z); me.rotation.y = s * Math.PI / 2; return me; }
// Upper half of a drum on the x axis: a wheel splasher.
function halfDrumX(p, r, w, m, x, y, z){ const g = new THREE.CylinderGeometry(r, r, w, 24, 1, false, 0, Math.PI); g.rotateZ(Math.PI / 2); return add(p, g, m, x, y, z); }
// Gable roof: a triangular prism with its ridge along z.
function gable(p, w, len, wallTop, m, x = 0, z = 0, rotY = 0, pitch = 0.45){
  const r = w / 1.732 * 1.08, me = add(p, new THREE.CylinderGeometry(r, r, len, 3).rotateX(-Math.PI / 2), m, x, wallTop + r * 0.5 * pitch, z);
  me.scale.y = pitch;                         // flatten the triangle to a believable roof pitch
  me.rotation.y = rotY; return me;
}
function lamp(p, x, y, z, e = 1){
  box(p, 0.24, 0.3, 0.2, mat(0xe9e9e6, 0.5), x, y + 0.15, z);
  cylZ(p, 0.075, 0.075, 0.03, mat(0xf4efd0, 0.2), x, y + 0.16, z + e * 0.11, 12);
  box(p, 0.06, 0.07, 0.06, mat(0x222222), x, y + 0.34, z);
}
function buffers(p, z, e, y = 1.06, wood = false){
  for(const s of [-1, 1]){
    cylZ(p, 0.1, 0.12, 0.36, mat(BLACK, 0.7), s * 0.87, y, z + e * 0.24, 12);
    cylZ(p, 0.21, 0.21, 0.06, wood ? mat(0x8a6a44, 0.85) : mat(0x9c9ea2, 0.3, 0.7), s * 0.87, y, z + e * 0.44, 18);
  }
  box(p, 0.1, 0.14, 0.3, mat(BLACK, 0.7), 0, y, z + e * 0.2);
}

// ------------------------------------------------------------------ wheels and rods
const wheelProtos = new Map();
function wheelS(r, z, o = {}){
  const hg = o.hg || HG;                                   // half gauge: 0.7175 standard, ~0.42 for the 800 mm rack line
  const key = [r, o.color, o.rim, o.spokes, o.tyre, hg, o.pinion].join('|');
  let proto = wheelProtos.get(key);
  if(!proto){
    proto = new THREE.Group();
    const HG = hg;
    // one surface class for the whole wheelset, so each bakes to a single mesh
    const C = mat(o.color === undefined ? BLACK : o.color, 0.55), T = mat(o.tyre || 0x45474a, 0.55), HUB = mat(0x6a6d70, 0.55), DK = mat(0x121212, 0.55);
    const spokes = o.spokes !== undefined ? o.spokes : (r >= 0.45 ? Math.max(10, Math.round(r * 9) * 2) : 0);
    for(const s of [-1, 1]){
      const x = s * HG, face = x + s * 0.072;
      cylX(proto, r, r, 0.14, T, x, 0, 0, 28);
      cylX(proto, r + 0.035, r + 0.035, 0.03, T, x - s * 0.075, 0, 0, 28);
      if(spokes){
        ring(proto, r * 0.8, r * 0.93, C, face, 0, 0, s);
        disc(proto, r * 0.8, DK, face - s * 0.02, 0, 0, s);
        for(let k = 0; k < spokes / 2; k++){ const b = box(proto, 0.04, r * 1.6, 0.06, C, face - s * 0.01, 0, 0); b.rotation.x = k * 2 * Math.PI / spokes; }
        box(proto, 0.05, r * 0.3, r * 0.78, C, face + s * 0.004, -r * 0.55, 0);           // balance weight
      } else disc(proto, r * 0.93, C, face, 0, 0, s);
      if(o.rim !== undefined) ring(proto, r * 0.9, r * 0.99, mat(o.rim, 0.4), face + s * 0.006, 0, 0, s);
      cylX(proto, r * 0.18, r * 0.18, 0.08, HUB, x + s * 0.09, 0, 0, 12);
    }
    cylX(proto, 0.07, 0.07, 2 * HG, mat(IRON, 0.55), 0, 0, 0, 8);
    if(o.pinion){                                          // rack pinions: two toothed wheels at the centre of the axle
      for(const s of [-1, 1]){
        cylX(proto, r * 0.8, r * 0.8, 0.06, mat(0x3a3c40, 0.55), s * 0.04, 0, 0, 20);
        for(let k = 0; k < 10; k++){ const t = box(proto, 0.06, r * 1.74, 0.07, mat(0x5a5d62, 0.55), s * 0.04, 0, 0); t.rotation.x = k * Math.PI / 10 + (s > 0 ? Math.PI / 20 : 0); }
      }
    }
    bakeVC(proto, false);
    wheelProtos.set(key, proto);
  }
  const g = proto.clone(); g.position.set(0, r, z);
  return g;
}
function rodsS(root, axles, color){
  const zs = axles.map(a => a.z), lo = Math.min(...zs), hi = Math.max(...zs), mid = (lo + hi) / 2, r = axles[0].r, hg = axles[0].hg || HG;
  const m = mat(color === undefined ? 0x9fa2a6 : color, 0.3, 0.75), rods = [];
  for(const s of [-1, 1]){
    const rod = box(root, 0.07, 0.14, hi - lo + 0.32, m, s * (hg + (axles[0].rodOut || 0.17)), r, mid);
    rods.push({mesh: rod, mid, r, rc: Math.min(0.3, r * 0.42), phase: s > 0 ? Math.PI / 2 : 0});
  }
  return rods;
}
function addWheels(root, list, o = {}){
  return list.map(a => {
    const g = wheelS(a.r, a.z, {color: a.c ? o.color : (o.small === undefined ? o.color : o.small), rim: o.rim, spokes: a.spokes !== undefined ? a.spokes : o.spokes, tyre: o.tyre,
      hg: o.hg, pinion: a.pinion});
    root.add(g);
    return {z: a.z, r: a.r, coupled: !!a.c, g, hg: o.hg, rodOut: o.rodOut};
  });
}
function finish(root, body, axles, rodColor, extra = {}){
  bakeVC(body);
  const coupled = axles.filter(a => a.coupled);
  const rods = coupled.length > 1 ? rodsS(root, coupled, rodColor) : [];
  return Object.assign({group: root, axles, rods}, extra);
}

// ------------------------------------------------------------------ chimneys
function chimneyS(p, c, x, base, z){
  const g = new THREE.Group(); g.position.set(x, base, z); p.add(g);
  const h = c.top - base, r = c.r || 0.27, CM = mat(c.color === undefined ? BLACK : c.color, 0.55, 0.1, 'double');
  const type = c.type || 'plain';
  if(type === 'stovepipe'){
    cylY(g, r, r, h, CM, 0, h / 2, 0, 18); cylY(g, r * 1.5, r * 1.6, 0.22, CM, 0, 0.11, 0, 18);
    cylY(g, r * 1.08, r * 1.08, 0.08, CM, 0, h - 0.04, 0, 18);
  } else if(type === 'balloon'){
    cylY(g, r * 0.85, r * 1.2, h * 0.55, CM, 0, h * 0.275, 0, 18);
    cylY(g, r * 1.9, r * 0.85, h * 0.38, CM, 0, h * 0.55 + h * 0.19, 0, 18);
    cylY(g, r * 1.95, r * 1.95, 0.1, CM, 0, h - 0.05, 0, 18);
    cylY(g, r * 1.8, r * 1.8, 0.02, mat(0x555555, 0.8), 0, h, 0, 18);
  } else {
    const lip = type === 'stumpy' ? 1.2 : type === 'lipped' ? 1.25 : 1.15, w = type === 'wide' ? 1.25 : 1;
    const p1 = Math.min(0.16, h * 0.3), p2 = Math.max(p1 + 0.01, h - Math.min(0.2, h * 0.35)), p3 = Math.max(p2 + 0.005, h - Math.min(0.08, h * 0.15));
    const prof = [[r * 1.6 * w, 0], [r * 1.05 * w, p1], [r * w, p2], [r * lip * w, p3], [r * lip * w, h], [r * 0.82 * w, h], [r * 0.8 * w, h - Math.min(0.25, h * 0.5)]];
    add(g, new THREE.LatheGeometry(prof.map(([a, b]) => new THREE.Vector2(a, b)), 20), CM);
    if(type === 'copper') cylY(g, r * 1.14, r * 1.06, 0.34, mat(COPPER, 0.3, 0.75), 0, h - 0.17, 0, 20);
    if(c.cap !== undefined) cylY(g, r * lip * w + 0.012, r * lip * w + 0.012, 0.1, mat(c.cap, 0.3, 0.7), 0, h - 0.05, 0, 20);
  }
}

// ------------------------------------------------------------------ steam engines (standard gauge)
// One builder for every British-style steam engine: tanks of any kind, tender engines,
// splashers, outside cylinders, domes, safety valves, smoke deflectors, cowcatchers and lamps.
function steam(S){
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const L = S.L, F = L / 2, R = -L / 2, W = S.W || 2.6, hw = W / 2;
  const C = mat(S.color, 0.38), LIN = mat(S.lining === undefined ? 0xc8262b : S.lining, 0.4), BLK = mat(BLACK, 0.7), DRK = mat(S.smokebox === undefined ? 0x2a2c30 : S.smokebox, 0.55, 0.15);
  const FOOT = mat(S.foot === undefined ? BLACK : S.foot, 0.6), VAL = mat(S.valance === undefined ? S.color : S.valance, 0.4), BM = mat(S.beam === undefined ? BEAM : S.beam, 0.5);
  const FIT = S.fit === 'black' ? BLK : S.fit === 'bronze' ? mat(0xa8703c, 0.35, 0.6) : S.fit === 'silver' ? mat(0xc8ccd0, 0.3, 0.8) : brassMat();
  const deck = S.deck || 1.25, br = S.br || 0.7, by = S.by || 2.3, roofY = S.roofY || 3.78;
  const bunk = S.bunker || 0, cabLen = S.cabLen || 2.1;
  const cabRear = R + 0.08 + bunk, cabFront = cabRear + cabLen;
  const sbF = S.sbF === undefined ? F - 0.5 : S.sbF, sbLen = S.sbLen || 1.2, sbR = br + 0.05;
  const bz0 = cabFront, bz1 = sbF - sbLen, blen = bz1 - bz0;
  const high = deck > 1.5, lowY = 1.42, spots = {};
  const chim = Object.assign({top: 3.92}, S.chimney || {});

  // frames, footplate, valances, bufferbeams
  box(body, 1.1, deck - 0.45, L - 0.3, BLK, 0, (deck + 0.45) / 2 - 0.02, 0);
  const dropZ = high ? (S.drop === undefined ? sbF - sbLen * 0.4 : S.drop) : F;
  box(body, W, 0.07, dropZ - R, FOOT, 0, deck, (dropZ + R) / 2);
  for(const s of [-1, 1]) box(body, 0.04, 0.22, dropZ - R - 0.05, VAL, s * (hw - 0.02), deck - 0.13, (dropZ + R) / 2);
  if(high){
    box(body, W, 0.07, F - dropZ, FOOT, 0, lowY, (F + dropZ) / 2);
    box(body, W - 0.1, deck - lowY, 0.06, VAL, 0, (deck + lowY) / 2, dropZ);
    box(body, 1.1, lowY - 0.45, F - dropZ, BLK, 0, (lowY + 0.45) / 2, (F + dropZ) / 2);
  }
  const beamTop = high ? lowY : deck;
  for(const e of [1, -1]){
    const z = e * (F - 0.06);
    if(e < 0 && S.tender){ box(body, W - 0.3, 0.3, 0.12, BLK, 0, deck - 0.2, z); continue; }
    box(body, W, beamTop - 0.78, 0.12, BM, 0, (beamTop + 0.78) / 2, z);
    if(S.beamStripes) hazard(body, W - 0.1, beamTop - 0.82, 0, (beamTop + 0.78) / 2, z + e * 0.065, e < 0);
    if(e > 0 && S.cowcatcher){ cowcatcher(body, mat(S.cowcatcher, 0.5), F); continue; }
    buffers(body, z, e, 1.06, S.woodBuffers);
  }
  lamp(body, -0.62, beamTop, F - 0.14);

  // running gear
  const axles = addWheels(root, S.wheels, {color: S.wheel === undefined ? S.color : S.wheel, small: S.wheelSmall, rim: S.rim, spokes: S.spokes});
  if(S.splash !== false) S.wheels.forEach(a => {
    if(!a.c || 2 * a.r + 0.05 < deck) return;
    for(const s of [-1, 1]){
      halfDrumX(body, a.r + 0.07, 0.34, S.splashColor === undefined ? C : mat(S.splashColor, 0.4), s * 0.78, a.r, a.z);
      if(S.splashTrim !== undefined) halfDrumX(body, a.r + 0.1, 0.035, mat(S.splashTrim, 0.3, 0.6), s * 0.96, a.r, a.z);
    }
  });
  if(S.cyl){
    const c = S.cyl, cr = c.r || 0.3, cl = c.len || 0.95, cy = c.y || 0.95, cx = c.x || 1.02, bl = c.bars || 1.3;
    const CM = c.color === undefined ? C : mat(c.color, 0.4), TR = c.trim === undefined ? DRK : mat(c.trim, 0.35, 0.5);
    for(const s of [-1, 1]){
      cylZ(body, cr, cr, cl, CM, s * cx, cy, c.z, 18);
      for(const e of [-1, 1]) cylZ(body, cr + 0.02, cr + 0.02, 0.05, TR, s * cx, cy, c.z + e * cl / 2, 18);
      box(body, 0.08, 0.16, bl, mat(0xa6a9ad, 0.3, 0.75), s * cx, cy, c.z - cl / 2 - bl / 2);
      box(body, 0.16, cr * 0.9, cl * 0.8, CM, s * (cx - 0.04), cy + cr * 0.95, c.z);          // valve chest
    }
  }

  // boiler, firebox, smokebox
  const BC = S.boilerColor === undefined ? C : mat(S.boilerColor, 0.38);
  if(S.boilerBox){ arcZ(body, br, blen, Math.PI / 2, BC, 0, by, bz0 + blen / 2); box(body, br * 2, br, blen, BC, 0, by - br / 2, bz0 + blen / 2); }
  else cylZ(body, br, br, blen, BC, 0, by, bz0 + blen / 2, 32);
  const nb = S.bandsN || Math.max(2, Math.round(blen / 1.3));
  const BAND = S.bands === undefined ? LIN : mat(S.bands, 0.3, 0.65);
  if(!S.boilerBox) for(let k = 0; k <= nb; k++) cylZ(body, br + 0.012, br + 0.012, 0.07, BAND, 0, by, bz0 + 0.12 + k * (blen - 0.24) / nb, 32);
  if(S.belpaire) box(body, br * 1.92, br * 0.72, S.belpaire, BC, 0, by + br * 0.36, bz0 + S.belpaire / 2);
  box(body, Math.min(1.3, br * 1.6), by - deck, blen, BLK, 0, (by + deck) / 2, bz0 + blen / 2);
  cylZ(body, sbR, sbR, sbLen, DRK, 0, by, sbF - sbLen / 2, 32);
  box(body, sbR * 1.5, by - beamTop, sbLen * 0.85, DRK, 0, (by + beamTop) / 2, sbF - sbLen / 2);
  cylZ(body, sbR + 0.02, sbR + 0.02, 0.06, mat(S.doorRing === undefined ? 0x3b3d41 : S.doorRing, 0.4, 0.4), 0, by, sbF + 0.01, 32);
  faceOn(body, sbR * 0.9, S.face, 0, by, sbF + 0.05);
  for(const s of [-1, 1]) cylZ(body, 0.022, 0.022, blen + sbLen * 0.6, mat(0xd0d3d6, 0.25, 0.85), s * (br + 0.09), by + br * 0.38, bz0 + (blen + sbLen * 0.6) / 2, 6);
  chimneyS(body, chim, 0, by + sbR - 0.06, sbF - sbLen * 0.52);
  if(S.dome !== false){
    const d = S.dome || {}, dr = d.r || 0.42, dh = d.h || 0.36, dz = d.z === undefined ? bz0 + blen * 0.5 : d.z;
    const DM = d.color === undefined ? BC : mat(d.color, 0.3, 0.65);
    if(d.long){ cylZ(body, dr, dr, d.long, DM, 0, by + br - 0.05 + dh / 2, dz, 18); box(body, dr * 2, dh, d.long, DM, 0, by + br - 0.05, dz); }
    else { cylY(body, dr, dr * 1.12, dh, DM, 0, by + br - 0.05 + dh / 2, dz, 24); domeCap(body, dr, DM, 0, by + br - 0.05 + dh, dz); }
  }
  const fbTop = S.belpaire ? by + br * 0.72 : by + br;
  if(S.valves === 'bonnet'){ const vz = S.valveZ === undefined ? bz0 + blen * 0.45 : S.valveZ; cylY(body, 0.17, 0.3, 0.55, FIT, 0, by + br + 0.22, vz, 20); domeCap(body, 0.17, FIT, 0, by + br + 0.5, vz); }
  else for(const s of [-1, 1]) cylY(body, 0.06, 0.08, 0.3, FIT, s * 0.12, fbTop + 0.15, bz0 + 0.45, 10);
  cylY(body, 0.035, 0.035, 0.4, FIT, 0.25, fbTop + 0.2, bz0 + 0.2, 8);

  // tanks
  if(S.tank === 'side'){
    const t1 = S.tankFront === undefined ? bz1 - 0.15 : S.tankFront, tTop = S.tankTop || by + 0.35, tw = S.tankW || 0.62;
    for(const s of [-1, 1]){
      box(body, tw, tTop - deck, t1 - bz0, C, s * (hw - tw / 2), (tTop + deck) / 2, (t1 + bz0) / 2);
      cylY(body, 0.13, 0.13, 0.08, FIT, s * (hw - tw / 2), tTop + 0.04, t1 - 0.4, 12);
    }
    if(S.tankLining !== false) lining(body, LIN, hw, deck, tTop, bz0, t1);
    spots.tank = {sx: hw, y: (deck + tTop) / 2, z: (bz0 + t1) / 2, h: tTop - deck, len: t1 - bz0};
  } else if(S.tank === 'saddle'){
    const RT = S.saddleR || Math.min(hw - 0.06, br + 0.4), t1 = S.tankFront === undefined ? bz1 - 0.05 : S.tankFront, low = S.saddleLow || deck + 0.3;
    const half = Math.acos(Math.max(-0.98, Math.min(0.98, (low - by) / RT)));
    arcZ(body, RT, t1 - bz0, half, C, 0, by, (t1 + bz0) / 2);
    if(S.tankLining !== false) for(const s of [-1, 1]) for(const a of [half - 0.12, 0.6]){
      box(body, 0.02, 0.04, t1 - bz0 - 0.2, LIN, s * Math.sin(a) * (RT + 0.01), by + Math.cos(a) * (RT + 0.01), (t1 + bz0) / 2);
    }
    cylY(body, 0.16, 0.16, 0.1, FIT, 0, by + RT + 0.04, t1 - 0.45, 14);
    spots.tank = {sx: RT, y: by, z: (bz0 + t1) / 2, h: 1.0, len: t1 - bz0};
  } else if(S.tank === 'pannier'){
    const pw = S.pannierW || 0.5, ph = S.pannierH || 1.05, t1 = S.tankFront === undefined ? bz1 - 0.05 : S.tankFront, py = by + br * 0.25;
    for(const s of [-1, 1]) box(body, pw, ph, t1 - bz0, C, s * (br + pw / 2 - 0.06), py, (t1 + bz0) / 2);
    spots.tank = {sx: br + pw - 0.06, y: py, z: (bz0 + t1) / 2, h: ph, len: t1 - bz0};
  }
  // bunker
  const bTop = S.bunkerTop || S.tankTop || deck + 1.25;
  if(bunk > 0){
    box(body, W - 0.04, bTop - deck, bunk, C, 0, (bTop + deck) / 2, R + 0.08 + bunk / 2);
    if(S.oil) cylZ(body, 0.5, 0.5, bunk - 0.2, mat(0x222222, 0.6), 0, bTop + 0.3, R + 0.08 + bunk / 2, 16);
    else box(body, W - 0.3, 0.28, bunk - 0.2, mat(0x121212, 0.95), 0, bTop + 0.08, R + 0.08 + bunk / 2);
    if(S.bunkerLining !== false) lining(body, LIN, hw - 0.02, deck, bTop, R + 0.08, cabRear);
    spots.bunker = {sx: hw - 0.02, y: (deck + bTop) / 2, z: R + 0.08 + bunk / 2, h: bTop - deck, len: bunk};
  }
  // cab
  const CABC = S.cabColor === undefined ? C : mat(S.cabColor, 0.4);
  const sideH = S.cabSideH || Math.min(1.35, roofY - deck - 0.9), WF = mat(S.winFrame === undefined ? 0xe8c33a : S.winFrame, 0.4);
  const winY = roofY - 0.62;
  if(S.cab === 'open'){
    for(const s of [-1, 1]){ box(body, 0.06, sideH * 0.75, cabLen, CABC, s * (hw - 0.03), deck + sideH * 0.375, cabRear + cabLen / 2); for(const zz of [cabFront - 0.06, cabRear + 0.06]) box(body, 0.08, roofY - deck, 0.08, BLK, s * (hw - 0.06), (roofY + deck) / 2, zz); }
    box(body, W - 0.1, (roofY - deck) * 0.55, 0.06, CABC, 0, deck + (roofY - deck) * 0.275, cabFront);
  } else {
    box(body, W - 0.05, roofY - deck, 0.07, CABC, 0, (roofY + deck) / 2, cabFront);
    for(const s of [-1, 1]) for(const f of [1, -1]){
      const gz = cabFront + f * 0.045;
      if(S.roundWindows){
        const w = add(body, new THREE.CircleGeometry(0.24, 20), glassMat(), s * 0.78, winY, gz); if(f < 0) w.rotation.y = Math.PI;
        const rg = add(body, new THREE.RingGeometry(0.24, 0.31, 20), WF, s * 0.78, winY, gz + f * 0.003); if(f < 0) rg.rotation.y = Math.PI;
      } else {
        box(body, 0.62, 0.66, 0.08, WF, s * 0.78, winY, cabFront);
        const w = add(body, new THREE.PlaneGeometry(0.5, 0.54), glassMat(), s * 0.78, winY, cabFront + f * 0.05); if(f < 0) w.rotation.y = Math.PI;
      }
    }
    for(const s of [-1, 1]){
      box(body, 0.06, sideH, cabLen, CABC, s * (hw - 0.03), deck + sideH / 2, cabRear + cabLen / 2);
      const ph = roofY - deck - sideH;
      box(body, 0.06, ph, 0.42, CABC, s * (hw - 0.03), deck + sideH + ph / 2, cabFront - 0.21);
      box(body, 0.06, ph, 0.22, CABC, s * (hw - 0.03), deck + sideH + ph / 2, cabRear + 0.11);
      box(body, 0.062, 0.05, cabLen, WF, s * (hw - 0.03), deck + sideH, cabRear + cabLen / 2);
      box(body, 0.34, 0.05, 0.45, BLK, s * (hw - 0.12), deck - 0.6, cabRear + cabLen * 0.5);
    }
    if(bunk > 0){
      box(body, W - 0.05, roofY - bTop, 0.07, CABC, 0, (roofY + bTop) / 2, cabRear);
      for(const s of [-1, 1]){ const w = add(body, new THREE.PlaneGeometry(0.45, 0.42), glassMat(), s * 0.78, roofY - 0.6, cabRear - 0.045); w.rotation.y = Math.PI; }
    }
  }
  if(S.cabLining !== false) lining(body, LIN, hw - 0.03, deck, deck + sideH, cabRear, cabFront, 0.08);
  spots.cab = {sx: hw - 0.03, y: deck + sideH * 0.55, z: cabRear + cabLen / 2, h: sideH, len: cabLen};
  roof(body, W - 0.02, cabLen + 0.3, roofY + 0.14, S.roof === undefined ? CABC : mat(S.roof, 0.6), cabRear + cabLen / 2);
  box(body, W - 0.5, roofY - deck - 0.2, cabLen - 0.2, mat(0x141414, 0.95), 0, (roofY + deck) / 2, cabRear + cabLen / 2);

  // extras
  if(S.deflectors){
    const d = S.deflectors, dl = d.len || 2.0, dh = d.h || (by + br * 0.6 - deck);
    for(const s of [-1, 1]) box(body, 0.05, dh, dl, d.color === undefined ? C : mat(d.color, 0.4), s * (hw - 0.2), deck + dh / 2, sbF - dl / 2 + 0.25);
    spots.deflector = {sx: hw - 0.17, y: deck + dh * 0.55, z: sbF - dl / 2 + 0.25, h: dh, len: dl};
  }
  if(S.headlight){
    const hl = S.headlight, hz = hl.z === undefined ? sbF - 0.35 : hl.z, hy = hl.y || by + sbR + 0.28;
    cylZ(body, 0.25, 0.28, 0.55, hl.color === undefined ? DRK : mat(hl.color, 0.45), 0, hy, hz, 16);
    add(body, new THREE.CircleGeometry(0.21, 16), mat(0xfff4c8, 0.2), 0, hy, hz + 0.28);
    box(body, 0.3, 0.12, 0.4, DRK, 0, hy - 0.3, hz);
  }
  if(S.bell){ const bz = S.bell.z === undefined ? bz0 + blen * 0.3 : S.bell.z; cylY(body, 0.1, 0.2, 0.28, FIT, 0, by + br + 0.24, bz, 14); box(body, 0.06, 0.25, 0.06, BLK, 0, by + br + 0.05, bz); }
  if(S.extra) S.extra(body, {C, LIN, BLK, DRK, FIT, deck, by, br, sbF, sbLen, bz0, bz1, blen, cabFront, cabRear, roofY, hw, F, R, W, spots});
  (S.marks || []).forEach(mk => mark(body, spots, mk));
  const v = finish(root, body, axles, S.rods);
  v.len = L + (S.tender ? 0.45 : 0.9);
  v.chimneyAt = new THREE.Vector3(0, chim.top, sbF - sbLen * 0.52);
  return v;
}
function mark(body, spots, mk){
  const sp = spots[mk.at]; if(!sp) return;
  const y = sp.y + (mk.dy || 0), z = sp.z + (mk.dz || 0);
  if(mk.plate) nameplate(body, mk.plate, mk.bg || '#1a1a1a', mk.fg || '#e7c35a', mk.border || '#c9a23a', mk.w || 1.2, mk.h || 0.26, sp.sx, y, z);
  else letter(body, mk.t, mk.style || 'nwr', mk.h || Math.min(0.5, sp.h * 0.42), sp.sx, y, z);
}
function cowcatcher(p, m, F, w = 2.3){
  for(const s of [-1, 1]){
    for(let k = 0; k <= 6; k++){
      const t = k / 6, b = box(p, 0.07, 0.78, 0.07, m, s * (w / 2) * (1 - t), 0.52, F + 0.08 + 1.05 * t);
      b.rotation.x = 0.5;
    }
    const len = Math.hypot(w / 2, 1.05), rail = box(p, 0.08, 0.1, len, m, s * w / 4, 0.86, F + 0.5);
    rail.rotation.y = s * Math.atan2(w / 2, 1.05) * -1;
  }
  box(p, w, 0.12, 0.12, m, 0, 0.88, F + 0.06);
}

// Tenders: six- or eight-wheeled with outside frames, or on bogies.
function tender(T){
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const L = T.L || 6.4, F = L / 2, W = T.W || 2.6, hw = W / 2, deck = T.deck || 1.25, top = T.top || 3.0, wr = T.r || 0.55;
  const C = mat(T.color, 0.38), LIN = mat(T.lining === undefined ? 0xc8262b : T.lining, 0.4), BLK = mat(BLACK, 0.7), FOOT = mat(T.foot === undefined ? BLACK : T.foot, 0.6);
  let list;
  if(T.bogies){
    list = [];
    for(const e of [1, -1]){
      const bz = e * (F - 1.7);
      for(const s of [-1, 1]) box(body, 0.1, 0.45, 2.6, BLK, s * 1.0, 0.62, bz);
      box(body, 2.0, 0.2, 0.4, BLK, 0, 0.95, bz);
      list.push({z: bz + 0.8, r: wr}, {z: bz - 0.8, r: wr});
    }
  } else {
    list = (T.axles || [F - 1.2, 0, -(F - 1.2)]).map(z => ({z, r: wr}));
    for(const s of [-1, 1]){
      box(body, 0.06, 0.62, L - 0.4, BLK, s * 1.0, 0.86, 0);
      list.forEach(a => { box(body, 0.16, 0.32, 0.36, BLK, s * 1.04, wr, a.z); box(body, 0.12, 0.1, 0.9, mat(0x333333, 0.5, 0.4), s * 1.05, wr + 0.32, a.z); });
    }
  }
  box(body, W, 0.07, L - 0.05, FOOT, 0, deck, 0);
  for(const s of [-1, 1]) box(body, 0.04, 0.2, L - 0.1, C, s * (hw - 0.02), deck - 0.12, 0);
  box(body, W - 0.3, 0.3, 0.12, BLK, 0, deck - 0.2, F - 0.06);
  box(body, W, deck - 0.78, 0.12, mat(T.beam === undefined ? BEAM : T.beam, 0.5), 0, (deck + 0.78) / 2, -F + 0.06);
  buffers(body, -F + 0.06, -1);
  const tz0 = -F + 0.1, tz1 = F - (T.front || 0.7), tl = tz1 - tz0;
  box(body, W - 0.04, top - deck, tl, C, 0, (top + deck) / 2, (tz0 + tz1) / 2);
  if(T.flare) for(const s of [-1, 1]){ const fl = box(body, 0.05, 0.38, tl, C, s * (hw + 0.04), top + 0.16, (tz0 + tz1) / 2); fl.rotation.z = -s * 0.35; }
  if(T.rails) for(const s of [-1, 1]) box(body, 0.05, 0.05, tl * 0.6, BLK, s * (hw - 0.05), top + 0.4, tz1 - tl * 0.3);
  const coalLen = tl * (T.coalFrac || 0.55), COAL = mat(0x141414, 0.95);
  box(body, W - 0.3, 0.25, coalLen, COAL, 0, top + 0.04, tz1 - coalLen / 2);
  for(let k = 0; k < 6; k++){ const c = box(body, 0.55, 0.35, 0.55, COAL, (k % 3 - 1) * 0.6, top + 0.16, tz1 - 0.4 - k * coalLen / 7); c.rotation.set(0.3 * k, 0.7 * k, 0.2); }
  for(const s of [-1, 1]) box(body, 0.6, 0.5, 0.45, C, s * 0.8, deck + 0.25, tz1 + 0.25);
  cylY(body, 0.22, 0.22, 0.14, brassMat(), 0, top + 0.07, tz0 + 0.6, 16);
  if(T.lining !== null) lining(body, LIN, hw - 0.02, deck, top, tz0, tz1);
  lamp(body, 0.62, deck, -F + 0.14, -1);
  const spots = {tender: {sx: hw - 0.02, y: (deck + top) / 2, z: (tz0 + tz1) / 2, h: top - deck, len: tl}};
  (T.marks || []).forEach(mk => mark(body, spots, mk));
  const axles = addWheels(root, list, {color: T.wheel === undefined ? T.color : T.wheel, spokes: T.spokes === undefined ? 12 : T.spokes, rim: T.rim});
  const v = finish(root, body, axles);
  v.len = L + 0.45;
  return v;
}

// Tram engines (Toby, Flora): the whole engine boxed in a wooden body with side plates and cowcatchers.
function tram(S){
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const L = S.L || 7.4, F = L / 2, W = 2.6, hw = W / 2, deck = 1.05, top = 3.15;
  const C = mat(S.color, 0.45), PL = mat(S.plates, 0.5), LIN = mat(S.lining, 0.4), BLK = mat(BLACK, 0.7), CC = mat(S.catcher, 0.55);
  box(body, 1.1, deck - 0.4, L - 0.3, BLK, 0, deck / 2 + 0.2, 0);
  for(const e of [1, -1]){
    const z = e * (F - 0.06);
    box(body, W, 0.4, 0.12, mat(BEAM, 0.5), 0, 1.0, z);
    buffers(body, z, e);
    for(let k = 0; k < 5; k++){ const b = box(body, W - 0.15, 0.12, 0.05, CC, 0, 0.25 + k * 0.13, z + e * (0.5 - k * 0.07)); b.rotation.x = e * 0.55; }
  }
  box(body, W, top - deck, L - 0.25, C, 0, (top + deck) / 2, 0);
  for(const s of [-1, 1]) box(body, 0.05, deck - 0.12, L - 0.45, PL, s * (hw + 0.02), (deck + 0.12) / 2, 0);
  for(const s of [-1, 1]) for(let i = 0; i < 3; i++){
    const z = -L / 3 + i * L / 3;
    const w = add(body, new THREE.PlaneGeometry(1.5, 0.8), glassMat(), s * (hw + 0.006), 2.45, z); w.rotation.y = s * Math.PI / 2;
  }
  lining(body, LIN, hw, deck, top, -F + 0.12, F - 0.12, 0.1);
  for(const s of [-1, 1]) box(body, 0.03, 0.05, L - 0.4, LIN, s * (hw + 0.012), 2.0, 0);
  for(const e of [1, -1]) for(const s of [-1, 1]){ const w = add(body, new THREE.PlaneGeometry(0.75, 0.7), glassMat(), s * 0.62, 2.45, e * (F - 0.12) + e * 0.006); if(e < 0) w.rotation.y = Math.PI; }
  roof(body, W + 0.12, L - 0.05, top + 0.32, mat(S.roof, 0.6), 0);
  box(body, 1.1, 0.3, L - 2.4, mat(S.roof, 0.6), 0, top + 0.42, 0);
  cylY(body, 0.22, 0.26, 0.7, mat(BLACK, 0.55), 0, top + 0.6, F - 1.3, 16);
  if(S.bell) cylY(body, 0.1, 0.18, 0.24, brassMat(), 0, top + 0.5, F - 0.6, 14);
  if(S.roofBoards){ for(const s of [-1, 1]) box(body, 0.05, 0.4, L - 1.4, mat(S.roofBoards, 0.5), s * 0.9, top + 0.55, 0); letter(body, 'SODOR TRAMWAYS', 'white', 0.22, 0.88, top + 0.55, 0); }
  faceOn(body, 0.58, S.face, 0, deck + 0.8, F - 0.11);
  lamp(body, 0, top - 0.1, F - 0.1);
  (S.marks || []).forEach(mk => mark(body, {side: {sx: hw, y: deck + 0.75, z: 0, h: 0.9}}, mk));
  const axles = addWheels(root, [{z: 1.5, r: 0.5, c: 1}, {z: 0, r: 0.5, c: 1}, {z: -1.5, r: 0.5, c: 1}], {color: BLACK, spokes: 0});
  const v = finish(root, body, axles);
  v.rods.forEach(r => r.mesh.visible = false);
  v.rods = [];
  v.len = L + 0.9;
  v.chimneyAt = new THREE.Vector3(0, top + 0.95, F - 1.3);
  return v;
}

// Vertical-boilered "coffee pot" engines (Glynn and his brothers).
function coffeePot(S){
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const L = 4.6, F = L / 2, deck = 1.0, C = mat(S.color, 0.45), BLK = mat(BLACK, 0.7), GREY = mat(0x8d9093, 0.5, 0.3);
  box(body, 1.4, 0.55, L - 0.3, BLK, 0, 0.72, 0);
  box(body, 2.3, 0.06, L - 0.1, mat(0x3a3a3a, 0.7), 0, deck, 0);
  for(const e of [1, -1]){ box(body, 2.3, 0.35, 0.12, mat(BEAM, 0.5), 0, 0.95, e * (F - 0.06)); buffers(body, e * (F - 0.06), e, 0.95, true); }
  const bz = 0.35, bR = 0.62, bH = 2.1;
  cylY(body, bR, bR, bH, C, 0, deck + bH / 2, bz, 28);
  for(let k = 0; k < 3; k++) cylY(body, bR + 0.012, bR + 0.012, 0.06, mat(0xd4af37, 0.3, 0.6), 0, deck + 0.3 + k * 0.75, bz, 28);
  domeCap(body, bR, GREY, 0, deck + bH, bz);
  cylY(body, 0.2, 0.22, 1.2, GREY, 0, deck + bH + 0.85, bz, 16);
  cylY(body, 0.25, 0.25, 0.12, brassMat(), 0, deck + bH + 1.45, bz, 16);
  for(const s of [-1, 1]){
    cylY(body, 0.16, 0.16, 0.8, BLK, s * 0.8, deck + 0.9, bz, 12);
    box(body, 0.06, 0.06, 1.4, mat(0x9a9da1, 0.3, 0.7), s * 0.8, deck + 0.4, 0);
    for(const zz of [-F + 0.2, F - 0.2]) cylY(body, 0.03, 0.03, 1.0, mat(0xd4af37, 0.3, 0.6), s * 1.05, deck + 0.5, zz, 6);
    box(body, 0.03, 0.03, L - 0.4, mat(0xd4af37, 0.3, 0.6), s * 1.05, deck + 1.0, 0);
  }
  box(body, 1.8, 0.7, 0.8, C, 0, deck + 0.35, -F + 0.55);
  box(body, 1.6, 0.2, 0.6, mat(0x121212, 0.95), 0, deck + 0.75, -F + 0.55);
  const fm = faceOn(body, 0.45, S.face, 0, deck + 1.25, bz + bR + 0.03);
  if(S.name) nameplate(body, S.name, '#c9a23a', '#1a1a1a', '#8a6a1a', 0.9, 0.2, bR - 0.04, deck + 1.7, bz);
  if(S.no) letter(body, S.no, 'yellow', 0.22, bR - 0.02, deck + 1.35, bz);
  const axles = addWheels(root, [{z: 0.95, r: 0.42, c: 1}, {z: -0.95, r: 0.42, c: 1}], {color: BLACK, spokes: 8});
  const v = finish(root, body, axles);
  v.len = L + 0.9; v.chimneyAt = new THREE.Vector3(0, deck + bH + 1.5, bz);
  return v;
}

// Scruff: a Sentinel-style box-bodied vertical-boiler shunter.
function sentinel(S){
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const L = 6.2, F = L / 2, deck = 1.0, W = 2.5, C = mat(S.color, 0.5), ST = mat(S.stripe, 0.5), BLK = mat(BLACK, 0.7);
  box(body, 1.2, 0.55, L - 0.3, BLK, 0, 0.72, 0);
  for(const e of [1, -1]){ box(body, W + 0.1, 0.35, 0.12, mat(BEAM, 0.5), 0, 0.95, e * (F - 0.06)); buffers(body, e * (F - 0.06), e, 0.95); }
  box(body, W, 2.1, L - 1.0, C, 0, deck + 1.05, -0.2);
  const nose = box(body, W, 1.6, 0.9, C, 0, deck + 0.8, F - 0.75);
  box(body, W - 0.4, 0.5, 0.8, C, 0, deck + 1.65, F - 0.85).rotation.x = 0.6;
  roof(body, W + 0.1, L - 0.9, deck + 2.35, ST, -0.2);
  for(const s of [-1, 1]){ box(body, 0.02, 0.22, L - 1.1, ST, s * (W / 2 + 0.008), deck + 0.6, -0.2); for(const z of [-1.6, 0.6]){ const w = add(body, new THREE.PlaneGeometry(0.8, 0.6), glassMat(), s * (W / 2 + 0.006), deck + 1.55, z); w.rotation.y = s * Math.PI / 2; } }
  for(const s of [-1, 1]){ const w = add(body, new THREE.PlaneGeometry(0.7, 0.55), glassMat(), s * 0.6, deck + 1.6, -F + 0.29); w.rotation.y = Math.PI; }
  cylY(body, 0.2, 0.22, 0.9, ST, 0, deck + 2.7, -0.6, 14);
  faceOn(body, 0.55, S.face, 0, deck + 0.85, F - 0.29);
  nameplate(body, 'SCRUFF', '#a08a3a', '#3a3a2a', '#6a5a2a', 1.0, 0.22, W / 2, deck + 1.0, -0.6);
  const axles = addWheels(root, [{z: 1.3, r: 0.45}, {z: -1.3, r: 0.45}], {color: 0x2a5a3a, spokes: 0});
  const v = finish(root, body, axles);
  v.len = L + 0.9; v.chimneyAt = new THREE.Vector3(0, deck + 3.1, -0.6);
  return v;
}

// Fergus: a railway traction engine with a flywheel and canopy.
function traction(S){
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const L = 5.6, F = L / 2, deck = 1.1, C = mat(S.color, 0.4), BLK = mat(BLACK, 0.7), BR = brassMat(), RED = mat(0xb3201c, 0.5);
  box(body, 1.2, 0.5, L - 0.3, BLK, 0, 0.75, 0);
  box(body, 2.3, 0.06, 1.6, mat(0x3a3a3a, 0.7), 0, deck, -F + 0.9);
  for(const e of [1, -1]){ box(body, 2.3, 0.35, 0.12, mat(BEAM, 0.5), 0, 1.0, e * (F - 0.06)); buffers(body, e * (F - 0.06), e, 1.0); for(const s of [-1, 1]) cylZ(body, 0.21, 0.21, 0.06, mat(0xa8703c, 0.35, 0.6), s * 0.87, 1.0, e * (F + 0.38), 18); }
  const bz0 = -1.0, bz1 = 2.0, by = 1.75, br = 0.55;
  cylZ(body, br, br, bz1 - bz0, C, 0, by, (bz0 + bz1) / 2, 28);
  for(let k = 0; k < 4; k++) cylZ(body, br + 0.012, br + 0.012, 0.06, BR, 0, by, bz0 + 0.2 + k * 0.85, 28);
  cylZ(body, br + 0.05, br + 0.05, 0.5, mat(0x2a2c30, 0.6), 0, by, bz1 + 0.2, 28);
  faceOn(body, br * 0.88, S.face, 0, by, bz1 + 0.47);
  chimneyS(body, {top: 4.1, r: 0.2, type: 'stovepipe', color: BLACK}, 0, by + br - 0.05, bz1 + 0.15);
  cylY(body, 0.23, 0.23, 0.12, BR, 0, 4.06, bz1 + 0.15, 16);
  box(body, 0.5, 0.45, 1.0, C, 0, by + br + 0.18, 0.9);
  cylZ(body, 0.16, 0.16, 1.2, BR, 0.32, by + br + 0.2, 0.9, 12);
  box(body, 1.6, 1.6, 0.9, C, 0, deck + 0.8, -F + 0.6);
  for(const s of [-1, 1]) for(const z of [-F + 0.2, bz1 + 0.1]) cylY(body, 0.05, 0.05, 2.5, BLK, s * 1.05, 3.0, z, 8);
  box(body, 2.4, 0.08, L - 0.6, mat(0x2a2c30, 0.6), 0, 4.25, -0.1);
  lining(body, BLK, 1.05, 3.9, 4.35, -F + 0.2, bz1 + 0.1, 0.05, 0.04);
  const fly = new THREE.Group(); fly.position.set(0, 2.2, -0.4);
  const ring1 = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.08, 8, 28), mat(S.color, 0.4)); ring1.rotation.y = Math.PI / 2; ring1.position.x = -1.2; fly.add(ring1);
  for(let k = 0; k < 3; k++){ const sp = box(fly, 0.05, 1.5, 0.08, mat(S.color, 0.4), -1.2, 0, 0); sp.rotation.x = k * Math.PI / 3; }
  cylX(fly, 0.12, 0.12, 0.3, BR, -1.2, 0, 0, 10);
  bakeVC(fly, true); root.add(fly);
  const axles = addWheels(root, [{z: 1.6, r: 0.5}, {z: -1.4, r: 0.75}], {color: 0xb3201c, spokes: 12});
  axles.push({z: -0.4, r: 0.55, coupled: false, g: fly});
  const v = finish(root, body, axles);
  v.len = L + 0.9; v.chimneyAt = new THREE.Vector3(0, 4.15, bz1 + 0.15);
  return v;
}

// Marion: a steam shovel on two bogies.
function shovel(S){
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const L = 8.6, F = L / 2, deck = 1.3, OR = mat(S.color, 0.45), BRN = mat(S.base, 0.5), BLK = mat(BLACK, 0.7), YEL = mat(0xf2c419, 0.45);
  box(body, 2.6, 0.5, L - 0.2, BRN, 0, deck - 0.2, 0);
  for(const e of [1, -1]){ box(body, 2.6, 0.35, 0.12, mat(BEAM, 0.5), 0, 1.0, e * (F - 0.06)); buffers(body, e * (F - 0.06), e); }
  for(const e of [1, -1]) for(const s of [-1, 1]) box(body, 0.1, 0.45, 2.4, BLK, s * 1.0, 0.6, e * 2.6);
  cylY(body, 1.4, 1.4, 0.2, BLK, 0, deck + 0.15, -0.6, 24);
  box(body, 3.0, 2.8, 5.0, OR, 0, deck + 1.65, -1.2);
  gable(body, 3.0, 5.2, deck + 3.05, OR, 0, -1.2);
  lining(body, YEL, 1.5, deck + 0.25, deck + 3.05, -3.7, 1.3, 0.12);
  box(body, 2.6, 1.0, 0.8, mat(0x6a6d70, 0.5), 0, deck + 0.75, -3.9);
  cylY(body, 0.2, 0.24, 1.3, BLK, 0.6, deck + 3.6, -3.0, 14);
  faceOn(body, 0.62, S.face, 0, deck + 1.35, 1.32);
  const boom = box(body, 0.5, 0.6, 7.2, OR, 0, deck + 3.6, 3.6); boom.rotation.x = -0.62;
  const stick = box(body, 0.36, 0.36, 4.6, BRN, 0, deck + 3.2, 6.4); stick.rotation.x = 0.35;
  box(body, 1.2, 1.0, 1.1, mat(0x55585c, 0.5, 0.4), 0, deck + 1.3, 7.0);
  letter(body, 'MARION', {fg: '#f2c419', line: '#b3201c', font: 'bold 92px Georgia, serif'}, 0.45, 1.5, deck + 2.2, -1.2);
  const list = [];
  for(const e of [1, -1]) list.push({z: e * 2.6 + 0.65, r: 0.45}, {z: e * 2.6 - 0.65, r: 0.45});
  const axles = addWheels(root, list, {color: BLACK, spokes: 0});
  const v = finish(root, body, axles);
  v.len = L + 0.9; v.chimneyAt = new THREE.Vector3(0.6, deck + 4.3, -3.0);
  return v;
}

// ------------------------------------------------------------------ diesel engines
// Shunters: a long bonnet, a cab (at the back or part-way), and coupled wheels.
function shunter(S){
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const L = S.L, F = L / 2, W = 2.6, hw = W / 2, deck = S.deck || 1.2;
  const BC = mat(S.bonColor === undefined ? S.color : S.bonColor, 0.45), CC = mat(S.cabColor === undefined ? S.color : S.cabColor, 0.45), BLK = mat(BLACK, 0.7);
  const FOOT = mat(S.foot === undefined ? BLACK : S.foot, 0.6), LIN = S.lining === undefined ? null : mat(S.lining, 0.4);
  box(body, 1.25, deck - 0.4, L - 0.3, BLK, 0, (deck + 0.4) / 2, 0);
  box(body, W, 0.07, L - 0.04, FOOT, 0, deck, 0);
  for(const s of [-1, 1]) box(body, 0.04, 0.24, L - 0.1, S.valance === undefined ? BLK : mat(S.valance, 0.5), s * (hw - 0.02), deck - 0.14, 0);
  for(const e of [1, -1]){
    const z = e * (F - 0.06), bm = e > 0 ? S.beamF : S.beamR;
    box(body, W, deck - 0.75, 0.12, mat(bm === undefined ? BEAM : bm, 0.5), 0, (deck + 0.75) / 2, z);
    if(S.stripes) hazard(body, W - 0.1, deck - 0.8, 0, (deck + 0.75) / 2, z + e * 0.065, e < 0);
    buffers(body, z, e);
    for(const s of [-1, 1]) box(body, 0.35, 0.05, 0.3, BLK, s * (hw - 0.2), 0.45, z - e * 0.2);
  }
  const b = S.bon, bw = b.w || 2.0, bt = b.top || 3.0, bl = b.z1 - b.z0, bzc = (b.z0 + b.z1) / 2;
  box(body, bw, bt - deck - 0.1, bl, BC, 0, (bt + deck) / 2 - 0.05, bzc);
  roof(body, bw, bl, bt + 0.08, BC, bzc);
  for(let k = 1; k < Math.round(bl / 0.9); k++) for(const s of [-1, 1]) box(body, 0.012, (bt - deck) * 0.7, 0.035, mat(0x111111, 0.7), s * (bw / 2 + 0.006), (bt + deck) / 2, b.z0 + k * bl / Math.round(bl / 0.9));
  for(const s of [-1, 1]) cylZ(body, 0.022, 0.022, bl - 0.3, mat(0xd0d3d6, 0.3, 0.8), s * (bw / 2 + 0.09), deck + (bt - deck) * 0.72, bzc, 6);
  add(body, new THREE.PlaneGeometry(bw * 0.82, (bt - deck) * 0.78), grilleMat, 0, (bt + deck) / 2, b.z1 + 0.01);
  if(S.noseStripes) hazard(body, bw * 0.9, 0.35, 0, deck + 0.3, b.z1 + 0.015);
  faceOn(body, Math.min(bw * 0.38, (bt - deck) * 0.4), S.face, 0, deck + (bt - deck) * 0.52, b.z1 + 0.03);
  cylY(body, 0.09, 0.1, 0.5, BLK, S.exX || 0, bt + 0.25, b.z0 + 0.5, 10);
  for(const s of [-1, 1]) lamp(body, s * 0.75, deck, F - 0.15);
  if(LIN){ lining(body, LIN, bw / 2, deck + 0.1, bt - 0.05, b.z0, b.z1, 0.1); }
  const c = S.cab, cl = c.z1 - c.z0, czc = (c.z0 + c.z1) / 2, cr = c.roof || 3.85, cw = W - 0.1;
  box(body, cw, cr - deck, cl, CC, 0, (cr + deck) / 2, czc);
  roof(body, cw + 0.12, cl + 0.25, cr + 0.12, mat(S.roof === undefined ? ROOFGREY : S.roof, 0.6), czc);
  const WF = mat(S.winFrame === undefined ? 0x2a2a2a : S.winFrame, 0.5);
  for(const f of [1, -1]) for(const s of [-1, 1]){
    const z = f > 0 ? c.z1 : c.z0, y = (Math.max(bt, S.rearTop || deck) + cr) / 2 + 0.1;
    box(body, 0.78, 0.72, 0.05, WF, s * 0.62, y, z + f * 0.01);
    const w = add(body, new THREE.PlaneGeometry(0.64, 0.6), glassMat(), s * 0.62, y, z + f * 0.04); if(f < 0) w.rotation.y = Math.PI;
  }
  for(const s of [-1, 1]){
    const w = add(body, new THREE.PlaneGeometry(Math.min(1.1, cl * 0.5), 0.7), glassMat(), s * (cw / 2 + 0.006), cr - 0.75, czc + cl * 0.15); w.rotation.y = s * Math.PI / 2;
    box(body, 0.03, 1.7, 0.03, mat(0xd0d3d6, 0.3, 0.8), s * (cw / 2 + 0.06), deck + 0.9, c.z0 + 0.1);
  }
  if(LIN) lining(body, LIN, cw / 2, deck + 0.05, cr - 0.05, c.z0, c.z1, 0.1);
  if(S.rear){ const r = S.rear; box(body, r.w || 2.0, r.top - deck, r.z1 - r.z0, BC, 0, (r.top + deck) / 2, (r.z0 + r.z1) / 2); roof(body, r.w || 2.0, r.z1 - r.z0, r.top + 0.06, BC, (r.z0 + r.z1) / 2); }
  if(S.rearStripes) hazard(body, cw * 0.9, 0.5, 0, deck + 0.6, (S.rear ? S.rear.z0 : c.z0) - 0.01, true);
  if(S.skirts){ for(const s of [-1, 1]) box(body, 0.05, deck - 0.2, L - 0.7, mat(S.skirts, 0.5), s * (hw + 0.02), (deck + 0.2) / 2, 0); }
  const spots = {bonnet: {sx: bw / 2, y: (bt + deck) / 2, z: bzc, h: bt - deck}, cab: {sx: cw / 2, y: deck + (cr - deck) * 0.38, z: czc, h: cr - deck},
    skirt: {sx: hw + 0.02, y: (deck + 0.2) / 2, z: 0, h: deck - 0.2}};
  if(S.extra) S.extra(body, {BC, CC, BLK, deck, F, W, bt, cr, spots});
  (S.marks || []).forEach(mk => mark(body, spots, mk));
  const axles = addWheels(root, S.wheels, {color: S.wheel === undefined ? BLACK : S.wheel, spokes: 0, rim: S.rim});
  if(S.jack){
    const jg = new THREE.Group(); jg.position.set(0, S.wheels[0].r, S.jack);
    for(const s of [-1, 1]) cylX(jg, 0.32, 0.32, 0.1, mat(S.jackColor === undefined ? BLACK : S.jackColor, 0.5), s * (HG + 0.05), 0, 0, 16);
    bakeVC(jg, false); root.add(jg);
    axles.push({z: S.jack, r: S.wheels[0].r, coupled: true, g: jg});
  }
  const v = finish(root, body, axles, S.rods);
  v.len = L + 0.9;
  return v;
}

// Main-line diesels and railcars on bogies: a full-width body with a cab at each end.
function bogieDiesel(S){
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const L = S.L, F = L / 2, W = S.W || 2.75, hw = W / 2, deck = S.deck || 1.3, top = S.top || 3.85;
  const C = mat(S.color, 0.42), BLK = mat(BLACK, 0.7), ROOF = mat(S.roof === undefined ? 0x6a6d70 : S.roof, 0.6);
  box(body, W - 0.1, 0.4, L - 0.4, BLK, 0, deck - 0.2, 0);
  for(const e of [1, -1]){ const z = e * (F - 0.06); box(body, W - 0.1, 0.45, 0.12, mat(S.beam === undefined ? BEAM : S.beam, 0.5), 0, 1.05, z); buffers(body, z, e, 1.06); }
  const list = [];
  (S.bogies).forEach(bg => {
    const span = (bg.n - 1) * (bg.wb || 2.0);
    for(const s of [-1, 1]) box(body, 0.12, 0.5, span + 1.2, BLK, s * 1.05, 0.62, bg.z);
    box(body, 2.0, 0.25, span + 0.6, BLK, 0, 0.95, bg.z);
    for(let k = 0; k < bg.n; k++) list.push({z: bg.z - span / 2 + k * (bg.wb || 2.0), r: bg.r || 0.52});
  });
  const ends = S.ends || 1.6, ez = F - 0.15;
  if(S.type === 'centre'){
    const ch = S.cabLen || 3.4, bt = S.bonTop || 2.9;
    box(body, W - 0.15, bt - deck, L - 0.4, C, 0, (bt + deck) / 2, 0);
    roof(body, W - 0.15, L - 0.4, bt + 0.08, C, 0);
    box(body, W, top - deck, ch, C, 0, (top + deck) / 2, 0);
    roof(body, W + 0.05, ch + 0.2, top + 0.12, ROOF, 0);
    for(const f of [1, -1]) for(const s of [-1, 1]){ const w = add(body, new THREE.PlaneGeometry(0.9, 0.7), glassMat(), s * 0.65, top - 0.6, f * (ch / 2 + 0.01)); if(f < 0) w.rotation.y = Math.PI; box(body, 1.05, 0.85, 0.04, mat(S.winFrame === undefined ? 0xeeeeee : S.winFrame, 0.5), s * 0.65, top - 0.6, f * ch / 2); }
    for(const s of [-1, 1]){ const w = add(body, new THREE.PlaneGeometry(1.2, 0.7), glassMat(), s * (hw + 0.006), top - 0.65, 0); w.rotation.y = s * Math.PI / 2; }
    for(const e of [1, -1]) add(body, new THREE.PlaneGeometry(W - 0.25, bt - deck - 0.1), mat(S.panel === undefined ? 0xf2c400 : S.panel, 0.45), 0, (bt + deck) / 2, e * (F - 0.2 + 0.012)).rotation.y = e < 0 ? Math.PI : 0;
    faceOn(body, 0.7, S.face, 0, deck + (bt - deck) * 0.5, F - 0.2 + 0.03);
  } else {
    const bz0 = -F + 0.2, bz1 = F - 0.2;
    if(S.type === 'nose'){
      box(body, W, top - deck, L - 2 * ends - 0.4, C, 0, (top + deck) / 2, 0);
      for(const e of [1, -1]){
        box(body, W, 1.35, ends, C, 0, deck + 0.675, e * (F - 0.2 - ends / 2));
        const ws = box(body, W - 0.1, 1.5, 0.12, C, 0, deck + 1.35 + 0.55, e * (F - 0.2 - ends + 0.5));
        ws.rotation.x = -e * 0.55;
        for(const s of [-1, 1]){ const w = add(body, new THREE.PlaneGeometry(0.95, 0.75), glassMat(), s * 0.62, deck + 1.95, e * (F - 0.2 - ends + 0.56)); w.rotation.x = -e * 0.55; if(e < 0) w.rotation.y = Math.PI; }
      }
      roof(body, W + 0.02, L - 2 * ends + 0.6, top + 0.12, ROOF, 0);
      faceOn(body, 0.62, S.face, 0, deck + 0.7, F - 0.2 + 0.02);
    } else {
      box(body, W, top - deck, bz1 - bz0, C, 0, (top + deck) / 2, 0);
      roof(body, W + 0.04, bz1 - bz0 + 0.1, top + 0.14, ROOF, 0);
      for(const e of [1, -1]){
        const n = S.frontWin || 2, ww = (W - 0.5) / n;
        for(let k = 0; k < n; k++){ const x = -W / 2 + 0.25 + ww * (k + 0.5); const w = add(body, new THREE.PlaneGeometry(ww - 0.12, 0.7), glassMat(), x, top - 0.75, e * (bz1 + 0.012)); if(e < 0) w.rotation.y = Math.PI; }
        for(const s of [-1, 1]){ const w = add(body, new THREE.PlaneGeometry(0.7, 0.65), glassMat(), s * (hw + 0.006), top - 0.75, e * (bz1 - 0.6)); w.rotation.y = s * Math.PI / 2; }
        if(S.whiskers) add(body, new THREE.PlaneGeometry(W - 0.3, 0.8), mat(S.whiskers, 0.45), 0, deck + 0.6, e * (bz1 + 0.01)).rotation.y = e < 0 ? Math.PI : 0;
      }
      faceOn(body, 0.62, S.face, 0, deck + (top - 0.75 - 0.6 - deck) / 2 + 0.25, bz1 + 0.025);
    }
    if(S.saloon){
      const n = S.saloon, pitch = (L - 4.4) / n;
      for(const s of [-1, 1]) for(let k = 0; k < n; k++){ const w = add(body, new THREE.PlaneGeometry(pitch * 0.78, 0.82), glassMat(), s * (hw + 0.006), deck + 1.55, -L / 2 + 2.2 + pitch * (k + 0.5)); w.rotation.y = s * Math.PI / 2; }
    } else if(S.grilles){
      for(const s of [-1, 1]) for(let k = 0; k < S.grilles; k++){ const w = add(body, new THREE.PlaneGeometry(0.9, 0.55), grilleMat, s * (hw + 0.006), top - 0.8, -L / 2 + 3.5 + k * (L - 7) / Math.max(1, S.grilles - 1)); w.rotation.y = s * Math.PI / 2; }
    }
  }
  if(S.stripe){ for(const s of [-1, 1]) for(const y of S.stripe.ys) box(body, 0.012, S.stripe.h || 0.12, L - 0.6, mat(S.stripe.color, 0.45), s * (hw + 0.008), y, 0); }
  const spots = {side: {sx: hw, y: deck + (top - deck) * 0.4, z: 0, h: top - deck}, cab: {sx: hw, y: deck + (top - deck) * 0.35, z: F - 1.4, h: top - deck}};
  if(S.extra) S.extra(body, {C, BLK, deck, top, F, W, spots});
  (S.marks || []).forEach(mk => mark(body, spots, mk));
  const axles = addWheels(root, list, {color: S.wheel === undefined ? BLACK : S.wheel, spokes: 0});
  const v = finish(root, body, axles);
  v.len = L + 0.9;
  return v;
}

// ------------------------------------------------------------------ small and unusual vehicles
function flynnModel(){
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const RED = mat(0xc8201e, 0.4), YEL = mat(0xf2c419, 0.45), BLK = mat(BLACK, 0.7), CH = mat(0x9a9da1, 0.35, 0.7), L = 10.0, F = L / 2;
  box(body, 1.4, 0.4, L - 0.6, BLK, 0, 0.75, 0);
  box(body, 2.55, 2.3, 2.0, RED, 0, 2.15, F - 1.3);
  box(body, 2.55, 2.2, L - 2.6, RED, 0, 2.1, -1.0);
  roof(body, 2.6, 2.1, 3.38, RED, F - 1.3);
  for(const s of [-1, 1]){ box(body, 0.012, 0.12, L - 0.6, YEL, s * 1.282, 1.35, -0.2); box(body, 0.012, 0.06, L - 2.6, YEL, s * 1.282, 2.9, -1.0); }
  add(body, new THREE.PlaneGeometry(2.2, 0.9), glassMat(), 0, 2.75, F - 0.29);
  for(const s of [-1, 1]){ const w = add(body, new THREE.PlaneGeometry(0.9, 0.7), glassMat(), s * 1.283, 2.75, F - 1.2); w.rotation.y = s * Math.PI / 2; }
  for(const s of [-1, 1]) for(let k = 0; k < 4; k++){ const d = box(body, 0.02, 1.6, 0.9, mat(0xa81a1a, 0.4), s * 1.285, 2.0, -F + 1.0 + k * 1.3); }
  box(body, 2.4, 0.4, 0.3, CH, 0, 1.0, F - 0.15);
  add(body, new THREE.PlaneGeometry(1.6, 0.6), grilleMat, 0, 1.6, F - 0.29);
  faceOn(body, 0.55, {smile: 0.8, brow: -0.2}, 0, 1.55, F - 0.27);
  cylY(body, 0.25, 0.3, 0.3, CH, 0, 3.55, F - 1.4, 14);
  const turret = cylZ(body, 0.09, 0.12, 1.4, CH, 0, 3.75, F - 0.8, 10);
  for(const s of [-1, 1]) box(body, 0.3, 0.1, 0.15, mat(0x2a6aff, 0.3), s * 0.5, 3.48, F - 1.3);
  letter(body, 'SODOR SEARCH & RESCUE', 'white', 0.18, 1.27, 2.0, F - 1.3);
  for(const z of [F - 1.6, -F + 1.8]) for(const s of [-1, 1]){ const t = cylX(body, 0.62, 0.62, 0.45, mat(0x1a1a1a, 0.9), s * 1.1, 0.95, z, 20); cylX(body, 0.3, 0.3, 0.47, CH, s * 1.1, 0.95, z, 12); }
  for(const e of [1, -1]){ box(body, 2.5, 0.35, 0.12, mat(0x2a2a2a, 0.5), 0, 1.0, e * (F - 0.06)); }
  const axles = addWheels(root, [{z: F - 0.6, r: 0.35}, {z: -F + 0.6, r: 0.35}], {color: BLACK, spokes: 0});
  const v = finish(root, body, axles); v.len = L + 0.3;
  return v;
}
function winstonModel(){
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const R1 = mat(0xb3201c, 0.4), R2 = mat(0xe04a3a, 0.4), BLK = mat(BLACK, 0.7), L = 4.2, F = L / 2;
  box(body, 2.0, 0.35, L - 0.2, BLK, 0, 0.62, 0);
  box(body, 2.2, 0.75, L - 0.4, R1, 0, 1.18, 0);
  box(body, 2.2, 0.85, 2.4, R2, 0, 1.98, -0.2);
  roof(body, 2.3, 2.6, 2.5, R1, -0.2);
  for(const e of [1, -1]) add(body, new THREE.PlaneGeometry(1.9, 0.6), glassMat(), 0, 2.0, -0.2 + e * 1.21).rotation.y = e < 0 ? Math.PI : 0;
  for(const s of [-1, 1]){ const w = add(body, new THREE.PlaneGeometry(1.6, 0.55), glassMat(), s * 1.106, 2.0, -0.2); w.rotation.y = s * Math.PI / 2; }
  box(body, 2.0, 0.08, 1.0, mat(0xd8c9a0, 0.8), 0, 1.6, F - 0.6);
  cylZ(body, 0.06, 0.12, 0.4, brassMat(), 0.5, 2.6, 0.6, 10);
  for(const s of [-1, 1]) cylZ(body, 0.1, 0.1, 0.08, mat(0xe8eef2, 0.2, 0.8), s * 0.75, 1.25, F - 0.18, 12);
  faceOn(body, 0.32, {smile: 0.7, brow: -0.1}, 0, 1.18, F - 0.19);
  nameplate(body, 'WINSTON', '#c9a23a', '#1a1a1a', '#8a6a1a', 0.8, 0.18, 1.1, 1.2, -0.4);
  for(const e of [1, -1]) box(body, 2.0, 0.25, 0.1, BLK, 0, 0.62, e * (F - 0.05));
  const axles = addWheels(root, [{z: 1.1, r: 0.33}, {z: -1.1, r: 0.33}], {color: BLACK, spokes: 0});
  const v = finish(root, body, axles); v.len = L + 0.2;
  return v;
}
function staffordModel(){
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const WOOD = mat(0x8a5530, 0.55), BLK = mat(BLACK, 0.7), YEL = mat(0xf2c419, 0.45), L = 6.4, F = L / 2, deck = 1.1;
  box(body, 1.3, 0.6, L - 0.3, BLK, 0, 0.8, 0);
  box(body, 2.5, 0.07, L - 0.05, BLK, 0, deck, 0);
  for(const e of [1, -1]){ box(body, 2.6, 0.35, 0.12, mat(BEAM, 0.5), 0, 0.98, e * (F - 0.06)); buffers(body, e * (F - 0.06), e); }
  for(const e of [1, -1]){ box(body, 2.2, 1.2, 1.9, WOOD, 0, deck + 0.6, e * 1.95); lining(body, YEL, 1.1, deck, deck + 1.2, e * 1.95 - 0.95, e * 1.95 + 0.95, 0.08); }
  box(body, 2.5, 2.4, 2.0, WOOD, 0, deck + 1.2, 0);
  roof(body, 2.6, 2.2, deck + 2.55, mat(0x2a2a2a, 0.6), 0);
  for(const e of [1, -1]) for(const s of [-1, 1]){ const w = add(body, new THREE.PlaneGeometry(0.7, 0.6), glassMat(), s * 0.55, deck + 1.8, e * 1.006); if(e < 0) w.rotation.y = Math.PI; }
  lining(body, BLK, 1.25, deck, deck + 2.4, -1.0, 1.0, 0.1);
  lining(body, YEL, 1.25, deck, deck + 2.4, -1.0, 1.0, 0.16);
  faceOn(body, 0.48, {smile: 0.6, brow: 0.1}, 0, deck + 0.6, F - 0.09 - 0.0);
  letter(body, 'No. 1917', 'yellowB', 0.26, 1.1, deck + 0.6, 1.95);
  nameplate(body, 'STAFFORD', '#c9a23a', '#1a1a1a', '#8a6a1a', 1.0, 0.2, 1.25, deck + 1.15, 0);
  const axles = addWheels(root, [{z: 1.5, r: 0.5}, {z: -1.5, r: 0.5}], {color: BLACK, spokes: 0, rim: 0xb3201c});
  const v = finish(root, body, axles); v.len = L + 0.9;
  return v;
}

// ------------------------------------------------------------------ coaches
const sideTexCache = new Map();
function rrect(g, x, y, w, h, r){ g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function coachSideTex(D, len, h){
  const key = JSON.stringify([D.color, D.upper, D.surround, D.n, D.winW, D.winH, D.winTop, D.doors, D.lineColor, D.text, len, h, D.drawings]);
  if(sideTexCache.has(key)) return sideTexCache.get(key);
  const tex = canvasTex(1024, 256, (g, w, hh) => {
    const px = w / len, py = hh / h;
    g.fillStyle = hex(D.color); g.fillRect(0, 0, w, hh);
    const wy0 = (D.winTop || 0.42) * py, wh = (D.winH || 0.85) * py;
    if(D.upper !== undefined){ g.fillStyle = hex(D.upper); g.fillRect(0, 0, w, wy0 + wh + 0.14 * py); }
    const n = D.n, pitch = w / n, ww = (D.winW || 0.95) * px;
    for(let i = 0; i < n; i++){
      const cx = (i + 0.5) * pitch;
      if(D.surround !== undefined){ g.fillStyle = hex(D.surround); rrect(g, cx - ww / 2 - 0.09 * px, wy0 - 0.09 * py, ww + 0.18 * px, wh + 0.18 * py, 0.12 * px); g.fill(); }
      g.fillStyle = '#1b2731'; rrect(g, cx - ww / 2, wy0, ww, wh, 0.1 * px); g.fill();
      g.fillStyle = 'rgba(160,200,220,0.16)'; g.fillRect(cx - ww / 2 + 4, wy0 + 4, ww * 0.38, wh * 0.35);
      if(D.doors){
        g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 2;
        g.beginPath(); g.moveTo(i * pitch + 3, 4); g.lineTo(i * pitch + 3, hh - 4); g.stroke();
        g.fillStyle = '#d4af37'; g.fillRect(cx + ww / 2 + 0.08 * px, wy0 + wh + 0.2 * py, 0.1 * px, 0.05 * py);
      }
    }
    if(D.lineColor){
      g.fillStyle = D.lineColor; g.fillRect(0, wy0 + wh + 0.24 * py, w, 3); g.fillRect(0, Math.max(3, wy0 - 0.2 * py), w, 3);
      g.strokeStyle = D.lineColor; g.lineWidth = 2;
      for(let i = 0; i < n; i++) g.strokeRect(i * pitch + 0.12 * px, wy0 + wh + 0.36 * py, pitch - 0.24 * px, hh - (wy0 + wh + 0.36 * py) - 0.12 * py);
    }
    if(D.drawings){
      const cols = ['#f2c419', '#d23a26', '#2f8a3a', '#ffffff'];
      for(let k = 0; k < 7; k++){ g.strokeStyle = cols[k % 4]; g.lineWidth = 4; g.beginPath(); g.arc(80 + k * 130, hh * 0.78, 22 + (k % 3) * 6, 0, 7); g.stroke(); }
    }
    if(D.text){ g.fillStyle = D.textColor || '#f2e6c8'; g.font = `bold ${Math.round(0.3 * py)}px Georgia, serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(D.text, w / 2, hh - 0.42 * py); }
  });
  sideTexCache.set(key, tex);
  return tex;
}
function stockFrame(body, L, o = {}){
  const BLK = mat(BLACK, 0.7), floor = o.floor || 1.2;
  for(const s of [-1, 1]) box(body, 0.1, 0.3, L - 0.2, BLK, s * 1.15, floor - 0.2, 0);
  for(const e of [1, -1]){
    const z = e * (L / 2 - 0.06);
    box(body, 2.6, 0.32, 0.12, o.beam === undefined ? BLK : mat(o.beam, 0.5), 0, 1.06, z);
    buffers(body, z, e);
  }
  const list = [];
  if(o.bogies){
    for(const e of [1, -1]){
      const bz = e * o.bogies;
      for(const s of [-1, 1]) box(body, 0.1, 0.42, 3.0, BLK, s * 1.0, 0.62, bz);
      box(body, 2.0, 0.18, 0.4, BLK, 0, 0.92, bz);
      list.push({z: bz + 1.2, r: 0.48}, {z: bz - 1.2, r: 0.48});
    }
    box(body, 1.2, 0.5, 2.4, BLK, 0, floor - 0.5, 0);
  } else {
    (o.axles || [L / 2 - 1.5, -(L / 2 - 1.5)]).forEach(z => {
      list.push({z, r: o.r || 0.47});
      for(const s of [-1, 1]){ box(body, 0.18, 0.34, 0.32, BLK, s * 1.02, o.r || 0.47, z); box(body, 0.1, 0.1, 1.0, mat(0x333333, 0.5, 0.4), s * 1.05, (o.r || 0.47) + 0.3, z); }
    });
  }
  return list;
}
function coach(D){
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const L = D.L, F = L / 2, W = D.W || 2.75, hw = W / 2, floor = D.floor || 1.25, top = D.top || 3.55, bodyH = top - floor;
  const C = mat(D.color, 0.45), ROOF = mat(D.roof === undefined ? ROOFGREY : D.roof, 0.65), BLK = mat(BLACK, 0.7);
  const bal = D.balcony || 0, bz0 = -F + 0.12 + bal, bz1 = F - 0.12 - bal, blen = bz1 - bz0;
  if(D.openTop){
    for(const s of [-1, 1]) box(body, 0.08, 1.05, blen, C, s * (hw - 0.04), floor + 0.52, 0);
    for(const e of [1, -1]) box(body, W, 1.05, 0.08, C, 0, floor + 0.52, e * (blen / 2 - 0.04));
    box(body, W, 0.08, blen, mat(0x5a4632, 0.8), 0, floor + 0.04, 0);
    for(let k = 0; k < 2; k++) box(body, 0.08, 1.0, blen - 0.1, C, 0, floor + 0.5, 0).position.x = (k ? 1 : -1) * 0.02;
    for(let k = 0; k < 3; k++) box(body, W - 0.3, 0.5, 0.4, mat(0x6b4a2e, 0.7), 0, floor + 0.7, -blen / 3 + k * blen / 3);
    for(const s of [-1, 1]) for(let k = 0; k < 3; k++){ box(body, 0.012, 0.035, blen / 3 - 0.2, mat(0x111111), s * (hw + 0.008), floor + 0.92, -blen / 3 + k * blen / 3); box(body, 0.03, 0.08, 0.05, mat(0xd4af37, 0.3, 0.6), s * (hw + 0.02), floor + 0.6, -blen / 3 + k * blen / 3 + 0.4); }
    lining(body, mat(0x111111), hw, floor, floor + 1.05, bz0, bz1, 0.06);
  } else {
    box(body, W, bodyH, blen, C, 0, floor + bodyH / 2, (bz0 + bz1) / 2);
    sidePlatesTex(body, coachSideTex(D, blen, bodyH), blen - 0.04, bodyH - 0.04, hw + 0.01, floor + bodyH / 2, (bz0 + bz1) / 2);
    if(D.ends !== undefined) for(const e of [1, -1]) add(body, new THREE.PlaneGeometry(W - 0.06, bodyH - 0.06), mat(D.ends, 0.45), 0, floor + bodyH / 2, e * (bz1 + 0.01)).rotation.y = e < 0 ? Math.PI : 0;
    if(D.gangway) for(const e of [1, -1]) box(body, 1.0, 2.0, 0.3, BLK, 0, floor + 1.05, e * (bz1 + 0.13));
    if(bal) for(const e of [1, -1]){
      const z = e * (F - 0.12 - bal / 2);
      box(body, W - 0.1, 0.06, bal, mat(0x5a4632, 0.8), 0, floor, z);
      for(const s of [-1, 1]) box(body, 0.04, 0.95, bal, BLK, s * (hw - 0.05), floor + 0.5, z);
      box(body, W - 0.1, 0.04, 0.04, BLK, 0, floor + 0.97, e * (F - 0.14));
      for(const s of [-1, 1]) cylY(body, 0.04, 0.04, bodyH, BLK, s * (hw - 0.06), floor + bodyH / 2, e * (F - 0.14), 6);
    }
    if(D.doubleDeck){
      box(body, W, 0.06, L - 0.3, mat(0x5a4632, 0.8), 0, top + 0.02, 0);
      for(const s of [-1, 1]){ box(body, 0.04, 0.9, L - 0.4, C, s * (hw - 0.04), top + 0.47, 0); box(body, 0.012, 0.3, L - 0.6, mat(D.upper, 0.45), s * (hw - 0.01), top + 0.5, 0); }
      for(let k = 0; k < 5; k++) box(body, W - 0.4, 0.45, 0.35, mat(0x6b4a2e, 0.7), 0, top + 0.3, -L / 2 + 1.2 + k * (L - 2.4) / 4);
      const st = box(body, 0.8, 0.06, 2.4, mat(0xf2c419, 0.45), hw - 0.5, (floor + top) / 2 + 0.3, -F + 0.6); st.rotation.x = 0.78;
      letter(body, 'SODOR TRAMWAYS', 'cream', 0.24, hw - 0.04, top + 0.55, 0);
    } else roof(body, W + 0.06, L - 0.15, top + 0.32, ROOF, 0);
    if(D.clerestory) box(body, 1.1, 0.3, blen - 1.0, ROOF, 0, top + 0.38, 0);
    if(D.duckets) for(const s of [-1, 1]) box(body, 0.2, 0.9, 0.9, C, s * (hw + 0.08), floor + bodyH * 0.55, -F + 1.4);
  }
  const list = stockFrame(body, L, {bogies: D.bogies, axles: D.axles, floor, beam: D.beam});
  if(D.face) faceOn(body, Math.min(0.85, bodyH * 0.34), D.face, 0, floor + bodyH * 0.5, (D.faceEnd || 1) * (bz1 + 0.025), (D.faceEnd || 1) < 0);
  const axles = addWheels(root, list, {color: BLACK, spokes: D.spokes === undefined ? 0 : D.spokes, rim: D.rim});
  const v = finish(root, body, axles); v.len = L + 0.9;
  return v;
}

// ------------------------------------------------------------------ wagons
const plankTexCache = new Map();
function plankTex(color, planks, text, rust){
  const key = [color, planks, text, rust].join('|');
  if(plankTexCache.has(key)) return plankTexCache.get(key);
  const tex = canvasTex(512, 128, (g, w, h) => {
    g.fillStyle = hex(color); g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = 2;
    for(let k = 1; k < planks; k++){ g.beginPath(); g.moveTo(0, k * h / planks); g.lineTo(w, k * h / planks); g.stroke(); }
    g.fillStyle = 'rgba(20,20,20,0.85)';
    for(const x of [0.03, 0.3, 0.5, 0.7, 0.97]) g.fillRect(x * w - 5, 0, 10, h);
    g.beginPath(); g.moveTo(0.3 * w, h); g.lineTo(0.48 * w, 0); g.lineTo(0.5 * w, 0); g.lineTo(0.32 * w, h); g.fill();
    g.beginPath(); g.moveTo(0.7 * w, h); g.lineTo(0.52 * w, 0); g.lineTo(0.5 * w, 0); g.lineTo(0.68 * w, h); g.fill();
    if(rust){ g.fillStyle = 'rgba(140,70,30,0.35)'; for(let k = 0; k < 14; k++){ g.beginPath(); g.arc((k * 97) % w, (k * 41) % h, 6 + k % 5 * 3, 0, 7); g.fill(); } }
    if(text){ g.fillStyle = '#f0f0ea'; g.font = 'bold 30px Arial'; g.textAlign = 'center'; g.textBaseline = 'top'; g.fillText(text, 0.16 * w, 6); }
  });
  plankTexCache.set(key, tex);
  return tex;
}
const LOADS = {coal: 0x141414, stone: 0x8a857c, clay: 0xeeece2, rubbish: 0x6a5a3a, scrap: 0x5a4a3c, logs: 0x7a5a38};
function heapLoad(p, kind, L, y){
  const m = mat(LOADS[kind], kind === 'clay' ? 0.9 : 0.95);
  if(kind === 'logs'){ for(let k = 0; k < 6; k++) cylZ(p, 0.32, 0.32, L - 0.6, m, -0.7 + (k % 3) * 0.7, y + 0.35 + Math.floor(k / 3) * 0.55, 0, 10); return; }
  box(p, 2.3, 0.3, L - 0.5, m, 0, y + 0.1, 0);
  for(let k = 0; k < 7; k++){ const b = box(p, 0.7, 0.4, 0.8, m, ((k * 37) % 3 - 1) * 0.6, y + 0.3, -L / 2 + 0.7 + k * (L - 1.4) / 6); b.rotation.set(0.4 * k, 0.9 * k, 0.3 * k); }
}
function wagon(D){
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const L = D.L || 6.2, F = L / 2, W = 2.5, hw = W / 2, floor = 1.25, C = mat(D.color, 0.55), BLK = mat(BLACK, 0.7);
  let list = stockFrame(body, L, {axles: D.axles, bogies: D.bogies, beam: D.beam});
  let faceY = floor + 0.6, faceZ = F - 0.08;
  box(body, W, 0.08, L - 0.15, D.kind === 'tank' ? BLK : C, 0, floor, 0);
  switch(D.kind){
    case 'open': {
      const h = 0.15 * (D.planks || 7);
      for(const s of [-1, 1]) box(body, 0.06, h, L - 0.2, C, s * (hw - 0.03), floor + h / 2, 0);
      for(const e of [1, -1]) box(body, W, h, 0.06, C, 0, floor + h / 2, e * (F - 0.12));
      sidePlatesTex(body, plankTex(D.color, D.planks || 7, D.text, D.rust), L - 0.25, h, hw + 0.004, floor + h / 2, 0);
      if(D.load) heapLoad(body, D.load, L - 0.4, floor + h - 0.4);
      faceY = floor + h * 0.5; faceZ = F - 0.08;
      break;
    }
    case 'van': {
      const h = 2.0;
      box(body, W, h, L - 0.2, C, 0, floor + h / 2, 0);
      sidePlatesTex(body, plankTex(D.color, 9, D.text, false), L - 0.3, h, hw + 0.004, floor + h / 2, 0);
      for(const s of [-1, 1]) box(body, 0.03, h - 0.2, 1.4, mat(D.door === undefined ? D.color : D.door, 0.5), s * (hw + 0.02), floor + h / 2, 0);
      roof(body, W + 0.1, L - 0.1, floor + h + 0.25, mat(D.roof === undefined ? 0x6a6d70 : D.roof, 0.6), 0);
      faceY = floor + 1.0;
      break;
    }
    case 'brake': {
      const gw = D.style === 'gwr', h = 2.1, bl = gw ? L * 0.62 : L * 0.56, bz = gw ? -F + 0.15 + bl / 2 : 0;
      box(body, W - 0.1, h, bl, C, 0, floor + h / 2, bz);
      for(const s of [-1, 1]){ const w = add(body, new THREE.PlaneGeometry(0.45, 0.4), glassMat(), s * (hw - 0.04), floor + 1.5, bz + bl * 0.25); w.rotation.y = s * Math.PI / 2; }
      for(const e of (gw ? [1] : [1, -1])){
        const vz = gw ? bz + bl / 2 : e * (bl / 2);
        for(const s of [-1, 1]) box(body, 0.06, 1.0, 0.06, BLK, s * (hw - 0.1), floor + 0.5, vz + e * (gw ? L - bl - 0.4 : (F - bl / 2 - 0.25)));
        box(body, W - 0.2, 0.06, 0.06, BLK, 0, floor + 1.0, vz + e * (gw ? L - bl - 0.4 : (F - bl / 2 - 0.25)));
      }
      if(gw){ box(body, W - 0.1, 0.4, L - bl - 0.3, C, 0, floor + 0.2, bz + bl / 2 + (L - bl - 0.3) / 2); }
      if(D.duckets !== false) for(const s of [-1, 1]) box(body, 0.22, 0.9, 1.0, C, s * (hw + 0.06), floor + 1.25, bz);
      roof(body, W + 0.1, gw ? L - 0.2 : bl + 0.6, floor + h + 0.25, mat(0x55585c, 0.6), gw ? 0 : bz);
      cylY(body, 0.06, 0.06, 0.3, BLK, 0.5, floor + h + 0.35, bz - bl * 0.3, 8);
      if(D.text) letter(body, D.text, 'white', 0.24, hw - 0.04, floor + 0.8, bz - bl * 0.2);
      faceY = floor + 1.05; faceZ = gw ? bz + bl / 2 + 0.02 : bl / 2 + 0.02;
      break;
    }
    case 'tank': {
      const tr = 1.05, tl = L - 1.2;
      cylZ(body, tr, tr, tl, C, 0, floor + tr + 0.1, 0, 24);
      for(const e of [1, -1]) cylZ(body, tr + 0.02, tr + 0.02, 0.05, mat(0x2a2a2a, 0.5), 0, floor + tr + 0.1, e * tl / 2, 24);
      cylY(body, 0.35, 0.35, 0.4, C, 0, floor + 2 * tr + 0.25, 0, 14);
      for(const s of [-1, 1]) for(const zz of [-tl / 3, tl / 3]) box(body, 0.08, 0.5, 0.12, BLK, s * 0.9, floor + 0.3, zz);
      for(let k = 0; k < 3; k++) cylZ(body, tr + 0.015, tr + 0.015, 0.06, BLK, 0, floor + tr + 0.1, -tl / 3 + k * tl / 3, 24);
      if(D.text) letter(body, D.text, D.textStyle || 'white', 0.35, tr - 0.02, floor + tr + 0.1, 0);
      faceY = floor + tr + 0.1; faceZ = tl / 2 + 0.05;
      break;
    }
    case 'hopper': {
      const h = 2.2;
      for(const s of [-1, 1]) box(body, 0.06, h - 0.6, L - 0.3, C, s * (hw - 0.03), floor + 0.6 + (h - 0.6) / 2, 0);
      for(const e of [1, -1]){ const sl = box(body, W - 0.1, 0.06, 2.2, C, 0, floor + 1.3, e * (F - 1.0)); sl.rotation.x = -e * 0.75; }
      box(body, 1.6, 0.6, 1.2, C, 0, floor + 0.3, 0);
      heapLoad(body, 'coal', L - 0.6, floor + h - 0.55);
      if(D.text) letter(body, D.text, 'cream', 0.4, hw, floor + 1.4, 0);
      faceY = floor + 1.3; faceZ = F - 0.08;
      break;
    }
    case 'flat': {
      if(D.load) heapLoad(body, D.load, L - 0.4, floor);
      if(D.rest){ for(const s of [-1, 1]) box(body, 0.15, 1.6, 0.15, BLK, s * 0.4, floor + 0.8, D.rest); box(body, 1.0, 0.15, 0.4, BLK, 0, floor + 1.6, D.rest); }
      break;
    }
    case 'calliope': {
      box(body, W, 1.3, L - 0.3, C, 0, floor + 0.65, 0);
      lining(body, mat(0xf2c419, 0.45), hw, floor, floor + 1.3, -F + 0.2, F - 0.2, 0.08);
      for(let i = 0; i < 9; i++) for(let r = 0; r < 2; r++){ const hh = 0.5 + ((i * 7 + r * 3) % 9) * 0.12; cylY(body, 0.07, 0.07, hh, brassMat(), -0.8 + i * 0.2, floor + 1.3 + hh / 2, -0.4 + r * 0.5, 10); }
      add(body, new THREE.CircleGeometry(0.35, 20), mat(0x2f7a3a, 0.5), hw + 0.012, floor + 0.65, 1.2).rotation.y = Math.PI / 2;
      add(body, new THREE.CircleGeometry(0.35, 20), mat(0x2f7a3a, 0.5), -hw - 0.012, floor + 0.65, 1.2).rotation.y = -Math.PI / 2;
      letter(body, 'SR', 'yellow', 0.3, hw + 0.004, floor + 0.65, 1.2);
      break;
    }
    case 'snow': {
      box(body, W, 2.1, L - 2.4, C, 0, floor + 1.05, -1.0);
      roof(body, W + 0.1, L - 2.3, floor + 2.35, mat(0x55585c, 0.6), -1.0);
      cylZ(body, 1.3, 1.3, 1.4, C, 0, floor + 0.9, F - 1.0, 24);
      for(let k = 0; k < 6; k++){ const bl = box(body, 0.1, 2.3, 0.08, mat(0x3a3c40, 0.5, 0.5), 0, floor + 0.9, F - 0.28); bl.rotation.z = k * Math.PI / 6; }
      const ch = cylY(body, 0.3, 0.35, 1.4, C, 0.9, floor + 2.4, F - 1.1, 12); ch.rotation.z = -0.5;
      faceY = floor + 1.6; faceZ = -10;
      break;
    }
    case 'pump': {
      box(body, 1.8, 0.1, 2.4, C, 0, 0.85, 0);
      cylY(body, 0.06, 0.08, 0.9, BLK, 0, 1.3, 0, 8);
      const bar = box(body, 0.08, 0.08, 2.0, C, 0, 1.8, 0); bar.rotation.x = 0.2;
      for(const e of [1, -1]) box(body, 1.2, 0.06, 0.06, C, 0, 1.8 + e * 0.2, e * 1.0);
      break;
    }
    case 'draisine': {
      box(body, 0.1, 0.1, 2.2, C, -HG, 0.6, 0);
      box(body, 1.6, 0.08, 0.08, C, 0, 0.55, 0.6);
      box(body, 0.4, 0.08, 0.35, mat(0x222222, 0.8), -HG + 0.1, 1.15, -0.2);
      cylY(body, 0.03, 0.03, 0.6, C, -HG + 0.1, 0.85, -0.2, 6);
      cylZ(body, 0.03, 0.03, 0.6, C, -HG + 0.05, 1.1, 0.5, 6);
      box(body, 0.5, 0.04, 0.04, C, -HG + 0.05, 1.3, 0.75);
      break;
    }
  }
  if(D.face && faceZ > -5) faceOn(body, D.faceR || 0.55, D.face, 0, faceY, faceZ);
  const axles = addWheels(root, D.kind === 'pump' || D.kind === 'draisine' ? [{z: 0.8, r: 0.3}, {z: -0.8, r: 0.3}] : list, {color: BLACK, spokes: D.spokes === undefined ? 0 : D.spokes, rim: D.rim});
  const v = finish(root, body, axles); v.len = (D.kind === 'pump' || D.kind === 'draisine' ? 2.6 : L + 0.9);
  return v;
}

// Breakdown and rail cranes: a crane house on a turntable with the jib laid forward.
function railCrane(D){
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const L = D.L || 8.5, F = L / 2, W = 2.6, floor = 1.25, C = mat(D.color, 0.5), BLK = mat(BLACK, 0.7), RF = mat(D.roof === undefined ? 0xb4b7ba : D.roof, 0.6);
  const list = stockFrame(body, L, {bogies: D.bogies, axles: D.axles || [F - 1.2, 0, -(F - 1.2)]});
  box(body, W, 0.3, L - 0.15, C, 0, floor, 0);
  cylY(body, 1.25, 1.25, 0.2, BLK, 0, floor + 0.25, -0.8, 24);
  const hl = D.houseLen || 4.0, hh = D.houseH || 2.6, hz = -0.8 - 0.3;
  box(body, W - 0.1, hh, hl, C, 0, floor + 0.35 + hh / 2, hz);
  roof(body, W, hl + 0.2, floor + 0.35 + hh + 0.22, RF, hz);
  if(D.counter) box(body, W - 0.2, 1.2, 0.8, mat(D.counter, 0.5), 0, floor + 1.0, hz - hl / 2 - 0.35);
  if(D.stripes) for(const s of [-1, 1]) hazard(body, hl - 0.2, 0.3, s * (W / 2 - 0.04), floor + 0.6, hz).rotation.y = s * Math.PI / 2;
  if(D.steam) cylY(body, 0.18, 0.2, 1.3, mat(0x7a4a2a, 0.8), 0, floor + 0.35 + hh + 0.7, hz - hl * 0.3, 12);
  for(const s of [-1, 1]){ const w = add(body, new THREE.PlaneGeometry(0.7, 0.6), glassMat(), s * (W / 2 - 0.04), floor + 0.35 + hh - 0.6, hz + hl * 0.3); w.rotation.y = s * Math.PI / 2; }
  const jl = D.jib || 9.0, jib = new THREE.Group(); jib.position.set(0, floor + 1.4, hz + hl / 2); body.add(jib);
  jib.rotation.x = -(D.jibUp || 0.05);
  for(const s of [-1, 1]) box(jib, 0.12, 0.6, jl, mat(D.jibColor === undefined ? D.color : D.jibColor, 0.5), s * 0.35, 0, jl / 2);
  for(let k = 0; k < Math.round(jl / 0.9); k++){ const b = box(jib, 0.7, 0.06, 0.06, mat(D.jibColor === undefined ? D.color : D.jibColor, 0.5), 0, (k % 2 ? 0.25 : -0.25), 0.4 + k * 0.9); b.rotation.x = k % 2 ? 0.6 : -0.6; }
  box(jib, 0.4, 0.5, 0.5, BLK, 0, -0.45, jl - 0.3);
  if(D.face) faceOn(body, 0.6, D.face, 0, floor + 0.35 + hh * 0.45 - 0.1, hz - hl / 2 - 0.02, true);
  if(D.name) nameplate(body, D.name, '#c9a23a', '#1a1a1a', '#8a6a1a', 0.9, 0.2, W / 2 - 0.05, floor + 0.35 + hh * 0.7, hz - 0.8);
  const axles = addWheels(root, list, {color: BLACK, spokes: 0});
  const v = finish(root, body, axles); v.len = L + 0.9;
  return v;
}

// ------------------------------------------------------------------ cranes that are not rail vehicles
function kevinModel(){
  const g = new THREE.Group(), YEL = mat(0xf2c419, 0.45), BLK = mat(BLACK, 0.7), RED = mat(0xc8201e, 0.45);
  box(g, 1.8, 0.5, 3.4, YEL, 0, 0.85, 0);
  for(const s of [-1, 1]) for(const z of [1.1, -1.1]) cylX(g, 0.45, 0.45, 0.35, mat(0x1a1a1a, 0.9), s * 0.95, 0.45, z, 18);
  box(g, 1.6, 1.6, 1.5, YEL, 0, 1.9, -0.7);
  roof(g, 1.7, 1.6, 2.8, YEL, -0.7);
  add(g, new THREE.PlaneGeometry(1.0, 0.6), glassMat(), 0, 2.3, 0.06).position.z = 0.06;
  faceOn(g, 0.4, {smile: 0.9, brow: -0.3, wide: true}, 0, 1.7, 0.06);
  hazard(g, 1.7, 0.3, 0, 0.85, 1.71);
  const jib = box(g, 0.3, 0.3, 3.6, YEL, 0, 2.6, 1.4); jib.rotation.x = -0.5;
  cylY(g, 0.02, 0.02, 1.2, BLK, 0, 2.9, 3.0, 4);
  box(g, 0.25, 0.3, 0.2, RED, 0, 2.2, 3.0);
  bakeVC(g);
  return g;
}
function lattice(color){
  return new THREE.MeshStandardMaterial({color, roughness: 0.55, metalness: 0.3, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide, map: canvasTex(64, 64, (c, w, h) => {
    c.clearRect(0, 0, w, h); c.strokeStyle = '#fff'; c.lineWidth = 7;
    c.strokeRect(3, 3, w - 6, h - 6); c.beginPath(); c.moveTo(0, 0); c.lineTo(w, h); c.moveTo(w, 0); c.lineTo(0, h); c.stroke();
  })});
}
function latticeBox(p, w, h, d, m, x, y, z){
  const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv;
  const n = g.attributes.normal;
  for(let i = 0; i < uv.count; i++){
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i));
    const sx = ax > 0.5 ? d : w, sy = ay > 0.5 ? d : h;
    uv.setXY(i, uv.getX(i) * Math.max(1, Math.round(sx / 1.5)), uv.getY(i) * Math.max(1, Math.round(sy / 1.5)));
  }
  m.map.wrapS = m.map.wrapT = THREE.RepeatWrapping;
  return add(p, g, m, x, y, z);
}
function bigMickeyModel(){
  const g = new THREE.Group(), GR = mat(0x9a948a, 0.55, 0.2), LAT = lattice(0x9a948a), BLK = mat(BLACK, 0.7);
  box(g, 5.0, 1.0, 5.0, mat(0x777777, 0.8), 0, 0.5, 0);
  latticeBox(g, 3.0, 30, 3.0, LAT, 0, 16, 0);
  box(g, 4.0, 3.2, 3.6, GR, 0, 32.6, 0);
  roof(g, 4.1, 3.7, 34.4, GR, 0);
  faceOn(g, 1.0, {smile: 0.5, brow: 0.3}, 0, 32.4, 1.82);
  latticeBox(g, 2.0, 2.0, 38, LAT, 0, 35.4, 13);
  latticeBox(g, 2.0, 2.0, 14, LAT, 0, 35.4, -7);
  box(g, 3.0, 2.5, 3.0, mat(0x6a6d70, 0.7), 0, 34.2, -12.5);
  box(g, 1.4, 0.8, 1.6, GR, 0, 34.0, 18);
  cylY(g, 0.03, 0.03, 22, BLK, 0, 23, 18, 4);
  box(g, 0.8, 0.8, 0.6, mat(0xc8201e, 0.5), 0, 12, 18);
  bakeVC(g);
  return g;
}
function portalCrane(o){
  const g = new THREE.Group(), C = mat(o.color, 0.5), BLK = mat(BLACK, 0.7), RAIL = o.rail === undefined ? C : mat(o.rail, 0.5);
  for(const sx of [-1, 1]) for(const sz of [-1, 1]){ const leg = box(g, 0.7, o.legH, 0.7, C, sx * o.span / 2, o.legH / 2, sz * 2.6); leg.rotation.z = -sx * 0.06; }
  for(const sx of [-1, 1]) box(g, 0.8, 0.8, 6.0, C, sx * o.span / 2, 0.4, 0);
  box(g, o.span + 1.2, 1.0, 6.4, C, 0, o.legH + 0.5, 0);
  for(const sx of [-1, 1]) box(g, 0.06, 1.0, 6.4, RAIL, sx * (o.span / 2 + 0.6), o.legH + 1.5, 0);
  const top = new THREE.Group(); top.position.y = o.legH + 1.0; g.add(top);
  cylY(top, 1.8, 2.0, o.tower || 1.0, C, 0, (o.tower || 1.0) / 2, 0, 18);
  const ty = o.tower || 1.0;
  box(top, 4.0, 3.4, 5.0, C, 0, ty + 1.7, -0.6);
  roof(top, 4.1, 5.2, ty + 3.6, C, -0.6);
  box(top, 3.6, 2.2, 1.6, mat(o.counter === undefined ? 0x777777 : o.counter, 0.6), 0, ty + 1.3, -3.9);
  for(const s of [-1, 1]){ const w = add(top, new THREE.PlaneGeometry(1.2, 0.9), glassMat(), s * 2.006, ty + 2.4, 0.8); w.rotation.y = s * Math.PI / 2; }
  if(o.face) faceOn(top, 0.95, o.face, 0, ty + 1.6, 1.92);           // the harbours' working cranes have no faces
  const jib = new THREE.Group(); jib.position.set(0, ty + 2.6, 1.9); jib.rotation.x = -o.jibUp; top.add(jib);
  for(const s of [-1, 1]) box(jib, 0.25, 0.9, o.jib, C, s * 0.6, 0, o.jib / 2);
  for(let k = 0; k < Math.round(o.jib / 1.4); k++){ const b = box(jib, 1.3, 0.1, 0.1, C, 0, k % 2 ? 0.3 : -0.3, 0.6 + k * 1.4); b.rotation.x = k % 2 ? 0.5 : -0.5; }
  if(o.knuckle) box(jib, 0.8, 0.8, 5.0, C, 0, -0.3, o.jib + 2.0).rotation.x = 1.0;
  const tipY = ty + 2.6 + o.jib * Math.sin(o.jibUp);
  cylY(top, 0.03, 0.03, tipY - 0.5, BLK, 0, (tipY + 0.5) / 2, 1.9 + o.jib * Math.cos(o.jibUp), 4);
  box(top, 0.6, 0.6, 0.6, mat(0xc8201e, 0.5), 0, 0.5, 1.9 + o.jib * Math.cos(o.jibUp));
  if(o.name) letter(top, o.name, o.nameStyle, 0.4, 2.0, ty + 3.0, -0.6);
  if(o.stripes) hazard(g, o.span, 0.5, 0, o.legH + 0.5, 3.21);
  if(o.animate){
    // keep the cab and jib as their own baked group (not merged into the rest) so it can slew at work
    g.remove(top);
    bakeVC(g);
    bakeVC(top);
    g.add(top);
    g.userData.crane = top;
  } else bakeVC(g);
  return g;
}

// ------------------------------------------------------------------ the North Western Railway fleet
// Each record: who they are (basis, livery from the TV series) and what they are doing on the map.
const N = (no) => ({t: String(no), style: 'nwr'});
const F_ = (o) => o;                                  // face options pass straight through
const FLEET = [];
const def = r => { FLEET.push(r); return r; };

// Steam engines
def({id: 'thomas', name: 'Thomas', no: '1', cat: 'Steam', wheels: '0-6-0T', basis: 'the LB&SCR E2 class, with extended side tanks',
  livery: 'NWR blue with red lining, yellow-framed windows, a light grey running board and red bufferbeams', dot: 0x2f5fd0,
  about: 'the cheeky No. 1, who runs his own branch line to Ffarquhar with his coaches Annie and Clarabel.',
  build: () => steam({L: 8.8, deck: 1.25, br: 0.66, by: 2.3, sbF: 3.85, sbLen: 1.05, bunker: 1.0, cabLen: 1.9, roofY: 3.7, color: 0x2f5fd0, foot: 0xb9bcbf,
    tank: 'side', tankTop: 2.55, tankFront: 2.65, chimney: {top: 3.72, r: 0.27, type: 'stumpy'}, dome: {r: 0.34, h: 0.24}, roundWindows: true,
    wheels: [{z: 2.15, r: 0.685, c: 1}, {z: -0.15, r: 0.685, c: 1}, {z: -2.6, r: 0.685, c: 1}],
    face: {smile: 0.85, brow: -0.2, look: 0.3}, marks: [{at: 'tank', t: '1', style: 'nwr', h: 0.6}]})});
def({id: 'edward', name: 'Edward', no: '2', cat: 'Steam', wheels: '4-4-0', basis: 'the Furness Railway K2 class',
  livery: 'NWR blue with red lining, a white running board and his number on the tender', dot: 0x3a62c8,
  about: 'the kind old engine who works his branch line from Wellsworth to Brendam Docks.',
  build: () => steam({L: 8.4, deck: 1.3, br: 0.68, by: 2.45, sbF: 3.75, sbLen: 1.1, cabLen: 1.9, roofY: 3.75, color: 0x2f5fd0, foot: 0xe8e8e6, tender: true,
    chimney: {top: 3.95, r: 0.26}, dome: {r: 0.4, h: 0.32}, wheels: [{z: 3.1, r: 0.47}, {z: 1.3, r: 0.47}, {z: -0.6, r: 0.915, c: 1}, {z: -2.95, r: 0.915, c: 1}],
    face: {smile: 0.7, brow: -0.3}}),
  tender: () => tender({L: 6.0, top: 2.9, color: 0x2f5fd0, foot: 0xe8e8e6, marks: [{at: 'tender', t: '2', h: 0.62}]})});
def({id: 'henry', name: 'Henry', no: '3', cat: 'Steam', wheels: '4-6-0', basis: 'the LMS Stanier "Black Five" (his rebuild; he was first like a Gresley A1)',
  livery: 'NWR green with red lining, a light grey running board and his number on the tender', dot: 0x1f7a3a,
  about: 'the big green engine who pulls the Flying Kipper, the overnight fish train.',
  build: () => steam({L: 11.6, deck: 1.65, br: 0.8, by: 2.75, sbF: 4.95, sbLen: 1.5, cabLen: 2.2, roofY: 3.9, color: 0x1f7a3a, foot: 0xb9bcbf, tender: true, belpaire: 2.4,
    chimney: {top: 3.98, r: 0.28}, dome: {r: 0.4, h: 0.22, z: 0.4}, cyl: {z: 3.0, y: 1.0, r: 0.33, len: 1.0, bars: 1.6},
    wheels: [{z: 4.55, r: 0.48}, {z: 2.7, r: 0.48}, {z: 0.75, r: 0.915, c: 1}, {z: -1.45, r: 0.915, c: 1}, {z: -3.85, r: 0.915, c: 1}],
    face: {smile: 0.2, brow: 0.5, look: -0.3}}),
  tender: () => tender({L: 7.0, top: 3.2, color: 0x1f7a3a, foot: 0xb9bcbf, marks: [{at: 'tender', t: '3', h: 0.66}]})});
def({id: 'gordon', name: 'Gordon', no: '4', cat: 'Steam', wheels: '4-6-2', basis: 'the LNER Gresley A1 Pacific',
  livery: 'NWR blue with red lining, a white running board and his number on the eight-wheeled tender', dot: 0x1e48b0,
  about: 'the big blue express engine, proud to pull the Express on the Main Line.',
  build: () => steam({L: 13.0, deck: 1.75, br: 0.87, by: 2.85, sbF: 5.95, sbLen: 1.7, cabLen: 2.3, roofY: 3.92, color: 0x2f5fd0, foot: 0xe8e8e6, tender: true,
    chimney: {top: 3.98, r: 0.3, type: 'lipped'}, dome: {r: 0.42, h: 0.18, z: 1.0}, cyl: {z: 4.05, y: 1.0, r: 0.34, len: 1.0, bars: 1.7},
    wheels: [{z: 5.05, r: 0.48}, {z: 3.1, r: 0.48}, {z: 0.6, r: 1.025, c: 1}, {z: -1.55, r: 1.025, c: 1}, {z: -3.7, r: 1.025, c: 1}, {z: -5.6, r: 0.55}],
    face: {smile: 0.25, brow: 0.6, thick: true}}),
  tender: () => tender({L: 7.6, top: 3.25, color: 0x2f5fd0, foot: 0xe8e8e6, flare: true, axles: [2.6, 0.85, -0.85, -2.6], marks: [{at: 'tender', t: '4', h: 0.7}]})});
def({id: 'james', name: 'James', no: '5', cat: 'Steam', wheels: '2-6-0', basis: 'the L&YR Class 28 (in the TV series a 2-6-0 "Mogul")',
  livery: 'NWR red with black lining, brass boiler bands, a gold dome and black wheels', dot: 0xc8202a,
  about: 'the splendid red engine, who loves his paintwork and works goods and passenger trains.',
  build: () => steam({L: 10.0, deck: 1.35, br: 0.72, by: 2.55, sbF: 4.45, sbLen: 1.2, cabLen: 2.1, roofY: 3.85, color: 0xc8202a, lining: 0x111111, bands: BRASS, tender: true,
    chimney: {top: 3.95, r: 0.27}, dome: {r: 0.42, h: 0.32, color: 0xd4af37}, cyl: {z: 3.3, y: 0.95, r: 0.3}, wheel: BLACK, winFrame: 0xe8c33a,
    wheels: [{z: 3.95, r: 0.45}, {z: 1.55, r: 0.775, c: 1}, {z: -0.55, r: 0.775, c: 1}, {z: -2.7, r: 0.775, c: 1}],
    face: {smile: 0.6, brow: 0.4, look: 0.4}}),
  tender: () => tender({L: 6.2, top: 3.0, color: 0xc8202a, lining: 0x111111, wheel: BLACK, marks: [{at: 'tender', t: '5', h: 0.64}]})});
def({id: 'percy', name: 'Percy', no: '6', cat: 'Steam', wheels: '0-4-0ST', basis: 'an Avonside 0-4-0 saddle tank',
  livery: 'NWR green with red lining, yellow-framed windows, a white running board and his number on the bunker', dot: 0x2a9a3a,
  about: 'the little green engine who works the mail train and shunts at the yards.',
  build: () => steam({L: 6.6, deck: 1.15, br: 0.56, by: 2.0, sbF: 2.85, sbLen: 0.85, bunker: 0.7, cabLen: 1.7, roofY: 3.45, color: 0x2a9a3a, foot: 0xe8e8e6,
    tank: 'saddle', saddleR: 0.92, chimney: {top: 3.5, r: 0.22}, dome: {r: 0.3, h: 0.22}, cyl: {z: 2.05, y: 0.75, r: 0.24, len: 0.8, bars: 0.9},
    wheels: [{z: 1.2, r: 0.6, c: 1}, {z: -1.0, r: 0.6, c: 1}], face: {smile: 0.9, brow: -0.4, wide: true},
    marks: [{at: 'bunker', t: '6', h: 0.5}]})});
def({id: 'toby', name: 'Toby', no: '7', cat: 'Steam', wheels: '0-6-0T (tram engine)', basis: 'the GER Class C53 (LNER J70) tram engine',
  livery: 'brown with grey side plates and cowcatchers, red bufferbeams and his number on the middle side panel', dot: 0x8a5a2a,
  about: 'the old tram engine with cowcatchers and side plates, who works the Sodor Tramway with Henrietta.',
  build: () => tram({L: 7.4, color: 0x7a4a26, plates: 0x8d9093, lining: 0x5a3418, catcher: 0x8d9093, roof: 0x5a5d60, bell: true,
    face: {smile: 0.6, brow: -0.2, mustache: '#6b6b6b'}, marks: [{at: 'side', t: '7', h: 0.42}]})});
def({id: 'duck', name: 'Duck', no: '8', cat: 'Steam', wheels: '0-6-0PT', basis: 'the GWR 5700 class pannier tank',
  livery: 'unlined NWR (Great Western) green, black wheels and valances, GWR on his panniers and his number on the cab', dot: 0x2a7a3a,
  about: 'the Great Western engine who runs the Little Western, his branch line to Arlesburgh.',
  build: () => steam({L: 9.3, deck: 1.25, br: 0.68, by: 2.35, sbF: 4.05, sbLen: 1.0, bunker: 1.1, cabLen: 1.9, roofY: 3.75, color: 0x2a7a3a, valance: BLACK, wheel: BLACK,
    lining: 0x2a7a3a, tankLining: false, bunkerLining: false, cabLining: false, tank: 'pannier', belpaire: 1.6, dome: false, valves: 'bonnet', chimney: {top: 3.85, r: 0.26, type: 'copper'},
    wheels: [{z: 2.0, r: 0.705, c: 1}, {z: -0.2, r: 0.705, c: 1}, {z: -2.7, r: 0.705, c: 1}], face: {smile: 0.7, brow: -0.1},
    marks: [{at: 'tank', t: 'GWR', style: 'gwr', h: 0.4}, {at: 'cab', plate: '8', bg: '#2a7a3a', fg: '#f6c624', border: '#d4af37', w: 0.42, h: 0.34}]})});
def({id: 'donald', name: 'Donald', no: '9', cat: 'Steam', wheels: '0-6-0', basis: 'the Caledonian Railway 652 class',
  livery: 'British Railways black with white and red lining, and his number on the tender', dot: 0x2a2a2e,
  about: 'one of the Scottish twins who came to Sodor to help with the goods trains.',
  build: () => steam({L: 8.6, deck: 1.3, br: 0.7, by: 2.5, sbF: 3.75, sbLen: 1.1, cabLen: 2.0, roofY: 3.85, color: 0x1c1d20, lining: 0xd8d8d8, tender: true,
    chimney: {top: 3.95, r: 0.27, type: 'lipped'}, dome: {r: 0.42, h: 0.3}, wheels: [{z: 1.65, r: 0.77, c: 1}, {z: -0.6, r: 0.77, c: 1}, {z: -3.0, r: 0.77, c: 1}],
    face: {smile: 0.6, brow: 0.2, sideburns: '#6b6b6b'}}),
  tender: () => tender({L: 6.0, top: 3.0, color: 0x1c1d20, lining: 0xd8d8d8, marks: [{at: 'tender', t: '9', h: 0.62}]})});
def({id: 'douglas', name: 'Douglas', no: '10', cat: 'Steam', wheels: '0-6-0', basis: 'the Caledonian Railway 652 class',
  livery: 'British Railways black with white and red lining, and his number on the tender', dot: 0x3a3a3e,
  about: "Donald's twin, who was nearly scrapped before he came to the North Western Railway.",
  build: () => steam({L: 8.6, deck: 1.3, br: 0.7, by: 2.5, sbF: 3.75, sbLen: 1.1, cabLen: 2.0, roofY: 3.85, color: 0x1c1d20, lining: 0xd8d8d8, tender: true,
    chimney: {top: 3.95, r: 0.27, type: 'lipped'}, dome: {r: 0.42, h: 0.3}, wheels: [{z: 1.65, r: 0.77, c: 1}, {z: -0.6, r: 0.77, c: 1}, {z: -3.0, r: 0.77, c: 1}],
    face: {smile: 0.4, brow: -0.2, sideburns: '#6b6b6b', look: -0.4}}),
  tender: () => tender({L: 6.0, top: 3.0, color: 0x1c1d20, lining: 0xd8d8d8, marks: [{at: 'tender', t: '10', h: 0.62}]})});
def({id: 'oliver', name: 'Oliver', no: '11', cat: 'Steam', wheels: '0-4-2T', basis: 'the GWR 1400 class',
  livery: 'unlined Great Western green with the GWR "shirtbutton" crest on his tanks and his number on the cab', dot: 0x2f8a46,
  about: 'the Great Western tank engine who works the Little Western with Duck, and his brake van Toad.',
  build: () => steam({L: 8.9, deck: 1.2, br: 0.64, by: 2.35, sbF: 3.95, sbLen: 0.95, bunker: 1.0, cabLen: 1.9, roofY: 3.75, color: 0x2a7a3a, valance: BLACK, wheel: BLACK,
    tankLining: false, bunkerLining: false, cabLining: false, tank: 'side', tankTop: 2.6, tankFront: 1.9, belpaire: 1.5, dome: false, valves: 'bonnet', valveZ: 1.1,
    chimney: {top: 3.85, r: 0.25, type: 'copper'}, wheels: [{z: 1.85, r: 0.79, c: 1}, {z: -0.55, r: 0.79, c: 1}, {z: -3.3, r: 0.48}],
    face: {smile: 0.7, brow: -0.2, look: 0.3}, marks: [{at: 'tank', t: 'GWR', style: 'gwr', h: 0.34}, {at: 'cab', t: '11', style: 'nwr', h: 0.36}]})});
def({id: 'emily', name: 'Emily', no: '12', cat: 'Steam', wheels: '4-2-2', basis: 'the GNR Stirling Single',
  livery: 'emerald green with yellow lining, brass fittings and chocolate-brown valances', dot: 0x14a05a,
  about: 'the elegant emerald engine with a single great driving wheel, who pulls her own coaches.',
  build: () => steam({L: 9.4, deck: 1.2, br: 0.64, by: 2.4, sbF: 4.15, sbLen: 1.0, cabLen: 1.9, roofY: 3.8, color: 0x0f8a4a, lining: 0xf2c419, valance: 0x4a2a1a, tender: true,
    chimney: {top: 3.95, r: 0.25}, dome: {r: 0.4, h: 0.32, color: 0xd4af37}, bands: BRASS, splashTrim: BRASS, cyl: {z: 2.8, y: 1.0, r: 0.3, len: 0.95, bars: 1.4},
    wheels: [{z: 3.55, r: 0.58}, {z: 2.05, r: 0.58}, {z: -0.9, r: 1.23, c: 1}, {z: -3.6, r: 0.71}],
    face: {smile: 0.7, brow: -0.2, lashes: true}}),
  tender: () => tender({L: 6.0, top: 2.85, color: 0x0f8a4a, lining: 0xf2c419})});
def({id: 'bill', name: 'Bill', no: 'SCC 1', cat: 'Steam', wheels: '0-4-0ST', basis: 'the Bagnall saddle tank "Alfred"',
  livery: 'dandelion yellow with red lining and brass nameplates; SCC on the bunker', dot: 0xf2c80f,
  about: 'one of the twin engines who work the china clay trains between the clay pits and Brendam Docks.',
  build: () => steam({L: 6.2, deck: 1.1, br: 0.5, by: 1.85, sbF: 2.7, sbLen: 0.75, bunker: 0.6, cabLen: 1.6, roofY: 3.3, color: 0xf2c80f, tank: 'saddle', saddleR: 0.85,
    chimney: {top: 3.3, r: 0.2}, dome: {r: 0.28, h: 0.2, color: 0xd4af37}, cyl: {z: 1.95, y: 0.7, r: 0.22, len: 0.7, bars: 0.8},
    wheels: [{z: 0.95, r: 0.5, c: 1}, {z: -0.85, r: 0.5, c: 1}], face: {smile: 0.95, brow: -0.4, look: 0.6},
    marks: [{at: 'tank', plate: 'BILL', w: 0.7, h: 0.22, bg: '#c9a23a', fg: '#2a2a2a'}, {at: 'bunker', t: 'SCC', style: 'red', h: 0.28}]})});
def({id: 'ben', name: 'Ben', no: 'SCC 2', cat: 'Steam', wheels: '0-4-0ST', basis: 'the Bagnall saddle tank "Judy"',
  livery: 'dandelion yellow with red lining and brass nameplates; SCC on the bunker', dot: 0xe8b80a,
  about: "Bill's twin; the two love to tease and trick the other engines.",
  build: () => steam({L: 6.2, deck: 1.1, br: 0.5, by: 1.85, sbF: 2.7, sbLen: 0.75, bunker: 0.6, cabLen: 1.6, roofY: 3.3, color: 0xf2c80f, tank: 'saddle', saddleR: 0.85,
    chimney: {top: 3.3, r: 0.2}, dome: {r: 0.28, h: 0.2, color: 0xd4af37}, cyl: {z: 1.95, y: 0.7, r: 0.22, len: 0.7, bars: 0.8},
    wheels: [{z: 0.95, r: 0.5, c: 1}, {z: -0.85, r: 0.5, c: 1}], face: {smile: 0.95, brow: -0.4, look: -0.6},
    marks: [{at: 'tank', plate: 'BEN', w: 0.6, h: 0.22, bg: '#c9a23a', fg: '#2a2a2a'}, {at: 'bunker', t: 'SCC', style: 'red', h: 0.28}]})});
def({id: 'stepney', name: 'Stepney', no: '55', cat: 'Steam', wheels: '0-6-0T', basis: 'the LB&SCR A1X "Terrier" No. 55 Stepney, from the Bluebell Railway',
  livery: 'LB&SCR ochre ("Improved Engine Green") with green, red, white and black lining; his name on the tanks and 55 on the bunker', dot: 0xc9a227,
  about: 'the "Bluebell Engine", who came from the Bluebell Railway and runs a heritage service on Sodor.',
  build: () => steam({L: 7.6, deck: 1.15, br: 0.55, by: 2.1, sbF: 3.3, sbLen: 0.9, bunker: 0.8, cabLen: 1.6, roofY: 3.45, color: 0xc9a227, lining: 0x2f5a2a, foot: 0x8a6a1a,
    tank: 'side', tankTop: 2.35, chimney: {top: 3.55, r: 0.23, type: 'copper'}, dome: {r: 0.32, h: 0.25}, roundWindows: true,
    wheels: [{z: 1.65, r: 0.61, c: 1}, {z: -0.18, r: 0.61, c: 1}, {z: -2.0, r: 0.61, c: 1}], face: {smile: 0.95, brow: -0.3, wide: true},
    marks: [{at: 'tank', t: 'STEPNEY', style: 'goldW', h: 0.3}, {at: 'bunker', t: '55', style: 'gold', h: 0.3}]})});
def({id: 'harvey', name: 'Harvey', no: '27', cat: 'Steam', wheels: '0-4-0CT', basis: 'the Dübs crane tank No. 4101',
  livery: 'maroon with yellow and red lining on his tanks, cylinders, boiler and crane arm; 27 on the arm and wooden buffers', dot: 0x7a1f2b,
  about: 'the crane engine who loads and unloads heavy goods and helps clear up accidents.',
  build: () => steam({L: 7.4, deck: 1.15, br: 0.55, by: 2.05, sbF: 3.2, sbLen: 0.85, bunker: 0.7, cabLen: 1.7, roofY: 3.45, color: 0x7a1f2b, lining: 0xf2c419, woodBuffers: true,
    tank: 'side', tankTop: 2.35, chimney: {top: 3.55, r: 0.22}, dome: {r: 0.3, h: 0.22}, cyl: {z: 2.25, y: 0.75, r: 0.24, len: 0.8, bars: 1.0},
    wheels: [{z: 1.1, r: 0.58, c: 1}, {z: -1.1, r: 0.58, c: 1}], face: {smile: 0.6, brow: 0.1},
    extra: (b, k) => {
      cylY(b, 0.18, 0.24, 1.2, k.C, 0, k.roofY + 0.4, k.cabFront - 0.1, 14);
      const jib = new THREE.Group(); jib.position.set(0, k.roofY + 1.0, k.cabFront - 0.1); jib.rotation.x = -0.18; b.add(jib);
      box(jib, 0.32, 0.4, 5.8, k.C, 0, 0, 2.9); box(jib, 0.34, 0.04, 5.6, k.LIN, 0, 0.12, 2.9);
      cylY(jib, 0.025, 0.025, 1.6, mat(BLACK), 0, -0.8, 5.7, 4); box(jib, 0.3, 0.3, 0.3, mat(0x222222, 0.5, 0.5), 0, -1.6, 5.7);
      letter(jib, '27', 'yellow', 0.26, 0.16, 0, 2.0);
    }})});
def({id: 'fergus', name: 'Fergus', no: '', cat: 'Steam', wheels: '2-2-0WT (traction engine)', basis: 'an Aveling & Porter "Blue Circle" railway traction engine',
  livery: 'royal blue with brass boiler bands, red wheels, black lining and bronze buffers', dot: 0x1f4fbf,
  about: 'the railway traction engine and "pride of the Cement Works" on the Kirk Ronan branch.',
  build: () => traction({color: 0x1f4fbf, face: {smile: 0.7, brow: 0.2, sideburns: '#7a7a7a'}})});
def({id: 'arthur', name: 'Arthur', no: '41241', cat: 'Steam', wheels: '2-6-2T', basis: 'the LMS Ivatt Class 2MT tank',
  livery: 'LMS crimson lake with gold boiler bands and yellow lining; LMS on his tanks', dot: 0x8b1a26,
  about: 'the proud tank engine with a perfect safety record, who works the Norramby branch.',
  build: () => steam({L: 11.0, deck: 1.5, br: 0.7, by: 2.6, sbF: 4.9, sbLen: 1.1, bunker: 1.3, cabLen: 2.1, roofY: 3.85, color: 0x8b1a26, lining: 0xf2c419, bands: BRASS,
    tank: 'side', tankTop: 2.85, tankFront: 1.6, belpaire: 1.8, chimney: {top: 3.95, r: 0.28}, dome: {r: 0.4, h: 0.28}, cyl: {z: 3.55, y: 1.0, r: 0.3, bars: 1.3},
    wheels: [{z: 4.3, r: 0.48}, {z: 2.25, r: 0.76, c: 1}, {z: 0.05, r: 0.76, c: 1}, {z: -2.15, r: 0.76, c: 1}, {z: -4.3, r: 0.48}],
    face: {smile: 0.3, brow: 0.3}, marks: [{at: 'tank', t: 'LMS', style: 'nwr', h: 0.4}]})});
def({id: 'murdoch', name: 'Murdoch', no: '', cat: 'Steam', wheels: '2-10-0', basis: 'the BR Standard Class 9F',
  livery: 'tangerine with green and red lining, red bufferbeams, gold boiler bands and red nameplates on his smoke deflectors', dot: 0xf08a1c,
  about: 'the huge, strong engine who likes peace and quiet and pulls the longest goods trains.',
  build: () => steam({L: 14.5, deck: 1.95, br: 0.88, by: 2.85, sbF: 6.6, sbLen: 1.5, cabLen: 2.4, roofY: 3.95, color: 0xf08a1c, lining: 0x2f6b2f, bands: BRASS, tender: true,
    chimney: {top: 3.98, r: 0.3}, dome: {r: 0.42, h: 0.2}, cyl: {z: 5.0, y: 1.05, r: 0.34, len: 1.0, bars: 1.6}, deflectors: {len: 2.2},
    wheels: [{z: 6.1, r: 0.48}, {z: 3.7, r: 0.76, c: 1}, {z: 1.85, r: 0.76, c: 1}, {z: 0.0, r: 0.76, c: 1}, {z: -1.85, r: 0.76, c: 1}, {z: -3.7, r: 0.76, c: 1}],
    face: {smile: 0.4, brow: -0.1, thick: true}, marks: [{at: 'deflector', plate: 'MURDOCH', bg: '#c8262b', fg: '#e7c35a', w: 1.3, h: 0.26}]}),
  tender: () => tender({L: 7.4, top: 3.3, color: 0xf08a1c, lining: 0x2f6b2f, wheel: BLACK})});
def({id: 'molly', name: 'Molly', no: '', cat: 'Steam', wheels: '4-4-0', basis: 'the GER D56 / LNER D15 "Claud Hamilton"',
  livery: 'bright yellow with red and gold boiler bands, bronze borders round her splashers and red lining', dot: 0xf5d31a,
  about: 'the quiet yellow engine who works goods trains on the Main Line.',
  build: () => steam({L: 9.0, deck: 1.3, br: 0.72, by: 2.55, sbF: 4.0, sbLen: 1.05, cabLen: 2.0, roofY: 3.85, color: 0xf5d31a, lining: 0xc8262b, bands: 0xd4af37, tender: true,
    belpaire: 1.8, splashTrim: 0xa8703c, chimney: {top: 3.95, r: 0.27, cap: 0xd4af37}, dome: {r: 0.4, h: 0.3, color: 0xd4af37},
    wheels: [{z: 3.25, r: 0.53}, {z: 1.5, r: 0.53}, {z: -0.6, r: 1.0, c: 1}, {z: -3.2, r: 1.0, c: 1}], face: {smile: 0.5, brow: -0.2, lashes: true}}),
  tender: () => tender({L: 6.4, top: 3.0, color: 0xf5d31a, lining: 0xc8262b})});
def({id: 'neville', name: 'Neville', no: '33010', cat: 'Steam', wheels: '0-6-0', basis: 'the SR Q1 class No. C10/33010',
  livery: 'unlined BR black with red bufferbeams; 33010 in white on his cab', dot: 0x3a3c40,
  about: 'the square-boilered goods engine the others first mistook for a diesel.',
  build: () => steam({L: 9.3, deck: 1.35, br: 0.78, by: 2.6, sbF: 4.1, sbLen: 1.3, cabLen: 2.2, roofY: 3.9, color: 0x1c1d20, lining: 0x1c1d20, tender: true, boilerBox: true, splash: false,
    dome: false, chimney: {top: 3.95, r: 0.34, type: 'wide'}, wheels: [{z: 1.6, r: 0.77, c: 1}, {z: -0.7, r: 0.77, c: 1}, {z: -3.2, r: 0.77, c: 1}],
    face: {smile: 0.5, brow: -0.1}, marks: [{at: 'cab', t: '33010', style: 'white', h: 0.2}]}),
  tender: () => tender({L: 6.3, top: 3.05, color: 0x1c1d20, lining: null})});
def({id: 'rosie', name: 'Rosie', no: '37', cat: 'Steam', wheels: '0-6-0T', basis: 'the Southern Railway USA class',
  livery: 'red with white lining and gold boiler bands (she was lavender when she first came)', dot: 0xd8315b,
  about: 'the bright tank engine who shunts at Vicarstown and adores Thomas.',
  build: () => steam({L: 9.0, deck: 1.3, br: 0.72, by: 2.55, sbF: 4.0, sbLen: 1.1, bunker: 1.0, cabLen: 2.2, roofY: 3.85, color: 0xc8202a, lining: 0xffffff, bands: 0xd4af37,
    tank: 'side', tankTop: 2.75, tankFront: 1.2, chimney: {top: 3.95, r: 0.26, type: 'stovepipe'}, dome: {r: 0.36, h: 0.3}, cyl: {z: 2.7, y: 0.95, r: 0.3, bars: 1.0},
    wheels: [{z: 1.5, r: 0.69, c: 1}, {z: 0, r: 0.69, c: 1}, {z: -1.5, r: 0.69, c: 1}], rim: 0xffffff, face: {smile: 0.9, lashes: true, lips: '#e0607e', blush: true},
    marks: [{at: 'bunker', t: '37', style: 'white', h: 0.32}]})});
def({id: 'whiff', name: 'Whiff', no: '66', cat: 'Steam', wheels: '2-2-4T', basis: 'the NER No. 66 Aerolite',
  livery: 'weathered dark green with black and yellow lining, red bufferbeams and red number plates on his bunker; he wears glasses', dot: 0x2d5a33,
  about: 'the cheerful engine who collects the rubbish and runs the waste dump.',
  build: () => steam({L: 9.6, deck: 1.3, br: 0.62, by: 2.45, sbF: 4.3, sbLen: 1.0, bunker: 1.2, cabLen: 2.0, roofY: 3.85, color: 0x2d5a33, lining: 0xf2c419, foot: 0xb9bcbf,
    tank: 'side', tankTop: 2.6, tankFront: 0.2, chimney: {top: 3.95, r: 0.25}, dome: {r: 0.36, h: 0.3, color: 0xd4af37},
    wheels: [{z: 3.55, r: 0.55}, {z: 1.0, r: 0.915, c: 1}, {z: -2.6, r: 0.5}, {z: -4.1, r: 0.5}], face: {smile: 0.8, glasses: true, grime: true},
    marks: [{at: 'bunker', plate: '66', bg: '#b3201c', fg: '#e7c35a', w: 0.42, h: 0.3}]})});
function mwL(o){
  return steam(Object.assign({L: 7.2, deck: 1.15, br: 0.55, by: 2.0, sbF: 3.1, sbLen: 0.85, bunker: 0.7, cabLen: 1.7, roofY: 3.45, tank: 'saddle', saddleR: 0.9,
    chimney: {top: 3.6, r: 0.23}, dome: {r: 0.3, h: 0.22, color: 0xd4af37}, cyl: {z: 2.35, y: 0.75, r: 0.25, len: 0.8, bars: 1.0},
    wheels: [{z: 1.4, r: 0.55, c: 1}, {z: -0.25, r: 0.55, c: 1}, {z: -1.9, r: 0.55, c: 1}]}, o));
}
def({id: 'billy', name: 'Billy', no: '', cat: 'Steam', wheels: '0-6-0ST', basis: 'the Manning Wardle L class',
  livery: 'neon orange with green and yellow lining, black nameplates and red bufferbeams', dot: 0xff7a12,
  about: 'the cheeky, forgetful saddle tank who loves to play.',
  build: () => mwL({color: 0xff7a12, lining: 0x2fa04a, foot: 0xb9bcbf, face: {smile: 1.0, brow: -0.4, look: 0.6, wide: true},
    marks: [{at: 'tank', plate: 'BILLY', bg: '#151515', fg: '#e7c35a', w: 0.8, h: 0.22}]})});
def({id: 'charlie', name: 'Charlie', no: '14', cat: 'Steam', wheels: '0-6-0ST', basis: 'the Manning Wardle L class',
  livery: 'violet with white lining, brass fittings, red bufferbeams and red wheels with white rims; 14 in gold on his cab', dot: 0x7a3fa0,
  about: 'the fun-loving engine who is always telling jokes.',
  build: () => mwL({color: 0x7a3fa0, lining: 0xffffff, wheel: 0xc8202a, rim: 0xffffff, face: {smile: 1.0, brow: -0.2, look: -0.4},
    marks: [{at: 'cab', t: '14', style: 'goldW', h: 0.36}]})});
def({id: 'stanley', name: 'Stanley', no: '', cat: 'Steam', wheels: '0-6-0ST', basis: 'a Stewart & Lloyds 16-inch saddle tank',
  livery: 'silver-white with a metallic silver smokebox, red wheels and lining, a red running plate and red nameplates', dot: 0xdfe3e6,
  about: 'the silver engine from Great Waterton who is strong and eager to help.',
  build: () => steam({L: 8.4, deck: 1.25, br: 0.62, by: 2.25, sbF: 3.7, sbLen: 0.95, bunker: 0.9, cabLen: 2.0, roofY: 3.7, color: 0xdfe3e6, lining: 0xc8202a, smokebox: 0xa9adb2, foot: 0xc8202a,
    wheel: 0xc8202a, tank: 'saddle', saddleR: 1.0, chimney: {top: 3.85, r: 0.25}, dome: {r: 0.33, h: 0.26, color: 0xc8ccd0}, fit: 'silver', cyl: {z: 2.75, y: 0.85, r: 0.27, len: 0.85, bars: 1.1},
    wheels: [{z: 1.6, r: 0.62, c: 1}, {z: -0.1, r: 0.62, c: 1}, {z: -1.8, r: 0.62, c: 1}], face: {smile: 0.8, brow: -0.2},
    marks: [{at: 'tank', plate: 'STANLEY', bg: '#c8202a', fg: '#e8eef2', border: '#a9adb2', w: 1.0, h: 0.22}]})});
def({id: 'hank', name: 'Hank', no: '', cat: 'Steam', wheels: '4-6-2', basis: 'the Pennsylvania Railroad K4',
  livery: 'ultramarine blue with red wheels, red lining and a red cowcatcher; dark grey smokebox and cab roof', dot: 0x1f3fa8,
  about: 'the big American engine who came to Sodor and speaks in a booming voice.',
  build: () => steam({L: 14.0, deck: 1.85, br: 0.9, by: 2.95, sbF: 6.2, sbLen: 1.6, cabLen: 2.5, roofY: 4.0, color: 0x1f3fa8, lining: 0xc8202a, smokebox: 0x3a3c40, roof: 0x3a3c40, tender: true,
    belpaire: 3.0, wheel: 0xc8202a, chimney: {top: 4.05, r: 0.3, type: 'lipped'}, dome: {r: 0.42, h: 0.22, z: 1.6}, cowcatcher: 0xc8202a, headlight: {}, bell: {},
    cyl: {z: 4.7, y: 1.05, r: 0.36, len: 1.0, bars: 1.8},
    wheels: [{z: 5.6, r: 0.5}, {z: 3.7, r: 0.5}, {z: 1.35, r: 1.02, c: 1}, {z: -0.85, r: 1.02, c: 1}, {z: -3.05, r: 1.02, c: 1}, {z: -5.2, r: 0.6}],
    face: {smile: 0.9, brow: 0.2, thick: true}}),
  tender: () => tender({L: 9.5, top: 3.4, color: 0x1f3fa8, lining: 0xc8202a, bogies: true, wheel: 0xc8202a})});
def({id: 'flora', name: 'Flora', no: '', cat: 'Steam', wheels: '0-6-0T (steam tram)', basis: 'a steam tram engine (based on a GER tram engine like Toby)',
  livery: 'bright yellow with green and white lining, red cowcatchers and side plates, and "SODOR TRAMWAYS" boards on her roof', dot: 0xf2d21a,
  about: 'the little steam tram who works for Sodor Tramways.',
  build: () => tram({L: 7.2, color: 0xf2d21a, plates: 0xc8202a, lining: 0x2f7a3a, catcher: 0xc8202a, roof: 0x5a5d60, roofBoards: 0x2f7a3a,
    face: {smile: 0.85, lashes: true}, marks: [{at: 'side', plate: 'FLORA', bg: '#c8202a', fg: '#e7c35a', w: 0.8, h: 0.22}]})});
def({id: 'bash', name: 'Bash', no: '', cat: 'Steam', wheels: '0-4-0WT', basis: 'Bear Harbor Lumber Company No. 1',
  livery: 'slate grey boiler, wheels and lining with an amber cab and dome', dot: 0xd89a2a,
  about: 'one of the wacky logging twins from Misty Island, who finish each other\'s sentences.',
  build: () => steam({L: 6.6, deck: 1.1, br: 0.52, by: 1.95, sbF: 2.85, sbLen: 0.8, bunker: 0.5, cabLen: 1.9, roofY: 3.55, color: 0xd89a2a, boilerColor: 0x6b737a, lining: 0x6b737a,
    wheel: 0x6b737a, chimney: {top: 3.7, r: 0.2, type: 'balloon'}, dome: {r: 0.3, h: 0.3, color: 0xd89a2a}, headlight: {}, fit: 'black',
    cyl: {z: 1.9, y: 0.72, r: 0.24, len: 0.75, bars: 0.8}, wheels: [{z: 0.95, r: 0.5, c: 1}, {z: -0.95, r: 0.5, c: 1}], face: {smile: 1.0, brow: -0.5, look: 0.7, wide: true}})});
def({id: 'dash', name: 'Dash', no: '', cat: 'Steam', wheels: '0-4-0WT', basis: 'Bear Harbor Lumber Company No. 1',
  livery: 'amber boiler, wheels and lining with a slate grey cab and dome', dot: 0x6b737a,
  about: "Bash's twin from Misty Island.",
  build: () => steam({L: 6.6, deck: 1.1, br: 0.52, by: 1.95, sbF: 2.85, sbLen: 0.8, bunker: 0.5, cabLen: 1.9, roofY: 3.55, color: 0x6b737a, boilerColor: 0xd89a2a, lining: 0xd89a2a,
    wheel: 0xd89a2a, chimney: {top: 3.7, r: 0.2, type: 'balloon'}, dome: {r: 0.3, h: 0.3, color: 0x6b737a}, headlight: {}, fit: 'black',
    cyl: {z: 1.9, y: 0.72, r: 0.24, len: 0.75, bars: 0.8}, wheels: [{z: 0.95, r: 0.5, c: 1}, {z: -0.95, r: 0.5, c: 1}], face: {smile: 1.0, brow: -0.5, look: -0.7, wide: true}})});
def({id: 'ferdinand', name: 'Ferdinand', no: '', cat: 'Steam', wheels: 'B-B-B (geared)', basis: 'the Climax Class C geared logging engine',
  livery: 'teal with blue-grey lining and a logging emblem of trees and crossed axes on his cab and tender', dot: 0x1f7a7a,
  about: 'the humble, slow-speaking logging engine from Misty Island.',
  build: () => steam({L: 8.2, deck: 1.15, br: 0.6, by: 2.15, sbF: 3.5, sbLen: 0.95, cabLen: 2.1, roofY: 3.7, color: 0x1f7a7a, lining: 0x7a8a9a, tender: true, splash: false,
    chimney: {top: 3.85, r: 0.22, type: 'balloon'}, dome: {r: 0.34, h: 0.3}, headlight: {}, fit: 'black',
    wheels: [{z: 2.6, r: 0.42}, {z: 1.4, r: 0.42}, {z: -1.6, r: 0.42}, {z: -2.8, r: 0.42}], face: {smile: 0.5, brow: 0.2},
    extra: (b, k) => {
      for(const s of [-1, 1]){ const c = cylY(b, 0.2, 0.2, 1.1, k.C, s * 1.1, k.deck + 0.7, k.cabFront + 0.6, 12); c.rotation.x = 0.5; cylZ(b, 0.07, 0.07, k.F * 2 - 0.6, mat(0x9a9da1, 0.3, 0.7), s * 1.15, 0.6, 0, 8); }
      for(const e of [1, -1]){ for(const s of [-1, 1]) box(b, 0.1, 0.4, 2.0, k.BLK, s * 0.95, 0.55, e * 2.1); }
    }}),
  tender: () => tender({L: 6.0, top: 2.7, color: 0x1f7a7a, lining: 0x7a8a9a, bogies: true, r: 0.42})});
def({id: 'scruff', name: 'Scruff', no: '', cat: 'Steam', wheels: '0-4-0VBT', basis: 'a streamlined Sentinel 100 HP shunter',
  livery: 'neon green with sea-green stripes, funnel and front, never washed; worn brass nameplates', dot: 0x6be04a,
  about: 'the grubby little engine who works at the Waste Dump with Whiff and hates being cleaned.',
  build: () => sentinel({color: 0x6be04a, stripe: 0x2a8a6a, face: {smile: 0.8, brow: -0.2, grime: true, look: 0.4}})});
def({id: 'belle', name: 'Belle', no: '6120', cat: 'Steam', wheels: '2-6-4T', basis: 'the BR Standard Class 4MT tank',
  livery: 'royal blue with red and gold lining, brass fittings, 6120 in gold on her tanks and water cannons on top', dot: 0x2f6fe0,
  about: 'the big, bold engine with water cannons who helps fight fires.',
  build: () => steam({L: 13.2, deck: 1.7, br: 0.78, by: 2.8, sbF: 6.0, sbLen: 1.3, bunker: 1.7, cabLen: 2.3, roofY: 3.95, color: 0x1f4fbf, lining: 0xc8202a, bands: 0xd4af37,
    tank: 'side', tankTop: 3.05, tankFront: 2.8, chimney: {top: 3.98, r: 0.28}, dome: {r: 0.4, h: 0.22}, cyl: {z: 4.55, y: 1.05, r: 0.32, bars: 1.4},
    wheels: [{z: 5.3, r: 0.48}, {z: 3.1, r: 0.87, c: 1}, {z: 1.0, r: 0.87, c: 1}, {z: -1.15, r: 0.87, c: 1}, {z: -3.7, r: 0.48}, {z: -5.4, r: 0.48}],
    face: {smile: 0.8, lashes: true, lips: '#c8405a'}, marks: [{at: 'tank', t: '6120', style: 'gold', h: 0.32}],
    extra: (b, k) => { for(const s of [-1, 1]){ cylY(b, 0.16, 0.2, 0.25, brassMat(), s * 0.98, 3.15, 2.3, 12); const c = cylZ(b, 0.07, 0.11, 1.0, brassMat(), s * 0.98, 3.35, 2.75, 10); c.rotation.x = -0.25; } }})});
def({id: 'porter', name: 'Porter', no: '', cat: 'Steam', wheels: '0-6-0ST', basis: 'an H.K. Porter saddle tank',
  livery: 'viridian with yellow stripes and lining, brass fittings, red bufferbeams, red window frames and gold nameplates', dot: 0x1f8a6a,
  about: 'the American engine who came to work at Brendam Docks.',
  build: () => steam({L: 7.6, deck: 1.2, br: 0.58, by: 2.1, sbF: 3.3, sbLen: 0.9, bunker: 0.8, cabLen: 2.0, roofY: 3.6, color: 0x1f8a6a, lining: 0xf2c419, winFrame: 0xc8202a,
    tank: 'saddle', saddleR: 0.95, chimney: {top: 3.85, r: 0.2, type: 'stovepipe'}, dome: {r: 0.32, h: 0.28, color: 0xd4af37}, headlight: {}, bell: {},
    cyl: {z: 2.5, y: 0.8, r: 0.26, len: 0.8, bars: 1.0}, wheels: [{z: 1.4, r: 0.56, c: 1}, {z: 0, r: 0.56, c: 1}, {z: -1.4, r: 0.56, c: 1}], face: {smile: 0.9, brow: -0.1},
    marks: [{at: 'tank', plate: 'PORTER', bg: '#d4af37', fg: '#151515', w: 0.9, h: 0.22}]})});
def({id: 'timothy', name: 'Timothy', no: '', cat: 'Steam', wheels: '0-4-0ST', basis: 'a Bell open-cab oil burner',
  livery: 'dark blue with red lining and bufferbeams, brass fittings and SCC in yellow on his tank', dot: 0x1f2f6b,
  about: 'the oil-burning engine of the Sodor China Clay Company.',
  build: () => steam({L: 6.2, deck: 1.1, br: 0.5, by: 1.9, sbF: 2.7, sbLen: 0.75, bunker: 0.7, cabLen: 1.6, roofY: 3.4, color: 0x1f2f6b, lining: 0xc8202a, cab: 'open', oil: true,
    tank: 'saddle', saddleR: 0.85, chimney: {top: 3.4, r: 0.18, type: 'stovepipe'}, dome: {r: 0.28, h: 0.22, color: 0xd4af37},
    cyl: {z: 1.9, y: 0.7, r: 0.22, len: 0.7, bars: 0.8}, wheels: [{z: 0.9, r: 0.5, c: 1}, {z: -0.9, r: 0.5, c: 1}], face: {smile: 0.6, brow: 0.2},
    marks: [{at: 'tank', t: 'SCC', style: 'yellow', h: 0.3}]})});
def({id: 'ryan', name: 'Ryan', no: 'GNR 1014', cat: 'Steam', wheels: '0-6-2T', basis: 'the GNR Class N2/1',
  livery: 'purple with white and beige lining; GNR on his tanks and 1014 on his bunker in gold', dot: 0x5a2a7a,
  about: 'the engine who works the Harwick branch and helped build it.',
  build: () => steam({L: 11.0, deck: 1.3, br: 0.72, by: 2.55, sbF: 4.95, sbLen: 1.1, bunker: 1.4, cabLen: 2.1, roofY: 3.85, color: 0x5a2a7a, lining: 0xe8dcc0,
    tank: 'side', tankTop: 2.75, chimney: {top: 3.9, r: 0.27}, dome: {r: 0.38, h: 0.24},
    wheels: [{z: 2.75, r: 0.86, c: 1}, {z: 0.3, r: 0.86, c: 1}, {z: -2.2, r: 0.86, c: 1}, {z: -4.3, r: 0.55}], face: {smile: 0.6, brow: 0.1},
    marks: [{at: 'tank', t: 'GNR', style: 'gold', h: 0.36}, {at: 'bunker', t: '1014', style: 'gold', h: 0.26}]})});
const KENYA = canvasTex(512, 64, (g, w, h) => { const c = ['#c8202a', '#f2c419', '#2f8a3a', '#151515', '#7a3fa0']; for(let i = 0; i < 32; i++){ g.fillStyle = c[i % 5]; g.beginPath(); g.moveTo(i * 16, h); g.lineTo(i * 16 + 8, 0); g.lineTo(i * 16 + 16, h); g.fill(); } });
def({id: 'nia', name: 'Nia', no: 'EAR 18', cat: 'Steam', wheels: '2-6-2T', basis: 'the KUR ED1 / EAR 11 class',
  livery: 'orange with yellow lining and a Kenyan pattern of red, yellow, green, black and purple along her tanks', dot: 0xe8771e,
  about: 'the Kenyan engine who travelled with Thomas and came to live on Sodor.',
  build: () => steam({L: 11.0, deck: 1.4, br: 0.7, by: 2.5, sbF: 4.9, sbLen: 1.1, bunker: 1.3, cabLen: 2.2, roofY: 3.85, color: 0xe8771e, lining: 0xf2c419,
    tank: 'side', tankTop: 2.85, tankFront: 3.2, chimney: {top: 3.9, r: 0.26}, dome: {r: 0.38, h: 0.26}, cyl: {z: 3.6, y: 0.95, r: 0.28, bars: 1.2},
    wheels: [{z: 4.2, r: 0.45}, {z: 2.2, r: 0.7, c: 1}, {z: 0.6, r: 0.7, c: 1}, {z: -1.0, r: 0.7, c: 1}, {z: -3.9, r: 0.45}], face: {smile: 0.95, lashes: true, look: 0.3},
    extra: (b, k) => { const sp = k.spots.tank; sidePlatesTex(b, KENYA, sp.len - 0.3, 0.32, sp.sx + 0.012, sp.y + 0.3, sp.z); },
    marks: [{at: 'tank', t: 'NIA', style: 'black', h: 0.3, dy: -0.15}]})});
def({id: 'rebecca', name: 'Rebecca', no: '22', cat: 'Steam', wheels: '4-6-2', basis: 'the SR West Country / Battle of Britain class (rebuilt)',
  livery: 'sunshine yellow and bluish black with white lining, white wheel rims, a red front end and blue nameplates', dot: 0xf5c518,
  about: 'the big, kind engine who shares the Express with Gordon.',
  build: () => steam({L: 13.0, deck: 1.8, br: 0.85, by: 2.85, sbF: 5.85, sbLen: 1.5, cabLen: 2.3, roofY: 3.95, color: 0xf5c518, boilerColor: 0x1f2a3a, lining: 0xffffff, smokebox: 0x1f2a3a, doorRing: 0xc8202a, tender: true,
    wheel: 0x1f2a3a, rim: 0xffffff, chimney: {top: 3.98, r: 0.32, type: 'wide'}, dome: false, deflectors: {len: 2.3, color: 0xf5c518}, cyl: {z: 3.95, y: 1.0, r: 0.33, bars: 1.6},
    wheels: [{z: 5.0, r: 0.5}, {z: 3.15, r: 0.5}, {z: 1.0, r: 0.94, c: 1}, {z: -1.15, r: 0.94, c: 1}, {z: -3.3, r: 0.94, c: 1}, {z: -5.2, r: 0.55}],
    face: {smile: 0.85, lashes: true, lips: '#d0506a'}, marks: [{at: 'deflector', plate: 'REBECCA', bg: '#1f3f8a', fg: '#f6c624', w: 1.3, h: 0.26}]}),
  tender: () => tender({L: 7.4, top: 3.3, color: 0xf5c518, lining: 0xffffff, wheel: 0x1f2a3a, rim: 0xffffff, marks: [{at: 'tender', t: '22', style: 'nwr', h: 0.6}]})});
def({id: 'sonny', name: 'Sonny', no: '1842', cat: 'Steam', wheels: '0-6-0WT', basis: 'the Haydock Foundry well tanks (like Bellerophon)',
  livery: 'dark navy blue with gold lining and white boiler bands; black dome, wheels and running board', dot: 0x1b2a55,
  about: 'the well tank who once worked for two crooks and now works for the North Western Railway.',
  build: () => steam({L: 7.6, deck: 1.2, br: 0.6, by: 2.15, sbF: 3.3, sbLen: 0.9, bunker: 0.8, cabLen: 1.9, roofY: 3.6, color: 0x1b2a55, lining: 0xd4af37, bands: 0xffffff,
    wheel: BLACK, chimney: {top: 3.9, r: 0.24}, dome: {r: 0.34, h: 0.3, color: BLACK}, fit: 'black',
    wheels: [{z: 1.6, r: 0.66, c: 1}, {z: -0.05, r: 0.66, c: 1}, {z: -1.7, r: 0.66, c: 1}], face: {smile: 0.5, brow: 0.3, look: -0.3},
    marks: [{at: 'cab', t: '1842', style: 'gold', h: 0.24}]})});
def({id: 'marion', name: 'Marion', no: '', cat: 'Steam', wheels: 'Bo-Bo (steam shovel)', basis: 'the Marion Model 40 steam shovel',
  livery: 'orange and light brown with yellow lining, weathered; her name in yellow with red lining', dot: 0xe8772a,
  about: 'the chatty steam shovel who digs for the China Clay and Construction companies.',
  build: () => shovel({color: 0xe8772a, base: 0xb08a5a, face: {smile: 0.95, lashes: true, wide: true, look: 0.4}})});

// Diesel engines
function class08(o){
  return shunter(Object.assign({L: 8.9, deck: 1.2, wheels: [{z: 1.85, r: 0.685, c: 1}, {z: 0.15, r: 0.685, c: 1}, {z: -1.75, r: 0.685, c: 1}],
    bon: {z0: -1.6, z1: 4.25, w: 2.05, top: 2.95}, cab: {z0: -3.85, z1: -1.6, roof: 3.85}, rear: {z0: -4.35, z1: -3.85, top: 2.3}, rearTop: 2.3}, o));
}
def({id: 'diesel', name: 'Diesel', no: '', cat: 'Diesel', wheels: '0-6-0DE', basis: 'the BR Class 08 shunter',
  livery: 'BR black all over except his red bufferbeams', dot: 0x2a2b2e,
  about: 'the devious diesel who spreads stories and loves causing trouble in the yards.',
  build: () => class08({color: 0x1a1b1d, face: {smile: 0.3, brow: 0.9, look: 0.6}})});
def({id: 'daisy', name: 'Daisy', no: '', cat: 'Diesel', wheels: 'Bo-Bo railcar', basis: 'the BR Metro-Cammell (Class 101) diesel multiple unit',
  livery: 'green with yellow whiskers and red bufferbeams with white buffers', dot: 0x2f8a3a,
  about: 'the diesel railcar who carries passengers and is rather particular about it.',
  build: () => bogieDiesel({L: 18.5, color: 0x2a7a3a, roof: 0x6a6d70, top: 3.75, deck: 1.25, frontWin: 3, saloon: 9, whiskers: 0xf2c400,
    bogies: [{z: 6.5, n: 2, r: 0.46, wb: 2.6}, {z: -6.5, n: 2, r: 0.46, wb: 2.6}], face: {smile: 0.5, lashes: true, lips: '#d0506a', shadow: '#7a5aa0'}})});
def({id: 'boco', name: 'BoCo', no: 'D5702', cat: 'Diesel', wheels: 'Co-Bo', basis: 'the BR Class 28 Metrovick',
  livery: 'green with red bufferbeams and a light grey roof; D5702 in white on his cab sides', dot: 0x2f7a46,
  about: "the wise, kindly diesel who helps Edward and Bill and Ben on Edward's branch.",
  build: () => bogieDiesel({L: 17.2, color: 0x2f7a46, roof: 0xb9bcbf, frontWin: 2, grilles: 4, bogies: [{z: 5.6, n: 3, r: 0.5, wb: 1.9}, {z: -5.6, n: 2, r: 0.5, wb: 2.4}],
    face: {smile: 0.6, brow: -0.2}, marks: [{at: 'cab', t: 'D5702', style: 'white', h: 0.22}]})});
def({id: 'mavis', name: 'Mavis', no: '', cat: 'Diesel', wheels: '0-6-0DM', basis: 'the BR Class 04 shunter, with side plates for the quarry tramway',
  livery: 'black with yellow hazard stripes front and rear and red bufferbeams; THE FFARQUHAR QUARRY CO. LTD. on her side plates', dot: 0x2a2a2a,
  about: 'the quarry diesel who works at Ffarquhar and is learning to listen to Toby.',
  build: () => shunter({L: 8.0, deck: 1.15, color: 0x1a1b1d, stripes: true, noseStripes: true, rearStripes: true, skirts: 0x1a1b1d, jack: -2.4,
    wheels: [{z: 1.6, r: 0.6, c: 1}, {z: 0.1, r: 0.6, c: 1}, {z: -1.4, r: 0.6, c: 1}],
    bon: {z0: -1.3, z1: 3.75, w: 1.9, top: 2.75}, cab: {z0: -3.5, z1: -1.3, roof: 3.65}, face: {smile: 0.6, lashes: true, look: 0.2},
    marks: [{at: 'skirt', t: 'THE FFARQUHAR QUARRY CO. LTD.', style: 'white', h: 0.2}, {at: 'cab', t: 'MAVIS', style: 'white', h: 0.26}]})});
def({id: 'derek', name: 'Derek', no: '', cat: 'Diesel', wheels: 'Bo-Bo', basis: 'the BR Class 17 "Clayton"',
  livery: 'BR deep bronze green with yellow warning panels at each end, white window frames and the BR crest', dot: 0x3f5a3a,
  about: 'the centre-cab diesel with "teething troubles" who helps the China Clay Company.',
  build: () => bogieDiesel({L: 15.2, color: 0x3f5a3a, roof: 0x6a6d70, type: 'centre', bonTop: 2.85, cabLen: 3.3, winFrame: 0xeeeeee, panel: 0xf2c400,
    bogies: [{z: 4.9, n: 2, r: 0.5, wb: 2.4}, {z: -4.9, n: 2, r: 0.5, wb: 2.4}], face: {smile: 0.2, brow: 0.4}})});
def({id: 'arry', name: "'Arry", no: '', cat: 'Diesel', wheels: '0-6-0DE', basis: 'the BR Class 08 shunter',
  livery: 'an olive green bonnet with a rusty yellow cab and utility boxes, yellow hazard stripes on the bonnet front', dot: 0x5a6b2a,
  about: "one of the Ironworks diesel twins who bully steam engines with Bert.",
  build: () => class08({color: 0x5a6b2a, cabColor: 0xc89a2a, noseStripes: true, face: {smile: 0.4, brow: 0.9, look: 0.5, grime: true}})});
def({id: 'bert', name: 'Bert', no: '', cat: 'Diesel', wheels: '0-6-0DE', basis: 'the BR Class 08 shunter',
  livery: "an olive green bonnet with a rusty yellow cab, like his twin 'Arry", dot: 0x6b7a35,
  about: "'Arry's twin from the Sodor Ironworks.",
  build: () => class08({color: 0x5a6b2a, cabColor: 0xc89a2a, noseStripes: true, face: {smile: 0.3, brow: 0.8, look: -0.5, grime: true}})});
def({id: 'diesel10', name: 'Diesel 10', no: 'D10', cat: 'Diesel', wheels: 'B-B', basis: 'the BR Class 42 "Warship"',
  livery: 'yellow ochre with tan stripes along his sides and red bufferbeams; his claw, Pinchy, is dark brown', dot: 0xc8a032,
  about: 'the most feared diesel on Sodor, with his hydraulic claw Pinchy.',
  build: () => bogieDiesel({L: 18.3, color: 0xc8a032, roof: 0x6a5a3a, type: 'nose', ends: 1.7, grilles: 3, stripe: {color: 0x9a7a4a, ys: [1.7, 2.1], h: 0.12},
    bogies: [{z: 5.8, n: 2, r: 0.5, wb: 2.6}, {z: -5.8, n: 2, r: 0.5, wb: 2.6}], face: {smile: -0.3, brow: 1.0, thick: true},
    extra: (b, k) => {
      const BR = mat(0x4a2f1f, 0.6), base = 1.5;
      cylY(b, 0.55, 0.65, 0.4, BR, 0, k.top + 0.35, base, 16);
      const a1 = box(b, 0.36, 0.36, 3.4, BR, 0, k.top + 1.3, base - 1.1); a1.rotation.x = 0.55;
      const a2 = box(b, 0.3, 0.3, 3.0, BR, 0, k.top + 1.75, base + 0.9); a2.rotation.x = -0.25;
      for(const s of [-1, 1]){ const c = box(b, 0.12, 0.14, 1.0, BR, s * 0.25, k.top + 1.4, base + 2.6); c.rotation.x = 0.7; c.rotation.y = s * 0.25; }
      letter(b, 'D10', 'white', 0.3, k.W / 2, k.deck + 0.9, k.F - 1.4);
    }})});
def({id: 'salty', name: 'Salty', no: '2991', cat: 'Diesel', wheels: '0-6-0DE', basis: 'the BR Class 07 dockyard shunter',
  livery: 'crimson with scarlet warning stripes, yellow and black hazard stripes front and rear and yellow bufferbeams; he wears a skipper\'s cap', dot: 0x8a1a2a,
  about: 'the dockyard diesel who loves the sea and telling tall tales.',
  build: () => shunter({L: 8.9, deck: 1.2, color: 0x8a1a2a, beamF: 0xf2c400, beamR: 0xf2c400, noseStripes: true, rearStripes: true, lining: 0xe0302a,
    wheels: [{z: 1.75, r: 0.62, c: 1}, {z: 0.15, r: 0.62, c: 1}, {z: -1.45, r: 0.62, c: 1}],
    bon: {z0: 0.0, z1: 4.25, w: 2.05, top: 2.9}, cab: {z0: -2.3, z1: 0.0, roof: 3.85}, rear: {z0: -4.3, z1: -2.3, top: 2.6}, rearTop: 2.6,
    face: {smile: 0.8, brow: -0.1, hat: '#1f2a44'}})});
function c11001(o){
  return shunter(Object.assign({L: 9.4, deck: 1.25, jack: -2.9, wheels: [{z: 1.9, r: 0.66, c: 1}, {z: 0.2, r: 0.66, c: 1}, {z: -1.5, r: 0.66, c: 1}],
    bon: {z0: -1.4, z1: 4.5, w: 2.1, top: 3.0}, cab: {z0: -4.1, z1: -1.4, roof: 3.85}}, o));
}
def({id: 'dennis', name: 'Dennis', no: '11001', cat: 'Diesel', wheels: '0-6-0DM', basis: 'the BR prototype shunter No. 11001',
  livery: 'two-tone grey with a dark grey roof and front, red jackshaft and bufferbeams; 11001 in white', dot: 0x8a8d91,
  about: 'the lazy diesel who tries to get others to do his work.',
  build: () => c11001({color: 0x9a9da1, bonColor: 0x8a8d91, cabColor: 0xb4b7ba, roof: 0x4a4c50, rods: 0x5a5d60, jackColor: 0xc8202a, face: {smile: 0.2, brow: 0.3, look: -0.5},
    marks: [{at: 'cab', t: '11001', style: 'white', h: 0.24}]})});
def({id: 'norman', name: 'Norman', no: '', cat: 'Diesel', wheels: '0-6-0DM', basis: 'the BR prototype shunter No. 11001, like Dennis',
  livery: 'cinnabar with two yellow stripes, red wheels with white rims, and a dark grey front, roof and toolboxes', dot: 0xd0442a,
  about: 'the Dieselworks shunter with wonky wheels and a mischievous streak.',
  build: () => c11001({color: 0xd0442a, roof: 0x3a3c40, wheel: 0xc8202a, rim: 0xffffff, lining: 0xf2c400, face: {smile: 0.6, brow: 0.4, look: 0.4}})});
def({id: 'sidney', name: 'Sidney', no: '', cat: 'Diesel', wheels: '0-6-0DE', basis: 'the BR Class 08 shunter',
  livery: 'navy blue with yellow lining, hazard stripes under his face, red coupling rods and a red front bufferbeam', dot: 0x1a2a5a,
  about: 'the forgetful Dieselworks shunter.',
  build: () => class08({color: 0x1a2a5a, lining: 0xf2c400, noseStripes: true, rods: 0xc8202a, beamF: 0xc8202a, beamR: BLACK, face: {smile: 0.7, brow: -0.3, look: 0.5}})});
def({id: 'paxton', name: 'Paxton', no: '', cat: 'Diesel', wheels: '0-6-0DE', basis: 'the BR Class 08 shunter',
  livery: 'jungle green with yellow lining, burnt orange coupling rods and front bufferbeam', dot: 0x2a7a3a,
  about: 'the kind Dieselworks shunter who works at Blue Mountain Quarry.',
  build: () => class08({color: 0x2a7a3a, lining: 0xf2c400, rods: 0xd2691e, beamF: 0xd2691e, beamR: BLACK, face: {smile: 0.85, brow: -0.2}})});
def({id: 'den', name: 'Den', no: '', cat: 'Diesel', wheels: '0-4-0DH', basis: 'the Rolls-Royce Sentinel 4-wheeled shunter',
  livery: 'greyish blue and orange with white lining and orange-and-black hazard stripes on his bufferbeams', dot: 0x5a7a9a,
  about: 'the thoughtful diesel who runs the Dieselworks with Dart.',
  build: () => shunter({L: 7.6, deck: 1.15, color: 0x5a7a9a, cabColor: 0xe8772a, lining: 0xffffff, stripes: true,
    wheels: [{z: 1.1, r: 0.55, c: 1}, {z: -0.9, r: 0.55, c: 1}], bon: {z0: -0.9, z1: 3.6, w: 2.0, top: 2.8}, cab: {z0: -3.1, z1: -0.9, roof: 3.7}, rear: {z0: -3.6, z1: -3.1, top: 2.2}, rearTop: 2.2,
    face: {smile: 0.3, brow: 0.2, look: -0.2, mustache: '#555555'}})});
def({id: 'dart', name: 'Dart', no: '', cat: 'Diesel', wheels: '4wDH', basis: 'the Bagnall 90 HP four-wheeled shunter',
  livery: 'yellow and dark fuchsia with white lining and hazard-striped bufferbeams; chipped and dirty', dot: 0xb0306a,
  about: "Den's eager, quick-talking helper at the Dieselworks.",
  build: () => shunter({L: 6.4, deck: 1.1, color: 0xf2c419, cabColor: 0x8a1f5a, lining: 0xffffff, stripes: true,
    wheels: [{z: 0.9, r: 0.5, c: 1}, {z: -0.9, r: 0.5, c: 1}], bon: {z0: -0.9, z1: 3.0, w: 1.8, top: 2.6}, cab: {z0: -2.9, z1: -0.9, roof: 3.5},
    face: {smile: 0.9, brow: -0.3, look: 0.5, grime: true}})});
def({id: 'philip', name: 'Philip', no: '68', cat: 'Diesel', wheels: '4wDE', basis: 'the Pennsylvania Railroad A6 boxcab',
  livery: 'dark green below and yellow above, red bufferbeams, black wheels and 68 in black in a white circle', dot: 0x2f6b3a,
  about: 'the eager little boxcab diesel who wants to be part of the Steam Team.',
  build: () => bogieDiesel({L: 7.6, W: 2.6, color: 0x2f6b3a, roof: 0x3a3c40, top: 3.6, deck: 1.15, frontWin: 2, stripe: {color: 0xf2c419, ys: [2.95], h: 1.25},
    bogies: [{z: 0, n: 2, r: 0.5, wb: 3.2}], face: {smile: 0.95, brow: -0.4, wide: true},
    extra: (b, k) => { for(const s of [-1, 1]){ const d = add(b, new THREE.CircleGeometry(0.36, 20), mat(0xffffff, 0.5), s * (k.W / 2 + 0.012), k.deck + 0.9, 0); d.rotation.y = s * Math.PI / 2; } letter(b, '68', 'black', 0.36, k.W / 2 + 0.006, k.deck + 0.9, 0); }})});

// Other engines
def({id: 'flynn', name: 'Flynn', no: '', cat: 'Other', wheels: 'road-rail fire engine', basis: 'an Oshkosh W800 airport fire engine, converted for road and rail',
  livery: 'red with yellow lining and the Sodor Search and Rescue Centre emblem on his doors', dot: 0xc8201e,
  about: 'the fire engine of the Search and Rescue Centre, who can drive on roads and rails.',
  build: () => flynnModel()});
def({id: 'winston', name: 'Winston', no: '', cat: 'Other', wheels: '4w', basis: 'a Type 4B Wickham trolley',
  livery: 'two-tone red with a black frame and wheels, brass hinges, a brass horn and silver headlights', dot: 0xe04a3a,
  about: "Sir Topham Hatt's track inspection car, who takes him around the railway.",
  build: () => winstonModel()});
def({id: 'stafford', name: 'Stafford', no: '1917', cat: 'Other', wheels: '4w battery-electric', basis: 'the North Staffordshire Railway battery-electric No. 1',
  livery: 'varnished wood veneer with black and yellow lining, No. 1917 in yellow and gold nameplates', dot: 0x8a5530,
  about: 'the quiet battery-electric shunter at Knapford Yards.',
  build: () => staffordModel()});

// Former engines
def({id: 'hiro', name: 'Hiro', no: '51', cat: 'Former', wheels: '2-8-2', basis: 'the JNR Class D51',
  livery: 'black with red wheels and bufferbeams, gold boiler bands, lining and fittings; 51 in white on his tender', dot: 0x2a2a2e,
  about: 'the "Master of the Railway" from Japan, restored at the Steamworks before he went home.',
  build: () => steam({L: 14.0, deck: 1.9, br: 0.85, by: 2.9, sbF: 6.3, sbLen: 1.6, cabLen: 2.5, roofY: 3.95, color: 0x1a1b1d, lining: 0xd4af37, bands: 0xd4af37, tender: true,
    wheel: 0xc8202a, chimney: {top: 3.98, r: 0.32, type: 'wide'}, dome: {r: 0.4, h: 0.28, long: 2.4, z: 0.5}, deflectors: {len: 2.4, color: 0x1a1b1d}, headlight: {z: 5.6},
    cyl: {z: 4.9, y: 1.0, r: 0.33, bars: 1.6},
    wheels: [{z: 5.6, r: 0.45}, {z: 3.4, r: 0.7, c: 1}, {z: 1.85, r: 0.7, c: 1}, {z: 0.3, r: 0.7, c: 1}, {z: -1.25, r: 0.7, c: 1}, {z: -4.6, r: 0.5}],
    face: {smile: 0.5, brow: 0.2, mustache: '#4a4a4a'}, marks: [{at: 'cab', plate: 'HIRO', bg: '#d4af37', fg: '#151515', w: 0.8, h: 0.24}]}),
  tender: () => tender({L: 8.0, top: 3.2, color: 0x1a1b1d, lining: 0xd4af37, bogies: true, wheel: 0xc8202a, marks: [{at: 'tender', t: '51', style: 'white', h: 0.55}]})});
def({id: 'glynn', name: 'Glynn', no: '1', cat: 'Former', wheels: '0-4-0VBT', basis: 'Head Wrightson & Co. No. 1 "Coffee Pot"',
  livery: 'red with gold boiler bands, a grey steam space cap and funnel with a brass top, and brass nameplates', dot: 0xb3201c,
  about: 'the old Coffee Pot engine who worked the Ffarquhar branch before Thomas, restored to run again.',
  build: () => coffeePot({color: 0xb3201c, name: 'GLYNN', no: '1', face: {smile: 0.7, brow: 0.1, mustache: '#7a7a7a'}})});
def({id: 'coffeepot2', name: 'Coffee Pot', no: '2', cat: 'Former', wheels: '0-4-0VBT', basis: 'Head Wrightson & Co. "Coffee Pot" engines',
  livery: 'red, like Glynn', dot: 0x9a1c1c,
  about: 'one of the Coffee Pot engines who once worked the Ffarquhar branch.',
  build: () => coffeePot({color: 0x9a1c1c, no: '2', face: {smile: 0.2, brow: 0.3}})});
def({id: 'coffeepot3', name: 'Coffee Pot', no: '3', cat: 'Former', wheels: '0-4-0VBT', basis: 'Head Wrightson & Co. "Coffee Pot" engines',
  livery: 'red, like Glynn', dot: 0x8a1a1a,
  about: 'one of the Coffee Pot engines who once worked the Ffarquhar branch.',
  build: () => coffeePot({color: 0x8a1a1a, no: '3', face: {smile: 0.4, brow: -0.2, look: 0.4}})});

// ------------------------------------------------------------------ rolling stock types
const STOCK_STD = {
  annie:       {build: () => coach({L: 8.6, color: 0xb8622a, roof: 0x5a4a3c, n: 4, doors: true, lineColor: '#3a2010', axles: [2.6, -2.6], face: {smile: 0.75, lashes: true}}), name: 'Annie'},
  clarabel:    {build: () => coach({L: 8.6, color: 0xb8622a, roof: 0x5a4a3c, n: 3, doors: true, lineColor: '#3a2010', axles: [2.6, -2.6], duckets: true, face: {smile: 0.6, lashes: true, brow: -0.2}}), name: 'Clarabel'},
  henrietta:   {build: () => coach({L: 7.0, color: 0xd9662b, roof: 0x8a8d91, n: 5, winW: 0.75, balcony: 0.8, beam: BEAM, axles: [1.8, -1.8], face: {smile: 0.5, lashes: true}}), name: 'Henrietta'},
  hannah:      {build: () => coach({L: 7.0, color: 0xe39a2a, roof: 0x8a8d91, n: 5, winW: 0.75, balcony: 0.8, beam: BEAM, axles: [1.8, -1.8], face: {smile: 0.95, lashes: true, look: 0.5}}), name: 'Hannah'},
  oldSlow:     {build: () => coach({L: 9.4, color: 0x5a2e1c, upper: 0xefe4c4, roof: 0x8a8d91, n: 4, doors: true, lineColor: '#d4af37', axles: [3.2, 0, -3.2], spokes: 8, face: {smile: 0.4, brow: -0.3, lashes: true}}), name: 'Old Slow Coach'},
  slip:        {build: () => coach({L: 18.5, color: 0x6b1f2a, upper: 0xefe4c4, roof: 0x1d1d1d, n: 9, doors: true, lineColor: '#d4af37', bogies: 6.4}), name: 'Slip Coach'},
  dexter:      {build: () => coach({L: 9.0, color: 0x2a4fa8, ends: 0xf2c419, roof: 0xb3201c, n: 3, doors: true, drawings: true, axles: [2.8, -2.8], face: {smile: 0.85, brow: -0.2}}), name: 'Dexter'},
  greenExpress:{build: () => coach({L: 19.5, color: 0x1f4a2e, surround: 0xe9dfc0, roof: 0x2a2a2a, n: 9, gangway: true, lineColor: '#d4af37', bogies: 6.7}), name: 'Green Express Coach'},
  emilyCoach:  {build: () => coach({L: 17.0, color: 0x0f8a4a, surround: 0xe9dfc0, roof: 0x55585c, n: 7, gangway: true, lineColor: '#f2c419', bogies: 5.8, rim: 0xffffff}), name: "Emily's Coach"},
  museum:      {build: () => coach({L: 9.0, color: 0x6a2a1a, roof: 0x2a2a2a, n: 3, doors: true, lineColor: '#d4af37', clerestory: true, axles: [2.8, -2.8], spokes: 8}), name: "Toby's Museum Coach"},
  floraTram:   {build: () => coach({L: 8.0, color: 0x2a6b3a, upper: 0xe9dfc0, n: 6, winW: 0.75, balcony: 0.7, doubleDeck: true, beam: BEAM, axles: [2.0, -2.0], lineColor: '#c8202a'}), name: "Flora's Tram Coach"},
  openTop:     {build: () => coach({L: 5.6, color: 0x2fb0a8, openTop: true, axles: [1.4, -1.4], spokes: 8}), name: 'Open-Topped Carriage'},
  truck:       {build: () => wagon({kind: 'open', color: 0x4f5256, text: 'N E', load: 'coal', face: {smile: -0.3, brow: 0.8, grime: true}}), name: 'Troublesome Truck'},
  truckB:      {build: () => wagon({kind: 'open', color: 0x4f5256, text: 'N E', load: 'stone', face: {smile: 0.9, brow: 0.9, look: 0.5}}), name: 'Troublesome Truck'},
  jamesTruck:  {build: () => wagon({kind: 'open', color: 0x2a4c9c, load: 'coal', face: {smile: 0.2, brow: 0.5}}), name: "James' Truck"},
  thomasTruck: {build: () => wagon({kind: 'open', color: 0x3a3c40, rust: true, load: 'scrap', face: {smile: 0.4, brow: 0.2, grime: true}}), name: "Thomas' Truck"},
  clayTruck:   {build: () => wagon({kind: 'open', color: 0x6a5a48, planks: 5, load: 'clay', text: 'S C C'}), name: 'China clay truck'},
  stoneTruck:  {build: () => wagon({kind: 'open', color: 0x55585c, load: 'stone'}), name: 'Stone truck'},
  rubbishTruck:{build: () => wagon({kind: 'open', color: 0x5a4a3a, rust: true, load: 'rubbish'}), name: 'Rubbish truck'},
  vanRed:      {build: () => wagon({kind: 'van', color: 0x9b2a1e, text: 'MAIL', face: {smile: 0.4, brow: 0.5}}), name: 'Troublesome Van'},
  vanGrey:     {build: () => wagon({kind: 'van', color: 0x8a8d91, text: 'N E', face: {smile: -0.2, brow: 0.7}}), name: 'Troublesome Van'},
  vanBrown:    {build: () => wagon({kind: 'van', color: 0x6e4a33, text: 'N E', face: {smile: 0.6, brow: 0.6, look: 0.5}}), name: 'Troublesome Van'},
  vanFish:     {build: () => wagon({kind: 'van', color: 0xe8e4da, text: 'FISH', face: {smile: 0.5, brow: 0.3}}), name: 'Troublesome Van (fish)'},
  spiteful:    {build: () => wagon({kind: 'brake', L: 7.6, color: 0x707377, face: {smile: -0.6, brow: 1.0, thick: true}}), name: 'The Spiteful Brake Van'},
  brakeVan:    {build: () => wagon({kind: 'brake', L: 7.6, color: 0x707377}), name: 'Brake van'},
  toad:        {build: () => wagon({kind: 'brake', style: 'gwr', L: 7.3, color: 0x8a8d91, text: 'GW 56831', face: {smile: 0.75, brow: -0.2}}), name: 'Toad'},
  oilTank:     {build: () => wagon({kind: 'tank', color: 0x151515, text: 'OIL', face: {smile: -0.2, brow: 0.6}}), name: 'Troublesome Tanker (oil)'},
  tarTank:     {build: () => wagon({kind: 'tank', color: 0x151515, text: 'TAR', face: {smile: 0.5, brow: 0.8}}), name: 'Troublesome Tanker (tar)'},
  milkTank:    {build: () => wagon({kind: 'tank', color: 0xf2f2f0, text: 'MILK', textStyle: 'blue', face: {smile: 0.7, brow: 0.1}}), name: 'Troublesome Tanker (milk)'},
  waterTank:   {build: () => wagon({kind: 'tank', color: 0x9a1c1c, text: 'WATER'}), name: 'Water tank wagon'},
  hector:      {build: () => wagon({kind: 'hopper', L: 6.6, color: 0x151515, text: 'HECTOR', face: {smile: -0.5, brow: 0.9, thick: true}}), name: 'Hector'},
  calliope:    {build: () => wagon({kind: 'calliope', L: 6.0, color: 0xc8202a}), name: 'The Calliope'},
  crane15:     {build: () => railCrane({L: 8.0, color: 0x6f8a78, roof: 0xb4b7ba, steam: true, jib: 8.5}), name: 'Breakdown crane'},
  jibRunner:   {build: () => wagon({kind: 'flat', L: 6.4, color: 0x4a4c50, rest: 0.8}), name: 'Jib runner'},
  toolVan:     {build: () => wagon({kind: 'van', color: 0x6f8a78, text: 'BREAKDOWN'}), name: 'Breakdown tool van'},
  judy:        {build: () => railCrane({L: 9.5, color: 0x2f9a7a, stripes: true, name: 'JUDY', jib: 10, axles: [3.3, 1.6, -1.6, -3.3], face: {smile: 0.7, lashes: true}}), name: 'Judy'},
  jerome:      {build: () => railCrane({L: 9.5, color: 0x2f9a7a, stripes: true, name: 'JEROME', jib: 10, axles: [3.3, 1.6, -1.6, -3.3], face: {smile: 0.6, brow: 0.2}}), name: 'Jerome'},
  rocky:       {build: () => railCrane({L: 11.5, color: 0xa0412a, roof: 0x8a8d91, stripes: true, jib: 12, houseLen: 4.6, houseH: 3.1, counter: 0x6a6d70, bogies: 3.8, face: {smile: 0.85, brow: -0.2}}), name: 'Rocky'},
  snow:        {build: () => wagon({kind: 'snow', L: 7.4, color: 0x8a8d91}), name: "Gordon's Snow Machine"},
  pump:        {build: () => wagon({kind: 'pump', L: 2.6, color: 0x2a5a33}), name: 'The Pump Trolley'},
  draisine:    {build: () => wagon({kind: 'draisine', L: 2.4, color: 0x8a8d91}), name: "The Photographer's Draisine"},
  logs:        {build: () => wagon({kind: 'flat', L: 8.0, color: 0x5a4a3a, load: 'logs'}), name: 'Log wagon'},
};
const protoCache = new Map();
function makeStock(key){
  let p = protoCache.get(key);
  if(!p){ p = STOCK_STD[key].build(); protoCache.set(key, p); return Object.assign({}, p, {key, name: STOCK_STD[key].name, fresh: true}); }
  const g = p.group.clone();
  const idx = p.axles.map(a => p.group.children.indexOf(a.g));
  return {group: g, len: p.len, rods: [], axles: p.axles.map((a, i) => ({z: a.z, r: a.r, coupled: a.coupled, g: g.children[idx[i]]})), key, name: STOCK_STD[key].name};
}

// Rolling stock and cranes as they appear in the roster (pointing at one of the vehicles on the map).
const STOCK_INFO = [
  {key: 'annie', cat: 'Passenger', name: 'Annie and Clarabel', basis: 'LB&SC Stroudley four-wheeled coaches', livery: 'orange-brown with black wheels, valances and bufferbeams', dot: 0xb8622a, about: "Thomas's faithful coaches; Clarabel has the guard's compartment."},
  {key: 'henrietta', cat: 'Passenger', name: 'Henrietta', basis: 'a Wisbech and Upwell Tramway four-wheeled coach', livery: 'persimmon with a grey roof and red bufferbeams', dot: 0xd9662b, about: "Toby's coach, whom he refused to leave behind."},
  {key: 'oldSlow', cat: 'Passenger', name: 'Old Slow Coach', basis: 'a GWR Diagram E39 brake coach (the "Falmouth Coupé")', livery: 'Great Western chocolate and cream', dot: 0x5a2e1c, about: 'the old coach rescued by Edward, now back in service.'},
  {key: 'slip', cat: 'Passenger', name: 'Slip Coaches', basis: 'GWR Diagram F16 double-ended slip coaches', livery: 'claret and cream with black roofs', dot: 0x6b1f2a, about: "the coaches that are slipped off the back of trains on Duck's line."},
  {key: 'hannah', cat: 'Passenger', name: 'Hannah', basis: 'a Wisbech and Upwell Tramway four-wheeled coach', livery: 'amber with red bufferbeams and a grey roof', dot: 0xe39a2a, about: "Henrietta's sister, who sometimes travels with Toby."},
  {key: 'dexter', cat: 'Passenger', name: 'Dexter', basis: 'an LB&SC Stroudley brake coach', livery: 'blue with yellow ends, a red roof and drawings along his side', dot: 0x2a4fa8, about: 'the old coach who became a school on the Harwick branch.'},
  {key: 'greenExpress', cat: 'Passenger', name: 'Green Express Coaches', basis: 'Southern Railway Maunsell coaches', livery: 'dark green with cream window surrounds and black roofs', dot: 0x1f4a2e, about: "the Express coaches pulled by Gordon and Rebecca."},
  {key: 'emilyCoach', cat: 'Passenger', name: "Emily's Coaches", basis: 'bogie coaches matching Emily', livery: 'emerald green with yellow lining, cream window surrounds and white wheel rims', dot: 0x0f8a4a, about: 'the shiny coaches Emily took from Thomas, then kept as her own.'},
  {key: 'museum', cat: 'Passenger', name: "Toby's Museum Coach", basis: 'an old LB&SC-style coach', livery: 'dark red with gold lining and a black roof', dot: 0x6a2a1a, about: 'the old coach Toby found, kept by the railway as a museum piece.'},
  {key: 'floraTram', cat: 'Passenger', name: "Flora's Tram Coach", basis: 'an open-topped double-deck tram trailer', livery: 'green and cream with red lining, yellow stairs and "SODOR TRAMWAYS"', dot: 0x2a6b3a, about: "the tram coach Flora pulls for Sodor Tramways."},
  {key: 'openTop', cat: 'Passenger', name: 'Open-Topped Carriages', basis: 'Liverpool and Manchester Railway third-class carriages', livery: 'turquoise with black lining and gold door handles', dot: 0x2fb0a8, about: "heritage open carriages, used here on Stepney's Bluebell line."},
  {key: 'truck', cat: 'Goods', name: 'Troublesome Trucks', basis: '7-plank open wagons', livery: 'dark grey with "N E" on the top plank', dot: 0x4f5256, about: 'the trucks who love to cause mischief and push engines down hills.'},
  {key: 'vanGrey', cat: 'Goods', name: 'Troublesome Vans', basis: 'LNER Diagram 102 12-ton vans', livery: 'various colours (orange, grey, brown, black, white and red)', dot: 0x8a8d91, about: 'vans for mail, parcels and fish, as naughty as the trucks.'},
  {key: 'spiteful', cat: 'Goods', name: 'The Spiteful Brake Van', basis: 'an LNER 20-ton brake van', livery: 'grey', dot: 0x707377, about: 'the brake van who held James back and was smashed to pieces.'},
  {key: 'toad', cat: 'Goods', name: 'Toad', basis: 'a GWR 16-ton "Toad" brake van', livery: 'grey with "GW" and 56831 in white', dot: 0x8a8d91, about: "Oliver's loyal brake van, who helps keep the trucks in order."},
  {key: 'oilTank', cat: 'Goods', name: 'Troublesome Tankers', basis: '14-ton fuel tankers', livery: 'black for oil and tar, white for milk', dot: 0x151515, about: 'tank wagons that are just as troublesome as the trucks.'},
  {key: 'jamesTruck', cat: 'Goods', name: "James' Trucks", basis: 'BR 7- and 8-plank end-door open wagons', livery: 'blue with black frames', dot: 0x2a4c9c, about: 'the blue trucks in James\'s goods train.'},
  {key: 'thomasTruck', cat: 'Goods', name: "Thomas' Trucks", basis: 'BR 7- and 8-plank end-door open wagons', livery: 'dark grey with black, rusted frames', dot: 0x3a3c40, about: "Thomas's old trucks, now carrying scrap."},
  {key: 'hector', cat: 'Goods', name: 'Hector', basis: 'an ICI hopper wagon', livery: 'black with "HECTOR" in cream, red bufferbeams and white wheel rims', dot: 0x151515, about: 'the big coal hopper who frightened Thomas, until he learned Thomas was kind.'},
  {key: 'calliope', cat: 'Goods', name: 'The Calliope', basis: 'a National CA-53 steam calliope', livery: 'red with yellow lining, brass pipes and a green "SR" emblem', dot: 0xc8202a, about: 'the old steam organ Percy saved from the smelters.'},
  {key: 'crane15', cat: 'Other stock', name: 'The Breakdown Train', basis: 'Cowans Sheldon 15-ton breakdown cranes', livery: 'desaturated green with light grey roofs and rusty brown chimneys', dot: 0x6f8a78, about: 'the steam breakdown crane, its jib runner and tool van.'},
  {key: 'judy', cat: 'Other stock', name: 'Judy and Jerome', basis: 'Cowans Sheldon 30-ton breakdown cranes', livery: 'jade green with yellow hazard stripes and brass nameplates', dot: 0x2f9a7a, about: 'the breakdown cranes who work as a pair to rescue derailed engines.'},
  {key: 'rocky', cat: 'Other stock', name: 'Rocky', basis: 'a Ransomes & Rapier 45-ton steam crane', livery: 'brick red with yellow hazard stripes and a grey roof', dot: 0xa0412a, about: 'the strong breakdown crane based at the Search and Rescue Centre.'},
  {key: 'snow', cat: 'Other stock', name: "Gordon's Snow Machine", basis: 'a rotary snowplough', livery: 'grey', dot: 0x8a8d91, about: 'the rotary snowplough Gordon pushes to clear deep snow.'},
  {key: 'pump', cat: 'Other stock', name: 'The Pump Trolley', basis: 'a handcar', livery: 'dark green with black wheels', dot: 0x2a5a33, about: 'the handcar Old Bailey used to warn of a landslide near Hawin Lake.'},
  {key: 'draisine', cat: 'Other stock', name: "The Photographer's Draisine", basis: 'a pedalled four-wheeled rail cycle', livery: 'grey', dot: 0x8a8d91, about: 'which lets the photographer pedal along the line to take pictures of the engines.'},
];
const NONRAIL_INFO = [
  {id: 'kevin', name: 'Kevin', basis: 'a Ransomes & Rapier 6-ton mobile crane', livery: 'yellow with black and light yellow stripes, a red hook and the Steamworks logo', dot: 0xf2c419, about: "Victor's clumsy but helpful assistant at the Sodor Steamworks.", home: 'steamworks'},
  {id: 'bigmickey', name: 'Big Mickey', basis: 'a US Navy 20-ton hammerhead tower crane', livery: 'warm grey', dot: 0x9a948a, about: 'the tall hammerhead crane at Brendam Docks who unloads the ships.', home: 'brendam'},
  {id: 'cranky', name: 'Cranky', basis: 'a dockside portal crane', livery: 'olive green with a grey counterweight and lime-green nameplates', dot: 0x6b7a2a, about: 'the grumpy crane at Brendam Docks.', home: 'brendam'},
  {id: 'carly', name: 'Carly', basis: 'a four-link portal harbour crane', livery: 'bright yellow with turquoise railings and stairs', dot: 0xf2d21a, about: 'the cheerful crane who works at Brendam Docks with Cranky and Big Mickey.', home: 'brendam'},
  {id: 'reg', name: 'Reg', basis: 'a rail-mounted grappling crane', livery: 'yellow with black warning stripes and dark red bufferbeams', dot: 0xf2c419, about: 'the crane at Wellsworth Scrap Yard who sorts the scrap.', home: 'scrapyard'},
];

// ------------------------------------------------------------------ duties: who runs where
// The Main Line is double track (lane +1 next to the platforms, lane -1 the far road).
const RUNS = {
  gordon:  {line: 'main', from: 'Tidmouth', to: 'Kellsthorpe Road', lane: 1, knap: 'up', speed: 30, passenger: true, stopsAt: ['Knapford', 'Wellsworth', 'Killdane'], consist: Array(6).fill('greenExpress'), job: 'the Express from Tidmouth to Kellsthorpe Road'},
  rebecca: {line: 'main', from: 'Kellsthorpe Road', to: 'Barrow-in-Furness', lane: 1, speed: 30, passenger: true, stopsAt: ["Crovan's Gate", 'Vicarstown'], consist: Array(5).fill('greenExpress'), job: 'the Express on to Vicarstown and Barrow'},
  henry:   {line: 'main', from: 'Knapford', to: 'Killdane', lane: -1, knap: 'down', fromShift: -63, speed: 24, consist: ['vanFish', 'vanFish', 'vanGrey', 'vanFish', 'vanBrown', 'vanFish', 'brakeVan'], job: 'the Flying Kipper fish train'},
  james:   {line: 'main', from: 'Killdane', to: 'Lower Kellsthorpe', lane: -1, speed: 20, consist: Array(6).fill('jamesTruck').concat(['spiteful']), job: 'a goods train of his blue trucks'},
  murdoch: {line: 'main', from: "Crovan's Gate", to: 'Vicarstown', lane: -1, speed: 18, consist: ['hector', 'truck', 'truckB', 'truck', 'truck', 'truckB', 'truck', 'truck', 'brakeVan'], job: 'the long goods train to Vicarstown'},
  thomas:  {line: 'ffarquhar', speed: 15, passenger: true, consist: ['annie', 'clarabel'], job: 'his branch line passenger train with Annie and Clarabel'},
  toby:    {line: 'toby', from: "Bluff's Cove", to: 'Ulfstead', speed: 9, passenger: true, consist: ['henrietta', 'hannah'], job: 'the Sodor Tramway with Henrietta and Hannah'},
  flora:   {line: 'toby', from: 'Ulfstead', to: 'Maron', speed: 9, passenger: true, consist: ['floraTram'], job: 'the Sodor Tramways service with her tram coach'},
  edward:  {line: 'brendam', from: 'Wellsworth', to: 'Lower Suddery', speed: 16, passenger: true, consist: ['oldSlow'], job: 'the branch passenger train with Old Slow Coach'},
  boco:    {line: 'brendam', from: 'Lower Suddery', to: 'Brendam Docks', speed: 16, consist: ['oilTank', 'tarTank', 'oilTank', 'brakeVan'], diesel: true, job: 'tanker trains to Brendam Docks'},
  duck:    {line: 'littlewest', from: 'Tidmouth', to: "Bluff's Cove", speed: 16, passenger: true, consist: ['slip', 'slip'], job: 'the Little Western passenger service with the Slip Coaches'},
  oliver:  {line: 'littlewest', from: "Bluff's Cove", to: 'Arlesburgh', speed: 14, consist: ['truck', 'truckB', 'truck', 'toad'], job: 'goods trains to Arlesburgh with Toad'},
  whiff:   {line: 'callandale', speed: 11, consist: ['rubbishTruck', 'rubbishTruck', 'thomasTruck', 'rubbishTruck'], job: 'collecting rubbish for the waste dump'},
  winston: {line: 'loop', speed: 10, consist: [], diesel: true, job: 'a track inspection run round the Loop Line'},
  emily:   {line: 'peelgodred', speed: 18, passenger: true, consist: ['emilyCoach', 'emilyCoach', 'emilyCoach'], job: 'passenger trains on the Peel Godred branch with her coaches'},
  paxton:  {line: 'bmq', speed: 10, consist: ['stoneTruck', 'stoneTruck', 'stoneTruck', 'stoneTruck', 'brakeVan'], diesel: true, job: 'stone trains from Blue Mountain Quarry'},
  percy:   {line: 'kirkronan', speed: 14, consist: ['vanRed', 'vanRed', 'vanGrey', 'brakeVan'], job: 'the mail train to Kirk Ronan'},
  stepney: {line: 'bluebell', speed: 11, passenger: true, consist: ['openTop', 'openTop', 'openTop'], job: 'heritage trains on the Bluebell line'},
  arthur:  {line: 'norramby', speed: 13, consist: ['milkTank', 'milkTank', 'oilTank', 'brakeVan'], job: 'goods trains on the Norramby branch'},
  daisy:   {line: 'harwick', speed: 18, passenger: true, consist: [], diesel: true, job: 'the passenger service on the Harwick branch'},
  stanley: {line: 'greatwaterton', speed: 12, consist: ['stoneTruck', 'truck', 'stoneTruck', 'brakeVan'], job: 'building materials to Great Waterton'},
  belle:   {line: 'rescue', speed: 15, consist: ['waterTank'], job: 'running to the Search and Rescue Centre with a water tank wagon'},
  salty:   {line: 'harbour', speed: 8, noRunRound: true, consist: ['vanFish', 'vanFish', 'truck'], diesel: true, job: 'shunting fish vans at Knapford Harbour'},
  diesel10:{line: 'dieselworks', speed: 12, consist: ['thomasTruck', 'thomasTruck', 'thomasTruck'], diesel: true, job: 'scrap trucks to and from the Dieselworks'},
  bill:    {line: 'chinaclay', fromU: 0, toU: 0.5, speed: 10, consist: ['clayTruck', 'clayTruck', 'clayTruck'], job: 'china clay trains from the pits'},
  ben:     {line: 'chinaclay', fromU: 0.5, toU: 1, speed: 10, consist: ['clayTruck', 'clayTruck', 'clayTruck'], job: 'china clay trains to the docks'},
};
// Depots and works, and who is stabled there. Order: by road.
const DEPOTS = [
  {key: 'tidmouth', label: 'Tidmouth Sheds', station: 'Tidmouth', line: 'main', kind: 'roundhouse', engines: ['nia', 'hank', 'molly', 'neville', 'donald', 'douglas', 'charlie'], stock: [['snow']]},
  // Knapford Yards lies alongside the station on the west, its six roads fed by a ladder off the
  // down Main Line (drawn by knapford.js); siteFn puts it there instead of searching for a site.
  {key: 'knapford', label: 'Knapford Yards', station: 'Knapford', line: 'main', kind: 'yard', len: 200,
   roads: [['diesel', 'harvey'], ['stafford', 'billy'], ['calliope', 'draisine'], ['jibRunner', 'crane15', 'toolVan'],
           ['truck', 'truckB', 'truck', 'truckB', 'truck'], ['vanGrey', 'vanBrown', 'vanGrey', 'oilTank', 'oilTank']],
   siteFn: () => {
     if(!KNAP.line) return null;
     const s0 = -265, t = KNAP.tangent(s0), n = new THREE.Vector3(-t.z, 0, t.x);     // n points west, away from the station
     const o = KNAP.at(s0, -26); const base = KNAP.y(-150); o.y = 0;
     return {o, t, n, len: 200 * M, wid: 34 * M, side: -1, base};
   }},
  {key: 'vicarstown', label: 'Vicarstown Sheds', station: 'Vicarstown', line: 'main', kind: 'shed', roads: [['rosie'], ['sonny']]},
  {key: 'dieselworks', label: 'Vicarstown Dieselworks', station: 'Vicarstown Dieselworks', line: 'dieselworks', kind: 'works', color: 0x5f7a9a, roads: [['den', 'dart'], ['dennis', 'norman'], ['sidney'], ['arry', 'bert']]},
  {key: 'wellsworth', label: 'Wellsworth Sheds', station: 'Wellsworth', line: 'main', kind: 'shed', roads: [['philip']]},
  {key: 'scrapyard', label: 'Wellsworth Scrap Yard', station: 'Suddery', line: 'brendam', kind: 'scrap', roads: [['thomasTruck', 'thomasTruck']]},
  {key: 'arlesburgh', label: 'Arlesburgh Yard', station: 'Arlesburgh', line: 'littlewest', kind: 'yard', roads: [['ryan', 'dexter'], ['jibRunner', 'judy', 'jibRunner', 'jerome', 'toolVan']]},
  {key: 'brendam', label: 'Brendam Docks', station: 'Brendam Docks', line: 'brendam', kind: 'docks', roads: [['porter', 'vanBrown', 'vanGrey']]},
  {key: 'clayworks', label: 'China Clay Works', station: 'China Clay Works', line: 'chinaclay', kind: 'clay', roads: [['timothy', 'clayTruck', 'clayTruck'], ['derek'], ['marion']]},
  {key: 'ffarquhar', label: 'Ffarquhar Quarry and Sheds', station: 'Ffarquhar', line: 'ffarquhar', kind: 'quarry', roads: [['mavis', 'stoneTruck', 'stoneTruck'], ['glynn', 'coffeepot2', 'coffeepot3'], ['thomasTruck', 'thomasTruck']]},
  {key: 'steamworks', label: 'Sodor Steamworks', station: "Crovan's Gate", line: 'main', kind: 'works', color: 0x8a4a32, roads: [['hiro'], []], victor: true},
  {key: 'rescue', label: 'Sodor Search and Rescue Centre', station: 'Sodor Search and Rescue Centre', line: 'rescue', kind: 'rescue', roads: [['flynn'], ['rocky']]},
  {key: 'harbour', label: 'Knapford Harbour (visitors from Misty Island)', station: 'Knapford Harbour', line: 'harbour', kind: 'harbour', roads: [['bash', 'logs'], ['dash', 'logs'], ['ferdinand']]},
  {key: 'dump', label: "Whiff's Waste Dump", station: 'Callandale', line: 'callandale', kind: 'dump', roads: [['scruff', 'rubbishTruck']]},
  {key: 'cement', label: 'Sodor Cement Works', station: 'Kirk Ronan', line: 'kirkronan', kind: 'cement', roads: [['fergus']]},
  {key: 'ulfstead', label: 'Ulfstead sidings', station: 'Ulfstead', line: 'toby', kind: 'siding', roads: [['museum']]},
  {key: 'hawin', label: 'Hawin Lake siding', station: 'Hawin Lake', line: 'peelgodred', kind: 'siding', roads: [['pump']]},
];

// ------------------------------------------------------------------ building the fleet
const byId = {};
FLEET.forEach(r => byId[r.id] = r);
const allNWR = [];             // every NWR vehicle in the scene: {v, parked}
const stockSeen = {};          // first instance of each stock key (for the roster)
const NWR_RUNNERS = [];
function scaleAdd(v){ v.group.scale.setScalar(M); scene.add(v.group); return v; }
function engineUnit(rec){
  if(!rec.veh){ rec.veh = scaleAdd(rec.build()); if(rec.tender) rec.tenderVeh = scaleAdd(rec.tender()); }
  return rec.tenderVeh ? [rec.veh, rec.tenderVeh] : [rec.veh];
}
const dummy = () => ({group: new THREE.Group(), len: 0.05, axles: [], rods: []});
let pickHandler = null;        // set once the panel functions exist below
function tagEngine(rec){ engineUnit(rec).forEach(v => K.tagPick(v.group, () => pickHandler(rec))); }
function tagStock(v, ctx){
  if(!stockSeen[v.key]) stockSeen[v.key] = v;
  K.tagPick(v.group, () => pickHandler({stockKey: v.key, veh: v, ctx}));
}

Object.keys(RUNS).forEach(id => {
  const rec = byId[id], run = RUNS[id], line = LINES[run.line];
  if(!rec || !line) return;
  const unit = engineUnit(rec);
  const cars = run.consist.length ? run.consist.map(k => scaleAdd(makeStock(k))) : [dummy()];
  let uA = run.from ? K.lineU(line, run.from) : (run.fromU || 0), uB = run.to ? K.lineU(line, run.to) : (run.toU === undefined ? 1 : run.toU);
  const sgn = uB >= uA ? 1 : -1, lane = (run.lane || 0) * MAIN_LANE * sgn;
  if(run.fromShift) uA += run.fromShift * M / line.real.len * sgn;         // start a little short of the station, so the train stands centred on its platform
  const loopW = run.lane === 1 ? -3.5 * sgn : (lane < 0 ? -4.6 : 4.6);
  // through Knapford a Main Line train follows its own platform road rather than its lane
  const latFn = run.knap && line.id === 'main' && KNAP.line ? KNAP.profile(run.knap, uA, sgn) : null;
  const R = K.makeRunner({line, uA, uB, unit, cars, scale: M, gap: 0.12 * M, vmax: run.speed * M, passenger: !!run.passenger, stopsAt: run.stopsAt,
    loopW: loopW * M, lane: lane * M, bedM: 3.6, diesel: !!run.diesel || rec.cat === 'Diesel', noRunRound: !run.consist.length || !!run.noRunRound, latFn});
  R.rec = rec; rec.runner = R; rec.run = run;
  if(run.lane !== 1) K.drawLoops(R);
  K.addMarker(R, rec.dot, () => pickHandler(rec));
  K.RUNNERS.push(R); NWR_RUNNERS.push(R);
  tagEngine(rec);
  unit.forEach(v => allNWR.push({v, parked: false}));
  cars.forEach(v => { if(v.key){ tagStock(v, {rec, run}); allNWR.push({v, parked: false}); } });
});
// Relief engines take turns on a duty (duties.js) and live in that duty's own engine shed (ops.js),
// so they leave the depot lists below.
const RELIEF = new Set();
Object.values((window.SODOR_DUTIES || {}).nwr || {}).forEach(d => (d.rota || []).slice(1).forEach(id => { if(byId[id] && !byId[id].runner) RELIEF.add(id); }));
RELIEF.forEach(id => { const rec = byId[id]; rec.relief = true; engineUnit(rec).forEach(v => allNWR.push({v, parked: true})); tagEngine(rec); });

// ------------------------------------------------------------------ depots, works and docks
const depotGroup = new THREE.Group(); scene.add(depotGroup);
const depotLabels = [];
function frameOnLine(line, u){
  const p = realAt(line, u, new THREE.Vector3()), t = realDir(line, u, new THREE.Vector3());
  t.y = 0; t.normalize();
  return {p, t, n: new THREE.Vector3(t.z, 0, -t.x)};
}
// ground already taken: the Skarloey Railway's yards and the depots placed so far
const taken = scene.children.filter(c => c.userData.stockKey).map(c => ({x: c.position.x, z: c.position.z, r: 10 * M}));
function rectOK(o, t, n, len, wid){
  for(let a = 0; a <= len + 1e-6; a += 6 * M) for(let b = 0; b <= wid + 1e-6; b += 5 * M){
    const x = o.x + t.x * a + n.x * b, z = o.z + t.z * a + n.z * b;
    if(heightAt(x, z) < 0.8 * M || K.nearTrack(x, z, 6 * M)) return false;
    if(taken.some(s => (s.x - x) ** 2 + (s.z - z) ** 2 < s.r * s.r)) return false;
  }
  return true;
}
function findSite(stName, lineId, len, wid, opt = {}){
  const line = LINES[lineId], u0 = K.lineU(line, stName);
  const alongs = [0, 40, -40, 80, -80, 130, -130, 190, -190, 260, -260, 340, -340, 450, -450];
  let first = null;
  for(const lat of (opt.lats || [11, 18, 28, 42, 60])) for(const al of alongs) for(const side of [-1, 1]){
    const u = u0 + al * M / line.real.len;
    if(u < 0.001 || u > 0.999) continue;
    const f = frameOnLine(line, u), n = f.n.clone().multiplyScalar(side);
    const o = f.p.clone().addScaledVector(n, lat * M).addScaledVector(f.t, -len * M / 2); o.y = 0;
    const cand = {o, t: f.t, n, len: len * M, wid: wid * M, side};
    if(!first) first = cand;
    if(rectOK(o, f.t, n, len * M, wid * M)) return cand;
  }
  return first;
}
function siteKit(site){
  let hmin = Infinity, hmax = -Infinity;
  for(let a = 0; a <= site.len + 1e-6; a += 5 * M) for(let b = 0; b <= site.wid + 1e-6; b += 5 * M){
    const x = site.o.x + site.t.x * a + site.n.x * b, z = site.o.z + site.t.z * a + site.n.z * b, h = Math.max(0, heightAt(x, z));
    hmin = Math.min(hmin, h); hmax = Math.max(hmax, h);
  }
  const base = site.base !== undefined ? site.base : Math.max(hmax, 0.6 * M) + 0.25 * M;
  const yaw = Math.atan2(site.t.x, site.t.z);
  const G = new THREE.Group(); G.position.set(site.o.x, base, site.o.z); G.rotation.y = yaw; G.scale.setScalar(M);
  const sx = site.side < 0 ? -1 : 1;     // local x = across * sx (see siteKit.pt)
  const lenM = site.len / M, widM = site.wid / M;
  // cinder pad levelling the yard
  const padH = (base - hmin) / M + 1.0;
  box(G, widM + 4, padH, lenM + 4, mat(0x5e5a52, 0.95), sx * widM / 2, -padH / 2 + 0.02, lenM / 2);
  const kit = {site, base, yaw, G, sx, lenM, widM,
    pt: (a, b) => new THREE.Vector3(site.o.x + site.t.x * a * M + site.n.x * b * M, base, site.o.z + site.t.z * a * M + site.n.z * b * M),
    lx: b => sx * b,
  };
  // straight standard-gauge road between local (a0,b0) and (a1,b1), in metres
  kit.road = (a0, b0, a1, b1, kind = 'standard') => {
    const half = BED_M[kind] / 2, x0 = sx * b0, x1 = sx * b1, len = Math.hypot(a1 - a0, x1 - x0);
    const g = new THREE.PlaneGeometry(2 * half, len); g.rotateX(-Math.PI / 2);
    const uv = g.attributes.uv; for(let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * len / (kind === 'standard' ? 0.75 : 0.9));
    const m = new THREE.Mesh(g, roadMat(kind)); m.position.set((x0 + x1) / 2, 0.05, (a0 + a1) / 2); m.rotation.y = Math.atan2(x1 - x0, a1 - a0);
    m.receiveShadow = true; G.add(m);
  };
  // place a row of vehicles from local (a,b) going along local direction (da,db); each faces back toward the start
  kit.row = (vehicles, a, b, da, db) => {
    const dl = Math.hypot(da, db); da /= dl; db /= dl;
    const dir = new THREE.Vector3().addScaledVector(site.t, da).addScaledVector(site.n, db);
    const yaw = Math.atan2(-dir.x, -dir.z);
    let s = 1.0;
    vehicles.forEach(v => {
      s += v.len / 2;
      const p = kit.pt(a + da * s, b + db * s);
      v.group.position.copy(p); v.group.rotation.set(0, yaw, 0);
      s += v.len / 2 + 0.15;
    });
    return s;
  };
  return kit;
}
const roadMats = {};
function roadMat(kind){
  if(!roadMats[kind]){ const t = trackTexture(kind).clone(); t.wrapS = THREE.ClampToEdgeWrapping; t.wrapT = THREE.RepeatWrapping; t.needsUpdate = true; roadMats[kind] = new THREE.MeshStandardMaterial({map: t, roughness: 0.9}); }
  return roadMats[kind];
}
function heap(G, x, z, r, h, color){
  add(G, new THREE.ConeGeometry(r, h, 9), mat(color, 0.95), x, h / 2, z);
  for(let k = 0; k < 4; k++){ const b = box(G, r * 0.5, h * 0.3, r * 0.4, mat(color, 0.95), x + Math.cos(k * 1.7) * r * 0.6, h * 0.12, z + Math.sin(k * 1.7) * r * 0.6); b.rotation.y = k; }
}
function building(G, x, z, w, d, h, wall, roofC, rotY = 0){
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rotY; G.add(g);
  box(g, w, h, d, mat(wall, 0.85), 0, h / 2, 0);
  gable(g, w, d * 1.04, h, mat(roofC, 0.75));
  for(let k = 0; k < Math.floor(d / 4); k++) for(const s of [-1, 1]) box(g, 0.08, 1.3, 1.4, glassMat(), s * (w / 2 + 0.03), h * 0.6, -d / 2 + 2 + k * 4);
  return g;
}
// An engine shed (or works) over the far ends of the roads, open towards the yard.
function shedOver(kit, roads, a0, a1, h, wall, roofC){
  const G = kit.G, w = roads * 5 + 3, cx = kit.lx(w / 2 - 1.5);
  const WALL = mat(wall, 0.85);
  for(const s of [-1, 1]) box(G, 0.5, h, a1 - a0, WALL, cx + s * w / 2, h / 2, (a0 + a1) / 2);
  box(G, w, h, 0.5, WALL, cx, h / 2, a1);
  box(G, w, 1.2, 0.5, WALL, cx, h - 0.6, a0);
  for(let k = 0; k <= roads; k++) box(G, 0.5, h, 0.5, WALL, kit.lx(0.5 + k * 5), h / 2, a0);
  gable(G, w + 0.6, a1 - a0 + 0.6, h, mat(roofC, 0.75), cx, (a0 + a1) / 2);
  box(G, 1.4, 0.8, a1 - a0 - 4, mat(roofC, 0.75), cx, h + (w + 0.6) * 0.42, (a0 + a1) / 2);      // smoke vent along the ridge
}
function label(text, pos){
  const tex = canvasTex(512, 64, (g, w, h) => {
    g.font = 'bold 30px Segoe UI, Arial'; const tw = g.measureText(text).width;
    g.fillStyle = 'rgba(10,20,28,0.82)'; rrect(g, w / 2 - tw / 2 - 16, 8, tw + 32, 48, 12); g.fill();
    g.strokeStyle = '#ffd166'; g.lineWidth = 2; g.stroke();
    g.fillStyle = '#ffd166'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, 33);
  });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({map: tex, depthTest: false, sizeAttenuation: false, transparent: true}));
  s.scale.set(0.24, 0.03, 1); s.renderOrder = 11; s.position.copy(pos); s.visible = false;
  scene.add(s); depotLabels.push(s);
  return s;
}
function vehiclesFor(ids, home){
  return ids.map(id => {
    if(byId[id]){ const rec = byId[id]; rec.home = home; const u = engineUnit(rec); tagEngine(rec); return u; }
    const v = scaleAdd(makeStock(id)); tagStock(v, {home}); return [v];
  });
}
function parkAll(units){ units.flat(3).forEach(v => { if(v && v.group) allNWR.push({v, parked: true}); }); }

const SITE_STEP = 5;           // metres between parallel roads
function buildDepot(D){
  if(!LINES[D.line]) return;
  if(D.kind === 'roundhouse') return buildRoundhouse(D);
  if(D.kind === 'docks') return buildDocks(D);
  const roads = D.roads.map(ids => vehiclesFor(ids, D));
  const rowLen = roads.map(r => r.flat().reduce((s, v) => s + v.len + 0.15, 2));
  const yardLen = Math.max(30, ...rowLen);
  const shedLen = D.kind === 'shed' ? 26 : D.kind === 'works' ? 40 : 0;
  const extra = D.kind === 'clay' || D.kind === 'quarry' || D.kind === 'dump' || D.kind === 'scrap' || D.kind === 'cement' || D.kind === 'rescue' || D.kind === 'harbour' ? 18 : D.victor ? 12 : 0;
  const len = D.len || (yardLen + shedLen + 8), wid = Math.max(1, roads.length) * SITE_STEP + 4 + extra;
  const site = (D.siteFn && D.siteFn()) || findSite(D.station, D.line, len, wid);
  const kit = siteKit(site);
  roads.forEach((units, i) => {
    const b = 3 + i * SITE_STEP;
    kit.road(0, b, len, b);
    kit.row(units.flat(), 3, b, 1, 0);
    // recorded so ops.js can shunt the engines up and down this road and put them away at night
    K.yards.push({D, label: D.label, rail: 'nwr', units, ids: D.roads[i], at: (s, out) => out.copy(kit.pt(s, b)), yaw: kit.yaw + Math.PI, face: -1,
      sMin: 1, sMax: len - 1, shed: shedLen ? len - shedLen : 0});
  });
  parkAll(roads);
  const G = kit.G, lx = kit.lx, rw = roads.length * SITE_STEP;
  if(D.kind === 'shed') shedOver(kit, roads.length, len - shedLen, len, 6.5, 0x8a4a32, 0x3a3f46);
  if(D.kind === 'works') shedOver(kit, roads.length, len - shedLen, len, 9, D.color, 0x4a4f58);
  const ex = lx(rw + 3 + extra / 2);
  if(D.kind === 'clay'){ for(let k = 0; k < 3; k++) heap(G, ex, 8 + k * 9, 6, 7, 0xeeece2); building(G, ex, len - 8, 12, 14, 8, 0xd9cfb4, 0x6a6d70); }
  if(D.kind === 'quarry'){ for(let k = 0; k < 3; k++) heap(G, ex, 8 + k * 9, 6, 6, 0x9a958c); building(G, ex, len - 7, 10, 10, 9, 0x8a8d91, 0x4a4f58); building(G, lx(-6), len - 12, 7, 9, 5, 0x8a4a32, 0x3a3f46); }
  if(D.kind === 'dump'){ for(let k = 0; k < 4; k++) heap(G, ex + (k % 2) * 3, 6 + k * 7, 5, 3.5, [0x6a5a3a, 0x5a4a3c, 0x7a6a4a, 0x4a4a3a][k]); }
  if(D.kind === 'scrap'){ for(let k = 0; k < 4; k++) heap(G, ex, 6 + k * 7, 5, 4, 0x5a4a3c); const reg = regModel(); reg.position.set(lx(3 + roads.length * SITE_STEP), 0, len * 0.5); G.add(reg); kit.road(len * 0.5 - 6, 3 + roads.length * SITE_STEP, len * 0.5 + 6, 3 + roads.length * SITE_STEP); nonRail('reg', G, reg); }
  if(D.kind === 'cement'){ for(let k = 0; k < 3; k++){ cylY(G, 3, 3, 14, mat(0xb4b7ba, 0.7), ex, 7, 8 + k * 7.5, 20); add(G, new THREE.ConeGeometry(3, 2, 20), mat(0x8a8d91, 0.7), ex, 15, 8 + k * 7.5); } }
  if(D.kind === 'rescue'){ building(G, ex, len * 0.5, 14, 22, 8, 0xeeeeee, 0xc8201e); cylY(G, 1.6, 1.6, 16, mat(0xc8201e, 0.6), ex + lx(5), 8, len * 0.5 + 12, 16); }
  if(D.kind === 'harbour'){ box(G, 14, 1.0, len, mat(0x7a6a52, 0.9), ex, 0.5, len / 2); for(let k = 0; k < 4; k++) for(let j = 0; j < 3; j++) cylZ(G, 0.35, 0.35, 8, mat(0x7a5a38, 0.9), ex - 2 + j * 0.75, 1.4 + (k % 2) * 0.6, 6 + k * 9, 10); }
  if(D.kind === 'yard') building(G, lx(-6), 8, 5, 7, 4, 0x8a4a32, 0x3a3f46);
  if(D.victor) buildVictor(kit, 3 + roads.length * SITE_STEP + 1, len - shedLen - 22);
  if(D.key === 'steamworks'){ const kv = kevinModel(); kv.position.set(lx(3 + roads.length * SITE_STEP + 7), 0, 10); G.add(kv); nonRail('kevin', G, kv); }
  finishSite(D, kit);
}
function finishSite(D, kit){
  bakeSite(kit.G);
  depotGroup.add(kit.G);
  const c = kit.pt(kit.lenM / 2, kit.widM / 2), rad = Math.hypot(kit.lenM, kit.widM) / 2 * M;
  K.clearArea(c.x, c.z, rad + 6 * M);
  taken.push({x: c.x, z: c.z, r: rad + 4 * M});
  D.center = c;
  D.labelSprite = label(D.label, c.clone().setY(c.y + 26 * M));
}
function bakeSite(G){
  // merge static parts; keep road strips (their own material) and any sub-groups already baked
  const keep = G.children.filter(o => (o.isMesh && o.material.map) || o.userData.keep);
  keep.forEach(o => G.remove(o));
  bakeVC(G);
  G.children.forEach(m => { m.receiveShadow = true; });
  keep.forEach(o => G.add(o));
}

// Tidmouth Sheds: a long straight-fronted engine shed in cream brick, its arched doorways fed by a
// fan of roads off the turntable; a carriage shed, coal stage, water tower and signal box round the
// gravel yard, and an arcaded retaining wall behind.
function buildRoundhouse(D){
  const ids = D.engines, units = vehiclesFor(ids, D).concat((D.stock || []).map(s => vehiclesFor(s, D)).flat());
  while(units.length < 7) units.push([]);               // spare stalls stand empty
  const n = units.length, R0 = 12, PITCH = 5.6;
  const site = findSite(D.station, D.line, 124, 92, {lats: [14, 22, 32, 45, 60]});
  const kit = siteKit(site), G = kit.G, lx = kit.lx, sx = kit.sx;
  const ca = 66, cb = 16;                               // turntable centre (local along, across)
  const BF = cb + 30, BB = BF + 30, BM = (BF + BB) / 2;  // shed front, back and middle (across)
  const HALF = n * PITCH / 2 + 0.8, H = 8.5;
  const CREAM = mat(0xe4dccb, 0.85), PIER = mat(0xd3c9b2, 0.85), BRICK = mat(0x8a4a32, 0.85), GREEN = mat(0x2f5a3a, 0.7),
        SLATE = mat(0x707888, 0.75), DARK = mat(0x2a2c30, 0.7), GRAV = mat(0x8c877c, 0.95), GLASS = glassMat();
  const rbox = (w, h, d, m, a, b, y, rot) => { const me = box(G, w, h, d, m, lx(b), y, a); me.rotation.y = rot; return me; };
  const yawAB = (da, db) => Math.atan2(sx * db, da);    // local rotation.y for a run along (da, db)

  // gravel apron with weed patches
  box(G, 120, 0.04, 88, GRAV, lx(46), 0.0, 62);
  for(let k = 0; k < 14; k++) box(G, 4 + (k * 7) % 6, 0.02, 3 + (k * 5) % 5, mat(0x6f7a3a, 0.95), lx(8 + (k * 37) % 70), 0.025, 8 + (k * 53) % 108);

  // turntable: brick-lined pit and a green girder bridge with its cabin
  cylY(G, R0, R0, 1.2, mat(0x6a6a66, 0.95), lx(cb), -0.6, ca, 40);
  add(G, new THREE.CylinderGeometry(R0 + 0.35, R0 + 0.35, 1.3, 40, 1, true), mat(0xd8d0bc, 0.85, 0, 'double'), lx(cb), -0.55, ca);
  add(G, new THREE.TorusGeometry(R0 + 0.55, 0.3, 4, 40).rotateX(Math.PI / 2), mat(0xb8b0a0, 0.9), lx(cb), 0.08, ca);
  const bridge = new THREE.Group(); bridge.position.set(lx(cb), 0.12, ca); G.add(bridge);
  bridge.userData.keep = true;
  const BGREEN = mat(0x2c4a34, 0.6, 0.2);
  box(bridge, 3.0, 0.5, 2 * R0 - 0.4, mat(0x2a2c30, 0.6, 0.3), 0, -0.3, 0);
  for(const s of [-1, 1]){
    box(bridge, 0.35, 1.1, 2 * R0 - 0.6, BGREEN, s * 1.95, 0.1, 0);
    box(bridge, 0.35, 0.5, 2 * R0 - 6, BGREEN, s * 1.95, 0.9, 0);
    box(bridge, 0.06, 0.06, 2 * R0 - 4, DARK, s * 2.3, 1.6, 0);
    for(let z = -R0 + 2; z <= R0 - 2; z += 4) box(bridge, 0.06, 1.0, 0.06, DARK, s * 2.3, 1.1, z);
  }
  box(bridge, 2.4, 2.6, 2.0, mat(0x3a2a24, 0.8), 3.4, 1.2, R0 - 1.6);
  box(bridge, 2.8, 0.2, 2.4, DARK, 3.4, 2.6, R0 - 1.6);
  const bm = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 2 * R0 - 0.4).rotateX(-Math.PI / 2), roadMat('standard'));
  const buv = bm.geometry.attributes.uv; for(let i = 0; i < buv.count; i++) buv.setY(i, buv.getY(i) * (2 * R0) / 0.75);
  bm.position.y = 0.12; bridge.add(bm);
  // lead from the turntable towards the line, and short spurs off the table either side
  kit.road(ca, cb - R0, ca, 0);
  const buffer = (a, b, rot) => { rbox(2.6, 0.5, 0.4, mat(0x6a3a22, 0.8), a, b, 0.7, rot); rbox(0.3, 0.9, 0.3, mat(0x6a3a22, 0.8), a, b, 0.4, rot); };
  [-1.25, -1.9, 1.25, 1.9].forEach(phi => {
    const da = Math.sin(phi), db = Math.cos(phi), L = 20;
    kit.road(ca + da * R0, cb + db * R0, ca + da * (R0 + L), cb + db * (R0 + L));
    buffer(ca + da * (R0 + L - 0.5), cb + db * (R0 + L - 0.5), yawAB(da, db));
  });

  // the stalls: radial off the table to each doorway, easing to run straight in
  const stalls = units.map((u, k) => {
    const la = (k - (n - 1) / 2) * PITCH, Da = ca + la, Db = BF;
    const rd = Math.hypot(la, BF - cb), ua = la / rd, ub = (BF - cb) / rd, rA = rd - 8;
    const pts = [];
    for(let r = 0; r <= rA; r += 2) pts.push([ca + ua * r, cb + ub * r]);
    const A = [ca + ua * rA, cb + ub * rA], B = [Da, Db + 7];
    for(let i = 1; i <= 16; i++){ const t = i / 16, s = 1 - t; pts.push([s * s * A[0] + 2 * s * t * Da + t * t * B[0], s * s * A[1] + 2 * s * t * Db + t * t * B[1]]); }
    pts.push([Da, BB - 0.8]);
    const pl = [{a: pts[0][0], b: pts[0][1], s: 0}];
    for(let i = 1; i < pts.length; i++){ const p = pl[i - 1]; pl.push({a: pts[i][0], b: pts[i][1], s: p.s + Math.hypot(pts[i][0] - p.a, pts[i][1] - p.b)}); }
    for(let i = 1; i < pl.length; i++){
      if(pl[i].s <= R0) continue;
      const p = pl[i - 1], inPit = p.s < R0;
      kit.road(inPit ? ca + ua * R0 : p.a, inPit ? cb + ub * R0 : p.b, pl[i].a, pl[i].b);
    }
    buffer(Da, BB - 0.6, yawAB(0, 1));
    const door = pl.find(p => p.b >= BF).s;
    return {phi: Math.atan2(ua, ub), pl, rA, door, end: pl[pl.length - 1].s, vehs: u, id: (ids.concat((D.stock || []).flat()))[k]};
  });
  // place the vehicles along their stalls (ops.js moves them from here on)
  stalls.forEach(st => {
    let s = st.door - 3;
    st.vehs.forEach(v => { s += v.len / 2; const q = stallPt(st, s); v.group.position.copy(kit.pt(q.a, q.b));
      const w = kit.pt(q.a + q.ta, q.b + q.tb).sub(kit.pt(q.a, q.b)); v.group.rotation.set(0, Math.atan2(-w.x, -w.z), 0); s += v.len / 2 + 0.15; });
  });

  // ---- the engine shed
  const z0 = ca - HALF, z1 = ca + HALF;
  // front: piers between the doorways, a deep band over them with brick arches and fanlights
  for(let k = 0; k <= n; k++){
    const a = ca + (k - n / 2) * PITCH;
    box(G, 1.0, H, 1.3, PIER, lx(BF - 0.2), H / 2, a);
    box(G, 1.2, 0.5, 1.5, CREAM, lx(BF - 0.3), H + 0.25, a);
    box(G, 0.12, 6.5, 0.12, GREEN, lx(BF - 0.9), 3.25, a);              // downpipe
    box(G, 0.7, 0.4, 0.7, GREEN, lx(BF - 0.9), 6.6, a);
  }
  box(G, 0.8, H - 5.8, 2 * HALF, CREAM, lx(BF), 5.8 + (H - 5.8) / 2, ca);
  for(let k = 0; k < n; k++){
    const a = ca + (k - (n - 1) / 2) * PITCH;
    const arch = add(G, new THREE.TorusGeometry(2.25, 0.32, 5, 14, Math.PI), BRICK, lx(BF - 0.45), 5.4, a); arch.rotation.y = Math.PI / 2;
    const fan = add(G, new THREE.CircleGeometry(2.1, 14, 0, Math.PI), mat(0x3a5a48, 0.3, 0.3, 'double'), lx(BF - 0.42), 5.4, a); fan.rotation.y = -sx * Math.PI / 2;
    for(const s of [-1, 1]){                                             // door leaves folded back inside
      box(G, 2.0, 5.2, 0.12, GREEN, lx(BF + 1.1), 2.7, a + s * 2.1);
      box(G, 1.6, 1.4, 0.14, GLASS, lx(BF + 1.1), 4.3, a + s * 2.1);
    }
  }
  // side and back walls, with tall arched windows
  box(G, 0.8, H, 2 * HALF, CREAM, lx(BB + 0.4), H / 2, ca);
  for(const z of [z0, z1]){
    box(G, BB - BF + 1.2, H, 0.8, CREAM, lx(BM), H / 2, z);
    for(let b = BF + 4; b < BB - 2; b += 4.2){ box(G, 1.8, 3.6, 0.2, GLASS, lx(b), 4.0, z + (z > ca ? 0.45 : -0.45)); box(G, 2.1, 0.25, 0.3, GREEN, lx(b), 5.9, z + (z > ca ? 0.45 : -0.45)); }
    // gable infill with a stepped parapet, finials and a round window
    gable(G, BB - BF + 1.2, 0.8, H, CREAM, lx(BM), z, 0, 0.42);
    const rise = (BB - BF + 1.2) / 1.732 * 1.08 * 0.42 * 1.5;
    add(G, new THREE.CylinderGeometry(1.4, 1.4, 0.3, 18).rotateX(Math.PI / 2), GREEN, lx(BM), H + rise * 0.45, z + (z > ca ? 0.45 : -0.45));
    for(const b of [BF, BM, BB]) { box(G, 1.4, 1.2, 1.2, PIER, lx(b), (b === BM ? H + rise : H) + 0.4, z); add(G, new THREE.SphereGeometry(0.55, 10, 8), PIER, lx(b), (b === BM ? H + rise : H) + 1.3, z); }
  }
  // slate roof, a glazed clerestory along the ridge, smoke vents in a row over the stalls
  gable(G, BB - BF + 2.0, 2 * HALF + 0.6, H, SLATE, lx(BM), ca, 0, 0.42);
  const ridge = H + (BB - BF + 2) / 1.732 * 1.08 * 0.42 * 1.5;
  box(G, 3.6, 1.4, 2 * HALF - 4, SLATE, lx(BM), ridge - 0.2, ca);
  for(const s of [-1, 1]) box(G, 0.1, 0.9, 2 * HALF - 5, GLASS, lx(BM + s * 1.85), ridge - 0.3, ca);
  box(G, 4.2, 0.25, 2 * HALF - 3.6, mat(0x2c4a34, 0.7), lx(BM), ridge + 0.55, ca);
  for(let k = 0; k < n; k++){
    const a = ca + (k - (n - 1) / 2) * PITCH, b = BF + 8, y = H + (b - BF + 1) / ((BB - BF) / 2) * (ridge - H) * 0.85;
    cylY(G, 0.4, 0.4, 2.4, DARK, lx(b), y + 0.6, a, 8);
    add(G, new THREE.ConeGeometry(0.75, 0.8, 8), DARK, lx(b), y + 2.1, a);
    box(G, 2.4, 0.9, 2.0, SLATE, lx(BM + 6), ridge - 2.0, a);          // dormer vents on the back slope
  }
  box(G, 0.4, 0.5, 2 * HALF + 0.8, mat(0x2c4a34, 0.7), lx(BF - 0.6), H - 0.1, ca);   // green gutter

  // ---- carriage shed on the left: three roads under a glazed roof, with the boiler-house chimney
  const CA = [10, 16, 22];
  CA.forEach(a => { kit.road(a, 2, a, 80); buffer(a, 79.4, yawAB(0, 1)); });
  const cz0 = 6.2, cz1 = 25.8, cb0 = 54, cb1 = 80;
  for(const z of [cz0, cz1]) box(G, cb1 - cb0, 7, 0.7, CREAM, lx((cb0 + cb1) / 2), 3.5, z);
  box(G, 0.7, 7, cz1 - cz0, CREAM, lx(cb1), 3.5, (cz0 + cz1) / 2);
  for(const z of [cz0, (cz0 + cz1) / 2, cz1]) box(G, 1.2, 7.6, 1.2, PIER, lx(cb0), 3.8, z);
  box(G, 0.8, 1.6, cz1 - cz0, CREAM, lx(cb0), 6.6, (cz0 + cz1) / 2);
  gable(G, cz1 - cz0 + 1, cb1 - cb0 + 1, 7, SLATE, lx((cb0 + cb1) / 2), (cz0 + cz1) / 2, Math.PI / 2, 0.45);
  for(let b = cb0 + 3; b < cb1 - 2; b += 2.6) for(const s of [-1, 1]) box(G, 2.2, 0.1, 3.2, GLASS, lx(b), 8.4, (cz0 + cz1) / 2 + s * 3.4);
  for(const b of [cb0, cb1]) gable(G, cz1 - cz0 + 0.6, 0.7, 7, CREAM, lx(b), (cz0 + cz1) / 2, Math.PI / 2, 0.45);
  box(G, 3.2, 3, 3.2, PIER, lx(cb1 + 3), 1.5, 4);
  cylY(G, 1.0, 1.5, 22, CREAM, lx(cb1 + 3), 11, 4, 4).rotation.y = Math.PI / 4;
  box(G, 2.6, 0.7, 2.6, PIER, lx(cb1 + 3), 22.3, 4);

  // ---- yard on the right: coal stage and crane, water tower, sand drier, signal box
  const YA = 102;
  kit.road(YA, 2, YA, 70); buffer(YA, 69.4, yawAB(0, 1));
  kit.road(YA + 8, 2, YA + 8, 62); buffer(YA + 8, 61.4, yawAB(0, 1));
  for(let k = 0; k < 3; k++){                                           // coal bunkers beside the road
    box(G, 3.4, 1.2, 5, mat(0x4a3424, 0.9), lx(30 + k * 7), 0.6, YA - 4.5);
    box(G, 3.0, 0.3, 4.6, mat(0x15161a, 0.95), lx(30 + k * 7), 1.2, YA - 4.5);
  }
  // coaling crane: lattice tower, cab and jib over the road
  for(const s of [-1, 1]) for(const t of [-1, 1]) box(G, 0.3, 9, 0.3, mat(0x3a2a24, 0.8), lx(52 + s * 1.4), 4.5, YA - 5 + t * 1.4);
  for(let y = 1.5; y < 9; y += 2.2) box(G, 3.1, 0.15, 3.1, mat(0x3a2a24, 0.8), lx(52), y, YA - 5);
  box(G, 3.2, 2.6, 3.2, mat(0x6a3a2a, 0.8), lx(52), 10.3, YA - 5);
  gable(G, 3.6, 3.6, 11.6, DARK, lx(52), YA - 5, 0, 0.5);
  const jib = box(G, 0.5, 0.5, 13, mat(0x3a2a24, 0.8), lx(52), 12.5, YA + 1); jib.rotation.x = -0.35;
  // water tower
  for(const s of [-1, 1]) for(const t of [-1, 1]) box(G, 0.35, 7, 0.35, mat(0x5a2a2a, 0.8), lx(40 + s * 1.8), 3.5, YA + 4 + t * 1.8);
  box(G, 5.2, 2.8, 5.2, mat(0x5a2a2a, 0.75), lx(40), 8.4, YA + 4);
  box(G, 4.8, 0.1, 4.8, mat(0x4a7a9a, 0.2, 0.2), lx(40), 9.8, YA + 4);
  // water column and lamps
  cylY(G, 0.4, 0.5, 4, DARK, lx(30), 2, YA + 4, 10);
  const lamp = (a, b) => { cylY(G, 0.12, 0.18, 8, GREEN, lx(b), 4, a, 8);
    for(const s of [-1, 1]){ box(G, 0.1, 0.1, 1.6, GREEN, lx(b), 7.8, a + s * 0.8); add(G, new THREE.ConeGeometry(0.4, 0.4, 10, 1, true), mat(0x2c4a34, 0.6, 0, 'double'), lx(b), 7.6, a + s * 1.6); } };
  [[40, 10], [52, 30], [80, 30], [92, 12], [30, 40], [114, 40]].forEach(([a, b]) => lamp(a, b));
  // signal box, white boarded with a blue base and a hipped slate roof
  const sbA = 116, sbB = 30;
  box(G, 7, 3.0, 4.6, mat(0x5a7a9a, 0.8), lx(sbB), 1.5, sbA);
  box(G, 7.2, 2.6, 4.8, mat(0xe8e8e2, 0.8), lx(sbB), 4.3, sbA);
  for(const s of [-1, 1]) box(G, 0.1, 1.6, 4.0, GLASS, lx(sbB + s * 3.62), 4.5, sbA);
  add(G, new THREE.ConeGeometry(5.6, 2.4, 4).rotateY(Math.PI / 4), mat(0x30333a, 0.75), lx(sbB), 6.8, sbA).scale.set(1, 1, 0.72);
  box(G, 7.4, 0.15, 1.2, GREEN, lx(sbB), 3.0, sbA - 3.0);
  // stores huts by the turntable
  building(G, lx(cb + 24), ca + 27, 5, 6, 3.2, 0x5a4434, 0x30333a);
  building(G, lx(cb + 24), ca - 27, 4, 5, 3, 0x8a4a32, 0x30333a);
  // sleepers and crates stacked about
  for(let k = 0; k < 4; k++) box(G, 2.6, 0.5, 1.2, mat(0x7a6048, 0.9), lx(34 + k * 0.2), 0.25 + k * 0.5 * 0, 84 + k * 1.6);
  for(let k = 0; k < 3; k++) box(G, 1.2, 1.2, 1.2, mat(0xa58a5a, 0.9), lx(6 + k * 1.5), 0.6, 92);

  // ---- arcaded retaining wall round the back and ends of the yard
  const wallRun = (a0, b0, a1, b1) => {
    const L = Math.hypot(a1 - a0, b1 - b0), da = (a1 - a0) / L, db = (b1 - b0) / L, rot = yawAB(da, db);
    rbox(1.2, 5.5, L, mat(0xcfc6b2, 0.9), (a0 + a1) / 2, (b0 + b1) / 2, 2.75, rot);
    rbox(1.8, 0.5, L, mat(0xb8af9c, 0.9), (a0 + a1) / 2, (b0 + b1) / 2, 5.6, rot);
    for(let s = 3; s < L - 2; s += 5){
      const a = a0 + da * s, b = b0 + db * s, nb = -da, na = db;      // inset on the yard side
      const off = (a1 > a0 ? -1 : 1) * 0.62;
      rbox(0.1, 3.0, 3.2, mat(0x8a8272, 0.9), a + na * off, b + nb * off, 1.5, rot);
      const c = add(G, new THREE.CircleGeometry(1.6, 12, 0, Math.PI), mat(0x8a8272, 0.9, 0, 'double'), lx(b + nb * off), 3.0, a + na * off); c.rotation.y = rot + Math.PI / 2;
    }
  };
  wallRun(2, 88, 122, 88);
  wallRun(122, 88, 122, 30);
  wallRun(2, 30, 2, 88);

  // the many short road strips bake into one mesh of their own
  const rails = new THREE.Group(); rails.userData.keep = true;
  G.children.filter(o => o.isMesh && o.material === roadMat('standard')).forEach(o => { G.remove(o); rails.add(o); });
  G.add(rails); bakeVC(rails, false); rails.children.forEach(m => m.receiveShadow = true);
  parkAll(units);
  finishSite(D, kit);
  stalls.forEach(st => st.rec = byId[st.id] || null);
  K.roundhouse = {D, kit, ca, cb, R0, R1: BB - cb, bridge, sx, stalls, stallPt};
}
// a point and heading along a Tidmouth stall, s metres out from the turntable centre
function stallPt(st, s, phi){
  if(phi !== undefined && phi !== st.phi || s <= st.rA){
    const p = phi === undefined ? st.phi : phi, da = Math.sin(p), db = Math.cos(p), c = st.pl[0];
    return {a: c.a + da * s, b: c.b + db * s, ta: da, tb: db};
  }
  const pl = st.pl; let i = 1;
  while(i < pl.length - 1 && pl[i].s < s) i++;
  const p = pl[i - 1], q = pl[i], L = q.s - p.s || 1, t = (s - p.s) / L;
  return {a: p.a + (q.a - p.a) * t, b: p.b + (q.b - p.b) * t, ta: (q.a - p.a) / L, tb: (q.b - p.b) / L};
}

// Brendam Docks: a quay with Cranky, Carly and Big Mickey, a ship alongside and a siding.
function buildDocks(D){
  const st = STATIONS.find(s => s.name === D.station);
  let best = null;
  for(let k = 0; k < 48; k++){
    const a = k / 48 * Math.PI * 2;
    for(let r = 20; r < 2500; r += 10){
      const x = st.x + Math.cos(a) * r * M, z = st.z + Math.sin(a) * r * M;
      if(heightAt(x, z) < -0.2 * M){ if(!best || r < best.r) best = {a, r}; break; }
    }
  }
  if(!best) best = {a: 0, r: 60};
  const dir = new THREE.Vector3(Math.cos(best.a), 0, Math.sin(best.a)), perp = new THREE.Vector3(-dir.z, 0, dir.x);
  const quay = new THREE.Vector3(st.x, 0, st.z).addScaledVector(dir, (best.r - 6) * M);
  const base = Math.max(1.2 * M, heightAt(quay.x - dir.x * 10 * M, quay.z - dir.z * 10 * M)) + 0.3 * M;
  const G = new THREE.Group(); G.position.set(quay.x, base, quay.z); G.rotation.y = Math.atan2(dir.x, dir.z); G.scale.setScalar(M);
  // local +z points out to sea, local x along the quay
  box(G, 150, base / M + 3, 30, mat(0x8a857a, 0.9), 0, -(base / M + 3) / 2 + 0.02, -10);
  box(G, 150, 0.6, 0.6, mat(0x3a3a3a, 0.7), 0, 0.3, 4.7);
  const kitLike = {G, sx: 1, lx: b => b};
  const roadAt = (x0, z0, x1, z1) => {
    const len = Math.hypot(x1 - x0, z1 - z0), g = new THREE.PlaneGeometry(3.6, len); g.rotateX(-Math.PI / 2);
    const uv = g.attributes.uv; for(let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * len / 0.75);
    const m = new THREE.Mesh(g, roadMat('standard')); m.position.set((x0 + x1) / 2, 0.05, (z0 + z1) / 2); m.rotation.y = Math.atan2(x1 - x0, z1 - z0); m.receiveShadow = true; G.add(m);
  };
  roadAt(-70, -6, 70, -6);
  roadAt(-70, -12, 70, -12);
  const units = D.roads.map(ids => vehiclesFor(ids, D));
  let x = -40;
  const yawRow = G.rotation.y + Math.PI / 2;
  const toWorld = new THREE.Matrix4().compose(G.position, new THREE.Quaternion().setFromEuler(G.rotation), new THREE.Vector3(M, M, M));
  units.flat(2).forEach(v => {
    x += v.len / 2;
    const p = new THREE.Vector3(x, 0, -12).applyMatrix4(toWorld);
    v.group.position.copy(p); v.group.rotation.set(0, yawRow, 0);
    x += v.len / 2 + 0.15;
  });
  parkAll(units);
  D.roads.forEach((ids, i) => K.yards.push({D, label: D.label, rail: 'nwr', units: units[i], ids, at: (s, out) => out.set(s, 0, -12).applyMatrix4(toWorld),
    yaw: yawRow, face: 1, sMin: -69, sMax: 69, shed: 0, origin: -40}));
  for(let k = 0; k < 3; k++) building(G, -50 + k * 30, -24, 20, 14, 9, [0x9a958c, 0x8a5a3e, 0xa39c8e][k], 0x4a4f58, Math.PI / 2);
  const cranky = portalCrane({color: 0x6b7a2a, counter: 0x8a8d91, legH: 8, span: 7, jib: 22, jibUp: 0.75, face: {smile: -0.3, brow: 0.8, thick: true}, name: 'CRANKY', nameStyle: {fg: '#9be04a', line: '#2a3a10', font: 'bold 92px Arial'}, animate: true});
  cranky.position.set(-15, 0, 0.5); G.add(cranky); nonRail('cranky', G, cranky); window.SODOR_CRANES.push(cranky);
  const carly = portalCrane({color: 0xf2d21a, rail: 0x2ab0b0, counter: 0x8a8d91, legH: 9, span: 7, tower: 6, jib: 20, jibUp: 0.6, knuckle: true, stripes: true, face: {smile: 0.85, lashes: true, look: 0.3}, name: 'CARLY', nameStyle: {fg: '#1a9a9a', line: null, font: 'bold 92px Arial'}, animate: true});
  carly.position.set(18, 0, 0.5); G.add(carly); nonRail('carly', G, carly); window.SODOR_CRANES.push(carly);
  const mickey = bigMickeyModel(); mickey.position.set(50, 0, -2); G.add(mickey); nonRail('bigmickey', G, mickey);
  const ship = new THREE.Group(); ship.position.set(5, -base / M, 22); G.add(ship);
  const hull = new THREE.Shape(); hull.moveTo(-40, -6); hull.lineTo(30, -6); hull.lineTo(42, 0); hull.lineTo(30, 6); hull.lineTo(-40, 6); hull.closePath();
  const hg = new THREE.ExtrudeGeometry(hull, {depth: 7, bevelEnabled: false}); hg.rotateX(-Math.PI / 2); hg.translate(0, -2, 0);
  add(ship, hg, mat(0x2a3a5a, 0.6));
  box(ship, 82, 0.4, 11.8, mat(0x8a2a1e, 0.7), -4, 5.2, 0);
  box(ship, 12, 7, 10, mat(0xeeeeee, 0.6), -32, 8.5, 0);
  cylY(ship, 1.2, 1.4, 5, mat(0xc8201e, 0.6), -34, 14, 0, 14);
  for(let k = 0; k < 4; k++) box(ship, 6, 2.6, 2.4, mat([0x2a6aa0, 0xc8601e, 0x3a8a4a, 0xb0302a][k], 0.6), -12 + k * 8, 6.6, (k % 2 ? 2 : -2));
  bakeSite(G);
  depotGroup.add(G);
  K.clearArea(quay.x, quay.z, 80 * M);
  D.center = quay.clone().setY(base);
  D.labelSprite = label(D.label, D.center.clone().setY(base + 40 * M));
}
// Victor works the narrow-gauge side of the Steamworks, so he is built with the narrow-gauge kit.
function buildVictor(kit, b, a){
  const v = K.buildSteam({len: 2.4, color: 0xb3201c, lining: 0xf2c419, tank: 'saddle', cab: 'closed', chimneyH: 0.5, capColor: BRASS, dome: true, domeAt: 0.5, bunkerLen: 0.3,
    face: {smile: 0.7, brow: 0.1, mustache: true}, plates: {name: 'VICTOR', number: '1173', bg: '#b3201c', fg: '#f2c419', border: '#d4af37', nameW: 0.5},
    axles: [{z: 0.5, r: 0.26, coupled: true}, {z: -0.45, r: 0.26, coupled: true}]});
  v.group.scale.setScalar(K.NG); scene.add(v.group);
  kit.road(a - 8, b, a + 8, b, 'narrow');
  const p = kit.pt(a, b); v.group.position.copy(p); v.group.rotation.y = kit.yaw;
  const rec = {id: 'victor', name: 'Victor', no: '1173', cat: 'Steam', wheels: '0-4-0ST (narrow gauge)', basis: 'Minaz No. 1173, a Cuban sugar-mill saddle tank',
    livery: 'red with yellow lining (he was bright yellow with green lining in Cuba)', dot: 0xb3201c,
    about: 'the narrow-gauge engine from Cuba who runs the Sodor Steamworks with Kevin.', veh: v, home: DEPOTS.find(d => d.key === 'steamworks')};
  FLEET.push(rec); byId.victor = rec;
  K.tagPick(v.group, () => pickHandler(rec));
  allNWR.push({v, parked: true});
}
function regModel(){
  const g = new THREE.Group(), YEL = mat(0xf2c419, 0.45), BLK = mat(BLACK, 0.7);
  box(g, 2.6, 0.5, 6.4, YEL, 0, 1.2, 0);
  for(const e of [1, -1]){ box(g, 2.6, 0.35, 0.12, mat(0x7a1a1a, 0.5), 0, 1.0, e * 3.2); buffers(g, e * 3.2, e); }
  for(const z of [2.0, -2.0]) for(const s of [-1, 1]) cylX(g, 0.45, 0.45, 0.14, mat(0x3d3f42, 0.4, 0.5), s * HG, 0.45, z, 18);
  cylY(g, 1.1, 1.1, 0.3, BLK, 0, 1.6, -0.6, 20);
  box(g, 2.4, 2.4, 3.0, YEL, 0, 3.0, -0.9);
  roof(g, 2.5, 3.2, 4.35, YEL, -0.9);
  hazard(g, 2.9, 0.3, 1.21, 2.0, -0.9).rotation.y = Math.PI / 2;
  hazard(g, 2.9, 0.3, -1.21, 2.0, -0.9).rotation.y = -Math.PI / 2;
  faceOn(g, 0.55, {smile: 0.3, brow: 0.4}, 0, 2.6, 0.62);
  letter(g, 'REG', 'black', 0.4, 1.2, 3.4, -0.9);
  const jib = box(g, 0.35, 0.45, 7, YEL, 0, 5.2, 2.4); jib.rotation.x = -0.55;
  cylY(g, 0.03, 0.03, 2.2, BLK, 0, 6.2, 5.4, 4);
  for(let k = 0; k < 4; k++){ const t = box(g, 0.12, 0.9, 0.12, mat(0x3a3c40, 0.5, 0.6), Math.cos(k * 1.57) * 0.35, 4.6, 5.4 + Math.sin(k * 1.57) * 0.35); t.rotation.z = Math.cos(k * 1.57) * 0.3; }
  bakeVC(g);
  return g;
}
const NONRAIL = {};
function nonRail(id, G, obj){
  const info = NONRAIL_INFO.find(i => i.id === id);
  NONRAIL[id] = {info, obj, G};
  obj.userData.keep = true;
  obj.traverse(o => { if(o.isMesh){ o.userData.onPick = () => pickHandler({nonRail: id}); clickable.push(o); } });
}

DEPOTS.forEach(D => {
  if(D.engines) D.engines = D.engines.filter(id => !RELIEF.has(id));
  if(D.roads) D.roads = D.roads.map(r => r.filter(id => !RELIEF.has(id))).filter(r => r.length);
  try { buildDepot(D); } catch(e){ console.warn('depot', D.key, e); }
});

// ------------------------------------------------------------------ panel and roster
const CAT_LABEL = {Steam: 'Steam engine', Diesel: 'Diesel engine', Other: 'Engine', Former: 'Former engine'};
function worldPos(obj){ return obj.getWorldPosition(new THREE.Vector3()); }
function status(rec){
  const live = window.SODOR_OPS && rec.veh && window.SODOR_OPS.statusOf(rec.veh.group);
  if(live) return live;
  if(rec.runner){
    const ln = LINES[rec.run.line].name, the = /^The |'s /.test(ln) ? '' : 'the ';
    return `On duty: ${rec.run.job}, on ${the}${ln}${rec.run.from ? ` between ${rec.run.from} and ${rec.run.to}` : ''}.`;
  }
  if(rec.home) return `Now: stabled at ${rec.home.label}.`;
  return '';
}
function engineText(rec){
  const no = rec.no ? ` (No. ${rec.no})` : '';
  return `${rec.name}${no} is ${rec.about} Wheel arrangement ${rec.wheels}; based on ${rec.basis}. Livery: ${rec.livery}. ${status(rec)}`;
}
const STOCK_ALIAS = {clarabel: 'annie', tarTank: 'oilTank', milkTank: 'oilTank', vanRed: 'vanGrey', vanBrown: 'vanGrey', vanFish: 'vanGrey',
  truckB: 'truck', jerome: 'judy', jibRunner: 'crane15', toolVan: 'crane15'};
function fly(obj, dist){ const p = worldPos(obj); flyTo(p.x, p.y, p.z, dist, undefined, 1.1); }
function showEngine(rec){
  const R = rec.runner;
  openPanel(`North Western Railway · ${CAT_LABEL[rec.cat] || 'Engine'}`, rec.name, engineText(rec),
    `${rec.wheels}${rec.no ? ' · No. ' + rec.no : ''}${R ? ' · ' + LINES[rec.run.line].name : rec.home ? ' · ' + rec.home.label : ''}`);
  fly(rec.veh.group, rec.veh.len > 12 ? 0.075 : 0.055);
  if(R || rec.relief || rec.yard){ const b = addPanelButton('Follow engine', () => { followTrain = {mesh: rec.veh.group, dist: rec.veh.len > 12 ? 0.075 : 0.055}; b.classList.add('active'); }); }
}
function showStock(key, veh, ctx){
  const info = STOCK_INFO.find(s => s.key === (STOCK_ALIAS[key] || key));
  const name = STOCK_STD[key].name;
  let where = '';
  if(ctx && ctx.rec) where = `In ${ctx.rec.name}'s train: ${ctx.run.job}.`;
  else if(ctx && ctx.home) where = `Stabled at ${ctx.home.label}.`;
  const desc = info ? `${info.name}: ${info.about.charAt(0).toUpperCase() + info.about.slice(1)} Based on ${info.basis}. Livery: ${info.livery}. ${where}` : `${name}. ${where}`;
  openPanel(`North Western Railway · ${info ? (info.cat === 'Other stock' ? 'Rolling stock' : info.cat + ' stock') : 'Rolling stock'}`, name, desc, ctx && ctx.rec ? LINES[ctx.run.line].name : (ctx && ctx.home ? ctx.home.label : ''));
  if(veh){ fly(veh.group, 0.05); if(ctx && ctx.rec){ const b = addPanelButton('Follow train', () => { followTrain = {mesh: veh.group, dist: 0.06}; b.classList.add('active'); }); } }
}
function showNonRail(id){
  const n = NONRAIL[id]; if(!n) return;
  const i = n.info;
  openPanel('North Western Railway · Crane', i.name, `${i.name} is ${i.about.replace(/^the /, 'the ')} Based on ${i.basis}. Livery: ${i.livery}.`, DEPOTS.find(d => d.key === i.home)?.label || '');
  fly(n.obj, id === 'bigmickey' ? 0.16 : 0.08);
}
pickHandler = (x) => {
  if(x.nonRail) return showNonRail(x.nonRail);
  if(x.stockKey) return showStock(x.stockKey, x.veh, x.ctx);
  return showEngine(x);
};

// Roster: the NWR list with search, beside the Skarloey list.
const nwrList = document.getElementById('nwrList'), search = document.getElementById('rosterSearch');
const rosterRows = [];
function group(title, list = nwrList){ const h = document.createElement('div'); h.className = 'leg-group'; h.textContent = title; list.appendChild(h); rosterRows.push({head: h}); return h; }
function row(name, sub, color, onClick, list = nwrList){
  const d = document.createElement('div'); d.className = 'ros-item';
  d.innerHTML = `<span class="ros-dot" style="background:${hex(color)}"></span><span class="ros-name"></span><span class="ros-sub"></span>`;
  d.querySelector('.ros-name').textContent = name; d.querySelector('.ros-sub').textContent = sub;
  d.onclick = onClick; list.appendChild(d); rosterRows.push({row: d, text: (name + ' ' + sub).toLowerCase()});
}
const shown = rec => rec.veh && (rec.runner || rec.home || rec.relief);
const subOf = r => {
  if(r.runner) return LINES[r.run.line].name.replace(/ (Branch )?Line$/, '');
  if(r.relief){ const d = Object.entries(window.SODOR_DUTIES.nwr).find(([, d]) => (d.rota || []).includes(r.id)); return d ? 'relief for ' + byId[d[0]].name : 'relief'; }
  return r.home ? r.home.label.replace(/ \(.*\)/, '') : '';
};
[['Steam', 'Steam engines'], ['Diesel', 'Diesel engines'], ['Other', 'Other engines'], ['Former', 'Former engines']].forEach(([cat, title]) => {
  const list = FLEET.filter(r => r.cat === cat && shown(r));
  if(!list.length) return;
  group(title);
  list.forEach(r => row(r.name, subOf(r), r.dot, () => showEngine(r)));
});
[['Passenger', 'Passenger coaches'], ['Goods', 'Goods wagons'], ['Other stock', 'Breakdown and other stock']].forEach(([cat, title]) => {
  const list = STOCK_INFO.filter(s => s.cat === cat && stockSeen[s.key]);
  if(!list.length) return;
  group(title);
  list.forEach(s => {
    const v = stockSeen[s.key];
    row(s.name, '', s.dot, () => { const owner = FLEET.find(r => r.runner && r.run.consist.includes(s.key)); const home = DEPOTS.find(d => (d.roads || []).flat().includes(s.key) || (d.stock || []).flat().includes(s.key)); showStock(s.key, v, owner ? {rec: owner, run: owner.run} : {home}); });
  });
});
group('Cranes (not on rails)');
NONRAIL_INFO.forEach(i => { if(NONRAIL[i.id]) row(i.name, (DEPOTS.find(d => d.key === i.home) || {}).label || '', i.dot, () => showNonRail(i.id)); });

search.addEventListener('input', () => {
  const q = search.value.trim().toLowerCase();
  let head = null, any = false;
  const flush = () => { if(head) head.classList.toggle('hide', !any); };
  rosterRows.forEach(r => {
    if(r.head){ flush(); head = r.head; any = false; return; }
    const hit = !q || r.text.includes(q); r.row.classList.toggle('hide', !hit); if(hit) any = true;
  });
  flush();
});
document.querySelectorAll('#rosterTabs button').forEach(b => b.onclick = () => {
  document.querySelectorAll('#rosterTabs button').forEach(x => {
    x.classList.toggle('on', x === b);
    document.getElementById(x.dataset.tab).style.display = x === b ? '' : 'none';
  });
  search.style.display = b.dataset.tab === 'rosterList' || b.dataset.tab === 'dutyList' ? 'none' : '';      // the Skarloey list and the duties board are short; the others search
  if(b.dataset.tab === 'dutyList' && window.SODOR_OPS) window.SODOR_OPS.updateBoard();
});
const stat = document.getElementById('statTrains');
stat.textContent = (parseInt(stat.textContent, 10) || 0) + NWR_RUNNERS.length;

// ------------------------------------------------------------------ level of detail
// Vehicles further than ~700 m away are smaller than a pixel: hide them; hide wheels and rods
// beyond ~240 m. Depot buildings only show when zoomed in.
const FAR = 1.35, WHEELS = 0.45;
// the Skarloey Railway's stock parked in its yards gets the same treatment
const runGroups = new Set();
K.RUNNERS.forEach(R => { R.unit.forEach(m => runGroups.add(m.v.group)); R.cars.forEach(c => runGroups.add(c.v.group)); });
const srParked = scene.children.filter(c => c.userData.stockKey && !runGroups.has(c));
function cullRunning(v, cp){
  const g = v.group; if(!g.visible) return;
  const d = cp.distanceTo(g.position);
  if(d > FAR) g.visible = false; else lod(v, d < WHEELS);
}
function lod(v, near){
  if(v._lod === near) return;
  v._lod = near;
  v.axles.forEach(a => a.g.visible = near);
  (v.rods || []).forEach(r => r.mesh.visible = near);
}
frameHooks.push(() => {
  const cp = camera.position;
  K.RUNNERS.forEach(R => {                                              // every railway's trains
    R.unit.forEach(m => cullRunning(m.v, cp)); R.cars.forEach(c => cullRunning(c.v, cp));
    if(R.marker) R.marker.position.y *= VK;                              // dots sit on the stretched overview relief
  });
  const showDepots = camDist < 5;
  depotGroup.visible = showDepots;
  allNWR.forEach(e => {
    if(!e.parked) return;
    const g = e.v.group, d = cp.distanceTo(g.position);
    g.visible = showDepots && d < FAR;
    if(g.visible) lod(e.v, d < WHEELS);
  });
  srParked.forEach(g => { g.visible = cp.distanceTo(g.position) < FAR; });
  depotLabels.forEach(s => { s.visible = camDist < 4 && camDist > 0.12 && cp.distanceTo(s.position) < 3.2; });
});

window.SODOR_NWR = {FLEET, RUNS, DEPOTS, NWR_RUNNERS, STOCK_STD, byId, show: x => pickHandler(x), RELIEF};
// The standard-gauge kit, depot builders and roster, shared with cfr.js.
window.SODOR_STD = {bakeVC, faceMat, faceOn, letter, nameplate, lining, hazard, wheelS, rodsS, addWheels, finish, chimneyS, halfDrumX, gable, lamp, buffers,
  findSite, siteKit, shedOver, building, heap, label, bakeSite, depotGroup, depotLabels, allNWR, taken, roadMat, frameOnLine, rosterGroup: group, rosterRow: row, STYLES, rrect,
  portalCrane, latticeBox, lattice, NONRAIL};
console.log(`NWR fleet: ${FLEET.length} engines, ${NWR_RUNNERS.length} running, built in ${Math.round(performance.now() - t0)} ms`);
})();
