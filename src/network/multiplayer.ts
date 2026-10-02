import { Peer, type DataConnection } from 'peerjs';

export interface NetworkState {
  x: number;
  y: number;
  angle: number;
  health: number;
  skin: string;
  name: string;
  state: 'idle' | 'walk' | 'attack' | 'hurt' | 'dead';
  frags: number;
}

export type NetMessage =
  | { type: 'handshake'; payload: NetworkState }
  | { type: 'state'; payload: NetworkState }
  | { type: 'shoot'; x: number; y: number; dirX: number; dirY: number }
  | { type: 'hit'; damage: number; from: string }
  | { type: 'die'; killerName: string }
  | { type: 'respawn'; x: number; y: number };

export class MultiplayerNetwork {
  private peer: Peer | null = null;
  private conn: DataConnection | null = null;

  isHost = false;
  connected = false;
  roomCode = '';

  localState: NetworkState | null = null;
  remotePlayer: (NetworkState & { hurtTimer: number; attackTimer: number }) | null = null;

  onConnected?: (remoteName: string) => void;
  onDisconnected?: () => void;
  onReceiveHit?: (damage: number, from: string) => void;
  onRemoteKill?: (killer: string, victim: string) => void;
  onRemoteShoot?: (x: number, y: number) => void;
  onRemoteRespawn?: (x: number, y: number) => void;

  createRoom(customCode: string, onReady: (fullCode: string) => void, onError: (err: string) => void): void {
    this.cleanup();
    this.isHost = true;
    this.roomCode = customCode.toUpperCase();
    const peerId = `500ml-${this.roomCode}`;

    try {
      this.peer = new Peer(peerId, { debug: 1 });

      this.peer.on('open', (id) => {
        console.log('[P2P Host] Sala registrada com ID:', id);
        onReady(this.roomCode);
      });

      this.peer.on('connection', (connection) => {
        console.log('[P2P Host] Jogador conectou via DataConnection!');
        this.conn = connection;
        this.setupConnection();
      });

      this.peer.on('error', (err) => {
        console.error('[P2P Host Error]', err);
        onError(err.message || 'Erro ao criar sala P2P');
      });
    } catch (e: unknown) {
      onError((e as Error).message || 'Erro ao inicializar Peer');
    }
  }

  joinRoom(code: string, onConnected: () => void, onError: (err: string) => void): void {
    this.cleanup();
    this.isHost = false;
    this.roomCode = code.toUpperCase().trim();
    const targetPeerId = `500ml-${this.roomCode}`;

    try {
      this.peer = new Peer({ debug: 1 });

      this.peer.on('open', (myId) => {
        console.log('[P2P Client] Meu peer ID:', myId, 'conectando a:', targetPeerId);
        if (!this.peer) return;

        const connection = this.peer.connect(targetPeerId);
        this.conn = connection;
        this.setupConnection();
        
        connection.on('open', () => {
          onConnected();
        });
      });

      this.peer.on('error', (err) => {
        console.error('[P2P Client Error]', err);
        onError(err.message || 'Erro ao conectar à sala');
      });
    } catch (e: unknown) {
      onError((e as Error).message || 'Erro ao entrar na sala');
    }
  }

  private setupConnection(): void {
    if (!this.conn) return;

    this.conn.on('open', () => {
      this.connected = true;
      console.log('[P2P] Conexão aberta! Enviando handshake inicial...');
      
      // Envia imediatamente o estado local se disponível
      if (this.localState) {
        this.conn?.send({ type: 'handshake', payload: this.localState });
      }

      if (this.onConnected) {
        this.onConnected(this.remotePlayer?.name || 'Amigo');
      }
    });

    this.conn.on('data', (data: unknown) => {
      const msg = data as NetMessage;
      if (!msg || !msg.type) return;

      if (msg.type === 'handshake' || msg.type === 'state') {
        const prev = this.remotePlayer;
        this.remotePlayer = {
          ...msg.payload,
          hurtTimer: prev ? prev.hurtTimer : 0,
          attackTimer: prev ? prev.attackTimer : 0,
        };

        // Se foi handshake recebido e ainda nao respondemos com nosso estado, envia de volta
        if (msg.type === 'handshake' && this.localState) {
          this.conn?.send({ type: 'state', payload: this.localState });
        }
      } else if (msg.type === 'shoot') {
        if (this.remotePlayer) this.remotePlayer.attackTimer = 0.25;
        if (this.onRemoteShoot) this.onRemoteShoot(msg.x, msg.y);
      } else if (msg.type === 'hit') {
        if (this.onReceiveHit) this.onReceiveHit(msg.damage, msg.from);
      } else if (msg.type === 'die') {
        if (this.remotePlayer) {
          this.remotePlayer.state = 'dead';
          this.remotePlayer.health = 0;
        }
        if (this.onRemoteKill) this.onRemoteKill(msg.killerName, this.remotePlayer?.name || 'Amigo');
      } else if (msg.type === 'respawn') {
        if (this.remotePlayer) {
          this.remotePlayer.x = msg.x;
          this.remotePlayer.y = msg.y;
          this.remotePlayer.health = 100;
          this.remotePlayer.state = 'idle';
        }
        if (this.onRemoteRespawn) this.onRemoteRespawn(msg.x, msg.y);
      }
    });

    this.conn.on('close', () => {
      this.connected = false;
      this.remotePlayer = null;
      console.log('[P2P] Conexão remota encerrada.');
      if (this.onDisconnected) this.onDisconnected();
    });

    this.conn.on('error', (err) => {
      console.error('[P2P DataConnection Error]', err);
    });
  }

  sendState(state: NetworkState): void {
    this.localState = state;
    if (!this.conn || !this.connected) return;
    try {
      this.conn.send({ type: 'state', payload: state });
    } catch (e) {
      console.warn('[P2P] Erro ao enviar estado:', e);
    }
  }

  sendShoot(x: number, y: number, dirX: number, dirY: number): void {
    if (!this.conn || !this.connected) return;
    try {
      this.conn.send({ type: 'shoot', x, y, dirX, dirY });
    } catch {}
  }

  sendHit(damage: number, from: string): void {
    if (!this.conn || !this.connected) return;
    try {
      this.conn.send({ type: 'hit', damage, from });
    } catch {}
  }

  sendDie(killerName: string): void {
    if (!this.conn || !this.connected) return;
    try {
      this.conn.send({ type: 'die', killerName });
    } catch {}
  }

  sendRespawn(x: number, y: number): void {
    if (!this.conn || !this.connected) return;
    try {
      this.conn.send({ type: 'respawn', x, y });
    } catch {}
  }

  cleanup(): void {
    this.connected = false;
    this.remotePlayer = null;
    this.localState = null;
    if (this.conn) {
      try { this.conn.close(); } catch {}
      this.conn = null;
    }
    if (this.peer) {
      try { this.peer.destroy(); } catch {}
      this.peer = null;
    }
  }
}
