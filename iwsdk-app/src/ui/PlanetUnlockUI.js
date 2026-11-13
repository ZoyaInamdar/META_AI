/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * ============================================================================
 * Celestial Kendama - PlanetUnlockUI
 * Subsystem: Stage 2 Planet Unlock / Achievement Reveal UI
 * ============================================================================
 *
 * Responsibilities:
 * 1. Dedicated, whimsical, celestial presentation layer for planetary unlock achievements.
 * 2. Listens synchronously to Events.TRANSFORMATION_COMPLETED ('planet:transformation-completed')
 *    with payload { previousStage, newStage }.
 * 3. Renders a floating celestial achievement card / sigil in 3D space:
 *    - Positioned gracefully in front of the awakened planetoid
 *    - Translucent glass material preserves clear visibility of the planet and molten gold Kintsugi
 *    - Whimsical celestial frame with thin champagne-gold outline, four-point sparkles, and orbital motifs
 * 4. Choreographs 5 distinct animation phases:
 *    - Phase A: ARRIVAL (0.40s) - Opacity 0->1, scale 0.92->1.0, gentle upward ease-out
 *    - Phase B: TITLE_REVEAL (0.40s) - "PLANET AWAKENED" illuminated with pearl-white / champagne highlight
 *    - Phase C: STAGE_REVEAL (0.40s) - "STAGE II" and "AWAKENED MINERAL WORLD" revealed
 *    - Phase D: SHIMMER (0.75s) - Soft diagonal champagne-gold shimmer sweeps across the plaque
 *    - Phase E: EXIT (0.60s) - Opacity 1->0, scale 1.0->1.03 with gentle upward drift
 * 5. Strict architectural boundary:
 *    - Pure reaction layer: does NOT control evolution, change stage, trigger transformation,
 *      modify uniforms, or touch gameplay physics/score.
 * 6. Quest-friendly performance:
 *    - Zero per-frame allocations
 *    - Single lightweight PlaneGeometry with custom unlit ShaderMaterial
 *    - High-resolution procedural canvas rendered once per unlock event
 * 7. Exposes development/debug API window.planetUnlockUI.
 */

import { Events } from '../contracts/Interfaces.js';
import { eventBus as defaultEventBus } from '../contracts/EventBus.js';
import {
  Group,
  Mesh,
  PlaneGeometry,
  ShaderMaterial,
  CanvasTexture,
  Vector3,
  Color,
  DoubleSide,
} from 'three';

// ============================================================================
// 1. CANONICAL CONSTANTS & PALETTE
// ============================================================================

/**
 * Whimsical celestial color palette harmonizing with the pastel galaxy.
 */
export const UNLOCK_UI_PALETTE = Object.freeze({
  PEARL_WHITE: '#FFF8F2',
  SOFT_CHAMPAGNE: '#F6D58A',
  WARM_GOLD: '#E8B94F',
  PALE_ROSE: '#F4B8C8',
  SOFT_LILAC: '#CBB7F6',
  LAVENDER: '#AFA0E8',
  VERY_PALE_PINK: '#FFE4EC',
});

/**
 * Stage unlock achievement metadata mapping.
 * Supports future stages (Stage 2 -> 3, Stage 3 -> 4, Stage 4 -> 5).
 */
export const STAGE_UNLOCKS = Object.freeze({
  2: Object.freeze({
    stage: 2,
    title: 'PLANET AWAKENED',
    stageLabel: 'STAGE II',
    subtitle: 'AWAKENED MINERAL WORLD',
  }),
  3: Object.freeze({
    stage: 3,
    title: 'OCEANS AWAKENED',
    stageLabel: 'STAGE III',
    subtitle: 'BLUE OCEAN WORLD',
  }),
  4: Object.freeze({
    stage: 4,
    title: 'LIFE AWAKENED',
    stageLabel: 'STAGE IV',
    subtitle: 'LIVING GREEN WORLD',
  }),
  5: Object.freeze({
    stage: 5,
    title: 'CELESTIAL ASCENSION',
    stageLabel: 'STAGE V',
    subtitle: 'TRANSCENDENT CELESTIAL WORLD',
  }),
});

/**
 * High-level state of the PlanetUnlockUI system.
 */
export const UnlockUIState = Object.freeze({
  IDLE: 'idle',
  SHOWING: 'showing',
  HOLDING: 'holding',
  COMPLETE: 'complete',
  DESTROYED: 'destroyed',
});

/**
 * Sequential choreography phases for the unlock animation.
 */
export const UnlockUIPhase = Object.freeze({
  IDLE: 'idle',
  DELAY: 'delay',
  ARRIVAL: 'arrival',
  TITLE_REVEAL: 'title_reveal',
  STAGE_REVEAL: 'stage_reveal',
  SHIMMER: 'shimmer',
  HOLD: 'hold',
  COMPLETE: 'complete',
});

/**
 * Canonical phase durations in seconds before entering sustained HOLD state.
 */
export const DEFAULT_UNLOCK_DURATIONS = Object.freeze({
  [UnlockUIPhase.DELAY]: 0.15,
  [UnlockUIPhase.ARRIVAL]: 0.40,
  [UnlockUIPhase.TITLE_REVEAL]: 0.40,
  [UnlockUIPhase.STAGE_REVEAL]: 0.40,
  [UnlockUIPhase.SHIMMER]: 0.75,
});

/** Refined physical dimensions in 3D world meters (larger VR scale) */
export const UNLOCK_UI_DEFAULT_WIDTH = 0.85;
export const UNLOCK_UI_DEFAULT_HEIGHT = 0.58;

/** Default anchor position positioned beside the planet */
export const UNLOCK_UI_DEFAULT_ANCHOR = Object.freeze({
  x: 0.78,
  y: 1.43,
  z: -1.125,
});

// ============================================================================
// 2. SHADER DEFINITION
// ============================================================================

export const PLANET_UNLOCK_VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const PLANET_UNLOCK_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  uniform sampler2D uMap;
  uniform float uOpacity;
  uniform float uShimmerProgress;
  uniform vec3 uShimmerColor;

  varying vec2 vUv;

  void main() {
    vec4 tex = texture2D(uMap, vUv);
    if (tex.a < 0.005) {
      discard;
    }

    // Diagonal shimmer band: travels from bottom-left to top-right
    float band = (vUv.x * 0.75 + (1.0 - vUv.y) * 0.25);
    float dist = abs(band - uShimmerProgress);
    float shimmer = smoothstep(0.14, 0.0, dist) * 0.50;

    // Combine texture color with soft champagne shimmer
    vec3 col = tex.rgb + uShimmerColor * (shimmer * tex.a);
    float alpha = tex.a * uOpacity;

    gl_FragColor = vec4(col, alpha);
  }
`;

// ============================================================================
// 3. PROCEDURAL CELESTIAL CANVAS DRAWING
// ============================================================================

/**
 * Draws a 4-point celestial star glyph centered at (cx, cy).
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cx
 * @param {number} cy
 * @param {number} outerR
 * @param {number} innerR
 * @param {string} fillColor
 * @param {string} strokeColor
 */
function drawFourPointStar(ctx, cx, cy, outerR, innerR, fillColor, strokeColor) {
  ctx.save();
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const angleTip = (i * Math.PI) / 2 - Math.PI / 2;
    const angleHip = angleTip + Math.PI / 4;
    const tipX = cx + Math.cos(angleTip) * outerR;
    const tipY = cy + Math.sin(angleTip) * outerR;
    const hipX = cx + Math.cos(angleHip) * innerR;
    const hipY = cy + Math.sin(angleHip) * innerR;
    if (i === 0) {
      ctx.moveTo(tipX, tipY);
    } else {
      ctx.lineTo(tipX, tipY);
    }
    ctx.lineTo(hipX, hipY);
  }
  ctx.closePath();
  if (fillColor) {
    ctx.fillStyle = fillColor;
    ctx.fill();
  }
  if (strokeColor) {
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 1.0;
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Helper to render tracked / spaced text centered at (cx, cy).
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} text
 * @param {number} cx
 * @param {number} cy
 * @param {number} letterSpacing
 */
function renderSpacedText(ctx, text, cx, cy, letterSpacing = 4) {
  if (!text) return;
  const chars = Array.from(text);
  let totalWidth = 0;
  const widths = [];

  for (let i = 0; i < chars.length; i++) {
    const w = ctx.measureText(chars[i]).width;
    widths.push(w);
    totalWidth += w;
    if (i < chars.length - 1) {
      totalWidth += letterSpacing;
    }
  }

  let curX = cx - totalWidth / 2;
  for (let i = 0; i < chars.length; i++) {
    ctx.fillText(chars[i], curX + widths[i] / 2, cy);
    curX += widths[i] + letterSpacing;
  }
}

/**
 * Draws the celestial achievement plaque onto a 2D HTML canvas.
 * @param {HTMLCanvasElement} canvas
 * @param {Object} stageInfo
 */
export function drawCelestialPlaque(canvas, stageInfo) {
  if (!canvas || typeof canvas.getContext !== 'function') return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  // 1. Soft Outer Cosmic Aura (subtle radial halo)
  const auraGrad = ctx.createRadialGradient(w / 2, h / 2, 40, w / 2, h / 2, w * 0.48);
  auraGrad.addColorStop(0.0, 'rgba(246, 213, 138, 0.09)');
  auraGrad.addColorStop(0.35, 'rgba(244, 184, 200, 0.07)');
  auraGrad.addColorStop(0.70, 'rgba(203, 183, 246, 0.05)');
  auraGrad.addColorStop(1.0, 'rgba(255, 248, 242, 0.0)');
  ctx.fillStyle = auraGrad;
  ctx.fillRect(0, 0, w, h);

  // 2. Rounded Translucent Glass Panel
  const padX = Math.round(w * 0.046);
  const padY = Math.round(h * 0.050);
  const panelW = w - padX * 2;
  const panelH = h - padY * 2;
  const r = 36;

  ctx.save();
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(padX, padY, panelW, panelH, r);
  } else if (typeof ctx.rect === 'function') {
    // Fallback for environments lacking roundRect
    ctx.rect(padX, padY, panelW, panelH);
  }

  // Soft Pearl / Rose / Lilac Glass Gradient Fill with Strong Base Opacity (0.84 - 0.92)
  const glassGrad = ctx.createLinearGradient(w / 2, padY, w / 2, padY + panelH);
  glassGrad.addColorStop(0.0, 'rgba(28, 20, 42, 0.90)');
  glassGrad.addColorStop(0.35, 'rgba(38, 26, 52, 0.86)');
  glassGrad.addColorStop(0.70, 'rgba(32, 22, 46, 0.84)');
  glassGrad.addColorStop(1.0, 'rgba(22, 16, 36, 0.92)');
  ctx.fillStyle = glassGrad;
  ctx.fill();

  // Subtle warm champagne/lilac inner glow
  const innerGlow = ctx.createRadialGradient(w / 2, h / 2, 40, w / 2, h / 2, panelW * 0.48);
  innerGlow.addColorStop(0.0, 'rgba(246, 213, 138, 0.16)');
  innerGlow.addColorStop(0.55, 'rgba(203, 183, 246, 0.10)');
  innerGlow.addColorStop(1.0, 'rgba(255, 248, 242, 0.0)');
  ctx.fillStyle = innerGlow;
  ctx.fill();

  // Glass panel border: prominent champagne-gold outline
  ctx.strokeStyle = 'rgba(246, 213, 138, 0.95)';
  ctx.lineWidth = 3.0;
  ctx.stroke();

  // Inner hairline accent
  const innerPad = 12;
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(padX + innerPad, padY + innerPad, panelW - innerPad * 2, panelH - innerPad * 2, r - 6);
  } else if (typeof ctx.rect === 'function') {
    ctx.rect(padX + innerPad, padY + innerPad, panelW - innerPad * 2, panelH - innerPad * 2);
  }
  ctx.strokeStyle = 'rgba(255, 248, 242, 0.40)';
  ctx.lineWidth = 1.2;
  ctx.stroke();

  // 3. Four Corner Celestial Accents
  const cornerPad = innerPad + 10;
  const corners = [
    [padX + cornerPad, padY + cornerPad],
    [padX + panelW - cornerPad, padY + cornerPad],
    [padX + cornerPad, padY + panelH - cornerPad],
    [padX + panelW - cornerPad, padY + panelH - cornerPad],
  ];
  for (const [cx, cy] of corners) {
    drawFourPointStar(ctx, cx, cy, 9, 3.0, UNLOCK_UI_PALETTE.PEARL_WHITE, UNLOCK_UI_PALETTE.SOFT_CHAMPAGNE);
  }

  // 4. Achievement Icon (above title)
  const iconY = padY + Math.round(panelH * 0.13);
  // Central four-point celestial sparkle
  drawFourPointStar(ctx, w / 2, iconY, 30, 7.5, UNLOCK_UI_PALETTE.PEARL_WHITE, UNLOCK_UI_PALETTE.WARM_GOLD);

  // Subtle concentric orbital arc ring around the star
  ctx.beginPath();
  ctx.arc(w / 2, iconY, 42, -Math.PI * 0.85, Math.PI * 0.85);
  ctx.strokeStyle = 'rgba(246, 213, 138, 0.45)';
  ctx.lineWidth = 1.4;
  ctx.stroke();

  // Flanking small stars and gradient lines
  const lineSpan = 110;
  for (const side of [-1, 1]) {
    const lx1 = w / 2 + side * 56;
    const lx2 = w / 2 + side * (56 + lineSpan);
    const lineGrad = ctx.createLinearGradient(lx1, iconY, lx2, iconY);
    lineGrad.addColorStop(0.0, 'rgba(246, 213, 138, 0.65)');
    lineGrad.addColorStop(1.0, 'rgba(246, 213, 138, 0.0)');
    ctx.beginPath();
    ctx.moveTo(lx1, iconY);
    ctx.lineTo(lx2, iconY);
    ctx.strokeStyle = lineGrad;
    ctx.lineWidth = 1.3;
    ctx.stroke();

    drawFourPointStar(ctx, w / 2 + side * 108, iconY, 7, 2.5, UNLOCK_UI_PALETTE.PEARL_WHITE, UNLOCK_UI_PALETTE.SOFT_CHAMPAGNE);
  }

  // 5. Main Title: "PLANET AWAKENED"
  const title = stageInfo?.title || 'PLANET AWAKENED';
  ctx.font = 'bold 54px "Cinzel", "Georgia", "Times New Roman", serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Title glow in warm gold
  ctx.shadowColor = UNLOCK_UI_PALETTE.WARM_GOLD;
  ctx.shadowBlur = 18;
  ctx.fillStyle = UNLOCK_UI_PALETTE.PEARL_WHITE;
  ctx.fillText(title, w / 2, padY + Math.round(panelH * 0.30));
  ctx.shadowBlur = 0;

  // 6. Delicate Golden Divider with center sparkle
  const divY = padY + Math.round(panelH * 0.41);
  const divSpan = 320;
  for (const side of [-1, 1]) {
    const dx1 = w / 2 + side * 18;
    const dx2 = w / 2 + side * (18 + divSpan / 2);
    const dGrad = ctx.createLinearGradient(dx1, divY, dx2, divY);
    dGrad.addColorStop(0.0, 'rgba(246, 213, 138, 0.85)');
    dGrad.addColorStop(1.0, 'rgba(246, 213, 138, 0.0)');
    ctx.beginPath();
    ctx.moveTo(dx1, divY);
    ctx.lineTo(dx2, divY);
    ctx.strokeStyle = dGrad;
    ctx.lineWidth = 1.4;
    ctx.stroke();
  }
  drawFourPointStar(ctx, w / 2, divY, 8, 3.0, UNLOCK_UI_PALETTE.WARM_GOLD, UNLOCK_UI_PALETTE.SOFT_CHAMPAGNE);

  // 7. Stage Label: "STAGE II"
  const stageLabel = stageInfo?.stageLabel || 'STAGE II';
  ctx.font = '600 28px "Cinzel", "Georgia", "Times New Roman", sans-serif';
  ctx.shadowColor = 'rgba(203, 183, 246, 0.9)';
  ctx.shadowBlur = 12;
  ctx.fillStyle = '#D6C7FF';
  renderSpacedText(ctx, stageLabel, w / 2, padY + Math.round(panelH * 0.52), 8);
  ctx.shadowBlur = 0;

  // 8. Subtitle: "AWAKENED MINERAL WORLD"
  const subtitle = stageInfo?.subtitle || 'AWAKENED MINERAL WORLD';
  ctx.font = '500 36px "Cinzel", "Georgia", "Times New Roman", serif';
  ctx.shadowColor = 'rgba(246, 213, 138, 0.85)';
  ctx.shadowBlur = 16;
  ctx.fillStyle = UNLOCK_UI_PALETTE.SOFT_CHAMPAGNE;
  renderSpacedText(ctx, subtitle, w / 2, padY + Math.round(panelH * 0.65), 5);
  ctx.shadowBlur = 0;

  // 9. Bottom Sigil Motif: ◌  ✧  ◌
  const botY = padY + panelH - 72;
  // Center sparkle
  drawFourPointStar(ctx, w / 2, botY, 13, 4.0, UNLOCK_UI_PALETTE.PEARL_WHITE, UNLOCK_UI_PALETTE.WARM_GOLD);

  // Flanking celestial circles (◌)
  for (const side of [-1, 1]) {
    const circleX = w / 2 + side * 50;
    ctx.beginPath();
    ctx.arc(circleX, botY, 6.5, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(203, 183, 246, 0.75)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Subtle hairline
    const hx1 = w / 2 + side * 70;
    const hx2 = w / 2 + side * 140;
    const hGrad = ctx.createLinearGradient(hx1, botY, hx2, botY);
    hGrad.addColorStop(0.0, 'rgba(203, 183, 246, 0.45)');
    hGrad.addColorStop(1.0, 'rgba(203, 183, 246, 0.0)');
    ctx.beginPath();
    ctx.moveTo(hx1, botY);
    ctx.lineTo(hx2, botY);
    ctx.strokeStyle = hGrad;
    ctx.lineWidth = 1.1;
    ctx.stroke();
  }

  ctx.restore();
}

/**
 * Creates or updates an HTML CanvasTexture for the specified stage unlock.
 * Safely falls back to a mock/dummy texture in headless or test environments.
 *
 * @param {Object} stageInfo
 * @returns {any} CanvasTexture or mock texture
 */
export function createUnlockCardTexture(stageInfo) {
  if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
    const canvas = document.createElement('canvas');
    canvas.width = 1280;
    canvas.height = 874;
    drawCelestialPlaque(canvas, stageInfo);
    const texture = new CanvasTexture(canvas);
    texture.generateMipmaps = false;
    texture.needsUpdate = true;
    return texture;
  }

  // Headless / Node test runner fallback
  return {
    isTexture: true,
    image: { width: 1280, height: 874 },
    generateMipmaps: false,
    needsUpdate: false,
    dispose: () => {},
  };
}

// ============================================================================
// 4. MAIN PLANET UNLOCK UI CONTROLLER
// ============================================================================

export class PlanetUnlockUI {
  /**
   * @param {Object} [options={}]
   * @param {any} [options.eventBus=defaultEventBus] - Authoritative EventBus instance
   * @param {any} [options.planetoidRenderer=null] - PlanetoidRenderer reference for anchor resolution
   * @param {any} [options.parentGroup=null] - Parent Three.js group/scene to attach the UI
   * @param {Object} [options.durations] - Optional custom phase durations
   * @param {boolean} [options.exposeGlobal=true] - Whether to expose window.planetUnlockUI
   */
  constructor(options = {}) {
    this.eventBus = options.eventBus !== undefined ? options.eventBus : defaultEventBus;
    this.planetoidRenderer = options.planetoidRenderer || null;
    this.parentGroup = options.parentGroup || null;

    this.state = UnlockUIState.IDLE;
    this.phase = UnlockUIPhase.IDLE;
    this.isShowing = false;
    this.elapsedTime = 0.0;
    this.progress = 0.0;
    this.activeStage = 2;
    this.stageInfo = STAGE_UNLOCKS[2];

    // Phase durations
    this.durations = {
      ...DEFAULT_UNLOCK_DURATIONS,
      ...(options.durations || {}),
    };

    const dDelay = this.durations[UnlockUIPhase.DELAY];
    const dArrival = this.durations[UnlockUIPhase.ARRIVAL];
    const dTitle = this.durations[UnlockUIPhase.TITLE_REVEAL];
    const dStage = this.durations[UnlockUIPhase.STAGE_REVEAL];
    const dShimmer = this.durations[UnlockUIPhase.SHIMMER];

    this._tDelayEnd = dDelay;
    this._tArrivalEnd = this._tDelayEnd + dArrival;
    this._tTitleEnd = this._tArrivalEnd + dTitle;
    this._tStageEnd = this._tTitleEnd + dStage;
    this._tShimmerEnd = this._tStageEnd + dShimmer;
    this.totalDuration = this._tShimmerEnd;

    // Anchor position in 3D world space
    this.anchorPosition = new Vector3(
      UNLOCK_UI_DEFAULT_ANCHOR.x,
      UNLOCK_UI_DEFAULT_ANCHOR.y,
      UNLOCK_UI_DEFAULT_ANCHOR.z
    );

    // Cached vectors for zero-allocation accessors
    this._cachedWorldPos = new Vector3();
    this._cachedWorldScale = new Vector3();
    this._cachedCamPos = new Vector3();

    // Three.js scene objects
    this.group = new Group();
    this.group.name = 'celestial-planet-unlock-ui';
    this.group.visible = false;
    this.group.position.copy(this.anchorPosition);

    // Initial texture & material
    this.texture = createUnlockCardTexture(this.stageInfo);
    this.geometry = new PlaneGeometry(UNLOCK_UI_DEFAULT_WIDTH, UNLOCK_UI_DEFAULT_HEIGHT);
    this.material = new ShaderMaterial({
      vertexShader: PLANET_UNLOCK_VERTEX_SHADER,
      fragmentShader: PLANET_UNLOCK_FRAGMENT_SHADER,
      uniforms: {
        uMap: { value: this.texture },
        uOpacity: { value: 0.0 },
        uShimmerProgress: { value: -0.5 },
        uShimmerColor: { value: new Color(UNLOCK_UI_PALETTE.SOFT_CHAMPAGNE) },
      },
      transparent: true,
      depthWrite: false,
      depthTest: true,
      side: DoubleSide,
    });

    this.mesh = new Mesh(this.geometry, this.material);
    this.mesh.name = 'planet-unlock-card-mesh';
    this.mesh.renderOrder = 999;
    this.group.renderOrder = 999;
    this.group.add(this.mesh);

    // Attach to parent group if provided
    if (this.parentGroup && typeof this.parentGroup.add === 'function') {
      this.parentGroup.add(this.group);
    }

    // Subscribe to authoritative Events.TRANSFORMATION_COMPLETED if autoSubscribe is enabled
    this._unsubscribeCompleted = null;
    const shouldAutoSubscribe = options.autoSubscribe !== false;
    if (shouldAutoSubscribe && this.eventBus && typeof this.eventBus.on === 'function') {
      this._unsubscribeCompleted = this.eventBus.on(
        Events.TRANSFORMATION_COMPLETED,
        (payload) => this._onTransformationCompleted(payload)
      );
    }

    // Subscribe to Events.TRANSFORMATION_STARTED to automatically dismiss card when next stage begins
    this._unsubscribeStarted = null;
    if (this.eventBus && typeof this.eventBus.on === 'function') {
      this._unsubscribeStarted = this.eventBus.on(
        Events.TRANSFORMATION_STARTED,
        () => this.hide()
      );
    }

    // Expose public development debug API
    if (options.exposeGlobal !== false) {
      const globalScope = typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null);
      if (globalScope) {
        globalScope.planetUnlockUI = {
          showStage: (stage = 2) => this.show(stage),
          show: (stage = 2) => this.show(stage),
          hide: () => this.hide(),
          isVisible: () => this.isVisible(),
          getState: () => this.getState(),
          getPhase: () => this.getPhase(),
          getProgress: () => this.getProgress(),
          getDebugInfo: () => this.getDebugInfo(),
          getWorldPosition: () => this.getWorldPosition(),
          getWorldScale: () => this.getWorldScale(),
          debugForceVisible: (stage = 2) => this.debugForceVisible(stage),
          reset: () => this.hide(),
        };
      }
    }
  }

  // ==========================================================================
  // 5. PUBLIC ACCESSORS & LIFECYCLE
  // ==========================================================================

  /**
   * Sets the PlanetoidRenderer reference for automatic anchor alignment.
   * @param {any} renderer
   */
  setPlanetoidRenderer(renderer) {
    this.planetoidRenderer = renderer || null;
  }

  /**
   * Sets or updates the parent Three.js group.
   * @param {any} parent
   */
  setParentGroup(parent) {
    if (this.group.parent && typeof this.group.parent.remove === 'function') {
      this.group.parent.remove(this.group);
    }
    this.parentGroup = parent || null;
    if (this.parentGroup && typeof this.parentGroup.add === 'function') {
      this.parentGroup.add(this.group);
    }
  }

  /**
   * Updates the 3D anchor position of the floating UI.
   * @param {number} x
   * @param {number} y
   * @param {number} z
   */
  setAnchorPosition(x, y, z) {
    if (typeof x === 'number' && typeof y === 'number' && typeof z === 'number') {
      this.anchorPosition.set(x, y, z);
      this.group.position.copy(this.anchorPosition);
    }
  }

  /**
   * Returns current anchor position vector.
   * @returns {Vector3}
   */
  getAnchorPosition() {
    return this.anchorPosition;
  }

  /**
   * Returns current high-level state ('idle' | 'showing' | 'complete' | 'destroyed').
   * @returns {string}
   */
  getState() {
    return this.state;
  }

  /**
   * Returns current choreography phase ('idle' | 'delay' | 'arrival' | 'title_reveal' | 'stage_reveal' | 'shimmer' | 'exit' | 'complete').
   * @returns {string}
   */
  getPhase() {
    return this.phase;
  }

  /**
   * Returns current normalized animation progress [0.0 .. 1.0].
   * @returns {number}
   */
  getProgress() {
    return this.progress;
  }

  /**
   * Returns whether the UI card is currently active and visible in the scene.
   * @returns {boolean}
   */
  isVisible() {
    return Boolean(
      this.group?.visible &&
      (this.state === UnlockUIState.SHOWING || this.state === UnlockUIState.HOLDING)
    );
  }

  /**
   * Returns complete diagnostic state of the unlock card for runtime verification.
   * @returns {Object}
   */
  getDebugInfo() {
    const worldPos = new Vector3();
    const worldScl = new Vector3();
    if (this.mesh) {
      this.mesh.getWorldPosition(worldPos);
      this.mesh.getWorldScale(worldScl);
    }
    return {
      state: this.state,
      phase: this.phase,
      visible: this.isVisible(),
      opacity: this.material?.uniforms?.uOpacity?.value ?? 0.0,
      worldPosition: [worldPos.x, worldPos.y, worldPos.z],
      localPosition: [this.group.position.x, this.group.position.y, this.group.position.z],
      worldScale: [worldScl.x, worldScl.y, worldScl.z],
      groupVisible: Boolean(this.group?.visible),
      meshVisible: Boolean(this.mesh?.visible),
      renderOrder: this.mesh?.renderOrder ?? 0,
      materialOpacity: this.material?.uniforms?.uOpacity?.value ?? 0.0,
      materialTransparent: Boolean(this.material?.transparent),
      materialDepthTest: Boolean(this.material?.depthTest),
      materialDepthWrite: Boolean(this.material?.depthWrite),
      materialSide: this.material?.side ?? 0,
      parentName: this.group?.parent?.name ?? 'none',
    };
  }

  /**
   * Returns current world position of the card mesh (cached, zero allocations).
   * @returns {Vector3}
   */
  getWorldPosition() {
    if (this.mesh) {
      this.mesh.getWorldPosition(this._cachedWorldPos);
    }
    return this._cachedWorldPos;
  }

  /**
   * Returns current world scale of the card mesh (cached, zero allocations).
   * @returns {Vector3}
   */
  getWorldScale() {
    if (this.mesh) {
      this.mesh.getWorldScale(this._cachedWorldScale);
    }
    return this._cachedWorldScale;
  }

  // ==========================================================================
  // 6. SHOW & HIDE PRESENTATION
  // ==========================================================================

  /**
   * Alias for show(stage) matching the requested debug contract.
   * @param {number} [stage=2]
   * @returns {boolean} True if presentation was started
   */
  showStage(stage = 2) {
    return this.show(stage);
  }

  /**
   * Forces the unlock card to be immediately visible in HOLDING state at the calibrated location.
   * Bypasses the celebration and delay/arrival phases for rapid visual tuning and runtime verification.
   * @param {number} [stage=2]
   * @returns {boolean} True if presentation was forced visible
   */
  debugForceVisible(stage = 2) {
    if (this.state === UnlockUIState.DESTROYED) {
      return false;
    }

    const stageNum = (typeof stage === 'number' && Number.isFinite(stage)) ? Math.round(stage) : 2;
    const stageInfo = STAGE_UNLOCKS[stageNum] || STAGE_UNLOCKS[2];
    this.activeStage = stageNum;
    this.stageInfo = stageInfo;

    // Align anchor and camera orientation
    this._updateAnchorAndOrientation();

    // Update texture for requested stage
    this._updateTextureForStage(stageInfo);

    // Set state directly to sustained HOLDING
    this.isShowing = true;
    this.state = UnlockUIState.HOLDING;
    this.phase = UnlockUIPhase.HOLD;
    this.elapsedTime = this.totalDuration + 0.1;
    this.progress = 1.0;

    // Ensure scene objects are visible with full opacity
    this.group.visible = true;
    if (this.mesh) {
      this.mesh.visible = true;
      this.mesh.scale.set(1.0, 1.0, 1.0);
      this.mesh.position.set(0, 0, 0);
    }
    if (this.material?.uniforms?.uOpacity) {
      this.material.uniforms.uOpacity.value = 1.0;
    }
    if (this.material?.uniforms?.uShimmerProgress) {
      this.material.uniforms.uShimmerProgress.value = 1.2;
    }

    return true;
  }

  /**
   * Synchronizes the 3D anchor position and orientation facing the player camera.
   * Calibrated gameplay placement:
   * - X: +0.78m beside planet center (calibrated around requested +0.75m)
   * - Y: planetAnchor.y - 0.05m (centered vertically with planet)
   * - Z: planetAnchor.z + planetRadius + 0.08m (safely in front of the planet depth volume)
   * - Rotation: Yaw angle facing active gameplay camera
   * Zero per-frame allocations.
   * @private
   */
  _updateAnchorAndOrientation() {
    let pAnchorX = UNLOCK_UI_DEFAULT_ANCHOR.x;
    let pAnchorY = UNLOCK_UI_DEFAULT_ANCHOR.y;
    let pAnchorZ = UNLOCK_UI_DEFAULT_ANCHOR.z;

    if (this.planetoidRenderer && typeof this.planetoidRenderer.getAnchorPosition === 'function') {
      const pAnchor = this.planetoidRenderer.getAnchorPosition();
      if (pAnchor && typeof pAnchor.x === 'number') {
        const planetScale = (typeof this.planetoidRenderer.getScale === 'function')
          ? this.planetoidRenderer.getScale()
          : (this.planetoidRenderer.scaleFactor ?? 17.0);
        const planetRadius = planetScale * (this.planetoidRenderer.radius ?? 0.035);

        const sideOffsetX = 0.78;
        const verticalOffsetY = -0.05;
        const forwardOffset = planetRadius + 0.08;

        pAnchorX = pAnchor.x + sideOffsetX;
        pAnchorY = pAnchor.y + verticalOffsetY;
        pAnchorZ = pAnchor.z + forwardOffset;
      }
    }

    this.setAnchorPosition(pAnchorX, pAnchorY, pAnchorZ);

    // Yaw rotation facing active camera
    let camX = 0.0;
    let camY = 1.60;
    let camZ = 1.0;

    const globalScope = typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null);
    const worldCamera = globalScope?.celestialEnvironment?.world?.camera;
    if (worldCamera && typeof worldCamera.getWorldPosition === 'function') {
      worldCamera.getWorldPosition(this._cachedCamPos);
      if (this._cachedCamPos.lengthSq() > 0.01) {
        camX = this._cachedCamPos.x;
        camY = this._cachedCamPos.y;
        camZ = this._cachedCamPos.z;
      }
    }

    const dx = camX - pAnchorX;
    const dz = camZ - pAnchorZ;
    const yawAngle = Math.atan2(dx, dz);
    this.group.rotation.set(0.0, yawAngle, 0.0);
  }

  /**
   * Initiates the achievement card presentation for a given planetary stage.
   * Prevents duplicate triggers if an animation is already active.
   *
   * @param {number} [stage=2]
   * @returns {boolean} True if presentation started, false if blocked or duplicate
   */
  show(stage = 2) {
    if (this.state === UnlockUIState.DESTROYED) {
      return false;
    }
    // Prevent duplicate triggers if already showing
    if (this.isShowing) {
      return false;
    }

    const stageNum = (typeof stage === 'number' && Number.isFinite(stage)) ? Math.round(stage) : 2;
    const stageInfo = STAGE_UNLOCKS[stageNum] || STAGE_UNLOCKS[2];
    this.activeStage = stageNum;
    this.stageInfo = stageInfo;

    // Synchronize anchor and camera-facing orientation
    this._updateAnchorAndOrientation();

    // Update texture for the requested stage
    this._updateTextureForStage(stageInfo);

    // Initialize animation properties
    this.isShowing = true;
    this.state = UnlockUIState.SHOWING;
    this.phase = UnlockUIPhase.DELAY;
    this.elapsedTime = 0.0;
    this.progress = 0.0;

    // Reset Three.js mesh transforms and uniforms
    this.group.visible = true;
    if (this.mesh) {
      this.mesh.visible = true;
      this.mesh.scale.set(0.92, 0.92, 0.92);
      this.mesh.position.set(0, -0.03, 0);
    }
    if (this.material?.uniforms?.uOpacity) {
      this.material.uniforms.uOpacity.value = 0.0;
    }
    if (this.material?.uniforms?.uShimmerProgress) {
      this.material.uniforms.uShimmerProgress.value = -0.5;
    }

    return true;
  }

  /**
   * Immediately hides the UI card and returns to IDLE.
   */
  hide() {
    if (this.state === UnlockUIState.DESTROYED) {
      return;
    }
    this.isShowing = false;
    this.state = UnlockUIState.IDLE;
    this.phase = UnlockUIPhase.IDLE;
    this.elapsedTime = 0.0;
    this.progress = 0.0;

    if (this.group) {
      this.group.visible = false;
    }
    if (this.material?.uniforms?.uOpacity) {
      this.material.uniforms.uOpacity.value = 0.0;
    }
    if (this.material?.uniforms?.uShimmerProgress) {
      this.material.uniforms.uShimmerProgress.value = -0.5;
    }
    if (this.mesh) {
      this.mesh.visible = false;
      this.mesh.scale.set(1.0, 1.0, 1.0);
      this.mesh.position.set(0, 0, 0);
    }
  }

  // ==========================================================================
  // 7. FRAME UPDATE & CHOREOGRAPHY PHASES
  // ==========================================================================

  /**
   * Frame tick advancing the unlock animation sequence.
   * @param {number} dt - Frame delta time in seconds
   */
  update(dt) {
    if (!this.isShowing || (this.state !== UnlockUIState.SHOWING && this.state !== UnlockUIState.HOLDING)) {
      return;
    }
    if (typeof dt !== 'number' || !Number.isFinite(dt) || dt <= 0) {
      return;
    }

    this.elapsedTime += dt;
    this.progress = Math.min(1.0, this.elapsedTime / this.totalDuration);

    const t = this.elapsedTime;
    const prevPhase = this.phase;

    if (t < this._tDelayEnd) {
      // Phase: DELAY (brief settling moment before appearance)
      this.phase = UnlockUIPhase.DELAY;
      if (this.material?.uniforms?.uOpacity) {
        this.material.uniforms.uOpacity.value = 0.0;
      }
      this.mesh.scale.set(0.92, 0.92, 0.92);
      this.mesh.position.set(0, -0.03, 0);
    } else if (t < this._tArrivalEnd) {
      // Phase A: ARRIVAL (opacity 0->1, scale 0.92->1.0, gentle upward ease-out)
      this.phase = UnlockUIPhase.ARRIVAL;
      const subP = (t - this._tDelayEnd) / (this._tArrivalEnd - this._tDelayEnd);
      // Cubic ease-out
      const ease = 1.0 - Math.pow(1.0 - subP, 3.0);
      const opacity = ease;
      const scale = 0.92 + ease * (1.0 - 0.92);
      const posY = -0.03 * (1.0 - ease);

      if (this.material?.uniforms?.uOpacity) {
        this.material.uniforms.uOpacity.value = opacity;
      }
      this.mesh.scale.set(scale, scale, scale);
      this.mesh.position.set(0, posY, 0);
    } else if (t < this._tTitleEnd) {
      // Phase B: TITLE_REVEAL (fully arrived, title illumination)
      this.phase = UnlockUIPhase.TITLE_REVEAL;
      if (this.material?.uniforms?.uOpacity) {
        this.material.uniforms.uOpacity.value = 1.0;
      }
      this.mesh.scale.set(1.0, 1.0, 1.0);
      this.mesh.position.set(0, 0, 0);
    } else if (t < this._tStageEnd) {
      // Phase C: STAGE_REVEAL (stage & subtitle sustained)
      this.phase = UnlockUIPhase.STAGE_REVEAL;
      if (this.material?.uniforms?.uOpacity) {
        this.material.uniforms.uOpacity.value = 1.0;
      }
      this.mesh.scale.set(1.0, 1.0, 1.0);
      this.mesh.position.set(0, 0, 0);
    } else if (t < this._tShimmerEnd) {
      // Phase D: SHIMMER (soft diagonal champagne-gold shimmer sweeps across the plaque)
      this.phase = UnlockUIPhase.SHIMMER;
      const subP = (t - this._tStageEnd) / (this._tShimmerEnd - this._tStageEnd);
      // Sweep shimmer coordinate from -0.2 to 1.2
      const shimmerCoord = -0.2 + subP * 1.4;

      if (this.material?.uniforms?.uOpacity) {
        this.material.uniforms.uOpacity.value = 1.0;
      }
      if (this.material?.uniforms?.uShimmerProgress) {
        this.material.uniforms.uShimmerProgress.value = shimmerCoord;
      }
      this.mesh.scale.set(1.0, 1.0, 1.0);
      this.mesh.position.set(0, 0, 0);
    } else {
      // Phase: HOLD (sustained holding state - remains visible indefinitely until next transformation)
      this.phase = UnlockUIPhase.HOLD;
      this.state = UnlockUIState.HOLDING;
      if (this.material?.uniforms?.uOpacity) {
        this.material.uniforms.uOpacity.value = 1.0;
      }
      if (this.material?.uniforms?.uShimmerProgress) {
        this.material.uniforms.uShimmerProgress.value = 1.2;
      }
      this.mesh.scale.set(1.0, 1.0, 1.0);
      this.mesh.position.set(0, 0, 0);
    }
  }

  // ==========================================================================
  // 8. EVENT INTEGRATION & INTERNAL HELPERS
  // ==========================================================================

  /**
   * Internal handler for Events.TRANSFORMATION_COMPLETED.
   * @param {Object} payload - { previousStage, newStage }
   * @private
   */
  _onTransformationCompleted(payload) {
    const targetStage = payload?.newStage ?? 2;
    this.show(targetStage);
  }

  /**
   * Finalizes the presentation upon reaching 100% progress.
   * @private
   */
  _finish() {
    this.isShowing = false;
    this.state = UnlockUIState.COMPLETE;
    this.phase = UnlockUIPhase.COMPLETE;
    this.group.visible = false;

    if (this.material?.uniforms?.uOpacity) {
      this.material.uniforms.uOpacity.value = 0.0;
    }
    if (this.material?.uniforms?.uShimmerProgress) {
      this.material.uniforms.uShimmerProgress.value = -0.5;
    }
    this.mesh.scale.set(1.0, 1.0, 1.0);
    this.mesh.position.set(0, 0, 0);
  }

  /**
   * Updates or re-renders the canvas texture for the specified stage metadata.
   * Guarantees exact 1280x874 resolution matching initial texture geometry aspect ratio.
   * Reuses existing HTML canvas whenever available to avoid runtime memory allocations.
   * @param {Object} stageInfo
   * @private
   */
  _updateTextureForStage(stageInfo) {
    if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
      let canvas = (this.texture && this.texture.image && this.texture.image.width === 1280 && this.texture.image.height === 874)
        ? this.texture.image
        : null;
      if (!canvas) {
        canvas = document.createElement('canvas');
        canvas.width = 1280;
        canvas.height = 874;
      }
      drawCelestialPlaque(canvas, stageInfo);

      if (this.texture && this.texture.image) {
        this.texture.image = canvas;
        this.texture.needsUpdate = true;
      } else {
        if (this.texture && typeof this.texture.dispose === 'function') {
          this.texture.dispose();
        }
        this.texture = new CanvasTexture(canvas);
        this.texture.generateMipmaps = false;
        this.texture.needsUpdate = true;
        if (this.material?.uniforms?.uMap) {
          this.material.uniforms.uMap.value = this.texture;
        }
      }
    }
  }

  // ==========================================================================
  // 9. CLEANUP & DESTRUCTION
  // ==========================================================================

  /**
   * Cleans up EventBus subscriptions, disposes geometries/materials/textures,
   * removes meshes from parent group, and prevents dangling references.
   */
  destroy() {
    this.hide();
    this.state = UnlockUIState.DESTROYED;

    // Unsubscribe EventBus listeners
    if (this._unsubscribeCompleted) {
      this._unsubscribeCompleted();
      this._unsubscribeCompleted = null;
    }
    if (this._unsubscribeStarted) {
      this._unsubscribeStarted();
      this._unsubscribeStarted = null;
    }

    // Remove from scene / parent
    if (this.group.parent && typeof this.group.parent.remove === 'function') {
      this.group.parent.remove(this.group);
    }

    // Dispose Three.js resources
    if (this.geometry && typeof this.geometry.dispose === 'function') {
      this.geometry.dispose();
      this.geometry = null;
    }
    if (this.material && typeof this.material.dispose === 'function') {
      this.material.dispose();
      this.material = null;
    }
    if (this.texture && typeof this.texture.dispose === 'function') {
      this.texture.dispose();
      this.texture = null;
    }
    if (this.mesh) {
      this.group.remove(this.mesh);
      this.mesh = null;
    }

    // Remove debug global if attached
    const globalScope = typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null);
    if (globalScope && globalScope.planetUnlockUI) {
      delete globalScope.planetUnlockUI;
    }
  }
}
