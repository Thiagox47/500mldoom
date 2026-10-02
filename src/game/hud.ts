import type { Assets } from '../engine/assets';
import type { Enemy, Item } from '../types';
import { MAP_H, MAP_W, tileAt } from './map';
import type { Player } from './player';
import type { Weapon } from './weapons';

export interface KillFeedItem {
  text: string;
  timer: number;
}

export interface RemotePlayerHudInfo {
  id?: string;
  x: number;
  y: number;
  angle: number;
  name: string;
  frags: number;
  dead: boolean;
}

export interface SpottedPing {
  id: string;
  x: number;
  y: number;
  timer: number;
}

export interface HudInfo {
  player: Player;
  enemies: Enemy[];
  items: Item[];
  weapon: Weapon;
  kills: number;
  damageFlash: number;
  pickupFlash: number;
  gameMode?: 'single' | 'multiplayer';
  playerName?: string;
  killFeed?: KillFeedItem[];
  remotePlayers?: RemotePlayerHudInfo[];
  spottedPings?: SpottedPing[];
  respawnCountdown?: number;
  spawnShieldTimer?: number;
}

export class Hud {
  showMinimap = true;

  constructor(
    private ctx: CanvasRenderingContext2D,
    private assets: Assets,
    private W: number,
    private viewH: number,
    private barH: number,
  ) {}

  draw(info: HudInfo): void {
    this.drawWeapon(info);
    this.drawBar(info);
    this.drawCrosshair();
    this.drawFlashes(info);
    if (info.gameMode === 'multiplayer') {
      this.drawMultiplayerOverlay(info);
    }
    if (info.spawnShieldTimer && info.spawnShieldTimer > 0) {
      this.drawShieldOverlay(info.spawnShieldTimer);
    }
    if (info.player.dead) {
      this.drawDeathRespawnOverlay(info);
    }
    if (this.showMinimap) this.drawMinimap(info);
  }

  private drawShieldOverlay(timer: number): void {
    const ctx = this.ctx;
    ctx.save();
    // Soft cyan/gold border vignette
    const grad = ctx.createRadialGradient(this.W / 2, this.viewH / 2, this.viewH * 0.4, this.W / 2, this.viewH / 2, this.W * 0.6);
    grad.addColorStop(0, 'rgba(0, 229, 255, 0)');
    grad.addColorStop(1, `rgba(0, 229, 255, ${Math.min(0.25, timer * 0.1)})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, this.W, this.viewH);

    // Shield status badge
    ctx.textAlign = 'center';
    ctx.font = 'bold 11px monospace';
    const bw = 240;
    const bh = 22;
    const bx = (this.W - bw) / 2;
    const by = this.viewH - 32;
    ctx.fillStyle = 'rgba(10, 25, 40, 0.85)';
    ctx.fillRect(bx, by, bw, bh);
    ctx.strokeStyle = '#00e5ff';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(bx, by, bw, bh);

    ctx.fillStyle = '#67e8f9';
    ctx.fillText(`🛡️ ESCUDO ATIVO (${timer.toFixed(1)}s)`, this.W / 2, by + 15);
    ctx.restore();
  }

  private drawDeathRespawnOverlay(info: HudInfo): void {
    const ctx = this.ctx;
    ctx.save();
    // Red death tint
    ctx.fillStyle = 'rgba(160, 10, 10, 0.42)';
    ctx.fillRect(0, 0, this.W, this.viewH + this.barH);

    // Centered retro Deathmatch respawn modal
    const bw = 320;
    const bh = 76;
    const bx = (this.W - bw) / 2;
    const by = this.viewH / 2 - 45;

    ctx.fillStyle = 'rgba(12, 14, 18, 0.92)';
    ctx.fillRect(bx, by, bw, bh);
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 2;
    ctx.strokeRect(bx, by, bw, bh);

    ctx.textAlign = 'center';
    ctx.font = 'bold 15px monospace';
    ctx.fillStyle = '#f87171';
    ctx.fillText('☠️ VOCÊ FOI ELIMINADO!', this.W / 2, by + 24);

    const count = Math.max(0, info.respawnCountdown ?? 0);
    ctx.font = 'bold 12px monospace';
    ctx.fillStyle = '#facc15';
    ctx.fillText(`RENASCENDO EM ${count.toFixed(1)}s...`, this.W / 2, by + 46);

    ctx.font = '10px monospace';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('[PRESSIONE ESPAÇO OU CLIQUE PARA RENASCER]', this.W / 2, by + 64);
    ctx.restore();
  }


  private drawWeapon(info: HudInfo): void {
    const { player, weapon } = info;
    const bobX = Math.sin(player.bobPhase) * 10 * player.bobAmp;
    const bobY = Math.abs(Math.cos(player.bobPhase)) * 6 * player.bobAmp;
    const cx = this.W / 2 + bobX;
    const baseY = this.viewH + 26 + bobY - weapon.recoil * 14;

    const custom = this.assets.get('weapon_shotgun');
    if (custom && this.assets.isCustom('weapon_shotgun')) {
      const scale = 3;
      const w = custom.w * scale;
      const h = custom.h * scale;
      this.ctx.drawImage(custom.canvas, cx - w / 2, baseY - h, w, h);
    } else {
      this.drawPlaceholderShotgun(cx, baseY);
    }

    if (weapon.flash > 0) this.drawMuzzleFlash(cx, baseY - 72);
  }

  private drawPlaceholderShotgun(cx: number, baseY: number): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(cx, baseY);
    ctx.fillStyle = '#33363c';
    ctx.beginPath();
    ctx.moveTo(-30, 10);
    ctx.lineTo(30, 10);
    ctx.lineTo(9, -64);
    ctx.lineTo(-9, -64);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#101216';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = '#15171b';
    ctx.beginPath();
    ctx.ellipse(0, -63, 9, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#43474f';
    ctx.fillRect(-21, -14, 42, 26);
    ctx.strokeStyle = '#101216';
    ctx.lineWidth = 2;
    ctx.strokeRect(-21, -14, 42, 26);
    ctx.fillStyle = '#6b4526';
    ctx.fillRect(-17, -36, 34, 16);
    ctx.strokeStyle = '#241407';
    ctx.strokeRect(-17, -36, 34, 16);
    ctx.restore();
  }

  private drawMuzzleFlash(x: number, y: number): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = 'rgba(255, 200, 90, 0.95)';
    ctx.beginPath();
    ctx.arc(0, 0, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 240, 180, 0.9)';
    const spikes: number[][][] = [
      [[0, -26], [5, -8], [-5, -8]],
      [[0, 26], [5, 8], [-5, 8]],
      [[-26, 0], [-8, 5], [-8, -5]],
      [[26, 0], [8, 5], [8, -5]],
    ];
    for (const [a, b, c] of spikes) {
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.lineTo(c[0], c[1]);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  private drawBar(info: HudInfo): void {
    const ctx = this.ctx;
    const y = this.viewH;
    const h = this.barH;
    ctx.fillStyle = '#16181c';
    ctx.fillRect(0, y, this.W, h);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, y, this.W, 2);
    ctx.fillStyle = '#2c3038';
    ctx.fillRect(0, y + 2, this.W, 1);

    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.font = 'bold 12px monospace';
    ctx.fillStyle = '#8a8f98';
    ctx.fillText('VIDA', 28, y + 26);
    ctx.font = 'bold 30px monospace';
    ctx.fillStyle = info.player.health <= 25 ? '#e04040' : '#e8e6e0';
    ctx.fillText(String(Math.ceil(info.player.health)), 28, y + 56);

    ctx.textAlign = 'center';
    ctx.font = 'bold 12px monospace';
    ctx.fillStyle = '#8a8f98';
    ctx.fillText('ABATES', this.W / 2, y + 26);
    ctx.font = 'bold 30px monospace';
    ctx.fillStyle = '#e8c23c';
    ctx.fillText(String(info.kills), this.W / 2, y + 56);

    ctx.textAlign = 'right';
    ctx.font = 'bold 12px monospace';
    ctx.fillStyle = '#8a8f98';
    ctx.fillText('MUNIÇÃO', this.W - 28, y + 26);
    ctx.font = 'bold 30px monospace';
    ctx.fillStyle = info.player.ammo === 0 ? '#e04040' : '#e8e6e0';
    ctx.fillText(String(info.player.ammo), this.W - 28, y + 56);
  }

  private drawCrosshair(): void {
    const ctx = this.ctx;
    const cx = this.W / 2;
    const cy = this.viewH / 2;
    const g = 5;
    ctx.strokeStyle = 'rgba(232, 230, 224, 0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - g - 4, cy);
    ctx.lineTo(cx - g, cy);
    ctx.moveTo(cx + g, cy);
    ctx.lineTo(cx + g + 4, cy);
    ctx.moveTo(cx, cy - g - 4);
    ctx.lineTo(cx, cy - g);
    ctx.moveTo(cx, cy + g);
    ctx.lineTo(cx, cy + g + 4);
    ctx.stroke();
  }

  private drawFlashes(info: HudInfo): void {
    if (info.damageFlash > 0) {
      this.ctx.fillStyle = `rgba(255, 30, 30, ${(info.damageFlash / 0.4) * 0.35})`;
      this.ctx.fillRect(0, 0, this.W, this.viewH);
    }
    if (info.pickupFlash > 0) {
      this.ctx.fillStyle = `rgba(255, 220, 80, ${(info.pickupFlash / 0.3) * 0.22})`;
      this.ctx.fillRect(0, 0, this.W, this.viewH);
    }
  }

  private drawMinimap(info: HudInfo): void {
    const ctx = this.ctx;
    const s = 3;
    const mx = 12;
    const my = 12;
    ctx.fillStyle = 'rgba(15, 13, 10, 0.70)';
    ctx.fillRect(mx - 3, my - 3, MAP_W * s + 6, MAP_H * s + 6);
    for (let ty = 0; ty < MAP_H; ty++) {
      for (let tx = 0; tx < MAP_W; tx++) {
        const t = tileAt(tx, ty);
        if (t !== '.') {
          if (t === '2') {
            ctx.fillStyle = '#a16207'; // Caixas
          } else if (t === '3') {
            ctx.fillStyle = '#c2410c'; // Portas Duplas
          } else {
            ctx.fillStyle = '#6b573d'; // Paredes de Arenito
          }
          ctx.fillRect(mx + tx * s, my + ty * s, s, s);
        }
      }
    }
    for (const item of info.items) {
      if (!item.active) continue;
      ctx.fillStyle = item.type === 'health' ? '#3ec25e' : '#d8b93c';
      ctx.fillRect(mx + item.x * s - 1.5, my + item.y * s - 1.5, 3, 3);
    }
    // Ponto vermelho temporário (some após 3 segundos) quando outro jogador/inimigo entra no campo de visão (FOV)
    if (info.spottedPings && info.spottedPings.length > 0) {
      for (const ping of info.spottedPings) {
        if (ping.timer <= 0) continue;
        const px = mx + ping.x * s;
        const py = my + ping.y * s;
        const alpha = Math.min(1, ping.timer / 0.4);

        ctx.save();
        // Halo de alerta vermelho suave
        ctx.fillStyle = `rgba(239, 68, 68, ${alpha * 0.35})`;
        ctx.beginPath();
        ctx.arc(px, py, 4.5, 0, Math.PI * 2);
        ctx.fill();

        // Ponto vermelho nítido no radar
        ctx.fillStyle = `rgba(255, 30, 30, ${alpha})`;
        ctx.beginPath();
        ctx.arc(px, py, 2.5, 0, Math.PI * 2);
        ctx.fill();

        // Ponto central branco de destaque
        ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.9})`;
        ctx.beginPath();
        ctx.arc(px, py, 1, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    const p = info.player;
    ctx.save();
    ctx.translate(mx + p.x * s, my + p.y * s);
    ctx.rotate(p.angle);
    ctx.fillStyle = '#e8e6e0';
    ctx.beginPath();
    ctx.moveTo(6, 0);
    ctx.lineTo(-3, -4);
    ctx.lineTo(-3, 4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  private drawMultiplayerOverlay(info: HudInfo): void {
    const ctx = this.ctx;
    
    // Top-left Multiplayer Mode Indicator
    ctx.save();
    ctx.fillStyle = 'rgba(15, 17, 24, 0.8)';
    ctx.strokeStyle = '#c8342c';
    ctx.lineWidth = 1;
    ctx.fillRect(80, 10, 170, 24);
    ctx.strokeRect(80, 10, 170, 24);
    ctx.font = 'bold 11px monospace';
    ctx.fillStyle = '#ff4444';
    ctx.textAlign = 'left';
    ctx.fillText('⚔️ DEATHMATCH ONLINE', 88, 26);
    ctx.restore();

    // Top-right Scoreboard Leaderboard
    ctx.save();
    const bx = this.W - 170;
    const by = 10;
    const bw = 160;
    const bh = 88;
    ctx.fillStyle = 'rgba(15, 17, 24, 0.82)';
    ctx.strokeStyle = '#383e4a';
    ctx.lineWidth = 1;
    ctx.fillRect(bx, by, bw, bh);
    ctx.strokeRect(bx, by, bw, bh);

    ctx.fillStyle = '#e8c23c';
    ctx.font = 'bold 10px monospace';
    ctx.fillText('PLACAR DE FRAGS', bx + 10, by + 16);

    const playerName = info.playerName || 'Você';
    const leaders = [
      { name: playerName, frags: info.kills, isPlayer: true, isFriend: false },
      ...(info.remotePlayers
        ? info.remotePlayers.map((rp) => ({ name: rp.name, frags: rp.frags, isPlayer: false, isFriend: true }))
        : []),
      ...info.enemies
        .filter((e) => e.name)
        .slice(0, 3)
        .map((e) => ({ name: e.name || 'Bot', frags: e.frags || 0, isPlayer: false, isFriend: false })),
    ].sort((a, b) => b.frags - a.frags);

    ctx.font = '10px monospace';
    leaders.slice(0, 4).forEach((item, idx) => {
      const lineY = by + 32 + idx * 13;
      if (item.isPlayer) {
        ctx.fillStyle = '#3ec25e';
      } else if (item.isFriend) {
        ctx.fillStyle = '#00e5ff'; // Destaca amigo em ciano
      } else {
        ctx.fillStyle = '#c0c5cc';
      }
      ctx.fillText(`${idx + 1}. ${item.name.slice(0, 11)}:`, bx + 10, lineY);
      ctx.fillStyle = item.isPlayer ? '#4eef74' : (item.isFriend ? '#80f0ff' : '#e8e6e0');
      ctx.fillText(`${item.frags}`, bx + bw - 20, lineY);
    });
    ctx.restore();

    // Kill Feed notifications
    if (info.killFeed && info.killFeed.length > 0) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = 'bold 11px monospace';
      info.killFeed.forEach((item, idx) => {
        const alpha = Math.min(1, item.timer / 0.5);
        ctx.fillStyle = `rgba(15, 17, 24, ${alpha * 0.85})`;
        ctx.fillRect(this.W / 2 - 140, 14 + idx * 22, 280, 18);
        ctx.strokeStyle = `rgba(232, 194, 60, ${alpha * 0.6})`;
        ctx.strokeRect(this.W / 2 - 140, 14 + idx * 22, 280, 18);
        ctx.fillStyle = `rgba(255, 220, 100, ${alpha})`;
        ctx.fillText(item.text, this.W / 2, 27 + idx * 22);
      });
      ctx.restore();
    }
  }
}
