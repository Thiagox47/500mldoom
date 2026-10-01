import { lineOfSight } from '../engine/raycaster';
import { moveWithCollision } from './map';
import type { Player } from './player';
import type { Enemy, EnemyDef } from '../types';

export const IMP: EnemyDef = { health: 60, speed: 1.7, damage: 9, scale: 0.78, attackRange: 1.4 };

const RADIUS = 0.25;
const BOT_SKINS = ['botpadrao', 'bot01']; // Skins ativas no modo mata-mata

export class Enemies {
  list: Enemy[] = [];

  get aliveCount(): number {
    return this.list.filter((e) => e.state !== 'dead').length;
  }

  spawnOne(x: number, y: number, def: EnemyDef): void {
    this.spawn([{ x, y }], def);
  }

  spawn(spawns: { x: number; y: number }[], def: EnemyDef): void {
    for (const s of spawns) {
      this.list.push({
        x: s.x,
        y: s.y,
        health: def.health,
        speed: def.speed * (0.85 + Math.random() * 0.3),
        state: 'idle',
        hurtTimer: 0,
        attackTimer: 0,
        cooldown: 0,
        deathTimer: 0,
        skin: BOT_SKINS[Math.floor(Math.random() * BOT_SKINS.length)],
        animTime: Math.random() * 10,
      });
    }
  }

  reset(spawns: { x: number; y: number }[], def: EnemyDef): void {
    this.list = [];
    this.spawn(spawns, def);
  }

  update(dt: number, player: Player, def: EnemyDef, onHitPlayer: (dmg: number) => void): void {
    for (const e of this.list) {
      e.animTime += dt;
      if (e.state === 'dead') {
        e.deathTimer -= dt;
        continue;
      }
      if (e.hurtTimer > 0) e.hurtTimer -= dt;

      const dx = player.x - e.x;
      const dy = player.y - e.y;
      const dist = Math.hypot(dx, dy);

      if (e.state === 'idle') {
        if (!player.dead && dist < 11 && lineOfSight(e.x, e.y, player.x, player.y)) e.state = 'chase';
        continue;
      }

      if (e.state === 'chase') {
        e.cooldown -= dt;
        if (dist < def.attackRange && e.cooldown <= 0) {
          e.state = 'attack';
          e.attackTimer = 0.45;
          continue;
        }
        if (dist > 0.35) {
          const sp = e.speed * dt;
          moveWithCollision(e, (dx / dist) * sp, (dy / dist) * sp, RADIUS);
        }
      } else if (e.state === 'attack') {
        e.attackTimer -= dt;
        if (e.attackTimer <= 0) {
          if (!player.dead && dist < def.attackRange + 0.3 && lineOfSight(e.x, e.y, player.x, player.y)) {
            onHitPlayer(def.damage + Math.random() * 4);
          }
          e.state = 'chase';
          e.cooldown = 0.8;
        }
      }
    }

    this.separate();

    if (this.list.some((e) => e.state === 'dead' && e.deathTimer <= 0)) {
      this.list = this.list.filter((e) => e.state !== 'dead' || e.deathTimer > 0);
    }
  }

  private separate(): void {
    for (let i = 0; i < this.list.length; i++) {
      for (let j = i + 1; j < this.list.length; j++) {
        const a = this.list[i];
        const b = this.list[j];
        if (a.state === 'dead' || b.state === 'dead') continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < 0.36 && d2 > 0.0001) {
          const d = Math.sqrt(d2);
          const push = (0.6 - d) * 0.5;
          moveWithCollision(a, (-dx / d) * push, (-dy / d) * push, RADIUS);
          moveWithCollision(b, (dx / d) * push, (dy / d) * push, RADIUS);
        }
      }
    }
  }

  damage(enemy: Enemy, amount: number): boolean {
    if (enemy.state === 'dead') return false;
    enemy.health -= amount;
    enemy.hurtTimer = 0.15;
    if (enemy.state === 'idle') enemy.state = 'chase';
    if (enemy.health <= 0) {
      enemy.state = 'dead';
      enemy.deathTimer = 0.5;
      return true;
    }
    return false;
  }
}
