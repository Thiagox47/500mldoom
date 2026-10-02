import { lineOfSight } from '../engine/raycaster';
import { moveWithCollision } from './map';
import type { Player } from './player';
import type { Enemy, EnemyDef } from '../types';

export const IMP: EnemyDef = { health: 60, speed: 1.7, damage: 9, scale: 0.78, attackRange: 1.4 };

const RADIUS = 0.25;
const BOT_SKINS = ['botpadrao', 'bot01', 'bot02']; // Skins ativas no modo mata-mata
const BOT_NAMES = ['Jairo_500ml', 'Carlinhos_Sniper', 'Caveira_BR', 'Vitor_Doom', 'Chico_Bala', 'NoobSlayer', 'Capitao_Nox', 'Rei_do_Gole'];

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
        name: BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)],
        frags: 0,
        animTime: Math.random() * 10,
      });
    }
  }

  reset(spawns: { x: number; y: number }[], def: EnemyDef): void {
    this.list = [];
    this.spawn(spawns, def);
  }

  update(
    dt: number,
    player: Player,
    def: EnemyDef,
    onHitPlayer: (dmg: number) => void,
    isDeathmatch = false,
    onBotKillBot?: (killer: Enemy, victim: Enemy) => void,
  ): void {
    for (const e of this.list) {
      e.animTime += dt;
      if (e.state === 'dead') {
        e.deathTimer -= dt;
        continue;
      }
      if (e.hurtTimer > 0) e.hurtTimer -= dt;

      // Selecao de alvo: Player ou outro Bot
      let targetX = player.x;
      let targetY = player.y;
      let targetDist = Math.hypot(player.x - e.x, player.y - e.y);
      let targetIsPlayer = true;

      if (isDeathmatch) {
        // Se ja tem um bot alvo vivo e proximo, mantem foco
        if (e.targetBot && e.targetBot.state !== 'dead') {
          const d = Math.hypot(e.targetBot.x - e.x, e.targetBot.y - e.y);
          if (d < 14 && lineOfSight(e.x, e.y, e.targetBot.x, e.targetBot.y)) {
            targetX = e.targetBot.x;
            targetY = e.targetBot.y;
            targetDist = d;
            targetIsPlayer = false;
          } else {
            e.targetBot = null;
          }
        }

        // Se nao tem alvo fixo, busca o combatente mais proximo
        if (!e.targetBot) {
          let bestDist = (!player.dead && lineOfSight(e.x, e.y, player.x, player.y)) ? targetDist : 999;

          for (const other of this.list) {
            if (other === e || other.state === 'dead') continue;
            const d = Math.hypot(other.x - e.x, other.y - e.y);
            if (d < bestDist && d < 12 && lineOfSight(e.x, e.y, other.x, other.y)) {
              bestDist = d;
              e.targetBot = other;
              targetX = other.x;
              targetY = other.y;
              targetDist = d;
              targetIsPlayer = false;
            }
          }
        }
      }

      if (e.state === 'idle') {
        const canSee = targetIsPlayer
          ? (!player.dead && targetDist < 12 && lineOfSight(e.x, e.y, player.x, player.y))
          : (e.targetBot && e.targetBot.state !== 'dead' && targetDist < 12);
        if (canSee) e.state = 'chase';
        continue;
      }

      const dx = targetX - e.x;
      const dy = targetY - e.y;

      if (e.state === 'chase') {
        e.cooldown -= dt;
        if (targetDist < def.attackRange && e.cooldown <= 0) {
          e.state = 'attack';
          e.attackTimer = 0.45;
          continue;
        }
        if (targetDist > 0.35) {
          const sp = e.speed * dt;
          moveWithCollision(e, (dx / targetDist) * sp, (dy / targetDist) * sp, RADIUS);
        }
      } else if (e.state === 'attack') {
        e.attackTimer -= dt;
        if (e.attackTimer <= 0) {
          if (targetIsPlayer) {
            if (!player.dead && targetDist < def.attackRange + 0.3 && lineOfSight(e.x, e.y, player.x, player.y)) {
              onHitPlayer(def.damage + Math.random() * 4);
            }
          } else if (e.targetBot && e.targetBot.state !== 'dead') {
            const currentDist = Math.hypot(e.targetBot.x - e.x, e.targetBot.y - e.y);
            if (currentDist < def.attackRange + 0.4 && lineOfSight(e.x, e.y, e.targetBot.x, e.targetBot.y)) {
              const dmg = def.damage + Math.random() * 8;
              e.targetBot.health -= dmg;
              e.targetBot.hurtTimer = 0.2;
              // O bot atingido revida focando no atacante
              if (!e.targetBot.targetBot) e.targetBot.targetBot = e;
              if (e.targetBot.state === 'idle') e.targetBot.state = 'chase';

              if (e.targetBot.health <= 0) {
                e.targetBot.state = 'dead';
                e.targetBot.deathTimer = 0.5;
                e.frags = (e.frags || 0) + 1;
                if (onBotKillBot) onBotKillBot(e, e.targetBot);
                e.targetBot = null;
              }
            }
          }
          e.state = 'chase';
          e.cooldown = 0.7 + Math.random() * 0.4;
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
