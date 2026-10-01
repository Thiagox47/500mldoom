import { Assets } from './engine/assets';
import { renderBillboards, type Billboard } from './engine/billboard';
import { Input } from './engine/input';
import { renderFloorCeiling, renderWalls } from './engine/raycaster';
import { Sfx } from './engine/sfx';
import { Enemies, IMP } from './game/enemies';
import { Hud } from './game/hud';
import { Items } from './game/items';
import { ENEMY_SPAWNS, ITEM_SPAWNS, PLAYER_SPAWN } from './game/map';
import { Player } from './game/player';
import { Spawner } from './game/spawner';
import { hitscan, Weapon } from './game/weapons';

const W = 640;
const VIEW_H = 336;
const BAR_H = 64;

async function main(): Promise<void> {
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  canvas.width = W;
  canvas.height = VIEW_H + BAR_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d indisponivel');

  const view = ctx.createImageData(W, VIEW_H);
  const buf = view.data;
  const zbuffer = new Float32Array(W);

  const assets = new Assets();
  await assets.load();

  const input = new Input(canvas);
  const sfx = new Sfx();
  const hud = new Hud(ctx, assets, W, VIEW_H, BAR_H);
  const player = new Player(PLAYER_SPAWN.x, PLAYER_SPAWN.y, PLAYER_SPAWN.angle);
  const enemies = new Enemies();
  const items = new Items();
  const weapon = new Weapon();
  const spawner = new Spawner(enemies, items);

  const overlay = document.getElementById('overlay') as HTMLElement;
  const overlayTitle = document.getElementById('overlay-title') as HTMLElement;
  const overlayHint = document.getElementById('overlay-hint') as HTMLElement;

  let kills = 0;
  let damageFlash = 0;
  let pickupFlash = 0;

  const reset = (): void => {
    player.reset(PLAYER_SPAWN.x, PLAYER_SPAWN.y, PLAYER_SPAWN.angle);
    enemies.reset(ENEMY_SPAWNS, IMP);
    items.spawn(ITEM_SPAWNS);
    weapon.cooldown = 0;
    weapon.flash = 0;
    weapon.recoil = 0;
    kills = 0;
    damageFlash = 0;
    pickupFlash = 0;
    spawner.reset();
  };

  const onHitPlayer = (dmg: number): void => {
    player.damage(dmg);
    damageFlash = 0.4;
    sfx.hurt();
  };

  overlay.addEventListener('click', () => {
    sfx.init();
    if (player.dead) reset();
    const req = canvas.requestPointerLock() as unknown as Promise<void> | undefined;
    req?.catch(() => undefined);
  });

  document.addEventListener('pointerlockchange', () => {
    const locked = input.locked;
    overlay.style.display = locked ? 'none' : 'flex';
    if (!locked) {
      overlayTitle.textContent = player.dead ? 'VOCÊ MORREU' : 'PAUSADO';
      overlayHint.textContent = player.dead ? 'Clique para reiniciar' : 'Clique para continuar';
    }
  });

  const update = (dt: number): void => {
    player.update(dt, input);
    weapon.update(dt);
    enemies.update(dt, player, IMP, onHitPlayer);
    spawner.update(dt, player, IMP);
    items.update(player, sfx, (type) => {
      if (type === 'health') player.health = Math.min(100, player.health + 25);
      else player.ammo += 20;
      pickupFlash = 0.3;
    });

    if (input.firing && weapon.canFire()) {
      if (player.ammo <= 0) {
        sfx.dry();
        weapon.dryFire();
      } else {
        player.ammo--;
        weapon.fire();
        sfx.fire();
        const target = hitscan(player.x, player.y, player.dirX, player.dirY, enemies.list);
        if (target) {
          sfx.hit();
          if (enemies.damage(target, 24 + Math.random() * 12)) {
            kills++;
            sfx.enemyDie();
          }
        }
      }
    }

    if (damageFlash > 0) damageFlash -= dt;
    if (pickupFlash > 0) pickupFlash -= dt;
    if (input.consumeMinimapToggle()) hud.showMinimap = !hud.showMinimap;
    if (player.dead && input.locked) document.exitPointerLock();
  };

  const render = (): void => {
    renderFloorCeiling(buf, W, VIEW_H);
    renderWalls(buf, W, VIEW_H, zbuffer, player.x, player.y, player.dirX, player.dirY, player.planeX, player.planeY, assets);

    const billboards: Billboard[] = [];
    for (const e of enemies.list) {
      let spriteName = `${e.skin}_idle`;
      if (e.state === 'dead') {
        spriteName = `${e.skin}_dead`;
      } else if (e.hurtTimer > 0) {
        spriteName = `${e.skin}_hurt`;
      } else if (e.state === 'attack') {
        spriteName = `${e.skin}_attack`;
      } else if (e.state === 'chase') {
        const frame = Math.floor(e.animTime * 5) % 4;
        spriteName = `${e.skin}_walk${frame + 1}`; // walk1, walk2, walk3, walk4
      }

      let tex = assets.get(spriteName);
      if (!tex) tex = assets.get(`${e.skin}_idle`);
      if (!tex) tex = assets.get('enemy_imp');
      if (!tex) continue;

      let scale = assets.scale(spriteName, IMP.scale);
      if (e.state === 'dead' && tex === assets.get('enemy_imp')) {
        scale *= Math.max(0.3, e.deathTimer / 0.5);
      }
      
      billboards.push({ x: e.x, y: e.y, texture: tex, scale, vOffset: 0, tintRed: e.hurtTimer > 0 });
    }
    for (const item of items.list) {
      if (!item.active) continue;
      const name = item.type === 'health' ? 'item_health' : 'item_ammo';
      const tex = assets.get(name);
      if (!tex) continue;
      const fallback = item.type === 'health' ? 0.5 : 0.42;
      billboards.push({ x: item.x, y: item.y, texture: tex, scale: assets.scale(name, fallback), vOffset: 0 });
    }
    renderBillboards(buf, W, VIEW_H, zbuffer, player.x, player.y, player.dirX, player.dirY, player.planeX, player.planeY, billboards);

    ctx.putImageData(view, 0, 0);
    hud.draw({
      player,
      enemies: enemies.list,
      items: items.list,
      weapon,
      kills,
      damageFlash,
      pickupFlash,
    });
  };

  let last = performance.now();
  const loop = (t: number): void => {
    const dt = Math.min(0.05, (t - last) / 1000);
    last = t;
    if (input.locked && !player.dead) update(dt);
    render();
    requestAnimationFrame(loop);
  };

  reset();
  requestAnimationFrame(loop);
}

void main();
