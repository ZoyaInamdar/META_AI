/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * ============================================================================
 * Celestial Kendama - Planetoid Renderer System
 * Role: Person C (Visuals & Rendering)
 * ============================================================================
 *
 * Implements the state-driven visual Planetoid Renderer for Celestial Kendama:
 * - Single continuous planet mesh driven by BallState and PlanetState contracts.
 * - No five separate planet models: evolves dynamically through shader uniforms.
 * - Represents the 5-epoch planetary voyage:
 *   1. Seed: Compact, dark cosmic dormant body
 *   2. Awakening: Luminous golden Kintsugi veins
 *   3. Oceans: Procedural liquid basin filling
 *   4. Life & Atmosphere: Atmospheric Fresnel rim & soft surface biomes
 *   5. Celestial Alignment: Golden rings, finale ignition & planetary shield
 *
 * Performance:
 * - Total vertices: ~1,374 vertices across core, atmosphere, and rings (< 2,000 target)
 * - Draw calls: 1 core + 1 atmosphere (when active) + 1 ring (when active)
 * - Zero per-frame CPU allocations in update()
 * - Strictly preserves Person A (BallState) and Person B (PlanetState) immutability
 */

import {
  Group,
  Mesh,
  RingGeometry,
  SphereGeometry,
  Vector3
} from 'three';
import {
  createPlanetoidCoreMaterial,
  createPlanetoidAtmosphereMaterial,
  createPlanetoidRingMaterial
} from './PlanetoidShader.js';

// ============================================================================
// 1. CANONICAL STAGE CONSTANTS, ANCHOR & DEBUG PRESETS
// ============================================================================

export const PLANETOID_DEFAULT_RADIUS = 0.035; // Base geometry radius in meters (35mm)
export const PLANETOID_DEFAULT_SCALE = 17.0;  // Hero focal scale yielding ~1.19m diameter (0.07m * 17.0 = 1.19m, ~1.5x apparent hero diameter)
export const PLANETOID_SHOWCASE_SCALE = 30.0; // Dedicated visual-development showcase scale yielding ~2.10m diameter (~58% viewport height, revealing full celestial rings)
export const PLANETOID_DEFAULT_ANCHOR = Object.freeze({
  x: 0.0,
  y: 1.48,
  z: -1.80
});
export const PLANETOID_SHOWCASE_ANCHOR = Object.freeze({
  x: 0.0,
  y: 1.25,
  z: -1.80
});

export const PLANETOID_STAGES = Object.freeze({
  SEED: 'seed',
  AWAKENING: 'awakening',
  OCEANS: 'oceans',
  LIFE_ATMOSPHERE: 'life_atmosphere',
  CELESTIAL_ALIGNMENT: 'celestial_alignment'
});

export const STAGE_NUMBER_TO_KEY = Object.freeze({
  1: PLANETOID_STAGES.SEED,
  2: PLANETOID_STAGES.AWAKENING,
  3: PLANETOID_STAGES.OCEANS,
  4: PLANETOID_STAGES.LIFE_ATMOSPHERE,
  5: PLANETOID_STAGES.CELESTIAL_ALIGNMENT
});

export const STAGE_KEY_TO_NUMBER = Object.freeze({
  [PLANETOID_STAGES.SEED]: 1,
  [PLANETOID_STAGES.AWAKENING]: 2,
  [PLANETOID_STAGES.OCEANS]: 3,
  [PLANETOID_STAGES.LIFE_ATMOSPHERE]: 4,
  [PLANETOID_STAGES.CELESTIAL_ALIGNMENT]: 5
});

/**
 * Pre-configured mock PlanetState values for isolated development & visual inspection.
 * Overrides the renderer's visual uniforms without modifying real gameplay progression.
 */
export const DEBUG_STAGE_PRESETS = Object.freeze({
  [PLANETOID_STAGES.SEED]: Object.freeze({
    kintsugiGlow: 0.0,
    atmosphereDensity: 0.0,
    oceanFill: 0.0,
    ringAlpha: 0.0,
    shieldCharge: 0.0,
    scarsCount: 0,
    goldIgnited: false
  }),
  [PLANETOID_STAGES.AWAKENING]: Object.freeze({
    kintsugiGlow: 0.85,
    atmosphereDensity: 0.15,
    oceanFill: 0.0,
    ringAlpha: 0.0,
    shieldCharge: 0.0,
    scarsCount: 0,
    goldIgnited: false
  }),
  [PLANETOID_STAGES.OCEANS]: Object.freeze({
    kintsugiGlow: 1.0,
    atmosphereDensity: 0.55,
    oceanFill: 0.85,
    ringAlpha: 0.0,
    shieldCharge: 0.25,
    scarsCount: 0,
    goldIgnited: false
  }),
  [PLANETOID_STAGES.LIFE_ATMOSPHERE]: Object.freeze({
    kintsugiGlow: 1.0,
    atmosphereDensity: 0.90,
    oceanFill: 0.95,
    ringAlpha: 0.20,
    shieldCharge: 0.60,
    scarsCount: 0,
    goldIgnited: false
  }),
  [PLANETOID_STAGES.CELESTIAL_ALIGNMENT]: Object.freeze({
    kintsugiGlow: 1.0,
    atmosphereDensity: 1.0,
    oceanFill: 1.0,
    ringAlpha: 0.95,
    shieldCharge: 1.0,
    scarsCount: 0,
    goldIgnited: true
  })
});

// ============================================================================
// 2. PLANETOID RENDERER CLASS
// ============================================================================

export class PlanetoidRenderer {
  /**
   * @param {object} [options={}]
   * @param {number} [options.radius=0.035] - Planetoid base radius in meters (default: 35mm)
   * @param {number} [options.scale=17.0] - Hero scale factor yielding ~1.19m diameter celestial focal body
   * @param {Vector3 | object} [options.anchorPosition] - Independent celestial gameplay anchor position
   * @param {number} [options.segments=32] - Core sphere segment count
   * @param {number} [options.rotationSpeed=0.5] - Visual flight spin rate in rad/s
   * @param {Vector3} [options.lightDirection] - Cosmic directional light vector
   */
  constructor(options = {}) {
    this.options = options;
    this.radius = options.radius ?? PLANETOID_DEFAULT_RADIUS;
    this.segments = options.segments ?? 32;
    this.rotationSpeed = options.rotationSpeed ?? 0.5;

    // Dual-composition scales: gameplay hero scale vs visual development showcase scale
    this.gameplayScale = options.scale ?? PLANETOID_DEFAULT_SCALE;
    this.showcaseScale = options.showcaseScale ?? PLANETOID_SHOWCASE_SCALE;
    this.showcaseMode = Boolean(options.showcaseMode ?? false);
    this.scaleFactor = this.showcaseMode ? this.showcaseScale : this.gameplayScale;

    // Root Three.js Group
    this.group = new Group();
    this.group.name = 'planetoid-renderer-root';

    // Apply active celestial focal scale
    this.group.scale.setScalar(this.scaleFactor);

    // Dedicated celestial gameplay anchor (independent of physical BallState)
    this.gameplayAnchor = new Vector3();
    if (options.anchorPosition && typeof options.anchorPosition === 'object') {
      const p = options.anchorPosition;
      this.gameplayAnchor.set(p.x ?? 0, p.y ?? 0, p.z ?? 0);
    } else {
      this.gameplayAnchor.set(
        PLANETOID_DEFAULT_ANCHOR.x,
        PLANETOID_DEFAULT_ANCHOR.y,
        PLANETOID_DEFAULT_ANCHOR.z
      );
    }

    // Dedicated visual development showcase anchor
    this.showcaseAnchor = new Vector3();
    if (options.showcaseAnchor && typeof options.showcaseAnchor === 'object') {
      const p = options.showcaseAnchor;
      this.showcaseAnchor.set(p.x ?? 0, p.y ?? 0, p.z ?? 0);
    } else {
      this.showcaseAnchor.set(
        PLANETOID_SHOWCASE_ANCHOR.x,
        PLANETOID_SHOWCASE_ANCHOR.y,
        PLANETOID_SHOWCASE_ANCHOR.z
      );
    }

    this.anchorPosition = new Vector3().copy(
      this.showcaseMode ? this.showcaseAnchor : this.gameplayAnchor
    );
    this.group.position.copy(this.anchorPosition);

    // 1. Primary Core Sphere Mesh (~825 vertices)
    const latSegments = Math.max(16, Math.round(this.segments * 0.75));
    this.coreGeometry = new SphereGeometry(this.radius, this.segments, latSegments);
    this.coreMaterial = createPlanetoidCoreMaterial(options);
    this.coreMesh = new Mesh(this.coreGeometry, this.coreMaterial);
    this.coreMesh.name = 'planetoid-core';
    this.coreMesh.castShadow = true;
    this.coreMesh.receiveShadow = true;
    this.group.add(this.coreMesh);

    // 2. Ethereal Fresnel Atmosphere Shell (~475 vertices)
    const atmoRadius = this.radius * 1.06;
    this.atmosphereGeometry = new SphereGeometry(atmoRadius, 24, 18);
    this.atmosphereMaterial = createPlanetoidAtmosphereMaterial(options);
    this.atmosphereMesh = new Mesh(this.atmosphereGeometry, this.atmosphereMaterial);
    this.atmosphereMesh.name = 'planetoid-atmosphere';
    this.atmosphereMesh.visible = false;
    this.group.add(this.atmosphereMesh);

    // 3. Planetary Ring Disc (~130 vertices)
    const innerRadius = this.radius * 1.40;
    const outerRadius = this.radius * 2.10;
    this.ringGeometry = new RingGeometry(innerRadius, outerRadius, 64, 1);
    this.ringMaterial = createPlanetoidRingMaterial({
      ...options,
      innerRadius,
      outerRadius
    });
    this.ringMesh = new Mesh(this.ringGeometry, this.ringMaterial);
    this.ringMesh.name = 'planetoid-rings';
    // Orient rings in planetary horizontal plane (XZ), tilted slightly toward camera (~13 deg) with subtle lateral roll (~7 deg)
    this.ringMesh.rotation.set(-1.35, 0.0, 0.12, 'XYZ');
    this.ringMesh.visible = false;
    this.group.add(this.ringMesh);

    // Development-only debug stage override
    this.debugStage = null;

    // Phase 3 — Layer 1: Smooth Visual Stage Interpolation State
    this.targetStage = 1.0;
    this.visualStage = 1.0;
    this.stageTransitionSpeed = (typeof options.stageTransitionSpeed === 'number' && Number.isFinite(options.stageTransitionSpeed))
      ? options.stageTransitionSpeed
      : 4.0;

    // Cinematic Golden Awakening Animation State (Stage 1 -> 2)
    this.awakeningProgress = 0.0;
    this.isAwakeningPlaying = false;
    this.awakeningDuration = 1.85; // Default ~1.85s cinematic choreography (configurable via playAwakening)
    this.awakeningElapsedTime = 0.0;

    // Simulation & animation tracking
    this.elapsedTime = 0.0;
    this.mode = 'seated';
    this.scene = null;
    this.isDisposed = false;

    // Pre-allocated internal scratch variables (zero runtime allocations)
    this._scratchPos = new Vector3();
    this._scratchVel = new Vector3();

    // Attach developer console hook if available
    const globalScope = typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null);
    if (globalScope) {
      globalScope.__CELESTIAL_PLANETOID__ = this;
      globalScope.planetoidRenderer = this;
      globalScope.__CELESTIAL_PLANETOID_DEBUG__ = {
        setStage: (s) => this.setDebugStage(s),
        clear: () => this.clearDebugStage(),
        getStage: () => this.getDebugStage(),
        transitionToStage: (s) => this.transitionToStage(s),
        getTargetStage: () => this.getTargetStage(),
        getVisualStage: () => this.getVisualStage(),
        setVisualStage: (s) => this.setVisualStage(s),
        playAwakening: (duration = 1.85) => this.playAwakening(duration),
        resetAwakening: () => this.resetAwakening(),
        getAwakeningProgress: () => this.getAwakeningProgress(),
        getAwakeningPhase: () => this.getAwakeningPhase(),
        setAnchor: (x, y, z) => this.setAnchorPosition(x, y, z),
        getAnchor: () => this.getAnchorPosition(),
        setScale: (s) => this.setScale(s),
        getScale: () => this.getScale(),
        setShowcaseMode: (m) => this.setShowcaseMode(m),
        isShowcaseMode: () => this.isShowcaseMode(),
        getShowcaseScale: () => this.getShowcaseScale(),
        getShowcaseAnchor: () => this.getShowcaseAnchor(),
        getGameplayScale: () => this.getGameplayScale(),
        getGameplayAnchor: () => this.getGameplayAnchor()
      };
    }
  }

  /**
   * Sets whether the renderer operates in dedicated Planet Showcase Mode.
   * In showcase mode, uses showcaseScale (~40.0) and showcaseAnchor.
   * When disabled, restores gameplayScale (~17.0) and gameplayAnchor.
   *
   * @param {boolean} enabled
   * @returns {this}
   */
  setShowcaseMode(enabled) {
    this.showcaseMode = Boolean(enabled);
    if (this.showcaseMode) {
      this.scaleFactor = this.showcaseScale;
      this.anchorPosition.copy(this.showcaseAnchor);
    } else {
      this.scaleFactor = this.gameplayScale;
      this.anchorPosition.copy(this.gameplayAnchor);
    }
    this.group.scale.setScalar(this.scaleFactor);
    this.group.position.copy(this.anchorPosition);
    return this;
  }

  /**
   * Returns whether Planet Showcase Mode is active.
   * @returns {boolean}
   */
  isShowcaseMode() {
    return this.showcaseMode;
  }

  /**
   * Returns current showcase scale.
   * @returns {number}
   */
  getShowcaseScale() {
    return this.showcaseScale;
  }

  /**
   * Updates showcase scale factor.
   * @param {number} scale
   * @returns {this}
   */
  setShowcaseScale(scale) {
    if (typeof scale === 'number' && Number.isFinite(scale) && scale > 0) {
      this.showcaseScale = scale;
      if (this.showcaseMode) {
        this.scaleFactor = scale;
        this.group.scale.setScalar(this.scaleFactor);
      }
    }
    return this;
  }

  /**
   * Returns current showcase anchor.
   * @returns {Vector3}
   */
  getShowcaseAnchor() {
    return this.showcaseAnchor;
  }

  /**
   * Updates dedicated showcase anchor position.
   * @param {number | Vector3 | object} x
   * @param {number} [y]
   * @param {number} [z]
   * @returns {this}
   */
  setShowcaseAnchor(x, y, z) {
    if (x && typeof x === 'object') {
      const p = x;
      this.showcaseAnchor.set(p.x ?? 0, p.y ?? 0, p.z ?? 0);
    } else {
      this.showcaseAnchor.set(Number(x) || 0, Number(y) || 0, Number(z) || 0);
    }
    if (this.showcaseMode) {
      this.anchorPosition.copy(this.showcaseAnchor);
      this.group.position.copy(this.anchorPosition);
    }
    return this;
  }

  /**
   * Returns authored gameplay scale.
   * @returns {number}
   */
  getGameplayScale() {
    return this.gameplayScale;
  }

  /**
   * Returns authored gameplay anchor.
   * @returns {Vector3}
   */
  getGameplayAnchor() {
    return this.gameplayAnchor;
  }

  /**
   * Updates the independent celestial gameplay anchor position.
   * Does NOT get overwritten by BallState.
   *
   * @param {number | Vector3 | object} x - X coordinate or Vector3/object
   * @param {number} [y] - Y coordinate
   * @param {number} [z] - Z coordinate
   * @returns {this}
   */
  setAnchorPosition(x, y, z) {
    if (x && typeof x === 'object') {
      const p = x;
      this.gameplayAnchor.set(p.x ?? 0, p.y ?? 0, p.z ?? 0);
    } else {
      this.gameplayAnchor.set(Number(x) || 0, Number(y) || 0, Number(z) || 0);
    }
    if (!this.showcaseMode) {
      this.anchorPosition.copy(this.gameplayAnchor);
      this.group.position.copy(this.anchorPosition);
    }
    return this;
  }

  /**
   * Returns active anchor position (showcase anchor if in showcase mode, else gameplay anchor).
   * @returns {Vector3}
   */
  getAnchorPosition() {
    return this.showcaseMode ? this.showcaseAnchor : this.anchorPosition;
  }

  /**
   * Sets the planetoid visual scale factor.
   * Updates gameplayScale, and applies to active group scale if not in showcase mode.
   *
   * @param {number} scale
   * @returns {this}
   */
  setScale(scale) {
    if (typeof scale === 'number' && Number.isFinite(scale) && scale > 0) {
      this.gameplayScale = scale;
      if (!this.showcaseMode) {
        this.scaleFactor = scale;
        this.group.scale.setScalar(this.scaleFactor);
      }
    }
    return this;
  }

  /**
   * Returns active scale factor (showcase scale if in showcase mode, else gameplay scale).
   * @returns {number}
   */
  getScale() {
    return this.showcaseMode ? this.showcaseScale : this.scaleFactor;
  }

  /**
   * Attaches the planetoid root group to the specified Three.js scene.
   * Idempotent: safe to invoke repeatedly.
   *
   * @param {any} scene - Three.js Scene or Group
   */
  init(scene) {
    if (!scene || typeof scene.add !== 'function') {
      return;
    }
    this.scene = scene;
    if (this.group.parent !== scene) {
      scene.add(this.group);
    }
    this.isDisposed = false;
  }

  /**
   * Master update function called every frame.
   * Supports both object syntax:
   *   update({ ballState, planetState, deltaTime, elapsedTime })
   * and positional arguments syntax:
   *   update(deltaTime, ballState, planetState)
   *
   * @param {any} arg1
   * @param {any} [arg2]
   * @param {any} [arg3]
   */
  update(arg1, arg2, arg3) {
    if (this.isDisposed) return;

    let ballState = null;
    let planetState = null;
    let dt = 0.016;
    let elapsed = null;

    if (typeof arg1 === 'object' && arg1 !== null && ('ballState' in arg1 || 'planetState' in arg1 || 'deltaTime' in arg1 || 'elapsedTime' in arg1)) {
      ballState = arg1.ballState ?? null;
      planetState = arg1.planetState ?? null;
      dt = (typeof arg1.deltaTime === 'number' && Number.isFinite(arg1.deltaTime)) ? arg1.deltaTime : 0.016;
      elapsed = (typeof arg1.elapsedTime === 'number' && Number.isFinite(arg1.elapsedTime)) ? arg1.elapsedTime : null;
    } else if (typeof arg1 === 'number') {
      dt = Number.isFinite(arg1) ? arg1 : 0.016;
      ballState = arg2 ?? null;
      planetState = arg3 ?? null;
    }

    if (elapsed !== null) {
      this.elapsedTime = elapsed;
    } else {
      this.elapsedTime += dt;
    }

    // Cinematic Golden Awakening Animation (Stage 1 -> 2)
    if (this.isAwakeningPlaying) {
      this.awakeningElapsedTime += dt;
      this.awakeningProgress = Math.min(1.0, this.awakeningElapsedTime / this.awakeningDuration);
      this.visualStage = 1.0 + this.awakeningProgress;

      if (this.awakeningProgress >= 1.0) {
        this.isAwakeningPlaying = false;
        this.targetStage = 2.0;
        this.visualStage = 2.0;
        this.debugStage = PLANETOID_STAGES.AWAKENING;
      }
    } else if (this.visualStage !== this.targetStage) {
      // Phase 3 — Layer 1: Smooth frame-rate independent visual stage interpolation toward targetStage
      const t = 1.0 - Math.exp(-this.stageTransitionSpeed * dt);
      this.visualStage += (this.targetStage - this.visualStage) * t;
      if (Math.abs(this.targetStage - this.visualStage) < 0.005) {
        this.visualStage = this.targetStage;
      }
      this.visualStage = Math.max(1.0, Math.min(5.0, this.visualStage));

      // Settle debugStage when target stage reached
      if (this.visualStage === this.targetStage) {
        const settledKey = STAGE_NUMBER_TO_KEY[Math.round(this.targetStage)];
        if (settledKey) {
          this.debugStage = settledKey;
        }
      }
    }

    // Update uniform time, visual stage, and awakening progress
    if (this.coreMaterial?.uniforms) {
      if (this.coreMaterial.uniforms.uTime) {
        this.coreMaterial.uniforms.uTime.value = this.elapsedTime;
      }
      if (this.coreMaterial.uniforms.uVisualStage) {
        this.coreMaterial.uniforms.uVisualStage.value = this.visualStage;
      }
      if (this.coreMaterial.uniforms.uAwakeningProgress) {
        this.coreMaterial.uniforms.uAwakeningProgress.value = this.awakeningProgress;
      }
    }
    if (this.atmosphereMaterial?.uniforms) {
      if (this.atmosphereMaterial.uniforms.uTime) {
        this.atmosphereMaterial.uniforms.uTime.value = this.elapsedTime;
      }
      if (this.atmosphereMaterial.uniforms.uVisualStage) {
        this.atmosphereMaterial.uniforms.uVisualStage.value = this.visualStage;
      }
    }
    if (this.ringMaterial?.uniforms) {
      if (this.ringMaterial.uniforms.uTime) {
        this.ringMaterial.uniforms.uTime.value = this.elapsedTime;
      }
      if (this.ringMaterial.uniforms.uVisualStage) {
        this.ringMaterial.uniforms.uVisualStage.value = this.visualStage;
      }
    }

    // 1. Transform update driven by BallState
    if (ballState) {
      this.updateBallState(ballState, dt);
    }

    // 2. Visual appearance update driven by PlanetState
    this.updatePlanetState(planetState, dt);
  }

  /**
   * Consumes Person A's BallState to drive celestial rotation & flight tumble.
   * Strictly reads data: NEVER mutates the incoming ballState object,
   * and NEVER overwrites or derives planetoid world position from ballState.position.
   *
   * @param {any} ballState - BallState instance or object
   * @param {number} [dt=0.016] - Delta time in seconds
   */
  updateBallState(ballState, dt = 0.016) {
    if (!ballState) return;

    // Anchor position remains authoritative and fixed at the celestial anchor
    const activeAnchor = this.showcaseMode ? this.showcaseAnchor : this.anchorPosition;
    this.group.position.copy(activeAnchor);

    // Read mode: 'seated' | 'air' | 'catching'
    const mode = ballState.mode ?? 'seated';
    this.mode = mode;

    // When the physical kendama ball is airborne in flight, apply subtle celestial rotational tumble
    if (mode === 'air') {
      this.coreMesh.rotation.y += dt * this.rotationSpeed;
      this.coreMesh.rotation.x += dt * (this.rotationSpeed * 0.35);
    }
  }

  /**
   * Computes smooth interpolated debug preset values for fractional visual stages.
   *
   * @param {number} stage - Fractional stage [1.0 .. 5.0]
   * @returns {object} Interpolated preset object
   */
  getInterpolatedDebugPreset(stage) {
    const clamped = Math.max(1.0, Math.min(5.0, stage));
    if (clamped <= 1.0) return DEBUG_STAGE_PRESETS[PLANETOID_STAGES.SEED];
    if (clamped >= 5.0) return DEBUG_STAGE_PRESETS[PLANETOID_STAGES.CELESTIAL_ALIGNMENT];

    const s0 = Math.floor(clamped);
    const s1 = Math.min(5, s0 + 1);
    const t = clamped - s0;

    const key0 = STAGE_NUMBER_TO_KEY[s0];
    const key1 = STAGE_NUMBER_TO_KEY[s1];
    const p0 = DEBUG_STAGE_PRESETS[key0];
    const p1 = DEBUG_STAGE_PRESETS[key1];

    if (!p0 || !p1) return DEBUG_STAGE_PRESETS[PLANETOID_STAGES.SEED];

    return {
      kintsugiGlow: p0.kintsugiGlow + (p1.kintsugiGlow - p0.kintsugiGlow) * t,
      atmosphereDensity: p0.atmosphereDensity + (p1.atmosphereDensity - p0.atmosphereDensity) * t,
      oceanFill: p0.oceanFill + (p1.oceanFill - p0.oceanFill) * t,
      ringAlpha: p0.ringAlpha + (p1.ringAlpha - p0.ringAlpha) * t,
      shieldCharge: p0.shieldCharge + (p1.shieldCharge - p0.shieldCharge) * t,
      scarsCount: p0.scarsCount ?? 0,
      goldIgnited: clamped >= 4.5
    };
  }

  /**
   * Consumes Person B's PlanetState to drive shader uniforms.
   * Strictly reads data: NEVER mutates the incoming planetState object.
   * If debugStage is active, applies isolated debug preset values.
   *
   * @param {any} planetState - PlanetState instance or object
   * @param {number} [dt=0.016] - Delta time in seconds
   */
  updatePlanetState(planetState, dt = 0.016) {
    // If a development debug stage is active, prioritize it
    let source = planetState;
    if (this.debugStage) {
      if (this.visualStage === this.targetStage && Number.isInteger(this.visualStage) && DEBUG_STAGE_PRESETS[this.debugStage]) {
        source = DEBUG_STAGE_PRESETS[this.debugStage];
      } else {
        source = this.getInterpolatedDebugPreset(this.visualStage);
      }
    }

    if (!source) return;

    // Extract PlanetState fields (handling authoritative fields and backward-compatible aliases)
    const kintsugiGlow = Number(source.kintsugiGlow ?? source.kintsugiVeinGlow ?? 0.0);
    const atmosphereDensity = Number(source.atmosphereDensity ?? 0.0);
    const oceanFill = Number(source.oceanFill ?? source.oceanFillLevel ?? 0.0);
    const ringAlpha = Number(source.ringAlpha ?? source.ringFormationAlpha ?? 0.0);
    const shieldCharge = Number(source.shieldCharge ?? 0.0);
    const scarsCount = Number(source.scarsCount ?? source.scars ?? 0);
    const goldIgnited = Boolean(source.goldIgnited ?? source.isGoldIgnited ?? false);
    const goldIgnitedVal = goldIgnited ? 1.0 : 0.0;

    // 1. Core Sphere Uniforms
    if (this.coreMaterial?.uniforms) {
      const u = this.coreMaterial.uniforms;
      if (u.uKintsugiGlow) u.uKintsugiGlow.value = kintsugiGlow;
      if (u.uAtmosphereDensity) u.uAtmosphereDensity.value = atmosphereDensity;
      if (u.uOceanFill) u.uOceanFill.value = oceanFill;
      if (u.uShieldCharge) u.uShieldCharge.value = shieldCharge;
      if (u.uScarsCount) u.uScarsCount.value = scarsCount;
      if (u.uGoldIgnited) u.uGoldIgnited.value = goldIgnitedVal;
    }

    // 2. Atmosphere Shell Uniforms & Visibility
    if (this.atmosphereMesh && this.atmosphereMaterial?.uniforms) {
      const u = this.atmosphereMaterial.uniforms;
      if (u.uAtmosphereDensity) u.uAtmosphereDensity.value = atmosphereDensity;
      if (u.uShieldCharge) u.uShieldCharge.value = shieldCharge;
      if (u.uGoldIgnited) u.uGoldIgnited.value = goldIgnitedVal;
      if (u.uVisualStage) u.uVisualStage.value = this.visualStage;

      const shouldShowAtmo = atmosphereDensity > 0.01 || shieldCharge > 0.01 || goldIgnited || this.visualStage > 3.60;
      this.atmosphereMesh.visible = shouldShowAtmo;
    }

    // 3. Planetary Ring Uniforms & Visibility
    if (this.ringMesh && this.ringMaterial?.uniforms) {
      const u = this.ringMaterial.uniforms;
      if (u.uRingAlpha) u.uRingAlpha.value = ringAlpha;
      if (u.uGoldIgnited) u.uGoldIgnited.value = goldIgnitedVal;
      if (u.uVisualStage) u.uVisualStage.value = this.visualStage;

      this.ringMesh.visible = ringAlpha > 0.01 || this.visualStage > 4.45;
    }
  }

  // ==========================================================================
  // 3. DEVELOPMENT DEBUG CONTROLS
  // ==========================================================================

  /**
   * Overrides visual stage uniforms for immediate development inspection.
   * Sets both targetStage and visualStage instantly.
   * DOES NOT modify real gameplay progression or Person B's PlanetState.
   *
   * @param {string | number} stage - Stage key ('seed', 'awakening', 'oceans', 'life_atmosphere', 'celestial_alignment') or 1..5
   * @returns {boolean} True if successfully set
   */
  setDebugStage(stage) {
    let resolvedKey = null;
    let resolvedNum = null;

    if (typeof stage === 'number' && Number.isFinite(stage)) {
      if (stage in STAGE_NUMBER_TO_KEY) {
        resolvedNum = stage;
        resolvedKey = STAGE_NUMBER_TO_KEY[stage];
      }
    } else if (typeof stage === 'string') {
      const lower = stage.toLowerCase().trim();
      if (lower in DEBUG_STAGE_PRESETS) {
        resolvedKey = lower;
        resolvedNum = STAGE_KEY_TO_NUMBER[lower] ?? null;
      } else if (lower === 'life' || lower === 'atmosphere') {
        resolvedKey = PLANETOID_STAGES.LIFE_ATMOSPHERE;
        resolvedNum = 4;
      } else if (lower === 'alignment' || lower === 'finale') {
        resolvedKey = PLANETOID_STAGES.CELESTIAL_ALIGNMENT;
        resolvedNum = 5;
      } else {
        const num = parseFloat(lower);
        if (!Number.isNaN(num) && num in STAGE_NUMBER_TO_KEY) {
          resolvedNum = num;
          resolvedKey = STAGE_NUMBER_TO_KEY[num];
        }
      }
    }

    if (!resolvedKey || !DEBUG_STAGE_PRESETS[resolvedKey] || resolvedNum === null) {
      console.warn(`[PlanetoidRenderer] Unknown debug stage: "${stage}". Valid: 1..5 or ${Object.keys(DEBUG_STAGE_PRESETS).join(', ')}`);
      return false;
    }

    this.debugStage = resolvedKey;
    // Immediate inspection sets both target and visual stage instantly
    this.targetStage = resolvedNum;
    this.visualStage = resolvedNum;

    // Reset or settle awakening state depending on targeted stage
    this.isAwakeningPlaying = false;
    if (resolvedNum === 1) {
      this.awakeningProgress = 0.0;
      this.awakeningElapsedTime = 0.0;
    } else if (resolvedNum >= 2) {
      this.awakeningProgress = 1.0;
      this.awakeningElapsedTime = this.awakeningDuration;
    }
    if (this.coreMaterial?.uniforms) {
      if (this.coreMaterial.uniforms.uAwakeningProgress) {
        this.coreMaterial.uniforms.uAwakeningProgress.value = this.awakeningProgress;
      }
      if (this.coreMaterial.uniforms.uVisualStage) {
        this.coreMaterial.uniforms.uVisualStage.value = this.visualStage;
      }
    }

    if (this.group) {
      this.group.visible = true;
    }
    // Immediately apply debug preset values
    this.updatePlanetState(DEBUG_STAGE_PRESETS[this.debugStage], 0.0);
    return true;
  }

  /**
   * Immediate stage inspection API (alias for setDebugStage).
   * Sets both targetStage and visualStage instantly to the requested stage.
   *
   * @param {string | number} stage
   * @returns {boolean} True if successfully set
   */
  setStage(stage) {
    return this.setDebugStage(stage);
  }

  /**
   * Sets the continuous visual stage directly for gameplay evolution progression.
   * Updates uniforms, awakening progress, and interpolated appearance presets.
   *
   * @param {number} stage - Fractional visual stage [1.0 .. 5.0]
   * @returns {boolean} True if successfully set
   */
  setVisualStage(stage) {
    if (typeof stage !== 'number' || !Number.isFinite(stage)) return false;
    const clamped = Math.max(1.0, Math.min(5.0, stage));
    this.visualStage = clamped;
    this.targetStage = clamped;
    this.isAwakeningPlaying = false;

    // Track awakening progress for Stage 1 -> Stage 2
    if (clamped <= 1.0) {
      this.awakeningProgress = 0.0;
      this.awakeningElapsedTime = 0.0;
    } else if (clamped < 2.0) {
      this.awakeningProgress = clamped - 1.0;
      this.awakeningElapsedTime = this.awakeningProgress * this.awakeningDuration;
    } else {
      this.awakeningProgress = 1.0;
      this.awakeningElapsedTime = this.awakeningDuration;
    }

    if (this.coreMaterial?.uniforms) {
      if (this.coreMaterial.uniforms.uVisualStage) {
        this.coreMaterial.uniforms.uVisualStage.value = this.visualStage;
      }
      if (this.coreMaterial.uniforms.uAwakeningProgress) {
        this.coreMaterial.uniforms.uAwakeningProgress.value = this.awakeningProgress;
      }
    }
    if (this.atmosphereMaterial?.uniforms?.uVisualStage) {
      this.atmosphereMaterial.uniforms.uVisualStage.value = this.visualStage;
    }
    if (this.ringMaterial?.uniforms?.uVisualStage) {
      this.ringMaterial.uniforms.uVisualStage.value = this.visualStage;
    }

    // Keep appearance preset updated via continuous interpolation
    if (this.debugStage) {
      const preset = this.getInterpolatedDebugPreset(this.visualStage);
      if (preset) {
        this.updatePlanetState(preset, 0.0);
      }
    }

    return true;
  }

  /**
   * Smooth visual stage transition API.
   * Sets targetStage while leaving visualStage at its current value,
   * allowing the renderer to smoothly interpolate toward targetStage frame-by-frame.
   *
   * @param {string | number} stage - Target stage (1..5 or stage name)
   * @returns {boolean} True if target stage is valid and transition initiated
   */
  transitionToStage(stage) {
    let resolvedKey = null;
    let resolvedNum = null;

    if (typeof stage === 'number' && Number.isFinite(stage)) {
      if (stage in STAGE_NUMBER_TO_KEY) {
        resolvedNum = stage;
        resolvedKey = STAGE_NUMBER_TO_KEY[stage];
      }
    } else if (typeof stage === 'string') {
      const lower = stage.toLowerCase().trim();
      if (lower in STAGE_KEY_TO_NUMBER) {
        resolvedKey = lower;
        resolvedNum = STAGE_KEY_TO_NUMBER[lower];
      } else if (lower === 'life' || lower === 'atmosphere') {
        resolvedKey = PLANETOID_STAGES.LIFE_ATMOSPHERE;
        resolvedNum = 4;
      } else if (lower === 'alignment' || lower === 'finale') {
        resolvedKey = PLANETOID_STAGES.CELESTIAL_ALIGNMENT;
        resolvedNum = 5;
      } else {
        const num = parseFloat(lower);
        if (!Number.isNaN(num) && num in STAGE_NUMBER_TO_KEY) {
          resolvedNum = num;
          resolvedKey = STAGE_NUMBER_TO_KEY[num];
        }
      }
    }

    if (!resolvedKey || !DEBUG_STAGE_PRESETS[resolvedKey] || resolvedNum === null) {
      console.warn(`[PlanetoidRenderer] Unknown transition stage: "${stage}". Valid: 1..5 or ${Object.keys(DEBUG_STAGE_PRESETS).join(', ')}`);
      return false;
    }

    // If transitioning from Stage 1 to Stage 2, trigger the cinematic golden awakening sequence
    if (resolvedNum === 2 && this.visualStage < 1.95) {
      this.playAwakening(this.awakeningDuration);
      this.targetStage = 2.0;
      this.debugStage = resolvedKey;
      if (this.group) {
        this.group.visible = true;
      }
      return true;
    }

    // For other transitions, stop any active awakening sequence and let smooth interpolation take over
    this.isAwakeningPlaying = false;
    if (resolvedNum === 1) {
      this.awakeningProgress = 0.0;
    } else if (resolvedNum >= 2) {
      this.awakeningProgress = 1.0;
    }
    if (this.coreMaterial?.uniforms?.uAwakeningProgress) {
      this.coreMaterial.uniforms.uAwakeningProgress.value = this.awakeningProgress;
    }

    this.targetStage = resolvedNum;
    if (this.debugStage === null) {
      this.debugStage = resolvedKey;
    }
    if (this.group) {
      this.group.visible = true;
    }
    return true;
  }

  /**
   * Plays the cinematic golden awakening transition from Stage 1 to Stage 2.
   * Advances through staggered tectonic fault ignition, directional propagation,
   * junction flash convergence, and settles into stable Stage 2 Kintsugi.
   *
   * @param {number} [duration=1.85] - Duration of the awakening sequence in seconds
   * @returns {this}
   */
  playAwakening(duration = 1.85) {
    this.isAwakeningPlaying = true;
    this.awakeningDuration = (typeof duration === 'number' && Number.isFinite(duration) && duration > 0)
      ? duration
      : 1.85;
    this.awakeningElapsedTime = 0.0;
    this.awakeningProgress = 0.0;
    this.targetStage = 2.0;
    this.visualStage = 1.0;
    this.debugStage = PLANETOID_STAGES.AWAKENING;

    if (this.coreMaterial?.uniforms) {
      if (this.coreMaterial.uniforms.uAwakeningProgress) {
        this.coreMaterial.uniforms.uAwakeningProgress.value = 0.0;
      }
      if (this.coreMaterial.uniforms.uVisualStage) {
        this.coreMaterial.uniforms.uVisualStage.value = 1.0;
      }
    }
    if (this.group) {
      this.group.visible = true;
    }
    return this;
  }

  /**
   * Resets awakening progress back to Stage 1 dormant primordial state.
   *
   * @returns {this}
   */
  resetAwakening() {
    this.isAwakeningPlaying = false;
    this.awakeningProgress = 0.0;
    this.awakeningElapsedTime = 0.0;
    this.targetStage = 1.0;
    this.visualStage = 1.0;
    this.debugStage = PLANETOID_STAGES.SEED;

    if (this.coreMaterial?.uniforms) {
      if (this.coreMaterial.uniforms.uAwakeningProgress) {
        this.coreMaterial.uniforms.uAwakeningProgress.value = 0.0;
      }
      if (this.coreMaterial.uniforms.uVisualStage) {
        this.coreMaterial.uniforms.uVisualStage.value = 1.0;
      }
    }
    this.updatePlanetState(DEBUG_STAGE_PRESETS[PLANETOID_STAGES.SEED], 0.0);
    return this;
  }

  /**
   * Returns current awakening progress [0.0 .. 1.0].
   * @returns {number}
   */
  getAwakeningProgress() {
    return this.awakeningProgress;
  }

  /**
   * Returns current physical awakening phase description.
   *
   * Phase 1: 'first_awakening' (0.00 .. 0.15)
   * Phase 2: 'golden_propagation' (0.15 .. 0.40)
   * Phase 3: 'secondary_ignition' (0.40 .. 0.65)
   * Phase 4: 'chain_reaction' (0.65 .. 0.85)
   * Phase 5: 'energy_peak' (0.85 .. 0.95)
   * Phase 6: 'settled' (0.95 .. 1.00)
   *
   * @returns {string}
   */
  getAwakeningPhase() {
    const p = this.awakeningProgress;
    if (!this.isAwakeningPlaying && p <= 0.001) return 'dormant';
    if (p < 0.15) return 'first_awakening';
    if (p < 0.40) return 'golden_propagation';
    if (p < 0.65) return 'secondary_ignition';
    if (p < 0.85) return 'chain_reaction';
    if (p < 0.95) return 'energy_peak';
    return 'settled';
  }

  /**
   * Returns desired target stage [1.0 .. 5.0].
   * @returns {number}
   */
  getTargetStage() {
    return this.targetStage;
  }

  /**
   * Returns currently rendered interpolated visual stage [1.0 .. 5.0].
   * @returns {number}
   */
  getVisualStage() {
    return this.visualStage;
  }

  /**
   * Returns current active debug stage, or null if live gameplay state is active.
   * @returns {string | null}
   */
  getStage() {
    return this.getDebugStage();
  }

  /**
   * Clears development debug stage override, returning visual control to live PlanetState.
   */
  clearDebugStage() {
    this.debugStage = null;
  }

  /**
   * Returns current active debug stage, or null if live gameplay state is active.
   * @returns {string | null}
   */
  getDebugStage() {
    return this.debugStage;
  }

  /**
   * @returns {boolean} True if debug override is currently active
   */
  isDebugMode() {
    return this.debugStage !== null;
  }

  // ==========================================================================
  // 4. LIFECYCLE & DISPOSAL
  // ==========================================================================

  /**
   * Disposes all meshes, geometries, and shader materials.
   * Safe to call multiple times without side effects.
   */
  dispose() {
    if (this.isDisposed) return;
    this.isDisposed = true;

    // Disconnect from parent
    if (this.group.parent) {
      this.group.parent.remove(this.group);
    }

    // Dispose Primordial Crust Shell
    if (this.crustMesh?.parent) {
      this.crustMesh.parent.remove(this.crustMesh);
    }
    if (this.crustGeometry) {
      this.crustGeometry.dispose();
      this.crustGeometry = null;
    }
    if (this.crustMaterial) {
      this.crustMaterial.dispose();
      this.crustMaterial = null;
    }
    this.crustMesh = null;

    // Dispose Core
    if (this.coreGeometry) {
      this.coreGeometry.dispose();
      this.coreGeometry = null;
    }
    if (this.coreMaterial) {
      this.coreMaterial.dispose();
      this.coreMaterial = null;
    }
    this.coreMesh = null;

    // Dispose Atmosphere
    if (this.atmosphereGeometry) {
      this.atmosphereGeometry.dispose();
      this.atmosphereGeometry = null;
    }
    if (this.atmosphereMaterial) {
      this.atmosphereMaterial.dispose();
      this.atmosphereMaterial = null;
    }
    this.atmosphereMesh = null;

    // Dispose Ring
    if (this.ringGeometry) {
      this.ringGeometry.dispose();
      this.ringGeometry = null;
    }
    if (this.ringMaterial) {
      this.ringMaterial.dispose();
      this.ringMaterial = null;
    }
    this.ringMesh = null;

    this.scene = null;
    this.debugStage = null;

    const globalScope = typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null);
    if (globalScope) {
      if (globalScope.__CELESTIAL_PLANETOID__ === this) {
        globalScope.__CELESTIAL_PLANETOID__ = null;
        globalScope.__CELESTIAL_PLANETOID_DEBUG__ = null;
      }
      if (globalScope.planetoidRenderer === this) {
        globalScope.planetoidRenderer = null;
      }
    }
  }
}
