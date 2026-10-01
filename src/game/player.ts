import { moveWithCollision } from './map';
import type { Input } from '../engine/input';

const MOVE_SPEED = 3.2;
const RADIUS = 0.22;

export class Player {
  x: number;
  y: number;
  angle: number;
  health = 100;
  ammo = 40;
  bobPhase = 0;
  bobAmp = 0;
  dead = false;

  constructor(x: number, y: number, angle: number) {
    this.x = x;
    this.y = y;
    this.angle = angle;
  }

  get dirX(): number {
    return Math.cos(this.angle);
  }

  get dirY(): number {
    return Math.sin(this.angle);
  }

  get planeX(): number {
    return -Math.sin(this.angle) * 0.66;
  }

  get planeY(): number {
    return Math.cos(this.angle) * 0.66;
  }

  update(dt: number, input: Input): void {
    this.angle += input.consumeMouseDX() * 0.0022;

    let fwd = 0;
    let strafe = 0;
    if (input.down('KeyW') || input.down('ArrowUp')) fwd += 1;
    if (input.down('KeyS') || input.down('ArrowDown')) fwd -= 1;
    if (input.down('KeyD') || input.down('ArrowRight')) strafe += 1;
    if (input.down('KeyA') || input.down('ArrowLeft')) strafe -= 1;

    const len = Math.hypot(fwd, strafe);
    if (len > 0) {
      fwd /= len;
      strafe /= len;
      const speed = MOVE_SPEED * dt;
      const perpX = -this.dirY;
      const perpY = this.dirX;
      const dx = (this.dirX * fwd + perpX * strafe) * speed;
      const dy = (this.dirY * fwd + perpY * strafe) * speed;
      moveWithCollision(this, dx, dy, RADIUS);
      this.bobPhase += dt * 7.5;
      this.bobAmp = Math.min(1, this.bobAmp + dt * 6);
    } else {
      this.bobAmp = Math.max(0, this.bobAmp - dt * 6);
    }
  }

  damage(amount: number): void {
    if (this.dead) return;
    this.health -= amount;
    if (this.health <= 0) {
      this.health = 0;
      this.dead = true;
    }
  }

  reset(x: number, y: number, angle: number): void {
    this.x = x;
    this.y = y;
    this.angle = angle;
    this.health = 100;
    this.ammo = 40;
    this.bobPhase = 0;
    this.bobAmp = 0;
    this.dead = false;
  }
}
