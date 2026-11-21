// Blocks, items, recipes and the quest line.

export const T = {
  GRASS_TOP: 0, GRASS_SIDE: 1, DIRT: 2, STONE: 3, COBBLE: 4, SAND: 5, LOG_SIDE: 6, LOG_TOP: 7,
  LEAVES: 8, PLANKS: 9, TABLE_TOP: 10, TABLE_SIDE: 11, FURNACE_FRONT: 12, FURNACE_TOP: 13, COAL_ORE: 14, IRON_ORE: 15,
  GOLD_ORE: 16, CRYSTAL_ORE: 17, CORE_ORE: 18, BEDROCK: 19, WATER: 20, GLASS: 21, BEACON: 22, DEEPSTONE: 23,
  SNOW: 24, SNOW_SIDE: 25, BEACON_TOP: 26, BRICK: 27,
};

export const B = {
  AIR: 0, GRASS: 1, DIRT: 2, STONE: 3, COBBLE: 4, SAND: 5, LOG: 6, LEAVES: 7, PLANKS: 8, TABLE: 9,
  FURNACE: 10, COAL_ORE: 11, IRON_ORE: 12, GOLD_ORE: 13, CRYSTAL_ORE: 14, CORE_ORE: 15, BEDROCK: 16,
  WATER: 17, GLASS: 18, BEACON: 19, DEEPSTONE: 20, SNOW: 21, BRICK: 22,
};

export const I = {
  STICK: 100, COAL: 101, IRON_INGOT: 102, GOLD_INGOT: 103, CRYSTAL: 104, CORE_SHARD: 105, ESSENCE: 106,
  APPLE: 107, GOLDEN_APPLE: 108,
  WOOD_PICK: 110, STONE_PICK: 111, IRON_PICK: 112, CRYSTAL_PICK: 113,
  WOOD_SWORD: 120, STONE_SWORD: 121, IRON_SWORD: 122, CRYSTAL_SWORD: 123,
};

export const TIER_NAMES = ['Hand', 'Wooden Pickaxe', 'Stone Pickaxe', 'Iron Pickaxe', 'Crystal Pickaxe'];

// tex: [top, bottom, side]. hard: seconds to break at speed 1. tier: minimum pickaxe tier.
export const BLOCKS = [];
function blk(id, name, tex, o = {}) {
  BLOCKS[id] = Object.assign({
    id, name, tex, mat: 'soil', hard: 1, tier: 0, drop: id,
    solid: true, opaque: true, cull: false,
  }, o);
}
blk(B.AIR, 'Air', [0, 0, 0], { solid: false, opaque: false, drop: 0 });
blk(B.GRASS, 'Grass', [T.GRASS_TOP, T.DIRT, T.GRASS_SIDE], { hard: 0.7, drop: B.DIRT });
blk(B.DIRT, 'Dirt', [T.DIRT, T.DIRT, T.DIRT], { hard: 0.6 });
blk(B.STONE, 'Stone', [T.STONE, T.STONE, T.STONE], { mat: 'rock', hard: 3, tier: 1, drop: B.COBBLE });
blk(B.COBBLE, 'Cobblestone', [T.COBBLE, T.COBBLE, T.COBBLE], { mat: 'rock', hard: 3.2, tier: 1 });
blk(B.SAND, 'Sand', [T.SAND, T.SAND, T.SAND], { hard: 0.6 });
blk(B.LOG, 'Log', [T.LOG_TOP, T.LOG_TOP, T.LOG_SIDE], { mat: 'wood', hard: 1.6 });
blk(B.LEAVES, 'Leaves', [T.LEAVES, T.LEAVES, T.LEAVES], { mat: 'plant', hard: 0.25, opaque: false, drop: 0 });
blk(B.PLANKS, 'Planks', [T.PLANKS, T.PLANKS, T.PLANKS], { mat: 'wood', hard: 1.2 });
blk(B.TABLE, 'Crafting Table', [T.TABLE_TOP, T.PLANKS, T.TABLE_SIDE], { mat: 'wood', hard: 1.5, station: 'table' });
blk(B.FURNACE, 'Furnace', [T.FURNACE_TOP, T.FURNACE_TOP, T.FURNACE_FRONT], { mat: 'rock', hard: 3.5, tier: 1, station: 'furnace' });
blk(B.COAL_ORE, 'Coal Ore', [T.COAL_ORE, T.COAL_ORE, T.COAL_ORE], { mat: 'rock', hard: 3.5, tier: 1, drop: I.COAL });
blk(B.IRON_ORE, 'Iron Ore', [T.IRON_ORE, T.IRON_ORE, T.IRON_ORE], { mat: 'rock', hard: 4.5, tier: 2 });
blk(B.GOLD_ORE, 'Gold Ore', [T.GOLD_ORE, T.GOLD_ORE, T.GOLD_ORE], { mat: 'rock', hard: 5, tier: 3 });
blk(B.CRYSTAL_ORE, 'Crystal Ore', [T.CRYSTAL_ORE, T.CRYSTAL_ORE, T.CRYSTAL_ORE], { mat: 'rock', hard: 6, tier: 3, drop: I.CRYSTAL });
blk(B.CORE_ORE, 'Core Ore', [T.CORE_ORE, T.CORE_ORE, T.CORE_ORE], { mat: 'rock', hard: 8, tier: 4, drop: I.CORE_SHARD });
blk(B.BEDROCK, 'Bedrock', [T.BEDROCK, T.BEDROCK, T.BEDROCK], { mat: 'rock', hard: Infinity, tier: 99, drop: 0 });
blk(B.WATER, 'Water', [T.WATER, T.WATER, T.WATER], { solid: false, opaque: false, drop: 0, cull: true });
blk(B.GLASS, 'Glass', [T.GLASS, T.GLASS, T.GLASS], { mat: 'glass', hard: 0.5, opaque: false, cull: true });
blk(B.BEACON, 'Beacon', [T.BEACON_TOP, T.BEACON, T.BEACON], { mat: 'rock', hard: 4, tier: 1 });
blk(B.DEEPSTONE, 'Deepstone', [T.DEEPSTONE, T.DEEPSTONE, T.DEEPSTONE], { mat: 'rock', hard: 5, tier: 1 });
blk(B.SNOW, 'Snow', [T.SNOW, T.DIRT, T.SNOW_SIDE], { hard: 0.5 });
blk(B.BRICK, 'Stone Bricks', [T.BRICK, T.BRICK, T.BRICK], { mat: 'rock', hard: 3.5, tier: 1 });

export const ITEMS = {};
for (const b of BLOCKS) if (b && b.id !== B.AIR && b.id !== B.WATER) ITEMS[b.id] = { name: b.name, block: b.id, stack: 64 };
const item = (id, o) => { ITEMS[id] = Object.assign({ stack: 64 }, o); };
item(I.STICK, { name: 'Stick' });
item(I.COAL, { name: 'Coal' });
item(I.IRON_INGOT, { name: 'Iron Ingot' });
item(I.GOLD_INGOT, { name: 'Gold Ingot' });
item(I.CRYSTAL, { name: 'Crystal' });
item(I.CORE_SHARD, { name: 'Core Shard' });
item(I.ESSENCE, { name: 'Void Essence' });
item(I.APPLE, { name: 'Apple', food: 5 });
item(I.GOLDEN_APPLE, { name: 'Golden Apple', food: 16 });
item(I.WOOD_PICK, { name: 'Wooden Pickaxe', stack: 1, tool: 'pick', tier: 1, speed: 2, dur: 70, dmg: 2 });
item(I.STONE_PICK, { name: 'Stone Pickaxe', stack: 1, tool: 'pick', tier: 2, speed: 3.5, dur: 160, dmg: 3 });
item(I.IRON_PICK, { name: 'Iron Pickaxe', stack: 1, tool: 'pick', tier: 3, speed: 5.5, dur: 400, dmg: 4 });
item(I.CRYSTAL_PICK, { name: 'Crystal Pickaxe', stack: 1, tool: 'pick', tier: 4, speed: 9, dur: 1600, dmg: 5 });
item(I.WOOD_SWORD, { name: 'Wooden Sword', stack: 1, tool: 'sword', dur: 70, dmg: 4 });
item(I.STONE_SWORD, { name: 'Stone Sword', stack: 1, tool: 'sword', dur: 160, dmg: 6 });
item(I.IRON_SWORD, { name: 'Iron Sword', stack: 1, tool: 'sword', dur: 400, dmg: 9 });
item(I.CRYSTAL_SWORD, { name: 'Crystal Sword', stack: 1, tool: 'sword', dur: 1600, dmg: 14 });

// st: required nearby station ('table' | 'furnace')
export const RECIPES = [
  { out: [B.PLANKS, 4], in: [[B.LOG, 1]] },
  { out: [I.STICK, 4], in: [[B.PLANKS, 2]] },
  { out: [B.TABLE, 1], in: [[B.PLANKS, 4]] },
  { out: [I.WOOD_PICK, 1], in: [[B.PLANKS, 3], [I.STICK, 2]], st: 'table' },
  { out: [I.WOOD_SWORD, 1], in: [[B.PLANKS, 2], [I.STICK, 1]], st: 'table' },
  { out: [I.STONE_PICK, 1], in: [[B.COBBLE, 3], [I.STICK, 2]], st: 'table' },
  { out: [I.STONE_SWORD, 1], in: [[B.COBBLE, 2], [I.STICK, 1]], st: 'table' },
  { out: [B.FURNACE, 1], in: [[B.COBBLE, 8]], st: 'table' },
  { out: [I.IRON_INGOT, 1], in: [[B.IRON_ORE, 1], [I.COAL, 1]], st: 'furnace' },
  { out: [I.GOLD_INGOT, 1], in: [[B.GOLD_ORE, 1], [I.COAL, 1]], st: 'furnace' },
  { out: [B.GLASS, 2], in: [[B.SAND, 2], [I.COAL, 1]], st: 'furnace' },
  { out: [B.BRICK, 4], in: [[B.COBBLE, 4]], st: 'table' },
  { out: [I.IRON_PICK, 1], in: [[I.IRON_INGOT, 3], [I.STICK, 2]], st: 'table' },
  { out: [I.IRON_SWORD, 1], in: [[I.IRON_INGOT, 2], [I.STICK, 1]], st: 'table' },
  { out: [I.CRYSTAL_PICK, 1], in: [[I.CRYSTAL, 3], [I.IRON_INGOT, 2], [I.STICK, 2]], st: 'table' },
  { out: [I.CRYSTAL_SWORD, 1], in: [[I.CRYSTAL, 2], [I.IRON_INGOT, 1], [I.STICK, 1]], st: 'table' },
  { out: [I.GOLDEN_APPLE, 1], in: [[I.APPLE, 1], [I.GOLD_INGOT, 2]], st: 'table' },
  { out: [B.BEACON, 1], in: [[I.CORE_SHARD, 3], [I.GOLD_INGOT, 4], [B.GLASS, 4], [I.ESSENCE, 6]], st: 'table' },
];

// s: stats helper { got(id), crafted(id), nights, beaconLit }
export const QUESTS = [
  { title: 'Punch a tree', desc: 'Hold left-click on a tree trunk. Collect 4 Logs.', check: s => s.got(B.LOG) >= 4 },
  { title: 'Workbench', desc: 'Press E. Turn logs into Planks, then craft a Crafting Table.', check: s => s.crafted(B.TABLE) >= 1 },
  { title: 'First tool', desc: 'Place the table, right-click it and craft a Wooden Pickaxe.', check: s => s.crafted(I.WOOD_PICK) >= 1 },
  { title: 'Stone age', desc: 'Mine 12 Cobblestone from stone.', check: s => s.got(B.COBBLE) >= 12 },
  { title: 'Stone tools', desc: 'Craft a Stone Pickaxe and a Stone Sword.', check: s => s.crafted(I.STONE_PICK) >= 1 && s.crafted(I.STONE_SWORD) >= 1, reward: 2 },
  { title: 'Heat', desc: 'Mine 3 Coal and craft a Furnace.', check: s => s.got(I.COAL) >= 3 && s.crafted(B.FURNACE) >= 1 },
  { title: 'Survive the night', desc: 'Shades rise after dusk and get stronger every night. Live to see dawn.', check: s => s.nights >= 1, reward: 2 },
  { title: 'Iron age', desc: 'Mine Iron Ore (below y=40) and smelt 3 Iron Ingots at a furnace.', check: s => s.crafted(I.IRON_INGOT) >= 3 },
  { title: 'Iron tools', desc: 'Craft an Iron Pickaxe. It can mine Gold and Crystal.', check: s => s.crafted(I.IRON_PICK) >= 1, reward: 2 },
  { title: 'The deep', desc: 'Mine 3 Crystals (below y=15). Crawlers lurk in the dark.', check: s => s.got(I.CRYSTAL) >= 3 },
  { title: 'Crystal pickaxe', desc: 'Craft a Crystal Pickaxe, the only tool that breaks Core Ore.', check: s => s.crafted(I.CRYSTAL_PICK) >= 1, reward: 2 },
  { title: 'Hunter', desc: 'Collect 6 Void Essence from slain monsters.', check: s => s.got(I.ESSENCE) >= 6 },
  { title: 'Heart of the world', desc: 'Mine 3 Core Shards from Core Ore near bedrock (y<9). Also smelt 4 Gold and 4 Glass.', check: s => s.got(I.CORE_SHARD) >= 3, reward: 2 },
  { title: 'Light the Beacon', desc: 'Craft the Beacon and place it under the open sky.', check: s => s.beaconLit },
];
