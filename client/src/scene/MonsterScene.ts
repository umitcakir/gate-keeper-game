// The stage: Istanbul night skyline, castle wall with the prize gate, torches, and Gulyabani in front.
// The DOM panel covers the right side of the screen, so everything important lives in the left SCENE_FRACTION.
import Phaser from 'phaser';
import type { Mood } from '../api.ts';

export const SCENE_FRACTION = 0.58;
const MOODS: Mood[] = ['angry', 'annoyed', 'neutral', 'amused', 'impressed'];

// Native sizes of the generated SVGs (2x their viewBox).
const GATE = { w: 1040, h: 1200, openingX: 140, openingY: 140, openingW: 760, torchX: [190, 850], torchY: 170 };
const MONSTER = { w: 720, h: 840, eyes: [[270, 344], [450, 344]] as const, glassTop: [654, 432] as const };
const FONT = 'Fredoka, system-ui, sans-serif';

const lerpColor = (a: number, b: number, t: number) => {
  const ca = Phaser.Display.Color.IntegerToColor(a);
  const cb = Phaser.Display.Color.IntegerToColor(b);
  const c = Phaser.Display.Color.Interpolate.ColorWithColor(ca, cb, 100, Math.round(Phaser.Math.Clamp(t, 0, 1) * 100));
  return Phaser.Display.Color.GetColor(c.r, c.g, c.b);
};

export function trustColor(trust: number): number {
  return trust < 50 ? lerpColor(0xff4a4a, 0xffd84a, trust / 50) : lerpColor(0xffd84a, 0x5cff8a, (trust - 50) / 50);
}

interface Cloud { img: Phaser.GameObjects.Image; speed: number; ry: number }

export class MonsterScene extends Phaser.Scene {
  // backdrop
  private sky!: Phaser.GameObjects.Graphics;
  private city!: Phaser.GameObjects.Graphics;
  private wall!: Phaser.GameObjects.Graphics;
  private floor!: Phaser.GameObjects.Graphics;
  private moonGlow!: Phaser.GameObjects.Image;
  private stars: Phaser.GameObjects.Arc[] = [];
  private clouds: Cloud[] = [];
  private fog: Phaser.GameObjects.Image[] = [];
  // gate
  private vault!: Phaser.GameObjects.Rectangle;
  private rays!: Phaser.GameObjects.Image;
  private glow!: Phaser.GameObjects.Image;
  private gift!: Phaser.GameObjects.Image;
  private gate!: Phaser.GameObjects.Image;
  private doorL!: Phaser.GameObjects.Image;
  private doorR!: Phaser.GameObjects.Image;
  private seam!: Phaser.GameObjects.Image;
  private lamp!: Phaser.GameObjects.Arc;
  private lampGlow!: Phaser.GameObjects.Image;
  private pool!: Phaser.GameObjects.Image;
  private sconces!: Phaser.GameObjects.Graphics;
  private torchGlows: Phaser.GameObjects.Image[] = [];
  private flames: Phaser.GameObjects.Particles.ParticleEmitter[] = [];
  // monster
  private shadow!: Phaser.GameObjects.Ellipse;
  private monster!: Phaser.GameObjects.Image;
  private lids!: Phaser.GameObjects.Graphics;
  private steam!: Phaser.GameObjects.Particles.ParticleEmitter;
  private bubble!: Phaser.GameObjects.Container;
  // effects
  private confetti!: Phaser.GameObjects.Particles.ParticleEmitter;
  private confettiZone = new Phaser.Geom.Rectangle(0, -20, 100, 1);
  private sparkles!: Phaser.GameObjects.Particles.ParticleEmitter;
  private fireflies!: Phaser.GameObjects.Particles.ParticleEmitter;
  private fireflyZone = new Phaser.Geom.Rectangle(0, 0, 100, 100);

  // Layout results (recomputed on resize).
  private L = { w: 0, h: 0, floorY: 0, gateScale: 1, monsterScale: 1, monsterX: 0, monsterAsideX: 0, gateX: 0, gateTop: 0 };
  // Animated values applied every frame on top of the layout.
  private fx = { squash: 0, hopY: 0, aside: 0, doors: 0, seam: 0 };
  private mood: Mood = 'neutral';
  private blinking = false;
  private gateOpen = false;
  private attractTimer?: Phaser.Time.TimerEvent;
  // Asleep = the LLM is unreachable. `sleepAmt` eases toward 0/1 so breathing and sway blend in and out.
  private asleep = false;
  private sleepAmt = 0;
  private snoreTimer?: Phaser.Time.TimerEvent;

  constructor() {
    super('monster');
  }

  preload() {
    for (const m of MOODS) this.load.svg(`monster_${m}`, `/assets/art/monster_${m}.svg`);
    this.load.svg('gate', '/assets/art/gate.svg');
    this.load.svg('door_left', '/assets/art/door_left.svg');
    this.load.svg('door_right', '/assets/art/door_right.svg');
    this.load.svg('gift', '/assets/art/gift.svg');
  }

  create() {
    this.makeTextures();

    // Backdrop
    this.sky = this.add.graphics().setDepth(0);
    for (let i = 0; i < 90; i++) {
      const s = this.add.circle(0, 0, Phaser.Math.FloatBetween(0.7, 2.1), 0xffffff, Phaser.Math.FloatBetween(0.3, 0.9)).setDepth(0.1);
      s.setData('rx', Math.random()).setData('ry', Math.random() ** 1.4 * 0.5);
      this.tweens.add({ targets: s, alpha: 0.1, duration: Phaser.Math.Between(900, 2600), yoyo: true, repeat: -1, delay: Phaser.Math.Between(0, 2000) });
      this.stars.push(s);
    }
    this.moonGlow = this.add.image(0, 0, 'glow').setDepth(0.15).setTint(0xfff1c2).setAlpha(0.35).setBlendMode(Phaser.BlendModes.ADD);
    for (let i = 0; i < 5; i++) {
      const img = this.add.image(0, 0, 'cloud').setDepth(0.2).setTint(0xb9a6ff).setAlpha(Phaser.Math.FloatBetween(0.06, 0.14));
      img.x = Math.random() * this.scale.width;
      this.clouds.push({ img, speed: Phaser.Math.FloatBetween(4, 12), ry: Phaser.Math.FloatBetween(0.06, 0.32) });
    }
    this.city = this.add.graphics().setDepth(0.3);
    this.wall = this.add.graphics().setDepth(0.5);
    this.floor = this.add.graphics().setDepth(0.6);

    // Gate
    this.vault = this.add.rectangle(0, 0, 10, 10, 0x0b0716).setOrigin(0, 0).setDepth(1);
    this.rays = this.add.image(0, 0, 'rays').setDepth(1.5).setTint(0xffd84a).setAlpha(0).setBlendMode(Phaser.BlendModes.ADD);
    this.glow = this.add.image(0, 0, 'glow').setDepth(2).setTint(0xffe9a0).setAlpha(0).setBlendMode(Phaser.BlendModes.ADD);
    this.gift = this.add.image(0, 0, 'gift').setOrigin(0.5, 1).setDepth(3);
    this.doorL = this.add.image(0, 0, 'door_left').setOrigin(0, 0).setDepth(4);
    this.doorR = this.add.image(0, 0, 'door_right').setOrigin(1, 0).setDepth(4);
    this.seam = this.add.image(0, 0, 'glow').setDepth(4.5).setTint(0xffd27a).setAlpha(0).setBlendMode(Phaser.BlendModes.ADD);
    this.gate = this.add.image(0, 0, 'gate').setOrigin(0.5, 1).setDepth(5);
    this.sconces = this.add.graphics().setDepth(5.1);
    for (let i = 0; i < 2; i++) {
      const g = this.add.image(0, 0, 'glow').setDepth(5.2).setTint(0xff9a3c).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.5);
      this.tweens.add({ targets: g, alpha: 0.32, duration: 110, yoyo: true, repeat: -1, repeatDelay: Phaser.Math.Between(40, 220) });
      this.torchGlows.push(g);
      this.flames.push(
        this.add.particles(0, 0, 'spark', {
          speedY: { min: -110, max: -50 },
          speedX: { min: -14, max: 14 },
          scale: { start: 1.6, end: 0 },
          alpha: { start: 0.95, end: 0 },
          tint: [0xfff1a8, 0xffb43c, 0xff6a1f],
          lifespan: { min: 380, max: 720 },
          frequency: 28,
          blendMode: Phaser.BlendModes.ADD,
        }).setDepth(5.3),
      );
    }
    this.lampGlow = this.add.image(0, 0, 'glow').setDepth(6).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.6);
    this.lamp = this.add.circle(0, 0, 10, 0xff4a4a).setDepth(6).setStrokeStyle(4, 0x2a2a35);
    this.pool = this.add.image(0, 0, 'glow').setDepth(6.5).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.28);
    for (let i = 0; i < 3; i++) {
      const f = this.add.image(0, 0, 'glow').setDepth(6.6).setTint(0xc9b8ff).setAlpha(0.07);
      this.tweens.add({ targets: f, alpha: 0.12, duration: Phaser.Math.Between(3000, 5000), yoyo: true, repeat: -1 });
      this.fog.push(f);
    }

    // Monster
    this.shadow = this.add.ellipse(0, 0, 10, 10, 0x000000, 0.38).setDepth(7);
    this.monster = this.add.image(0, 0, 'monster_neutral').setOrigin(0.5, 1).setDepth(8);
    this.lids = this.add.graphics().setDepth(8.1);
    this.steam = this.add.particles(0, 0, 'spark', {
      speedY: { min: -40, max: -22 },
      speedX: { min: -6, max: 6 },
      scale: { start: 0.6, end: 1.8 },
      alpha: { start: 0.22, end: 0 },
      lifespan: 1600,
      frequency: 260,
    }).setDepth(8.2);
    this.bubble = this.makeBubble().setDepth(10).setVisible(false);
    this.time.addEvent({ delay: 3400, loop: true, callback: () => this.blink() });

    // Effects
    this.fireflies = this.add.particles(0, 0, 'spark', {
      emitZone: { type: 'random', source: this.fireflyZone } as Phaser.Types.GameObjects.Particles.EmitZoneData,
      speed: { min: 6, max: 22 },
      scale: { min: 0.25, max: 0.5 },
      // Fade in and out over the particle's life.
      alpha: { onEmit: () => 0, onUpdate: (_p: unknown, _k: string, t: number) => Math.sin(t * Math.PI) * 0.85 },
      tint: [0xfff27a, 0xd4ff7a],
      lifespan: { min: 3500, max: 6500 },
      frequency: 450,
      blendMode: Phaser.BlendModes.ADD,
    }).setDepth(9.5);
    this.confetti = this.add.particles(0, 0, 'confetti', {
      emitZone: { type: 'random', source: this.confettiZone } as Phaser.Types.GameObjects.Particles.EmitZoneData,
      speedY: { min: 120, max: 320 },
      speedX: { min: -80, max: 80 },
      rotate: { start: 0, end: 720 },
      gravityY: 220,
      lifespan: 4200,
      tint: [0xff5e7e, 0xffd84a, 0x5cff8a, 0x5ab4ff, 0xc77dff],
      scale: { min: 0.8, max: 1.4 },
      emitting: false,
    }).setDepth(9);
    this.sparkles = this.add.particles(0, 0, 'spark', {
      speed: { min: 120, max: 320 },
      lifespan: 700,
      scale: { start: 1, end: 0 },
      tint: [0xffd84a, 0xffffff],
      blendMode: Phaser.BlendModes.ADD,
      emitting: false,
    }).setDepth(9);

    this.layout();
    this.scale.on('resize', () => this.layout());
    this.setTrust(0);
  }

  private makeTextures() {
    const canvasTex = (key: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void) => {
      const tex = this.textures.createCanvas(key, w, h)!;
      draw(tex.getContext());
      tex.refresh();
    };
    canvasTex('glow', 256, 256, (ctx) => {
      const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.35, 'rgba(255,255,255,0.45)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 256, 256);
    });
    canvasTex('rays', 512, 512, (ctx) => {
      const g = ctx.createRadialGradient(256, 256, 20, 256, 256, 256);
      g.addColorStop(0, 'rgba(255,255,255,0.9)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(256, 256);
        ctx.arc(256, 256, 256, a, a + Math.PI / 22);
        ctx.closePath();
        ctx.fill();
      }
    });
    canvasTex('cloud', 360, 140, (ctx) => {
      ctx.fillStyle = '#fff';
      for (const [x, y, r] of [[80, 90, 44], [140, 70, 58], [210, 78, 52], [270, 92, 40], [180, 100, 46]] as const) {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    });
    const gfx = this.make.graphics({}, false);
    gfx.fillStyle(0xffffff).fillRect(0, 0, 12, 7);
    gfx.generateTexture('confetti', 12, 7);
    gfx.clear().fillStyle(0xffffff).fillCircle(6, 6, 6);
    gfx.generateTexture('spark', 12, 12);
    gfx.destroy();
  }

  private makeBubble() {
    const box = this.add.graphics();
    box.fillStyle(0xffffff, 0.95).fillRoundedRect(-60, -34, 120, 68, 30);
    // Trail of little circles leading down to the monster's head.
    box.fillCircle(8, 50, 12).fillCircle(16, 74, 8).fillCircle(22, 93, 5);
    const dots = [-28, 0, 28].map((x, i) => {
      const d = this.add.circle(x, 0, 9, 0x2f5a47);
      this.tweens.add({ targets: d, y: -10, duration: 320, yoyo: true, repeat: -1, delay: i * 140, ease: 'Sine.easeInOut' });
      return d;
    });
    return this.add.container(0, 0, [box, ...dots]);
  }

  // ---- layout ----------------------------------------------------------------------

  private layout() {
    const W = this.scale.width;
    const w = W * SCENE_FRACTION;
    const h = this.scale.height;
    const floorY = h * 0.86;
    const gs = (h * 0.62) / GATE.h;
    const gateX = w * 0.38;
    const gateTop = floorY - GATE.h * gs;
    this.L = { w, h, floorY, gateScale: gs, monsterScale: (h * 0.5) / MONSTER.h, monsterX: w * 0.74, monsterAsideX: w * 0.86, gateX, gateTop };

    // Sky
    this.sky.clear();
    this.sky.fillGradientStyle(0x0d0826, 0x0d0826, 0x3d2b63, 0x3d2b63, 1).fillRect(0, 0, W, floorY * 0.7);
    // City glow near the horizon makes the skyline silhouettes readable.
    this.sky.fillGradientStyle(0x3d2b63, 0x3d2b63, 0x7a4a86, 0x7a4a86, 1).fillRect(0, floorY * 0.7, W, floorY * 0.3);
    const moonX = w * 0.1;
    const moonY = h * 0.15;
    const moonR = h * 0.055;
    this.sky.fillStyle(0xffefb8).fillCircle(moonX, moonY, moonR);
    this.sky.fillStyle(0xe8d9a8, 0.55).fillCircle(moonX - moonR * 0.3, moonY - moonR * 0.2, moonR * 0.22)
      .fillCircle(moonX + moonR * 0.35, moonY + moonR * 0.3, moonR * 0.15).fillCircle(moonX + moonR * 0.1, moonY - moonR * 0.45, moonR * 0.1);
    this.moonGlow.setPosition(moonX, moonY).setScale((moonR * 9) / 256).setAlpha(0.5);
    for (const s of this.stars) s.setPosition(s.getData('rx') * W, s.getData('ry') * floorY);
    for (const c of this.clouds) c.img.setY(c.ry * h).setScale(h / 900);

    // Istanbul skyline behind the wall: far layer, then near layer.
    const wallTop = floorY - h * 0.15;
    this.city.clear();
    this.drawSkyline(wallTop + h * 0.02, W, h * 0.0015, 0x2b1d4f, 'far', false, w * 0.62);
    this.drawSkyline(wallTop + h * 0.03, W, h * 0.0017, 0x140d2a, 'near', true, w * 0.015);

    // Castle wall
    this.wall.clear();
    this.wall.fillStyle(0x433d5c).fillRect(0, wallTop, W, floorY - wallTop);
    const merlonW = h * 0.045;
    for (let x = 0; x < W; x += merlonW * 2) this.wall.fillRect(x, wallTop - merlonW * 0.7, merlonW, merlonW * 0.7);
    this.wall.lineStyle(Math.max(2, h * 0.003), 0x2f2a44, 1);
    const rowH = (floorY - wallTop) / 4;
    for (let r = 0; r < 4; r++) {
      const y = wallTop + r * rowH;
      this.wall.lineBetween(0, y, W, y);
      for (let x = (r % 2) * merlonW; x < W; x += merlonW * 2) this.wall.lineBetween(x, y, x, y + rowH);
    }
    this.wall.fillStyle(0x000000, 0.25).fillRect(0, floorY - rowH * 0.6, W, rowH * 0.6);

    // Cobblestone floor with perspective
    this.floor.clear();
    this.floor.fillStyle(0x1f1830).fillRect(0, floorY, W, h - floorY);
    const rnd = new Phaser.Math.RandomDataGenerator(['cobbles']);
    const rows = 7;
    for (let r = 0; r < rows; r++) {
      const y0 = floorY + (h - floorY) * (r / rows) ** 1.5;
      const y1 = floorY + (h - floorY) * ((r + 1) / rows) ** 1.5;
      const sh = y1 - y0;
      const sw = sh * 2.6;
      for (let x = -((r % 2) * sw) / 2; x < W; x += sw) {
        this.floor.fillStyle(rnd.pick([0x2c2342, 0x30263f, 0x282039, 0x342a48]));
        this.floor.fillRoundedRect(x + 2, y0 + 1.5, sw - 4, sh - 3, Math.min(10, sh / 3));
      }
    }
    this.floor.fillGradientStyle(0x0d0826, 0x0d0826, 0x0d0826, 0x0d0826, 0.55, 0.55, 0, 0).fillRect(0, floorY, W, (h - floorY) * 0.4);

    // Gate pieces
    const gateLeft = gateX - (GATE.w * gs) / 2;
    const openingH = (GATE.h - GATE.openingY) * gs;
    this.gate.setPosition(gateX, floorY).setScale(gs);
    this.vault.setPosition(gateLeft + GATE.openingX * gs, gateTop + GATE.openingY * gs).setSize(GATE.openingW * gs, openingH);
    this.glow.setPosition(gateX, floorY - GATE.h * gs * 0.35).setScale((GATE.openingW * gs * 1.6) / 256);
    this.rays.setPosition(gateX, floorY - GATE.h * gs * 0.3).setScale((GATE.openingW * gs * 1.4) / 512);
    this.gift.setPosition(gateX, floorY - 6 * gs).setScale(gs * 1.1);
    this.doorL.setPosition(gateLeft + GATE.openingX * gs, gateTop + GATE.openingY * gs);
    this.doorR.setPosition(gateLeft + (GATE.openingX + GATE.openingW) * gs, gateTop + GATE.openingY * gs);
    this.seam.setPosition(gateX, gateTop + GATE.openingY * gs + openingH * 0.55).setDisplaySize(26 * gs * 4, openingH * 1.1);
    this.lamp.setPosition(gateX, gateTop - h * 0.045).setRadius(h * 0.022);
    this.lampGlow.setPosition(gateX, gateTop - h * 0.045).setScale((h * 0.18) / 256);
    this.pool.setPosition(gateX, floorY + h * 0.02).setDisplaySize(GATE.w * gs * 1.8, h * 0.12);
    this.fog.forEach((f, i) => f.setPosition(w * (0.15 + i * 0.4), floorY + h * 0.01).setDisplaySize(w * 0.9, h * 0.12));

    // Torches mounted on the stone arch, just above the door on either side of the keystone.
    this.sconces.clear();
    const torchY = gateTop + GATE.torchY * gs;
    [gateLeft + GATE.torchX[0] * gs, gateLeft + GATE.torchX[1] * gs].forEach((tx, i) => {
      const k = h / 1080;
      this.sconces.fillStyle(0x2a2a35).fillRect(tx - 5 * k, torchY, 10 * k, 34 * k);
      this.sconces.fillStyle(0x5b3a1f).fillTriangle(tx - 16 * k, torchY - 6 * k, tx + 16 * k, torchY - 6 * k, tx, torchY + 14 * k);
      this.sconces.fillStyle(0x3a3a44).fillRect(tx - 18 * k, torchY - 10 * k, 36 * k, 6 * k);
      this.flames[i]!.setPosition(tx, torchY - 12 * k).setScale(k);
      this.torchGlows[i]!.setPosition(tx, torchY - 20 * k).setScale((h * 0.3) / 256);
    });

    this.shadow.setSize(h * 0.3, h * 0.035);
    this.confettiZone.setTo(0, -20, w, 1);
    this.fireflyZone.setTo(0, h * 0.2, w, h * 0.72);
  }

  /** Procedural silhouettes: houses, mosques with domes and minarets, and one Galata Tower. */
  private drawSkyline(baseY: number, width: number, s: number, color: number, seed: string, windows: boolean, towerX: number) {
    const g = this.city;
    const rnd = new Phaser.Math.RandomDataGenerator([seed]);
    g.fillStyle(color);
    const dome = (cx: number, cy: number, r: number) => {
      g.beginPath();
      g.arc(cx, cy, r, Math.PI, Math.PI * 2);
      g.closePath();
      g.fillPath();
    };
    const minaret = (x: number, height: number) => {
      const mw = 9 * s;
      g.fillRect(x - mw / 2, baseY - height, mw, height);
      g.fillRect(x - mw, baseY - height * 0.72, mw * 2, 4 * s);
      g.fillTriangle(x - mw / 2 - 1, baseY - height, x + mw / 2 + 1, baseY - height, x, baseY - height - 34 * s);
    };
    const lit: [number, number][] = [];
    let x = -20 * s;
    let towerPlaced = false;
    while (x < width) {
      const kind = rnd.frac();
      if (!towerPlaced && x >= towerX) {
        // Galata Tower
        const tw = 46 * s;
        const th = 150 * s;
        g.fillRect(x, baseY - th, tw, th);
        g.fillRect(x - 5 * s, baseY - th, tw + 10 * s, 8 * s);
        g.fillTriangle(x - 6 * s, baseY - th, x + tw + 6 * s, baseY - th, x + tw / 2, baseY - th - 62 * s);
        lit.push([x + tw * 0.3, baseY - th * 0.8], [x + tw * 0.6, baseY - th * 0.8]);
        x += tw + 24 * s;
        towerPlaced = true;
      } else if (kind < 0.28) {
        // Mosque
        const mw = rnd.between(130, 190) * s;
        const bh = rnd.between(34, 50) * s;
        g.fillRect(x, baseY - bh, mw, bh);
        dome(x + mw / 2, baseY - bh, mw * 0.3);
        dome(x + mw * 0.18, baseY - bh, mw * 0.13);
        dome(x + mw * 0.82, baseY - bh, mw * 0.13);
        g.fillRect(x + mw / 2 - 2 * s, baseY - bh - mw * 0.3 - 16 * s, 4 * s, 16 * s);
        minaret(x - 10 * s, rnd.between(130, 175) * s);
        minaret(x + mw + 10 * s, rnd.between(130, 175) * s);
        x += mw + 34 * s;
      } else {
        // Houses
        const hw = rnd.between(28, 64) * s;
        const hh = rnd.between(30, 86) * s;
        g.fillRect(x, baseY - hh, hw, hh);
        if (rnd.frac() < 0.5) g.fillTriangle(x - 3 * s, baseY - hh, x + hw + 3 * s, baseY - hh, x + hw / 2, baseY - hh - 18 * s);
        if (windows) for (let i = 0; i < 2; i++) if (rnd.frac() < 0.45) lit.push([x + rnd.between(6, Math.max(7, hw - 12)) , baseY - rnd.between(12, Math.max(13, hh - 10))]);
        x += hw + rnd.between(0, 10) * s;
      }
    }
    g.fillStyle(0xffc85a, 0.85);
    for (const [lx, ly] of lit) g.fillRect(lx, ly, 6 * s, 8 * s);
    g.fillStyle(color);
  }

  // ---- per-frame -------------------------------------------------------------------

  update(time: number, delta: number) {
    const { floorY, h, w } = this.L;
    // Steps aside (and a little back) when the gate opens.
    const s = this.L.monsterScale * (1 - 0.15 * this.fx.aside);
    this.sleepAmt += ((this.asleep ? 1 : 0) - this.sleepAmt) * Math.min(1, delta / 500);
    const z = this.sleepAmt;
    // Asleep: slower, deeper breaths and a slow dozing sway.
    const breath = Phaser.Math.Linear(Math.sin(time / 650), Math.sin(time / 1150) * 1.8, z);
    const x = Phaser.Math.Linear(this.L.monsterX, this.L.monsterAsideX, this.fx.aside);
    const sx = s * (1 - 0.008 * breath + this.fx.squash * 0.06);
    const sy = s * (1 + 0.018 * breath - this.fx.squash * 0.08);
    const y = floorY + h * 0.02 - this.fx.hopY;
    this.monster.setPosition(x, y).setScale(sx, sy).setRotation(z * 0.03 * Math.sin(time / 2300));
    this.shadow.setPosition(x, floorY + h * 0.015).setScale(1 - this.fx.hopY / (h * 0.4));
    // Above the head, between the horns, so the trail points down at him.
    this.bubble.setPosition(x - this.monster.displayWidth * 0.06, y - this.monster.displayHeight * 1.06).setScale(h / 1080);

    // Texture point -> screen point for this frame.
    const pt = (tx: number, ty: number) => [x + (tx - MONSTER.w / 2) * sx, y + (ty - MONSTER.h) * sy] as const;
    const [gx, gy] = pt(...MONSTER.glassTop);
    this.steam.setPosition(gx, gy).setScale(s / 0.64);

    this.lids.clear();
    if (this.asleep || (this.blinking && this.mood !== 'amused')) {
      const r = this.mood === 'impressed' ? 82 : 72;
      for (const [ex, ey] of MONSTER.eyes) {
        const [cx, cy] = pt(ex, ey);
        this.lids.fillStyle(0x5c9a7a).fillEllipse(cx, cy, r * 2 * sx, r * 2 * sy);
        this.lids.lineStyle(Math.max(3, 10 * sx), 0x1b2f27).beginPath();
        this.lids.arc(cx, cy + r * 0.05 * sy, r * 0.8 * sx, Math.PI * 0.15, Math.PI * 0.85);
        this.lids.strokePath();
      }
    }

    const gs = this.L.gateScale;
    const open = this.fx.doors;
    this.doorL.setScale(gs * (1 - 0.88 * open), gs).setTint(lerpColor(0xffffff, 0x555555, open));
    this.doorR.setScale(gs * (1 - 0.88 * open), gs).setTint(lerpColor(0xffffff, 0x555555, open));
    this.seam.setAlpha(this.fx.seam * (1 - open) * (0.85 + 0.15 * Math.sin(time / 180)));
    if (this.rays.alpha > 0) this.rays.rotation += delta * 0.0003;

    for (const c of this.clouds) {
      c.img.x += (c.speed * delta) / 1000;
      if (c.img.x - c.img.displayWidth / 2 > this.scale.width) c.img.x = -c.img.displayWidth / 2;
    }
    this.fog.forEach((f, i) => (f.x = w * (0.15 + i * 0.4) + Math.sin(time / 4000 + i * 2) * w * 0.05));
  }

  private blink() {
    if (this.blinking || Math.random() < 0.25) return;
    this.blinking = true;
    this.time.delayedCall(130, () => {
      this.blinking = false;
      // Sometimes a double blink.
      if (Math.random() < 0.25) this.time.delayedCall(140, () => {
        this.blinking = true;
        this.time.delayedCall(120, () => (this.blinking = false));
      });
    });
  }

  // ---- API used by the screens ------------------------------------------------------

  setMood(mood: Mood) {
    this.mood = mood;
    this.monster.setTexture(`monster_${mood}`);
    this.tweens.killTweensOf(this.fx);
    this.fx.squash = 0;
    this.tweens.add({ targets: this.fx, squash: 1, duration: 110, yoyo: true, ease: 'Quad.easeOut' });
    if (mood === 'angry') this.cameras.main.shake(260, 0.006);
    if (mood === 'amused' || mood === 'impressed') {
      this.sparkles.explode(mood === 'impressed' ? 22 : 10, this.monster.x, this.monster.y - this.monster.displayHeight * 0.7);
    }
  }

  setTrust(trust: number) {
    const c = trustColor(trust);
    this.lamp.setFillStyle(c);
    this.lampGlow.setTint(c);
    this.pool.setTint(c);
    this.tweens.add({ targets: this.lampGlow, alpha: { from: 1, to: 0.45 + trust / 300 }, duration: 600 });
    // Light leaks through the door crack as the monster warms up.
    this.tweens.add({ targets: this.fx, seam: trust / 100, duration: 800 });
  }

  setThinking(on: boolean) {
    this.bubble.setVisible(on);
  }

  /** Big "+14" / "−8" floating up from the monster's head. */
  floatDelta(delta: number) {
    if (delta === 0) return;
    const h = this.L.h;
    const t = this.add
      .text(this.monster.x, this.monster.y - this.monster.displayHeight * 0.95, `${delta > 0 ? '+' : '−'}${Math.abs(delta)}`, {
        fontFamily: FONT,
        fontStyle: '600',
        fontSize: `${Math.round(h * 0.065)}px`,
        color: delta > 0 ? '#5cff8a' : '#ff5e7e',
        stroke: '#120c2e',
        strokeThickness: Math.round(h * 0.008),
      })
      .setOrigin(0.5)
      .setDepth(11)
      .setScale(0.4);
    this.tweens.add({ targets: t, scale: 1, duration: 220, ease: 'Back.easeOut' });
    this.tweens.add({ targets: t, y: t.y - h * 0.1, alpha: 0, duration: 1500, delay: 350, ease: 'Sine.easeIn', onComplete: () => t.destroy() });
  }

  hop(times = 1) {
    this.tweens.add({ targets: this.fx, hopY: this.L.h * 0.05, duration: 160, yoyo: true, repeat: times - 1, ease: 'Quad.easeOut' });
  }

  /** Where the speech bubble should point, in CSS pixels. */
  headAnchor() {
    return {
      x: this.monster.x - this.monster.displayWidth * 0.12,
      y: this.monster.y - this.monster.displayHeight * 0.97,
      sceneW: this.L.w,
    };
  }

  openGate() {
    if (this.gateOpen) return;
    this.gateOpen = true;
    this.setThinking(false);
    this.setMood('impressed');
    this.setTrust(100);
    this.tweens.add({ targets: this.fx, aside: 1, duration: 900, ease: 'Sine.easeInOut' });
    this.hop(3);
    this.tweens.add({ targets: this.fx, doors: 1, duration: 1600, delay: 500, ease: 'Cubic.easeInOut' });
    this.time.delayedCall(700, () => this.cameras.main.flash(500, 255, 236, 180));
    this.tweens.add({ targets: this.glow, alpha: 1, duration: 1200, delay: 900 });
    this.tweens.add({ targets: this.rays, alpha: 0.55, duration: 1400, delay: 1100 });
    this.tweens.add({ targets: this.glow, scale: this.glow.scale * 1.08, duration: 900, yoyo: true, repeat: -1, delay: 2100 });
    this.tweens.add({ targets: this.gift, y: this.gift.y - this.L.h * 0.02, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay: 1800 });
    this.time.delayedCall(1400, () => this.confetti.explode(160));
    this.time.delayedCall(2400, () => this.confetti.explode(120));
    this.time.delayedCall(1800, () => this.sparkles.explode(30, this.L.gateX, this.L.floorY - this.L.h * 0.12));
  }

  resetGate() {
    this.gateOpen = false;
    this.tweens.killTweensOf([this.fx, this.glow, this.gift, this.rays]);
    this.fx = { squash: 0, hopY: 0, aside: 0, doors: 0, seam: 0 };
    this.glow.setAlpha(0);
    this.rays.setAlpha(0);
    this.layout();
    this.setThinking(false);
    this.setTrust(0);
    this.mood = 'neutral';
    this.monster.setTexture('monster_neutral');
  }

  /** LLM unreachable: Gulyabani dozes off (closed eyes, slow breathing, floating z's) until it comes back. */
  setAsleep(on: boolean) {
    if (on === this.asleep) return;
    this.asleep = on;
    this.snoreTimer?.remove();
    this.snoreTimer = undefined;
    if (on) {
      this.setThinking(false);
      this.mood = 'neutral';
      this.monster.setTexture('monster_neutral');
      this.snoreTimer = this.time.addEvent({ delay: 850, loop: true, startAt: 700, callback: () => this.snoreZ() });
    } else {
      this.hop(1);
    }
  }

  private snoreZ() {
    const h = this.L.h;
    const t = this.add
      .text(this.monster.x + this.monster.displayWidth * 0.2, this.monster.y - this.monster.displayHeight * 0.8, Math.random() < 0.5 ? 'z' : 'Z', {
        fontFamily: FONT,
        fontStyle: '600',
        fontSize: `${Math.round(h * 0.045)}px`,
        color: '#e8e2ff',
        stroke: '#120c2e',
        strokeThickness: Math.round(h * 0.006),
      })
      .setOrigin(0.5)
      .setDepth(11)
      .setScale(0.4)
      .setAlpha(0);
    this.tweens.add({ targets: t, alpha: 0.95, duration: 400 });
    this.tweens.add({ targets: t, x: t.x + h * 0.06, duration: 900, yoyo: true, ease: 'Sine.easeInOut' });
    this.tweens.add({
      targets: t,
      y: t.y - h * 0.16,
      scale: 1.1,
      rotation: 0.25,
      duration: 2600,
      ease: 'Sine.easeOut',
      onComplete: () => t.destroy(),
    });
    this.tweens.add({ targets: t, alpha: 0, duration: 900, delay: 1700 });
  }

  /** On the attract screen the monster changes expression now and then, to look alive. */
  setAttract(on: boolean) {
    this.attractTimer?.remove();
    this.attractTimer = undefined;
    if (!on) return;
    const idle: Mood[] = ['neutral', 'annoyed', 'neutral', 'amused', 'angry', 'neutral'];
    let i = 0;
    this.attractTimer = this.time.addEvent({
      delay: 2600,
      loop: true,
      callback: () => {
        if (this.asleep) return;
        const mood = idle[i++ % idle.length]!;
        this.setMood(mood);
        if (mood === 'amused') this.hop(1);
      },
    });
  }
}

export function createGame(parent: string): Promise<MonsterScene> {
  return new Promise((resolve) => {
    const scene = new MonsterScene();
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent,
      backgroundColor: '#0d0826',
      scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
      input: { keyboard: false },
      banner: false,
      scene,
    });
    game.events.once(Phaser.Core.Events.READY, () => {
      if (scene.sys.settings.status >= Phaser.Scenes.RUNNING) resolve(scene);
      else scene.events.once(Phaser.Scenes.Events.CREATE, () => resolve(scene));
    });
  });
}
