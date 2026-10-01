import { Jimp } from 'jimp';
import fs from 'fs';

async function processImage() {
  console.log('Lendo imagem do bot01...');
  const image = await Jimp.read('public/sprites/bot01/jairosprite.jpg');
  
  const w = image.bitmap.width;
  const h = image.bitmap.height;
  console.log(`Imagem lida: ${w}x${h}`);

  // Passo 1: Descobrir cor de fundo a partir do pixel (0,0)
  const bgHex = image.getPixelColor(0, 0);
  const bgR = (bgHex >> 24) & 255;
  const bgG = (bgHex >> 16) & 255;
  const bgB = (bgHex >> 8) & 255;

  const solidPixels = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const hex = image.getPixelColor(x, y);
      const r = (hex >> 24) & 255;
      const g = (hex >> 16) & 255;
      const b = (hex >> 8) & 255;
      
      // Se for muito parecido com a cor de fundo (Tolerância aumentada para JPG)
      const dist = Math.abs(r - bgR) + Math.abs(g - bgG) + Math.abs(b - bgB);
      
      if (dist < 80) { // Maior tolerância para JPG
        image.setPixelColor(0x00000000, x, y); // Transparente
      } else {
        solidPixels[y * w + x] = 1;
      }
    }
  }

  // Passo 2: Achar componentes conectados
  const visited = new Uint8Array(w * h);
  const sprites = [];
  
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (solidPixels[y * w + x] === 1 && visited[y * w + x] === 0) {
        let minX = x, maxX = x, minY = y, maxY = y;
        const queue = [[x, y]];
        visited[y * w + x] = 1;
        
        let head = 0;
        while (head < queue.length) {
          const [cx, cy] = queue[head++];
          if (cx < minX) minX = cx;
          if (cx > maxX) maxX = cx;
          if (cy < minY) minY = cy;
          if (cy > maxY) maxY = cy;
          
          const neighbors = [
            [cx - 1, cy], [cx + 1, cy], [cx, cy - 1], [cx, cy + 1],
            [cx - 1, cy - 1], [cx + 1, cy - 1], [cx - 1, cy + 1], [cx + 1, cy + 1]
          ];
          for (const [nx, ny] of neighbors) {
            if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
              if (solidPixels[ny * w + nx] === 1 && visited[ny * w + nx] === 0) {
                visited[ny * w + nx] = 1;
                queue.push([nx, ny]);
              }
            }
          }
        }
        
        if (maxX - minX > 20 && maxY - minY > 20) {
          sprites.push({ x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 });
        }
      }
    }
  }

  // Passo 3: Ordenar por linha (Y), agrupando por linhas, depois por X
  sprites.sort((a, b) => {
    if (Math.abs(a.y - b.y) < 30) return a.x - b.x;
    return a.y - b.y;
  });

  console.log(`Encontrados ${sprites.length} sprites na folha do bot01!`);

  const outDir = 'public/sprites/bot01';
  
  for (let i = 0; i < sprites.length; i++) {
    const s = sprites[i];
    const crop = image.clone().crop({ x: s.x, y: s.y, w: s.w, h: s.h });
    let name = `frame_${i}.png`;
    
    // Mapeamento rudimentar baseado na ordem típica (pode variar dependendo da folha JPG)
    if (i === 0) name = 'idle.png';
    else if (i === 1) name = 'walk1.png';
    else if (i === 2) name = 'walk2.png';
    else if (i === 3) name = 'walk3.png';
    else if (i === 4) name = 'walk4.png';
    else if (i === Math.floor(sprites.length * 0.7)) name = 'attack.png';
    else if (i === Math.floor(sprites.length * 0.85)) name = 'hurt.png';
    else if (i === sprites.length - 1) name = 'dead.png';
    
    await crop.write(`${outDir}/${name}`);
  }
  
  console.log('Recorte concluido com sucesso do bot01!');
}

processImage().catch(console.error);
