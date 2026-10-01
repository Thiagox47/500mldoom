export interface Texture {
  w: number;
  h: number;
  data: Uint8ClampedArray;
  canvas: HTMLCanvasElement;
}

export interface SpriteDef {
  name: string;
  file?: string;
  scale?: number;
}

export type EnemyState = 'idle' | 'chase' | 'attack' | 'dead';

export interface EnemyDef {
  health: number;
  speed: number;
  damage: number;
  scale: number;
  attackRange: number;
}

export interface Enemy {
  x: number;
  y: number;
  health: number;
  speed: number;
  state: EnemyState;
  hurtTimer: number;
  attackTimer: number;
  cooldown: number;
  deathTimer: number;
  skin: string;
  animTime: number;
}

export type ItemType = 'health' | 'ammo';

export interface Item {
  x: number;
  y: number;
  type: ItemType;
  active: boolean;
}
