export class Input {
  firing = false;
  private keys = new Set<string>();
  private mouseDX = 0;
  private minimapToggle = false;

  constructor(private canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
      if (e.code === 'KeyM' && !e.repeat) this.minimapToggle = true;
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.firing = false;
      this.unlock();
    });
    document.addEventListener('mousemove', (e) => {
      if (this.locked) this.mouseDX += e.movementX;
    });
    document.addEventListener('mousedown', (e) => {
      if (this.locked && e.button === 0) this.firing = true;
    });
    document.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.firing = false;
    });
  }

  get locked(): boolean {
    return document.pointerLockElement === this.canvas;
  }

  unlock(): void {
    if (document.pointerLockElement) {
      try {
        document.exitPointerLock();
      } catch {}
    }
  }

  down(code: string): boolean {
    return this.keys.has(code);
  }

  consumeMouseDX(): number {
    const d = this.mouseDX;
    this.mouseDX = 0;
    return d;
  }

  consumeMinimapToggle(): boolean {
    const t = this.minimapToggle;
    this.minimapToggle = false;
    return t;
  }
}
