import type { Assets } from './assets';
import { isWallTile, tileAt } from '../game/map';

export interface RayHit {
  dist: number;
  side: 0 | 1;
  tile: string;
  wallX: number;
}

export function castRay(px: number, py: number, rayDirX: number, rayDirY: number): RayHit {
  let mapX = Math.floor(px);
  let mapY = Math.floor(py);
  const deltaDistX = rayDirX === 0 ? Infinity : Math.abs(1 / rayDirX);
  const deltaDistY = rayDirY === 0 ? Infinity : Math.abs(1 / rayDirY);

  let stepX: number;
  let stepY: number;
  let sideDistX: number;
  let sideDistY: number;

  if (rayDirX < 0) {
    stepX = -1;
    sideDistX = (px - mapX) * deltaDistX;
  } else {
    stepX = 1;
    sideDistX = (mapX + 1 - px) * deltaDistX;
  }
  if (rayDirY < 0) {
    stepY = -1;
    sideDistY = (py - mapY) * deltaDistY;
  } else {
    stepY = 1;
    sideDistY = (mapY + 1 - py) * deltaDistY;
  }

  let side: 0 | 1 = 0;
  let tile = '1';
  for (let guard = 0; guard < 128; guard++) {
    if (sideDistX < sideDistY) {
      sideDistX += deltaDistX;
      mapX += stepX;
      side = 0;
    } else {
      sideDistY += deltaDistY;
      mapY += stepY;
      side = 1;
    }
    tile = tileAt(mapX, mapY);
    if (tile !== '.') break;
  }

  const dist = Math.max(0.02, side === 0 ? sideDistX - deltaDistX : sideDistY - deltaDistY);
  let wallX = side === 0 ? py + dist * rayDirY : px + dist * rayDirX;
  wallX -= Math.floor(wallX);
  return { dist, side, tile, wallX };
}

export function lineOfSight(x0: number, y0: number, x1: number, y1: number): boolean {
  const tMapX = Math.floor(x1);
  const tMapY = Math.floor(y1);
  let mapX = Math.floor(x0);
  let mapY = Math.floor(y0);
  if (mapX === tMapX && mapY === tMapY) return true;

  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  if (len < 0.0001) return true;
  const dirX = dx / len;
  const dirY = dy / len;
  const deltaDistX = dirX === 0 ? Infinity : Math.abs(1 / dirX);
  const deltaDistY = dirY === 0 ? Infinity : Math.abs(1 / dirY);

  let stepX: number;
  let stepY: number;
  let sideDistX: number;
  let sideDistY: number;

  if (dirX < 0) {
    stepX = -1;
    sideDistX = (x0 - mapX) * deltaDistX;
  } else {
    stepX = 1;
    sideDistX = (mapX + 1 - x0) * deltaDistX;
  }
  if (dirY < 0) {
    stepY = -1;
    sideDistY = (y0 - mapY) * deltaDistY;
  } else {
    stepY = 1;
    sideDistY = (mapY + 1 - y0) * deltaDistY;
  }

  for (let guard = 0; guard < 256; guard++) {
    if (sideDistX < sideDistY) {
      sideDistX += deltaDistX;
      mapX += stepX;
    } else {
      sideDistY += deltaDistY;
      mapY += stepY;
    }
    if (mapX === tMapX && mapY === tMapY) return true;
    if (isWallTile(mapX, mapY)) return false;
  }
  return false;
}

function fillRow(buf: Uint8ClampedArray, W: number, y: number, r: number, g: number, b: number): void {
  let o = y * W * 4;
  for (let x = 0; x < W; x++) {
    buf[o] = r;
    buf[o + 1] = g;
    buf[o + 2] = b;
    buf[o + 3] = 255;
    o += 4;
  }
}

export function renderFloorCeiling(buf: Uint8ClampedArray, W: number, H: number): void {
  const half = H >> 1;
  for (let y = 0; y < half; y++) {
    const t = y / half;
    fillRow(buf, W, y, 6 + 30 * t, 6 + 32 * t, 10 + 36 * t);
  }
  for (let y = half; y < H; y++) {
    const t = (y - half) / (H - half);
    fillRow(buf, W, y, 52 - 30 * t, 48 - 28 * t, 44 - 25 * t);
  }
}

export function renderWalls(
  buf: Uint8ClampedArray,
  W: number,
  H: number,
  zbuffer: Float32Array,
  px: number,
  py: number,
  dirX: number,
  dirY: number,
  planeX: number,
  planeY: number,
  assets: Assets,
): void {
  for (let x = 0; x < W; x++) {
    const cameraX = (2 * x) / W - 1;
    const rayDirX = dirX + planeX * cameraX;
    const rayDirY = dirY + planeY * cameraX;
    const hit = castRay(px, py, rayDirX, rayDirY);
    const tex = assets.get(`wall${hit.tile}`) ?? assets.get('wall1');
    if (!tex) continue;

    const lineH = Math.floor(H / hit.dist);
    const drawStart = Math.max(0, Math.floor(-lineH / 2 + H / 2));
    const drawEnd = Math.min(H - 1, Math.floor(lineH / 2 + H / 2));

    let texX = Math.floor(hit.wallX * tex.w);
    if (hit.side === 0 && rayDirX > 0) texX = tex.w - texX - 1;
    if (hit.side === 1 && rayDirY < 0) texX = tex.w - texX - 1;
    texX = Math.min(tex.w - 1, Math.max(0, texX));

    const step = tex.h / lineH;
    let texPos = (drawStart - H / 2 + lineH / 2) * step;
    const shade = Math.max(0.35, Math.min(1, 1 - hit.dist / 16)) * (hit.side === 1 ? 0.75 : 1);

    for (let y = drawStart; y <= drawEnd; y++) {
      const texY = Math.max(0, Math.floor(texPos) % tex.h);
      texPos += step;
      const i = (texY * tex.w + texX) * 4;
      const o = (y * W + x) * 4;
      buf[o] = tex.data[i] * shade;
      buf[o + 1] = tex.data[i + 1] * shade;
      buf[o + 2] = tex.data[i + 2] * shade;
      buf[o + 3] = 255;
    }
    zbuffer[x] = hit.dist;
  }
}
