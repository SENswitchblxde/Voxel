// Chunked voxel world: generation, storage, edits, meshing.
import * as THREE from 'three';
import { B, BLOCKS } from './data.js';
import { Perlin, hash3 } from './noise.js';
import { ATLAS_COLS, ATLAS_ROWS } from './textures.js';

export const CS = 16, CH = 64, SEA = 24;
const idx = (x, y, z) => x + (z << 4) + (y << 8);
const key = (cx, cz) => cx + ',' + cz;

// Face table: normal, 4 corners (CCW from outside), uvs.
const SIDE_UV = [[1, 0], [1, 1], [0, 1], [0, 0]];
const FACES = [
  { n: [1, 0, 0], c: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]], uv: SIDE_UV, shade: 0.8, t: 2 },
  { n: [-1, 0, 0], c: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]], uv: SIDE_UV, shade: 0.8, t: 2 },
  { n: [0, 1, 0], c: [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]], uv: [[0, 0], [0, 1], [1, 1], [1, 0]], shade: 1.0, t: 0 },
  { n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], uv: [[0, 0], [1, 0], [1, 1], [0, 1]], shade: 0.5, t: 1 },
  { n: [0, 0, 1], c: [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]], uv: SIDE_UV, shade: 0.65, t: 2 },
  { n: [0, 0, -1], c: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]], uv: SIDE_UV, shade: 0.65, t: 2 },
];
const AO_LEVEL = [0.45, 0.62, 0.8, 1.0];
const OPAQUE = new Uint8Array(256), SOLID = new Uint8Array(256), CULLSAME = new Uint8Array(256);
for (const b of BLOCKS) if (b) { OPAQUE[b.id] = b.opaque ? 1 : 0; SOLID[b.id] = b.solid ? 1 : 0; CULLSAME[b.id] = b.cull ? 1 : 0; }

// Shared lighting uniforms: daylight level, minimum light, player lantern position.
export const LIGHT = { uDay: { value: 1 }, uMin: { value: 0.3 }, uPlayer: { value: new THREE.Vector3() } };
function lightMaterial(opts) {
  const m = new THREE.MeshBasicMaterial(opts);
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, LIGHT);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWP;')
      .replace('#include <fog_vertex>', '#include <fog_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uDay; uniform float uMin; uniform vec3 uPlayer; varying vec3 vWP;')
      .replace('#include <color_fragment>', `
        float lant = clamp(1.0 - distance(vWP, uPlayer) / 8.0, 0.0, 1.0) * 0.8;
        float lit = max(max(vColor.g * uDay, uMin), lant);
        diffuseColor.rgb *= vColor.r * lit;`);
  };
  return m;
}

class Chunk {
  constructor(cx, cz) {
    this.cx = cx; this.cz = cz;
    this.data = new Uint8Array(CS * CS * CH);
    this.hm = new Uint8Array(CS * CS);
    this.mesh = null; this.water = null;
    this.dirty = true;
  }
}

export class World {
  constructor(seed, scene, atlasTexture) {
    this.seed = seed >>> 0;
    this.scene = scene;
    this.chunks = new Map();
    this.edits = new Map(); // chunkKey -> Map(localIndex -> blockId)
    this.p1 = new Perlin(this.seed);
    this.p2 = new Perlin(this.seed + 101);
    this.p3 = new Perlin(this.seed + 202);
    this.p4 = new Perlin(this.seed + 303);
    this.p5 = new Perlin(this.seed + 404);
    this.renderDist = 5;
    this.mat = lightMaterial({ map: atlasTexture, vertexColors: true, alphaTest: 0.5 });
    this.waterMat = lightMaterial({ map: atlasTexture, vertexColors: true, transparent: true, opacity: 0.78, depthWrite: false, side: THREE.DoubleSide });
  }

  // ---------- terrain ----------
  heightAt(x, z) {
    const c = this.p1.fbm2(x * 0.0035, z * 0.0035, 4);
    const m = this.p2.fbm2(x * 0.007 + 100, z * 0.007 - 50, 3);
    const d = this.p1.fbm2(x * 0.03 + 50, z * 0.03 + 50, 2);
    let h = 27 + c * 26 + Math.max(0, m - 0.05) * 70 + d * 3;
    return Math.max(6, Math.min(CH - 6, Math.floor(h)));
  }

  treeAt(x, z) {
    const forest = this.p3.fbm2(x * 0.012, z * 0.012, 2);
    const dens = 0.006 + Math.max(0, forest + 0.05) * 0.09;
    return hash3(x, 7, z, this.seed) < dens;
  }

  generate(ch) {
    const { data } = ch;
    const bx = ch.cx * CS, bz = ch.cz * CS;
    const p3 = this.p3, p4 = this.p4, p5 = this.p5, seed = this.seed;
    for (let lx = 0; lx < CS; lx++) for (let lz = 0; lz < CS; lz++) {
      const x = bx + lx, z = bz + lz;
      const h = this.heightAt(x, z);
      const beach = h <= SEA + 1;
      const snowy = h > 47;
      const top = beach ? B.SAND : snowy ? B.SNOW : B.GRASS;
      const filler = beach ? B.SAND : B.DIRT;
      const maxY = Math.max(h, SEA);
      for (let y = 0; y <= maxY; y++) {
        let b;
        if (y === 0 || (y <= 2 && hash3(x, y, z, seed) < 0.5)) b = B.BEDROCK;
        else if (y <= h) {
          const depth = h - y;
          b = depth === 0 ? top : depth < 4 ? filler : (y < 12 ? B.DEEPSTONE : B.STONE);
          // caves
          const caveTop = beach ? h - 5 : h;
          if (y > 2 && y <= caveTop) {
            const n1 = p3.noise3(x * 0.045, y * 0.08, z * 0.045);
            const n2 = p4.noise3(x * 0.045, y * 0.08, z * 0.045);
            let cave = n1 * n1 + n2 * n2 < (y > h - 4 ? 0.004 : 0.009);
            if (!cave && y < 32 && y < h - 6) cave = p5.noise3(x * 0.022, y * 0.05, z * 0.022) > 0.42;
            if (cave) b = B.AIR;
          }
          if (b === B.STONE || b === B.DEEPSTONE) {
            const f = 0.19;
            if (y < 9 && b === B.DEEPSTONE && p5.noise3(x * f + 800, y * f, z * f) > 0.69) b = B.CORE_ORE;
            else if (y < 15 && p5.noise3(x * f + 600, y * f, z * f) > 0.68) b = B.CRYSTAL_ORE;
            else if (y < 22 && p5.noise3(x * f + 400, y * f, z * f) > 0.65) b = B.GOLD_ORE;
            else if (y < 40 && p5.noise3(x * f + 200, y * f, z * f) > 0.6) b = B.IRON_ORE;
            else if (y < 56 && p5.noise3(x * f, y * f, z * f + 77) > 0.56) b = B.COAL_ORE;
          }
        } else b = B.WATER;
        data[idx(lx, y, lz)] = b;
      }
    }
    // trees (scan a margin so canopies cross chunk borders)
    for (let x = bx - 3; x < bx + CS + 3; x++) for (let z = bz - 3; z < bz + CS + 3; z++) {
      if (!this.treeAt(x, z)) continue;
      const h = this.heightAt(x, z);
      if (h <= SEA + 1 || h > 46) continue;
      const lx0 = x - bx, lz0 = z - bz;
      if (lx0 >= 0 && lx0 < CS && lz0 >= 0 && lz0 < CS && data[idx(lx0, h, lz0)] !== B.GRASS) continue;
      const th = 4 + Math.floor(hash3(x, 3, z, seed) * 3);
      const topY = h + th;
      for (let dy = -2; dy <= 1; dy++) {
        const r = dy >= 0 ? 1 : 2;
        for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
          if (Math.abs(dx) === r && Math.abs(dz) === r && (dy === 1 || hash3(x + dx, topY + dy, z + dz, seed) < 0.5)) continue;
          const lx = lx0 + dx, lz = lz0 + dz, y = topY + dy;
          if (lx < 0 || lx >= CS || lz < 0 || lz >= CS || y >= CH) continue;
          if (data[idx(lx, y, lz)] === B.AIR) data[idx(lx, y, lz)] = B.LEAVES;
        }
      }
      if (lx0 >= 0 && lx0 < CS && lz0 >= 0 && lz0 < CS) {
        for (let y = h + 1; y <= topY && y < CH; y++) data[idx(lx0, y, lz0)] = B.LOG;
        data[idx(lx0, h, lz0)] = B.DIRT;
      }
    }
    const ed = this.edits.get(key(ch.cx, ch.cz));
    if (ed) for (const [i, b] of ed) data[i] = b;
    for (let lx = 0; lx < CS; lx++) for (let lz = 0; lz < CS; lz++) this.recalcHM(ch, lx, lz);
  }

  recalcHM(ch, lx, lz) {
    let y = CH - 1;
    while (y > 0 && !OPAQUE[ch.data[idx(lx, y, lz)]]) y--;
    ch.hm[lx + lz * CS] = y;
  }

  // ---------- access ----------
  getChunk(cx, cz) { return this.chunks.get(key(cx, cz)); }

  getBlock(x, y, z) {
    if (y < 0) return B.BEDROCK;
    if (y >= CH) return B.AIR;
    const ch = this.chunks.get(key(x >> 4, z >> 4));
    if (!ch) return -1; // not loaded
    return ch.data[idx(x & 15, y, z & 15)];
  }

  topAt(x, z) {
    const ch = this.chunks.get(key(x >> 4, z >> 4));
    return ch ? ch.hm[(x & 15) + (z & 15) * CS] : 0;
  }

  setBlock(x, y, z, b) {
    if (y < 0 || y >= CH) return false;
    const cx = x >> 4, cz = z >> 4;
    const ch = this.chunks.get(key(cx, cz));
    if (!ch) return false;
    const lx = x & 15, lz = z & 15, i = idx(lx, y, lz);
    ch.data[i] = b;
    const k = key(cx, cz);
    if (!this.edits.has(k)) this.edits.set(k, new Map());
    this.edits.get(k).set(i, b);
    this.recalcHM(ch, lx, lz);
    ch.dirty = true;
    const mark = (ax, az) => { const n = this.chunks.get(key(ax, az)); if (n) n.dirty = true; };
    if (lx === 0) mark(cx - 1, cz); if (lx === 15) mark(cx + 1, cz);
    if (lz === 0) mark(cx, cz - 1); if (lz === 15) mark(cx, cz + 1);
    if (lx === 0 && lz === 0) mark(cx - 1, cz - 1);
    if (lx === 15 && lz === 15) mark(cx + 1, cz + 1);
    if (lx === 0 && lz === 15) mark(cx - 1, cz + 1);
    if (lx === 15 && lz === 0) mark(cx + 1, cz - 1);
    return true;
  }

  isSolid(x, y, z) {
    const b = this.getBlock(x, y, z);
    return b < 0 ? true : SOLID[b] === 1;
  }

  // ---------- meshing ----------
  buildMesh(ch) {
    const bx = ch.cx * CS, bz = ch.cz * CS;
    const nb = [];
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) nb.push(this.chunks.get(key(ch.cx + dx, ch.cz + dz)));
    const get = (lx, y, lz) => {
      if (y < 0) return B.BEDROCK;
      if (y >= CH) return B.AIR;
      const ox = lx < 0 ? -1 : lx >= CS ? 1 : 0, oz = lz < 0 ? -1 : lz >= CS ? 1 : 0;
      const c = nb[(ox + 1) * 3 + (oz + 1)];
      if (!c) return B.STONE;
      return c.data[idx(lx - ox * CS, y, lz - oz * CS)];
    };
    const hmAt = (lx, lz) => {
      const ox = lx < 0 ? -1 : lx >= CS ? 1 : 0, oz = lz < 0 ? -1 : lz >= CS ? 1 : 0;
      const c = nb[(ox + 1) * 3 + (oz + 1)];
      return c ? c.hm[(lx - ox * CS) + (lz - oz * CS) * CS] : 0;
    };
    const tw = 1 / ATLAS_COLS, th = 1 / ATLAS_ROWS, e = 0.0008;
    const O = { pos: [], uv: [], col: [], ind: [] }, W = { pos: [], uv: [], col: [], ind: [] };
    const data = ch.data;
    for (let y = 0; y < CH; y++) for (let lz = 0; lz < CS; lz++) for (let lx = 0; lx < CS; lx++) {
      const b = data[idx(lx, y, lz)];
      if (b === B.AIR) continue;
      const def = BLOCKS[b];
      const isWater = b === B.WATER;
      const out = isWater ? W : O;
      for (let f = 0; f < 6; f++) {
        const F = FACES[f];
        const ax = lx + F.n[0], ay = y + F.n[1], az = lz + F.n[2];
        const n = get(ax, ay, az);
        if (OPAQUE[n]) continue;
        if (n === b && CULLSAME[b]) continue;
        if (isWater && n !== B.AIR) continue;
        const tile = def.tex[F.t];
        const u0 = (tile % ATLAS_COLS) * tw + e, v0 = 1 - (Math.floor(tile / ATLAS_COLS) + 1) * th + e;
        const uS = tw - 2 * e, vS = th - 2 * e;
        // sky light
        const top = hmAt(ax, az);
        const sky = ay > top ? 1 : Math.max(0.28, 1 - (top - ay + 1) * 0.11);
        const base = out.pos.length / 3;
        const ao = [0, 0, 0, 0];
        for (let k = 0; k < 4; k++) {
          const c = F.c[k];
          let a = 3;
          if (!isWater) {
            // tangent axes
            const t = [];
            for (let ax2 = 0; ax2 < 3; ax2++) if (F.n[ax2] === 0) t.push(ax2);
            const s1 = [0, 0, 0], s2 = [0, 0, 0];
            s1[t[0]] = c[t[0]] ? 1 : -1; s2[t[1]] = c[t[1]] ? 1 : -1;
            const o1 = OPAQUE[get(ax + s1[0], ay + s1[1], az + s1[2])];
            const o2 = OPAQUE[get(ax + s2[0], ay + s2[1], az + s2[2])];
            const oc = OPAQUE[get(ax + s1[0] + s2[0], ay + s1[1] + s2[1], az + s1[2] + s2[2])];
            a = (o1 && o2) ? 0 : 3 - (o1 + o2 + oc);
          }
          ao[k] = a;
          let py = y + c[1];
          if (isWater && c[1] === 1 && get(lx, y + 1, lz) !== B.WATER) py -= 0.12;
          out.pos.push(bx + lx + c[0], py, bz + lz + c[2]);
          out.uv.push(u0 + F.uv[k][0] * uS, v0 + F.uv[k][1] * vS);
          // r = geometric light (face shade * AO), g = sky exposure. Combined with daylight in the shader.
          out.col.push(F.shade * AO_LEVEL[a], sky, 0);
        }
        if (ao[0] + ao[2] < ao[1] + ao[3]) out.ind.push(base + 1, base + 2, base + 3, base + 1, base + 3, base);
        else out.ind.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
    }
    const mk = (A, mat, old) => {
      if (old) { this.scene.remove(old); old.geometry.dispose(); }
      if (!A.ind.length) return null;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(A.pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(A.uv, 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(A.col, 3));
      g.setIndex(A.ind);
      g.computeBoundingSphere();
      const m = new THREE.Mesh(g, mat);
      m.matrixAutoUpdate = false;
      this.scene.add(m);
      return m;
    };
    ch.mesh = mk(O, this.mat, ch.mesh);
    ch.water = mk(W, this.waterMat, ch.water);
    if (ch.water) ch.water.renderOrder = 1;
    ch.dirty = false;
  }

  // ---------- streaming ----------
  update(px, pz, budget = 2) {
    const pcx = Math.floor(px) >> 4, pcz = Math.floor(pz) >> 4;
    const R = this.renderDist;
    let gen = budget, mesh = budget + 1;
    // nearest-first spiral by distance
    if (!this._order || this._orderR !== R) {
      this._orderR = R;
      this._order = [];
      for (let dx = -R - 1; dx <= R + 1; dx++) for (let dz = -R - 1; dz <= R + 1; dz++) this._order.push([dx, dz, dx * dx + dz * dz]);
      this._order.sort((a, b) => a[2] - b[2]);
    }
    for (const [dx, dz] of this._order) {
      const cx = pcx + dx, cz = pcz + dz;
      const k = key(cx, cz);
      let ch = this.chunks.get(k);
      if (!ch) {
        if (gen <= 0) continue;
        ch = new Chunk(cx, cz);
        this.generate(ch);
        this.chunks.set(k, ch);
        gen--;
        // neighbors need a remesh for border faces
        for (const [ox, oz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const n = this.chunks.get(key(cx + ox, cz + oz)); if (n) n.dirty = true; }
      }
    }
    for (const [dx, dz] of this._order) {
      if (Math.abs(dx) > R || Math.abs(dz) > R) continue;
      const ch = this.chunks.get(key(pcx + dx, pcz + dz));
      if (!ch || !ch.dirty) continue;
      let ok = true;
      for (const [ox, oz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!this.chunks.has(key(ch.cx + ox, ch.cz + oz))) ok = false;
      if (!ok) continue;
      // edits near the player remesh immediately regardless of budget
      if (mesh <= 0 && (Math.abs(dx) > 1 || Math.abs(dz) > 1)) continue;
      this.buildMesh(ch);
      mesh--;
    }
    // unload far chunks
    for (const [k, ch] of this.chunks) {
      if (Math.abs(ch.cx - pcx) > R + 3 || Math.abs(ch.cz - pcz) > R + 3) {
        for (const m of [ch.mesh, ch.water]) if (m) { this.scene.remove(m); m.geometry.dispose(); }
        this.chunks.delete(k);
      }
    }
  }

  isReadyAround(x, z) {
    const cx = Math.floor(x) >> 4, cz = Math.floor(z) >> 4;
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const c = this.chunks.get(key(cx + dx, cz + dz));
      if (!c || c.dirty) return false;
    }
    return true;
  }

  serializeEdits() {
    const o = {};
    for (const [k, m] of this.edits) o[k] = [...m];
    return o;
  }
  loadEdits(o) {
    this.edits.clear();
    for (const k in o) this.edits.set(k, new Map(o[k]));
  }

  dispose() {
    for (const ch of this.chunks.values()) for (const m of [ch.mesh, ch.water]) if (m) { this.scene.remove(m); m.geometry.dispose(); }
    this.chunks.clear();
  }
}

export { OPAQUE, SOLID };
