/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * ============================================================================
 * Celestial Kendama - PlanetEvolutionController
 * Subsystem: Gameplay & Planetary Evolution Foundation
 * ============================================================================
 *
 * Responsibilities:
 * 1. Tracks planetary evolution progression state between completed stages.
 * 2. Consumes gameplay energy (from scored catches via EventBus Events.SCORE).
 * 3. Normalizes and clamps progression (0.0 -> 1.0) toward target stage.
 * 4. Manages the evolution state machine:
 *      'playing' (progress < 1.0)
 *      'ready-to-transform' (progress === 1.0)
 * 5. Maps evolutionProgress directly to existing PlanetoidRenderer visual stage:
 *      visualStage = currentStage + evolutionProgress * (targetStage - currentStage)
 * 6. Dispatches lifecycle events on EventBus:
 *      'planet:evolution-progress' (Events.EVOLUTION_PROGRESS)
 *      'planet:stage-ready' (Events.STAGE_READY)
 *      'planet:stage-completed' (Events.STAGE_COMPLETED)
 * 7. Exposes development/debug API window.celestialEvolution for automated verification.
 * 8. Stops at the transformation boundary without auto-triggering cinematics or UI.
 */

import { Events } from '../contracts/Interfaces.js';
import { eventBus as defaultEventBus } from '../contracts/EventBus.js';

/**
 * State machine phases for planetary evolution.
 */
export const EvolutionState = Object.freeze({
  PLAYING: 'playing',
  READY_TO_TRANSFORM: 'ready-to-transform',
});

/**
 * Default cosmic energy required to evolve to the next planetary stage.
 * Can be overridden in constructor options or via setEvolutionEnergyRequired.
 */
export const DEFAULT_EVOLUTION_ENERGY_REQUIRED = 100;

export const MIN_STAGE = 1;
export const MAX_STAGE = 5;

export class PlanetEvolutionController {
  /**
   * @param {Object} [options={}]
   * @param {number} [options.initialStage=1] - Starting planetary stage (1..5)
   * @param {number} [options.energyRequired=DEFAULT_EVOLUTION_ENERGY_REQUIRED] - Energy needed for 100% progress
   * @param {number} [options.threshold] - Alias for energyRequired
   * @param {EventBus|null} [options.eventBus=defaultEventBus] - EventBus for score events and progress broadcasting
   * @param {any} [options.planetoidRenderer=null] - PlanetoidRenderer instance for continuous visualStage mapping
   * @param {boolean} [options.autoSubscribeScore=true] - Whether to listen to Events.SCORE on eventBus
   * @param {boolean} [options.exposeGlobal=true] - Whether to expose instance as window.celestialEvolution
   */
  constructor(options = {}) {
    const rawInitial = options.initialStage ?? MIN_STAGE;
    this.currentStage = Math.max(MIN_STAGE, Math.min(MAX_STAGE, Math.floor(rawInitial)));
    this.targetStage = this.currentStage < MAX_STAGE ? this.currentStage + 1 : null;

    this.evolutionProgress = 0.0;
    this.evolutionEnergy = 0;
    this.evolutionEnergyRequired = options.energyRequired ?? options.threshold ?? DEFAULT_EVOLUTION_ENERGY_REQUIRED;

    this.state = EvolutionState.PLAYING;
    this.planetoidRenderer = options.planetoidRenderer ?? null;
    this.eventBus = options.eventBus !== undefined ? options.eventBus : defaultEventBus;

    this._unsubScore = null;

    if (options.autoSubscribeScore !== false && this.eventBus && typeof this.eventBus.on === 'function') {
      this._unsubScore = this.eventBus.on(Events.SCORE, (eventData) => this._handleScore(eventData));
    }

    // Expose global debug handle window.celestialEvolution
    const globalScope = typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null);
    if (options.exposeGlobal !== false && globalScope) {
      globalScope.celestialEvolution = this;
    }

    // Synchronize initial visual stage
    this._syncVisualStage();
  }

  // ==========================================================================
  // 1. STATE INSPECTION GETTERS
  // ==========================================================================

  /**
   * Returns current progression state: 'playing' or 'ready-to-transform'.
   * @returns {'playing' | 'ready-to-transform'}
   */
  getState() {
    return this.state;
  }

  /**
   * Returns currently active/unlocked planetary stage (1..5).
   * @returns {number}
   */
  getCurrentStage() {
    return this.currentStage;
  }

  /**
   * Returns target planetary stage being progressed toward (2..5), or null if at Stage 5.
   * @returns {number | null}
   */
  getTargetStage() {
    return this.targetStage;
  }

  /**
   * Returns normalized evolution progress toward target stage [0.0 .. 1.0].
   * @returns {number}
   */
  getEvolutionProgress() {
    return this.evolutionProgress;
  }

  /**
   * Returns accumulated gameplay energy toward current target stage.
   * @returns {number}
   */
  getEvolutionEnergy() {
    return this.evolutionEnergy;
  }

  /**
   * Returns the energy required to reach 100% evolution progress.
   * @returns {number}
   */
  getEvolutionEnergyRequired() {
    return this.evolutionEnergyRequired;
  }

  /**
   * Updates the energy required to reach 100% progress.
   * Recalculates current normalized progress against the new threshold.
   *
   * @param {number} required
   */
  setEvolutionEnergyRequired(required) {
    if (typeof required !== 'number' || !Number.isFinite(required) || required <= 0) {
      return;
    }
    this.evolutionEnergyRequired = required;
    if (this.targetStage !== null && this.state !== EvolutionState.READY_TO_TRANSFORM) {
      this.evolutionProgress = Math.min(1.0, Math.max(0.0, this.evolutionEnergy / this.evolutionEnergyRequired));
      if (this.evolutionProgress >= 1.0) {
        this.evolutionProgress = 1.0;
        this.state = EvolutionState.READY_TO_TRANSFORM;
      }
      this._syncVisualStage();
      this._emitProgress();
    }
  }

  /**
   * Computes the continuous visual stage [1.0 .. 5.0] corresponding to
   * currentStage, targetStage, and evolutionProgress.
   *
   * Formula:
   *   targetStage !== null: currentStage + evolutionProgress * (targetStage - currentStage)
   *   targetStage === null: currentStage (5.0)
   *
   * @returns {number}
   */
  getVisualStage() {
    if (this.targetStage === null) {
      return this.currentStage;
    }
    return this.currentStage + this.evolutionProgress * (this.targetStage - this.currentStage);
  }

  /**
   * Returns immutable snapshot of full evolution controller state.
   * @returns {Object}
   */
  getSnapshot() {
    return {
      currentStage: this.currentStage,
      targetStage: this.targetStage,
      evolutionProgress: this.evolutionProgress,
      evolutionEnergy: this.evolutionEnergy,
      evolutionEnergyRequired: this.evolutionEnergyRequired,
      state: this.state,
      visualStage: this.getVisualStage(),
    };
  }

  // ==========================================================================
  // 2. EVOLUTION PROGRESSION & GAMEPLAY INGESTION
  // ==========================================================================

  /**
   * Ingests evolution energy contributed by gameplay (e.g. scored catch).
   * Advances evolutionProgress [0.0 .. 1.0].
   * When progress reaches 1.0, transitions state to 'ready-to-transform'.
   * Stops at this boundary without committing the stage or starting cinematics.
   *
   * @param {number} amount - Positive energy quantity
   * @returns {number} Updated evolutionProgress
   */
  addEvolutionEnergy(amount) {
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
      return this.evolutionProgress;
    }
    if (this.targetStage === null) {
      return this.evolutionProgress;
    }
    if (this.state === EvolutionState.READY_TO_TRANSFORM) {
      return this.evolutionProgress;
    }

    this.evolutionEnergy += amount;
    this.evolutionProgress = Math.min(1.0, Math.max(0.0, this.evolutionEnergy / this.evolutionEnergyRequired));

    const reachedThreshold = this.evolutionProgress >= 1.0;
    if (reachedThreshold) {
      this.evolutionProgress = 1.0;
      this.state = EvolutionState.READY_TO_TRANSFORM;
    }

    this._syncVisualStage();
    this._emitProgress();

    if (reachedThreshold) {
      this._emitStageReady();
    }

    return this.evolutionProgress;
  }

  /**
   * Sets the normalized evolution progress directly [0.0 .. 1.0].
   * Clamps input and synchronizes energy and visual stage accordingly.
   *
   * @param {number} progress - Float between 0.0 and 1.0
   * @returns {number} Clamped evolutionProgress
   */
  setEvolutionProgress(progress) {
    if (typeof progress !== 'number' || !Number.isFinite(progress)) {
      return this.evolutionProgress;
    }
    if (this.targetStage === null) {
      return this.evolutionProgress;
    }

    const clamped = Math.min(1.0, Math.max(0.0, progress));
    this.evolutionProgress = clamped;
    this.evolutionEnergy = Math.round(clamped * this.evolutionEnergyRequired);

    const reachedThreshold = clamped >= 1.0;
    if (reachedThreshold) {
      this.state = EvolutionState.READY_TO_TRANSFORM;
    } else {
      this.state = EvolutionState.PLAYING;
    }

    this._syncVisualStage();
    this._emitProgress();

    if (reachedThreshold) {
      this._emitStageReady();
    }

    return this.evolutionProgress;
  }

  /**
   * Development debug shortcut: sets evolution progress to 100% and
   * transitions to 'ready-to-transform' without playing a cinematic.
   *
   * @returns {'ready-to-transform' | 'playing'} Updated state
   */
  debugUnlockNextStage() {
    this.setEvolutionProgress(1.0);
    return this.getState();
  }

  /**
   * Resets evolution energy and progress back to 0 for the current stage.
   * State returns to 'playing'.
   *
   * @returns {'playing'} Updated state
   */
  resetEvolution() {
    this.evolutionEnergy = 0;
    this.evolutionProgress = 0.0;
    this.state = EvolutionState.PLAYING;

    this._syncVisualStage();
    this._emitProgress();

    return this.getState();
  }

  /**
   * Full reset back to a specified stage (defaults to Stage 1).
   *
   * @param {number} [initialStage=1]
   */
  resetAll(initialStage = 1) {
    this.currentStage = Math.max(MIN_STAGE, Math.min(MAX_STAGE, Math.floor(initialStage)));
    this.targetStage = this.currentStage < MAX_STAGE ? this.currentStage + 1 : null;
    this.evolutionProgress = 0.0;
    this.evolutionEnergy = 0;
    this.state = EvolutionState.PLAYING;

    this._syncVisualStage();
    this._emitProgress();
  }

  // ==========================================================================
  // 3. STAGE ADVANCEMENT API (Called by Future Transformation Controller)
  // ==========================================================================

  /**
   * Commits the transformation to the target stage.
   * Called by the future PlanetTransformationController once the transformation finishes.
   *
   * Actions:
   * 1. targetStage becomes currentStage
   * 2. next target is established (or null if Stage 5 reached)
   * 3. evolutionProgress resets to 0.0
   * 4. evolutionEnergy resets to 0
   * 5. state returns to 'playing'
   * 6. updates renderer visualStage
   * 7. emits 'planet:stage-completed' and reset 'planet:evolution-progress'
   *
   * @returns {{ previousStage: number, currentStage: number, targetStage: number | null } | null}
   */
  completeTransformation() {
    if (this.targetStage === null) {
      return null;
    }

    const previousStage = this.currentStage;
    const nextCurrent = this.targetStage;

    this.currentStage = nextCurrent;
    this.targetStage = this.currentStage < MAX_STAGE ? this.currentStage + 1 : null;
    this.evolutionProgress = 0.0;
    this.evolutionEnergy = 0;
    this.state = EvolutionState.PLAYING;

    this._syncVisualStage();

    if (this.eventBus && typeof this.eventBus.emit === 'function') {
      this.eventBus.emit(Events.STAGE_COMPLETED, {
        previousStage,
        currentStage: this.currentStage,
        targetStage: this.targetStage,
        visualStage: this.getVisualStage(),
      });
    }

    this._emitProgress();

    return {
      previousStage,
      currentStage: this.currentStage,
      targetStage: this.targetStage,
    };
  }

  // ==========================================================================
  // 4. SUBSYSTEM CONNECTIONS & LIFECYCLE
  // ==========================================================================

  /**
   * Sets or replaces the PlanetoidRenderer instance.
   * Immediately synchronizes the renderer's continuous visualStage.
   *
   * @param {any} renderer
   */
  setPlanetoidRenderer(renderer) {
    this.planetoidRenderer = renderer || null;
    this._syncVisualStage();
  }

  /**
   * Sets or replaces the EventBus instance and updates subscriptions.
   *
   * @param {EventBus|null} bus
   */
  setEventBus(bus) {
    if (this._unsubScore && typeof this._unsubScore === 'function') {
      this._unsubScore();
      this._unsubScore = null;
    }
    this.eventBus = bus || null;
    if (this.eventBus && typeof this.eventBus.on === 'function') {
      this._unsubScore = this.eventBus.on(Events.SCORE, (eventData) => this._handleScore(eventData));
    }
  }

  /**
   * Frame tick hook (optional intra-frame synchronization).
   *
   * @param {number} _dt - Delta time in seconds
   */
  update(_dt) {
    // Reserved for optional continuous frame interpolation
  }

  /**
   * Ingests incoming EventBus SCORE event data.
   * Supports both wrapped ScoreEvent payloads ({ awardedEnergy, payload: { awardedEnergy } })
   * and raw numbers.
   *
   * @private
   * @param {any} eventData
   */
  _handleScore(eventData) {
    if (!eventData && eventData !== 0) return;

    let energy = 0;
    if (typeof eventData === 'number') {
      energy = eventData;
    } else if (typeof eventData === 'object') {
      energy = eventData.awardedEnergy ?? eventData.payload?.awardedEnergy ?? eventData.energy ?? 20;
    }

    if (energy > 0) {
      this.addEvolutionEnergy(energy);
    }
  }

  /**
   * Synchronizes visualStage with the attached PlanetoidRenderer.
   * @private
   */
  _syncVisualStage() {
    if (this.planetoidRenderer && typeof this.planetoidRenderer.setVisualStage === 'function') {
      if (this.planetoidRenderer.isAwakeningPlaying) {
        return;
      }
      this.planetoidRenderer.setVisualStage(this.getVisualStage());
    }
  }

  /**
   * Emits 'planet:evolution-progress' on EventBus.
   * @private
   */
  _emitProgress() {
    if (this.eventBus && typeof this.eventBus.emit === 'function') {
      this.eventBus.emit(Events.EVOLUTION_PROGRESS, this.getSnapshot());
    }
  }

  /**
   * Emits 'planet:stage-ready' on EventBus.
   * @private
   */
  _emitStageReady() {
    if (this.eventBus && typeof this.eventBus.emit === 'function') {
      this.eventBus.emit(Events.STAGE_READY, {
        currentStage: this.currentStage,
        targetStage: this.targetStage,
        evolutionProgress: 1.0,
        state: this.state,
        visualStage: this.getVisualStage(),
      });
    }
  }

  /**
   * Cleans up event listeners and global debug reference.
   */
  destroy() {
    if (this._unsubScore && typeof this._unsubScore === 'function') {
      this._unsubScore();
      this._unsubScore = null;
    }
    const globalScope = typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null);
    if (globalScope && globalScope.celestialEvolution === this) {
      delete globalScope.celestialEvolution;
    }
  }
}

export default PlanetEvolutionController;
