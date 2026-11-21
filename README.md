# VOXEL: Ascent

A browser voxel survival game with a full progression arc. It needs no install and no build step: open it and play.

**▶ Play:** https://senswitchblxde.github.io/voxel/

## The goal
Light the **Beacon**. To craft it you need materials from every layer of the world, plus essence taken from monsters.

**Progression (14 objectives):**
Punch trees → crafting table → wooden pickaxe → stone age → stone tools → furnace & coal → survive the night → smelt iron → iron pickaxe → crystals deep underground → crystal pickaxe → hunt monsters for Void Essence → mine Core Ore near bedrock → craft and place the Beacon under open sky.

Several objectives give you an extra heart.

## Systems
- **Infinite procedural world:** hills, mountains with snow caps, lakes, beaches, forests, spaghetti caves and large caverns. Seeds are shareable.
- **Tool tiers:** Hand < Wood < Stone < Iron < Crystal. Each ore needs a minimum pickaxe tier, and better picks mine faster. Tools wear out.
- **Ore depth bands:** coal (y<56), iron (y<40), gold (y<22), crystal (y<15), core (y<9, deepstone only).
- **Crafting & smelting:** 18 recipes. Some need a nearby Crafting Table or Furnace.
- **Day/night cycle (10 min):** Shades rise at night and get stronger every night that passes. Crawlers hunt in dark caves, and they get tougher the deeper you go. Swords scale your damage.
- **Health:** fall damage, natural regen, apples (from leaves) and golden apples.
- **Lighting:** ambient occlusion, sky exposure (caves are dark), a lantern glow around the player, sunsets, stars and drifting clouds.
- **Autosave** to localStorage (only your block edits are stored, so saves stay tiny).
- **Touch controls** on phones and tablets: joystick, drag to look, tap to place.

## Controls
| Action | Desktop | Touch |
|---|---|---|
| Move | WASD | Left joystick (push far to sprint) |
| Look | Mouse | Drag anywhere |
| Jump / swim | Space | ⤒ |
| Sprint | Shift | Joystick edge |
| Mine / attack | Hold left-click | Hold ⛏ |
| Place / use / eat / open station | Right-click | ▣ or quick tap |
| Hotbar | 1–9, wheel | Tap slot |
| Inventory & crafting | E | ☰ |
| Pause | Esc | ❚❚ |

## Tech
Plain ES modules and [three.js](https://threejs.org) (vendored, minified). There is no build step, so GitHub Pages serves the repo as-is. All textures and icons are generated procedurally at startup.

```
index.html, style.css
src/main.js      game loop, input, HUD, inventory, crafting, quests, save
src/world.js     chunk generation, edits, meshing (AO + sky light shader)
src/physics.js   AABB collision, voxel raycast
src/mobs.js      Shades & Crawlers
src/data.js      blocks, items, recipes, quest line
src/textures.js  procedural texture atlas + item icons
src/noise.js     seeded Perlin noise
```

Run locally: `python3 -m http.server` in the repo, then open http://localhost:8000.
