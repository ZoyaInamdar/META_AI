/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * ============================================================================
 * Celestial Kendama - Mission Controller & Planetary Evolution State Machine
 * Role: Person B (The Mission & Physics Lead / MissionController.js)
 * ============================================================================
 *
 * Authoritative controller for:
 * 1. Monotonic cosmic energy accounting from scored catches
 * 2. Chapter progression across the 5 cosmic epochs (400, 1000, 1700, 2200)
 * 3. Exponential approach easing for visual planet state variables consumed by Person C
 * 4. Surface scar tracking from misses
 * 5. Coordination with TrickSequencer for target cup progression
 */

import { MissionState, PlanetState, Events } from '../contracts/Interfaces.js';
import { MISSION_THRESHOLDS } from './missionConfig.js';
import { TrickSequencer } from './TrickSequencer.js';

export class MissionController {
  /**
   * @param {Object} [eventBus=null] - Optional EventBus instance for publishing Events.MISSION
   * @param {Object} [options={}]
   * @param {TrickSequencer} [options.trickSequencer=null] - Optional TrickSequencer instance
   * @param {number} [options.smoothingLambda=5.0] - Exponential smoothing response coefficient
   */
  constructor(eventBus = null, options = {}) {
    this.eventBus = eventBus;
    this.trickSequencer = options.trickSequencer || new TrickSequencer(eventBus);
    this.smoothingLambda = Number.isFinite(options.smoothingLambda) ? options.smoothingLambda : 5.0;

    // Mission State variables
    this.cosmicEnergy = 0;
    this.chapter = 1;
    this.milestoneReached = false;
    this.activeIntervention = null;

    // Surface Scars & Miss Deduplication
    this.scarsCount = 0;
    this._missHandledThisFlight = false;
    this.processedScoreEvents = new Set();
    this.processedMissEvents = new Set();

    // Smoothed Visual Planet State variables (consumed directly by Person C)
    this.kintsugiVeinGlow = 0.0;
    this.atmosphereDensity = 0.0;
    this.oceanFillLevel = 0.0;
    this.ringFormationAlpha = 0.0;
    this.shieldCharge = 0.0;
    this.isGoldIgnited = false;

    // Unsmoothed target values computed from chapter energy progress
    this.kintsugiVeinGlowTarget = 0.0;
    this.atmosphereDensityTarget = 0.0;
    this.oceanFillLevelTarget = 0.0;
    this.ringFormationAlphaTarget = 0.0;
  }

  /**
   * Resolves target energy threshold for a given chapter index.
   *
   * @param {number} chapter
   * @returns {number} Energy threshold
   */
  getChapterTargetEnergy(chapter = this.chapter) {
    switch (chapter) {
      case 1:
        return MISSION_THRESHOLDS.CHAPTER_1; // 400
      case 2:
        return MISSION_THRESHOLDS.CHAPTER_2; // 1000
      case 3:
        return MISSION_THRESHOLDS.CHAPTER_3; // 1700
      case 4:
      default:
        return MISSION_THRESHOLDS.FINALE; // 2200
    }
  }

  /**
   * Re-evaluates chapter threshold transitions and visual target values from current cosmicEnergy.
   * @private
   */
  _updateChapterProgress() {
    const energy = this.cosmicEnergy;

    // Determine target chapter from energy
    let targetChapter = 1;
    if (energy >= MISSION_THRESHOLDS.CHAPTER_3) {
      targetChapter = 4;
    } else if (energy >= MISSION_THRESHOLDS.CHAPTER_2) {
      targetChapter = 3;
    } else if (energy >= MISSION_THRESHOLDS.CHAPTER_1) {
      targetChapter = 2;
    }

    // Process sequential chapter boundary transitions
    while (this.chapter < targetChapter) {
      this.chapter++;
      this.milestoneReached = true;
      this.trickSequencer.setChapter(this.chapter);

      if (this.eventBus && typeof this.eventBus.emit === 'function') {
        this.eventBus.emit(Events.MISSION, {
          chapter: this.chapter,
          milestoneReached: true,
          cosmicEnergy: this.cosmicEnergy,
          targetEnergy: this.getChapterTargetEnergy(this.chapter)
        });
      }
    }

    // Compute raw intra-chapter progress values [0.0, 1.0]
    // Chapter 1 Progress (0 -> 400)
    const ch1Progress = Math.min(1.0, Math.max(0.0, energy / MISSION_THRESHOLDS.CHAPTER_1));

    // Chapter 2 Progress (400 -> 1000)
    const ch2Span = MISSION_THRESHOLDS.CHAPTER_2 - MISSION_THRESHOLDS.CHAPTER_1; // 600
    const ch2Progress = energy >= MISSION_THRESHOLDS.CHAPTER_1
      ? Math.min(1.0, Math.max(0.0, (energy - MISSION_THRESHOLDS.CHAPTER_1) / ch2Span))
      : 0.0;

    // Chapter 3 Progress (1000 -> 1700)
    const ch3Span = MISSION_THRESHOLDS.CHAPTER_3 - MISSION_THRESHOLDS.CHAPTER_2; // 700
    const ch3Progress = energy >= MISSION_THRESHOLDS.CHAPTER_2
      ? Math.min(1.0, Math.max(0.0, (energy - MISSION_THRESHOLDS.CHAPTER_2) / ch3Span))
      : 0.0;

    // Chapter 4 Progress (1700 -> 2200)
    const ch4Span = MISSION_THRESHOLDS.FINALE - MISSION_THRESHOLDS.CHAPTER_3; // 500
    const ch4Progress = energy >= MISSION_THRESHOLDS.CHAPTER_3
      ? Math.min(1.0, Math.max(0.0, (energy - MISSION_THRESHOLDS.CHAPTER_3) / ch4Span))
      : 0.0;

    // Visual Targets:
    // kintsugiVeinGlow: tracks Ch 1 progress, stays 1.0 once completed
    this.kintsugiVeinGlowTarget = energy >= MISSION_THRESHOLDS.CHAPTER_1 ? 1.0 : ch1Progress;

    // atmosphereDensity: tracks Ch 2 progress, stays 1.0 once completed
    this.atmosphereDensityTarget = energy >= MISSION_THRESHOLDS.CHAPTER_2
      ? 1.0
      : (energy >= MISSION_THRESHOLDS.CHAPTER_1 ? ch2Progress : 0.0);

    // oceanFillLevel: tracks Ch 3 progress, stays 1.0 once completed
    this.oceanFillLevelTarget = energy >= MISSION_THRESHOLDS.CHAPTER_3
      ? 1.0
      : (energy >= MISSION_THRESHOLDS.CHAPTER_2 ? ch3Progress : 0.0);

    // ringFormationAlpha: tracks Ch 4 progress
    this.ringFormationAlphaTarget = energy >= MISSION_THRESHOLDS.CHAPTER_3 ? ch4Progress : 0.0;

    // Climax Ignition: boolean milestone unlocked at 2200 energy
    if (energy >= MISSION_THRESHOLDS.FINALE) {
      this.isGoldIgnited = true;
    }
  }

  /**
   * Processes an incoming score event and awards cosmic energy monotonically.
   * Handles deduplication if eventId is provided.
   *
   * @param {number|Object} scoreEvent - Number or ScoreEvent object
   * @returns {MissionState} Updated MissionState
   */
  handleScore(scoreEvent) {
    if (!scoreEvent && scoreEvent !== 0) {
      return this.getMissionState();
    }

    let eventId = null;
    let awardedEnergy = 0;

    if (typeof scoreEvent === 'number') {
      awardedEnergy = scoreEvent;
    } else if (typeof scoreEvent === 'object') {
      eventId = scoreEvent.eventId ?? null;
      awardedEnergy = scoreEvent.awardedEnergy ?? scoreEvent.energy ?? 0;
    }

    if (eventId) {
      if (this.processedScoreEvents.has(eventId)) {
        return this.getMissionState();
      }
      this.processedScoreEvents.add(eventId);
    }

    if (awardedEnergy > 0) {
      this.cosmicEnergy += awardedEnergy;
      this._updateChapterProgress();
    }

    return this.getMissionState();
  }

  /**
   * Evaluates a spatial catch event against the active trick sequence.
   * Resets the flight miss guard on successful contact.
   *
   * @param {Object|string} catchEvent
   * @returns {Object|null} Resulting TargetState or null on mismatch
   */
  handleCatch(catchEvent) {
    this._missHandledThisFlight = false;
    return this.trickSequencer.handleCatch(catchEvent);
  }

  /**
   * Handles a miss/drop event and increments surface impact scars.
   * Guards against duplicate invocations for the same flight cycle.
   *
   * @param {Object|string} [missEvent=null] - Optional miss event or flight identifier
   * @returns {number} Updated scarsCount
   */
  handleMiss(missEvent = null) {
    let flightId = null;
    if (typeof missEvent === 'string') {
      flightId = missEvent;
    } else if (missEvent && typeof missEvent === 'object') {
      flightId = missEvent.flightId ?? missEvent.eventId ?? null;
    }

    if (flightId) {
      if (this.processedMissEvents.has(flightId)) {
        return this.scarsCount;
      }
      this.processedMissEvents.add(flightId);
    } else {
      if (this._missHandledThisFlight) {
        return this.scarsCount;
      }
      this._missHandledThisFlight = true;
    }

    this.scarsCount++;
    return this.scarsCount;
  }

  /**
   * Advances exponential smoothing filters for all visual planet scalars toward their targets.
   *
   * @param {number} dt - Delta time in seconds
   * @returns {{ missionState: MissionState, planetState: PlanetState }}
   */
  update(dt) {
    if (Number.isFinite(dt) && dt > 0.0) {
      const alpha = 1.0 - Math.exp(-this.smoothingLambda * dt);

      this.kintsugiVeinGlow += alpha * (this.kintsugiVeinGlowTarget - this.kintsugiVeinGlow);
      this.atmosphereDensity += alpha * (this.atmosphereDensityTarget - this.atmosphereDensity);
      this.oceanFillLevel += alpha * (this.oceanFillLevelTarget - this.oceanFillLevel);
      this.ringFormationAlpha += alpha * (this.ringFormationAlphaTarget - this.ringFormationAlpha);

      // Snap near boundaries to eliminate asymptotic float creep
      if (Math.abs(this.kintsugiVeinGlowTarget - this.kintsugiVeinGlow) < 1e-5) {
        this.kintsugiVeinGlow = this.kintsugiVeinGlowTarget;
      }
      if (Math.abs(this.atmosphereDensityTarget - this.atmosphereDensity) < 1e-5) {
        this.atmosphereDensity = this.atmosphereDensityTarget;
      }
      if (Math.abs(this.oceanFillLevelTarget - this.oceanFillLevel) < 1e-5) {
        this.oceanFillLevel = this.oceanFillLevelTarget;
      }
      if (Math.abs(this.ringFormationAlphaTarget - this.ringFormationAlpha) < 1e-5) {
        this.ringFormationAlpha = this.ringFormationAlphaTarget;
      }

      // Clamp strictly within [0.0, 1.0]
      this.kintsugiVeinGlow = Math.min(1.0, Math.max(0.0, this.kintsugiVeinGlow));
      this.atmosphereDensity = Math.min(1.0, Math.max(0.0, this.atmosphereDensity));
      this.oceanFillLevel = Math.min(1.0, Math.max(0.0, this.oceanFillLevel));
      this.ringFormationAlpha = Math.min(1.0, Math.max(0.0, this.ringFormationAlpha));
    }

    const missionState = this.getMissionState();
    const planetState = this.getPlanetState();

    return { missionState, planetState };
  }

  /**
   * Returns authoritative MissionState snapshot.
   * @returns {MissionState}
   */
  getMissionState() {
    return new MissionState({
      chapter: this.chapter,
      cosmicEnergy: this.cosmicEnergy,
      targetEnergy: this.getChapterTargetEnergy(this.chapter),
      milestoneReached: this.milestoneReached,
      activeIntervention: this.activeIntervention
    });
  }

  /**
   * Returns authoritative PlanetState snapshot with smoothed visual values.
   * @returns {PlanetState}
   */
  getPlanetState() {
    return new PlanetState({
      kintsugiGlow: this.kintsugiVeinGlow,
      kintsugiVeinGlow: this.kintsugiVeinGlow,
      atmosphereDensity: this.atmosphereDensity,
      oceanFill: this.oceanFillLevel,
      oceanFillLevel: this.oceanFillLevel,
      ringAlpha: this.ringFormationAlpha,
      ringFormationAlpha: this.ringFormationAlpha,
      shieldCharge: this.shieldCharge,
      scarsCount: this.scarsCount,
      scars: this.scarsCount,
      goldIgnited: this.isGoldIgnited,
      isGoldIgnited: this.isGoldIgnited
    });
  }

  /**
   * Returns the current TargetState from the trick sequencer.
   * @returns {Object}
   */
  getCurrentTarget() {
    return this.trickSequencer.getCurrentTarget();
  }

  /**
   * Resets all mission progress, chapter state, scars, and smoothing filters back to initial conditions.
   */
  reset() {
    this.cosmicEnergy = 0;
    this.chapter = 1;
    this.milestoneReached = false;
    this.activeIntervention = null;
    this.scarsCount = 0;
    this._missHandledThisFlight = false;

    this.kintsugiVeinGlow = 0.0;
    this.atmosphereDensity = 0.0;
    this.oceanFillLevel = 0.0;
    this.ringFormationAlpha = 0.0;
    this.shieldCharge = 0.0;
    this.isGoldIgnited = false;

    this.kintsugiVeinGlowTarget = 0.0;
    this.atmosphereDensityTarget = 0.0;
    this.oceanFillLevelTarget = 0.0;
    this.ringFormationAlphaTarget = 0.0;

    this.processedScoreEvents.clear();
    this.processedMissEvents.clear();

    this.trickSequencer.reset();
  }
}

