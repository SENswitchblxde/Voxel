import * as THREE from 'three';
import { B, I, BLOCKS, ITEMS, RECIPES, QUESTS, TIER_NAMES } from './data.js';
import { buildAtlas, getIcon } from './textures.js';
import { World, CH, SEA, LIGHT } from './world.js';
import { moveEntity, raycast, rayBox, entityOverlapsBlock } from './physics.js';
import { MobManager } from './mobs.js';
import { hashString } from './noise.js';

const SAVE_KEY = 'voxel-ascent-save-v1';
const SETTINGS_KEY = 'voxel-ascent-settings';
const DAY_LEN = 600; // seconds per full day/night cycle
const REACH = 5;
const $ = id => document.getElementById(id);
const isTouch = matchMedia('(pointer: coarse)').matches;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---------------- renderer / scene ----------------
THREE.ColorManagement.enabled = false;
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
renderer.setPixelRatio(Math.min(devicePixelRatio, isTouch ? 1.25 : 1.5));
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, 1, 0.06, 500);
camera.rotation.order = 'YXZ';
scene.fog = new THREE.Fog(0x8fc8ff, 40, 80);
scene.background = new THREE.Color(0x8fc8ff);

const atlas = buildAtlas();
const atlasTex = new THREE.CanvasTexture(atlas);
atlasTex.magFilter = THREE.NearestFilter;
atlasTex.minFilter = THREE.NearestFilter;
atlasTex.generateMipmaps = false;

// selection outline
const selBox = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.BoxGeometry(1.004, 1.004, 1.004)),
  new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.6 }));
selBox.visible = false;
scene.add(selBox);
// crack overlay
const crack = new THREE.Mesh(new THREE.BoxGeometry(1.01, 1.01, 1.01), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, depthWrite: false }));
crack.visible = false;
scene.add(crack);

// sun & moon & clouds
const sun = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshBasicMaterial({ color: 0xfff3b0, fog: false }));
const moon = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.MeshBasicMaterial({ color: 0xdfe6ff, fog: false }));
scene.add(sun, moon);
const stars = (() => {
  const g = new THREE.BufferGeometry(), p = [];
  for (let i = 0; i < 700; i++) {
    const v = new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 0.9 + 0.1, Math.random() * 2 - 1).normalize().multiplyScalar(300);
    p.push(v.x, v.y, v.z);
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  return new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, fog: false, transparent: true, opacity: 0 }));
})();
scene.add(stars);
const clouds = (() => {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const c = cv.getContext('2d');
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const v = Math.sin(x * 0.35) * Math.cos(y * 0.28) + Math.sin((x + y) * 0.17) + Math.random() * 0.3;
    if (v > 0.9) { c.fillStyle = '#fff'; c.fillRect(x, y, 1, 1); }
  }
  const t = new THREE.CanvasTexture(cv);
  t.magFilter = THREE.NearestFilter; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(6, 6);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200), new THREE.MeshBasicMaterial({ map: t, transparent: true, opacity: 0.75, fog: false, depthWrite: false, side: THREE.DoubleSide }));
  m.rotation.x = -Math.PI / 2;
  return m;
})();
scene.add(clouds);

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

// ---------------- settings ----------------
const settings = Object.assign({ rd: isTouch ? 3 : 5, sens: 1 }, JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'));
const saveSettings = () => localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));

// ---------------- game state ----------------
let G = null;
let state = 'menu';
const keys = new Set();
const input = { mx: 0, mz: 0, jump: false, sprint: false, lmb: false };

function newPlayer() {
  return { pos: { x: 0.5, y: 50, z: 0.5 }, vel: { x: 0, y: 0, z: 0 }, w: 0.6, h: 1.8, yaw: 0, pitch: 0,
    hp: 20, maxHp: 20, onGround: false, inWater: false, dead: false, lastHurt: -99, regen: 0, fallY: null, spawn: null, needsGround: true };
}

function treeNear(world, x, z) {
  for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) if (world.treeAt(x + dx, z + dz)) return true;
  return false;
}
function findSpawn(world) {
  for (let r = 0; r < 400; r += 4) {
    for (let a = 0; a < Math.max(1, r); a += 4) {
      const ang = (a / Math.max(1, r)) * Math.PI * 2;
      const x = Math.round(Math.cos(ang) * r), z = Math.round(Math.sin(ang) * r);
      const h = world.heightAt(x, z);
      if (h > SEA + 2 && h < 44 && !treeNear(world, x, z)) return { x: x + 0.5, y: h + 1, z: z + 0.5 };
    }
  }
  return { x: 0.5, y: 50, z: 0.5 };
}

function startGame(save) {
  if (G) { G.world.dispose(); G.mobs.clear(); }
  let seedStr = save ? save.seedStr : ($('seed').value.trim() || String(Math.floor(Math.random() * 1e9)));
  const seed = /^\d+$/.test(seedStr) ? Number(seedStr) >>> 0 : hashString(seedStr);
  const world = new World(seed, scene, atlasTex);
  world.renderDist = settings.rd;
  const player = newPlayer();
  G = {
    seedStr, world, player, mobs: new MobManager(scene),
    inv: new Array(36).fill(null), sel: 0, cursor: null,
    stats: { got: {}, crafted: {}, kills: 0, deaths: 0, nights: 0, beaconLit: false, won: false, quest: 0, play: 0, beaconPos: null },
    time: 0.06, wasNight: false, mining: null, atkCd: 0, invDirty: true, autosave: 20, beam: null,
  };
  if (save) {
    world.loadEdits(save.edits || {});
    Object.assign(player, save.player, { vel: { x: 0, y: 0, z: 0 }, dead: false, needsGround: false, fallY: null });
    G.inv = save.inv; G.sel = save.sel || 0;
    Object.assign(G.stats, save.stats);
    G.time = save.time;
    G.wasNight = isNightAt(G.time);
    if (G.stats.beaconPos) makeBeam(G.stats.beaconPos);
  } else {
    player.spawn = findSpawn(world);
    Object.assign(player.pos, player.spawn);
    player.yaw = Math.PI * 0.25;
    toast('Welcome! Follow the objective in the top-left.', 'big');
  }
  setState('play');
  updateQuestUI();
  renderHotbar();
  renderHearts();
}

function save() {
  if (!G) return;
  const p = G.player;
  const data = {
    v: 1, seedStr: G.seedStr, time: G.time, sel: G.sel, inv: G.inv, stats: G.stats,
    player: { pos: p.pos, yaw: p.yaw, pitch: p.pitch, hp: Math.max(1, p.hp), maxHp: p.maxHp, spawn: p.spawn },
    edits: G.world.serializeEdits(),
  };
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch (e) { toast('Could not save (storage full?)', 'bad'); }
}
function loadSave() { try { return JSON.parse(localStorage.getItem(SAVE_KEY)); } catch { return null; } }

// ---------------- inventory ----------------
const maxStack = id => ITEMS[id]?.stack || 64;
function addItem(id, n) {
  const inv = G.inv;
  if (ITEMS[id].stack > 1) for (let i = 0; i < 36 && n > 0; i++) {
    const s = inv[i];
    if (s && s.id === id && s.count < maxStack(id)) { const m = Math.min(n, maxStack(id) - s.count); s.count += m; n -= m; }
  }
  for (let i = 0; i < 36 && n > 0; i++) {
    if (!inv[i]) {
      const m = Math.min(n, maxStack(id));
      inv[i] = { id, count: m };
      if (ITEMS[id].dur) inv[i].dur = ITEMS[id].dur;
      n -= m;
    }
  }
  G.invDirty = true;
  return n;
}
function roomFor(id, n) {
  let room = 0;
  for (const s of G.inv) {
    if (!s) room += maxStack(id);
    else if (s.id === id && ITEMS[id].stack > 1) room += maxStack(id) - s.count;
  }
  return room >= n;
}
function countItem(id) { let c = 0; for (const s of G.inv) if (s && s.id === id) c += s.count; return c; }
function removeItem(id, n) {
  for (let i = 35; i >= 0 && n > 0; i--) {
    const s = G.inv[i];
    if (s && s.id === id) { const m = Math.min(n, s.count); s.count -= m; n -= m; if (!s.count) G.inv[i] = null; }
  }
  G.invDirty = true;
}
const held = () => G.inv[G.sel];
function useDurability(slot, amt = 1) {
  const s = G.inv[slot];
  if (!s || !s.dur) return;
  s.dur -= amt;
  if (s.dur <= 0) { toast(`${ITEMS[s.id].name} broke!`, 'bad'); G.inv[slot] = null; }
  G.invDirty = true;
}
function gain(id, n) {
  const left = addItem(id, n);
  G.stats.got[id] = (G.stats.got[id] || 0) + (n - left);
  if (n - left > 0) pickupToast(id, n - left);
  if (left > 0) toast('Inventory full!', 'bad');
}

// ---------------- crafting ----------------
function nearbyStations() {
  const st = { table: false, furnace: false };
  const p = G.player.pos;
  const x0 = Math.floor(p.x), y0 = Math.floor(p.y), z0 = Math.floor(p.z);
  for (let x = x0 - 4; x <= x0 + 4; x++) for (let y = y0 - 3; y <= y0 + 4; y++) for (let z = z0 - 4; z <= z0 + 4; z++) {
    const b = G.world.getBlock(x, y, z);
    if (b === B.TABLE) st.table = true;
    if (b === B.FURNACE) st.furnace = true;
  }
  return st;
}
function canCraft(r, st) {
  if (r.st && !st[r.st]) return false;
  return r.in.every(([id, n]) => countItem(id) >= n);
}
function craft(r, times = 1) {
  const st = nearbyStations();
  let made = 0;
  for (let t = 0; t < times; t++) {
    if (!canCraft(r, st)) break;
    if (!roomFor(r.out[0], r.out[1])) { toast('No room in inventory', 'bad'); break; }
    for (const [id, n] of r.in) removeItem(id, n);
    addItem(r.out[0], r.out[1]);
    G.stats.crafted[r.out[0]] = (G.stats.crafted[r.out[0]] || 0) + r.out[1];
    made++;
  }
  if (made) { pickupToast(r.out[0], r.out[1] * made, 'Crafted'); checkQuests(); }
  renderInventory();
}

// ---------------- quests ----------------
const questCtx = {
  got: id => G.stats.got[id] || 0,
  crafted: id => G.stats.crafted[id] || 0,
  get nights() { return G.stats.nights; },
  get beaconLit() { return G.stats.beaconLit; },
};
function checkQuests() {
  let changed = false;
  while (G.stats.quest < QUESTS.length && QUESTS[G.stats.quest].check(questCtx)) {
    const q = QUESTS[G.stats.quest];
    toast(`✔ ${q.title}`, 'big');
    if (q.reward) {
      G.player.maxHp += q.reward; G.player.hp += q.reward;
      toast(`Max health +${q.reward / 2} heart`, 'good');
      renderHearts();
    }
    G.stats.quest++;
    changed = true;
  }
  if (changed) updateQuestUI();
}
function updateQuestUI() {
  const i = G.stats.quest;
  $('qn').textContent = `${Math.min(i + 1, QUESTS.length)}/${QUESTS.length}`;
  if (i >= QUESTS.length) { $('qt').textContent = 'All objectives complete'; $('qd').textContent = 'The world is yours. Build something great.'; return; }
  $('qt').textContent = QUESTS[i].title;
  let d = QUESTS[i].desc;
  if (isTouch) d = d.replace('Hold left-click', 'Hold ⛏').replace('right-click', 'tap').replace('Press E', 'Tap ☰');
  $('qd').textContent = d;
}

// ---------------- HUD ----------------
function slotHTML(s, keyLabel) {
  if (!s) return keyLabel ? `<span class="k">${keyLabel}</span>` : '';
  const it = ITEMS[s.id];
  let h = `<img src="${getIcon(s.id, atlas)}" alt="">`;
  if (s.count > 1) h += `<span class="n">${s.count}</span>`;
  if (it.dur && s.dur < it.dur) {
    const f = s.dur / it.dur;
    h += `<span class="dur"><i style="width:${f * 100}%;background:hsl(${f * 120},90%,50%)"></i></span>`;
  }
  if (keyLabel) h += `<span class="k">${keyLabel}</span>`;
  return h;
}
const hotbarEls = [];
for (let i = 0; i < 9; i++) {
  const d = document.createElement('div');
  d.className = 'slot';
  d.addEventListener('pointerdown', e => { if (isTouch && state === 'play') { e.stopPropagation(); selectSlot(i); } });
  $('hotbar').appendChild(d);
  hotbarEls.push(d);
}
if (isTouch) $('hotbar').style.pointerEvents = 'auto';
function renderHotbar() {
  for (let i = 0; i < 9; i++) {
    hotbarEls[i].innerHTML = slotHTML(G.inv[i], isTouch ? '' : String(i + 1));
    hotbarEls[i].classList.toggle('sel', i === G.sel);
  }
}
let heldT = 0;
function selectSlot(i) {
  G.sel = (i + 9) % 9;
  G.mining = null;
  renderHotbar();
  const s = held();
  $('held').textContent = s ? ITEMS[s.id].name : '';
  $('held').style.opacity = 1;
  heldT = 2;
}
const heartImgs = (() => {
  const mk = (fillL, fillR) => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 9;
    const c = cv.getContext('2d');
    const shape = ['.XX...XX.', 'X..X.X..X', 'X...X...X', 'X.......X', '.X.....X.', '..X...X..', '...X.X...', '....X....'];
    const inside = ['.##...##.', '##########', '#########', '#########', '.#######.', '..#####..', '...###...', '....#....'];
    for (let y = 0; y < 8; y++) for (let x = 0; x < 9; x++) {
      if (inside[y][x] === '#' || inside[y][x] === undefined && false) {
        const f = x < 5 ? fillL : fillR;
        c.fillStyle = f ? (y < 2 && x > 0 && x < 3 ? '#ff9aa6' : '#e0203a') : '#3a1a24';
        c.fillRect(x, y, 1, 1);
      }
      if (shape[y][x] === 'X') { c.fillStyle = '#12060a'; c.fillRect(x, y, 1, 1); }
    }
    return cv.toDataURL();
  };
  return { full: mk(1, 1), half: mk(1, 0), empty: mk(0, 0) };
})();
function renderHearts() {
  const p = G.player;
  const n = Math.ceil(p.maxHp / 2);
  let h = '';
  for (let i = 0; i < n; i++) {
    const v = p.hp - i * 2;
    h += `<img class="heart" src="${v >= 2 ? heartImgs.full : v >= 1 ? heartImgs.half : heartImgs.empty}">`;
  }
  $('hearts').innerHTML = h;
}
let lastPick = null;
function pickupToast(id, n, verb = '+') {
  const name = ITEMS[id].name;
  if (lastPick && lastPick.id === id && lastPick.verb === verb && performance.now() - lastPick.t < 2000 && lastPick.el.isConnected) {
    lastPick.n += n; lastPick.t = performance.now();
    lastPick.el.textContent = `${verb === '+' ? '+' : verb + ' '}${lastPick.n} ${name}`;
    return;
  }
  const el = toast(`${verb === '+' ? '+' : verb + ' '}${n} ${name}`, verb === '+' ? '' : 'good');
  lastPick = { id, n, verb, t: performance.now(), el };
}
function toast(msg, cls = '') {
  const el = document.createElement('div');
  el.className = 'toast ' + cls;
  el.textContent = msg;
  $('toasts').appendChild(el);
  while ($('toasts').children.length > 6) $('toasts').firstChild.remove();
  setTimeout(() => el.remove(), cls === 'big' ? 5000 : 2800);
  return el;
}
let tipT = 0;
function tip(msg) { $('tip').textContent = msg; $('tip').style.opacity = 1; tipT = 1.6; }

// ---------------- inventory screen ----------------
const gridEls = [];
function buildInvGrid() {
  const mk = (parent, i) => {
    const d = document.createElement('div');
    d.className = 'slot';
    d.addEventListener('mousedown', e => { e.preventDefault(); clickSlot(i, e.shiftKey, e.button === 2); });
    d.addEventListener('contextmenu', e => e.preventDefault());
    d.addEventListener('touchstart', e => { e.preventDefault(); clickSlot(i, false, false); }, { passive: false });
    parent.appendChild(d);
    gridEls[i] = d;
  };
  for (let i = 9; i < 36; i++) mk($('grid'), i);
  for (let i = 0; i < 9; i++) mk($('gridHot'), i);
}
buildInvGrid();
function clickSlot(i, shift, right) {
  const inv = G.inv;
  const s = inv[i];
  if (shift && s && !G.cursor) {
    const range = i < 9 ? [9, 36] : [0, 9];
    for (let j = range[0]; j < range[1] && inv[i]; j++) {
      const t = inv[j];
      if (t && t.id === s.id && maxStack(s.id) > 1 && t.count < maxStack(s.id)) {
        const m = Math.min(s.count, maxStack(s.id) - t.count); t.count += m; s.count -= m; if (!s.count) inv[i] = null;
      }
    }
    for (let j = range[0]; j < range[1] && inv[i]; j++) if (!inv[j]) { inv[j] = inv[i]; inv[i] = null; }
  } else if (right) {
    if (!G.cursor && s) { const h = Math.ceil(s.count / 2); G.cursor = { ...s, count: h }; s.count -= h; if (!s.count) inv[i] = null; }
    else if (G.cursor && (!s || (s.id === G.cursor.id && s.count < maxStack(s.id)))) {
      if (!s) inv[i] = { ...G.cursor, count: 1 }; else s.count++;
      G.cursor.count--; if (!G.cursor.count) G.cursor = null;
    }
  } else if (!G.cursor) { if (s) { G.cursor = s; inv[i] = null; } }
  else if (!s) { inv[i] = G.cursor; G.cursor = null; }
  else if (s.id === G.cursor.id && maxStack(s.id) > 1) {
    const m = Math.min(G.cursor.count, maxStack(s.id) - s.count); s.count += m; G.cursor.count -= m; if (!G.cursor.count) G.cursor = null;
  } else { inv[i] = G.cursor; G.cursor = s; }
  G.invDirty = true;
  renderInventory();
}
function renderCursor() {
  const c = G?.cursor;
  $('cursorItem').innerHTML = c ? `<img src="${getIcon(c.id, atlas)}">${c.count > 1 ? `<span class="n">${c.count}</span>` : ''}` : '';
}
addEventListener('mousemove', e => { const c = $('cursorItem'); c.style.left = e.clientX + 'px'; c.style.top = e.clientY + 'px'; });
function renderInventory() {
  for (let i = 0; i < 36; i++) gridEls[i].innerHTML = slotHTML(G.inv[i]);
  renderCursor();
  const st = nearbyStations();
  $('stations').textContent = `· ${st.table ? '✔' : '✖'} table · ${st.furnace ? '✔' : '✖'} furnace nearby`;
  const only = $('onlyCraftable').checked;
  const list = $('recipes');
  list.innerHTML = '';
  for (const r of RECIPES) {
    const ok = canCraft(r, st);
    if (only && !ok) continue;
    const d = document.createElement('div');
    d.className = 'rec' + (ok ? '' : ' no');
    const ing = r.in.map(([id, n]) => {
      const have = countItem(id);
      return `<span class="${have >= n ? '' : 'miss'}">${n} ${ITEMS[id].name} (${have})</span>`;
    }).join(' · ');
    const stTxt = r.st ? `<div class="st">needs ${r.st === 'table' ? 'Crafting Table' : 'Furnace'} nearby${st[r.st] ? ' ✔' : ''}</div>` : '';
    d.innerHTML = `<img src="${getIcon(r.out[0], atlas)}"><div><div class="nm">${ITEMS[r.out[0]].name}${r.out[1] > 1 ? ' ×' + r.out[1] : ''}</div><div class="ing">${ing}</div>${stTxt}</div>`;
    const btn = document.createElement('button');
    btn.textContent = 'Craft';
    btn.disabled = !ok;
    btn.title = 'Shift-click to craft up to 8';
    btn.addEventListener('click', e => craft(r, e.shiftKey ? 8 : 1));
    d.appendChild(btn);
    list.appendChild(d);
  }
  renderHotbar();
}
$('onlyCraftable').addEventListener('change', renderInventory);

// ---------------- state transitions ----------------
function setState(s) {
  const prev = state;
  state = s;
  for (const id of ['menu', 'pause', 'inv', 'dead', 'win']) $(id).classList.toggle('hidden', id !== s);
  $('hud').classList.toggle('hidden', s === 'menu');
  $('touch').classList.toggle('hidden', !(isTouch && s === 'play'));
  if (s === 'play') {
    if (!isTouch && document.pointerLockElement !== canvas) canvas.requestPointerLock?.()?.catch?.(() => {});
  } else {
    input.lmb = false; keys.clear();
    if (document.pointerLockElement) document.exitPointerLock();
  }
  if (s === 'inv') { renderInventory(); }
  if (prev === 'inv' && G?.cursor) { const c = G.cursor; G.cursor = null; const left = addItem(c.id, c.count); if (left) toast('Dropped items: inventory full', 'bad'); renderCursor(); }
  if (s === 'pause') {
    $('rd').value = settings.rd; $('rdv').textContent = settings.rd; $('sens').value = settings.sens;
    const st = G.stats;
    $('pstats').innerHTML = `Seed: ${G.seedStr}<br>Day ${st.nights + 1} · Kills ${st.kills} · Deaths ${st.deaths}`;
    save();
  }
  if (s === 'menu') refreshMenu();
}
function refreshMenu() { $('btnContinue').classList.toggle('hidden', !loadSave()); }

$('btnNew').onclick = () => {
  if (loadSave() && !confirmNew()) return;
  localStorage.removeItem(SAVE_KEY);
  startGame(null);
};
let confirmArmed = 0;
function confirmNew() {
  if (performance.now() - confirmArmed < 4000) return true;
  confirmArmed = performance.now();
  $('btnNew').textContent = 'Overwrite save? Click again';
  setTimeout(() => { $('btnNew').textContent = 'New World'; }, 4000);
  return false;
}
$('btnContinue').onclick = () => { const s = loadSave(); if (s) startGame(s); };
$('btnResume').onclick = () => setState('play');
$('btnQuit').onclick = () => { save(); setState('menu'); };
$('btnCloseInv').onclick = () => setState('play');
$('btnRespawn').onclick = respawn;
$('btnWinContinue').onclick = () => setState('play');
$('rd').oninput = e => { settings.rd = +e.target.value; $('rdv').textContent = settings.rd; if (G) G.world.renderDist = settings.rd; saveSettings(); };
$('sens').oninput = e => { settings.sens = +e.target.value; saveSettings(); };
refreshMenu();

// ---------------- input: desktop ----------------
canvas.addEventListener('click', () => { if (state === 'play' && !isTouch && document.pointerLockElement !== canvas) canvas.requestPointerLock?.()?.catch?.(() => {}); });
document.addEventListener('pointerlockchange', () => {
  if (!document.pointerLockElement && state === 'play' && !isTouch) setState('pause');
});
addEventListener('keydown', e => {
  if (e.code === 'KeyE' && G && (state === 'play' || state === 'inv')) { e.preventDefault(); setState(state === 'inv' ? 'play' : 'inv'); return; }
  if (e.code === 'Escape' && state === 'inv') { setState('play'); return; }
  if (state !== 'play') return;
  keys.add(e.code);
  if (e.code.startsWith('Digit')) { const n = +e.code.slice(5); if (n >= 1 && n <= 9) selectSlot(n - 1); }
  if (e.code === 'Space') e.preventDefault();
});
addEventListener('keyup', e => keys.delete(e.code));
addEventListener('blur', () => { keys.clear(); input.lmb = false; });
document.addEventListener('mousemove', e => {
  if (state !== 'play' || document.pointerLockElement !== canvas) return;
  const s = 0.0022 * settings.sens;
  G.player.yaw -= e.movementX * s;
  G.player.pitch = clamp(G.player.pitch - e.movementY * s, -1.55, 1.55);
});
document.addEventListener('mousedown', e => {
  if (state !== 'play' || document.pointerLockElement !== canvas) return;
  if (e.button === 0) { input.lmb = true; tryAttack(); }
  if (e.button === 2) useAction();
});
document.addEventListener('mouseup', e => { if (e.button === 0) input.lmb = false; });
document.addEventListener('contextmenu', e => e.preventDefault());
addEventListener('wheel', e => { if (state === 'play' && G) selectSlot(G.sel + Math.sign(e.deltaY)); }, { passive: true });
document.addEventListener('visibilitychange', () => { if (document.hidden && G && state !== 'menu') save(); });
addEventListener('beforeunload', () => { if (G && state !== 'menu') save(); });

// ---------------- input: touch ----------------
if (isTouch) {
  let stickId = null, lookId = null, lookLast = null, lookStart = null;
  const stick = $('stick'), knob = $('knob');
  const setKnob = (dx, dy) => { knob.style.transform = `translate(${dx}px, ${dy}px)`; };
  stick.addEventListener('touchstart', e => { e.preventDefault(); stickId = e.changedTouches[0].identifier; }, { passive: false });
  const tbtn = q => document.querySelector(`[data-t="${q}"]`);
  tbtn('jump').addEventListener('touchstart', e => { e.preventDefault(); input.jump = true; tbtn('jump').classList.add('on'); }, { passive: false });
  tbtn('jump').addEventListener('touchend', e => { e.preventDefault(); input.jump = false; tbtn('jump').classList.remove('on'); }, { passive: false });
  tbtn('mine').addEventListener('touchstart', e => { e.preventDefault(); input.lmb = true; tryAttack(); tbtn('mine').classList.add('on'); }, { passive: false });
  tbtn('mine').addEventListener('touchend', e => { e.preventDefault(); input.lmb = false; tbtn('mine').classList.remove('on'); }, { passive: false });
  tbtn('place').addEventListener('touchstart', e => { e.preventDefault(); useAction(); }, { passive: false });
  tbtn('inv').addEventListener('touchstart', e => { e.preventDefault(); setState('inv'); }, { passive: false });
  $('tPause').addEventListener('touchstart', e => { e.preventDefault(); setState('pause'); }, { passive: false });
  canvas.addEventListener('touchstart', e => {
    e.preventDefault();
    for (const t of e.changedTouches) if (lookId === null) { lookId = t.identifier; lookLast = [t.clientX, t.clientY]; lookStart = [t.clientX, t.clientY, performance.now()]; }
  }, { passive: false });
  addEventListener('touchmove', e => {
    if (state !== 'play') return;
    for (const t of e.changedTouches) {
      if (t.identifier === stickId) {
        const r = stick.getBoundingClientRect();
        let dx = t.clientX - (r.left + r.width / 2), dy = t.clientY - (r.top + r.height / 2);
        const l = Math.hypot(dx, dy), m = 50;
        if (l > m) { dx *= m / l; dy *= m / l; }
        setKnob(dx, dy);
        input.mx = dx / m; input.mz = dy / m;
        input.sprint = l > m * 1.4;
      } else if (t.identifier === lookId) {
        const s = 0.006 * settings.sens;
        G.player.yaw -= (t.clientX - lookLast[0]) * s;
        G.player.pitch = clamp(G.player.pitch - (t.clientY - lookLast[1]) * s, -1.55, 1.55);
        lookLast = [t.clientX, t.clientY];
      }
    }
  }, { passive: true });
  const end = e => {
    for (const t of e.changedTouches) {
      if (t.identifier === stickId) { stickId = null; input.mx = input.mz = 0; input.sprint = false; setKnob(0, 0); }
      if (t.identifier === lookId) {
        // quick tap on the world = place/use
        if (lookStart && performance.now() - lookStart[2] < 220 && Math.hypot(t.clientX - lookStart[0], t.clientY - lookStart[1]) < 12 && state === 'play') useAction();
        lookId = null;
      }
    }
  };
  addEventListener('touchend', end);
  addEventListener('touchcancel', end);
}

// ---------------- gameplay actions ----------------
const tmpDir = new THREE.Vector3();
function eye() { const p = G.player.pos; return new THREE.Vector3(p.x, p.y + 1.62, p.z); }
function lookDir() { camera.getWorldDirection(tmpDir); return tmpDir; }

function targetMob(maxT) {
  const o = eye(), d = lookDir();
  let best = null, bt = Math.min(maxT, 3.6);
  for (const m of G.mobs.mobs) { const t = rayBox(o, d, m); if (t >= 0 && t < bt) { bt = t; best = m; } }
  return best;
}

function tryAttack() {
  if (!G || G.atkCd > 0 || G.player.dead) return false;
  const hit = raycast(G.world, eye(), lookDir(), REACH);
  const m = targetMob(hit ? hit.t : REACH);
  if (!m) return false;
  const h = held();
  const dmg = h ? (ITEMS[h.id].dmg || 1) : 1;
  m.hp -= dmg;
  m.hurt = 0.2;
  const d = lookDir();
  m.vel.x = d.x * 9; m.vel.z = d.z * 9; m.vel.y = 5; m.kb = 0.25;
  G.atkCd = 0.42;
  if (h && ITEMS[h.id].tool) useDurability(G.sel);
  return true;
}

function breakTime(b) {
  const def = BLOCKS[b];
  const h = held();
  const it = h ? ITEMS[h.id] : null;
  const tier = it && it.tool === 'pick' ? it.tier : 0;
  if (tier < def.tier) return Infinity;
  let speed = 1;
  if (it && it.tool === 'pick') speed = def.mat === 'rock' ? it.speed : def.mat === 'wood' ? 1.6 : 1.2;
  if (it && it.tool === 'sword' && def.mat === 'plant') speed = 3;
  return def.hard / speed;
}

function breakBlock(hit) {
  const { x, y, z, b } = hit;
  const def = BLOCKS[b];
  G.world.setBlock(x, y, z, B.AIR);
  if (b === B.BEACON) { G.stats.beaconLit = false; G.stats.beaconPos = null; if (G.beam) { scene.remove(G.beam); G.beam = null; } }
  if (b === B.LEAVES) { if (Math.random() < 0.07) gain(I.APPLE, 1); }
  else if (def.drop) gain(def.drop, 1);
  const h = held();
  if (h && ITEMS[h.id].tool) useDurability(G.sel);
  checkQuests();
}

function useAction() {
  if (!G || G.player.dead) return;
  const p = G.player;
  const h = held();
  const hit = raycast(G.world, eye(), lookDir(), REACH);
  // open stations
  if (hit && BLOCKS[hit.b].station && !keys.has('ShiftLeft')) { setState('inv'); return; }
  // eat
  if (h && ITEMS[h.id].food) {
    if (p.hp >= p.maxHp) { tip('You are already at full health'); return; }
    p.hp = Math.min(p.maxHp, p.hp + ITEMS[h.id].food);
    removeItemAt(G.sel, 1);
    toast(`Ate ${ITEMS[h.id].name}`, 'good');
    renderHearts();
    return;
  }
  if (!hit || !h || !ITEMS[h.id].block) return;
  const x = hit.x + hit.nx, y = hit.y + hit.ny, z = hit.z + hit.nz;
  if (y < 0 || y >= CH) return;
  const cur = G.world.getBlock(x, y, z);
  if (cur !== B.AIR && cur !== B.WATER) return;
  if (entityOverlapsBlock(p, x, y, z)) return;
  for (const m of G.mobs.mobs) if (entityOverlapsBlock(m, x, y, z)) return;
  const bid = ITEMS[h.id].block;
  G.world.setBlock(x, y, z, bid);
  removeItemAt(G.sel, 1);
  if (bid === B.BEACON) {
    let open = true;
    for (let yy = y + 1; yy < CH; yy++) { const ab = G.world.getBlock(x, yy, z); if (ab > 0 && BLOCKS[ab].opaque) { open = false; break; } }
    if (!open) { tip('The Beacon needs a clear view of the sky'); }
    else {
      G.stats.beaconLit = true;
      G.stats.beaconPos = { x, y, z };
      makeBeam(G.stats.beaconPos);
      checkQuests();
      if (!G.stats.won) {
        G.stats.won = true;
        const st = G.stats;
        $('winMsg').innerHTML = `You lit the Beacon on day ${st.nights + 1}.<br>Monsters slain: ${st.kills} · Deaths: ${st.deaths} · Time played: ${Math.round(st.play / 60)} min`;
        save();
        setState('win');
      }
    }
  }
}
function removeItemAt(i, n) {
  const s = G.inv[i];
  if (!s) return;
  s.count -= n;
  if (s.count <= 0) G.inv[i] = null;
  G.invDirty = true;
}

function makeBeam(pos) {
  if (G.beam) scene.remove(G.beam);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 220, 8, 1, true),
    new THREE.MeshBasicMaterial({ color: 0x7ff6ff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  m.position.set(pos.x + 0.5, pos.y + 110.5, pos.z + 0.5);
  scene.add(m);
  G.beam = m;
}

function hurtPlayer(dmg, from) {
  const p = G.player;
  if (p.dead) return;
  p.hp -= dmg;
  p.lastHurt = G.stats.play;
  $('vignette').style.opacity = 0.9;
  setTimeout(() => $('vignette').style.opacity = 0, 180);
  if (from) {
    const dx = p.pos.x - from.pos.x, dz = p.pos.z - from.pos.z, l = Math.hypot(dx, dz) || 1;
    p.vel.x += dx / l * 7; p.vel.z += dz / l * 7; p.vel.y = Math.max(p.vel.y, 5);
  }
  renderHearts();
  if (p.hp <= 0) die(from ? (from.type === 'shade' ? 'Slain by a Shade.' : 'Slain by a Crawler.') : 'You fell too far.');
}
function die(msg) {
  const p = G.player;
  p.dead = true; p.hp = 0;
  G.stats.deaths++;
  $('deadMsg').textContent = msg + ' Your items are safe. Your spawn point is waiting.';
  renderHearts();
  setState('dead');
}
function respawn() {
  const p = G.player;
  Object.assign(p.pos, p.spawn);
  p.vel = { x: 0, y: 0, z: 0 };
  p.hp = p.maxHp; p.dead = false; p.fallY = null; p.needsGround = true;
  G.mobs.clear();
  renderHearts();
  setState('play');
}

// ---------------- day / night ----------------
function sunAngle(t) { return t < 0.6 ? (t / 0.6) * Math.PI : Math.PI + ((t - 0.6) / 0.4) * Math.PI; }
function isNightAt(t) { return Math.sin(sunAngle(t)) < -0.08; }
const DAY_SKY = new THREE.Color(0x8fc8ff), NIGHT_SKY = new THREE.Color(0x070917), DUSK = new THREE.Color(0xff8a52), CAVE = new THREE.Color(0x05040a);
const skyCol = new THREE.Color();

function updateSky(eyeY) {
  const a = sunAngle(G.time), s = Math.sin(a);
  const day = clamp(0.15 + s * 1.4, 0, 1);
  LIGHT.uDay.value = 0.2 + day * 0.8;
  skyCol.copy(NIGHT_SKY).lerp(DAY_SKY, day);
  const duskAmt = clamp(1 - Math.abs(s) * 4, 0, 1) * 0.6;
  skyCol.lerp(DUSK, duskAmt);
  // underground darkening
  const p = G.player.pos;
  const top = G.world.topAt(Math.floor(p.x), Math.floor(p.z));
  const cave = clamp((top - eyeY - 2) / 8, 0, 1);
  skyCol.lerp(CAVE, cave);
  scene.background.copy(skyCol);
  scene.fog.color.copy(skyCol);
  const far = G.world.renderDist * 16;
  scene.fog.near = far * (0.45 - cave * 0.3);
  scene.fog.far = far * (1 - cave * 0.45);
  const cp = camera.position;
  sun.position.set(cp.x + Math.cos(a) * 250, cp.y + Math.sin(a) * 250, cp.z + 40);
  moon.position.set(cp.x - Math.cos(a) * 250, cp.y - Math.sin(a) * 250, cp.z + 40);
  sun.lookAt(cp); moon.lookAt(cp);
  sun.visible = moon.visible = clouds.visible = cave < 0.9;
  stars.position.copy(cp);
  stars.material.opacity = clamp(-s * 2, 0, 1) * (1 - cave);
  clouds.position.set(cp.x, 96, cp.z);
  clouds.material.map.offset.set((cp.x / 1200 * 6) + G.stats.play * 0.0015, -(cp.z / 1200 * 6));
  clouds.material.color.setScalar(0.35 + day * 0.65);
  return day;
}

// ---------------- main loop ----------------
let last = performance.now(), fpsAcc = 0, fpsN = 0, fps = 60, infoT = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  fpsAcc += dt; fpsN++;
  if (fpsAcc > 0.5) { fps = Math.round(fpsN / fpsAcc); fpsAcc = 0; fpsN = 0; }
  if (!G) { renderer.render(scene, camera); return; }
  const p = G.player;
  const ready = G.world.isReadyAround(p.pos.x, p.pos.z);
  G.world.update(p.pos.x, p.pos.z, ready ? 2 : 6);
  $('loading').classList.toggle('hidden', ready);

  if (state === 'play' && ready) tick(dt);

  camera.position.set(p.pos.x, p.pos.y + 1.62, p.pos.z);
  camera.rotation.set(p.pitch, p.yaw, 0);
  LIGHT.uPlayer.value.copy(camera.position);
  const day = updateSky(camera.position.y);
  if (G.beam) G.beam.material.opacity = 0.35 + Math.sin(now / 300) * 0.1;

  // HUD timers
  if (heldT > 0) { heldT -= dt; if (heldT <= 0) $('held').style.opacity = 0; }
  if (tipT > 0) { tipT -= dt; if (tipT <= 0) $('tip').style.opacity = 0; }
  if (G.invDirty) { G.invDirty = false; renderHotbar(); if (state === 'inv') renderInventory(); }
  infoT -= dt;
  if (infoT <= 0) {
    infoT = 0.25;
    const hrs = Math.floor(((G.time + 0.25) % 1) * 24), mins = Math.floor((((G.time + 0.25) % 1) * 24 % 1) * 60);
    const night = isNightAt(G.time);
    $('info').innerHTML = `Day ${G.stats.nights + 1} · ${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')} ${night ? '🌙' : '☀'}<br>` +
      `Y ${Math.floor(p.pos.y)} · Threat ${G.stats.nights + 1}<br><span class="dim">${fps} fps</span>`;
  }
  renderer.render(scene, camera);
}

function tick(dt) {
  const p = G.player;
  G.stats.play += dt;
  G.time = (G.time + dt / DAY_LEN) % 1;
  G.atkCd = Math.max(0, G.atkCd - dt);
  const night = isNightAt(G.time);
  if (night && !G.wasNight) toast(`Night falls. Shades are rising (threat ${G.stats.nights + 1}).`, 'bad');
  if (!night && G.wasNight) { G.stats.nights++; toast(`Dawn of day ${G.stats.nights + 1}. You survived.`, 'good'); checkQuests(); }
  G.wasNight = night;

  if (p.needsGround) {
    const top = G.world.topAt(Math.floor(p.pos.x), Math.floor(p.pos.z));
    p.pos.y = top + 1; p.needsGround = false;
    if (!p.spawn || p.spawn.y !== p.pos.y) p.spawn = { x: p.pos.x, y: p.pos.y, z: p.pos.z };
  }

  // movement
  let fx = 0, fz = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) fz -= 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) fz += 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) fx -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) fx += 1;
  fx += input.mx; fz += input.mz;
  const fl = Math.hypot(fx, fz);
  if (fl > 1) { fx /= fl; fz /= fl; }
  const sprint = keys.has('ShiftLeft') || keys.has('ControlLeft') || input.sprint;
  let speed = sprint ? 6.4 : 4.4;
  if (p.inWater) speed *= 0.55;
  const sy = Math.sin(p.yaw), cy = Math.cos(p.yaw);
  const wx = fx * cy + fz * sy, wz = -fx * sy + fz * cy;
  const accel = p.onGround ? 14 : 4;
  p.vel.x += (wx * speed - p.vel.x) * Math.min(1, dt * accel);
  p.vel.z += (wz * speed - p.vel.z) * Math.min(1, dt * accel);
  const jump = keys.has('Space') || input.jump;
  if (jump) {
    if (p.inWater) p.vel.y = Math.min(p.vel.y + 30 * dt, 4);
    else if (p.onGround) p.vel.y = 8.6;
  }
  moveEntity(G.world, p, dt);
  // fall damage
  if (p.onGround || p.inWater) {
    if (p.fallY !== null && !p.inWater) {
      const fall = p.fallY - p.pos.y;
      if (fall > 3.6) hurtPlayer(Math.floor(fall - 3), null);
    }
    p.fallY = null;
  } else {
    p.fallY = p.fallY === null ? p.pos.y : Math.max(p.fallY, p.pos.y);
  }
  if (p.pos.y < -20) die('You fell out of the world.');
  // regen
  if (G.stats.play - p.lastHurt > 6 && p.hp < p.maxHp) {
    p.regen += dt;
    if (p.regen > 3) { p.regen = 0; p.hp = Math.min(p.maxHp, p.hp + 1); renderHearts(); }
  }

  // targeting & mining
  camera.position.set(p.pos.x, p.pos.y + 1.62, p.pos.z);
  camera.rotation.set(p.pitch, p.yaw, 0);
  camera.updateMatrixWorld();
  const hit = raycast(G.world, eye(), lookDir(), REACH);
  const mob = targetMob(hit ? hit.t : REACH);
  if (hit && !mob) { selBox.visible = true; selBox.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5); }
  else selBox.visible = false;
  let prog = 0;
  if (input.lmb) {
    if (mob) { tryAttack(); G.mining = null; }
    else if (hit) {
      const m = G.mining;
      if (!m || m.x !== hit.x || m.y !== hit.y || m.z !== hit.z) G.mining = { x: hit.x, y: hit.y, z: hit.z, p: 0 };
      const bt = breakTime(hit.b);
      if (bt === Infinity) {
        const need = BLOCKS[hit.b].tier;
        tip(need >= 99 ? 'Unbreakable' : `Too hard! Needs a ${TIER_NAMES[need]}`);
      } else {
        G.mining.p += dt / Math.max(0.05, bt);
        prog = G.mining.p;
        if (G.mining.p >= 1) { breakBlock(hit); G.mining = null; prog = 0; }
      }
    }
  } else G.mining = null;
  const ring = $('ring');
  ring.style.opacity = prog > 0 ? 1 : 0;
  ring.style.setProperty('--p', `${Math.min(100, prog * 100)}%`);
  crack.visible = prog > 0 && !!hit;
  if (crack.visible) { crack.position.copy(selBox.position); crack.material.opacity = prog * 0.55; }

  // mobs
  G.mobs.update(dt, {
    world: G.world, player: p, isNight: night, threat: G.stats.nights,
    light: LIGHT.uDay.value,
    onPlayerHit: m => hurtPlayer(m.dmg, m),
    onKill: m => {
      G.stats.kills++;
      const n = Math.random() < (m.type === 'crawler' ? 0.75 : 0.6) ? 1 + (Math.random() < 0.35 ? 1 : 0) : 0;
      if (n) gain(I.ESSENCE, n);
      checkQuests();
    },
  });

  G.autosave -= dt;
  if (G.autosave <= 0) { G.autosave = 20; save(); }
}

requestAnimationFrame(frame);

// debug/testing hook
window.__voxel = { get G() { return G; }, get state() { return state; }, setState, startGame, gain, craft, useAction, selectSlot, input, keys, RECIPES, B, I, save };
