import type { SpriteDef, Texture } from '../types';

interface Manifest {
  sprites: SpriteDef[];
}

export class Assets {
  private textures = new Map<string, Texture>();
  private scales = new Map<string, number>();
  private custom = new Set<string>();

  async load(): Promise<void> {
    this.put('wall1', canvasTexture(paintBlocks(16, 8, '#8a4a32', '#3c2820')));
    this.put('wall2', canvasTexture(paintBlocks(32, 16, '#6e7276', '#3a3d40')));
    this.put('wall3', canvasTexture(paintTech));
    this.put('enemy_imp', canvasTexture(paintImp));
    this.put('item_health', canvasTexture(paintHealth));
    this.put('item_ammo', canvasTexture(paintAmmo));

    let manifest: Manifest = { sprites: [] };
    try {
      const res = await fetch('manifest.json');
      if (res.ok) manifest = (await res.json()) as Manifest;
    } catch {
      /* sem manifest: usa placeholders */
    }
    await Promise.all(manifest.sprites.map((s) => this.loadFile(s)));
  }

  private async loadFile(s: SpriteDef): Promise<void> {
    if (!s.file) return;
    try {
      const img = await loadImage(s.file);
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(img, 0, 0);
      this.textures.set(s.name, {
        w: img.width,
        h: img.height,
        data: ctx.getImageData(0, 0, img.width, img.height).data,
        canvas,
      });
      this.custom.add(s.name);
      if (s.scale !== undefined) this.scales.set(s.name, s.scale);
    } catch {
      /* arquivo ausente: mantem placeholder */
    }
  }

  private put(name: string, t: Texture): void {
    this.textures.set(name, t);
  }

  get(name: string): Texture | undefined {
    return this.textures.get(name);
  }

  scale(name: string, fallback: number): number {
    return this.scales.get(name) ?? fallback;
  }

  isCustom(name: string): boolean {
    return this.custom.has(name);
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`falha ao carregar ${src}`));
    img.src = src;
  });
}

function canvasTexture(paint: (ctx: CanvasRenderingContext2D) => void): Texture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d indisponivel');
  paint(ctx);
  return { w: size, h: size, data: ctx.getImageData(0, 0, size, size).data, canvas };
}

function noise(ctx: CanvasRenderingContext2D, count: number): void {
  let seed = 987654321;
  const rnd = (): number => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = rnd() > 0.5 ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.06)';
    ctx.fillRect(Math.floor(rnd() * 64), Math.floor(rnd() * 64), 2, 1);
  }
}

function paintBlocks(bw: number, bh: number, base: string, mortar: string): (ctx: CanvasRenderingContext2D) => void {
  return (ctx) => {
    ctx.fillStyle = mortar;
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = base;
    const rows = Math.ceil(64 / bh);
    const cols = Math.ceil(64 / bw);
    for (let row = 0; row < rows; row++) {
      const off = (row % 2) * (bw / 2);
      for (let col = -1; col <= cols; col++) {
        ctx.fillRect(col * bw + off + 1, row * bh + 1, bw - 2, bh - 2);
      }
    }
    noise(ctx, 240);
  };
}

function paintTech(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = '#232a2e';
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = '#2c353a';
  ctx.fillRect(2, 2, 28, 28);
  ctx.fillRect(34, 2, 28, 28);
  ctx.fillRect(2, 34, 28, 28);
  ctx.fillRect(34, 34, 28, 28);
  ctx.fillStyle = '#1f8f5f';
  ctx.fillRect(0, 30, 64, 3);
  ctx.fillStyle = '#4a5652';
  const rivets = [
    [6, 6], [26, 6], [38, 6], [58, 6],
    [6, 58], [26, 58], [38, 58], [58, 58],
  ];
  for (const [x, y] of rivets) ctx.fillRect(x - 1, y - 1, 3, 3);
  noise(ctx, 160);
}

function paintImp(ctx: CanvasRenderingContext2D): void {
  ctx.clearRect(0, 0, 64, 64);
  ctx.fillStyle = '#4a2018';
  ctx.beginPath(); ctx.moveTo(20, 2); ctx.lineTo(27, 20); ctx.lineTo(13, 18); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(44, 2); ctx.lineTo(51, 18); ctx.lineTo(37, 20); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#8a2028';
  ctx.fillRect(10, 34, 7, 16);
  ctx.fillRect(47, 34, 7, 16);
  ctx.fillStyle = '#7a1c24';
  ctx.fillRect(21, 56, 9, 8);
  ctx.fillRect(34, 56, 9, 8);
  ctx.fillStyle = '#b8323c';
  ctx.beginPath(); ctx.ellipse(32, 40, 18, 21, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#d05a52';
  ctx.beginPath(); ctx.ellipse(32, 46, 11, 12, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ffd23c';
  ctx.fillRect(21, 28, 8, 7);
  ctx.fillRect(35, 28, 8, 7);
  ctx.fillStyle = '#1a0e08';
  ctx.fillRect(24, 30, 3, 3);
  ctx.fillRect(38, 30, 3, 3);
  ctx.fillStyle = '#3a0d12';
  ctx.fillRect(24, 44, 16, 6);
  ctx.fillStyle = '#e8e0d0';
  ctx.fillRect(26, 44, 3, 3);
  ctx.fillRect(31, 44, 3, 3);
  ctx.fillRect(36, 44, 3, 3);
}

function paintHealth(ctx: CanvasRenderingContext2D): void {
  ctx.clearRect(0, 0, 64, 64);
  ctx.fillStyle = '#101210';
  ctx.fillRect(10, 18, 44, 40);
  ctx.fillStyle = '#e8e8e2';
  ctx.fillRect(13, 21, 38, 34);
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.fillRect(13, 21, 38, 6);
  ctx.fillStyle = '#c02020';
  ctx.fillRect(28, 26, 8, 24);
  ctx.fillRect(17, 33, 30, 8);
}

function paintAmmo(ctx: CanvasRenderingContext2D): void {
  ctx.clearRect(0, 0, 64, 64);
  ctx.fillStyle = '#2a2410';
  ctx.fillRect(8, 22, 48, 36);
  ctx.fillStyle = '#7a6a2a';
  ctx.fillRect(11, 25, 42, 30);
  ctx.fillStyle = '#5a4e1c';
  ctx.fillRect(11, 31, 42, 4);
  ctx.fillRect(11, 43, 42, 4);
  ctx.fillStyle = '#c8b23c';
  for (let i = 0; i < 5; i++) ctx.fillRect(14 + i * 8, 36, 5, 9);
}
