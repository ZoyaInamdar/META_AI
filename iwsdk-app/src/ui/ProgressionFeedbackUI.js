/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * ============================================================================
 * Celestial Kendama - ProgressionFeedbackUI
 * Subsystem: Player Progression Feedback, Score Toast & Chapter Announcements
 * ============================================================================
 *
 * Responsibilities:
 * 1. Minimal, immersive player-facing feedback layer:
 *    - Feature 1 (Catch Energy Feedback): Short-lived floating world-space toast
 *      near the Kendama displaying CLEAN/ASSISTED catch feedback and awarded energy.
 *    - Feature 2 (Persistent Energy Progress): Compact, non-intrusive HUD below
 *      the Kendama displaying current stage, energy progress, and milestone threshold.
 *    - Feature 3 (Chapter Announcement): World-space celestial plaque announcing
 *      chapter advancements and active narrative objectives (including Chapter 5 Supernova Deflection).
 * 2. Strict architectural boundary:
 *    - Pure presentation layer: does NOT recalculate score or energy, does NOT modify
 *      progression thresholds, does NOT trigger chapter gates, and does NOT alter locked visuals.
 * 3. Consumes existing canonical events:
 *    - Events.SCORE: extracts awardedEnergy, catchType (CLEAN vs ASSISTED)
 *    - Events.EVOLUTION_PROGRESS: extracts currentStage, targetStage, evolutionEnergy, evolutionProgress
 *    - Events.ORRERY_CHAPTER_CHANGED: extracts active chapter for announcements
 * 4. Quest-friendly performance:
 *    - Zero per-frame allocations
 *    - Preallocated PlaneGeometries and MeshBasicMaterials with transparent CanvasTextures
 *    - Canvas redraws executed ONLY on state changes, never per-frame
 *    - Reuses single preallocated meshes for toasts and announcements (no uncontrolled UI growth)
 */

import { Events } from '../contracts/Interfaces.js';
import { eventBus as defaultEventBus } from '../contracts/EventBus.js';
import {
  Group,
  Mesh,
  PlaneGeometry,
  MeshBasicMaterial,
  CanvasTexture,
  Vector3,
  DoubleSide,
} from 'three';

// ============================================================================
// 1. CANONICAL CONSTANTS & COLOR PALETTE
// ============================================================================

export const PROGRESSION_UI_PALETTE = Object.freeze({
  PEARL_WHITE: '#FFF8F2',
  SOFT_CHAMPAGNE: '#F6D58A',
  WARM_GOLD: '#E8B94F',
  PALE_ROSE: '#F4B8C8',
  SOFT_LILAC: '#CBB7F6',
  LAVENDER: '#AFA0E8',
  VERY_PALE_PINK: '#FFE4EC',
  DARK_GLASS_BASE: 'rgba(22, 16, 36, 0.88)',
  DARK_GLASS_TOP: 'rgba(28, 20, 42, 0.92)',
  PROGRESS_TRACK: 'rgba(255, 248, 242, 0.15)',
});

export const ROMAN_NUMERALS = Object.freeze({
  1: 'I',
  2: 'II',
  3: 'III',
  4: 'IV',
  5: 'V',
});

/**
 * Canonical planetary stage names displayed on persistent progression card.
 */
export const PLANET_STAGE_NAMES = Object.freeze({
  1: 'SEED',
  2: 'AWAKENING',
  3: 'OCEANS',
  4: 'LIFE & ATMOSPHERE',
  5: 'CELESTIAL ALIGNMENT',
});

/**
 * Canonical chapter announcement metadata aligned with NarrativeDirector CHAPTER_DEFINITIONS.
 */
export const CHAPTER_ANNOUNCEMENT_DATA = Object.freeze({
  1: Object.freeze({
    chapter: 1,
    roman: 'CHAPTER I',
    name: 'THREE-BODY CAPTURE',
    objective: 'Perform catches to initiate planetary capture burn',
  }),
  2: Object.freeze({
    chapter: 2,
    roman: 'CHAPTER II',
    name: 'BINARY RESONANCE',
    objective: 'Harmonize the binary system into stable resonance',
  }),
  3: Object.freeze({
    chapter: 3,
    roman: 'CHAPTER III',
    name: 'GRAVITY ASSIST',
    objective: 'Use the gravity well to reach the outer orbit',
  }),
  4: Object.freeze({
    chapter: 4,
    roman: 'CHAPTER IV',
    name: 'ROCHE DISRUPTION',
    objective: 'Guide the satellite through the Roche limit',
  }),
  5: Object.freeze({
    chapter: 5,
    roman: 'CHAPTER V',
    name: 'SUPERNOVA DEFLECTION',
    objective: 'Strike the celestial spike to deflect the supernova',
  }),
});

/**
 * Toast timing configuration (in seconds).
 */
export const TOAST_TIMING = Object.freeze({
  FADE_IN: 0.15,
  HOLD: 0.55,
  FADE_OUT: 0.40,
  TOTAL: 1.10,
  DRIFT_Y: 0.05,
});

/**
 * Chapter announcement timing configuration (in seconds).
 */
export const CHAPTER_TIMING = Object.freeze({
  FADE_IN: 0.40,
  HOLD: 3.40,
  FADE_OUT: 0.60,
  TOTAL: 4.40,
});

/**
 * Spatial positioning anchors (in meters relative to seated player at 0, 0, 0).
 */
export const UI_ANCHORS = Object.freeze({
  TOAST_DEFAULT_OFFSET: Object.freeze({ x: 0.0, y: 0.18, z: 0.02 }),
  PROGRESS_BAR_POS: Object.freeze({ x: 0.0, y: 1.05, z: -0.55 }),
  PROGRESS_BAR_ROT_X: -0.42, // ~24 degrees tilted toward eyes
  CHAPTER_PLAQUE_POS: Object.freeze({ x: 0.0, y: 1.58, z: -1.25 }),
});

// ============================================================================
// 2. PROCEDURAL CANVAS DRAWING HELPERS
// ============================================================================

/**
 * Draws a 4-point celestial sparkle star on a canvas context.
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
 * Draws a rounded rectangle path with environment compatibility fallback.
 */
function drawRoundRect(ctx, x, y, width, height, radius) {
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, width, height, radius);
  } else if (typeof ctx.rect === 'function') {
    ctx.rect(x, y, width, height);
  }
}

/**
 * Renders the catch energy toast onto a 2D canvas.
 * @param {HTMLCanvasElement} canvas
 * @param {string} catchLabel - 'CLEAN CATCH', 'ASSISTED', etc.
 * @param {number} awardedEnergy - Energy awarded by ScoreManager
 * @param {boolean} isAssisted - Whether assist was active
 */
export function drawCatchToast(canvas, catchLabel, awardedEnergy, isAssisted) {
  if (!canvas || typeof canvas.getContext !== 'function') return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  // 1. Pill Background
  const padX = 14;
  const padY = 10;
  const panelW = w - padX * 2;
  const panelH = h - padY * 2;
  const r = 24;

  ctx.save();
  ctx.beginPath();
  drawRoundRect(ctx, padX, padY, panelW, panelH, r);

  const glassGrad = ctx.createLinearGradient(w / 2, padY, w / 2, padY + panelH);
  glassGrad.addColorStop(0.0, 'rgba(28, 20, 42, 0.92)');
  glassGrad.addColorStop(1.0, 'rgba(20, 14, 32, 0.95)');
  ctx.fillStyle = glassGrad;
  ctx.fill();

  // Border: champagne for clean, softer rose/champagne for assisted
  ctx.strokeStyle = isAssisted ? 'rgba(244, 184, 200, 0.85)' : 'rgba(246, 213, 138, 0.95)';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Subtle inner accent line
  const innerPad = 6;
  ctx.beginPath();
  drawRoundRect(ctx, padX + innerPad, padY + innerPad, panelW - innerPad * 2, panelH - innerPad * 2, r - 4);
  ctx.strokeStyle = 'rgba(255, 248, 242, 0.28)';
  ctx.lineWidth = 1.0;
  ctx.stroke();

  // 2. Corner Sparkles
  drawFourPointStar(ctx, padX + 22, h / 2, 8, 2.5, PROGRESSION_UI_PALETTE.PEARL_WHITE, PROGRESSION_UI_PALETTE.SOFT_CHAMPAGNE);
  drawFourPointStar(ctx, padX + panelW - 22, h / 2, 8, 2.5, PROGRESSION_UI_PALETTE.PEARL_WHITE, PROGRESSION_UI_PALETTE.SOFT_CHAMPAGNE);

  // 3. Text
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Catch Type Header
  ctx.font = 'bold 26px sans-serif';
  ctx.fillStyle = isAssisted ? PROGRESSION_UI_PALETTE.SOFT_CHAMPAGNE : PROGRESSION_UI_PALETTE.PEARL_WHITE;
  ctx.fillText(catchLabel, w / 2, padY + Math.round(panelH * 0.34));

  // Energy Amount Subtitle
  ctx.font = 'bold 36px sans-serif';
  ctx.fillStyle = PROGRESSION_UI_PALETTE.WARM_GOLD;
  ctx.shadowColor = 'rgba(246, 213, 138, 0.6)';
  ctx.shadowBlur = 8;
  ctx.fillText(`+${awardedEnergy} ENERGY`, w / 2, padY + Math.round(panelH * 0.72));
  ctx.shadowBlur = 0;

  ctx.restore();
}

/**
 * Renders the persistent energy progress bar onto a 2D canvas.
 * @param {HTMLCanvasElement} canvas
 * @param {number} currentEnergy - Current energy in stage
 * @param {number} energyRequired - Energy threshold for stage
 * @param {number} stageNumber - Current planetary stage (1..5)
 * @param {number} progress - Normalized progress [0.0 .. 1.0]
 */
export function drawEnergyProgressBar(canvas, currentEnergy, energyRequired, stageNumber, progress) {
  if (!canvas || typeof canvas.getContext !== 'function') return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const padX = 12;
  const padY = 8;
  const panelW = w - padX * 2;
  const panelH = h - padY * 2;
  const r = 18;

  ctx.save();
  ctx.beginPath();
  drawRoundRect(ctx, padX, padY, panelW, panelH, r);

  const bgGrad = ctx.createLinearGradient(w / 2, padY, w / 2, padY + panelH);
  bgGrad.addColorStop(0.0, 'rgba(28, 20, 42, 0.88)');
  bgGrad.addColorStop(1.0, 'rgba(18, 12, 28, 0.92)');
  ctx.fillStyle = bgGrad;
  ctx.fill();

  ctx.strokeStyle = 'rgba(246, 213, 138, 0.75)';
  ctx.lineWidth = 2.0;
  ctx.stroke();

  // Top Row: Stage Name (Left) and Energy Count (Right)
  const roman = ROMAN_NUMERALS[stageNumber] || String(stageNumber);
  const stageName = PLANET_STAGE_NAMES[stageNumber] || '';
  const stageText = stageName ? `STAGE ${roman}: ${stageName}` : `STAGE ${roman}`;
  ctx.font = 'bold 18px sans-serif';
  ctx.textBaseline = 'middle';

  ctx.textAlign = 'left';
  ctx.fillStyle = PROGRESSION_UI_PALETTE.PEARL_WHITE;
  ctx.fillText(stageText, padX + 20, padY + 24);

  ctx.textAlign = 'right';
  ctx.fillStyle = PROGRESSION_UI_PALETTE.SOFT_CHAMPAGNE;
  const curSafe = Math.round(Math.max(0, currentEnergy));
  const reqSafe = Math.round(Math.max(1, energyRequired));
  ctx.fillText(`${curSafe} / ${reqSafe}`, padX + panelW - 20, padY + 24);

  // Progress Bar Track
  const trackX = padX + 18;
  const trackY = padY + 44;
  const trackW = panelW - 36;
  const trackH = 16;
  const trackR = 8;

  ctx.beginPath();
  drawRoundRect(ctx, trackX, trackY, trackW, trackH, trackR);
  ctx.fillStyle = 'rgba(255, 248, 242, 0.12)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(246, 213, 138, 0.35)';
  ctx.lineWidth = 1.0;
  ctx.stroke();

  // Filled Portion
  const clampedProgress = Math.max(0.0, Math.min(1.0, progress));
  const fillW = Math.max(0, trackW * clampedProgress);
  if (fillW > 4) {
    ctx.beginPath();
    drawRoundRect(ctx, trackX, trackY, fillW, trackH, trackR);
    const fillGrad = ctx.createLinearGradient(trackX, trackY, trackX + fillW, trackY);
    fillGrad.addColorStop(0.0, PROGRESSION_UI_PALETTE.SOFT_CHAMPAGNE);
    fillGrad.addColorStop(1.0, PROGRESSION_UI_PALETTE.WARM_GOLD);
    ctx.fillStyle = fillGrad;
    ctx.fill();
  }

  // Bottom Label: Subtitle
  ctx.textAlign = 'center';
  ctx.font = '14px sans-serif';
  ctx.fillStyle = PROGRESSION_UI_PALETTE.SOFT_LILAC;
  ctx.fillText('CELESTIAL PROGRESSION', w / 2, padY + panelH - 12);

  ctx.restore();
}

/**
 * Renders the chapter announcement plaque onto a 2D canvas.
 * @param {HTMLCanvasElement} canvas
 * @param {Object} chapterData - { chapter, roman, name, objective }
 */
export function drawChapterPlaque(canvas, chapterData) {
  if (!canvas || typeof canvas.getContext !== 'function') return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const padX = 24;
  const padY = 20;
  const panelW = w - padX * 2;
  const panelH = h - padY * 2;
  const r = 32;

  ctx.save();

  // Outer Aura
  const aura = ctx.createRadialGradient(w / 2, h / 2, 40, w / 2, h / 2, w * 0.48);
  aura.addColorStop(0.0, 'rgba(246, 213, 138, 0.12)');
  aura.addColorStop(0.5, 'rgba(203, 183, 246, 0.08)');
  aura.addColorStop(1.0, 'rgba(255, 248, 242, 0.0)');
  ctx.fillStyle = aura;
  ctx.fillRect(0, 0, w, h);

  // Plaque Panel
  ctx.beginPath();
  drawRoundRect(ctx, padX, padY, panelW, panelH, r);
  const glassGrad = ctx.createLinearGradient(w / 2, padY, w / 2, padY + panelH);
  glassGrad.addColorStop(0.0, 'rgba(28, 20, 42, 0.94)');
  glassGrad.addColorStop(1.0, 'rgba(18, 12, 28, 0.96)');
  ctx.fillStyle = glassGrad;
  ctx.fill();

  ctx.strokeStyle = 'rgba(246, 213, 138, 0.95)';
  ctx.lineWidth = 3.0;
  ctx.stroke();

  // Inner Accent
  const innerPad = 10;
  ctx.beginPath();
  drawRoundRect(ctx, padX + innerPad, padY + innerPad, panelW - innerPad * 2, panelH - innerPad * 2, r - 6);
  ctx.strokeStyle = 'rgba(255, 248, 242, 0.35)';
  ctx.lineWidth = 1.2;
  ctx.stroke();

  // 4 Corner Stars
  const cornerPad = innerPad + 14;
  drawFourPointStar(ctx, padX + cornerPad, padY + cornerPad, 10, 3.2, PROGRESSION_UI_PALETTE.PEARL_WHITE, PROGRESSION_UI_PALETTE.SOFT_CHAMPAGNE);
  drawFourPointStar(ctx, padX + panelW - cornerPad, padY + cornerPad, 10, 3.2, PROGRESSION_UI_PALETTE.PEARL_WHITE, PROGRESSION_UI_PALETTE.SOFT_CHAMPAGNE);
  drawFourPointStar(ctx, padX + cornerPad, padY + panelH - cornerPad, 10, 3.2, PROGRESSION_UI_PALETTE.PEARL_WHITE, PROGRESSION_UI_PALETTE.SOFT_CHAMPAGNE);
  drawFourPointStar(ctx, padX + panelW - cornerPad, padY + panelH - cornerPad, 10, 3.2, PROGRESSION_UI_PALETTE.PEARL_WHITE, PROGRESSION_UI_PALETTE.SOFT_CHAMPAGNE);

  // Top Center Star
  drawFourPointStar(ctx, w / 2, padY + 45, 18, 5.0, PROGRESSION_UI_PALETTE.PEARL_WHITE, PROGRESSION_UI_PALETTE.WARM_GOLD);

  // Header: Roman Chapter
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 24px sans-serif';
  ctx.fillStyle = PROGRESSION_UI_PALETTE.SOFT_CHAMPAGNE;
  ctx.fillText(chapterData.roman || `CHAPTER ${chapterData.chapter}`, w / 2, padY + 95);

  // Main Title: Chapter Name
  ctx.font = 'bold 44px sans-serif';
  ctx.fillStyle = PROGRESSION_UI_PALETTE.PEARL_WHITE;
  ctx.shadowColor = 'rgba(246, 213, 138, 0.6)';
  ctx.shadowBlur = 12;
  ctx.fillText(chapterData.name || '', w / 2, padY + 160);
  ctx.shadowBlur = 0;

  // Thin Gold Divider
  ctx.beginPath();
  ctx.moveTo(w / 2 - 160, padY + 205);
  ctx.lineTo(w / 2 + 160, padY + 205);
  ctx.strokeStyle = 'rgba(246, 213, 138, 0.6)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  drawFourPointStar(ctx, w / 2, padY + 205, 6, 2.0, PROGRESSION_UI_PALETTE.PEARL_WHITE, PROGRESSION_UI_PALETTE.SOFT_CHAMPAGNE);

  // Story Objective / Subtitle
  ctx.font = 'italic 24px sans-serif';
  ctx.fillStyle = PROGRESSION_UI_PALETTE.SOFT_LILAC;
  ctx.fillText(chapterData.objective || '', w / 2, padY + 250);

  ctx.restore();
}

// ============================================================================
// 3. MAIN ProgressionFeedbackUI CLASS
// ============================================================================

export class ProgressionFeedbackUI {
  /**
   * @param {Object} [options={}]
   * @param {EventBus} [options.eventBus=defaultEventBus] - EventBus instance
   * @param {any} [options.parentGroup=null] - Scene or Group to attach to
   * @param {any} [options.kenGroup=null] - Canonical gameplayKenGroup for relative positioning
   * @param {any} [options.evolutionController=null] - PlanetEvolutionController reference
   * @param {any} [options.narrativeDirector=null] - NarrativeDirector reference
   * @param {boolean} [options.autoSubscribe=true] - Whether to wire EventBus listeners automatically
   */
  constructor(options = {}) {
    this.eventBus = options.eventBus !== undefined ? options.eventBus : defaultEventBus;
    this.parentGroup = options.parentGroup || null;
    this.kenGroup = options.kenGroup || null;
    this.evolutionController = options.evolutionController || null;
    this.narrativeDirector = options.narrativeDirector || null;

    // Root Group
    this.group = new Group();
    this.group.name = 'celestial-progression-feedback-ui';
    this.group.visible = false; // Hidden until activated in gameplay mode

    // State Tracking
    this.isVisibleState = false;
    this.currentStage = 1;
    this.currentEnergy = 0;
    this.energyRequired = 100;
    this.progress = 0.0;
    this.currentChapter = 1;

    // Toast Sub-element State
    this._toastActive = false;
    this._toastElapsedTime = 0.0;
    this._toastBasePos = new Vector3();

    // Chapter Announcement State
    this._chapterActive = false;
    this._chapterElapsedTime = 0.0;

    // Preallocated Three.js Objects (Zero per-frame allocations)
    this._initToastMesh();
    this._initProgressMesh();
    this._initChapterMesh();

    // Attach root to parent if provided
    if (this.parentGroup && typeof this.parentGroup.add === 'function') {
      this.parentGroup.add(this.group);
    }

    // Event Subscriptions
    this._unsubs = [];
    if (options.autoSubscribe !== false) {
      this.subscribe();
    }

    // Pull initial authoritative state from controllers if provided
    this._syncInitialControllerState();
  }

  // ==========================================================================
  // INITIALIZATION & MESH CREATION
  // ==========================================================================

  /**
   * Creates the preallocated toast billboard mesh and canvas texture.
   * @private
   */
  _initToastMesh() {
    this._toastCanvas = null;
    this._toastTexture = null;

    if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
      this._toastCanvas = document.createElement('canvas');
      this._toastCanvas.width = 512;
      this._toastCanvas.height = 220;
      drawCatchToast(this._toastCanvas, 'CLEAN CATCH', 35, false);
      this._toastTexture = new CanvasTexture(this._toastCanvas);
      this._toastTexture.generateMipmaps = false;
      this._toastTexture.needsUpdate = true;
    } else {
      this._toastTexture = { isCanvasTexture: true, needsUpdate: false };
    }

    this._toastGeom = new PlaneGeometry(0.32, 0.14);
    this._toastMat = new MeshBasicMaterial({
      map: this._toastTexture.isCanvasTexture ? this._toastTexture : null,
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      opacity: 0.0,
    });

    this._toastMesh = new Mesh(this._toastGeom, this._toastMat);
    this._toastMesh.name = 'progression-catch-toast-mesh';
    this._toastMesh.visible = false;
    this._toastMesh.position.set(
      UI_ANCHORS.TOAST_DEFAULT_OFFSET.x,
      1.25 + UI_ANCHORS.TOAST_DEFAULT_OFFSET.y,
      -0.45 + UI_ANCHORS.TOAST_DEFAULT_OFFSET.z
    );

    this.group.add(this._toastMesh);
  }

  /**
   * Creates the preallocated persistent progress bar mesh and canvas texture.
   * @private
   */
  _initProgressMesh() {
    this._progressCanvas = null;
    this._progressTexture = null;

    if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
      this._progressCanvas = document.createElement('canvas');
      this._progressCanvas.width = 512;
      this._progressCanvas.height = 140;
      drawEnergyProgressBar(this._progressCanvas, 0, 100, 1, 0.0);
      this._progressTexture = new CanvasTexture(this._progressCanvas);
      this._progressTexture.generateMipmaps = false;
      this._progressTexture.needsUpdate = true;
    } else {
      this._progressTexture = { isCanvasTexture: true, needsUpdate: false };
    }

    this._progressGeom = new PlaneGeometry(0.38, 0.10);
    this._progressMat = new MeshBasicMaterial({
      map: this._progressTexture.isCanvasTexture ? this._progressTexture : null,
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      opacity: 0.95,
    });

    this._progressMesh = new Mesh(this._progressGeom, this._progressMat);
    this._progressMesh.name = 'progression-energy-progress-mesh';
    this._progressMesh.position.set(
      UI_ANCHORS.PROGRESS_BAR_POS.x,
      UI_ANCHORS.PROGRESS_BAR_POS.y,
      UI_ANCHORS.PROGRESS_BAR_POS.z
    );
    this._progressMesh.rotation.x = UI_ANCHORS.PROGRESS_BAR_ROT_X;

    this.group.add(this._progressMesh);
  }

  /**
   * Creates the preallocated chapter announcement mesh and canvas texture.
   * @private
   */
  _initChapterMesh() {
    this._chapterCanvas = null;
    this._chapterTexture = null;

    const initialData = CHAPTER_ANNOUNCEMENT_DATA[1];
    if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
      this._chapterCanvas = document.createElement('canvas');
      this._chapterCanvas.width = 1024;
      this._chapterCanvas.height = 460;
      drawChapterPlaque(this._chapterCanvas, initialData);
      this._chapterTexture = new CanvasTexture(this._chapterCanvas);
      this._chapterTexture.generateMipmaps = false;
      this._chapterTexture.needsUpdate = true;
    } else {
      this._chapterTexture = { isCanvasTexture: true, needsUpdate: false };
    }

    this._chapterGeom = new PlaneGeometry(0.72, 0.32);
    this._chapterMat = new MeshBasicMaterial({
      map: this._chapterTexture.isCanvasTexture ? this._chapterTexture : null,
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      opacity: 0.0,
    });

    this._chapterMesh = new Mesh(this._chapterGeom, this._chapterMat);
    this._chapterMesh.name = 'progression-chapter-announcement-mesh';
    this._chapterMesh.visible = false;
    this._chapterMesh.position.set(
      UI_ANCHORS.CHAPTER_PLAQUE_POS.x,
      UI_ANCHORS.CHAPTER_PLAQUE_POS.y,
      UI_ANCHORS.CHAPTER_PLAQUE_POS.z
    );

    this.group.add(this._chapterMesh);
  }

  /**
   * Reads initial state from bound controllers if available.
   * @private
   */
  _syncInitialControllerState() {
    if (this.evolutionController && typeof this.evolutionController.getSnapshot === 'function') {
      const snap = this.evolutionController.getSnapshot();
      if (snap) {
        this.currentStage = snap.currentStage ?? 1;
        this.currentEnergy = snap.evolutionEnergy ?? 0;
        this.energyRequired = snap.evolutionEnergyRequired ?? 100;
        this.progress = snap.evolutionProgress ?? 0.0;
        this._updateProgressCanvas();
      }
    }
    if (this.narrativeDirector && typeof this.narrativeDirector.getChapter === 'function') {
      this.currentChapter = this.narrativeDirector.getChapter() || 1;
    }
  }

  // ==========================================================================
  // 2. EVENT INTEGRATION & CONSUMPTION
  // ==========================================================================

  /**
   * Subscribes to canonical EventBus events.
   */
  subscribe() {
    this.unsubscribe();

    if (!this.eventBus || typeof this.eventBus.on !== 'function') {
      return;
    }

    // 1. Ingest Events.SCORE
    const unsubScore = this.eventBus.on(Events.SCORE, (data) => {
      this._handleScore(data);
    });
    if (typeof unsubScore === 'function') this._unsubs.push(unsubScore);

    // 2. Ingest Events.EVOLUTION_PROGRESS
    const unsubProgress = this.eventBus.on(Events.EVOLUTION_PROGRESS, (snapshot) => {
      this._handleEvolutionProgress(snapshot);
    });
    if (typeof unsubProgress === 'function') this._unsubs.push(unsubProgress);

    // 3. Ingest Events.ORRERY_CHAPTER_CHANGED
    const unsubChapter = this.eventBus.on(Events.ORRERY_CHAPTER_CHANGED, (payload) => {
      this._handleChapterChanged(payload);
    });
    if (typeof unsubChapter === 'function') this._unsubs.push(unsubChapter);

    // 4. Ingest Events.STAGE_COMPLETED to reflect new stage immediately
    const unsubStage = this.eventBus.on(Events.STAGE_COMPLETED, (payload) => {
      if (typeof payload?.currentStage === 'number') {
        this.currentStage = payload.currentStage;
        this.currentEnergy = 0;
        this.progress = 0.0;
        this._updateProgressCanvas();
      }
    });
    if (typeof unsubStage === 'function') this._unsubs.push(unsubStage);
  }

  /**
   * Removes all registered event listeners.
   */
  unsubscribe() {
    if (Array.isArray(this._unsubs)) {
      for (const unsub of this._unsubs) {
        if (typeof unsub === 'function') {
          try { unsub(); } catch (_) {}
        }
      }
    }
    this._unsubs = [];
  }

  /**
   * Ingests SCORE event without modifying score or energy.
   * @private
   */
  _handleScore(data) {
    if (!data && data !== 0) return;

    const scoreEvent = data?.payload || data;
    const awardedEnergy =
      data?.awardedEnergy ??
      scoreEvent?.awardedEnergy ??
      scoreEvent?.energy ??
      0;

    const rawCatchType =
      scoreEvent?.catchType ??
      data?.catchType ??
      'CLEAN';

    const normalizedType = String(rawCatchType).toUpperCase();
    const isAssisted = normalizedType === 'ASSISTED';
    let label = 'CLEAN CATCH';
    if (isAssisted) {
      label = 'ASSISTED';
    } else if (normalizedType === 'PERFECT') {
      label = 'PERFECT CATCH';
    }

    this.showCatchFeedback(label, awardedEnergy, isAssisted);
  }

  /**
   * Ingests EVOLUTION_PROGRESS event.
   * @private
   */
  _handleEvolutionProgress(snapshot) {
    if (!snapshot) return;

    if (typeof snapshot.currentStage === 'number') {
      this.currentStage = snapshot.currentStage;
    }
    if (typeof snapshot.evolutionEnergy === 'number') {
      this.currentEnergy = snapshot.evolutionEnergy;
    }
    if (typeof snapshot.evolutionEnergyRequired === 'number') {
      this.energyRequired = snapshot.evolutionEnergyRequired;
    }
    if (typeof snapshot.evolutionProgress === 'number') {
      this.progress = snapshot.evolutionProgress;
    }

    this._updateProgressCanvas();
  }

  /**
   * Ingests ORRERY_CHAPTER_CHANGED event.
   * @private
   */
  _handleChapterChanged(payload) {
    const chapter = (typeof payload === 'number')
      ? payload
      : (payload?.chapter ?? 1);

    this.currentChapter = chapter;
    this.showChapterAnnouncement(chapter);
  }

  // ==========================================================================
  // 3. PRESENTATION ACTIONS & UPDATES
  // ==========================================================================

  /**
   * Triggers the short-lived Catch Toast feedback.
   * @param {string} label - 'CLEAN CATCH' or 'ASSISTED'
   * @param {number} awardedEnergy - The canonical awarded energy
   * @param {boolean} [isAssisted=false]
   */
  showCatchFeedback(label, awardedEnergy, isAssisted = false) {
    if (this._toastCanvas) {
      drawCatchToast(this._toastCanvas, label, awardedEnergy, isAssisted);
      if (this._toastTexture) {
        this._toastTexture.needsUpdate = true;
      }
    }

    // Determine spatial anchor near the Ken
    if (this.kenGroup?.position && Number.isFinite(this.kenGroup.position.x)) {
      this._toastBasePos.copy(this.kenGroup.position).add(UI_ANCHORS.TOAST_DEFAULT_OFFSET);
    } else {
      this._toastBasePos.set(
        UI_ANCHORS.TOAST_DEFAULT_OFFSET.x,
        1.25 + UI_ANCHORS.TOAST_DEFAULT_OFFSET.y,
        -0.45 + UI_ANCHORS.TOAST_DEFAULT_OFFSET.z
      );
    }

    this._toastMesh.position.copy(this._toastBasePos);
    this._toastMesh.scale.set(0.92, 0.92, 0.92);
    this._toastMat.opacity = 0.0;
    this._toastMesh.visible = true;

    this._toastElapsedTime = 0.0;
    this._toastActive = true;
  }

  /**
   * Redraws the persistent progress canvas texture when energy changes.
   * @private
   */
  _updateProgressCanvas() {
    if (this._progressCanvas) {
      drawEnergyProgressBar(
        this._progressCanvas,
        this.currentEnergy,
        this.energyRequired,
        this.currentStage,
        this.progress
      );
      if (this._progressTexture) {
        this._progressTexture.needsUpdate = true;
      }
    }
  }

  /**
   * Triggers the Chapter Announcement plaque.
   * @param {number} chapterNumber - 1..5
   */
  showChapterAnnouncement(chapterNumber) {
    const num = Math.max(1, Math.min(5, Math.floor(chapterNumber)));
    const data = CHAPTER_ANNOUNCEMENT_DATA[num] || CHAPTER_ANNOUNCEMENT_DATA[1];

    if (this._chapterCanvas) {
      drawChapterPlaque(this._chapterCanvas, data);
      if (this._chapterTexture) {
        this._chapterTexture.needsUpdate = true;
      }
    }

    this._chapterMesh.scale.set(0.92, 0.92, 0.92);
    this._chapterMat.opacity = 0.0;
    this._chapterMesh.visible = true;

    this._chapterElapsedTime = 0.0;
    this._chapterActive = true;
  }

  // ==========================================================================
  // 4. FRAME TICK HOOK
  // ==========================================================================

  /**
   * Updates animations across frame ticks (zero heap allocations).
   * @param {number} dt - Frame delta time in seconds
   */
  update(dt = 0.016) {
    const delta = (typeof dt === 'number' && Number.isFinite(dt)) ? dt : 0.016;

    // 1. Catch Toast Animation
    if (this._toastActive) {
      this._toastElapsedTime += delta;
      const t = this._toastElapsedTime;

      if (t < TOAST_TIMING.FADE_IN) {
        // Ramp in
        const frac = t / TOAST_TIMING.FADE_IN;
        this._toastMat.opacity = frac;
        const s = 0.92 + 0.08 * frac;
        this._toastMesh.scale.set(s, s, s);
      } else if (t < TOAST_TIMING.FADE_IN + TOAST_TIMING.HOLD) {
        // Hold with subtle upward float
        this._toastMat.opacity = 1.0;
        this._toastMesh.scale.set(1.0, 1.0, 1.0);
      } else if (t < TOAST_TIMING.TOTAL) {
        // Ramp out
        const frac = (t - TOAST_TIMING.FADE_IN - TOAST_TIMING.HOLD) / TOAST_TIMING.FADE_OUT;
        this._toastMat.opacity = Math.max(0.0, 1.0 - frac);
        const s = 1.0 + 0.05 * frac;
        this._toastMesh.scale.set(s, s, s);
      } else {
        // Complete
        this._toastActive = false;
        this._toastMat.opacity = 0.0;
        this._toastMesh.visible = false;
      }

      // Continuous subtle upward drift
      const totalNorm = Math.min(1.0, t / TOAST_TIMING.TOTAL);
      this._toastMesh.position.y = this._toastBasePos.y + totalNorm * TOAST_TIMING.DRIFT_Y;
    }

    // 2. Chapter Announcement Animation
    if (this._chapterActive) {
      this._chapterElapsedTime += delta;
      const t = this._chapterElapsedTime;

      if (t < CHAPTER_TIMING.FADE_IN) {
        const frac = t / CHAPTER_TIMING.FADE_IN;
        this._chapterMat.opacity = frac;
        const s = 0.92 + 0.08 * frac;
        this._chapterMesh.scale.set(s, s, s);
      } else if (t < CHAPTER_TIMING.FADE_IN + CHAPTER_TIMING.HOLD) {
        this._chapterMat.opacity = 1.0;
        this._chapterMesh.scale.set(1.0, 1.0, 1.0);
      } else if (t < CHAPTER_TIMING.TOTAL) {
        const frac = (t - CHAPTER_TIMING.FADE_IN - CHAPTER_TIMING.HOLD) / CHAPTER_TIMING.FADE_OUT;
        this._chapterMat.opacity = Math.max(0.0, 1.0 - frac);
        const s = 1.0 + 0.03 * frac;
        this._chapterMesh.scale.set(s, s, s);
      } else {
        this._chapterActive = false;
        this._chapterMat.opacity = 0.0;
        this._chapterMesh.visible = false;
      }
    }
  }

  // ==========================================================================
  // 5. PUBLIC QUERY & CONTROL APIS
  // ==========================================================================

  /**
   * Sets canonical gameplayKenGroup reference for relative toast positioning.
   * @param {any} kenGroup
   */
  setKenGroup(kenGroup) {
    this.kenGroup = kenGroup || null;
  }

  /**
   * Sets the parent group for this UI subsystem.
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
   * Controls master visibility of the progression feedback layer.
   * @param {boolean} visible
   */
  setVisible(visible) {
    this.isVisibleState = Boolean(visible);
    this.group.visible = this.isVisibleState;
    if (!this.isVisibleState) {
      this._toastActive = false;
      this._toastMesh.visible = false;
      this._chapterActive = false;
      this._chapterMesh.visible = false;
    }
  }

  /**
   * Returns current master visibility.
   * @returns {boolean}
   */
  isVisible() {
    return this.isVisibleState;
  }

  /**
   * Returns current catch toast active state and opacity.
   * @returns {{ active: boolean, opacity: number, visible: boolean }}
   */
  getToastState() {
    return {
      active: this._toastActive,
      opacity: this._toastMat.opacity,
      visible: this._toastMesh.visible,
    };
  }

  /**
   * Returns current progress bar data snapshot.
   * @returns {{ currentStage: number, currentEnergy: number, energyRequired: number, progress: number }}
   */
  getProgressState() {
    return {
      currentStage: this.currentStage,
      currentEnergy: this.currentEnergy,
      energyRequired: this.energyRequired,
      progress: this.progress,
    };
  }

  /**
   * Returns current chapter announcement state.
   * @returns {{ active: boolean, opacity: number, visible: boolean, chapter: number }}
   */
  getChapterState() {
    return {
      active: this._chapterActive,
      opacity: this._chapterMat.opacity,
      visible: this._chapterMesh.visible,
      chapter: this.currentChapter,
    };
  }

  /**
   * Fully disposes of textures, geometries, materials, and removes group from parent.
   */
  destroy() {
    this.unsubscribe();

    if (this.group.parent && typeof this.group.parent.remove === 'function') {
      this.group.parent.remove(this.group);
    }

    try { this._toastGeom?.dispose?.(); } catch (_) {}
    try { this._toastMat?.dispose?.(); } catch (_) {}
    try { this._toastTexture?.dispose?.(); } catch (_) {}

    try { this._progressGeom?.dispose?.(); } catch (_) {}
    try { this._progressMat?.dispose?.(); } catch (_) {}
    try { this._progressTexture?.dispose?.(); } catch (_) {}

    try { this._chapterGeom?.dispose?.(); } catch (_) {}
    try { this._chapterMat?.dispose?.(); } catch (_) {}
    try { this._chapterTexture?.dispose?.(); } catch (_) {}

    const globalScope = typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null);
    if (globalScope?.progressionFeedbackUI === this) {
      globalScope.progressionFeedbackUI = null;
    }
  }
}

export default ProgressionFeedbackUI;
