/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * ============================================================================
 * Celestial Kendama - OrreryState (Phase 1)
 * Subsystem: Cosmic Narrative & Scientific Orrery State Model
 * ============================================================================
 *
 * Pure, dependency-free scientific narrative state model for the five-chapter
 * Orrery storyline in Celestial Kendama.
 *
 * Architectural Guarantees:
 * 1. Zero dependencies: No Three.js, WebXR, DOM, EventBus, or physics imports.
 * 2. Zero scoring/energy duplication: PlanetEvolutionController remains the sole
 *    authoritative source of gameplay evolution energy. OrreryState does NOT track
 *    energy, score, or subscribe to Events.SCORE.
 * 3. Lightweight deterministic state container: No allocations per frame, no
 *    vector math, no orbital integration, no timers.
 * 4. Immutable snapshot generation via getSnapshot().
 * 5. Chapter boundary enforcement (1..5) with zero possibility of Chapter 6.
 * 6. Normalized property clamping for calibration, Roche disruption, and shield charge.
 */

/**
 * Canonical maneuver statuses for scientific progression within an orbital chapter.
 */
export const ManeuverStatus = Object.freeze({
  CALIBRATING: 'CALIBRATING',
  READY: 'READY',
  EXECUTING: 'EXECUTING',
  COMPLETED: 'COMPLETED'
});

/**
 * Canonical orbital states across the five narrative chapters.
 */
export const OrbitalState = Object.freeze({
  // Chapter 1: Three-Body Capture
  HYPERBOLIC: 'HYPERBOLIC',
  CAPTURE_BURN: 'CAPTURE_BURN',
  BOUND_ECCENTRIC: 'BOUND_ECCENTRIC',

  // Chapter 2: Binary Resonance
  CHAOTIC_CIRCUMBINARY: 'CHAOTIC_CIRCUMBINARY',
  RESONANCE_STABILIZATION: 'RESONANCE_STABILIZATION',
  RESONANCE_2_1: 'RESONANCE_2_1',

  // Chapter 3: Gravity Assist
  BINARY_TRANSFER: 'BINARY_TRANSFER',
  GRAVITY_ASSIST: 'GRAVITY_ASSIST',
  BOUND_OUTER_ORBIT: 'BOUND_OUTER_ORBIT',

  // Chapter 4: Roche Disruption
  SATELLITE_APPROACH: 'SATELLITE_APPROACH',
  ROCHE_SHEPHERDING: 'ROCHE_SHEPHERDING',
  RING_FORMED: 'RING_FORMED',

  // Chapter 5: Supernova Deflection
  SUPERNOVA_THREAT: 'SUPERNOVA_THREAT',
  SUPERNOVA_DEFLECTION: 'SUPERNOVA_DEFLECTION',
  ATMOSPHERE_PROTECTED: 'ATMOSPHERE_PROTECTED'
});

/**
 * Canonical chapter boundaries.
 * Chapter 5 is the terminal chapter; there is no Chapter 6.
 */
export const MIN_CHAPTER = 1;
export const MAX_CHAPTER = 5;

/**
 * Canonical chapter-to-orbital-state sequence mappings.
 */
export const CHAPTER_ORBITAL_STATES = Object.freeze({
  1: Object.freeze([
    OrbitalState.HYPERBOLIC,
    OrbitalState.CAPTURE_BURN,
    OrbitalState.BOUND_ECCENTRIC
  ]),
  2: Object.freeze([
    OrbitalState.CHAOTIC_CIRCUMBINARY,
    OrbitalState.RESONANCE_STABILIZATION,
    OrbitalState.RESONANCE_2_1
  ]),
  3: Object.freeze([
    OrbitalState.BINARY_TRANSFER,
    OrbitalState.GRAVITY_ASSIST,
    OrbitalState.BOUND_OUTER_ORBIT
  ]),
  4: Object.freeze([
    OrbitalState.SATELLITE_APPROACH,
    OrbitalState.ROCHE_SHEPHERDING,
    OrbitalState.RING_FORMED
  ]),
  5: Object.freeze([
    OrbitalState.SUPERNOVA_THREAT,
    OrbitalState.SUPERNOVA_DEFLECTION,
    OrbitalState.ATMOSPHERE_PROTECTED
  ])
});

/**
 * Canonical default configuration for OrreryState.
 */
export const DEFAULT_ORRERY_STATE = Object.freeze({
  chapter: 1,
  orbitalState: OrbitalState.HYPERBOLIC,
  maneuverStatus: ManeuverStatus.CALIBRATING,
  calibrationProgress: 0.0,
  eccentricity: 1.25,
  semiMajorAxis: 3.5,
  resonanceRatio: 0.0,
  rocheProgress: 0.0,
  shieldCharge: 0.0
});

/**
 * Validates whether an orbital state string belongs to the canonical states for a given chapter.
 * @param {number} chapter
 * @param {string} orbitalState
 * @returns {boolean}
 */
export function isOrbitalStateValidForChapter(chapter, orbitalState) {
  const allowed = CHAPTER_ORBITAL_STATES[chapter];
  if (!allowed) return false;
  return allowed.includes(orbitalState);
}

/**
 * Checks whether a given string is a valid recognized OrbitalState.
 * @param {string} state
 * @returns {boolean}
 */
export function isValidOrbitalState(state) {
  return Object.values(OrbitalState).includes(state);
}

/**
 * Checks whether a given string is a valid recognized ManeuverStatus.
 * @param {string} status
 * @returns {boolean}
 */
export function isValidManeuverStatus(status) {
  return Object.values(ManeuverStatus).includes(status);
}

/**
 * OrreryState - Pure scientific/narrative state model.
 */
export class OrreryState {
  /**
   * @param {Object} [initialOptions={}] - Optional initial state property overrides.
   */
  constructor(initialOptions = {}) {
    this._chapter = DEFAULT_ORRERY_STATE.chapter;
    this._orbitalState = DEFAULT_ORRERY_STATE.orbitalState;
    this._maneuverStatus = DEFAULT_ORRERY_STATE.maneuverStatus;
    this._calibrationProgress = DEFAULT_ORRERY_STATE.calibrationProgress;
    this._eccentricity = DEFAULT_ORRERY_STATE.eccentricity;
    this._semiMajorAxis = DEFAULT_ORRERY_STATE.semiMajorAxis;
    this._resonanceRatio = DEFAULT_ORRERY_STATE.resonanceRatio;
    this._rocheProgress = DEFAULT_ORRERY_STATE.rocheProgress;
    this._shieldCharge = DEFAULT_ORRERY_STATE.shieldCharge;

    if (initialOptions && typeof initialOptions === 'object') {
      if (initialOptions.chapter !== undefined) {
        this.setChapter(initialOptions.chapter);
      }
      if (initialOptions.orbitalState !== undefined) {
        this.setOrbitalState(initialOptions.orbitalState);
      }
      if (initialOptions.maneuverStatus !== undefined) {
        this.setManeuverStatus(initialOptions.maneuverStatus);
      }
      if (initialOptions.calibrationProgress !== undefined) {
        this.setCalibrationProgress(initialOptions.calibrationProgress);
      }
      if (initialOptions.eccentricity !== undefined) {
        this.setEccentricity(initialOptions.eccentricity);
      }
      if (initialOptions.semiMajorAxis !== undefined) {
        this.setSemiMajorAxis(initialOptions.semiMajorAxis);
      }
      if (initialOptions.resonanceRatio !== undefined) {
        this.setResonanceRatio(initialOptions.resonanceRatio);
      }
      if (initialOptions.rocheProgress !== undefined) {
        this.setRocheProgress(initialOptions.rocheProgress);
      }
      if (initialOptions.shieldCharge !== undefined) {
        this.setShieldCharge(initialOptions.shieldCharge);
      }
    }
  }

  // ==========================================================================
  // PROPERTY GETTERS & METHOD GETTERS
  // ==========================================================================

  get chapter() { return this._chapter; }
  get orbitalState() { return this._orbitalState; }
  get maneuverStatus() { return this._maneuverStatus; }
  get calibrationProgress() { return this._calibrationProgress; }
  get eccentricity() { return this._eccentricity; }
  get semiMajorAxis() { return this._semiMajorAxis; }
  get resonanceRatio() { return this._resonanceRatio; }
  get rocheProgress() { return this._rocheProgress; }
  get shieldCharge() { return this._shieldCharge; }

  getChapter() { return this._chapter; }
  getOrbitalState() { return this._orbitalState; }
  getManeuverStatus() { return this._maneuverStatus; }
  getCalibrationProgress() { return this._calibrationProgress; }
  getEccentricity() { return this._eccentricity; }
  getSemiMajorAxis() { return this._semiMajorAxis; }
  getResonanceRatio() { return this._resonanceRatio; }
  getRocheProgress() { return this._rocheProgress; }
  getShieldCharge() { return this._shieldCharge; }

  // ES Setters for property-style mutation
  set chapter(val) { this.setChapter(val); }
  set orbitalState(val) { this.setOrbitalState(val); }
  set maneuverStatus(val) { this.setManeuverStatus(val); }
  set calibrationProgress(val) { this.setCalibrationProgress(val); }
  set eccentricity(val) { this.setEccentricity(val); }
  set semiMajorAxis(val) { this.setSemiMajorAxis(val); }
  set resonanceRatio(val) { this.setResonanceRatio(val); }
  set rocheProgress(val) { this.setRocheProgress(val); }
  set shieldCharge(val) { this.setShieldCharge(val); }

  // ==========================================================================
  // STATE MUTATION METHODS
  // ==========================================================================

  /**
   * Sets the active chapter, clamped to valid boundaries [1..5].
   * Rejects non-finite values. If the current orbital state does not belong to
   * the newly set chapter, it aligns to the initial state of the chapter.
   *
   * @param {number} chapter
   * @returns {boolean} True if successfully updated.
   */
  setChapter(chapter) {
    const parsed = Math.floor(Number(chapter));
    if (!Number.isFinite(parsed)) {
      console.warn(`[OrreryState] Invalid chapter: ${chapter}`);
      return false;
    }
    const clamped = Math.max(MIN_CHAPTER, Math.min(MAX_CHAPTER, parsed));
    this._chapter = clamped;

    // If orbital state is not canonical for the new chapter, align to initial state
    if (!isOrbitalStateValidForChapter(clamped, this._orbitalState)) {
      const chapterStates = CHAPTER_ORBITAL_STATES[clamped];
      if (chapterStates && chapterStates.length > 0) {
        this._orbitalState = chapterStates[0];
      }
    }
    return true;
  }

  /**
   * Advances to the next chapter if below MAX_CHAPTER (5).
   * Chapter 5 is terminal; attempting to advance past 5 remains at 5 (never creates chapter 6).
   * Automatically sets the initial orbital state and resets maneuver status to CALIBRATING.
   *
   * @returns {number} The current chapter after advancement.
   */
  advanceChapter() {
    if (this._chapter < MAX_CHAPTER) {
      this._chapter += 1;
      const chapterStates = CHAPTER_ORBITAL_STATES[this._chapter];
      if (chapterStates && chapterStates.length > 0) {
        this._orbitalState = chapterStates[0];
      }
      this._maneuverStatus = ManeuverStatus.CALIBRATING;
      this._calibrationProgress = 0.0;
    }
    return this._chapter;
  }

  /**
   * Sets the orbital state. Rejects unrecognized states.
   * Logs a lightweight warning if state does not belong to the active chapter,
   * without blocking legitimate transition sequencing.
   *
   * @param {string} state - Valid OrbitalState enum value.
   * @returns {boolean} True if recognized and updated.
   */
  setOrbitalState(state) {
    if (!isValidOrbitalState(state)) {
      console.warn(`[OrreryState] Unknown orbital state: "${state}"`);
      return false;
    }
    this._orbitalState = state;
    if (!isOrbitalStateValidForChapter(this._chapter, state)) {
      console.warn(`[OrreryState] Orbital state "${state}" is not canonical for active chapter ${this._chapter}`);
    }
    return true;
  }

  /**
   * Sets maneuver status. Rejects unrecognized statuses.
   *
   * @param {string} status - Valid ManeuverStatus enum value.
   * @returns {boolean} True if recognized and updated.
   */
  setManeuverStatus(status) {
    if (!isValidManeuverStatus(status)) {
      console.warn(`[OrreryState] Unknown maneuver status: "${status}"`);
      return false;
    }
    this._maneuverStatus = status;
    return true;
  }

  /**
   * Sets calibration progress clamped to [0.0..1.0].
   *
   * @param {number} progress
   * @returns {boolean} True
   */
  setCalibrationProgress(progress) {
    const num = Number(progress);
    this._calibrationProgress = Number.isFinite(num) ? Math.max(0.0, Math.min(1.0, num)) : 0.0;
    return true;
  }

  /**
   * Sets orbital eccentricity.
   *
   * @param {number} value
   * @returns {boolean}
   */
  setEccentricity(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) {
      console.warn(`[OrreryState] Invalid eccentricity: ${value}`);
      return false;
    }
    this._eccentricity = num;
    return true;
  }

  /**
   * Sets semi-major axis.
   *
   * @param {number} value
   * @returns {boolean}
   */
  setSemiMajorAxis(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) {
      console.warn(`[OrreryState] Invalid semiMajorAxis: ${value}`);
      return false;
    }
    this._semiMajorAxis = num;
    return true;
  }

  /**
   * Sets resonance ratio.
   *
   * @param {number} value
   * @returns {boolean}
   */
  setResonanceRatio(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) {
      console.warn(`[OrreryState] Invalid resonanceRatio: ${value}`);
      return false;
    }
    this._resonanceRatio = num;
    return true;
  }

  /**
   * Sets Roche disruption progress clamped to [0.0..1.0].
   * 0 = safely outside disruption region, 1 = ring-forming disruption completed.
   *
   * @param {number} progress
   * @returns {boolean} True
   */
  setRocheProgress(progress) {
    const num = Number(progress);
    this._rocheProgress = Number.isFinite(num) ? Math.max(0.0, Math.min(1.0, num)) : 0.0;
    return true;
  }

  /**
   * Sets shield charge clamped to [0.0..1.0].
   * 0 = shield inactive, 1 = atmosphere protected.
   *
   * @param {number} charge
   * @returns {boolean} True
   */
  setShieldCharge(charge) {
    const num = Number(charge);
    this._shieldCharge = Number.isFinite(num) ? Math.max(0.0, Math.min(1.0, num)) : 0.0;
    return true;
  }

  /**
   * Resets all fields to their default canonical state.
   * @returns {OrreryState} this for chaining
   */
  reset() {
    this._chapter = DEFAULT_ORRERY_STATE.chapter;
    this._orbitalState = DEFAULT_ORRERY_STATE.orbitalState;
    this._maneuverStatus = DEFAULT_ORRERY_STATE.maneuverStatus;
    this._calibrationProgress = DEFAULT_ORRERY_STATE.calibrationProgress;
    this._eccentricity = DEFAULT_ORRERY_STATE.eccentricity;
    this._semiMajorAxis = DEFAULT_ORRERY_STATE.semiMajorAxis;
    this._resonanceRatio = DEFAULT_ORRERY_STATE.resonanceRatio;
    this._rocheProgress = DEFAULT_ORRERY_STATE.rocheProgress;
    this._shieldCharge = DEFAULT_ORRERY_STATE.shieldCharge;
    return this;
  }

  // ==========================================================================
  // SNAPSHOT & VALIDATION
  // ==========================================================================

  /**
   * Returns an immutable, frozen data snapshot of the complete state.
   * Mutations to the snapshot or external callers will not affect internal state.
   *
   * @returns {Readonly<{
   *   chapter: number,
   *   orbitalState: string,
   *   maneuverStatus: string,
   *   calibrationProgress: number,
   *   eccentricity: number,
   *   semiMajorAxis: number,
   *   resonanceRatio: number,
   *   rocheProgress: number,
   *   shieldCharge: number
   * }>}
   */
  getSnapshot() {
    return Object.freeze({
      chapter: this._chapter,
      orbitalState: this._orbitalState,
      maneuverStatus: this._maneuverStatus,
      calibrationProgress: this._calibrationProgress,
      eccentricity: this._eccentricity,
      semiMajorAxis: this._semiMajorAxis,
      resonanceRatio: this._resonanceRatio,
      rocheProgress: this._rocheProgress,
      shieldCharge: this._shieldCharge
    });
  }

  /**
   * Checks whether the current or specified orbital state is valid for the current or specified chapter.
   *
   * @param {number} [chapter]
   * @param {string} [orbitalState]
   * @returns {boolean}
   */
  isOrbitalStateValidForChapter(chapter = this._chapter, orbitalState = this._orbitalState) {
    return isOrbitalStateValidForChapter(chapter, orbitalState);
  }

  /**
   * Validates internal state coherence and returns detailed results.
   *
   * @returns {{ valid: boolean, errors: string[] }}
   */
  validate() {
    const errors = [];
    if (this._chapter < MIN_CHAPTER || this._chapter > MAX_CHAPTER) {
      errors.push(`Chapter ${this._chapter} out of bounds (${MIN_CHAPTER}..${MAX_CHAPTER})`);
    }
    if (!isOrbitalStateValidForChapter(this._chapter, this._orbitalState)) {
      errors.push(`Orbital state "${this._orbitalState}" is not valid for chapter ${this._chapter}`);
    }
    if (!isValidManeuverStatus(this._maneuverStatus)) {
      errors.push(`Maneuver status "${this._maneuverStatus}" is invalid`);
    }
    return {
      valid: errors.length === 0,
      errors
    };
  }

  // ==========================================================================
  // STATIC UTILITY EXPORTS
  // ==========================================================================

  static isOrbitalStateValidForChapter(chapter, orbitalState) {
    return isOrbitalStateValidForChapter(chapter, orbitalState);
  }

  static isValidOrbitalState(state) {
    return isValidOrbitalState(state);
  }

  static isValidManeuverStatus(status) {
    return isValidManeuverStatus(status);
  }
}

export default OrreryState;
