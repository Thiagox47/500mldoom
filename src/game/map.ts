export const MAP_W = 32;
export const MAP_H = 32;

// Mapa inspirado em de_dust2_doom:
// 1 = Parede de arenito/adobe (Dust 2 Sandstone)
// 2 = Caixas de suprimento de madeira (Dust 2 Crates)
// 3 = Portas Duplas / Batentes de madeira e metal (Dust 2 Double Doors)
// . = Chão de areia e poeira
const MAP_STR: string[] = [
  '11111111111111111111111111111111',
  '11111111111111111111111111111111',
  '11........11........11......2.11',
  '11........33........11......2.11',
  '11..22..............11..22....11',
  '11..22..................22....11',
  '11........3311................11',
  '11........1111................11',
  '11........1111................11',
  '111....1111111.........11.....11',
  '111....1111111....1111111.....11',
  '111....1111111....1111111.....11',
  '111....1111111....1111111.....11',
  '111....1111111....1111111.....11',
  '111....1111111....1111111.....11',
  '111....1111113....3111111.....11',
  '111....1111113....3111111.....11',
  '111...........11111111111.....11',
  '111...........11111111111.....11',
  '111....1111111....1111111.....11',
  '111....1111111....1111111.....11',
  '111....1111111....1111113....311',
  '111....1111111....1111113....311',
  '111....1111111....111111......11',
  '111....1111111....111111......11',
  '111....1111111....111111......11',
  '11............................11',
  '11............................11',
  '11............................11',
  '11111111111111111111111111111111',
  '11111111111111111111111111111111',
  '11111111111111111111111111111111',
];

export const FLOOR_TILES: { x: number; y: number }[] = (() => {
  const tiles: { x: number; y: number }[] = [];
  for (let ty = 0; ty < MAP_H; ty++) {
    for (let tx = 0; tx < MAP_W; tx++) {
      if (MAP_STR[ty][tx] === '.') tiles.push({ x: tx + 0.5, y: ty + 0.5 });
    }
  }
  return tiles;
})();

export function tileAt(tx: number, ty: number): string {
  if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return '1';
  return MAP_STR[ty][tx];
}

export function isWallTile(tx: number, ty: number): boolean {
  return tileAt(tx, ty) !== '.';
}

export function isWall(x: number, y: number): boolean {
  return isWallTile(Math.floor(x), Math.floor(y));
}

export function circleHits(x: number, y: number, r: number): boolean {
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  for (let oy = -1; oy <= 1; oy++) {
    for (let ox = -1; ox <= 1; ox++) {
      const cx = tx + ox;
      const cy = ty + oy;
      if (!isWallTile(cx, cy)) continue;
      const nx = Math.max(cx, Math.min(x, cx + 1));
      const ny = Math.max(cy, Math.min(y, cy + 1));
      const dx = x - nx;
      const dy = y - ny;
      if (dx * dx + dy * dy < r * r) return true;
    }
  }
  return false;
}

export function moveWithCollision(obj: { x: number; y: number }, dx: number, dy: number, r: number): void {
  if (!circleHits(obj.x + dx, obj.y, r)) obj.x += dx;
  if (!circleHits(obj.x, obj.y + dy, r)) obj.y += dy;
}

export interface SpawnPoint {
  x: number;
  y: number;
  angle: number;
}

// Spawns característicos de Dust 2:
export const PLAYER_SPAWN: SpawnPoint = { x: 16.0, y: 27.5, angle: -Math.PI / 2 }; // T-Spawn
export const SPAWN_HOST: SpawnPoint = { x: 16.0, y: 27.5, angle: -Math.PI / 2 };   // T-Spawn
export const SPAWN_CLIENT: SpawnPoint = { x: 16.0, y: 3.5, angle: Math.PI / 2 };    // CT-Spawn

export const DEATHMATCH_SPAWNS: SpawnPoint[] = [
  { x: 16.0, y: 27.5, angle: -Math.PI / 2 }, // Base TR
  { x: 16.0, y: 3.5, angle: Math.PI / 2 },    // Base CT
  { x: 26.5, y: 4.5, angle: Math.PI },        // Bombsite A
  { x: 5.5, y: 3.5, angle: 0 },               // Bombsite B
  { x: 27.0, y: 14.5, angle: -Math.PI / 2 },  // Long A (Rua)
  { x: 15.5, y: 11.5, angle: Math.PI / 2 },   // Meio (CT Mid)
  { x: 4.5, y: 13.5, angle: -Math.PI / 2 },   // Túneis Altos B
  { x: 26.5, y: 24.5, angle: -Math.PI / 2 },  // Fora do Longo
  { x: 20.0, y: 7.5, angle: 0 },              // Catwalk / Varanda A
  { x: 10.0, y: 17.5, angle: 0 },             // Túnel Baixo para Meio
];

export const ENEMY_SPAWNS: { x: number; y: number }[] = [
  { x: 5.5, y: 3.5 },   // Bombsite B
  { x: 26.5, y: 4.5 },  // Bombsite A
  { x: 17.5, y: 3.5 },  // Base CT
  { x: 15.5, y: 11.5 }, // Meio CT
  { x: 27.0, y: 12.5 }, // Long A
  { x: 4.5, y: 11.5 },  // Túnel Alto B
  { x: 19.5, y: 6.5 },  // Varanda A
  { x: 15.5, y: 23.5 }, // Meio Sul (Suicide)
];

export const ITEM_SPAWNS: { x: number; y: number; type: 'health' | 'ammo' }[] = [
  // Health Kits
  { x: 3.5, y: 3.5, type: 'health' },   // Bombsite B
  { x: 27.5, y: 3.5, type: 'health' },  // Bombsite A (Goose)
  { x: 13.5, y: 3.5, type: 'health' },  // Base CT
  { x: 14.5, y: 27.5, type: 'health' }, // Base TR
  { x: 27.5, y: 19.5, type: 'health' }, // Long A (Pit)
  { x: 8.5, y: 17.5, type: 'health' },  // Túnel Baixo
  // Munições
  { x: 15.5, y: 14.5, type: 'ammo' },   // Portas do Meio
  { x: 26.5, y: 20.5, type: 'ammo' },   // Portas do Longo
  { x: 4.5, y: 15.5, type: 'ammo' },    // Túnel Alto
  { x: 20.5, y: 8.5, type: 'ammo' },    // Catwalk
  { x: 27.5, y: 24.5, type: 'ammo' },   // Fora do Longo
  { x: 15.5, y: 22.5, type: 'ammo' },   // Meio Sul
];
