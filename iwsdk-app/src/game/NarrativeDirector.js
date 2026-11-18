/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * ============================================================================
 * Celestial Kendama - NarrativeDirector (Phase 2)
 * Subsystem: Cosmic Narrative & Scientific Storyline Bridge
 * ============================================================================
 *
 * Pure, event-driven coordinator bridging the existing planetary evolution/transformation
 * pipeline and the pure OrreryState scientific narrative state model.
 *
 * Architectural Guarantees:
 * 1. Zero rendering / Three.js / WebXR / DOM dependencies.
 * 2. Zero gameplay energy / scoring math; PlanetEvolutionController remains the
 *    sole authoritative owner of gameplay progression energy.
 * 3. Zero transformation execution; PlanetTransformationController remains the
 *    sole authoritative owner of planetary transformation cinematics.
 * 4. Observes existing verified EventBus events:
 *      - Events.EVOLUTION_PROGRESS ('planet:evolution-progress')
 *      - Events.STAGE_READY ('planet:stage-ready')
 *      - Events.TRANSFORMATION_STARTED ('planet:transformation-started')
 *      - Events.TRANSFORMATION_COMPLETED ('planet:transformation-completed')
 * 5. Strict lifecycle state machine: IDLE -> READY -> EXECUTING -> COMPLETED.
 * 6. Guarded against duplicate, stale, or out-of-order event deliveries.
 * 7. Strictly monotonic 5-chapter progression with terminal Chapter 5 (no Chapter 6).
 */

import { Events } from '../contracts/Interfaces.js';
import { eventBus as defaultEventBus } from '../contracts/EventBus.js';
import OrreryState, {
  ManeuverStatus,
  OrbitalState
} from './OrreryState.js';

/**
 * Narrative lifecycle states for cosmic maneuver coordination.
 */
export const NarrativeLifecycle = Object.freeze({
  IDLE: 'IDLE',
  READY: 'READY',
  EXECUTING: 'EXECUTING',
  COMPLETED: 'COMPLETED'
});

/**
 * Canonical chapter definitions mapping the 5 cosmic narrative epochs to
 * orbital states and planetary stage unlocks.
 */
export const CHAPTER_DEFINITIONS = Object.freeze({
  1: Object.freeze({
    chapter: 1,
    name: 'Three-Body Capture',
    initialState: OrbitalState.HYPERBOLIC,
    executionState: OrbitalState.CAPTURE_BURN,
    finalState: OrbitalState.BOUND_ECCENTRIC,
    sourceStage: 1,
    targetStage: 2,
    terminal: false
  }),
  2: Object.freeze({
    chapter: 2,
    name: 'Binary Resonance',
    initialState: OrbitalState.CHAOTIC_CIRCUMBINARY,
    executionState: OrbitalState.RESONANCE_STABILIZATION,
    finalState: OrbitalState.RESONANCE_2_1,
    sourceStage: 2,
    targetStage: 3,
    terminal: false
  }),
  3: Object.freeze({
    chapter: 3,
    name: 'Gravity Assist',
    initialState: OrbitalState.BINARY_TRANSFER,
    executionState: OrbitalState.GRAVITY_ASSIST,
    finalState: OrbitalState.BOUND_OUTER_ORBIT,
    sourceStage: 3,
    targetStage: 4,
    terminal: false
  }),
  4: Object.freeze({
    chapter: 4,
    name: 'Roche Disruption',
    initialState: OrbitalState.SATELLITE_APPROACH,
    executionState: OrbitalState.ROCHE_SHEPHERDING,
    finalState: OrbitalState.RING_FORMED,
    sourceStage: 4,
    targetStage: 5,
    terminal: false
  }),
  5: Object.freeze({
    chapter: 5,
    name: 'Supernova Deflection',
    initialState: OrbitalState.SUPERNOVA_THREAT,
    executionState: OrbitalState.SUPERNOVA_DEFLECTION,
    finalState: OrbitalState.ATMOSPHERE_PROTECTED,
    sourceStage: 5,
    targetStage: 5,
    terminal: true
  })
});

/**
 * Total count of narrative chapters in the storyline.
 */
export const TOTAL_CHAPTERS = 5;

/**
 * NarrativeDirector - Pure event-driven narrative bridge coordinator.
 */
export class NarrativeDirector {
  /**
   * @param {Object} [options={}]
   * @param {EventBus} [options.eventBus=defaultEventBus]
   * @param {OrreryState} [options.orreryState]
   */
  constructor(options = {}) {
    this.eventBus = options.eventBus !== undefined ? options.eventBus : defaultEventBus;
    this.orreryState = options.orreryState || new OrreryState();

    this._currentChapter = this.orreryState.getChapter() || 1;
    this.lifecycleState = NarrativeLifecycle.IDLE;
    this._unsubs = [];

    // Phase 2C Step 3: Dual-condition Chapter 1 completion gate
    this._ch1AlignmentCompleted = false;
    this._ch1EvolutionCompleted = false;

    // Phase 4A: Dual-condition Chapter 2 completion gate
    this._ch2ResonanceCompleted = false;
    this._ch2EvolutionCompleted = false;

    // Align initial OrreryState configuration with active chapter
    const currentDef = this.getCurrentChapterDefinition();
    if (currentDef) {
      this.orreryState.setOrbitalState(currentDef.initialState);
      this.orreryState.setManeuverStatus(ManeuverStatus.CALIBRATING);
    }

    // Subscribe to authoritative EventBus pipeline events
    if (this.eventBus && typeof this.eventBus.on === 'function') {
      const unsubProgress = this.eventBus.on(Events.EVOLUTION_PROGRESS, (payload) => {
        this._handleEvolutionProgress(payload);
      });
      if (typeof unsubProgress === 'function') this._unsubs.push(unsubProgress);

      const unsubStageReady = this.eventBus.on(Events.STAGE_READY, (payload) => {
        this._handleStageReady(payload);
      });
      if (typeof unsubStageReady === 'function') this._unsubs.push(unsubStageReady);

      const unsubStart = this.eventBus.on(Events.TRANSFORMATION_STARTED, (payload) => {
        this._handleTransformationStarted(payload);
      });
      if (typeof unsubStart === 'function') this._unsubs.push(unStart => unStart()); // safe storage
      // Re-assign accurate function
      if (typeof unsubStart === 'function') {
        this._unsubs[this._unsubs.length - 1] = unsubStart;
      }

      const unsubComplete = this.eventBus.on(Events.TRANSFORMATION_COMPLETED, (payload) => {
        this._handleTransformationCompleted(payload);
      });
      if (typeof unsubComplete === 'function') this._unsubs.push(unsubComplete);

      const unsubAlignment = this.eventBus.on(Events.ORRERY_ALIGNMENT_COMPLETED, (payload) => {
        this._handleAlignmentCompleted(payload);
      });
      if (typeof unsubAlignment === 'function') this._unsubs.push(unsubAlignment);

      const unsubResonance = this.eventBus.on(Events.ORRERY_RESONANCE_COMPLETED, (payload) => {
        this._handleResonanceCompleted(payload);
      });
      if (typeof unsubResonance === 'function') this._unsubs.push(unsubResonance);
    }
  }

  // ==========================================================================
  // 1. STATE INSPECTION & QUERY APIS
  // ==========================================================================

  /**
   * Returns an immutable snapshot of current narrative director state.
   *
   * @returns {Readonly<{
   *   chapter: number,
   *   chapterDefinition: Object,
   *   maneuverStatus: string,
   *   orbitalState: string,
   *   calibrationProgress: number,
   *   lifecycleState: string,
   *   terminal: boolean,
   *   isReady: boolean,
   *   isExecuting: boolean,
   *   isComplete: boolean,
   *   ch1AlignmentCompleted: boolean,
   *   ch1EvolutionCompleted: boolean
   * }>}
   */
  getState() {
    const chapterDef = this.getCurrentChapterDefinition();
    return Object.freeze({
      chapter: this._currentChapter,
      chapterDefinition: chapterDef,
      maneuverStatus: this.orreryState.getManeuverStatus(),
      orbitalState: this.orreryState.getOrbitalState(),
      calibrationProgress: this.orreryState.getCalibrationProgress(),
      lifecycleState: this.lifecycleState,
      terminal: Boolean(chapterDef?.terminal),
      isReady: this.isReady(),
      isExecuting: this.isExecuting(),
      isComplete: this.isComplete(),
      ch1AlignmentCompleted: this._ch1AlignmentCompleted,
      ch1EvolutionCompleted: this._ch1EvolutionCompleted,
      ch2ResonanceCompleted: this._ch2ResonanceCompleted,
      ch2EvolutionCompleted: this._ch2EvolutionCompleted
    });
  }

  /**
   * Returns whether Chapter 1 Three-Body alignment has completed.
   * @returns {boolean}
   */
  isCh1AlignmentCompleted() {
    return this._ch1AlignmentCompleted;
  }

  /**
   * Returns whether Chapter 1 planet evolution transformation has completed.
   * @returns {boolean}
   */
  isCh1EvolutionCompleted() {
    return this._ch1EvolutionCompleted;
  }

  /**
   * Returns whether Chapter 2 Binary Resonance has completed.
   * @returns {boolean}
   */
  isCh2ResonanceCompleted() {
    return this._ch2ResonanceCompleted;
  }

  /**
   * Returns whether Chapter 2 planet evolution transformation has completed.
   * @returns {boolean}
   */
  isCh2EvolutionCompleted() {
    return this._ch2EvolutionCompleted;
  }

  /**
   * Returns current active chapter number (1..5).
   * @returns {number}
   */
  getChapter() {
    return this._currentChapter;
  }

  /**
   * Returns current OrreryState maneuver status.
   * @returns {string}
   */
  getManeuverStatus() {
    return this.orreryState.getManeuverStatus();
  }

  /**
   * Returns current OrreryState orbital state.
   * @returns {string}
   */
  getOrbitalState() {
    return this.orreryState.getOrbitalState();
  }

  /**
   * Returns current calibration/evolution progress [0.0 .. 1.0].
   * @returns {number}
   */
  getCalibrationProgress() {
    return this.orreryState.getCalibrationProgress();
  }

  /**
   * Returns definition for the currently active chapter.
   * @returns {Readonly<Object>|null}
   */
  getCurrentChapterDefinition() {
    return this.getChapterDefinition(this._currentChapter);
  }

  /**
   * Returns definition for a specific chapter number (1..5).
   * Rejects invalid or out-of-range chapters.
   *
   * @param {number} chapter
   * @returns {Readonly<Object>|null}
   */
  getChapterDefinition(chapter) {
    const num = Math.floor(Number(chapter));
    if (!Number.isFinite(num) || num < 1 || num > TOTAL_CHAPTERS) {
      return null;
    }
    return CHAPTER_DEFINITIONS[num] || null;
  }

  /**
   * Returns whether the narrative maneuver is currently ready for execution.
   * @returns {boolean}
   */
  isReady() {
    return this.lifecycleState === NarrativeLifecycle.READY;
  }

  /**
   * Returns whether a planetary transformation corresponding to the active chapter is executing.
   * @returns {boolean}
   */
  isExecuting() {
    return this.lifecycleState === NarrativeLifecycle.EXECUTING;
  }

  /**
   * Returns whether the terminal narrative has completed.
   * Becomes permanently true after Chapter 5 completes until reset() is called.
   * @returns {boolean}
   */
  isComplete() {
    return this.lifecycleState === NarrativeLifecycle.COMPLETED && this._currentChapter === TOTAL_CHAPTERS;
  }

  // ==========================================================================
  // 2. STATE-MODEL TRANSITION OPERATIONS
  // ==========================================================================

  /**
   * Prepares the current chapter for execution.
   * Establishes initial orbital state and maneuver status.
   * Does NOT trigger transformation, emit events, or modify energy.
   *
   * @returns {boolean}
   */
  prepareManeuver() {
    if (this.isComplete()) {
      return false;
    }
    const def = this.getCurrentChapterDefinition();
    if (!def) return false;

    this.lifecycleState = NarrativeLifecycle.IDLE;
    this.orreryState.setChapter(this._currentChapter);
    this.orreryState.setOrbitalState(def.initialState);
    this.orreryState.setManeuverStatus(ManeuverStatus.CALIBRATING);
    this.orreryState.setCalibrationProgress(0.0);
    return true;
  }

  /**
   * Transitions the narrative state machine into its execution state.
   * Used for tests and deterministic debugging.
   * Does NOT call beginTransformation() or bypass planetary systems.
   *
   * @returns {boolean} True if successfully transitioned to executing
   */
  startManeuver() {
    if (this.isComplete()) {
      return false;
    }
    const def = this.getCurrentChapterDefinition();
    if (!def) return false;

    this.lifecycleState = NarrativeLifecycle.EXECUTING;
    this.orreryState.setManeuverStatus(ManeuverStatus.EXECUTING);
    this.orreryState.setOrbitalState(def.executionState);
    return true;
  }

  /**
   * Finalizes the current narrative maneuver according to the active chapter definition.
   * Does NOT advance planetary stage directly.
   *
   * @returns {boolean} True if completed
   */
  completeManeuver() {
    if (this.lifecycleState !== NarrativeLifecycle.EXECUTING) {
      return false;
    }
    const currentDef = this.getCurrentChapterDefinition();
    if (!currentDef) return false;

    // Transition to final orbital state and mark COMPLETED
    this.orreryState.setOrbitalState(currentDef.finalState);
    this.orreryState.setManeuverStatus(ManeuverStatus.COMPLETED);

    // Chapter 5 Terminal Check
    if (currentDef.terminal || this._currentChapter >= TOTAL_CHAPTERS) {
      this._currentChapter = TOTAL_CHAPTERS;
      this.lifecycleState = NarrativeLifecycle.COMPLETED;
      return true;
    }

    // Chapters 1..4: Advance to next chapter
    const prevChapter = this._currentChapter;
    this.lifecycleState = NarrativeLifecycle.COMPLETED;
    this._currentChapter += 1;
    this.orreryState.setChapter(this._currentChapter);

    const nextDef = this.getCurrentChapterDefinition();
    if (nextDef) {
      this.orreryState.setOrbitalState(nextDef.initialState);
      this.orreryState.setManeuverStatus(ManeuverStatus.CALIBRATING);
      this.orreryState.setCalibrationProgress(0.0);
    }
    this.lifecycleState = NarrativeLifecycle.IDLE;

    if (this.eventBus && typeof this.eventBus.emit === 'function') {
      this.eventBus.emit(Events.ORRERY_CHAPTER_CHANGED, {
        chapter: this._currentChapter,
        previousChapter: prevChapter
      });
    }

    return true;
  }

  /**
   * Resets the narrative director and underlying OrreryState back to Chapter 1 defaults.
   * @returns {NarrativeDirector} this for chaining
   */
  reset() {
    this._currentChapter = 1;
    this._ch1AlignmentCompleted = false;
    this._ch1EvolutionCompleted = false;
    this._ch2ResonanceCompleted = false;
    this._ch2EvolutionCompleted = false;
    this.lifecycleState = NarrativeLifecycle.IDLE;
    this.orreryState.reset();
    return this;
  }

  /**
   * Cleans up all event listeners registered on the EventBus.
   * Idempotent; safe to call repeatedly.
   */
  destroy() {
    if (Array.isArray(this._unsubs)) {
      for (const unsub of this._unsubs) {
        if (typeof unsub === 'function') {
          try {
            unsub();
          } catch {
            // Ignore disposal errors
          }
        }
      }
      this._unsubs = [];
    }
  }

  /**
   * Alias for destroy().
   */
  dispose() {
    this.destroy();
  }

  // ==========================================================================
  // 3. PRIVATE EVENT HANDLERS (OBSERVING EXISTING PIPELINE)
  // ==========================================================================

  /**
   * Ingests EVOLUTION_PROGRESS updates from PlanetEvolutionController.
   * Directly updates orreryState.calibrationProgress without modifying energy.
   *
   * @private
   * @param {Object} payload
   */
  _handleEvolutionProgress(payload) {
    if (!payload || typeof payload !== 'object') return;
    const progress = payload.evolutionProgress;
    if (typeof progress === 'number' && Number.isFinite(progress)) {
      this.orreryState.setCalibrationProgress(progress);
    }
  }

  /**
   * Ingests STAGE_READY notification when planetary evolution hits 100%.
   * Guards against wrong targetStage, active execution, or terminal re-entry.
   *
   * @private
   * @param {Object} payload
   */
  _handleStageReady(payload) {
    if (this.isComplete()) {
      return;
    }
    if (this.lifecycleState === NarrativeLifecycle.EXECUTING) {
      return;
    }
    const currentDef = this.getCurrentChapterDefinition();
    if (!currentDef) return;

    if (payload?.targetStage !== currentDef.targetStage) {
      return;
    }

    this.lifecycleState = NarrativeLifecycle.READY;
    this.orreryState.setManeuverStatus(ManeuverStatus.READY);
  }

  /**
   * Ingests TRANSFORMATION_STARTED notification when cinematic begins.
   * Moves narrative lifecycle from READY to EXECUTING.
   *
   * @private
   * @param {Object} payload
   */
  _handleTransformationStarted(payload) {
    if (this.lifecycleState !== NarrativeLifecycle.READY) {
      return;
    }
    const currentDef = this.getCurrentChapterDefinition();
    if (!currentDef) return;

    if (payload?.targetStage !== currentDef.targetStage) {
      return;
    }

    this.lifecycleState = NarrativeLifecycle.EXECUTING;
    this.orreryState.setManeuverStatus(ManeuverStatus.EXECUTING);
    this.orreryState.setOrbitalState(currentDef.executionState);
  }

  /**
   * Ingests ORRERY_ALIGNMENT_COMPLETED notification when Chapter 1 Three-Body
   * alignment cinematic completes at t >= 3.45s.
   *
   * @private
   * @param {Object} [payload]
   */
  _handleAlignmentCompleted(payload) {
    if (this._currentChapter !== 1) {
      return;
    }
    const chapter = payload?.chapter ?? 1;
    if (chapter !== 1) {
      return;
    }

    this._ch1AlignmentCompleted = true;
    this._evaluateChapter1Advance();
  }

  /**
   * Ingests ORRERY_RESONANCE_COMPLETED notification when Chapter 2 Binary
   * Resonance milestone cinematic completes at t >= 2.0s.
   *
   * @private
   * @param {Object} [payload]
   */
  _handleResonanceCompleted(payload) {
    if (this._currentChapter !== 2) {
      return;
    }
    const chapter = payload?.chapter ?? 2;
    if (chapter !== 2) {
      return;
    }

    this._ch2ResonanceCompleted = true;
    this._evaluateChapter2Advance();
  }

  /**
   * Ingests TRANSFORMATION_COMPLETED notification when planet transformation commits.
   * Enforces strict matching:
   * - payload.newStage must match chapter targetStage
   * - payload.previousStage must match expected source stage
   *
   * @private
   * @param {Object} payload
   */
  _handleTransformationCompleted(payload) {
    const currentDef = this.getCurrentChapterDefinition();
    if (!currentDef) return;

    const prev = payload?.previousStage;
    const next = payload?.newStage;

    if (next !== currentDef.targetStage) {
      return;
    }

    const expectedSource = currentDef.sourceStage;
    if (prev !== expectedSource && !(this._currentChapter === TOTAL_CHAPTERS && prev === 4)) {
      return;
    }

    // Phase 2C Step 3: In Chapter 1, do NOT automatically advance to Chapter 2.
    // Record evolution completion and advance only when both alignment and evolution conditions are satisfied.
    if (this._currentChapter === 1) {
      this._ch1EvolutionCompleted = true;
      this._evaluateChapter1Advance();
      return;
    }

    // Phase 4A: In Chapter 2, do NOT automatically advance to Chapter 3.
    // Record evolution completion and advance only when both resonance and evolution conditions are satisfied.
    if (this._currentChapter === 2) {
      this._ch2EvolutionCompleted = true;
      this._evaluateChapter2Advance();
      return;
    }

    if (this.lifecycleState !== NarrativeLifecycle.EXECUTING) {
      return;
    }

    this.completeManeuver();
  }

  /**
   * Evaluates the Chapter 1 completion gate.
   * Advances from Chapter 1 to Chapter 2 IF AND ONLY IF both:
   * 1. Three-Body Capture alignment cinematic completed (_ch1AlignmentCompleted === true)
   * 2. Planet Stage 1 -> 2 evolution transformation completed (_ch1EvolutionCompleted === true)
   *
   * @private
   */
  _evaluateChapter1Advance() {
    if (this._currentChapter !== 1) {
      return;
    }
    if (this._ch1AlignmentCompleted && this._ch1EvolutionCompleted) {
      this.lifecycleState = NarrativeLifecycle.EXECUTING;
      this.completeManeuver();
    }
  }

  /**
   * Evaluates the Chapter 2 completion gate.
   * Advances from Chapter 2 to Chapter 3 IF AND ONLY IF both:
   * 1. Binary Resonance milestone completed (_ch2ResonanceCompleted === true)
   * 2. Planet Stage 2 -> 3 evolution transformation completed (_ch2EvolutionCompleted === true)
   *
   * @private
   */
  _evaluateChapter2Advance() {
    if (this._currentChapter !== 2) {
      return;
    }
    if (this._ch2ResonanceCompleted && this._ch2EvolutionCompleted) {
      this.lifecycleState = NarrativeLifecycle.EXECUTING;
      this.completeManeuver();
    }
  }
}

export default NarrativeDirector;
