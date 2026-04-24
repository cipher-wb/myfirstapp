"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { SoundEngine } from "@/lib/soundEngine";

interface Boid {
  x: number;
  y: number;
  vx: number;
  vy: number;
  char: string;
  size: number;
  opacity: number;
  layer: number;
  hue: number;
  angle: number;
  targetAngle: number;
  trail: { x: number; y: number; alpha: number }[];
  nextChange: number;
}

const POEMS = [
  "孤独", "渴望", "自由", "沉默", "焦虑", "温柔", "迷失", "觉醒",
  "执念", "释然", "虚无", "共情", "犹豫", "释怀", "倦怠", "迷惘",
  "憧憬", "暧昧", "怅然", "疏离", "共鸣", "悸动", "坠落", "漂浮",
  "悖论", "倒影", "悬念", "空缺", "回响", "余温", "裂缝", "暗涌",
  "恍惚", "沉溺", "困顿", "救赎", "羁绊", "凝望", "呢喃", "蛰伏",
  "荒芜", "蔓延", "吞噬", "剥离", "坍塌", "湮灭", "沉积", "渗透",
  "缄默", "独白", "旁白", "隐忍", "挣扎", "蜕变", "撕裂", "缝合",
  "试探", "退却", "沦陷", "抽离", "对峙", "僵持", "消融", "凝固",
  "悬而未决", "若即若离", "欲言又止", "不置可否",
  "心如止水", "浮生若梦", "万念俱灰", "不知所措",
  "恍如隔世", "如影随形", "欲罢不能", "若有所失",
  "痛彻心扉", "百感交集", "怅然若失", "黯然神伤",
  "幡然醒悟", "大梦初醒", "物是人非", "沧海桑田",
  "刻骨铭心", "魂牵梦萦", "辗转反侧", "夜不能寐",
  "心驰神往", "望眼欲穿", "情深不寿", "慧极必伤",
  "聚散无常", "因缘际会", "劫后余生", "破茧成蝶",
  "迷", "惘", "默", "寻", "逝", "醒", "溺", "焚",
  "欲", "妄", "劫", "念", "渡", "隐", "渊", "霁",
  "殇", "寂", "烬", "蛊", "谶", "璞", "妄", "禅",
];

const POEMS_SINGLE = "欲念沉默渴望自由迷失执念醒觉悟虚空寻渡焚溺隐渊霁妄劫余温回响裂缝暗涌殇寂烬蛊谶璞禅隐忍蛰伏荒芜蔓延";

function randomChar(): string {
  if (Math.random() < 0.6) {
    return POEMS[Math.floor(Math.random() * POEMS.length)];
  }
  return POEMS_SINGLE[Math.floor(Math.random() * POEMS_SINGLE.length)];
}

function dist(x1: number, y1: number, x2: number, y2: number): number {
  return Math.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2);
}

const SEPARATION_RADIUS = 120;
const ALIGNMENT_RADIUS = 160;
const COHESION_RADIUS = 200;
const MAX_SPEED = 5.0;
const BASE_MAX_SPEED = 2.0;
const MIN_SPEED = 0.5;
const MOUSE_REPEL_RADIUS = 150;
const MOUSE_ATTRACT_RADIUS = 500;
const TRAIL_LENGTH = 1;
const HIT_RADIUS = 30;
const RESPAWN_DELAY = 180;

const TOTAL_DURATION = 30; // seconds
const RAMP_START = 20; // seconds — madness begins
const BOID_COUNT = 60;

const ENDING_VERSES = [
  ["心事落地", "如尘归尘"],
  ["风息浪止", "水自无声"],
  ["痛意渐远", "心归寂然"],
  ["波澜已过", "天地如初"],
  ["念起念落", "终归平常"],
  ["云开雾散", "山河入静"],
  ["心火渐熄", "万物归宁"],
  ["风过无痕", "心止如水"],
  ["情潮退尽", "岸自成形"],
  ["尘嚣已远", "清影独存"],
  ["万念俱寂", "一身如初"],
  ["心境既定", "外物皆轻"],
  ["过往成灰", "余生如常"],
  ["心声渐隐", "万籁归空"],
  ["意散神定", "身在此间"],
  ["喧哗既散", "独与空明"],
];

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  char: string;
  size: number;
  alpha: number;
  hue: number;
  life: number;
  maxLife: number;
}

type Phase = "running" | "exploded" | "black" | "ending" | "ended";

export default function BoidsCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: -1000, y: -1000, pressed: false });
  const boidsRef = useRef<Boid[]>([]);
  const animRef = useRef<number>(0);
  const timeRef = useRef(0);
  const frameRef = useRef(0);
  const glyphDotsRef = useRef<{ x: number; y: number; char: string }[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const respawnQueueRef = useRef<{ timer: number; layer: number }[]>([]);
  const phaseRef = useRef<Phase>("running");
  const flashAlphaRef = useRef(0);
  const endTextAlphaRef = useRef(0);
  const glyphFadeRef = useRef(1);
  const endingVerseRef = useRef<string[]>(ENDING_VERSES[0]);
  const blackPauseRef = useRef(0);
  const [phase, setPhase] = useState<Phase>("running");
  const soundRef = useRef(new SoundEngine());
  const hasStartedRef = useRef(false);
  const [showStart, setShowStart] = useState(true);
  const [startFading, setStartFading] = useState(false);

  const initBoids = useCallback((w: number, h: number) => {
    const boids: Boid[] = [];
    for (let i = 0; i < BOID_COUNT; i++) {
      const layer = Math.random();
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.0 + Math.random() * 1.0;
      boids.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        char: randomChar(),
        size: 22 + layer * 22,
        opacity: 0.55 + layer * 0.45,
        layer,
        hue: 30 + Math.random() * 30,
        angle,
        targetAngle: angle,
        trail: [],
        nextChange: 60 + Math.random() * 180,
      });
    }
    boidsRef.current = boids;
  }, []);

  const generateGlyph = useCallback((w: number, h: number) => {
    const offscreen = document.createElement("canvas");
    const offCtx = offscreen.getContext("2d");
    if (!offCtx) return;

    const fontSize = Math.min(w, h) * 0.75;
    offscreen.width = w;
    offscreen.height = h;
    offCtx.fillStyle = "#000";
    offCtx.fillRect(0, 0, w, h);
    offCtx.fillStyle = "#fff";
    offCtx.font = `900 ${fontSize}px "PingFang SC", "Microsoft YaHei", "SimHei", sans-serif`;
    offCtx.textAlign = "center";
    offCtx.textBaseline = "middle";
    offCtx.fillText("念", w / 2, h / 2);

    const imageData = offCtx.getImageData(0, 0, w, h);
    const pixels = imageData.data;
    const dots: { x: number; y: number; char: string }[] = [];
    const gap = Math.max(12, Math.floor(Math.min(w, h) / 70));
    const glyphs = "念心思想梦欲忆感知觉情魂";

    for (let y = 0; y < h; y += gap) {
      for (let x = 0; x < w; x += gap) {
        const idx = (y * w + x) * 4;
        if (pixels[idx] > 128) {
          dots.push({
            x,
            y,
            char: glyphs[Math.floor(Math.random() * glyphs.length)],
          });
        }
      }
    }
    glyphDotsRef.current = dots;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (boidsRef.current.length === 0) {
        initBoids(window.innerWidth, window.innerHeight);
      }
      generateGlyph(window.innerWidth, window.innerHeight);
    };

    resize();
    window.addEventListener("resize", resize);

    const handleMouseMove = (e: MouseEvent) => {
      mouseRef.current.x = e.clientX;
      mouseRef.current.y = e.clientY;
    };
    const handleMouseDown = () => { mouseRef.current.pressed = true; };
    const handleMouseUp = () => { mouseRef.current.pressed = false; };
    const handleMouseLeave = () => {
      mouseRef.current.x = -1000;
      mouseRef.current.y = -1000;
      mouseRef.current.pressed = false;
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("mouseup", handleMouseUp);
    window.addEventListener("mouseleave", handleMouseLeave);

    const handleClick = (e: MouseEvent) => {
      if (phaseRef.current !== "running") return;
      const boids = boidsRef.current;
      const mx = e.clientX;
      const my = e.clientY;

      let hitIdx = -1;
      let hitDist = Infinity;
      for (let i = 0; i < boids.length; i++) {
        const b = boids[i];
        const d = dist(b.x, b.y, mx, my);
        const charW = b.char.length * b.size * 0.5;
        const hitR = Math.max(HIT_RADIUS, charW);
        if (d < hitR && d < hitDist) {
          hitDist = d;
          hitIdx = i;
        }
      }

      if (hitIdx >= 0) {
        const b = boids[hitIdx];
        const particles: Particle[] = [];
        const numParticles = 12 + Math.floor(Math.random() * 8);
        for (let p = 0; p < numParticles; p++) {
          const ang = (Math.PI * 2 * p) / numParticles + (Math.random() - 0.5) * 0.5;
          const spd = 2 + Math.random() * 4;
          particles.push({
            x: b.x, y: b.y,
            vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
            char: b.char[p % b.char.length] || b.char[0],
            size: b.size * (0.3 + Math.random() * 0.4),
            alpha: 1, hue: b.hue,
            life: 30 + Math.random() * 30, maxLife: 60,
          });
        }
        particlesRef.current.push(...particles);
        respawnQueueRef.current.push({ timer: RESPAWN_DELAY + Math.random() * 120, layer: b.layer });
        boids.splice(hitIdx, 1);
        soundRef.current.playWordBurst();
      }
    };

    window.addEventListener("click", handleClick);

    const spawnExplosion = (b: Boid) => {
      const particles: Particle[] = [];
      const num = 10 + Math.floor(Math.random() * 6);
      for (let p = 0; p < num; p++) {
        const ang = (Math.PI * 2 * p) / num + (Math.random() - 0.5) * 0.8;
        const spd = 3 + Math.random() * 6;
        particles.push({
          x: b.x, y: b.y,
          vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
          char: b.char[p % b.char.length] || b.char[0],
          size: b.size * (0.3 + Math.random() * 0.5),
          alpha: 1, hue: b.hue,
          life: 40 + Math.random() * 40, maxLife: 80,
        });
      }
      particlesRef.current.push(...particles);
    };

    const update = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const boids = boidsRef.current;
      const mouse = mouseRef.current;
      timeRef.current += 0.005;
      if (hasStartedRef.current) {
        frameRef.current += 1;
      }

      const elapsedSec = frameRef.current / 60;
      const currentPhase = phaseRef.current;

      // phase transitions
      if (currentPhase === "running" && elapsedSec >= TOTAL_DURATION) {
        phaseRef.current = "exploded";
        setPhase("exploded");
        endingVerseRef.current = ENDING_VERSES[Math.floor(Math.random() * ENDING_VERSES.length)];
        for (const b of boids) {
          spawnExplosion(b);
        }
        boids.length = 0;
        respawnQueueRef.current.length = 0;
        flashAlphaRef.current = 1;
        glyphFadeRef.current = 1;
        soundRef.current.triggerExplosion();
        return;
      }

      if (currentPhase === "exploded") {
        flashAlphaRef.current *= 0.93;
        glyphFadeRef.current *= 0.96;
        // keep updating explosion particles
        const particles = particlesRef.current;
        for (let i = particles.length - 1; i >= 0; i--) {
          const p = particles[i];
          p.x += p.vx;
          p.y += p.vy;
          p.vx *= 0.96;
          p.vy *= 0.96;
          p.life -= 1;
          p.alpha = Math.max(0, p.life / p.maxLife);
          if (p.life <= 0) {
            particles.splice(i, 1);
          }
        }
        if (flashAlphaRef.current < 0.01 && glyphFadeRef.current < 0.01 && particles.length === 0) {
          phaseRef.current = "black";
          setPhase("black");
          blackPauseRef.current = 120; // ~2 seconds of pure black
        }
        return;
      }

      if (currentPhase === "black") {
        blackPauseRef.current -= 1;
        if (blackPauseRef.current <= 0) {
          phaseRef.current = "ending";
          setPhase("ending");
          endTextAlphaRef.current = 0;
          soundRef.current.playEndingTone();
        }
        return;
      }

      if (currentPhase === "ending") {
        endTextAlphaRef.current = Math.min(endTextAlphaRef.current + 0.008, 1);
        if (endTextAlphaRef.current >= 0.95) {
          phaseRef.current = "ended";
          setPhase("ended");
        }
        return;
      }

      if (currentPhase === "ended") return;

      // madness factor: 0 at RAMP_START, ramps up to 1 at TOTAL_DURATION
      const madness = elapsedSec >= RAMP_START
        ? Math.min((elapsedSec - RAMP_START) / (TOTAL_DURATION - RAMP_START), 1)
        : 0;

      soundRef.current.updateMadness(madness);

      const speedMultiplier = 1 + madness * 4;
      const changeMultiplier = 1 + madness * 6;

      for (let i = 0; i < boids.length; i++) {
        const b = boids[i];

        let sepX = 0, sepY = 0, sepCount = 0;
        let aliX = 0, aliY = 0, aliCount = 0;
        let cohX = 0, cohY = 0, cohCount = 0;

        for (let j = 0; j < boids.length; j++) {
          if (i === j) continue;
          const o = boids[j];
          const d = dist(b.x, b.y, o.x, o.y);

          if (d < SEPARATION_RADIUS && d > 0) {
            const push = 1 + (SEPARATION_RADIUS - d) / SEPARATION_RADIUS;
            sepX += ((b.x - o.x) / d) * push;
            sepY += ((b.y - o.y) / d) * push;
            sepCount++;
          }

          const layerDiff = Math.abs(b.layer - o.layer);
          if (layerDiff > 0.4) continue;
          if (d < ALIGNMENT_RADIUS) {
            aliX += o.vx;
            aliY += o.vy;
            aliCount++;
          }
          if (d < COHESION_RADIUS) {
            cohX += o.x;
            cohY += o.y;
            cohCount++;
          }
        }

        let ax = 0, ay = 0;

        if (sepCount > 0) {
          ax += (sepX / sepCount) * 0.25;
          ay += (sepY / sepCount) * 0.25;
        }
        if (aliCount > 0) {
          const avgVx = aliX / aliCount;
          const avgVy = aliY / aliCount;
          ax += (avgVx - b.vx) * 0.04;
          ay += (avgVy - b.vy) * 0.04;
        }
        if (cohCount > 0) {
          const avgX = cohX / cohCount;
          const avgY = cohY / cohCount;
          ax += (avgX - b.x) * 0.0003;
          ay += (avgY - b.y) * 0.0003;
        }

        // organic wandering
        const wanderAngle = Math.sin(timeRef.current * 2 + b.layer * 10) * 0.3;
        ax += Math.cos(b.angle + wanderAngle) * 0.02;
        ay += Math.sin(b.angle + wanderAngle) * 0.02;

        // shake during madness
        if (madness > 0) {
          const shakeStrength = madness * 0.8;
          ax += (Math.random() - 0.5) * shakeStrength;
          ay += (Math.random() - 0.5) * shakeStrength;
        }

        // mouse interaction
        const dMouse = dist(b.x, b.y, mouse.x, mouse.y);
        if (dMouse < MOUSE_ATTRACT_RADIUS && dMouse > 0) {
          const force = (1 - dMouse / MOUSE_ATTRACT_RADIUS);
          if (mouse.pressed) {
            ax += ((mouse.x - b.x) / dMouse) * force * 0.15;
            ay += ((mouse.y - b.y) / dMouse) * force * 0.15;
          } else {
            if (dMouse < MOUSE_REPEL_RADIUS) {
              const repelForce = (1 - dMouse / MOUSE_REPEL_RADIUS) ** 1.5;
              ax += ((b.x - mouse.x) / dMouse) * repelForce * 0.15;
              ay += ((b.y - mouse.y) / dMouse) * repelForce * 0.15;
            }
          }
        }

        // gentle edge avoidance
        const margin = 80;
        if (b.x < margin) ax += (margin - b.x) * 0.002;
        if (b.x > w - margin) ax -= (b.x - (w - margin)) * 0.002;
        if (b.y < margin) ay += (margin - b.y) * 0.002;
        if (b.y > h - margin) ay -= (b.y - (h - margin)) * 0.002;

        b.vx += ax;
        b.vy += ay;

        const speedDist = dist(b.x, b.y, mouse.x, mouse.y);
        const proximityFactor = speedDist < MOUSE_ATTRACT_RADIUS
          ? Math.max(0, (1 - speedDist / MOUSE_ATTRACT_RADIUS))
          : 0;
        const baseSpeed = BASE_MAX_SPEED * speedMultiplier;
        const maxSpeed = baseSpeed + proximityFactor * (MAX_SPEED * speedMultiplier - baseSpeed);

        const speed = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
        if (speed > maxSpeed) {
          b.vx = (b.vx / speed) * maxSpeed;
          b.vy = (b.vy / speed) * maxSpeed;
        }
        if (proximityFactor < 0.1 && speed > baseSpeed * 1.2) {
          b.vx *= 0.98;
          b.vy *= 0.98;
        }
        if (speed < MIN_SPEED && speed > 0) {
          b.vx = (b.vx / speed) * MIN_SPEED;
          b.vy = (b.vy / speed) * MIN_SPEED;
        }

        b.trail.push({ x: b.x, y: b.y, alpha: b.opacity });
        if (b.trail.length > TRAIL_LENGTH) b.trail.shift();

        b.x += b.vx;
        b.y += b.vy;

        if (b.x < -50) b.x = w + 50;
        if (b.x > w + 50) b.x = -50;
        if (b.y < -50) b.y = h + 50;
        if (b.y > h + 50) b.y = -50;

        b.angle = Math.atan2(b.vy, b.vx);

        // change character — faster during madness
        b.nextChange -= changeMultiplier;
        if (b.nextChange <= 0) {
          b.char = randomChar();
          b.nextChange = 40 + Math.random() * 160;
        }
      }

      // update explosion particles
      const particles = particlesRef.current;
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.96;
        p.vy *= 0.96;
        p.life -= 1;
        p.alpha = Math.max(0, p.life / p.maxLife);
        if (p.life <= 0) {
          particles.splice(i, 1);
        }
      }

      // handle respawns
      const queue = respawnQueueRef.current;
      for (let i = queue.length - 1; i >= 0; i--) {
        queue[i].timer -= 1;
        if (queue[i].timer <= 0) {
          const layer = queue[i].layer;
          const angle = Math.random() * Math.PI * 2;
          const speed = 1.0 + Math.random() * 1.0;
          boids.push({
            x: Math.random() * w, y: Math.random() * h,
            vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
            char: randomChar(), size: 22 + layer * 22,
            opacity: 0.55 + layer * 0.45, layer,
            hue: 30 + Math.random() * 30, angle, targetAngle: angle,
            trail: [], nextChange: 40 + Math.random() * 160,
          });
          queue.splice(i, 1);
        }
      }
    };

    const draw = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const mouse = mouseRef.current;
      const boids = boidsRef.current;
      const currentPhase = phaseRef.current;

      // background
      ctx.fillStyle = "rgba(5, 5, 5, 0.15)";
      ctx.fillRect(0, 0, w, h);

      // subtle vignette
      const vigGrad = ctx.createRadialGradient(w / 2, h / 2, h * 0.2, w / 2, h / 2, h * 0.9);
      vigGrad.addColorStop(0, "rgba(5, 5, 5, 0)");
      vigGrad.addColorStop(1, "rgba(5, 5, 5, 0.06)");
      ctx.fillStyle = vigGrad;
      ctx.fillRect(0, 0, w, h);

      // mouse glow
      if (mouse.x > 0 && mouse.y > 0 && currentPhase === "running") {
        const glowRadius = mouse.pressed ? 700 : 500;
        const glowGrad = ctx.createRadialGradient(mouse.x, mouse.y, 0, mouse.x, mouse.y, glowRadius);
        const glowAlpha = mouse.pressed ? 0.1 : 0.05;
        glowGrad.addColorStop(0, `rgba(220, 200, 175, ${glowAlpha})`);
        glowGrad.addColorStop(0.4, `rgba(200, 180, 160, ${glowAlpha * 0.4})`);
        glowGrad.addColorStop(1, "rgba(200, 180, 160, 0)");
        ctx.fillStyle = glowGrad;
        ctx.fillRect(mouse.x - glowRadius, mouse.y - glowRadius, glowRadius * 2, glowRadius * 2);
      }

      // giant "念" glyph — fades out during explosion
      const glyphDots = glyphDotsRef.current;
      if (glyphDots.length > 0 && glyphFadeRef.current > 0.01) {
        const t = timeRef.current;
        const glyphFontSize = Math.max(8, Math.floor(Math.min(w, h) / 80));
        ctx.font = `400 ${glyphFontSize}px "PingFang SC", "Microsoft YaHei", sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        for (const dot of glyphDots) {
          const dMouse = dist(dot.x, dot.y, mouse.x, mouse.y);
          let alpha = 0.025 * glyphFadeRef.current;
          let lightness = 25;

          const wave = Math.sin(t + dot.x * 0.005 + dot.y * 0.003) * 0.008;
          alpha += wave * glyphFadeRef.current;

          if (dMouse < 300) {
            const proximity = (1 - dMouse / 300) ** 2;
            alpha += proximity * 0.12 * glyphFadeRef.current;
            lightness += proximity * 40;
          }

          if (alpha < 0.005) continue;

          ctx.save();
          ctx.globalAlpha = Math.max(0, alpha);
          ctx.fillStyle = `hsl(35, 12%, ${lightness}%)`;
          ctx.fillText(dot.char, dot.x, dot.y);
          ctx.restore();
        }
      }

      // flash white screen during explosion
      if (flashAlphaRef.current > 0.01) {
        ctx.save();
        ctx.globalAlpha = flashAlphaRef.current;
        ctx.fillStyle = "#fffcf5";
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
      }

      // boids — shake offset during madness
      const madness = currentPhase === "running"
        ? Math.min(Math.max((frameRef.current / 60 - RAMP_START) / (TOTAL_DURATION - RAMP_START), 0), 1)
        : 0;

      const sorted = [...boids].sort((a, b) => a.layer - b.layer);

      for (const b of sorted) {
        const dMouse = dist(b.x, b.y, mouse.x, mouse.y);
        let glowIntensity = 0;
        if (dMouse < MOUSE_ATTRACT_RADIUS) {
          glowIntensity = (1 - dMouse / MOUSE_ATTRACT_RADIUS) ** 2;
        }

        // shake offset
        const shakeX = madness > 0 ? (Math.random() - 0.5) * madness * 12 : 0;
        const shakeY = madness > 0 ? (Math.random() - 0.5) * madness * 12 : 0;

        ctx.save();
        ctx.translate(b.x + shakeX, b.y + shakeY);

        const rotAngle = b.angle * 0.03 + (madness > 0 ? (Math.random() - 0.5) * madness * 0.3 : 0);
        ctx.rotate(rotAngle);

        const fontSize = b.size + glowIntensity * 8;
        ctx.font = `500 ${fontSize}px "PingFang SC", "Microsoft YaHei", "SimHei", sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        if (glowIntensity > 0.2) {
          ctx.shadowColor = `hsla(${b.hue + 10}, 35%, 80%, ${glowIntensity * 0.6})`;
          ctx.shadowBlur = 15 * glowIntensity;
        }

        const alpha = Math.min(b.opacity + glowIntensity * 0.4, 1);
        const lightness = 72 + glowIntensity * 20;
        const saturation = 8 + glowIntensity * 20;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = `hsl(${b.hue + glowIntensity * 15}, ${saturation}%, ${lightness}%)`;
        ctx.fillText(b.char, 0, 0);
        ctx.restore();
      }

      // explosion particles
      const particles = particlesRef.current;
      for (const p of particles) {
        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = `hsl(${p.hue + 20}, 40%, 80%)`;
        ctx.font = `500 ${p.size}px "PingFang SC", "Microsoft YaHei", "SimHei", sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        if (p.alpha > 0.3) {
          ctx.shadowColor = `hsla(${p.hue}, 50%, 85%, ${p.alpha * 0.8})`;
          ctx.shadowBlur = 10;
        }
        ctx.fillText(p.char, p.x, p.y);
        ctx.restore();
      }

      // ending text — ink wash style
      if ((currentPhase === "ending" || currentPhase === "ended") && endTextAlphaRef.current > 0.01) {
        const alpha = endTextAlphaRef.current;
        const verse = endingVerseRef.current;
        ctx.save();

        // ink bleed shadow layer
        ctx.globalAlpha = alpha * 0.15;
        ctx.fillStyle = `hsl(0, 0%, 75%)`;
        ctx.font = `900 64px "SimHei", "PingFang SC", "Microsoft YaHei", sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(verse[0], w / 2 + 2, h / 2 - 52 + 2);
        ctx.fillText(verse[1], w / 2 + 2, h / 2 + 52 + 2);

        // main brush stroke layer
        ctx.globalAlpha = alpha;
        ctx.fillStyle = `hsl(30, 5%, 90%)`;
        ctx.font = `900 60px "SimHei", "PingFang SC", "Microsoft YaHei", sans-serif`;
        ctx.fillText(verse[0], w / 2, h / 2 - 52);
        ctx.fillText(verse[1], w / 2, h / 2 + 52);

        // subtle ink splatter — small dots around the text
        if (alpha > 0.3) {
          const t = timeRef.current;
          ctx.globalAlpha = alpha * 0.12;
          ctx.fillStyle = `hsl(30, 5%, 80%)`;
          for (let i = 0; i < 8; i++) {
            const ox = Math.sin(t * 0.3 + i * 1.7) * 120;
            const oy = Math.cos(t * 0.2 + i * 2.3) * 40;
            const r = 1.5 + Math.sin(i * 3.1) * 1;
            ctx.beginPath();
            ctx.arc(w / 2 + ox, h / 2 + oy, r, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        ctx.restore();
      }
    };

    const loop = () => {
      update();
      draw();
      animRef.current = requestAnimationFrame(loop);
    };

    // initial clear
    ctx.fillStyle = "#050505";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    loop();

    return () => {
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("mouseleave", handleMouseLeave);
      window.removeEventListener("click", handleClick);
      cancelAnimationFrame(animRef.current);
      soundRef.current.reset();
    };
  }, [initBoids, generateGlyph]);

  const handleStart = useCallback(() => {
    soundRef.current.start();
    hasStartedRef.current = true;
    setStartFading(true);
    setTimeout(() => setShowStart(false), 1500);
  }, []);

  const handleRestart = () => {
    soundRef.current.reset();
    boidsRef.current = [];
    particlesRef.current = [];
    respawnQueueRef.current = [];
    glyphDotsRef.current = [];
    frameRef.current = 0;
    timeRef.current = 0;
    phaseRef.current = "running";
    flashAlphaRef.current = 0;
    endTextAlphaRef.current = 0;
    glyphFadeRef.current = 1;
    blackPauseRef.current = 0;
    setPhase("running");

    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.fillStyle = "#050505";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
    }
    initBoids(window.innerWidth, window.innerHeight);
    generateGlyph(window.innerWidth, window.innerHeight);
    soundRef.current.start();
  };

  return (
    <main style={{ position: "relative", width: "100vw", height: "100vh", overflow: "hidden" }}>
      <canvas ref={canvasRef} />
      <CursorFollower />
      {showStart && (
        <div
          onClick={handleStart}
          style={{
            position: "fixed",
            inset: 0,
            background: startFading ? "rgba(5, 5, 5, 0)" : "rgba(5, 5, 5, 0.97)",
            zIndex: 50,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            transition: "background 1.5s ease",
            pointerEvents: startFading ? "none" : "auto",
          }}
        >
          <div style={{
            color: "rgba(200, 180, 160, 0.6)",
            fontSize: "18px",
            fontFamily: '"PingFang SC", "Microsoft YaHei", sans-serif',
            letterSpacing: "6px",
            animation: "breathe 3s ease-in-out infinite",
            opacity: startFading ? 0 : 1,
            transition: "opacity 0.5s ease",
          }}>
            点击进入
          </div>
          <div style={{
            color: "rgba(200, 180, 160, 0.3)",
            fontSize: "13px",
            marginTop: "16px",
            fontFamily: '"PingFang SC", "Microsoft YaHei", sans-serif',
            opacity: startFading ? 0 : 1,
            transition: "opacity 0.5s ease",
          }}>
            ♪ 建议佩戴耳机
          </div>
        </div>
      )}
      {phase === "ended" && (
        <div style={{
          position: "fixed",
          bottom: "15%",
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 10,
        }}>
          <button
            onClick={handleRestart}
            style={{
              background: "transparent",
              border: "1px solid rgba(200, 180, 160, 0.4)",
              color: "rgba(200, 180, 160, 0.8)",
              padding: "14px 40px",
              fontSize: "20px",
              fontFamily: '"PingFang SC", "Microsoft YaHei", sans-serif',
              cursor: "pointer",
              letterSpacing: "8px",
              transition: "all 0.3s ease",
              borderRadius: "2px",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "rgba(200, 180, 160, 0.8)";
              e.currentTarget.style.color = "rgba(220, 200, 175, 1)";
              e.currentTarget.style.background = "rgba(200, 180, 160, 0.08)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "rgba(200, 180, 160, 0.4)";
              e.currentTarget.style.color = "rgba(200, 180, 160, 0.8)";
              e.currentTarget.style.background = "transparent";
            }}
          >
            轮回
          </button>
        </div>
      )}
    </main>
  );
}

function CursorFollower() {
  const dotRef = useRef<HTMLDivElement>(null);
  const mouseRef = useRef({ x: -100, y: -100, pressed: false });
  const posRef = useRef({ x: -100, y: -100 });

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      mouseRef.current.x = e.clientX;
      mouseRef.current.y = e.clientY;
    };
    const handleMouseDown = () => { mouseRef.current.pressed = true; };
    const handleMouseUp = () => { mouseRef.current.pressed = false; };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("mouseup", handleMouseUp);

    const animate = () => {
      const target = mouseRef.current;
      const pos = posRef.current;
      const ease = 0.15;
      pos.x += (target.x - pos.x) * ease;
      pos.y += (target.y - pos.y) * ease;

      const dot = dotRef.current;
      if (dot) {
        dot.style.left = `${pos.x}px`;
        dot.style.top = `${pos.y}px`;
        if (target.pressed) {
          dot.classList.add("active");
        } else {
          dot.classList.remove("active");
        }
      }
      requestAnimationFrame(animate);
    };
    animate();

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  return <div ref={dotRef} className="cursor-dot" />;
}
