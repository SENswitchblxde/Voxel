// AABB-vs-voxel movement, voxel raycast, ray-vs-box.
import { B } from './data.js';

const GRAVITY = 30;

// e: { pos: {x,y,z} (feet center), vel, w, h, onGround, inWater, hitWall }
export function moveEntity(world, e, dt) {
  const head = world.getBlock(Math.floor(e.pos.x), Math.floor(e.pos.y + e.h * 0.4), Math.floor(e.pos.z));
  e.inWater = head === B.WATER;
  if (e.inWater) {
    e.vel.y -= GRAVITY * 0.25 * dt;
    e.vel.y = Math.max(e.vel.y, -3);
    const drag = Math.pow(0.15, dt);
    e.vel.x *= drag; e.vel.z *= drag;
  } else {
    e.vel.y -= GRAVITY * dt;
    e.vel.y = Math.max(e.vel.y, -45);
  }
  e.hitWall = false;
  const wasGround = e.onGround;
  e.onGround = false;
  const maxd = Math.max(Math.abs(e.vel.x), Math.abs(e.vel.y), Math.abs(e.vel.z)) * dt;
  const steps = Math.max(1, Math.ceil(maxd / 0.35));
  const sdt = dt / steps;
  for (let i = 0; i < steps; i++) {
    moveAxis(world, e, 'x', e.vel.x * sdt);
    moveAxis(world, e, 'z', e.vel.z * sdt);
    moveAxis(world, e, 'y', e.vel.y * sdt);
  }
  e.justLanded = !wasGround && e.onGround;
}

function moveAxis(world, e, a, d) {
  if (d === 0) return;
  e.pos[a] += d;
  const hw = e.w / 2;
  const x0 = Math.floor(e.pos.x - hw), x1 = Math.floor(e.pos.x + hw - 1e-6);
  const y0 = Math.floor(e.pos.y), y1 = Math.floor(e.pos.y + e.h - 1e-6);
  const z0 = Math.floor(e.pos.z - hw), z1 = Math.floor(e.pos.z + hw - 1e-6);
  let hit = false, best = d > 0 ? Infinity : -Infinity;
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) {
    if (!world.isSolid(x, y, z)) continue;
    hit = true;
    const c = a === 'x' ? x : a === 'y' ? y : z;
    if (d > 0) best = Math.min(best, c); else best = Math.max(best, c);
  }
  if (!hit) return;
  const eps = 1e-4;
  if (a === 'y') {
    if (d < 0) { e.pos.y = best + 1; e.onGround = true; }
    else e.pos.y = best - e.h - eps;
    e.vel.y = 0;
  } else {
    e.pos[a] = d > 0 ? best - hw - eps : best + 1 + hw + eps;
    e.vel[a] = 0;
    e.hitWall = true;
  }
}

export function entityOverlapsBlock(e, x, y, z) {
  const hw = e.w / 2;
  return e.pos.x + hw > x && e.pos.x - hw < x + 1 && e.pos.y + e.h > y && e.pos.y < y + 1 && e.pos.z + hw > z && e.pos.z - hw < z + 1;
}

// Amanatides & Woo voxel traversal. Returns {x,y,z,b,nx,ny,nz,t} or null.
export function raycast(world, o, d, maxD) {
  let x = Math.floor(o.x), y = Math.floor(o.y), z = Math.floor(o.z);
  const sx = Math.sign(d.x), sy = Math.sign(d.y), sz = Math.sign(d.z);
  const tdx = d.x ? Math.abs(1 / d.x) : Infinity, tdy = d.y ? Math.abs(1 / d.y) : Infinity, tdz = d.z ? Math.abs(1 / d.z) : Infinity;
  let tmx = d.x ? (sx > 0 ? x + 1 - o.x : o.x - x) * tdx : Infinity;
  let tmy = d.y ? (sy > 0 ? y + 1 - o.y : o.y - y) * tdy : Infinity;
  let tmz = d.z ? (sz > 0 ? z + 1 - o.z : o.z - z) * tdz : Infinity;
  let nx = 0, ny = 0, nz = 0, t = 0;
  while (t <= maxD) {
    const b = world.getBlock(x, y, z);
    if (b > 0 && b !== B.WATER) return { x, y, z, b, nx, ny, nz, t };
    if (tmx < tmy && tmx < tmz) { x += sx; t = tmx; tmx += tdx; nx = -sx; ny = 0; nz = 0; }
    else if (tmy < tmz) { y += sy; t = tmy; tmy += tdy; nx = 0; ny = -sy; nz = 0; }
    else { z += sz; t = tmz; tmz += tdz; nx = 0; ny = 0; nz = -sz; }
  }
  return null;
}

// Ray vs entity AABB, returns distance or -1
export function rayBox(o, d, e) {
  const hw = e.w / 2;
  const mn = [e.pos.x - hw, e.pos.y, e.pos.z - hw], mx = [e.pos.x + hw, e.pos.y + e.h, e.pos.z + hw];
  const oo = [o.x, o.y, o.z], dd = [d.x, d.y, d.z];
  let t0 = 0, t1 = Infinity;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(dd[i]) < 1e-9) { if (oo[i] < mn[i] || oo[i] > mx[i]) return -1; continue; }
    let a = (mn[i] - oo[i]) / dd[i], b = (mx[i] - oo[i]) / dd[i];
    if (a > b) [a, b] = [b, a];
    t0 = Math.max(t0, a); t1 = Math.min(t1, b);
    if (t0 > t1) return -1;
  }
  return t0;
}
