import { Assets } from './engine/assets';
import { renderBillboards, type Billboard } from './engine/billboard';
import { Input } from './engine/input';
import { renderFloorCeiling, renderWalls } from './engine/raycaster';
import { Sfx } from './engine/sfx';
import { Enemies, IMP } from './game/enemies';
import { Hud, type KillFeedItem } from './game/hud';
import { Items } from './game/items';
import { ENEMY_SPAWNS, ITEM_SPAWNS, PLAYER_SPAWN, SPAWN_HOST, SPAWN_CLIENT, DEATHMATCH_SPAWNS, isWall } from './game/map';
import { Player } from './game/player';
import { Spawner } from './game/spawner';
import { hitscan, Weapon } from './game/weapons';
import { MultiplayerNetwork } from './network/multiplayer';
import type { GameMode, ItemType } from './types';

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
  const network = new MultiplayerNetwork();

  // Elementos do Menu
  const overlay = document.getElementById('overlay') as HTMLElement;
  const clickToFocusBanner = document.getElementById('click-to-focus-banner') as HTMLElement;

  const screens = {
    main: document.getElementById('screen-main') as HTMLElement,
    multiplayer: document.getElementById('screen-multiplayer') as HTMLElement,
    pause: document.getElementById('screen-pause') as HTMLElement,
    gameover: document.getElementById('screen-gameover') as HTMLElement,
    controls: document.getElementById('screen-controls') as HTMLElement,
  };

  const mpPlayerNameInput = document.getElementById('mp-player-name') as HTMLInputElement;
  const mpPlayerSkinSelect = document.getElementById('mp-player-skin') as HTMLSelectElement;
  const mpBotModeSelect = document.getElementById('mp-bot-mode') as HTMLSelectElement | null;
  const mpJoinCodeInput = document.getElementById('mp-join-code') as HTMLInputElement;
  const mpHostCodeDiv = document.getElementById('mp-host-code') as HTMLElement;
  const mpHostStatusDiv = document.getElementById('mp-host-status') as HTMLElement;
  const mpStatusAlert = document.getElementById('mp-status-alert') as HTMLElement;
  const btnHostEnter = document.getElementById('btn-host-enter') as HTMLElement;

  const tabJoin = document.getElementById('tab-join') as HTMLElement;
  const tabCreate = document.getElementById('tab-create') as HTMLElement;
  const panelJoin = document.getElementById('panel-join') as HTMLElement;
  const panelCreate = document.getElementById('panel-create') as HTMLElement;

  const pauseStats = document.getElementById('pause-stats') as HTMLElement;
  const pauseModeBadge = document.getElementById('pause-mode-badge') as HTMLElement;
  const gameoverStats = document.getElementById('gameover-stats') as HTMLElement;

  let gameMode: GameMode = 'single';
  let playerName = 'Jogador_500ml';
  let playerSkin = 'bot02';
  const killFeed: KillFeedItem[] = [];

  let kills = 0;
  let damageFlash = 0;
  let pickupFlash = 0;
  let inGame = false;
  let netSyncTimer = 0;
  let respawnCountdown = 0;
  let spawnShieldTimer = 0;

  const showScreen = (name: keyof typeof screens | null): void => {
    if (!name) {
      overlay.style.display = 'none';
      clickToFocusBanner.style.display = !input.locked && inGame ? 'block' : 'none';
      return;
    }
    overlay.style.display = 'flex';
    clickToFocusBanner.style.display = 'none';
    for (const key of Object.keys(screens) as (keyof typeof screens)[]) {
      screens[key].classList.toggle('active', key === name);
    }
  };

  const showAlert = (msg: string, isError = false): void => {
    if (!mpStatusAlert) return;
    mpStatusAlert.style.display = 'block';
    mpStatusAlert.style.borderColor = isError ? '#ef4444' : '#38bdf8';
    mpStatusAlert.style.color = isError ? '#fca5a5' : '#7dd3fc';
    mpStatusAlert.textContent = msg;
  };

  const respawnPlayer = (): void => {
    if (!inGame) return;

    // Seleciona spawn point seguro mais distante do adversario
    let bestSpawn = DEATHMATCH_SPAWNS[0];
    let bestDist = -1;
    const targetX =
      network.connected && network.remotePlayer && network.remotePlayer.state !== 'dead'
        ? network.remotePlayer.x
        : (gameMode === 'multiplayer' ? 12.0 : PLAYER_SPAWN.x);
    const targetY =
      network.connected && network.remotePlayer && network.remotePlayer.state !== 'dead'
        ? network.remotePlayer.y
        : (gameMode === 'multiplayer' ? 12.0 : PLAYER_SPAWN.y);

    for (const sp of DEATHMATCH_SPAWNS) {
      const d = Math.hypot(sp.x - targetX, sp.y - targetY);
      if (d > bestDist) {
        bestDist = d;
        bestSpawn = sp;
      }
    }

    player.reset(bestSpawn.x, bestSpawn.y, bestSpawn.angle);
    player.health = 100;
    player.ammo = 40;
    player.dead = false;
    respawnCountdown = 0;
    spawnShieldTimer = 3.0; // 3 segundos de invulnerabilidade
    damageFlash = 0;
    weapon.cooldown = 0;
    weapon.flash = 0;
    weapon.recoil = 0;

    sfx.menuConfirm();

    if (network.connected) {
      network.sendRespawn(player.x, player.y);
      network.sendState({
        x: player.x,
        y: player.y,
        angle: player.angle,
        health: 100,
        skin: playerSkin,
        name: playerName,
        state: 'idle',
        frags: kills,
      });
    }

    requestLock();
  };

  const reset = (): void => {
    const botMode = mpBotModeSelect?.value || 'duel';

    if (gameMode === 'multiplayer') {
      if (network.isHost) {
        player.reset(SPAWN_HOST.x, SPAWN_HOST.y, SPAWN_HOST.angle);
      } else {
        player.reset(SPAWN_CLIENT.x, SPAWN_CLIENT.y, SPAWN_CLIENT.angle);
      }

      if (botMode === 'duel') {
        enemies.reset([], IMP);
      } else if (botMode === 'bots2') {
        enemies.reset(ENEMY_SPAWNS.slice(0, 2), IMP);
      } else {
        enemies.reset(ENEMY_SPAWNS.slice(0, 5), IMP);
      }
    } else {
      player.reset(PLAYER_SPAWN.x, PLAYER_SPAWN.y, PLAYER_SPAWN.angle);
      enemies.reset(ENEMY_SPAWNS, IMP);
    }

    items.spawn(ITEM_SPAWNS);
    weapon.cooldown = 0;
    weapon.flash = 0;
    weapon.recoil = 0;
    damageFlash = 0;
    pickupFlash = 0;
    respawnCountdown = 0;
    spawnShieldTimer = 3.0;
    spawner.reset();
  };

  const requestLock = (): void => {
    sfx.init();
    try {
      const p = canvas.requestPointerLock() as unknown as Promise<void> | undefined;
      p?.catch(() => undefined);
    } catch {}
  };

  const startGame = (mode: GameMode, name?: string, skin?: string): void => {
    sfx.init();
    sfx.menuConfirm();
    gameMode = mode;
    if (name) playerName = name;
    if (skin) playerSkin = skin;
    inGame = true;
    reset();
    showScreen(null);
    requestLock();

    // Envia estado inicial para o amigo se conectado
    if (network.connected) {
      network.sendState({
        x: player.x,
        y: player.y,
        angle: player.angle,
        health: player.health,
        skin: playerSkin,
        name: playerName,
        state: 'idle',
        frags: kills,
      });
    }
  };

  // Clique na tela ou no banner para focar/capturar mouse e renascer se eliminado
  canvas.addEventListener('click', () => {
    if (inGame) {
      if (!input.locked) requestLock();
      if (player.dead) respawnPlayer();
    }
  });

  clickToFocusBanner.addEventListener('click', () => {
    if (inGame) {
      requestLock();
      if (player.dead) respawnPlayer();
    }
  });

  // Sons de hover nos botoes
  document.querySelectorAll('.btn, .tab-btn').forEach((b) => {
    b.addEventListener('mouseenter', () => {
      sfx.init();
      sfx.menuSelect();
    });
  });

  // Alternar Abas P2P no Lobby
  tabJoin?.addEventListener('click', () => {
    tabJoin.classList.add('active');
    tabCreate.classList.remove('active');
    panelJoin.classList.add('active');
    panelCreate.classList.remove('active');
    sfx.menuSelect();
  });

  tabCreate?.addEventListener('click', () => {
    tabCreate.classList.add('active');
    tabJoin.classList.remove('active');
    panelCreate.classList.add('active');
    panelJoin.classList.remove('active');
    sfx.menuSelect();

    if (!network.isHost || !network.roomCode) {
      const randomCode = Math.random().toString(36).substring(2, 6).toUpperCase();
      mpHostCodeDiv.textContent = 'CONECTANDO...';
      mpHostStatusDiv.textContent = '⏳ Registrando sala P2P na rede...';
      btnHostEnter.style.display = 'none';

      // Salva estado inicial antes de abrir sala
      const nick = mpPlayerNameInput.value.trim() || 'Jogador_500ml';
      const skin = mpPlayerSkinSelect.value || 'bot02';
      network.localState = {
        x: SPAWN_HOST.x,
        y: SPAWN_HOST.y,
        angle: SPAWN_HOST.angle,
        health: 100,
        skin,
        name: nick,
        state: 'idle',
        frags: 0,
      };

      network.createRoom(
        randomCode,
        (code) => {
          mpHostCodeDiv.textContent = code;
          mpHostStatusDiv.textContent = '⏳ Sala aberta! Passe o código para seu amigo conectar...';
        },
        (err) => {
          mpHostCodeDiv.textContent = 'ERRO';
          mpHostStatusDiv.textContent = `❌ ${err}`;
        },
      );
    }
  });

  // Botão que surge para o Host entrar quando o amigo conecta
  btnHostEnter?.addEventListener('click', () => {
    const nick = mpPlayerNameInput.value.trim() || 'Jogador_500ml';
    const skin = mpPlayerSkinSelect.value || 'bot02';
    startGame('multiplayer', nick, skin);
  });

  // Copiar link da sala
  document.getElementById('btn-copy-link')?.addEventListener('click', () => {
    if (!network.roomCode) return;
    const url = `${window.location.origin}${window.location.pathname}?sala=${network.roomCode}`;
    navigator.clipboard.writeText(url).then(() => {
      showAlert(`✓ Link copiado! Envie para seu amigo: ?sala=${network.roomCode}`);
    }).catch(() => {
      showAlert(`Código da sala: ${network.roomCode}`);
    });
  });

  // Conectar com Código (Client)
  document.getElementById('btn-connect-room')?.addEventListener('click', () => {
    const code = mpJoinCodeInput.value.trim().toUpperCase();
    if (!code) {
      showAlert('Por favor, digite o código da sala.', true);
      return;
    }
    const nick = mpPlayerNameInput.value.trim() || 'Jogador_500ml';
    const skin = mpPlayerSkinSelect.value || 'bot02';
    playerName = nick;
    playerSkin = skin;

    showAlert(`Conectando à sala ${code}... aguarde.`);
    sfx.init();

    // Salva estado inicial do cliente
    network.localState = {
      x: SPAWN_CLIENT.x,
      y: SPAWN_CLIENT.y,
      angle: SPAWN_CLIENT.angle,
      health: 100,
      skin,
      name: nick,
      state: 'idle',
      frags: 0,
    };

    network.joinRoom(
      code,
      () => {
        showAlert(`Conectado à sala ${code}! Entrando na arena...`);
        // Dispara entrada imediata pelo clique do usuario
        startGame('multiplayer', playerName, playerSkin);
      },
      (err) => {
        showAlert(`Falha ao conectar: ${err}`, true);
      },
    );
  });

  // Callbacks de Eventos de Rede P2P
  network.onConnected = (remoteName) => {
    sfx.menuConfirm();
    showAlert(`🟢 Amigo conectado (${remoteName})!`);

    if (network.isHost) {
      mpHostStatusDiv.innerHTML = `<span style="color:#4ade80; font-weight:bold;">🟢 ${remoteName} conectou! Entrando na arena...</span>`;
      btnHostEnter.style.display = 'block';
      showAlert(`🟢 Amigo conectado! Entrando na partida...`);

      // Auto-inicia partida no Host se estiver no lobby
      setTimeout(() => {
        if (!inGame) {
          const nick = mpPlayerNameInput.value.trim() || 'Jogador_500ml';
          const skin = mpPlayerSkinSelect.value || 'bot02';
          startGame('multiplayer', nick, skin);
        }
      }, 1000);
    }
  };

  network.onDisconnected = () => {
    killFeed.unshift({ text: '⚠️ O outro jogador desconectou!', timer: 4 });
  };

  network.onReceiveHit = (damage, from) => {
    if (spawnShieldTimer > 0 || player.dead) return; // Escudo protetor ativo
    player.damage(damage);
    damageFlash = 0.4;
    sfx.hurt();
    if (player.dead) {
      respawnCountdown = 2.5;
      sfx.enemyDie();
      network.sendDie(from);
      killFeed.unshift({ text: `☠️ ${from} eliminou você!`, timer: 4.5 });
    }
  };

  network.onRemoteShoot = () => {
    sfx.fire();
  };

  network.onRemoteKill = (killer, victim) => {
    sfx.enemyDie();
    killFeed.unshift({ text: `⚡ ${killer} eliminou ${victim}! (+1 FRAG)`, timer: 4 });
    if (killFeed.length > 4) killFeed.pop();
  };

  network.onRemoteRespawn = (x, y) => {
    if (network.remotePlayer) {
      network.remotePlayer.x = x;
      network.remotePlayer.y = y;
      network.remotePlayer.health = 100;
      network.remotePlayer.state = 'idle';
    }
    killFeed.unshift({ text: `⚡ ${network.remotePlayer?.name || 'Amigo'} renasceu na arena!`, timer: 3 });
  };

  // Tela Principal
  document.getElementById('btn-start-single')?.addEventListener('click', () => {
    network.cleanup();
    startGame('single');
  });

  document.getElementById('btn-open-multiplayer')?.addEventListener('click', () => {
    sfx.init();
    sfx.menuSelect();
    showScreen('multiplayer');
  });

  document.getElementById('btn-open-controls')?.addEventListener('click', () => {
    sfx.init();
    sfx.menuSelect();
    showScreen('controls');
  });

  document.getElementById('btn-play-offline-bots')?.addEventListener('click', () => {
    network.cleanup();
    const nick = mpPlayerNameInput.value.trim() || 'Jogador_500ml';
    const skin = mpPlayerSkinSelect.value || 'bot02';
    startGame('multiplayer', nick, skin);
  });

  document.getElementById('btn-back-to-main-from-mp')?.addEventListener('click', () => {
    network.cleanup();
    sfx.menuSelect();
    showScreen('main');
  });

  document.getElementById('btn-back-to-main-from-controls')?.addEventListener('click', () => {
    sfx.menuSelect();
    showScreen('main');
  });

  // Tela Pausa
  document.getElementById('btn-resume-game')?.addEventListener('click', () => {
    sfx.menuConfirm();
    showScreen(null);
    requestLock();
  });

  document.getElementById('btn-restart-game')?.addEventListener('click', () => {
    startGame(gameMode, playerName, playerSkin);
  });

  document.getElementById('btn-quit-to-main')?.addEventListener('click', () => {
    network.cleanup();
    sfx.menuSelect();
    inGame = false;
    reset();
    showScreen('main');
  });

  // Tela Fim de Jogo
  document.getElementById('btn-respawn-game')?.addEventListener('click', () => {
    startGame(gameMode, playerName, playerSkin);
  });

  document.getElementById('btn-gameover-to-main')?.addEventListener('click', () => {
    network.cleanup();
    sfx.menuSelect();
    inGame = false;
    reset();
    showScreen('main');
  });

  const onHitPlayer = (dmg: number): void => {
    if (spawnShieldTimer > 0 || player.dead) return; // Escudo protetor ativo
    player.damage(dmg);
    damageFlash = 0.4;
    sfx.hurt();
    if (player.dead) {
      respawnCountdown = 2.5;
      sfx.enemyDie();
      if (network.connected) {
        network.sendDie('Bot');
      }
    }
  };

  document.addEventListener('pointerlockchange', () => {
    const locked = input.locked;
    if (inGame) {
      clickToFocusBanner.style.display = !locked && overlay.style.display === 'none' ? 'block' : 'none';
    } else {
      clickToFocusBanner.style.display = 'none';
    }

    if (!locked && inGame) {
      if (player.dead && gameMode !== 'multiplayer') {
        gameoverStats.textContent = `Frags conquistados: ${kills} (Modo Single Player)`;
        showScreen('gameover');
      }
    }
  });

  // ESC durante o jogo abre a tela de pausa, ESPACO renasce se morto
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && inGame && player.dead) {
      respawnPlayer();
      return;
    }

    if (e.code === 'Escape' && inGame) {
      if (overlay.style.display === 'flex') {
        showScreen(null);
        requestLock();
      } else {
        pauseModeBadge.textContent = gameMode === 'multiplayer' ? 'MODO MULTIPLAYER' : 'MODO SINGLE PLAYER';
        pauseStats.textContent = `Kills: ${kills} · Vida: ${Math.max(0, Math.ceil(player.health))}% · Munição: ${player.ammo}`;
        showScreen('pause');
      }
    }
  });

  // Auto-fill do código da sala se vier por query string na URL (?sala=XXXX)
  const urlParams = new URLSearchParams(window.location.search);
  const roomParam = urlParams.get('sala') || urlParams.get('room');
  if (roomParam) {
    showScreen('multiplayer');
    if (mpJoinCodeInput) mpJoinCodeInput.value = roomParam.toUpperCase();
    showAlert(`Código de sala "${roomParam.toUpperCase()}" preenchido! Digite seu apelido e clique em "Conectar e Jogar".`);
  }

  const update = (dt: number): void => {
    if (player.dead) {
      respawnCountdown -= dt;
      if (respawnCountdown <= 0) {
        respawnPlayer();
      }
    } else {
      if (spawnShieldTimer > 0) spawnShieldTimer -= dt;
      if (input.locked) {
        player.update(dt, input);
      }
      weapon.update(dt);
    }

    // Gerenciamento de bots
    let maxBots = 8;
    if (gameMode === 'multiplayer') {
      const mode = mpBotModeSelect?.value || 'duel';
      if (mode === 'duel') maxBots = 0;
      else if (mode === 'bots2') maxBots = 2;
      else maxBots = 5;
    }

    if (maxBots > 0) {
      const isDeathmatch = gameMode === 'multiplayer';
      enemies.update(
        dt,
        player,
        IMP,
        onHitPlayer,
        isDeathmatch,
        (killer, victim) => {
          sfx.enemyDie();
          killFeed.unshift({
            text: `☠️ ${killer.name || 'Bot'} eliminou ${victim.name || 'Bot'}!`,
            timer: 3.5,
          });
          if (killFeed.length > 4) killFeed.pop();
        },
      );
    }

    spawner.update(dt, player, IMP, maxBots);

    if (!player.dead) {
      items.update(player, sfx, (type: ItemType) => {
        if (type === 'health') player.health = Math.min(100, player.health + 25);
        else player.ammo += 20;
        pickupFlash = 0.3;
      });
    }

    // Sincronização de rede P2P (envia a cada 50ms = 20Hz SEMPRE QUE inGame FOR VERDADEIRO)
    if (network.connected) {
      netSyncTimer -= dt;
      if (netSyncTimer <= 0) {
        netSyncTimer = 0.05;
        let pState: 'idle' | 'walk' | 'attack' | 'hurt' | 'dead' = 'idle';
        if (player.dead) pState = 'dead';
        else if (damageFlash > 0) pState = 'hurt';
        else if (weapon.flash > 0) pState = 'attack';
        else if (input.down('KeyW') || input.down('KeyS') || input.down('KeyA') || input.down('KeyD')) pState = 'walk';

        network.sendState({
          x: player.x,
          y: player.y,
          angle: player.angle,
          health: player.health,
          skin: playerSkin,
          name: playerName,
          state: pState,
          frags: kills,
        });
      }

      // Atualiza timers do remote player
      if (network.remotePlayer) {
        if (network.remotePlayer.hurtTimer > 0) network.remotePlayer.hurtTimer -= dt;
        if (network.remotePlayer.attackTimer > 0) network.remotePlayer.attackTimer -= dt;
      }
    }

    // Atualiza timers do feed de eliminacoes
    for (let i = killFeed.length - 1; i >= 0; i--) {
      killFeed[i].timer -= dt;
      if (killFeed[i].timer <= 0) killFeed.splice(i, 1);
    }

    // Disparo de tiros (apenas quando vivo)
    if (!player.dead && input.locked && input.firing && weapon.canFire()) {
      if (player.ammo <= 0) {
        sfx.dry();
        weapon.dryFire();
      } else {
        player.ammo--;
        weapon.fire();
        sfx.fire();

        if (network.connected) {
          network.sendShoot(player.x, player.y, player.dirX, player.dirY);
        }

        // Verifica se acertou o amigo conectado via hitscan
        let hitFriend = false;
        if (network.connected && network.remotePlayer && network.remotePlayer.state !== 'dead' && network.remotePlayer.health > 0) {
          const rp = network.remotePlayer;
          for (let d = 0.4; d < 22; d += 0.06) {
            const hx = player.x + player.dirX * d;
            const hy = player.y + player.dirY * d;
            if (isWall(hx, hy)) break;
            const rx = hx - rp.x;
            const ry = hy - rp.y;
            if (rx * rx + ry * ry < 0.16) {
              hitFriend = true;
              break;
            }
          }
        }

        if (hitFriend && network.remotePlayer) {
          sfx.hit();
          const dmg = 26 + Math.floor(Math.random() * 12);
          network.sendHit(dmg, playerName);
          network.remotePlayer.hurtTimer = 0.2;
          network.remotePlayer.health -= dmg;

          if (network.remotePlayer.health <= 0) {
            network.remotePlayer.health = 0;
            network.remotePlayer.state = 'dead';
            kills++;
            sfx.enemyDie();
            network.sendDie(playerName);
            killFeed.unshift({
              text: `⚡ Você eliminou ${network.remotePlayer.name}! (+1 FRAG)`,
              timer: 4,
            });
            if (killFeed.length > 4) killFeed.pop();
          }
        } else {
          // Hitscan nos bots normais
          const target = hitscan(player.x, player.y, player.dirX, player.dirY, enemies.list);
          if (target) {
            sfx.hit();
            if (enemies.damage(target, 24 + Math.random() * 12)) {
              kills++;
              sfx.enemyDie();
              if (gameMode === 'multiplayer') {
                killFeed.unshift({
                  text: `⚡ ${playerName} eliminou ${target.name || 'Bot'}! (+1 FRAG)`,
                  timer: 3.5,
                });
                if (killFeed.length > 4) killFeed.pop();
              }
            }
          }
        }
      }
    }

    if (damageFlash > 0) damageFlash -= dt;
    if (pickupFlash > 0) pickupFlash -= dt;
    if (input.consumeMinimapToggle()) hud.showMinimap = !hud.showMinimap;
  };

  const render = (): void => {
    renderFloorCeiling(buf, W, VIEW_H);
    renderWalls(buf, W, VIEW_H, zbuffer, player.x, player.y, player.dirX, player.dirY, player.planeX, player.planeY, assets);

    const billboards: Billboard[] = [];

    // Renderiza o amigo conectado em 3D no mapa!
    if (network.connected && network.remotePlayer) {
      const rp = network.remotePlayer;
      let spriteName = `${rp.skin}_idle`;
      if (rp.state === 'dead' || rp.health <= 0) {
        spriteName = `${rp.skin}_dead`;
      } else if (rp.hurtTimer > 0) {
        spriteName = `${rp.skin}_hurt`;
      } else if (rp.attackTimer > 0) {
        spriteName = `${rp.skin}_attack`;
      } else if (rp.state === 'walk') {
        const frame = Math.floor(Date.now() / 150) % 4;
        spriteName = `${rp.skin}_walk${frame + 1}`;
      }

      let tex = assets.get(spriteName) || assets.get(`${rp.skin}_idle`) || assets.get('bot02_idle') || assets.get('enemy_imp');
      if (tex) {
        let scale = assets.scale(spriteName, IMP.scale);
        if (rp.state === 'dead' || rp.health <= 0) {
          scale *= 0.55;
        }
        billboards.push({
          x: rp.x,
          y: rp.y,
          texture: tex,
          scale,
          vOffset: 0,
          tintRed: rp.hurtTimer > 0,
        });
      }
    }

    // Renderiza os bots
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
        spriteName = `${e.skin}_walk${frame + 1}`;
      }

      let tex = assets.get(spriteName) || assets.get(`${e.skin}_idle`) || assets.get('enemy_imp');
      if (!tex) continue;

      let scale = assets.scale(spriteName, IMP.scale);
      if (e.state === 'dead') {
        scale *= Math.max(0.3, e.deathTimer / 0.5) * 0.7;
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

    const remoteInfo = (network.connected && network.remotePlayer)
      ? {
          x: network.remotePlayer.x,
          y: network.remotePlayer.y,
          angle: network.remotePlayer.angle,
          name: network.remotePlayer.name,
          health: network.remotePlayer.health,
          frags: network.remotePlayer.frags,
          dead: network.remotePlayer.state === 'dead' || network.remotePlayer.health <= 0,
        }
      : null;

    hud.draw({
      player,
      enemies: enemies.list,
      items: items.list,
      weapon,
      kills,
      damageFlash,
      pickupFlash,
      gameMode,
      playerName,
      killFeed,
      remotePlayer: remoteInfo,
      respawnCountdown,
      spawnShieldTimer,
    });
  };

  let last = performance.now();
  const loop = (t: number): void => {
    const dt = Math.min(0.05, (t - last) / 1000);
    last = t;
    if (inGame) {
      update(dt);
    }
    render();
    requestAnimationFrame(loop);
  };

  reset();
  if (!roomParam) {
    showScreen('main');
  }
  requestAnimationFrame(loop);
}

void main();
