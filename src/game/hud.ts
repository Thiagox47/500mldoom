import type { Assets } from '../engine/assets';
import type { Enemy, Item } from '../types';
import { MAP_H, MAP_W, tileAt } from './map';
import type { Player } from './player';
import type { Weapon } from './weapons';

export interface HudInfo {
  player: Player;
  enemies: Enemy[];
  items: Item[];
  weapon: Weapon;
  kills: number;
  damageFlash: number;
  pickupFlash: number;
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
    if (info.player.dead) {
      this.ctx.fillStyle = 'rgba(140,10,10,0.28)';
      this.ctx.fillRect(0, 0, this.W, this.viewH + this.barH);
    }
    if (this.showMinimap) this.drawMinimap(info);
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
    const s = 4;
    const mx = 12;
    const my = 12;
    ctx.fillStyle = 'rgba(10, 12, 16, 0.55)';
    ctx.fillRect(mx - 3, my - 3, MAP_W * s + 6, MAP_H * s + 6);
    for (let ty = 0; ty < MAP_H; ty++) {
      for (let tx = 0; tx < MAP_W; tx++) {
        if (tileAt(tx, ty) !== '.') {
          ctx.fillStyle = '#3c4148';
          ctx.fillRect(mx + tx * s, my + ty * s, s, s);
        }
      }
    }
    for (const item of info.items) {
      if (!item.active) continue;
      ctx.fillStyle = item.type === 'health' ? '#3ec25e' : '#d8b93c';
      ctx.fillRect(mx + item.x * s - 1.5, my + item.y * s - 1.5, 3, 3);
    }
    for (const e of info.enemies) {
      if (e.state === 'dead') continue;
      ctx.fillStyle = '#d03040';
      ctx.fillRect(mx + e.x * s - 1.5, my + e.y * s - 1.5, 3, 3);
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
}
