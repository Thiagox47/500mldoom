import { lineOfSight } from '../engine/raycaster';
import type { EnemyDef, ItemType } from '../types';
import { FLOOR_TILES } from './map';
import type { Player } from './player';
import { Enemies } from './enemies';
import { Items } from './items';

const MAX_ALIVE = 8;
const SPAWN_INTERVAL = 2;
const MIN_ENEMY_DIST = 7;
const MAX_ITEMS_ACTIVE = 7;
const ITEM_INTERVAL = 4;
const MIN_ITEM_DIST = 4;

export class Spawner {
  private enemyTimer = SPAWN_INTERVAL;
  private itemTimer = ITEM_INTERVAL;

  constructor(private enemies: Enemies, private items: Items) {}

  reset(): void {
    this.enemyTimer = SPAWN_INTERVAL;
    this.itemTimer = ITEM_INTERVAL;
  }

  update(dt: number, player: Player, def: EnemyDef, maxEnemies = MAX_ALIVE): void {
    if (maxEnemies > 0) {
      this.enemyTimer -= dt;
      if (this.enemyTimer <= 0) {
        this.enemyTimer = SPAWN_INTERVAL;
        if (this.enemies.aliveCount < maxEnemies) {
          const spot = pickSpot(player, this.enemies.list, MIN_ENEMY_DIST, true);
          if (spot) this.enemies.spawnOne(spot.x, spot.y, def);
        }
      }
    }


    this.itemTimer -= dt;
    if (this.itemTimer <= 0) {
      this.itemTimer = ITEM_INTERVAL;
      if (this.items.activeCount < MAX_ITEMS_ACTIVE) {
        const spot = pickSpot(player, this.items.list, MIN_ITEM_DIST, true);
        if (spot) this.items.spawnOne(spot.x, spot.y, pickItemType(player));
      }
    }
  }
}

function pickItemType(player: Player): ItemType {
  if (player.ammo < 12) return 'ammo';
  if (player.health < 40) return 'health';
  return Math.random() < 0.5 ? 'health' : 'ammo';
}

function pickSpot(
  player: Player,
  occupied: { x: number; y: number }[],
  minDist: number,
  avoidLOS: boolean,
): { x: number; y: number } | null {
  for (let attempt = 0; attempt < 40; attempt++) {
    const tile = FLOOR_TILES[Math.floor(Math.random() * FLOOR_TILES.length)];
    const dx = tile.x - player.x;
    const dy = tile.y - player.y;
    if (dx * dx + dy * dy < minDist * minDist) continue;
    if (avoidLOS && lineOfSight(tile.x, tile.y, player.x, player.y)) continue;
    let clash = false;
    for (const o of occupied) {
      const ox = tile.x - o.x;
      const oy = tile.y - o.y;
      if (ox * ox + oy * oy < 1) {
        clash = true;
        break;
      }
    }
    if (clash) continue;
    return tile;
  }
  return null;
}
