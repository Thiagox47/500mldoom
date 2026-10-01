import { Jimp } from 'jimp';
import fs from 'fs';

async function processAttack() {
  console.log('Lendo imagem atacando.jpg...');
  const image = await Jimp.read('public/sprites/bot01/atacando.jpg');
  
  const w = image.bitmap.width;
  const h = image.bitmap.height;
  
  // Assumindo pixel (0,0) como fundo
  const bgHex = image.getPixelColor(0, 0);
  const bgR = (bgHex >> 24) & 255;
  const bgG = (bgHex >> 16) & 255;
  const bgB = (bgHex >> 8) & 255;

  let minX = w, maxX = 0, minY = h, maxY = 0;
  
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const hex = image.getPixelColor(x, y);
      const r = (hex >> 24) & 255;
      const g = (hex >> 16) & 255;
      const b = (hex >> 8) & 255;
      
      const dist = Math.abs(r - bgR) + Math.abs(g - bgG) + Math.abs(b - bgB);
      
      if (dist < 80) { // Tolerância de fundo
        image.setPixelColor(0x00000000, x, y); // Transparente
      } else {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  // Recortar e salvar
  if (maxX > minX && maxY > minY) {
    const crop = image.crop({ x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 });
    await crop.write('public/sprites/bot01/attack.png');
    console.log('attack.png processado e salvo!');
  } else {
    console.log('Nao foi possivel encontrar o sprite na imagem.');
  }
}

processAttack().catch(console.error);
