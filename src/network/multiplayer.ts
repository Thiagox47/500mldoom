import { Peer, type DataConnection } from 'peerjs';

export interface NetworkState {
  id?: string;
  x: number;
  y: number;
  angle: number;
  health: number;
  skin: string;
  name: string;
  state: 'idle' | 'walk' | 'attack' | 'hurt' | 'dead';
  frags: number;
}

export interface LobbyPlayer {
  id: string;
  name: string;
  skin: string;
  isHost: boolean;
}

export type NetMessage =
  | { type: 'join'; player: LobbyPlayer }
  | { type: 'lobby_update'; players: LobbyPlayer[]; inProgress?: boolean }
  | { type: 'start_game'; mode?: string }
  | { type: 'game_in_progress'; mode?: string }
  | { type: 'state'; id: string; payload: NetworkState }
  | { type: 'shoot'; id: string; x: number; y: number; dirX: number; dirY: number }
  | { type: 'hit'; targetId: string; damage: number; from: string }
  | { type: 'die'; victimId: string; killerName: string }
  | { type: 'respawn'; id: string; x: number; y: number };

export interface RemotePlayerEntity extends NetworkState {
  id: string;
  hurtTimer: number;
  attackTimer: number;
}

export class MultiplayerNetwork {
  private peer: Peer | null = null;
  private hostConn: DataConnection | null = null; // Usado por clientes conectados ao host
  private connections: Map<string, DataConnection> = new Map(); // Usado pelo host: peerId -> DataConnection

  isHost = false;
  connected = false;
  gameStarted = false;
  roomCode = '';
  myId = '';
  myName = 'Jogador';
  mySkin = 'bot02';

  localState: NetworkState | null = null;
  remotePlayers: Map<string, RemotePlayerEntity> = new Map();
  lobbyPlayers: Map<string, LobbyPlayer> = new Map();

  onLobbyUpdate?: (players: LobbyPlayer[]) => void;
  onStartGame?: (mode?: string) => void;
  onGameInProgress?: (mode?: string) => void;
  onPlayerJoined?: (name: string) => void;
  onPlayerLeft?: (name: string) => void;
  onDisconnected?: () => void;
  onReceiveHit?: (damage: number, from: string) => void;
  onRemoteKill?: (killer: string, victim: string) => void;
  onRemoteShoot?: (x: number, y: number) => void;
  onRemoteRespawn?: (id: string, x: number, y: number) => void;

  get remotePlayerList(): RemotePlayerEntity[] {
    return Array.from(this.remotePlayers.values());
  }

  get lobbyList(): LobbyPlayer[] {
    return Array.from(this.lobbyPlayers.values());
  }

  getPlayerIndex(): number {
    const list = this.lobbyList;
    const idx = list.findIndex((p) => p.id === this.myId);
    return idx >= 0 ? idx : 0;
  }

  private broadcast(msg: NetMessage): void {
    for (const conn of this.connections.values()) {
      if (conn.open) {
        try {
          conn.send(msg);
        } catch {}
      }
    }
  }

  private broadcastExcept(excludeId: string, msg: NetMessage): void {
    for (const [id, conn] of this.connections.entries()) {
      if (id !== excludeId && conn.open) {
        try {
          conn.send(msg);
        } catch {}
      }
    }
  }

  createRoom(
    customCode: string,
    myName: string,
    mySkin: string,
    onReady: (fullCode: string) => void,
    onError: (err: string) => void,
  ): void {
    this.cleanup();
    this.isHost = true;
    this.myId = 'host';
    this.myName = myName;
    this.mySkin = mySkin;
    this.roomCode = customCode.toUpperCase();
    const peerId = `500ml-${this.roomCode}`;

    this.lobbyPlayers.set('host', {
      id: 'host',
      name: myName,
      skin: mySkin,
      isHost: true,
    });

    try {
      this.peer = new Peer(peerId, { debug: 1 });

      this.peer.on('open', (id) => {
        console.log('[P2P Host] Sala multi-player aberta com ID:', id);
        this.connected = true;
        onReady(this.roomCode);
        this.onLobbyUpdate?.(this.lobbyList);
      });

      this.peer.on('connection', (connection) => {
        console.log('[P2P Host] Novo jogador conectando:', connection.peer);
        this.setupHostConnection(connection);
      });

      this.peer.on('error', (err) => {
        console.error('[P2P Host Error]', err);
        onError(err.message || 'Erro ao criar sala P2P');
      });
    } catch (e: unknown) {
      onError((e as Error).message || 'Erro ao inicializar Peer');
    }
  }

  private setupHostConnection(conn: DataConnection): void {
    this.connections.set(conn.peer, conn);

    conn.on('open', () => {
      console.log('[P2P Host] Conexão aberta com jogador:', conn.peer);
      // Envia imediatamente a lista de jogadores da sala para o cliente recém-conectado
      conn.send({
        type: 'lobby_update',
        players: this.lobbyList,
        inProgress: this.gameStarted,
      });
      if (this.gameStarted) {
        conn.send({
          type: 'game_in_progress',
          mode: 'multiplayer',
        });
      }
    });

    conn.on('data', (data: unknown) => {
      const msg = data as NetMessage;
      if (!msg || !msg.type) return;

      if (msg.type === 'join') {
        const player: LobbyPlayer = {
          id: conn.peer,
          name: msg.player.name,
          skin: msg.player.skin,
          isHost: false,
        };
        this.lobbyPlayers.set(conn.peer, player);
        console.log(`[P2P Host] ${player.name} entrou na sala! Total: ${this.lobbyPlayers.size}`);

        // Notifica todos na sala com a lista atualizada
        this.broadcast({
          type: 'lobby_update',
          players: this.lobbyList,
          inProgress: this.gameStarted,
        });
        if (this.gameStarted) {
          conn.send({
            type: 'game_in_progress',
            mode: 'multiplayer',
          });
        }
        this.onLobbyUpdate?.(this.lobbyList);
        this.onPlayerJoined?.(player.name);
      } else if (msg.type === 'state') {
        const prev = this.remotePlayers.get(conn.peer);
        this.remotePlayers.set(conn.peer, {
          ...msg.payload,
          id: conn.peer,
          hurtTimer: prev ? prev.hurtTimer : 0,
          attackTimer: prev ? prev.attackTimer : 0,
        });

        // Repassa o estado para todos os outros clientes
        this.broadcastExcept(conn.peer, msg);
      } else if (msg.type === 'shoot') {
        const rp = this.remotePlayers.get(conn.peer);
        if (rp) rp.attackTimer = 0.25;
        this.onRemoteShoot?.(msg.x, msg.y);
        this.broadcastExcept(conn.peer, msg);
      } else if (msg.type === 'hit') {
        if (msg.targetId === 'host') {
          this.onReceiveHit?.(msg.damage, msg.from);
        } else {
          // Encaminha dano ao cliente destino
          const targetConn = this.connections.get(msg.targetId);
          if (targetConn && targetConn.open) {
            targetConn.send(msg);
          }
        }
      } else if (msg.type === 'die') {
        const rp = this.remotePlayers.get(msg.victimId);
        if (rp) {
          rp.state = 'dead';
          rp.health = 0;
        }
        const victimName = this.lobbyPlayers.get(msg.victimId)?.name || 'Jogador';
        this.onRemoteKill?.(msg.killerName, victimName);
        this.broadcastExcept(conn.peer, msg);
      } else if (msg.type === 'respawn') {
        const rp = this.remotePlayers.get(msg.id);
        if (rp) {
          rp.x = msg.x;
          rp.y = msg.y;
          rp.health = 100;
          rp.state = 'idle';
        }
        this.onRemoteRespawn?.(msg.id, msg.x, msg.y);
        this.broadcastExcept(conn.peer, msg);
      }
    });

    conn.on('close', () => {
      console.log('[P2P Host] Jogador saiu:', conn.peer);
      const leaver = this.lobbyPlayers.get(conn.peer);
      const leaverName = leaver?.name || 'Um jogador';
      this.connections.delete(conn.peer);
      this.lobbyPlayers.delete(conn.peer);
      this.remotePlayers.delete(conn.peer);

      this.broadcast({
        type: 'lobby_update',
        players: this.lobbyList,
      });
      this.onLobbyUpdate?.(this.lobbyList);
      this.onPlayerLeft?.(leaverName);
    });

    conn.on('error', (err) => {
      console.warn('[P2P Host Connection Error]', conn.peer, err);
    });
  }

  joinRoom(
    code: string,
    myName: string,
    mySkin: string,
    onConnected: () => void,
    onError: (err: string) => void,
  ): void {
    this.cleanup();
    this.isHost = false;
    this.myName = myName;
    this.mySkin = mySkin;
    this.roomCode = code.toUpperCase().trim();
    const targetPeerId = `500ml-${this.roomCode}`;

    try {
      this.peer = new Peer({ debug: 1 });

      this.peer.on('open', (myId) => {
        this.myId = myId;
        console.log('[P2P Client] Meu peer ID:', myId, 'conectando à sala:', targetPeerId);
        if (!this.peer) return;

        const connection = this.peer.connect(targetPeerId);
        this.hostConn = connection;
        this.setupClientConnection(connection, onConnected);
      });

      this.peer.on('error', (err) => {
        console.error('[P2P Client Error]', err);
        onError(err.message || 'Erro ao conectar à sala');
      });
    } catch (e: unknown) {
      onError((e as Error).message || 'Erro ao entrar na sala');
    }
  }

  private setupClientConnection(conn: DataConnection, onConnected: () => void): void {
    conn.on('open', () => {
      this.connected = true;
      console.log('[P2P Client] Conexão com Host aberta! Enviando dados de entrada...');

      conn.send({
        type: 'join',
        player: {
          id: this.myId,
          name: this.myName,
          skin: this.mySkin,
          isHost: false,
        },
      });

      onConnected();
    });

    conn.on('data', (data: unknown) => {
      const msg = data as NetMessage;
      if (!msg || !msg.type) return;

      if (msg.type === 'lobby_update') {
        this.lobbyPlayers.clear();
        for (const p of msg.players) {
          this.lobbyPlayers.set(p.id, p);
        }
        this.onLobbyUpdate?.(msg.players);
        if (msg.inProgress) {
          this.onGameInProgress?.('multiplayer');
        }
      } else if (msg.type === 'game_in_progress') {
        console.log('[P2P Client] Partida em andamento na sala!');
        this.onGameInProgress?.(msg.mode || 'multiplayer');
      } else if (msg.type === 'start_game') {
        console.log('[P2P Client] Host iniciou a partida!');
        this.onStartGame?.(msg.mode);
      } else if (msg.type === 'state') {
        if (msg.id === this.myId) return; // ignora eco do próprio estado
        const prev = this.remotePlayers.get(msg.id);
        this.remotePlayers.set(msg.id, {
          ...msg.payload,
          id: msg.id,
          hurtTimer: prev ? prev.hurtTimer : 0,
          attackTimer: prev ? prev.attackTimer : 0,
        });
      } else if (msg.type === 'shoot') {
        if (msg.id !== this.myId) {
          const rp = this.remotePlayers.get(msg.id);
          if (rp) rp.attackTimer = 0.25;
          this.onRemoteShoot?.(msg.x, msg.y);
        }
      } else if (msg.type === 'hit') {
        if (msg.targetId === this.myId) {
          this.onReceiveHit?.(msg.damage, msg.from);
        }
      } else if (msg.type === 'die') {
        const rp = this.remotePlayers.get(msg.victimId);
        if (rp) {
          rp.state = 'dead';
          rp.health = 0;
        }
        const victimName = this.lobbyPlayers.get(msg.victimId)?.name || 'Jogador';
        this.onRemoteKill?.(msg.killerName, victimName);
      } else if (msg.type === 'respawn') {
        if (msg.id !== this.myId) {
          const rp = this.remotePlayers.get(msg.id);
          if (rp) {
            rp.x = msg.x;
            rp.y = msg.y;
            rp.health = 100;
            rp.state = 'idle';
          }
          this.onRemoteRespawn?.(msg.id, msg.x, msg.y);
        }
      }
    });

    conn.on('close', () => {
      this.connected = false;
      this.remotePlayers.clear();
      this.lobbyPlayers.clear();
      console.log('[P2P Client] Conexão com a sala encerrada.');
      if (this.onDisconnected) this.onDisconnected();
    });

    conn.on('error', (err) => {
      console.error('[P2P Client DataConnection Error]', err);
    });
  }

  startGame(mode?: string): void {
    if (!this.isHost) return;
    this.gameStarted = true;
    this.broadcast({
      type: 'start_game',
      mode,
    });
  }

  sendState(state: NetworkState): void {
    this.localState = state;
    if (!this.connected) return;

    const msg: NetMessage = {
      type: 'state',
      id: this.myId,
      payload: state,
    };

    if (this.isHost) {
      this.broadcast(msg);
    } else if (this.hostConn && this.hostConn.open) {
      try {
        this.hostConn.send(msg);
      } catch {}
    }
  }

  sendShoot(x: number, y: number, dirX: number, dirY: number): void {
    if (!this.connected) return;
    const msg: NetMessage = {
      type: 'shoot',
      id: this.myId,
      x,
      y,
      dirX,
      dirY,
    };

    if (this.isHost) {
      this.broadcast(msg);
    } else if (this.hostConn && this.hostConn.open) {
      try {
        this.hostConn.send(msg);
      } catch {}
    }
  }

  sendHit(targetId: string, damage: number, from: string): void {
    if (!this.connected) return;
    const msg: NetMessage = {
      type: 'hit',
      targetId,
      damage,
      from,
    };

    if (this.isHost) {
      if (targetId === 'host') {
        this.onReceiveHit?.(damage, from);
      } else {
        const target = this.connections.get(targetId);
        if (target && target.open) target.send(msg);
      }
    } else if (this.hostConn && this.hostConn.open) {
      try {
        this.hostConn.send(msg);
      } catch {}
    }
  }

  sendDie(victimId: string, killerName: string): void {
    if (!this.connected) return;
    const msg: NetMessage = {
      type: 'die',
      victimId,
      killerName,
    };

    if (this.isHost) {
      this.broadcast(msg);
    } else if (this.hostConn && this.hostConn.open) {
      try {
        this.hostConn.send(msg);
      } catch {}
    }
  }

  sendRespawn(x: number, y: number): void {
    if (!this.connected) return;
    const msg: NetMessage = {
      type: 'respawn',
      id: this.myId,
      x,
      y,
    };

    if (this.isHost) {
      this.broadcast(msg);
    } else if (this.hostConn && this.hostConn.open) {
      try {
        this.hostConn.send(msg);
      } catch {}
    }
  }

  cleanup(): void {
    this.connected = false;
    this.gameStarted = false;
    this.remotePlayers.clear();
    this.lobbyPlayers.clear();
    this.localState = null;

    if (this.hostConn) {
      try {
        this.hostConn.close();
      } catch {}
      this.hostConn = null;
    }

    for (const conn of this.connections.values()) {
      try {
        conn.close();
      } catch {}
    }
    this.connections.clear();

    if (this.peer) {
      try {
        this.peer.destroy();
      } catch {}
      this.peer = null;
    }
  }
}
