// Procedural pixel-art texture atlas + item icons. No image assets needed.
import { T, B, I, BLOCKS, ITEMS } from './data.js';
import { makeRng } from './noise.js';

export const ATLAS_COLS = 8, ATLAS_ROWS = 4, TS = 16;

function clamp(v) { return v < 0 ? 0 : v > 255 ? 255 : v | 0; }

export function buildAtlas() {
  const cv = document.createElement('canvas');
  cv.width = ATLAS_COLS * TS; cv.height = ATLAS_ROWS * TS;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(cv.width, cv.height);
  const rng = makeRng(1337);

  function tile(t, fn) {
    const ox = (t % ATLAS_COLS) * TS, oy = Math.floor(t / ATLAS_COLS) * TS;
    const set = (x, y, c, a = 255) => {
      if (x < 0 || y < 0 || x >= TS || y >= TS) return;
      const i = ((oy + y) * cv.width + ox + x) * 4;
      img.data[i] = clamp(c[0]); img.data[i + 1] = clamp(c[1]); img.data[i + 2] = clamp(c[2]); img.data[i + 3] = a;
    };
    fn(set);
  }
  const vary = (c, v) => { const f = 1 + (rng() - 0.5) * v; return [c[0] * f, c[1] * f, c[2] * f]; };
  const fill = (set, c, v) => { for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) set(x, y, vary(c, v)); };
  const ore = (set, base, bv, col, n) => {
    fill(set, base, bv);
    for (let k = 0; k < n; k++) {
      const cx = 2 + Math.floor(rng() * 12), cy = 2 + Math.floor(rng() * 12);
      for (let j = 0; j < 4; j++) {
        const x = cx + Math.floor(rng() * 3) - 1, y = cy + Math.floor(rng() * 3) - 1;
        set(x, y, vary(col, 0.25));
      }
    }
  };
  const DIRT = [134, 96, 67], STONE = [125, 125, 128], GRASS = [92, 160, 56], PLANK = [176, 136, 82];

  tile(T.GRASS_TOP, s => fill(s, GRASS, 0.28));
  tile(T.DIRT, s => fill(s, DIRT, 0.3));
  tile(T.GRASS_SIDE, s => {
    fill(s, DIRT, 0.3);
    for (let x = 0; x < TS; x++) { const d = 3 + Math.floor(rng() * 3); for (let y = 0; y < d; y++) s(x, y, vary(GRASS, 0.25)); }
  });
  tile(T.SNOW, s => fill(s, [238, 244, 250], 0.06));
  tile(T.SNOW_SIDE, s => {
    fill(s, DIRT, 0.3);
    for (let x = 0; x < TS; x++) { const d = 3 + Math.floor(rng() * 3); for (let y = 0; y < d; y++) s(x, y, vary([238, 244, 250], 0.06)); }
  });
  tile(T.STONE, s => {
    fill(s, STONE, 0.16);
    for (let k = 0; k < 6; k++) { const x = Math.floor(rng() * 14), y = Math.floor(rng() * 16); s(x, y, [100, 100, 104]); s(x + 1, y, [100, 100, 104]); }
  });
  tile(T.COBBLE, s => {
    fill(s, [96, 96, 98], 0.12);
    for (let k = 0; k < 9; k++) {
      const x0 = Math.floor(rng() * 14), y0 = Math.floor(rng() * 14), w = 3 + Math.floor(rng() * 3), h = 2 + Math.floor(rng() * 3);
      for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
        const edge = y === y0 || x === x0 || y === y0 + h - 1 || x === x0 + w - 1;
        s(x % 16, y % 16, edge ? [70, 70, 72] : vary([140, 140, 142], 0.1));
      }
    }
  });
  tile(T.BRICK, s => {
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
      const row = Math.floor(y / 4), off = row % 2 ? 4 : 0;
      const edge = y % 4 === 3 || (x + off) % 8 === 7;
      s(x, y, edge ? [78, 78, 82] : vary([142, 142, 146], 0.08));
    }
  });
  tile(T.SAND, s => fill(s, [221, 208, 145], 0.1));
  tile(T.LOG_SIDE, s => {
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
      const dark = (x % 4 === 0) || rng() < 0.08;
      s(x, y, vary(dark ? [74, 54, 32] : [104, 78, 46], 0.1));
    }
  });
  tile(T.LOG_TOP, s => {
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
      const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
      const c = d > 6.5 ? [90, 66, 38] : (Math.floor(d) % 2 ? [176, 140, 86] : [150, 116, 70]);
      s(x, y, vary(c, 0.06));
    }
  });
  tile(T.LEAVES, s => {
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
      if (rng() < 0.2) s(x, y, [0, 0, 0], 0);
      else s(x, y, vary([56, 132, 40], 0.45));
    }
  });
  tile(T.PLANKS, s => {
    for (let y = 0; y < TS; y++) {
      const seam = Math.floor(rng() * 16);
      for (let x = 0; x < TS; x++) {
        const edge = y % 4 === 3 || (x === seam && y % 4 !== 3);
        s(x, y, edge ? [112, 84, 48] : vary(PLANK, 0.08));
      }
    }
  });
  tile(T.TABLE_TOP, s => {
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
      const edge = x === 0 || y === 0 || x === 15 || y === 15;
      const grid = x === 5 || x === 10 || y === 5 || y === 10;
      s(x, y, edge ? [90, 64, 36] : grid ? [130, 98, 58] : vary([186, 146, 92], 0.07));
    }
  });
  tile(T.TABLE_SIDE, s => {
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
      const edge = y % 4 === 3 || y < 2;
      s(x, y, edge ? [112, 84, 48] : vary(PLANK, 0.08));
    }
    for (let y = 4; y < 11; y++) { s(3, y, [60, 60, 64]); s(4, y, [60, 60, 64]); }
    for (let x = 2; x < 6; x++) s(x, 4, [150, 150, 155]);
    for (let y = 5; y < 12; y++) s(11, y, [90, 60, 30]);
    for (let x = 9; x < 14; x++) s(x, 5, [160, 160, 165]);
  });
  tile(T.FURNACE_TOP, s => fill(s, [110, 110, 112], 0.1));
  tile(T.FURNACE_FRONT, s => {
    fill(s, [104, 104, 106], 0.14);
    for (let y = 8; y < 14; y++) for (let x = 4; x < 12; x++) {
      const inner = y > 8 && x > 4 && x < 11;
      s(x, y, inner ? (y > 10 ? vary([255, 150, 40], 0.3) : [30, 24, 20]) : [50, 50, 52]);
    }
    for (let x = 2; x < 14; x++) s(x, 3, [70, 70, 72]);
  });
  tile(T.COAL_ORE, s => ore(s, STONE, 0.16, [28, 28, 30], 6));
  tile(T.IRON_ORE, s => ore(s, STONE, 0.16, [222, 176, 140], 5));
  tile(T.GOLD_ORE, s => ore(s, STONE, 0.16, [252, 214, 60], 5));
  tile(T.CRYSTAL_ORE, s => ore(s, [70, 70, 86], 0.15, [90, 235, 255], 5));
  tile(T.CORE_ORE, s => ore(s, [46, 40, 58], 0.2, [214, 70, 255], 6));
  tile(T.DEEPSTONE, s => {
    for (let y = 0; y < TS; y++) { const r = rng() < 0.3; for (let x = 0; x < TS; x++) s(x, y, vary(r ? [62, 62, 76] : [74, 74, 88], 0.12)); }
  });
  tile(T.BEDROCK, s => fill(s, [62, 62, 62], 0.9));
  tile(T.WATER, s => {
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
      const w = Math.sin((x + y * 0.5) * 0.8) > 0.85;
      s(x, y, w ? [120, 170, 255] : vary([48, 96, 214], 0.1), 255);
    }
  });
  tile(T.GLASS, s => {
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
      const edge = x === 0 || y === 0 || x === 15 || y === 15;
      const glint = (x - y === 3 || x - y === 4) && x > 4 && x < 11;
      if (edge) s(x, y, [210, 235, 240]); else if (glint) s(x, y, [255, 255, 255], 200); else s(x, y, [0, 0, 0], 0);
    }
  });
  tile(T.BEACON, s => {
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
      const edge = x < 2 || y < 2 || x > 13 || y > 13;
      const d = Math.hypot(x - 7.5, y - 7.5);
      s(x, y, edge ? [30, 24, 48] : d < 4 ? [200, 255, 255] : vary([90, 220, 240], 0.15));
    }
  });
  tile(T.BEACON_TOP, s => {
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
      const edge = x < 2 || y < 2 || x > 13 || y > 13;
      const d = Math.hypot(x - 7.5, y - 7.5);
      s(x, y, edge ? [30, 24, 48] : d < 3 ? [255, 255, 255] : d < 5 ? [160, 250, 255] : [60, 190, 220]);
    }
  });
  ctx.putImageData(img, 0, 0);
  return cv;
}

// ---------- item icons ----------
const ICON = 32;
const iconCache = {};

function drawCubeIcon(ctx, atlas, b) {
  const [top, , side] = BLOCKS[b].tex;
  const src = t => [(t % ATLAS_COLS) * TS, Math.floor(t / ATLAS_COLS) * TS];
  ctx.imageSmoothingEnabled = false;
  const faces = [
    { t: top, m: [14 / 16, -7 / 16, 14 / 16, 7 / 16, 2, 8], shade: 0 },
    { t: side, m: [14 / 16, 7 / 16, 0, 15 / 16, 2, 8], shade: 0.22 },
    { t: side, m: [14 / 16, -7 / 16, 0, 15 / 16, 16, 15], shade: 0.4 },
  ];
  for (const f of faces) {
    const [sx, sy] = src(f.t);
    ctx.setTransform(...f.m);
    ctx.drawImage(atlas, sx, sy, TS, TS, 0, 0, TS, TS);
    if (f.shade) { ctx.fillStyle = `rgba(0,0,0,${f.shade})`; ctx.fillRect(0, 0, TS, TS); }
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

const TIER_COL = {
  [I.WOOD_PICK]: '#b0874f', [I.WOOD_SWORD]: '#b0874f',
  [I.STONE_PICK]: '#9a9a9e', [I.STONE_SWORD]: '#9a9a9e',
  [I.IRON_PICK]: '#e8e2da', [I.IRON_SWORD]: '#e8e2da',
  [I.CRYSTAL_PICK]: '#5ff0ff', [I.CRYSTAL_SWORD]: '#5ff0ff',
};

function px(ctx, x, y, c) { ctx.fillStyle = c; ctx.fillRect(x * 2, y * 2, 2, 2); }
function drawMap(ctx, rows, pal) {
  rows.forEach((r, y) => [...r].forEach((ch, x) => { if (pal[ch]) px(ctx, x, y, pal[ch]); }));
}
function darken(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) * f, g = ((n >> 8) & 255) * f, b = (n & 255) * f;
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

const PICK = [
  '................',
  '...hHHHHHHHHh...',
  '..hHHHHHHHHHHh..',
  '.hHh...SS...hHh.',
  '.Hh....SS....hH.',
  '.h.....SS.....h.',
  '.......SS.......',
  '.......SS.......',
  '.......SS.......',
  '.......SS.......',
  '.......SS.......',
  '.......SS.......',
  '.......SS.......',
  '.......ss.......',
  '................',
  '................'];
const SWORD = [
  '.............hH.',
  '............hHh.',
  '...........hHh..',
  '..........hHh...',
  '.........hHh....',
  '........hHh.....',
  '.......hHh......',
  '...g..hHh.......',
  '...gghHh........',
  '....ggh.........',
  '....Sgg.........',
  '...SS.gg........',
  '..SS............',
  '.ss.............',
  '................',
  '................'];

function drawItem(ctx, id) {
  const S = '#8a6236', s = '#5c3f1f';
  if (TIER_COL[id]) {
    const H = TIER_COL[id], h = darken(H, 0.65);
    const isPick = ITEMS[id].tool === 'pick';
    drawMap(ctx, isPick ? PICK : SWORD, { H, h, S, s, g: '#6b4a2a' });
    return;
  }
  switch (id) {
    case I.STICK:
      for (let i = 0; i < 11; i++) { px(ctx, 3 + i, 13 - i, S); px(ctx, 4 + i, 13 - i, s); }
      break;
    case I.COAL:
      drawMap(ctx, ['', '', '', '.....kkkk', '....kKKKKk', '...kKKkKKKk', '...kKKKKKKkk', '..kKKKkKKKKk', '..kKKKKKKKk', '...kKKKKKk', '....kkkkk'],
        { k: '#111', K: '#333' });
      break;
    case I.IRON_INGOT: case I.GOLD_INGOT: {
      const c = id === I.IRON_INGOT ? '#ddd6cc' : '#ffd43c';
      drawMap(ctx, ['', '', '', '', '', '....dddddddd', '...dLLLLLLLLd', '..dLCCCCCCCCLd', '.dCCCCCCCCCCCCd', '.dddddddddddddd'],
        { d: darken(c, 0.55), L: '#fff', C: c });
      break;
    }
    case I.CRYSTAL: case I.CORE_SHARD: {
      const c = id === I.CRYSTAL ? '#5ff0ff' : '#d246ff';
      drawMap(ctx, ['', '.......d', '......dLd', '.....dLCCd', '....dLCCCCd', '...dLCCCCCCd', '..dLCCCCCCCCd', '...dCCCCCCCd', '....dCCCCCd', '.....dCCCd', '......dCd', '.......d'],
        { d: darken(c, 0.5), L: '#fff', C: c });
      break;
    }
    case I.ESSENCE:
      drawMap(ctx, ['', '', '.....pppppp', '....pPPPPPPp', '...pPPgggPPPp', '...pPgGGGgPPp', '...pPgGWGgPPp', '...pPgGGGgPPp', '...pPPgggPPPp', '....pPPPPPPp', '.....pppppp'],
        { p: '#3a1450', P: '#7a2aa8', g: '#46d18a', G: '#8fffc4', W: '#fff' });
      break;
    case I.APPLE: case I.GOLDEN_APPLE: {
      const c = id === I.APPLE ? '#d8262c' : '#ffcf2e';
      drawMap(ctx, ['', '.......s', '.......sLL', '....rr.s.rr', '...rCCrrCCCr', '..rCWCCCCCCCr', '..rCWCCCCCCCr', '..rCCCCCCCCCr', '..rCCCCCCCCCr', '...rCCCCCCCr', '....rCCCCCr', '.....rr.rr'],
        { r: darken(c, 0.55), C: c, W: '#fff', s: '#5c3f1f', L: '#4caf50' });
      break;
    }
  }
}

export function getIcon(id, atlas) {
  if (iconCache[id]) return iconCache[id];
  const cv = document.createElement('canvas');
  cv.width = cv.height = ICON;
  const ctx = cv.getContext('2d');
  if (ITEMS[id]?.block) drawCubeIcon(ctx, atlas, ITEMS[id].block);
  else drawItem(ctx, id);
  return (iconCache[id] = cv.toDataURL());
}
