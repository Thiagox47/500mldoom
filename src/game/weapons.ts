import { isWall } from './map';
import type { Enemy } from '../types';

export function hitscan(px: number, py: number, dirX: number, dirY: number, enemies: Enemy[]): Enemy | null {
  for (let d = 0.4; d < 24; d += 0.06) {
    const x = px + dirX * d;
    const y = py + dirY * d;
    if (isWall(x, y)) return null;
    for (const e of enemies) {
      if (e.state === 'dead') continue;
      const ex = x - e.x;
      const ey = y - e.y;
      if (ex * ex + ey * ey < 0.12) return e;
    }
  }
  return null;
}

export class Weapon {
  cooldown = 0;
  flash = 0;
  recoil = 0;

  update(dt: number): void {
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.flash = Math.max(0, this.flash - dt);
    this.recoil = Math.max(0, this.recoil - dt * 5);
  }

  canFire(): boolean {
    return this.cooldown <= 0;
  }

  fire(): void {
    this.cooldown = 0.45;
    this.flash = 0.08;
    this.recoil = 1;
  }

  dryFire(): void {
    this.cooldown = 0.35;
  }
}
