// Hostile mobs: Shades (surface, night) and Crawlers (dark caves).
import * as THREE from 'three';
import { moveEntity } from './physics.js';
import { B } from './data.js';
import { CH } from './world.js';

const box = (w, h, d, mat, x = 0, y = 0, z = 0) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
};

function makeShade() {
  const body = new THREE.MeshBasicMaterial({ color: 0x3b2f5c });
  const dark = new THREE.MeshBasicMaterial({ color: 0x241b3a });
  const eye = new THREE.MeshBasicMaterial({ color: 0xff4fd8 });
  const g = new THREE.Group();
  const torso = box(0.6, 0.75, 0.35, body, 0, 1.1, 0);
  const head = box(0.5, 0.5, 0.5, dark, 0, 1.72, 0);
  head.add(box(0.1, 0.07, 0.02, eye, -0.12, 0.02, 0.26), box(0.1, 0.07, 0.02, eye, 0.12, 0.02, 0.26));
  const legL = new THREE.Group(), legR = new THREE.Group();
  legL.position.set(-0.15, 0.72, 0); legR.position.set(0.15, 0.72, 0);
  legL.add(box(0.25, 0.72, 0.25, dark, 0, -0.36, 0)); legR.add(box(0.25, 0.72, 0.25, dark, 0, -0.36, 0));
  const armL = new THREE.Group(), armR = new THREE.Group();
  armL.position.set(-0.42, 1.4, 0); armR.position.set(0.42, 1.4, 0);
  armL.add(box(0.2, 0.2, 0.7, body, 0, 0, 0.3)); armR.add(box(0.2, 0.2, 0.7, body, 0, 0, 0.3));
  g.add(torso, head, legL, legR, armL, armR);
  return { g, legs: [legL, legR], mats: [body, dark], base: [0x3b2f5c, 0x241b3a], eye };
}

function makeCrawler() {
  const body = new THREE.MeshBasicMaterial({ color: 0x2b2b2b });
  const dark = new THREE.MeshBasicMaterial({ color: 0x161616 });
  const eye = new THREE.MeshBasicMaterial({ color: 0xff2a2a });
  const g = new THREE.Group();
  g.add(box(0.8, 0.45, 1.0, body, 0, 0.45, -0.1));
  const head = box(0.55, 0.45, 0.45, dark, 0, 0.45, 0.6);
  head.add(box(0.1, 0.08, 0.02, eye, -0.14, 0.06, 0.23), box(0.1, 0.08, 0.02, eye, 0.14, 0.06, 0.23),
    box(0.06, 0.06, 0.02, eye, -0.05, 0.14, 0.23), box(0.06, 0.06, 0.02, eye, 0.05, 0.14, 0.23));
  g.add(head);
  const legs = [];
  for (let i = 0; i < 4; i++) for (const s of [-1, 1]) {
    const l = new THREE.Group();
    l.position.set(0.4 * s, 0.45, 0.3 - i * 0.25);
    l.add(box(0.7, 0.08, 0.08, dark, 0.35 * s, -0.12, 0));
    l.rotation.z = -0.4 * s;
    legs.push(l); g.add(l);
  }
  return { g, legs, mats: [body, dark], base: [0x2b2b2b, 0x161616], eye };
}

export class MobManager {
  constructor(scene) {
    this.scene = scene;
    this.mobs = [];
    this.spawnT = 0;
  }

  clear() {
    for (const m of this.mobs) this.scene.remove(m.model.g);
    this.mobs = [];
  }

  spawn(type, x, y, z, threat) {
    const crawler = type === 'crawler';
    const model = crawler ? makeCrawler() : makeShade();
    const depthBonus = crawler ? Math.max(0, (30 - y) / 10) : 0;
    const hp = crawler ? 8 + threat * 3 + depthBonus * 4 : 12 + threat * 5;
    const m = {
      type, model,
      pos: { x, y, z }, vel: { x: 0, y: 0, z: 0 },
      w: crawler ? 0.9 : 0.6, h: crawler ? 0.7 : 1.9,
      hp, maxHp: hp,
      dmg: (crawler ? 2 : 3) + Math.floor(threat * 0.7 + depthBonus * 0.5),
      speed: crawler ? 4.2 : 2.9 + Math.min(1.5, threat * 0.15),
      atk: 0, hurt: 0, walk: 0, yaw: 0, wander: 0, wdir: Math.random() * 6.28, life: 0,
    };
    this.scene.add(model.g);
    this.mobs.push(m);
    return m;
  }

  // ctx: { world, player, isNight, threat, light, onPlayerHit(mob), onKill(mob) }
  update(dt, ctx) {
    const { world, player } = ctx;
    this.spawnT -= dt;
    if (this.spawnT <= 0) { this.spawnT = 1.5; this.trySpawn(ctx); }
    const pp = player.pos;
    for (let i = this.mobs.length - 1; i >= 0; i--) {
      const m = this.mobs[i];
      m.life += dt;
      const dx = pp.x - m.pos.x, dz = pp.z - m.pos.z, dy = pp.y - m.pos.y;
      const dist = Math.hypot(dx, dz);
      // despawn
      const exposed = m.type === 'shade' && !ctx.isNight && m.pos.y >= world.topAt(Math.floor(m.pos.x), Math.floor(m.pos.z));
      if (exposed) { m.hp -= 6 * dt; m.hurt = 0.1; }
      if (dist > 64 || m.hp <= 0 || m.pos.y < -10 || world.getBlock(Math.floor(m.pos.x), 1, Math.floor(m.pos.z)) < 0) {
        if (m.hp <= 0 && !exposed) ctx.onKill(m);
        this.scene.remove(m.model.g);
        this.mobs.splice(i, 1);
        continue;
      }
      // AI
      let mx = 0, mz = 0;
      const chase = dist < 22 && Math.abs(dy) < 10 && !player.dead;
      if (chase) { const stop = dist < m.w / 2 + 0.55; mx = stop ? 0 : dx / (dist || 1); mz = stop ? 0 : dz / (dist || 1); if (stop) m.yaw = Math.atan2(dx, dz); }
      else {
        m.wander -= dt;
        if (m.wander <= 0) { m.wander = 2 + Math.random() * 3; m.wdir = Math.random() * Math.PI * 2; m.idle = Math.random() < 0.4; }
        if (!m.idle) { mx = Math.sin(m.wdir) * 0.5; mz = Math.cos(m.wdir) * 0.5; }
      }
      const kb = m.kb || 0;
      if (kb > 0) m.kb -= dt;
      else {
        const sp = m.speed * (m.inWater ? 0.5 : 1);
        m.vel.x += (mx * sp - m.vel.x) * Math.min(1, dt * 10);
        m.vel.z += (mz * sp - m.vel.z) * Math.min(1, dt * 10);
      }
      if ((m.hitWall && m.onGround) || (m.inWater && chase)) m.vel.y = m.inWater ? 4 : 8.5;
      moveEntity(world, m, dt);
      if (mx || mz) m.yaw = Math.atan2(mx, mz);
      // attack
      m.atk -= dt;
      if (dist < (m.w / 2 + 0.75) && dy > -m.h && dy < 1.6 && m.atk <= 0 && !player.dead) {
        m.atk = 1.0;
        ctx.onPlayerHit(m);
      }
      // visuals
      const g = m.model.g;
      g.position.set(m.pos.x, m.pos.y, m.pos.z);
      g.rotation.y = m.yaw;
      const moving = Math.hypot(m.vel.x, m.vel.z) > 0.3;
      m.walk += dt * (moving ? 10 : 0);
      m.model.legs.forEach((l, j) => {
        if (m.type === 'shade') l.rotation.x = Math.sin(m.walk + j * Math.PI) * 0.6;
        else l.rotation.y = Math.sin(m.walk + j) * 0.4;
      });
      m.hurt = Math.max(0, m.hurt - dt);
      const lightHere = m.pos.y + 1 >= world.topAt(Math.floor(m.pos.x), Math.floor(m.pos.z)) ? ctx.light : 0.45;
      m.model.mats.forEach((mat, j) => { if (m.hurt > 0) mat.color.setHex(0xff3030); else mat.color.setHex(m.model.base[j]).multiplyScalar(Math.max(0.5, lightHere)); });
    }
  }

  trySpawn(ctx) {
    const { world, player, isNight, threat } = ctx;
    if (player.dead || this.mobs.length >= 14) return;
    const pp = player.pos;
    const surfaceY = world.topAt(Math.floor(pp.x), Math.floor(pp.z));
    const underground = pp.y < surfaceY - 4 && pp.y < 40;
    if (isNight && this.mobs.filter(m => m.type === 'shade').length < 6 + Math.min(6, threat)) {
      const a = Math.random() * Math.PI * 2, r = 18 + Math.random() * 14;
      const x = Math.floor(pp.x + Math.sin(a) * r), z = Math.floor(pp.z + Math.cos(a) * r);
      const top = world.topAt(x, z);
      const b = world.getBlock(x, top, z);
      if (b > 0 && b !== B.WATER && b !== B.LEAVES && top < CH - 3 && world.getBlock(x, top + 1, z) === B.AIR)
        this.spawn('shade', x + 0.5, top + 1, z + 0.5, threat);
    }
    if (underground && Math.random() < 0.55 && this.mobs.filter(m => m.type === 'crawler').length < 5) {
      for (let tries = 0; tries < 8; tries++) {
        const a = Math.random() * Math.PI * 2, r = 10 + Math.random() * 12;
        const x = Math.floor(pp.x + Math.sin(a) * r), z = Math.floor(pp.z + Math.cos(a) * r);
        const y = Math.floor(pp.y + (Math.random() * 12 - 6));
        if (y < 3 || y > world.topAt(x, z) - 4) continue;
        if (world.getBlock(x, y, z) === B.AIR && world.getBlock(x, y + 1, z) === B.AIR && world.isSolid(x, y - 1, z) && world.getBlock(x, y - 1, z) > 0) {
          this.spawn('crawler', x + 0.5, y, z + 0.5, threat);
          break;
        }
      }
    }
  }
}
