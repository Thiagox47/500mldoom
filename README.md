# 500ML DOOM Prototype

Protótipo de jogo estilo retro FPS / Raycaster inspirado em clássicos como DOOM e Wolfenstein 3D, desenvolvido em TypeScript puro com Canvas API e Vite.

## 🕹️ Controles

- **W, A, S, D**: Movimentação (Frente, Esquerda, Trás, Direita)
- **Mouse**: Mirar / Rotacionar visão
- **Botão Esquerdo / Espaço**: Disparar arma
- **M**: Alternar minimapa
- **Clique inicial**: Bloquear cursor do mouse (Pointer Lock) e iniciar áudio

## 🛠️ Tecnologias

- **Vite**
- **TypeScript**
- **HTML5 Canvas 2D** (Renderizador Raycasting com projeção de paredes, chão/teto e sprites billboard)
- **Web Audio API** (Efeitos sonoros procedurais)

## 🚀 Como Executar

1. Clone o repositório:
   ```bash
   git clone https://github.com/Thiagox47/500mldoom.git
   cd 500mldoom
   ```

2. Instale as dependências:
   ```bash
   npm install
   ```

3. Inicie o servidor de desenvolvimento:
   ```bash
   npm run dev
   ```

4. Para gerar o build de produção:
   ```bash
   npm run build
   ```
