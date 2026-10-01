import type { Item, ItemType } from '../types';
import type { Player } from './player';
import type { Sfx } from '../engine/sfx';

export class Items {
  list: Item[] = [];

  get activeCount(): number {
    return this.list.filter((i) => i.active).length;
  }

  spawnOne(x: number, y: number, type: ItemType): void {
    this.list.push({ x, y, type, active: true });
  }

  spawn(spawns: { x: number; y: number; type: ItemType }[]): void {
    this.list = spawns.map((s) => ({ ...s, active: true }));
  }

  update(player: Player, sfx: Sfx, onPickup: (type: ItemType) => void): void {
    for (const item of this.list) {
      if (!item.active) continue;
      if (item.type === 'health' && player.health >= 100) continue;
      const dx = player.x - item.x;
      const dy = player.y - item.y;
      if (dx * dx + dy * dy < 0.3) {
        item.active = false;
        sfx.pickup();
        onPickup(item.type);
      }
    }
  }
}
