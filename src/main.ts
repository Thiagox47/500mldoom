import { Assets } from './engine/assets';
import { renderBillboards, type Billboard } from './engine/billboard';
import { Input } from './engine/input';
import { renderFloorCeiling, renderWalls, isEntityInFov, getEntityRelativeAspect } from './engine/raycaster';
import { Sfx } from './engine/sfx';
import { Enemies, IMP } from './game/enemies';
import { Hud, type KillFeedItem, type SpottedPing } from './game/hud';
import { Items } from './game/items';
import { ENEMY_SPAWNS, ITEM_SPAWNS, PLAYER_SPAWN, DEATHMATCH_SPAWNS, isWall } from './game/map';
import { Player } from './game/player';
import { Spawner } from './game/spawner';
import { hitscan, Weapon } from './game/weapons';
import { MultiplayerNetwork, type LobbyPlayer } from './network/multiplayer';
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

  const mpHostPlayersCount = document.getElementById('mp-host-players-count') as HTMLElement;
  const mpHostPlayersList = document.getElementById('mp-host-players-list') as HTMLElement;
  const mpJoinInputSection = document.getElementById('mp-join-input-section') as HTMLElement;
  const mpClientLobby = document.getElementById('mp-client-lobby') as HTMLElement;
  const mpClientCodeDisplay = document.getElementById('mp-client-code-display') as HTMLElement;
  const mpClientPlayersCount = document.getElementById('mp-client-players-count') as HTMLElement;
  const mpClientPlayersList = document.getElementById('mp-client-players-list') as HTMLElement;
  const mpClientStatus = document.getElementById('mp-client-status') as HTMLElement;
  const btnClientJoinInprogress = document.getElementById('btn-client-join-inprogress') as HTMLButtonElement;

  const pauseStats = document.getElementById('pause-stats') as HTMLElement;
  const pauseModeBadge = document.getElementById('pause-mode-badge') as HTMLElement;
  const gameoverStats = document.getElementById('gameover-stats') as HTMLElement;

  let gameMode: GameMode = 'single';
  let playerName = 'Jogador_500ml';
  let playerSkin = 'bot02';
  const killFeed: KillFeedItem[] = [];

  // Pings de radar (ponto vermelho por 3s quando avistado no campo de visão)
  const spottedPings = new Map<string, SpottedPing>();

  let kills = 0;
  let damageFlash = 0;
  let pickupFlash = 0;
  let inGame = false;
  let netSyncTimer = 0;
  let respawnCountdown = 0;
  let spawnShieldTimer = 0;

  const releaseLock = (): void => {
    try {
      if (document.pointerLockElement) {
        document.exitPointerLock();
      }
    } catch {}
  };

  const showScreen = (name: keyof typeof screens | null): void => {
    if (!name) {
      overlay.style.display = 'none';
      clickToFocusBanner.style.display = !input.locked && inGame ? 'block' : 'none';
      return;
    }
    releaseLock();
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

  const updateLobbyUi = (players: LobbyPlayer[]): void => {
    const countText = `${players.length} jogador${players.length > 1 ? 'es' : ''}`;
    if (mpHostPlayersCount) mpHostPlayersCount.textContent = countText;
    if (mpClientPlayersCount) mpClientPlayersCount.textContent = countText;

    const renderList = (container: HTMLElement) => {
      if (!container) return;
      container.innerHTML = '';
      for (const p of players) {
        const isYou = p.id === network.myId;
        const item = document.createElement('div');
        item.className = 'player-item';
        item.innerHTML = `
          <div class="player-item-name">
            <span>${p.isHost ? '👑' : '🎮'}</span>
            <span>${p.name}</span>
          </div>
          <div style="display: flex; gap: 4px; align-items: center;">
            ${isYou ? '<span class="player-badge badge-you">Você</span>' : ''}
            <span class="player-badge ${p.isHost ? 'badge-host' : 'badge-guest'}">${p.isHost ? 'Host' : 'Convidado'}</span>
          </div>
        `;
        container.appendChild(item);
      }
    };

    if (mpHostPlayersList) renderList(mpHostPlayersList);
    if (mpClientPlayersList) renderList(mpClientPlayersList);

    if (network.isHost && btnHostEnter) {
      btnHostEnter.textContent = `⚔️ INICIAR PARTIDA (${players.length} JOGADOR${players.length > 1 ? 'ES' : ''})`;
      btnHostEnter.style.display = 'block';
    }
  };

  const respawnPlayer = (): void => {
    if (!inGame) return;

    // Seleciona spawn point seguro com a maior distância mínima de qualquer oponente
    let bestSpawn = DEATHMATCH_SPAWNS[0];
    let bestDist = -1;

    const opponents: { x: number; y: number }[] = [];
    if (network.connected) {
      for (const rp of network.remotePlayerList) {
        if (rp.state !== 'dead' && rp.health > 0) opponents.push({ x: rp.x, y: rp.y });
      }
    }
    for (const e of enemies.list) {
      if (e.state !== 'dead') opponents.push({ x: e.x, y: e.y });
    }

    if (opponents.length > 0) {
      for (const sp of DEATHMATCH_SPAWNS) {
        let minDist = Infinity;
        for (const opp of opponents) {
          const d = Math.hypot(sp.x - opp.x, sp.y - opp.y);
          if (d < minDist) minDist = d;
        }
        if (minDist > bestDist) {
          bestDist = minDist;
          bestSpawn = sp;
        }
      }
    } else {
      bestSpawn = DEATHMATCH_SPAWNS[Math.floor(Math.random() * DEATHMATCH_SPAWNS.length)];
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
    kills = 0; // Garante que a contagem de frags sempre comece do zero
    const botMode = mpBotModeSelect?.value || 'duel';
    spottedPings.clear();

    if (gameMode === 'multiplayer') {
      const myIdx = network.getPlayerIndex();
      const spawn = DEATHMATCH_SPAWNS[myIdx % DEATHMATCH_SPAWNS.length];
      player.reset(spawn.x, spawn.y, spawn.angle);

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
    kills = 0; // Zera frags ao iniciar qualquer modo (evita vazamento de singleplayer para multiplayer)
    killFeed.length = 0; // Limpa feed de eliminações de partidas anteriores
    if (name) playerName = name;
    if (skin) playerSkin = skin;
    inGame = true;
    reset();
    showScreen(null);
    requestLock();

    // Envia estado inicial para todos os jogadores na sala
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

      const nick = mpPlayerNameInput.value.trim() || 'Jogador_500ml';
      const skin = mpPlayerSkinSelect.value || 'bot02';
      playerName = nick;
      playerSkin = skin;

      network.createRoom(
        randomCode,
        nick,
        skin,
        (code) => {
          mpHostCodeDiv.textContent = code;
          mpHostStatusDiv.textContent = '⏳ Sala aberta! Passe o código para seus amigos conectarem...';
          btnHostEnter.style.display = 'block';
          btnHostEnter.textContent = '⚔️ INICIAR PARTIDA (1 JOGADOR)';
        },
        (err) => {
          mpHostCodeDiv.textContent = 'ERRO';
          mpHostStatusDiv.textContent = `❌ ${err}`;
        },
      );
    }
  });

  // Botão em que o Criador/Host decide quando iniciar a partida
  btnHostEnter?.addEventListener('click', () => {
    const nick = mpPlayerNameInput.value.trim() || 'Jogador_500ml';
    const skin = mpPlayerSkinSelect.value || 'bot02';
    network.startGame();
    startGame('multiplayer', nick, skin);
  });

  // Copiar link da sala
  document.getElementById('btn-copy-link')?.addEventListener('click', () => {
    if (!network.roomCode) return;
    const url = `${window.location.origin}${window.location.pathname}?sala=${network.roomCode}`;
    navigator.clipboard.writeText(url).then(() => {
      showAlert(`✓ Link copiado! Envie para seus amigos: ?sala=${network.roomCode}`);
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

    network.joinRoom(
      code,
      nick,
      skin,
      () => {
        showAlert(`Conectado à sala ${code}! Aguardando o Criador iniciar a partida...`);
        if (mpJoinInputSection) mpJoinInputSection.style.display = 'none';
        if (mpClientLobby) mpClientLobby.style.display = 'flex';
        if (mpClientCodeDisplay) mpClientCodeDisplay.textContent = code;
        if (btnClientJoinInprogress) btnClientJoinInprogress.style.display = 'none';
        if (mpClientStatus) {
          mpClientStatus.innerHTML = '⏳ Aguardando o Criador da sala iniciar a partida...';
          mpClientStatus.style.color = '#38bdf8';
        }
      },
      (err) => {
        showAlert(`Falha ao conectar: ${err}`, true);
      },
    );
  });

  // Callbacks de Eventos de Rede Multi-player
  network.onLobbyUpdate = (players) => {
    updateLobbyUi(players);
  };

  network.onGameInProgress = () => {
    if (inGame) return;
    if (mpClientStatus) {
      mpClientStatus.innerHTML = '<span style="color:#fbbf24; font-weight:bold; font-size:12px;">⚔️ PARTIDA EM ANDAMENTO!</span><br><span style="color:#94a3b8; font-size:11px;">O criador já iniciou o combate. Você pode entrar agora mesmo!</span>';
    }
    if (btnClientJoinInprogress) {
      btnClientJoinInprogress.style.display = 'block';
      btnClientJoinInprogress.textContent = '⚡ ENTRAR NA PARTIDA (RECONECTAR)';
    }
    showAlert('⚔️ A partida nesta sala já está em andamento! Clique em "Entrar na Partida" para jogar.');
  };

  btnClientJoinInprogress?.addEventListener('click', () => {
    sfx.init();
    sfx.menuConfirm();
    const nick = mpPlayerNameInput.value.trim() || 'Jogador_500ml';
    const skin = mpPlayerSkinSelect.value || 'bot02';
    startGame('multiplayer', nick, skin);
  });

  network.onPlayerJoined = (remoteName) => {
    sfx.menuSelect();
    showAlert(`🟢 ${remoteName} entrou na sala!`);
    if (network.isHost && mpHostStatusDiv) {
      mpHostStatusDiv.innerHTML = `<span style="color:#4ade80;">🟢 ${remoteName} conectou! Clique em "Iniciar Partida" quando todos estiverem prontos.</span>`;
    }
  };

  network.onPlayerLeft = (remoteName) => {
    showAlert(`⚠️ ${remoteName} saiu da sala.`);
    killFeed.unshift({ text: `⚠️ ${remoteName} desconectou.`, timer: 4 });
  };

  network.onStartGame = () => {
    sfx.menuConfirm();
    showAlert('🚀 O Criador iniciou a partida! Entrando na arena...');
    const nick = mpPlayerNameInput.value.trim() || 'Jogador_500ml';
    const skin = mpPlayerSkinSelect.value || 'bot02';
    startGame('multiplayer', nick, skin);
  };

  network.onDisconnected = () => {
    killFeed.unshift({ text: '⚠️ Conexão com a sala encerrada.', timer: 4 });
  };

  network.onReceiveHit = (damage, from) => {
    if (spawnShieldTimer > 0 || player.dead) return; // Escudo protetor ativo
    player.damage(damage);
    damageFlash = 0.4;
    sfx.hurt();
    if (player.dead) {
      respawnCountdown = 2.5;
      sfx.enemyDie();
      network.sendDie(network.myId, from);
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

  network.onRemoteRespawn = (id, _x, _y) => {
    const rp = network.remotePlayers.get(id);
    const name = rp?.name || 'Um jogador';
    killFeed.unshift({ text: `⚡ ${name} renasceu na arena!`, timer: 3 });
  };

  // Tela Principal
  document.getElementById('btn-start-single')?.addEventListener('click', () => {
    network.cleanup();
    kills = 0;
    startGame('single');
  });

  document.getElementById('btn-open-multiplayer')?.addEventListener('click', () => {
    sfx.init();
    sfx.menuSelect();
    kills = 0;
    if (mpJoinInputSection) mpJoinInputSection.style.display = 'flex';
    if (mpClientLobby) mpClientLobby.style.display = 'none';
    showScreen('multiplayer');
  });

  document.getElementById('btn-open-controls')?.addEventListener('click', () => {
    sfx.init();
    sfx.menuSelect();
    showScreen('controls');
  });

  document.getElementById('btn-play-offline-bots')?.addEventListener('click', () => {
    network.cleanup();
    kills = 0;
    const nick = mpPlayerNameInput.value.trim() || 'Jogador_500ml';
    const skin = mpPlayerSkinSelect.value || 'bot02';
    startGame('multiplayer', nick, skin);
  });

  document.getElementById('btn-back-to-main-from-mp')?.addEventListener('click', () => {
    network.cleanup();
    sfx.menuSelect();
    if (mpJoinInputSection) mpJoinInputSection.style.display = 'flex';
    if (mpClientLobby) mpClientLobby.style.display = 'none';
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
    releaseLock();
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
    releaseLock();
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
        network.sendDie(network.myId, 'Bot');
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

  // Libera o Pointer Lock e encerra conexão P2P ao fechar a página, mudar de aba ou perder o foco
  const handleExitOrBlur = (): void => {
    releaseLock();
    if (network.connected) {
      network.cleanup();
    }
  };

  window.addEventListener('beforeunload', handleExitOrBlur);
  window.addEventListener('pagehide', handleExitOrBlur);
  window.addEventListener('unload', handleExitOrBlur);
  window.addEventListener('blur', () => {
    releaseLock();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      releaseLock();
    }
  });

  // Auto-fill do código da sala se vier por query string na URL (?sala=XXXX)
  const urlParams = new URLSearchParams(window.location.search);
  const roomParam = urlParams.get('sala') || urlParams.get('room');
  if (roomParam) {
    showScreen('multiplayer');
    if (mpJoinCodeInput) mpJoinCodeInput.value = roomParam.toUpperCase();
    showAlert(`Código de sala "${roomParam.toUpperCase()}" preenchido! Digite seu apelido e clique em "Conectar e Entrar na Sala".`);
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

      // Atualiza timers de todos os remote players
      for (const rp of network.remotePlayerList) {
        if (rp.hurtTimer > 0) rp.hurtTimer -= dt;
        if (rp.attackTimer > 0) rp.attackTimer -= dt;
      }
    }

    // Radar de Campo de Visão (FOV):
    // Quando outro jogador aparece no campo de visão e sem parede bloqueando, gera um ponto vermelho no mapa por 3s
    if (network.connected) {
      for (const rp of network.remotePlayerList) {
        if (rp.state !== 'dead' && rp.health > 0) {
          if (isEntityInFov(player.x, player.y, player.angle, rp.x, rp.y)) {
            spottedPings.set(rp.id, {
              id: rp.id,
              x: rp.x,
              y: rp.y,
              timer: 3.0,
            });
          }
        }
      }
    }

    // Bots também ativam o ponto vermelho se entrarem no campo de visão
    enemies.list.forEach((e, idx) => {
      if (e.state !== 'dead') {
        if (isEntityInFov(player.x, player.y, player.angle, e.x, e.y)) {
          const botId = e.id || `bot-${e.name || idx}`;
          spottedPings.set(botId, {
            id: botId,
            x: e.x,
            y: e.y,
            timer: 3.0,
          });
        }
      }
    });

    // Atualiza timers dos pontos vermelhos (remove após 3 segundos)
    for (const [id, ping] of spottedPings.entries()) {
      ping.timer -= dt;
      if (ping.timer <= 0) {
        spottedPings.delete(id);
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

        // Verifica se acertou algum jogador remoto conectado via hitscan
        let hitRemotePlayer: (typeof network.remotePlayerList)[0] | null = null;
        if (network.connected) {
          for (const rp of network.remotePlayerList) {
            if (rp.state === 'dead' || rp.health <= 0) continue;
            for (let d = 0.4; d < 22; d += 0.06) {
              const hx = player.x + player.dirX * d;
              const hy = player.y + player.dirY * d;
              if (isWall(hx, hy)) break;
              const rx = hx - rp.x;
              const ry = hy - rp.y;
              if (rx * rx + ry * ry < 0.16) {
                hitRemotePlayer = rp;
                break;
              }
            }
            if (hitRemotePlayer) break;
          }
        }

        if (hitRemotePlayer) {
          sfx.hit();
          const dmg = 26 + Math.floor(Math.random() * 12);
          network.sendHit(hitRemotePlayer.id, dmg, playerName);
          hitRemotePlayer.hurtTimer = 0.2;
          hitRemotePlayer.health -= dmg;

          if (hitRemotePlayer.health <= 0) {
            hitRemotePlayer.health = 0;
            hitRemotePlayer.state = 'dead';
            kills++;
            sfx.enemyDie();
            network.sendDie(hitRemotePlayer.id, playerName);
            killFeed.unshift({
              text: `⚡ Você eliminou ${hitRemotePlayer.name}! (+1 FRAG)`,
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

    // Renderiza todos os jogadores remotos conectados em 3D no mapa!
    if (network.connected) {
      for (const rp of network.remotePlayerList) {
        const aspect = getEntityRelativeAspect(rp.x, rp.y, rp.angle, player.x, player.y);
        const isBack = aspect !== 'front';
        let spriteName = isBack ? `${rp.skin}_back_idle` : `${rp.skin}_idle`;
        if (aspect === 'back_left' && assets.get(`${rp.skin}_back_left`)) {
          spriteName = `${rp.skin}_back_left`;
        } else if (aspect === 'back_right' && assets.get(`${rp.skin}_back_right`)) {
          spriteName = `${rp.skin}_back_right`;
        }

        if (rp.state === 'dead' || rp.health <= 0) {
          spriteName = `${rp.skin}_dead`;
        } else if (rp.hurtTimer > 0) {
          spriteName = `${rp.skin}_hurt`;
        } else if (rp.attackTimer > 0) {
          spriteName = `${rp.skin}_attack`;
        } else if (rp.state === 'walk') {
          const frame = Math.floor(Date.now() / 150) % 4;
          spriteName = isBack ? `${rp.skin}_back_walk${frame + 1}` : `${rp.skin}_walk${frame + 1}`;
        }

        const tex = assets.get(spriteName)
          || (isBack ? (assets.get(`${rp.skin}_back_idle`) || assets.get(`${rp.skin}_idle`)) : undefined)
          || assets.get(`${rp.skin}_idle`)
          || assets.get('bot02_idle')
          || assets.get('enemy_imp');

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
    }

    // Renderiza os bots
    for (const e of enemies.list) {
      const botAngle = e.angle ?? 0;
      const aspect = getEntityRelativeAspect(e.x, e.y, botAngle, player.x, player.y);
      const isBack = aspect !== 'front';
      let spriteName = isBack ? `${e.skin}_back_idle` : `${e.skin}_idle`;
      if (aspect === 'back_left' && assets.get(`${e.skin}_back_left`)) {
        spriteName = `${e.skin}_back_left`;
      } else if (aspect === 'back_right' && assets.get(`${e.skin}_back_right`)) {
        spriteName = `${e.skin}_back_right`;
      }

      if (e.state === 'dead') {
        spriteName = `${e.skin}_dead`;
      } else if (e.hurtTimer > 0) {
        spriteName = `${e.skin}_hurt`;
      } else if (e.state === 'attack') {
        spriteName = `${e.skin}_attack`;
      } else if (e.state === 'chase') {
        const frame = Math.floor(e.animTime * 5) % 4;
        spriteName = isBack ? `${e.skin}_back_walk${frame + 1}` : `${e.skin}_walk${frame + 1}`;
      }

      const tex = assets.get(spriteName)
        || (isBack ? (assets.get(`${e.skin}_back_idle`) || assets.get(`${e.skin}_idle`)) : undefined)
        || assets.get(`${e.skin}_idle`)
        || assets.get('enemy_imp');
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

    const remoteInfoList = network.connected
      ? network.remotePlayerList.map((rp) => ({
          id: rp.id,
          x: rp.x,
          y: rp.y,
          angle: rp.angle,
          name: rp.name,
          frags: rp.frags,
          dead: rp.state === 'dead' || rp.health <= 0,
        }))
      : [];

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
      remotePlayers: remoteInfoList,
      spottedPings: Array.from(spottedPings.values()),
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
