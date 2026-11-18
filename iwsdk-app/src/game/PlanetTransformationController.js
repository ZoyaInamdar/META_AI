/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * ============================================================================
 * Celestial Kendama - PlanetTransformationController
 * Subsystem: Multi-Stage Cinematic Planet Transformations (1->2, 2->3, 3->4, 4->5)
 * ============================================================================
 *
 * Responsibilities:
 * 1. Orchestrates the achievement-driven cinematic transformations across all planetary stages:
 *    - Stage 1 -> Stage 2: Barren Mars-like Primordial -> Awakened Golden Mineral World (3.7s)
 *    - Stage 2 -> Stage 3: Awakened Golden Mineral World -> Blue Ocean World (4.0s)
 *    - Stage 3 -> Stage 4: Blue Ocean World -> Living Green World (3.6s)
 *    - Stage 4 -> Stage 5: Living Green World -> Transcendent Celestial World (4.3s)
 * 2. Operates independently from PlanetEvolutionController:
 *    - PlanetEvolutionController tracks progression toward the achievement.
 *    - PlanetTransformationController executes the cinematic event once triggered.
 * 3. Enforces strict achievement gating:
 *    - Cannot start before PlanetEvolutionController is in 'ready-to-transform'.
 *    - Premature requests are safely rejected without mutating gameplay state.
 * 4. Choreographs bespoke visual phases for each planetary evolution transition:
 *    - Stage 1 -> 2: CHARGE -> GEOLOGICAL_AWAKENING -> CLIMAX -> STAGE_2_REVEAL -> SETTLE
 *    - Stage 2 -> 3: COOLING -> MOISTURE_FORMATION -> OCEAN_EXPANSION -> ATMOSPHERIC_AWAKENING -> STAGE_3_REVEAL
 *    - Stage 3 -> 4: ATMOSPHERIC_ENRICHMENT -> LAND_AWAKENING -> VEGETATION_EMERGENCE -> STAGE_4_REVEAL
 *    - Stage 4 -> 5: GLOBAL_ENERGY_AWAKENING -> PLANETARY_LUMINOSITY -> CELESTIAL_ATMOSPHERE -> RING_AWAKENING -> CELESTIAL_ASCENSION
 * 5. Drives renderer via dedicated transformation progress (uTransformationProgress)
 *    separate from continuous uVisualStage.
 * 6. Commits stage advancement via PlanetEvolutionController.completeTransformation()
 *    and emits Events.TRANSFORMATION_COMPLETED for PlanetUnlockCelebration & PlanetUnlockUI.
 * 7. Exposes development/debug API window.celestialTransformation.
 */

import { Events } from '../contracts/Interfaces.js';
import { eventBus as defaultEventBus } from '../contracts/EventBus.js';
import { EvolutionState } from '../gameplay/PlanetEvolutionController.js';

/**
 * High-level state of the transformation controller.
 */
export const TransformationState = Object.freeze({
  IDLE: 'idle',
  TRANSFORMING: 'transforming',
  COMPLETE: 'complete',
});

/**
 * Phase enumerations for each specific transition.
 */
export const Stage1To2Phase = Object.freeze({
  IDLE: 'idle',
  CHARGE: 'charge',
  GEOLOGICAL_AWAKENING: 'geological_awakening',
  CLIMAX: 'climax',
  STAGE_2_REVEAL: 'stage_2_reveal',
  SETTLE: 'settle',
  COMPLETE: 'complete',
});

export const Stage2To3Phase = Object.freeze({
  IDLE: 'idle',
  COOLING: 'cooling',
  MOISTURE_FORMATION: 'moisture_formation',
  OCEAN_EXPANSION: 'ocean_expansion',
  ATMOSPHERIC_AWAKENING: 'atmospheric_awakening',
  STAGE_3_REVEAL: 'stage_3_reveal',
  COMPLETE: 'complete',
});

export const Stage3To4Phase = Object.freeze({
  IDLE: 'idle',
  ATMOSPHERIC_ENRICHMENT: 'atmospheric_enrichment',
  LAND_AWAKENING: 'land_awakening',
  VEGETATION_EMERGENCE: 'vegetation_emergence',
  STAGE_4_REVEAL: 'stage_4_reveal',
  COMPLETE: 'complete',
});

export const Stage4To5Phase = Object.freeze({
  IDLE: 'idle',
  GLOBAL_ENERGY_AWAKENING: 'global_energy_awakening',
  PLANETARY_LUMINOSITY: 'planetary_luminosity',
  CELESTIAL_ATMOSPHERE: 'celestial_atmosphere',
  RING_AWAKENING: 'ring_awakening',
  CELESTIAL_ASCENSION: 'celestial_ascension',
  COMPLETE: 'complete',
});

/**
 * Combined choreography phases spanning all planetary transformation events.
 * Preserves exact Stage 1 -> Stage 2 keys for backwards compatibility.
 */
export const TransformationPhase = Object.freeze({
  IDLE: 'idle',
  COMPLETE: 'complete',
  // Stage 1 -> 2
  CHARGE: 'charge',
  GEOLOGICAL_AWAKENING: 'geological_awakening',
  CLIMAX: 'climax',
  STAGE_2_REVEAL: 'stage_2_reveal',
  SETTLE: 'settle',
  // Stage 2 -> 3
  COOLING: 'cooling',
  MOISTURE_FORMATION: 'moisture_formation',
  OCEAN_EXPANSION: 'ocean_expansion',
  ATMOSPHERIC_AWAKENING: 'atmospheric_awakening',
  STAGE_3_REVEAL: 'stage_3_reveal',
  // Stage 3 -> 4
  ATMOSPHERIC_ENRICHMENT: 'atmospheric_enrichment',
  LAND_AWAKENING: 'land_awakening',
  VEGETATION_EMERGENCE: 'vegetation_emergence',
  STAGE_4_REVEAL: 'stage_4_reveal',
  // Stage 4 -> 5
  GLOBAL_ENERGY_AWAKENING: 'global_energy_awakening',
  PLANETARY_LUMINOSITY: 'planetary_luminosity',
  CELESTIAL_ATMOSPHERE: 'celestial_atmosphere',
  RING_AWAKENING: 'ring_awakening',
  CELESTIAL_ASCENSION: 'celestial_ascension',
});

/**
 * Canonical phase durations in seconds for Stage 1 -> Stage 2 (Total = 3.7 seconds).
 * Preserved for backwards compatibility with existing options and unit tests.
 */
export const DEFAULT_TRANSFORMATION_DURATIONS = Object.freeze({
  [TransformationPhase.CHARGE]: 0.6,
  [TransformationPhase.GEOLOGICAL_AWAKENING]: 1.3,
  [TransformationPhase.CLIMAX]: 0.5,
  [TransformationPhase.STAGE_2_REVEAL]: 0.8,
  [TransformationPhase.SETTLE]: 0.5,
});

/**
 * Transition configuration specifications for all four planetary evolutions.
 */
export const TRANSITION_CONFIGS = Object.freeze({
  '1->2': Object.freeze({
    fromStage: 1,
    toStage: 2,
    totalDefaultDuration: 3.7,
    phases: [
      TransformationPhase.CHARGE,
      TransformationPhase.GEOLOGICAL_AWAKENING,
      TransformationPhase.CLIMAX,
      TransformationPhase.STAGE_2_REVEAL,
      TransformationPhase.SETTLE,
    ],
    defaultDurations: Object.freeze({
      [TransformationPhase.CHARGE]: 0.6,
      [TransformationPhase.GEOLOGICAL_AWAKENING]: 1.3,
      [TransformationPhase.CLIMAX]: 0.5,
      [TransformationPhase.STAGE_2_REVEAL]: 0.8,
      [TransformationPhase.SETTLE]: 0.5,
    }),
  }),
  '2->3': Object.freeze({
    fromStage: 2,
    toStage: 3,
    totalDefaultDuration: 4.0,
    phases: [
      TransformationPhase.COOLING,
      TransformationPhase.MOISTURE_FORMATION,
      TransformationPhase.OCEAN_EXPANSION,
      TransformationPhase.ATMOSPHERIC_AWAKENING,
      TransformationPhase.STAGE_3_REVEAL,
    ],
    defaultDurations: Object.freeze({
      [TransformationPhase.COOLING]: 0.8,
      [TransformationPhase.MOISTURE_FORMATION]: 0.9,
      [TransformationPhase.OCEAN_EXPANSION]: 1.1,
      [TransformationPhase.ATMOSPHERIC_AWAKENING]: 0.6,
      [TransformationPhase.STAGE_3_REVEAL]: 0.6,
    }),
  }),
  '3->4': Object.freeze({
    fromStage: 3,
    toStage: 4,
    totalDefaultDuration: 3.6,
    phases: [
      TransformationPhase.ATMOSPHERIC_ENRICHMENT,
      TransformationPhase.LAND_AWAKENING,
      TransformationPhase.VEGETATION_EMERGENCE,
      TransformationPhase.STAGE_4_REVEAL,
    ],
    defaultDurations: Object.freeze({
      [TransformationPhase.ATMOSPHERIC_ENRICHMENT]: 0.7,
      [TransformationPhase.LAND_AWAKENING]: 0.9,
      [TransformationPhase.VEGETATION_EMERGENCE]: 1.2,
      [TransformationPhase.STAGE_4_REVEAL]: 0.8,
    }),
  }),
  '4->5': Object.freeze({
    fromStage: 4,
    toStage: 5,
    totalDefaultDuration: 4.3,
    phases: [
      TransformationPhase.GLOBAL_ENERGY_AWAKENING,
      TransformationPhase.PLANETARY_LUMINOSITY,
      TransformationPhase.CELESTIAL_ATMOSPHERE,
      TransformationPhase.RING_AWAKENING,
      TransformationPhase.CELESTIAL_ASCENSION,
    ],
    defaultDurations: Object.freeze({
      [TransformationPhase.GLOBAL_ENERGY_AWAKENING]: 0.8,
      [TransformationPhase.PLANETARY_LUMINOSITY]: 1.1,
      [TransformationPhase.CELESTIAL_ATMOSPHERE]: 0.8,
      [TransformationPhase.RING_AWAKENING]: 0.8,
      [TransformationPhase.CELESTIAL_ASCENSION]: 0.8,
    }),
  }),
});

export class PlanetTransformationController {
  /**
   * @param {Object} [options={}]
   * @param {any} [options.evolutionController=null] - PlanetEvolutionController instance
   * @param {any} [options.planetoidRenderer=null] - PlanetoidRenderer instance
   * @param {EventBus|null} [options.eventBus=defaultEventBus] - EventBus instance
   * @param {Object} [options.durations] - Optional custom phase durations
   * @param {boolean} [options.exposeGlobal=true] - Whether to expose window.celestialTransformation
   */
  constructor(options = {}) {
    this.evolutionController = options.evolutionController || null;
    this.planetoidRenderer = options.planetoidRenderer || null;
    this.eventBus = options.eventBus !== undefined ? options.eventBus : defaultEventBus;

    this.state = TransformationState.IDLE;
    this.phase = TransformationPhase.IDLE;
    this.transformationProgress = 0.0;
    this.elapsedTime = 0.0;

    // Custom duration overrides dictionary
    this._customDurationOverrides = options.durations || null;

    // Active transition tracking
    this.activeTransitionKey = '1->2';
    this.activeFromStage = 1;
    this.activeTargetStage = 2;
    this.activeConfig = TRANSITION_CONFIGS['1->2'];
    this._phaseBoundaries = [];

    // Initialize phase boundaries and durations for default Stage 1 -> 2
    this._setupTransitionPhases(TRANSITION_CONFIGS['1->2']);

    // Auto-transform trigger behavior when stage readiness is reached (defaults to false for manual control, true in CelestialEnvironment)
    this.autoTransform = options.autoTransform === true;

    this.isReadyToTransform = false;
    this._unsubStageReady = null;

    if (this.eventBus && typeof this.eventBus.on === 'function') {
      this._unsubStageReady = this.eventBus.on(Events.STAGE_READY, (data) => {
        const fromStage = (typeof data?.currentStage === 'number')
          ? data.currentStage
          : (this.evolutionController ? this.evolutionController.getCurrentStage() : 1);
        const toStage = (typeof data?.targetStage === 'number')
          ? data.targetStage
          : (this.evolutionController ? (this.evolutionController.getTargetStage() ?? (fromStage + 1)) : (fromStage + 1));

        if (toStage === fromStage + 1 && fromStage >= 1 && fromStage < 5) {
          this.isReadyToTransform = true;
          if (this.autoTransform && this.state !== TransformationState.TRANSFORMING) {
            this.beginTransformation(fromStage, toStage);
          }
        }
      });
    }

    // Global debug handle window.celestialTransformation
    const globalScope = typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null);
    if (options.exposeGlobal !== false && globalScope) {
      globalScope.celestialTransformation = this;
    }
  }

  // ==========================================================================
  // 1. STATE INSPECTION GETTERS
  // ==========================================================================

  /**
   * Returns current transformation state: 'idle', 'transforming', or 'complete'.
   * @returns {'idle' | 'transforming' | 'complete'}
   */
  getState() {
    return this.state;
  }

  /**
   * Returns current transformation phase.
   * @returns {string}
   */
  getPhase() {
    return this.phase;
  }

  /**
   * Returns normalized transformation progress [0.0 .. 1.0].
   * @returns {number}
   */
  getProgress() {
    return this.transformationProgress;
  }

  /**
   * Returns total transformation duration in seconds for the active transition.
   * @returns {number}
   */
  getTotalDuration() {
    return this.totalDuration;
  }

  /**
   * Returns descriptor for active transition.
   * @returns {{ fromStage: number, toStage: number, key: string }}
   */
  getActiveTransition() {
    return {
      fromStage: this.activeFromStage,
      toStage: this.activeTargetStage,
      key: this.activeTransitionKey,
    };
  }

  /**
   * Evaluates whether the system is eligible to begin transformation.
   * Valid for any stage transition N -> N+1 (N in [1..4]).
   * True only if:
   * 1. Not currently transforming
   * 2. EvolutionController is bound
   * 3. Current stage is valid (1..4) with an active target stage
   * 4. EvolutionController is in 'ready-to-transform' state (100% progress)
   *
   * @param {number} [customFrom]
   * @param {number} [customTo]
   * @returns {boolean}
   */
  canTransform(customFrom, customTo) {
    if (this.state === TransformationState.TRANSFORMING) {
      return false;
    }
    if (!this.evolutionController) {
      return false;
    }

    const current = (typeof customFrom === 'number' && Number.isFinite(customFrom))
      ? Math.floor(customFrom)
      : this.evolutionController.getCurrentStage();
    const target = (typeof customTo === 'number' && Number.isFinite(customTo))
      ? Math.floor(customTo)
      : this.evolutionController.getTargetStage();

    if (!current || !target || target !== current + 1 || current < 1 || current >= 5) {
      return false;
    }

    if (this.evolutionController.getCurrentStage() !== current) {
      return Boolean(this.isReadyToTransform);
    }

    return (
      this.evolutionController.getState() === EvolutionState.READY_TO_TRANSFORM ||
      this.evolutionController.getEvolutionProgress() >= 1.0 ||
      this.isReadyToTransform
    );
  }

  // ==========================================================================
  // 2. TRANSFORMATION CONTROLS
  // ==========================================================================

  /**
   * Requests or initiates cinematic planetary transformation.
   * Verifies that evolution progress is at 100% (ready-to-transform).
   *
   * @param {number} [customFrom]
   * @param {number} [customTo]
   * @returns {boolean} True if transformation initiated; false if ignored/ineligible
   */
  beginTransformation(customFrom, customTo) {
    if (!this.canTransform(customFrom, customTo)) {
      return false;
    }

    const fromStage = (typeof customFrom === 'number' && Number.isFinite(customFrom))
      ? Math.floor(customFrom)
      : (this.evolutionController ? this.evolutionController.getCurrentStage() : 1);
    const toStage = (typeof customTo === 'number' && Number.isFinite(customTo))
      ? Math.floor(customTo)
      : (this.evolutionController ? (this.evolutionController.getTargetStage() ?? (fromStage + 1)) : (fromStage + 1));

    const key = `${fromStage}->${toStage}`;
    const config = TRANSITION_CONFIGS[key] || TRANSITION_CONFIGS['1->2'];

    this.activeTransitionKey = key;
    this._setupTransitionPhases(config);

    this.state = TransformationState.TRANSFORMING;
    this.phase = config.phases[0];
    this.transformationProgress = 0.0;
    this.elapsedTime = 0.0;

    // Initialize renderer transformation state
    if (this.planetoidRenderer && typeof this.planetoidRenderer.startTransformation === 'function') {
      this.planetoidRenderer.startTransformation({ targetStage: toStage });
    }

    // Publish lifecycle events
    if (this.eventBus && typeof this.eventBus.emit === 'function') {
      this.eventBus.emit(Events.TRANSFORMATION_STARTED, {
        currentStage: fromStage,
        targetStage: toStage,
        totalDuration: this.totalDuration,
      });
      this.eventBus.emit(Events.TRANSFORMATION_PHASE, {
        phase: this.phase,
        progress: 0.0,
        previousPhase: TransformationPhase.IDLE,
      });
    }

    return true;
  }

  /**
   * Alias for beginTransformation().
   * @param {number} [customFrom]
   * @param {number} [customTo]
   * @returns {boolean}
   */
  requestTransformation(customFrom, customTo) {
    return this.beginTransformation(customFrom, customTo);
  }

  /**
   * Cancels the active cinematic transformation safely without committing the target stage.
   */
  cancelTransformation() {
    if (this.state !== TransformationState.TRANSFORMING) {
      return;
    }

    if (this.planetoidRenderer && typeof this.planetoidRenderer.cancelTransformation === 'function') {
      this.planetoidRenderer.cancelTransformation();
    }

    this.state = TransformationState.IDLE;
    this.phase = TransformationPhase.IDLE;
    this.transformationProgress = 0.0;
    this.elapsedTime = 0.0;
  }

  /**
   * Resets the transformation controller state to initial idle Stage 1 -> 2 configuration.
   */
  reset() {
    this.cancelTransformation();
    this.isReadyToTransform = false;
    this.activeTransitionKey = '1->2';
    this._setupTransitionPhases(TRANSITION_CONFIGS['1->2']);
  }

  /**
   * Development debug shortcut: unlocks the requested transition stage (ready-to-transform)
   * and immediately executes the real cinematic transformation pipeline.
   *
   * Usage:
   * - debugTransform()        -> runs current stage -> next stage (or 1->2 if at Stage 1)
   * - debugTransform(1, 2)    -> runs Stage 1 -> Stage 2
   * - debugTransform(2, 3)    -> runs Stage 2 -> Stage 3
   * - debugTransform(3, 4)    -> runs Stage 3 -> Stage 4
   * - debugTransform(4, 5)    -> runs Stage 4 -> Stage 5
   *
   * @param {number} [from]
   * @param {number} [to]
   * @returns {boolean} True if transformation started
   */
  debugTransform(from, to) {
    let fromStage = 1;
    let toStage = 2;

    if (typeof from === 'number' && Number.isFinite(from)) {
      fromStage = Math.max(1, Math.min(4, Math.floor(from)));
      toStage = (typeof to === 'number' && Number.isFinite(to))
        ? Math.max(fromStage + 1, Math.min(5, Math.floor(to)))
        : (fromStage + 1);
    } else if (this.evolutionController) {
      fromStage = this.evolutionController.getCurrentStage();
      toStage = this.evolutionController.getTargetStage() ?? (fromStage < 5 ? fromStage + 1 : 5);
      if (fromStage >= 5) {
        fromStage = 4;
        toStage = 5;
      }
    }

    if (this.evolutionController) {
      if (this.evolutionController.getCurrentStage() !== fromStage) {
        if (typeof this.evolutionController.resetAll === 'function') {
          this.evolutionController.resetAll(fromStage);
        }
      }
      if (this.evolutionController.getState() !== EvolutionState.READY_TO_TRANSFORM) {
        if (typeof this.evolutionController.debugUnlockNextStage === 'function') {
          this.evolutionController.debugUnlockNextStage();
        }
      }
    }

    this.isReadyToTransform = true;
    return this.beginTransformation(fromStage, toStage);
  }

  // ==========================================================================
  // 3. FRAME UPDATE & CHOREOGRAPHY PHASES
  // ==========================================================================

  /**
   * Frame tick advancing cinematic transformation progress and choreography.
   *
   * @param {number} dt - Frame delta time in seconds
   */
  update(dt) {
    if (this.state !== TransformationState.TRANSFORMING) {
      return;
    }
    if (typeof dt !== 'number' || !Number.isFinite(dt) || dt <= 0) {
      return;
    }

    this.elapsedTime += dt;
    this.transformationProgress = Math.min(1.0, this.elapsedTime / this.totalDuration);

    const prevPhase = this.phase;
    const newPhase = this._resolvePhase(this.transformationProgress);

    if (newPhase !== prevPhase) {
      this.phase = newPhase;
      if (this.eventBus && typeof this.eventBus.emit === 'function') {
        this.eventBus.emit(Events.TRANSFORMATION_PHASE, {
          phase: this.phase,
          progress: this.transformationProgress,
          previousPhase: prevPhase,
        });
      }
    }

    // Compute phase-specific visual parameters
    const params = this._computePhaseVisuals(this.transformationProgress, this.phase);

    // Feed temporary cinematic parameters to renderer
    if (this.planetoidRenderer && typeof this.planetoidRenderer.updateTransformation === 'function') {
      this.planetoidRenderer.updateTransformation(this.transformationProgress, this.phase, params);
    }

    // Conclude on reaching 100%
    if (this.transformationProgress >= 1.0) {
      this._complete();
    }
  }

  /**
   * Configures phase durations and boundaries for a transition configuration.
   *
   * @private
   * @param {Object} config
   */
  _setupTransitionPhases(config) {
    this.activeConfig = config;
    this.activeFromStage = config.fromStage;
    this.activeTargetStage = config.toStage;

    this.durations = {
      ...config.defaultDurations,
      ...(this._customDurationOverrides || {}),
    };

    let cumulative = 0;
    this._phaseBoundaries = [];
    for (const phase of config.phases) {
      const d = (typeof this.durations[phase] === 'number' && Number.isFinite(this.durations[phase]) && this.durations[phase] > 0)
        ? this.durations[phase]
        : (config.defaultDurations[phase] ?? 0.5);
      cumulative += d;
      this._phaseBoundaries.push({
        phase,
        duration: d,
        endTime: cumulative,
        endNormalized: 0,
      });
    }

    this.totalDuration = Math.max(0.001, cumulative);
    for (const b of this._phaseBoundaries) {
      b.endNormalized = b.endTime / this.totalDuration;
    }

    // Retain Stage 1 -> 2 canonical references for backward compatibility
    if (config.fromStage === 1 && config.toStage === 2) {
      this._tChargeEnd = this._phaseBoundaries[0]?.endNormalized ?? 0.16216;
      this._tAwakenEnd = this._phaseBoundaries[1]?.endNormalized ?? 0.51351;
      this._tClimaxEnd = this._phaseBoundaries[2]?.endNormalized ?? 0.64865;
      this._tRevealEnd = this._phaseBoundaries[3]?.endNormalized ?? 0.86486;
      this._tSettleEnd = 1.0;
    }
  }

  /**
   * Resolves the active transformation phase from normalized progress.
   *
   * @private
   * @param {number} p
   * @returns {string}
   */
  _resolvePhase(p) {
    if (!this._phaseBoundaries || this._phaseBoundaries.length === 0) {
      return TransformationPhase.IDLE;
    }
    for (let i = 0; i < this._phaseBoundaries.length - 1; i++) {
      if (p < this._phaseBoundaries[i].endNormalized) {
        return this._phaseBoundaries[i].phase;
      }
    }
    return this._phaseBoundaries[this._phaseBoundaries.length - 1].phase;
  }

  /**
   * Computes choreography values for active transition across its distinct visual phases.
   *
   * @private
   * @param {number} p - Normalized transformation progress [0.0 .. 1.0]
   * @param {string} phase
   * @returns {Object}
   */
  _computePhaseVisuals(p, phase) {
    const key = this.activeTransitionKey || '1->2';

    if (key === '2->3') {
      return this._computeStage2To3Visuals(p, phase);
    } else if (key === '3->4') {
      return this._computeStage3To4Visuals(p, phase);
    } else if (key === '4->5') {
      return this._computeStage4To5Visuals(p, phase);
    }

    // Default: Stage 1 -> 2 (BASELINE PRESERVED)
    return this._computeStage1To2Visuals(p, phase);
  }

  /**
   * Stage 1 -> Stage 2 Visual Choreography (Mars-like Primordial -> Awakened Golden Mineral).
   * Total: 3.7s (Charge 0.6s, Awakening 1.3s, Climax 0.5s, Reveal 0.8s, Settle 0.5s).
   *
   * @private
   * @param {number} p
   * @param {string} phase
   * @returns {{ awakeningProgress: number, visualStage: number }}
   */
  _computeStage1To2Visuals(p, phase) {
    let awakeningProgress = 0.0;
    let visualStage = 1.0;

    switch (phase) {
      case TransformationPhase.CHARGE: {
        const subP = Math.max(0.0, Math.min(1.0, p / this._tChargeEnd));
        awakeningProgress = subP * 0.12;
        visualStage = 1.0;
        break;
      }
      case TransformationPhase.GEOLOGICAL_AWAKENING: {
        const span = this._tAwakenEnd - this._tChargeEnd;
        const subP = Math.max(0.0, Math.min(1.0, (p - this._tChargeEnd) / span));
        awakeningProgress = 0.12 + subP * (0.88 - 0.12);
        visualStage = 1.0 + subP * 0.70;
        break;
      }
      case TransformationPhase.CLIMAX: {
        const span = this._tClimaxEnd - this._tAwakenEnd;
        const subP = Math.max(0.0, Math.min(1.0, (p - this._tAwakenEnd) / span));
        awakeningProgress = 0.88 + subP * 0.12;
        visualStage = 1.70 + subP * 0.30;
        break;
      }
      case TransformationPhase.STAGE_2_REVEAL:
      case TransformationPhase.SETTLE:
      default: {
        awakeningProgress = 1.0;
        visualStage = 2.0;
        break;
      }
    }

    return { awakeningProgress, visualStage };
  }

  /**
   * Stage 2 -> Stage 3 Visual Choreography (Awakened Mineral -> Blue Ocean World).
   * Total: 4.0s (Cooling 0.8s, Moisture Formation 0.9s, Ocean Expansion 1.1s, Atmospheric Awakening 0.6s, Stage 3 Reveal 0.6s).
   *
   * @private
   * @param {number} p
   * @param {string} phase
   * @returns {Object}
   */
  _computeStage2To3Visuals(p, phase) {
    const b0 = this._phaseBoundaries[0]?.endNormalized ?? 0.20;
    const b1 = this._phaseBoundaries[1]?.endNormalized ?? 0.425;
    const b2 = this._phaseBoundaries[2]?.endNormalized ?? 0.70;
    const b3 = this._phaseBoundaries[3]?.endNormalized ?? 0.85;

    let visualStage = 2.0;
    let kintsugiGlow = 0.85;
    let oceanFill = 0.0;
    let atmosphereDensity = 0.0;

    switch (phase) {
      case TransformationPhase.COOLING: {
        const subP = Math.max(0.0, Math.min(1.0, p / b0));
        visualStage = 2.0 + subP * 0.15;
        kintsugiGlow = 0.85 - subP * 0.45;
        oceanFill = 0.0;
        atmosphereDensity = subP * 0.15;
        break;
      }
      case TransformationPhase.MOISTURE_FORMATION: {
        const subP = Math.max(0.0, Math.min(1.0, (p - b0) / (b1 - b0)));
        visualStage = 2.15 + subP * 0.30;
        kintsugiGlow = 0.40 - subP * 0.10;
        oceanFill = subP * 0.30;
        atmosphereDensity = 0.15 + subP * 0.20;
        break;
      }
      case TransformationPhase.OCEAN_EXPANSION: {
        const subP = Math.max(0.0, Math.min(1.0, (p - b1) / (b2 - b1)));
        visualStage = 2.45 + subP * 0.40;
        kintsugiGlow = 0.30 - subP * 0.10;
        oceanFill = 0.30 + subP * 0.45;
        atmosphereDensity = 0.35 + subP * 0.30;
        break;
      }
      case TransformationPhase.ATMOSPHERIC_AWAKENING: {
        const subP = Math.max(0.0, Math.min(1.0, (p - b2) / (b3 - b2)));
        visualStage = 2.85 + subP * 0.10;
        kintsugiGlow = 0.20 - subP * 0.05;
        oceanFill = 0.75 + subP * 0.10;
        atmosphereDensity = 0.65 + subP * 0.20;
        break;
      }
      case TransformationPhase.STAGE_3_REVEAL:
      default: {
        visualStage = 3.0;
        kintsugiGlow = 0.10;
        oceanFill = 0.85;
        atmosphereDensity = 0.85;
        break;
      }
    }

    return {
      visualStage,
      awakeningProgress: 1.0,
      kintsugiGlow,
      oceanFill,
      atmosphereDensity,
    };
  }

  /**
   * Stage 3 -> Stage 4 Visual Choreography (Blue Ocean -> Living Green World).
   * Total: 3.6s (Atmospheric Enrichment 0.7s, Land Awakening 0.9s, Vegetation Emergence 1.2s, Stage 4 Reveal 0.8s).
   *
   * @private
   * @param {number} p
   * @param {string} phase
   * @returns {Object}
   */
  _computeStage3To4Visuals(p, phase) {
    const b0 = this._phaseBoundaries[0]?.endNormalized ?? 0.1944;
    const b1 = this._phaseBoundaries[1]?.endNormalized ?? 0.4444;
    const b2 = this._phaseBoundaries[2]?.endNormalized ?? 0.7778;

    let visualStage = 3.0;
    let atmosphereDensity = 0.85;
    const oceanFill = 0.85;

    switch (phase) {
      case TransformationPhase.ATMOSPHERIC_ENRICHMENT: {
        const subP = Math.max(0.0, Math.min(1.0, p / b0));
        visualStage = 3.0 + subP * 0.20;
        atmosphereDensity = 0.85 + subP * 0.07;
        break;
      }
      case TransformationPhase.LAND_AWAKENING: {
        const subP = Math.max(0.0, Math.min(1.0, (p - b0) / (b1 - b0)));
        visualStage = 3.20 + subP * 0.30;
        atmosphereDensity = 0.92;
        break;
      }
      case TransformationPhase.VEGETATION_EMERGENCE: {
        const subP = Math.max(0.0, Math.min(1.0, (p - b1) / (b2 - b1)));
        visualStage = 3.50 + subP * 0.35;
        atmosphereDensity = 0.92 - subP * 0.02;
        break;
      }
      case TransformationPhase.STAGE_4_REVEAL:
      default: {
        visualStage = 4.0;
        atmosphereDensity = 0.90;
        break;
      }
    }

    return {
      visualStage,
      awakeningProgress: 1.0,
      atmosphereDensity,
      oceanFill,
    };
  }

  /**
   * Stage 4 -> Stage 5 Visual Choreography (Living Green -> Transcendent Celestial World).
   * Total: 4.3s (Global Energy 0.8s, Luminosity 1.1s, Atmosphere 0.8s, Ring 0.8s, Ascension 0.8s).
   *
   * @private
   * @param {number} p
   * @param {string} phase
   * @returns {Object}
   */
  _computeStage4To5Visuals(p, phase) {
    const b0 = this._phaseBoundaries[0]?.endNormalized ?? 0.186;
    const b1 = this._phaseBoundaries[1]?.endNormalized ?? 0.4419;
    const b2 = this._phaseBoundaries[2]?.endNormalized ?? 0.6279;
    const b3 = this._phaseBoundaries[3]?.endNormalized ?? 0.814;

    let visualStage = 4.0;
    let goldIgnited = 0.0;
    let shieldCharge = 0.0;
    let ringAlpha = 0.0;
    let atmosphereDensity = 0.90;
    let oceanFill = 0.85;

    switch (phase) {
      case TransformationPhase.GLOBAL_ENERGY_AWAKENING: {
        const subP = Math.max(0.0, Math.min(1.0, p / b0));
        visualStage = 4.0 + subP * 0.25;
        goldIgnited = subP * 0.30;
        shieldCharge = subP * 0.35;
        ringAlpha = 0.0;
        atmosphereDensity = 0.90 + subP * 0.05;
        oceanFill = 0.85 + subP * 0.10;
        break;
      }
      case TransformationPhase.PLANETARY_LUMINOSITY: {
        const subP = Math.max(0.0, Math.min(1.0, (p - b0) / (b1 - b0)));
        visualStage = 4.25 + subP * 0.40;
        goldIgnited = 0.30 + subP * 0.40;
        shieldCharge = 0.35 + subP * 0.35;
        ringAlpha = subP * 0.25;
        atmosphereDensity = 0.95 + subP * 0.05;
        oceanFill = 0.95 + subP * 0.05;
        break;
      }
      case TransformationPhase.CELESTIAL_ATMOSPHERE: {
        const subP = Math.max(0.0, Math.min(1.0, (p - b1) / (b2 - b1)));
        visualStage = 4.65 + subP * 0.20;
        goldIgnited = 0.70 + subP * 0.20;
        shieldCharge = 0.70 + subP * 0.20;
        ringAlpha = 0.25 + subP * 0.40;
        atmosphereDensity = 1.0;
        oceanFill = 1.0;
        break;
      }
      case TransformationPhase.RING_AWAKENING: {
        const subP = Math.max(0.0, Math.min(1.0, (p - b2) / (b3 - b2)));
        visualStage = 4.85 + subP * 0.11;
        goldIgnited = 0.90 + subP * 0.10;
        shieldCharge = 0.90 + subP * 0.10;
        ringAlpha = 0.65 + subP * 0.30;
        atmosphereDensity = 1.0;
        oceanFill = 1.0;
        break;
      }
      case TransformationPhase.CELESTIAL_ASCENSION:
      default: {
        visualStage = 5.0;
        goldIgnited = 1.0;
        shieldCharge = 1.0;
        ringAlpha = 0.95;
        atmosphereDensity = 1.0;
        oceanFill = 1.0;
        break;
      }
    }

    return {
      visualStage,
      awakeningProgress: 1.0,
      goldIgnited,
      shieldCharge,
      ringAlpha,
      atmosphereDensity,
      oceanFill,
    };
  }

  /**
   * Finalizes the transformation event upon reaching 100% progress.
   * Commits the new planetary stage through PlanetEvolutionController.completeTransformation().
   *
   * @private
   */
  _complete() {
    this.state = TransformationState.COMPLETE;
    this.phase = TransformationPhase.COMPLETE;

    const previousStage = this.activeFromStage ?? 1;
    const newStage = this.activeTargetStage ?? 2;

    // Settle renderer onto the new stage
    if (this.planetoidRenderer && typeof this.planetoidRenderer.finishTransformation === 'function') {
      this.planetoidRenderer.finishTransformation(newStage);
    }

    // Commit stage advancement on authoritative evolution controller
    if (this.evolutionController && typeof this.evolutionController.completeTransformation === 'function') {
      this.evolutionController.completeTransformation();
    }

    // Publish completion event for PlanetUnlockUI & celebration
    if (this.eventBus && typeof this.eventBus.emit === 'function') {
      this.eventBus.emit(Events.TRANSFORMATION_COMPLETED, {
        previousStage,
        newStage,
      });
    }

    // Return to idle state for normal gameplay continuation
    this.state = TransformationState.IDLE;
    this.phase = TransformationPhase.IDLE;
    this.transformationProgress = 0.0;
    this.elapsedTime = 0.0;
    this.isReadyToTransform = false;

    // Reset transition configuration to default for the next stage
    const nextTarget = newStage < 5 ? newStage + 1 : null;
    if (nextTarget !== null) {
      const nextKey = `${newStage}->${nextTarget}`;
      if (TRANSITION_CONFIGS[nextKey]) {
        this.activeTransitionKey = nextKey;
        this._setupTransitionPhases(TRANSITION_CONFIGS[nextKey]);
      }
    }
  }

  // ==========================================================================
  // 4. DEPENDENCY INJECTION & DISPOSAL
  // ==========================================================================

  /**
   * Binds or updates the PlanetEvolutionController reference.
   * @param {any} controller
   */
  setEvolutionController(controller) {
    this.evolutionController = controller || null;
  }

  /**
   * Binds or updates the PlanetoidRenderer reference.
   * @param {any} renderer
   */
  setPlanetoidRenderer(renderer) {
    this.planetoidRenderer = renderer || null;
  }

  /**
   * Binds or updates the EventBus reference.
   * @param {EventBus|null} bus
   */
  setEventBus(bus) {
    if (this._unsubStageReady && typeof this._unsubStageReady === 'function') {
      this._unsubStageReady();
      this._unsubStageReady = null;
    }
    this.eventBus = bus || null;
    if (this.eventBus && typeof this.eventBus.on === 'function') {
      this._unsubStageReady = this.eventBus.on(Events.STAGE_READY, (data) => {
        const fromStage = (typeof data?.currentStage === 'number')
          ? data.currentStage
          : (this.evolutionController ? this.evolutionController.getCurrentStage() : 1);
        const toStage = (typeof data?.targetStage === 'number')
          ? data.targetStage
          : (this.evolutionController ? (this.evolutionController.getTargetStage() ?? (fromStage + 1)) : (fromStage + 1));

        if (toStage === fromStage + 1 && fromStage >= 1 && fromStage < 5) {
          this.isReadyToTransform = true;
          if (this.autoTransform && this.state !== TransformationState.TRANSFORMING) {
            this.beginTransformation(fromStage, toStage);
          }
        }
      });
    }
  }

  /**
   * Cleans up event listeners and global debug reference.
   */
  destroy() {
    this.cancelTransformation();
    if (this._unsubStageReady && typeof this._unsubStageReady === 'function') {
      this._unsubStageReady();
      this._unsubStageReady = null;
    }
    const globalScope = typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null);
    if (globalScope && globalScope.celestialTransformation === this) {
      delete globalScope.celestialTransformation;
    }
  }
}

export default PlanetTransformationController;
