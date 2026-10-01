import type { Texture } from '../types';

export interface Billboard {
  x: number;
  y: number;
  texture: Texture;
  scale: number;
  vOffset: number;
  tintRed?: boolean;
}

export function renderBillboards(
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
  sprites: Billboard[],
): void {
  if (sprites.length === 0) return;
  const invDet = 1 / (planeX * dirY - dirX * planeY);
  const ordered = sprites
    .map((s) => ({ s, d: (s.x - px) * (s.x - px) + (s.y - py) * (s.y - py) }))
    .sort((a, b) => b.d - a.d);

  for (const { s } of ordered) {
    const spX = s.x - px;
    const spY = s.y - py;
    const transformY = invDet * (-planeY * spX + planeX * spY);
    if (transformY <= 0.1) continue;
    const transformX = invDet * (dirY * spX - dirX * spY);
    const screenX = (W / 2) * (1 + transformX / transformY);

    const spriteH = (H / transformY) * s.scale;
    if (spriteH < 1) continue;
    const spriteW = spriteH * (s.texture.w / s.texture.h);
    const unit = H / transformY;
    const vMove = unit * (0.5 - s.scale / 2) - s.vOffset * unit;
    const centerY = H / 2 + vMove;
    const topY = centerY - spriteH / 2;
    const startY = Math.max(0, Math.floor(topY));
    const endY = Math.min(H - 1, Math.ceil(centerY + spriteH / 2));
    const leftX = screenX - spriteW / 2;
    const startX = Math.max(0, Math.floor(leftX));
    const endX = Math.min(W - 1, Math.ceil(screenX + spriteW / 2));
    const shade = Math.max(0.4, Math.min(1, 1 - transformY / 16));

    for (let y = startY; y <= endY; y++) {
      const texY = Math.floor(((y - topY) * s.texture.h) / spriteH);
      if (texY < 0 || texY >= s.texture.h) continue;
      for (let x = startX; x <= endX; x++) {
        if (transformY >= zbuffer[x]) continue;
        const texX = Math.floor(((x - leftX) * s.texture.w) / spriteW);
        if (texX < 0 || texX >= s.texture.w) continue;
        const i = (texY * s.texture.w + texX) * 4;
        if (s.texture.data[i + 3] < 128) continue;
        const o = (y * W + x) * 4;
        if (s.tintRed) {
          buf[o] = Math.min(255, s.texture.data[i] * shade + 110);
          buf[o + 1] = s.texture.data[i + 1] * shade * 0.3;
          buf[o + 2] = s.texture.data[i + 2] * shade * 0.3;
        } else {
          buf[o] = s.texture.data[i] * shade;
          buf[o + 1] = s.texture.data[i + 1] * shade;
          buf[o + 2] = s.texture.data[i + 2] * shade;
        }
        buf[o + 3] = 255;
      }
    }
  }
}
