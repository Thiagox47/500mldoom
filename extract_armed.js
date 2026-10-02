import { Jimp } from 'jimp';
import fs from 'fs';

const ARMED_SHEET = 'C:/Users/Usuario/.gemini/antigravity-ide/brain/d34659e1-edcd-4fd1-8dbc-3a586e8575c8/character_armed_spritesheet_1790909859028.jpg';
const DEBUG_DIR = 'public/sprites/bot02/debug_slices';

function cleanAndTrim(img) {
  const w = img.bitmap.width;
  const h = img.bitmap.height;

  function getRGB(x, y) {
    const hex = img.getPixelColor(x, y);
    return [(hex >> 24) & 255, (hex >> 16) & 255, (hex >> 8) & 255];
  }

  // 1. Flood fill from borders to remove background & grid lines
  const isBg = new Uint8Array(w * h);
  const queue = [];

  for (let x = 0; x < w; x++) {
    queue.push(x, 0, x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    queue.push(0, y, w - 1, y);
  }

  let head = 0;
  while (head < queue.length) {
    const cx = queue[head++];
    const cy = queue[head++];
    const idx = cy * w + cx;
    if (isBg[idx]) continue;

    const [r, g, b] = getRGB(cx, cy);
    // Background and grid lines: light or grey grid
    const isLight = r > 195 && g > 195 && b > 195;
    const isGreyGrid = Math.abs(r - g) < 8 && Math.abs(g - b) < 8 && r >= 130 && r <= 195;
    if (isLight || isGreyGrid) {
      isBg[idx] = 1;
      if (cx > 0 && !isBg[idx - 1]) queue.push(cx - 1, cy);
      if (cx < w - 1 && !isBg[idx + 1]) queue.push(cx + 1, cy);
      if (cy > 0 && !isBg[idx - w]) queue.push(cx, cy - 1);
      if (cy < h - 1 && !isBg[idx + w]) queue.push(cx, cy + 1);
    }
  }

  // Preenche pequenos furos quase brancos
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (!isBg[idx]) {
        const [r, g, b] = getRGB(x, y);
        if (r > 235 && g > 235 && b > 235 && Math.abs(r - g) < 8 && Math.abs(g - b) < 8) {
          isBg[idx] = 1;
        }
      }
    }
  }

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (isBg[y * w + x]) {
        img.setPixelColor(0x00000000, x, y);
      }
    }
  }

  // 2. Defringe halos
  for (let pass = 0; pass < 2; pass++) {
    const toClear = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const hex = img.getPixelColor(x, y);
        if ((hex & 255) === 0) continue;

        let isBoundary = false;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || nx >= w || ny < 0 || ny >= h || (img.getPixelColor(nx, ny) & 255) === 0) {
              isBoundary = true;
              break;
            }
          }
          if (isBoundary) break;
        }

        if (isBoundary) {
          const r = (hex >> 24) & 255;
          const g = (hex >> 16) & 255;
          const b = (hex >> 8) & 255;
          if (r > 185 && g > 185 && b > 185 && Math.abs(r - g) < 22 && Math.abs(g - b) < 22) {
            toClear.push([x, y]);
          }
        }
      }
    }
    for (const [x, y] of toClear) img.setPixelColor(0x00000000, x, y);
  }

  // 3. Find bounding box of solid pixels
  let minX = w, maxX = 0, minY = h, maxY = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if ((img.getPixelColor(x, y) & 255) > 0) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX >= minX && maxY >= minY) {
    return img.crop({ x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 });
  }
  return img;
}

async function main() {
  const full = await Jimp.read(ARMED_SHEET);
  fs.mkdirSync(DEBUG_DIR, { recursive: true });

  const cells = [
    // Row 1: Idle & Walk (Armed)
    { name: 'idle', box: { x: 12, y: 53, w: 160, h: 200 } },
    { name: 'walk1', box: { x: 178, y: 53, w: 160, h: 200 } },
    { name: 'walk2', box: { x: 345, y: 53, w: 160, h: 200 } },
    { name: 'walk3', box: { x: 515, y: 53, w: 160, h: 200 } },
    { name: 'walk4', box: { x: 683, y: 53, w: 160, h: 200 } },
    
    // Row 2: Attack (Firing gun)
    { name: 'attack_flash', box: { x: 180, y: 309, w: 195, h: 200 } },
    { name: 'attack_smoke', box: { x: 345, y: 309, w: 200, h: 200 } },

    // Row 3: Hurt
    { name: 'hurt', box: { x: 12, y: 565, w: 160, h: 200 } },
    { name: 'hurt2', box: { x: 350, y: 565, w: 160, h: 200 } },

    // Row 4: Death
    { name: 'dead_lying', box: { x: 530, y: 825, w: 235, h: 190 } },
    { name: 'dead_blood', box: { x: 760, y: 825, w: 250, h: 190 } }
  ];

  for (const c of cells) {
    const raw = full.clone().crop(c.box);
    const cleaned = cleanAndTrim(raw);
    await cleaned.write(`${DEBUG_DIR}/${c.name}.png`);
    console.log(`Saved ${c.name}: ${cleaned.bitmap.width}x${cleaned.bitmap.height}`);
  }
}

main().catch(console.error);
