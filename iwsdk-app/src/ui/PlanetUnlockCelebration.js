/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * ============================================================================
 * Celestial Kendama - PlanetUnlockCelebration
 * Subsystem: Pre-Unlock Celestial Celebration (Hero Planet Spin & Sparkles)
 * ============================================================================
 *
 * Responsibilities:
 * 1. Orchestrates the celebratory transition between planet transformation completion
 *    and the Planet Unlock UI card presentation.
 * 2. Listens to Events.TRANSFORMATION_COMPLETED ('planet:transformation-completed')
 *    with payload { previousStage, newStage }.
 * 3. Drives a controlled, slow, majestic 360° celebratory spin of the hero celestial planet
 *    visual (using PlanetoidRenderer.coreMesh) with an ease-in-out curve (3.40s duration).
 *    - Strictly visual: NEVER alters physical Kendama/Tama geometry, physics, or BallState.
 *    - Guaranteed to return seamlessly to its exact initial presentation orientation.
 * 4. Choreographs 16 luminous celestial sparkles floating in a 3D spherical shell
 *    around the planet's silhouette, rotating in orbit with the planet's spin.
 *    - Stage-aware color palettes for Stages 2, 3, 4, 5.
 *    - Smooth multi-stage twinkle: soft glow -> flare -> soft glow -> 0.
 * 5. Guarantees clear visual handoff:
 *    - Celebration completes entirely (3.80s) BEFORE the PlanetUnlockUI card appears.
 *    - Seamlessly invokes PlanetUnlockUI.showStage(targetStage) at completion.
 * 6. Exposes public runtime API:
 *    - play(stage), debugShow(stage), getState(), getPhase(), getProgress(), reset()
 */

import { Events } from '../contracts/Interfaces.js';
import { eventBus as defaultEventBus } from '../contracts/EventBus.js';
import {
  Group,
  Mesh,
  PlaneGeometry,
  MeshBasicMaterial,
  CanvasTexture,
  AdditiveBlending,
  DoubleSide,
  Color,
} from 'three';

// ============================================================================
// 1. CELEBRATION CONSTANTS & STATES
// ============================================================================

/**
 * High-level state of the celebration controller.
 */
export const CelebrationState = Object.freeze({
  IDLE: 'idle',
  SPINNING: 'spinning',
  SPARKLING: 'sparkling',
  COMPLETE: 'complete',
  DESTROYED: 'destroyed',
});

/**
 * Sequential choreography phases across the celebration.
 */
export const CelebrationPhase = Object.freeze({
  IDLE: 'idle',
  SPIN: 'spin',
  SPARKLE: 'sparkle',
  SETTLE: 'settle',
  COMPLETE: 'complete',
});

/**
 * Celebration timing constants in seconds.
 * 3.4s slow, majestic 360° spin with sinusoidal ease-in-out curve.
 * 3.8s total duration ensuring clean settle before handoff to PlanetUnlockUI.
 */
export const CELEBRATION_SPIN_DURATION = 3.40;
export const CELEBRATION_SPIN_START = 0.20;
export const CELEBRATION_SPIN_END = CELEBRATION_SPIN_START + CELEBRATION_SPIN_DURATION; // 3.60s
export const CELEBRATION_TOTAL_DURATION = 3.80;

/**
 * Number of sparkles in the constellation.
 */
export const CELEBRATION_PARTICLE_COUNT = 16;
export const CELEBRATION_SPARKLE_COUNT = 16;

/**
 * Stage-aware celestial color palettes for Stages 2, 3, 4, and 5.
 */
export const CELEBRATION_STAGE_PALETTES = Object.freeze({
  2: ['#FFF8F2', '#F6D58A', '#E8B94F', '#F4B8C8', '#CBB7F6'], // Stage 2: Awakened Mineral (warm gold / champagne / lilac)
  3: ['#E6F7FF', '#91D5FF', '#BAE7FF', '#F6D58A', '#FFFFFF'], // Stage 3: Living Hydrosphere (cyan / crystal blue / champagne)
  4: ['#F6FFED', '#B7EB8F', '#52C41A', '#F6D58A', '#D9F7BE'], // Stage 4: Verdant Atmosphere (emerald / soft green / gold)
  5: ['#F9F0FF', '#D3ADF7', '#BAE7FF', '#FFF0F6', '#EFDBFF'], // Stage 5: Transcendent Celestial (celestial lavender / cyan / rose / white-gold)
});

/**
 * 16 Deterministic Sparkle Configurations distributed in 3D around the planet.
 * Couplings (alpha) rotate sparkles in 3D orbit matching the planet's celebratory rotation.
 */
export const CELEBRATION_SPARKLE_CONFIGS = Object.freeze([
  // 1. High zenith crown mote (brilliant pearl white)
  { id: 1, relRadius: 1.25, baseTheta: 0.65, basePhi: 0.20, alpha: 0.98, spawnTime: 0.30, duration: 1.60, baseScale: 0.18, color: '#FFF8F2', relX: 0.197, relY: 0.756, relZ: 0.975 },
  // 2. Right limb flare (soft champagne)
  { id: 2, relRadius: 1.15, baseTheta: 0.15, basePhi: 1.10, alpha: 1.02, spawnTime: 0.40, duration: 1.70, baseScale: 0.20, color: '#F6D58A', relX: 1.011, relY: 0.172, relZ: 0.514 },
  // 3. Lower-left limb star (warm gold)
  { id: 3, relRadius: 1.20, baseTheta: -0.45, basePhi: 2.20, alpha: 0.95, spawnTime: 0.50, duration: 1.55, baseScale: 0.16, color: '#E8B94F', relX: 0.880, relY: -0.522, relZ: -0.637 },
  // 4. Upper-right crest flare (pearl white)
  { id: 4, relRadius: 1.30, baseTheta: 0.50, basePhi: 0.85, alpha: 1.05, spawnTime: 0.60, duration: 1.75, baseScale: 0.22, color: '#FFF8F2', relX: 0.862, relY: 0.623, relZ: 0.751 },
  // 5. Left equatorial beacon (soft lilac)
  { id: 5, relRadius: 1.18, baseTheta: 0.05, basePhi: 3.10, alpha: 0.97, spawnTime: 0.70, duration: 1.65, baseScale: 0.17, color: '#CBB7F6', relX: 0.049, relY: 0.059, relZ: -1.176 },
  // 6. Central front climax star (pearl white)
  { id: 6, relRadius: 1.12, baseTheta: 0.20, basePhi: 0.00, alpha: 1.00, spawnTime: 0.80, duration: 1.80, baseScale: 0.25, color: '#FFF8F2', relX: 0.000, relY: 0.222, relZ: 1.098 },
  // 7. Lower-right rim accent (pale rose)
  { id: 7, relRadius: 1.22, baseTheta: -0.55, basePhi: 1.50, alpha: 1.03, spawnTime: 0.90, duration: 1.60, baseScale: 0.16, color: '#F4B8C8', relX: 1.033, relY: -0.638, relZ: 0.073 },
  // 8. High north-east mote (champagne)
  { id: 8, relRadius: 1.35, baseTheta: 0.70, basePhi: 0.60, alpha: 0.96, spawnTime: 1.00, duration: 1.50, baseScale: 0.14, color: '#F6D58A', relX: 0.583, relY: 0.870, relZ: 0.853 },
  // 9. Fault line junction flash (warm gold)
  { id: 9, relRadius: 1.10, baseTheta: -0.15, basePhi: 0.35, alpha: 1.00, spawnTime: 1.10, duration: 1.70, baseScale: 0.20, color: '#E8B94F', relX: 0.372, relY: -0.164, relZ: 1.023 },
  // 10. Far-left trailing stardust (lilac)
  { id: 10, relRadius: 1.28, baseTheta: -0.10, basePhi: 3.80, alpha: 1.04, spawnTime: 1.20, duration: 1.55, baseScale: 0.13, color: '#CBB7F6', relX: -0.780, relY: -0.128, relZ: -1.006 },
  // 11. Upper meridian sparkle (champagne)
  { id: 11, relRadius: 1.16, baseTheta: 0.40, basePhi: 0.45, alpha: 0.99, spawnTime: 1.30, duration: 1.60, baseScale: 0.18, color: '#F6D58A', relX: 0.465, relY: 0.452, relZ: 0.957 },
  // 12. Deep south nadir mote (warm gold)
  { id: 12, relRadius: 1.24, baseTheta: -0.75, basePhi: 2.00, alpha: 0.94, spawnTime: 1.40, duration: 1.50, baseScale: 0.15, color: '#E8B94F', relX: 0.817, relY: -0.845, relZ: -0.374 },
  // 13. Left upper flare (pearl white)
  { id: 13, relRadius: 1.22, baseTheta: 0.35, basePhi: 2.70, alpha: 1.02, spawnTime: 1.45, duration: 1.55, baseScale: 0.18, color: '#FFF8F2', relX: 0.482, relY: 0.418, relZ: -1.037 },
  // 14. Right lower rim accent (pale rose)
  { id: 14, relRadius: 1.18, baseTheta: -0.30, basePhi: 1.20, alpha: 0.98, spawnTime: 1.50, duration: 1.50, baseScale: 0.16, color: '#F4B8C8', relX: 1.049, relY: -0.349, relZ: 0.407 },
  // 15. Sub-equatorial glimmer (soft lilac)
  { id: 15, relRadius: 1.14, baseTheta: -0.20, basePhi: 0.70, alpha: 1.01, spawnTime: 1.55, duration: 1.45, baseScale: 0.15, color: '#CBB7F6', relX: 0.718, relY: -0.226, relZ: 0.852 },
  // 16. Final zenith highlight (pearl white)
  { id: 16, relRadius: 1.26, baseTheta: 0.60, basePhi: 0.10, alpha: 1.00, spawnTime: 1.60, duration: 1.50, baseScale: 0.19, color: '#FFF8F2', relX: 0.103, relY: 0.711, relZ: 1.031 },
]);

// ============================================================================
// 2. PROCEDURAL SPARKLE TEXTURE GENERATOR
// ============================================================================

/**
 * Creates a reusable 128x128 procedural celestial sparkle texture.
 * Draws a glowing core with tapered horizontal/vertical rays and diamond facets.
 *
 * @returns {any} CanvasTexture or fallback texture
 */
export function createSparkleTexture() {
  if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const cx = 64;
      const cy = 64;

      // Soft circular radial glow
      const radial = ctx.createRadialGradient(cx, cy, 0, cx, cy, 48);
      radial.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
      radial.addColorStop(0.2, 'rgba(255, 248, 242, 0.85)');
      radial.addColorStop(0.5, 'rgba(246, 213, 138, 0.40)');
      radial.addColorStop(1.0, 'rgba(246, 213, 138, 0.0)');
      ctx.fillStyle = radial;
      ctx.fillRect(0, 0, 128, 128);

      // Primary 4-point tapered cross rays
      const drawRay = (w, h) => {
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h));
        grad.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
        grad.addColorStop(0.3, 'rgba(246, 213, 138, 0.7)');
        grad.addColorStop(1.0, 'rgba(246, 213, 138, 0.0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.ellipse(cx, cy, w, h, 0, 0, Math.PI * 2);
        ctx.fill();
      };

      drawRay(58, 4.5); // Horizontal ray
      drawRay(4.5, 58); // Vertical ray
      drawRay(22, 2.5); // Diagonal secondary ray 1
      drawRay(2.5, 22); // Diagonal secondary ray 2
    }

    const texture = new CanvasTexture(canvas);
    texture.generateMipmaps = false;
    texture.needsUpdate = true;
    return texture;
  }

  // Headless test runner fallback
  return {
    isTexture: true,
    image: { width: 128, height: 128 },
    dispose: () => {},
  };
}

// ============================================================================
// 3. MAIN PLANET UNLOCK CELEBRATION CONTROLLER
// ============================================================================

export class PlanetUnlockCelebration {
  /**
   * @param {Object} [options={}]
   * @param {any} [options.eventBus=defaultEventBus] - Authoritative EventBus instance
   * @param {any} [options.planetoidRenderer=null] - PlanetoidRenderer reference
   * @param {any} [options.unlockUI=null] - PlanetUnlockUI reference
   * @param {any} [options.parentGroup=null] - Parent Three.js group/scene
   * @param {boolean} [options.exposeGlobal=true] - Whether to expose window.planetUnlockCelebration
   */
  constructor(options = {}) {
    this.eventBus = options.eventBus !== undefined ? options.eventBus : defaultEventBus;
    this.planetoidRenderer = options.planetoidRenderer || null;
    this.unlockUI = options.unlockUI || null;
    this.parentGroup = options.parentGroup || null;

    this.state = CelebrationState.IDLE;
    this.phase = CelebrationPhase.IDLE;
    this.isPlaying = false;
    this.elapsedTime = 0.0;
    this.progress = 0.0;
    this.targetStage = 2;

    this.totalDuration = CELEBRATION_TOTAL_DURATION;
    this._initialRotationY = 0.0;

    // Three.js Scene hierarchy for sparkles
    this.group = new Group();
    this.group.name = 'celestial-unlock-celebration-group';
    this.group.visible = false;

    // Reusable shared sparkle geometry and texture
    this.sparkleTexture = createSparkleTexture();
    this.sparkleGeometry = new PlaneGeometry(1.0, 1.0);

    // Instantiate the 16 sparkle meshes
    this.sparkles = [];
    for (const cfg of CELEBRATION_SPARKLE_CONFIGS) {
      const mat = new MeshBasicMaterial({
        map: this.sparkleTexture,
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
        depthTest: false,
        side: DoubleSide,
        color: new Color(cfg.color),
        opacity: 0.0,
      });

      const mesh = new Mesh(this.sparkleGeometry, mat);
      mesh.name = `celestial-sparkle-${cfg.id}`;
      mesh.renderOrder = 998;
      mesh.visible = false;
      mesh.scale.set(0.001, 0.001, 0.001);

      this.group.add(mesh);
      this.sparkles.push({
        config: cfg,
        mesh,
        material: mat,
        initialColor: cfg.color,
      });
    }

    // Attach to parent group if provided
    if (this.parentGroup && typeof this.parentGroup.add === 'function') {
      this.parentGroup.add(this.group);
    }

    // Subscribe to authoritative Events.TRANSFORMATION_COMPLETED
    this._unsubscribeCompleted = null;
    if (this.eventBus && typeof this.eventBus.on === 'function') {
      this._unsubscribeCompleted = this.eventBus.on(
        Events.TRANSFORMATION_COMPLETED,
        (payload) => this._onTransformationCompleted(payload)
      );
    }

    // Ensure public methods remain lexically bound
    this.play = this.play.bind(this);
    this.debugShow = this.debugShow.bind(this);
    this.getState = this.getState.bind(this);
    this.getPhase = this.getPhase.bind(this);
    this.getProgress = this.getProgress.bind(this);
    this.reset = this.reset.bind(this);

    // Expose public development debug API
    if (options.exposeGlobal !== false) {
      const globalScope = typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null);
      if (globalScope) {
        globalScope.planetUnlockCelebration = this;
      }
    }
  }

  // ==========================================================================
  // 4. PUBLIC ACCESSORS & DEPENDENCY INJECTION
  // ==========================================================================

  /**
   * Sets the PlanetoidRenderer reference.
   * @param {any} renderer
   */
  setPlanetoidRenderer(renderer) {
    this.planetoidRenderer = renderer || null;
  }

  /**
   * Sets the PlanetUnlockUI reference.
   * @param {any} ui
   */
  setUnlockUI(ui) {
    this.unlockUI = ui || null;
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
   * Returns current high-level state ('idle' | 'spinning' | 'sparkling' | 'complete' | 'destroyed').
   * @returns {string}
   */
  getState() {
    return this.state;
  }

  /**
   * Returns current choreography phase ('idle' | 'spin' | 'sparkle' | 'settle' | 'complete').
   * @returns {string}
   */
  getPhase() {
    return this.phase;
  }

  /**
   * Returns normalized animation progress [0.0 .. 1.0].
   * @returns {number}
   */
  getProgress() {
    return this.progress;
  }

  /**
   * Returns whether the celebration is currently running.
   * @returns {boolean}
   */
  isActive() {
    return this.isPlaying;
  }

  // ==========================================================================
  // 5. PLAY & CHOREOGRAPHY SEQUENCE
  // ==========================================================================

  /**
   * Initiates the celebration sequence (planet spin + sparkles), concluding
   * with the automatic presentation of the PlanetUnlockUI card.
   *
   * @param {number} [stage=2] - The target unlocked stage
   * @returns {boolean} True if celebration started
   */
  play(stage = 2) {
    if (this.state === CelebrationState.DESTROYED) {
      return false;
    }
    // Prevent overlapping duplicate celebrations
    if (this.isPlaying) {
      return false;
    }

    const stageNum = (typeof stage === 'number' && Number.isFinite(stage)) ? Math.round(stage) : 2;
    this.targetStage = Math.max(2, Math.min(5, stageNum));

    // Ensure attached to parentGroup if available
    if (this.parentGroup && !this.group.parent && typeof this.parentGroup.add === 'function') {
      this.parentGroup.add(this.group);
    }

    // Dismiss any active unlock UI card so celebration has clean visual focus
    if (typeof this.unlockUI?.hide === 'function') {
      this.unlockUI.hide();
    }

    // Adapt particle color palette to the unlocked planetary stage
    this._applyStagePalette(this.targetStage);

    // Record baseline coreMesh rotation Y to ensure exact return
    if (this.planetoidRenderer?.coreMesh?.rotation) {
      this._initialRotationY = this.planetoidRenderer.coreMesh.rotation.y;
    } else {
      this._initialRotationY = 0.0;
    }

    // Position sparkle meshes around the active planet anchor and scale
    this._positionSparkles();

    // Activate celebration state
    this.isPlaying = true;
    this.state = CelebrationState.SPINNING;
    this.phase = CelebrationPhase.SPIN;
    this.elapsedTime = 0.0;
    this.progress = 0.0;

    this.group.visible = true;
    for (const item of this.sparkles) {
      item.mesh.visible = false;
      item.material.opacity = 0.0;
      item.mesh.scale.set(0.001, 0.001, 0.001);
    }

    return true;
  }

  /**
   * Debug shortcut to immediately trigger the celebration sequence for the specified stage.
   * Resets any active celebration, dismisses any active unlock card, and initiates a fresh sequence.
   *
   * @param {number} [stage=2] - The target unlocked stage (2, 3, 4, or 5)
   * @returns {boolean} True if celebration started
   */
  debugShow(stage = 2) {
    this.reset();
    if (typeof this.unlockUI?.hide === 'function') {
      this.unlockUI.hide();
    }
    return this.play(stage);
  }

  /**
   * Resets celebration to IDLE and restores baseline planet orientation.
   */
  reset() {
    if (this.state === CelebrationState.DESTROYED) {
      return;
    }

    this.isPlaying = false;
    this.state = CelebrationState.IDLE;
    this.phase = CelebrationPhase.IDLE;
    this.elapsedTime = 0.0;
    this.progress = 0.0;

    this.group.visible = false;
    for (const item of this.sparkles) {
      item.mesh.visible = false;
      item.material.opacity = 0.0;
    }

    // Restore planet coreMesh rotation Y to baseline
    if (this.planetoidRenderer?.coreMesh?.rotation) {
      this.planetoidRenderer.coreMesh.rotation.y = this._initialRotationY;
    }
  }

  // ==========================================================================
  // 6. FRAME TICK & ANIMATION
  // ==========================================================================

  /**
   * Frame tick advancing spin interpolation and sparkle lifetimes.
   * @param {number} dt - Frame delta time in seconds
   */
  update(dt) {
    if (!this.isPlaying || this.state === CelebrationState.DESTROYED) {
      return;
    }
    if (typeof dt !== 'number' || !Number.isFinite(dt) || dt <= 0) {
      return;
    }

    this.elapsedTime += dt;
    this.progress = Math.min(1.0, this.elapsedTime / this.totalDuration);
    const t = this.elapsedTime;

    // 1. Slow, Majestic Planet Spin Choreography (t = 0.20s to 3.60s, duration 3.40s)
    let spinAngle = 0.0;
    if (t >= CELEBRATION_SPIN_START && t < CELEBRATION_SPIN_END) {
      const spinP = (t - CELEBRATION_SPIN_START) / CELEBRATION_SPIN_DURATION; // [0.0 .. 1.0]
      // Sinusoidal ease-in-out curve for majestic continuous motion
      const ease = 0.5 * (1.0 - Math.cos(Math.PI * spinP));
      spinAngle = ease * (Math.PI * 2.0); // Exactly 360 deg

      if (this.planetoidRenderer?.coreMesh?.rotation) {
        this.planetoidRenderer.coreMesh.rotation.y = this._initialRotationY + spinAngle;
      }
    } else if (t >= CELEBRATION_SPIN_END) {
      spinAngle = Math.PI * 2.0;
      // Settle planet back to exact baseline orientation
      if (this.planetoidRenderer?.coreMesh?.rotation) {
        this.planetoidRenderer.coreMesh.rotation.y = this._initialRotationY;
      }
    }

    // 2. Resolve High-Level State & Phase
    if (t < CELEBRATION_SPIN_START) {
      this.state = CelebrationState.SPINNING;
      this.phase = CelebrationPhase.SPIN;
    } else if (t < CELEBRATION_SPIN_END) {
      this.state = CelebrationState.SPARKLING;
      this.phase = CelebrationPhase.SPARKLE;
    } else if (t < this.totalDuration) {
      this.state = CelebrationState.SPARKLING;
      this.phase = CelebrationPhase.SETTLE;
    }

    // 3. Mystical Sparkles Choreography (Rotating WITH the planet in 3D orbit)
    const pAnchor = (typeof this.planetoidRenderer?.getAnchorPosition === 'function')
      ? this.planetoidRenderer.getAnchorPosition()
      : { x: 0.0, y: 1.48, z: -1.80 };

    const planetScale = (typeof this.planetoidRenderer?.getScale === 'function')
      ? this.planetoidRenderer.getScale()
      : (this.planetoidRenderer?.scaleFactor ?? 17.0);

    const planetRadius = planetScale * (this.planetoidRenderer?.radius ?? 0.035);

    let anySparkleVisible = false;
    for (const item of this.sparkles) {
      const cfg = item.config;
      const tStart = cfg.spawnTime;
      const tEnd = tStart + cfg.duration;

      if (t >= tStart && t < tEnd) {
        anySparkleVisible = true;
        item.mesh.visible = true;

        const subP = (t - tStart) / cfg.duration; // [0.0 .. 1.0]

        // Multi-stage brightness & flare: soft glow -> flare -> soft glow -> 0
        const sinArch = Math.sin(subP * Math.PI);
        const flareFactor = Math.exp(-32.0 * Math.pow(subP - 0.5, 2.0));
        const brightness = Math.min(1.0, Math.pow(sinArch, 1.3) * 0.75 + flareFactor * 0.55);
        const scale = cfg.baseScale * (0.35 + 0.65 * sinArch + 0.45 * flareFactor);

        // Dynamic 3D position coupled to the planet's rotation
        const currentPhi = cfg.basePhi + spinAngle * cfg.alpha;
        const rad = cfg.relRadius * planetRadius;
        const cosTheta = Math.cos(cfg.baseTheta);
        const sinTheta = Math.sin(cfg.baseTheta);

        const localX = rad * cosTheta * Math.sin(currentPhi);
        const localY = rad * sinTheta + Math.sin(t * 1.5 + cfg.id) * (0.015 * planetRadius);
        const localZ = rad * cosTheta * Math.cos(currentPhi);

        item.mesh.position.set(
          pAnchor.x + localX,
          pAnchor.y + localY,
          pAnchor.z + localZ
        );

        item.mesh.scale.set(scale, scale, scale);
        item.material.opacity = brightness;
      } else {
        item.mesh.visible = false;
        item.material.opacity = 0.0;
      }
    }

    this.group.visible = anySparkleVisible;

    // 4. Celebration Completion & Handoff to Unlock UI Card
    if (t >= this.totalDuration) {
      this._finish();
    }
  }

  // ==========================================================================
  // 7. INTERNAL HELPERS & COMPLETION
  // ==========================================================================

  /**
   * Adapts particle colors based on the target unlocked planetary stage.
   *
   * @param {number} stage
   * @private
   */
  _applyStagePalette(stage) {
    const palette = CELEBRATION_STAGE_PALETTES[stage] || CELEBRATION_STAGE_PALETTES[2];
    for (let i = 0; i < this.sparkles.length; i++) {
      const item = this.sparkles[i];
      const colorHex = palette[i % palette.length];
      item.material.color.set(colorHex);
    }
  }

  /**
   * Internal handler for Events.TRANSFORMATION_COMPLETED.
   * @param {Object} payload - { previousStage, newStage }
   * @private
   */
  _onTransformationCompleted(payload) {
    const targetStage = payload?.newStage ?? 2;
    this.play(targetStage);
  }

  /**
   * Finalizes celebration, hides sparkles, settles planet, and reveals the unlock card.
   * @private
   */
  _finish() {
    this.isPlaying = false;
    this.state = CelebrationState.COMPLETE;
    this.phase = CelebrationPhase.COMPLETE;
    this.group.visible = false;

    for (const item of this.sparkles) {
      item.mesh.visible = false;
      item.material.opacity = 0.0;
    }

    // Lock planet coreMesh rotation back to baseline
    if (this.planetoidRenderer?.coreMesh?.rotation) {
      this.planetoidRenderer.coreMesh.rotation.y = this._initialRotationY;
    }

    // Handoff to PlanetUnlockUI card presentation
    if (this.unlockUI && typeof this.unlockUI.showStage === 'function') {
      this.unlockUI.showStage(this.targetStage);
    }
  }

  /**
   * Positions sparkle meshes in 3D relative to the active planetoid anchor and scale.
   * @param {number} [spinAngle=0.0]
   * @private
   */
  _positionSparkles(spinAngle = 0.0) {
    const pAnchor = (typeof this.planetoidRenderer?.getAnchorPosition === 'function')
      ? this.planetoidRenderer.getAnchorPosition()
      : { x: 0.0, y: 1.48, z: -1.80 };

    const planetScale = (typeof this.planetoidRenderer?.getScale === 'function')
      ? this.planetoidRenderer.getScale()
      : (this.planetoidRenderer?.scaleFactor ?? 17.0);

    const planetRadius = planetScale * (this.planetoidRenderer?.radius ?? 0.035);

    for (const item of this.sparkles) {
      const cfg = item.config;
      const currentPhi = cfg.basePhi + spinAngle * (cfg.alpha ?? 1.0);
      const rad = (cfg.relRadius ?? 1.2) * planetRadius;
      const cosTheta = Math.cos(cfg.baseTheta ?? 0.0);
      const sinTheta = Math.sin(cfg.baseTheta ?? 0.0);

      const localX = rad * cosTheta * Math.sin(currentPhi);
      const localY = rad * sinTheta;
      const localZ = rad * cosTheta * Math.cos(currentPhi);

      item.mesh.position.set(
        pAnchor.x + localX,
        pAnchor.y + localY,
        pAnchor.z + localZ
      );
    }
  }

  // ==========================================================================
  // 8. DISPOSAL
  // ==========================================================================

  /**
   * Cleans up EventBus subscriptions, disposes geometries, materials, textures,
   * and clears global debug references.
   */
  destroy() {
    this.reset();
    this.state = CelebrationState.DESTROYED;

    if (this._unsubscribeCompleted) {
      this._unsubscribeCompleted();
      this._unsubscribeCompleted = null;
    }

    if (this.group.parent && typeof this.group.parent.remove === 'function') {
      this.group.parent.remove(this.group);
    }

    for (const item of this.sparkles) {
      item.material?.dispose?.();
    }
    this.sparkles = [];

    if (this.sparkleGeometry && typeof this.sparkleGeometry.dispose === 'function') {
      this.sparkleGeometry.dispose();
      this.sparkleGeometry = null;
    }
    if (this.sparkleTexture && typeof this.sparkleTexture.dispose === 'function') {
      this.sparkleTexture.dispose();
      this.sparkleTexture = null;
    }

    const globalScope = typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null);
    if (globalScope && (globalScope.planetUnlockCelebration === this || globalScope.planetUnlockCelebration)) {
      delete globalScope.planetUnlockCelebration;
    }
  }
}

export default PlanetUnlockCelebration;
