export const MAP_W = 24;
export const MAP_H = 24;

// 1 = tijolo, 2 = pedra, 3 = painel tecnologico
const MAP_STR: string[] = [
  '111111111111111111111111',
  '1......................1',
  '1.22................22.1',
  '1.22.......33.......22.1',
  '1..........33..........1',
  '1......................1',
  '1..222222....222222....1',
  '1......................1',
  '1..22..............22..1',
  '1..22..............22..1',
  '1......................1',
  '1....1............1....1',
  '1....1............1....1',
  '1......................1',
  '1..222222....222222....1',
  '1.........2..2.........1',
  '1.........2..2.........1',
  '1.........2..2.........1',
  '1......................1',
  '1......................1',
  '1.........1..1.........1',
  '1.........1..1.........1',
  '1.........1..1.........1',
  '111111111111111111111111',
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

export const PLAYER_SPAWN = { x: 12, y: 21.5, angle: -Math.PI / 2 };

export const ENEMY_SPAWNS: { x: number; y: number }[] = [
  { x: 12, y: 8.5 },
  { x: 5.5, y: 10.5 },
  { x: 17, y: 12.5 },
  { x: 4, y: 2.5 },
  { x: 19, y: 3.5 },
  { x: 12, y: 16.5 },
];

export const ITEM_SPAWNS: { x: number; y: number; type: 'health' | 'ammo' }[] = [
  { x: 4, y: 7.5, type: 'health' },
  { x: 19, y: 7.5, type: 'health' },
  { x: 2, y: 1.5, type: 'health' },
  { x: 12, y: 6.5, type: 'ammo' },
  { x: 21, y: 1.5, type: 'ammo' },
  { x: 6, y: 12.5, type: 'ammo' },
  { x: 12, y: 19.5, type: 'ammo' },
];
