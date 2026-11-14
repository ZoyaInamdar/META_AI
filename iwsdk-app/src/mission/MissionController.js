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

import { MissionState, PlanetState, Events, ChapterTransitionState } from '../contracts/Interfaces.js';
import { MISSION_THRESHOLDS, CADENCE_CONFIG, TRANSITION_CONFIG, BINARY_CONFIG } from './missionConfig.js';
import { TrickSequencer } from './TrickSequencer.js';
import { setupChapter2Binary, applyProgradeImpulse, computeThreeBodyAlignment } from '../physics/BinarySystem.js';
import { FinaleManager } from '../physics/FinaleManager.js';

export { ChapterTransitionState };

export class MissionController {
  /**
   * @param {Object} [eventBus=null] - Optional EventBus instance for publishing Events.MISSION
   * @param {Object} [options={}]
   * @param {TrickSequencer} [options.trickSequencer=null] - Optional TrickSequencer instance
   * @param {Object} [options.orbitalEngine=null] - Optional OrbitalEngine instance for physics interventions
   * @param {Object} [options.binarySystem=null] - Optional BinarySystem instance
   * @param {FinaleManager} [options.finaleManager=null] - Optional FinaleManager instance
   * @param {number} [options.smoothingLambda=5.0] - Exponential smoothing response coefficient
   * @param {number} [options.transitionDuration=2.0] - Chapter 1 -> 2 transition duration in seconds
   */
  constructor(eventBus = null, options = {}) {
    this.eventBus = eventBus;
    this.trickSequencer = options.trickSequencer || new TrickSequencer(eventBus);
    this.orbitalEngine = options.orbitalEngine || null;
    this.binarySystem = options.binarySystem || null;
    this.finaleManager = options.finaleManager || new FinaleManager(eventBus, { orbitalEngine: this.orbitalEngine });
    this.captureBurn = options.captureBurn || null;
    this.smoothingLambda = Number.isFinite(options.smoothingLambda) ? options.smoothingLambda : 5.0;

    // Mission State variables
    this.cosmicEnergy = 0;
    this.chapter = 1;
    this.milestoneReached = false;
    this.activeIntervention = null;

    // Chapter Transition State Machine (Phase 2C Step 4)
    this.chapterState = ChapterTransitionState.CHAPTER_1_CAPTURE;
    this.transitionDuration = Number.isFinite(options.transitionDuration)
      ? options.transitionDuration
      : (TRANSITION_CONFIG?.DURATION ?? 2.0);
    this.transitionElapsed = 0.0;
    this.transitionProgress = 0.0;
    this._isTransitioning = false;
    this.isThreeBodyAligned = false;
    this._threeBodyAlignmentCache = { isAligned: false, angleDegrees: 180.0 };

    // Zero-allocation pre-allocated scratch buffers for Hermite blending
    this._blendStartPos = new Float64Array(3);
    this._blendStartVel = new Float64Array(3);
    this._blendTargetPos = new Float64Array([
      TRANSITION_CONFIG?.TARGET_POS?.x ?? 0.0,
      TRANSITION_CONFIG?.TARGET_POS?.y ?? 2.4,
      TRANSITION_CONFIG?.TARGET_POS?.z ?? 0.0
    ]);
    this._blendTargetVel = new Float64Array([
      TRANSITION_CONFIG?.TARGET_VEL?.x ?? -0.9128709291752769,
      TRANSITION_CONFIG?.TARGET_VEL?.y ?? 0.0,
      TRANSITION_CONFIG?.TARGET_VEL?.z ?? 0.0
    ]);

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

    // Auto-subscribe to EventBus for score, catch, and miss events
    this._isSubscribedToBus = false;
    if (this.eventBus && typeof this.eventBus.on === 'function' && options.autoSubscribe !== false) {
      this.subscribeToEventBus(this.eventBus);
    }

    // Lightweight Cadence-Resonance Telemetry (Step 3)
    this._cadenceTelemetry = {
      lastCatchDeltaSeconds: 0.0,
      targetCadenceSeconds: CADENCE_CONFIG.TARGET_INTERVAL,
      deviationMs: 0.0,
      onBeatHitRate: 1.0,
      currentSemiMajorAxis: BINARY_CONFIG?.PLANET_ORBIT_RADIUS ?? 2.4,
      totalChapter2Catches: 0,
      onBeatChapter2Catches: 0
    };
    this._lastScoreTimestampMs = null;
    this._lastScoreSimTime = null;
  }

  /**
   * Helper to locate the active planet body index in orbitalEngine.
   * Completely zero-allocation.
   * @private
   * @returns {number} Body index or -1 if not found
   */
  _findPlanetIndex() {
    if (!this.orbitalEngine) return -1;
    for (let i = 0; i < this.orbitalEngine.bodyCount; i++) {
      if (this.orbitalEngine.active[i] && typeof this.orbitalEngine.ids[i] === 'string' &&
          this.orbitalEngine.ids[i].toLowerCase() === 'planet') {
        return i;
      }
    }
    if (this.orbitalEngine.bodyCount >= 3 && this.orbitalEngine.active[2]) {
      return 2;
    }
    if (this.orbitalEngine.bodyCount >= 2 && this.orbitalEngine.active[1]) {
      return 1;
    }
    return -1;
  }

  /**
   * Starts the 2.0-second cubic Hermite smoothstep transition from Chapter 1 to Chapter 2.
   *
   * @param {Object} [options={}]
   * @param {{x: number, y: number, z: number}|Array<number>} [options.startPos]
   * @param {{x: number, y: number, z: number}|Array<number>} [options.startVel]
   * @param {{x: number, y: number, z: number}|Array<number>} [options.targetPos]
   * @param {{x: number, y: number, z: number}|Array<number>} [options.targetVel]
   */
  startTransitionToBinary(options = {}) {
    this.chapter = 2;
    this.chapterState = ChapterTransitionState.TRANSITION_TO_BINARY;
    this._isTransitioning = true;
    this.transitionElapsed = 0.0;
    this.transitionProgress = 0.0;
    this.isThreeBodyAligned = false;

    // Capture initial start pos and vel from orbitalEngine
    let pIdx = this._findPlanetIndex();
    if (this.orbitalEngine && pIdx !== -1) {
      const i3 = pIdx * 3;
      this._blendStartPos[0] = this.orbitalEngine.positions[i3];
      this._blendStartPos[1] = this.orbitalEngine.positions[i3 + 1];
      this._blendStartPos[2] = this.orbitalEngine.positions[i3 + 2];
      this._blendStartVel[0] = this.orbitalEngine.velocities[i3];
      this._blendStartVel[1] = this.orbitalEngine.velocities[i3 + 1];
      this._blendStartVel[2] = this.orbitalEngine.velocities[i3 + 2];
    }

    if (options.startPos) {
      this._blendStartPos[0] = options.startPos.x ?? options.startPos[0] ?? 0.0;
      this._blendStartPos[1] = options.startPos.y ?? options.startPos[1] ?? 0.0;
      this._blendStartPos[2] = options.startPos.z ?? options.startPos[2] ?? 0.0;
    }
    if (options.startVel) {
      this._blendStartVel[0] = options.startVel.x ?? options.startVel[0] ?? 0.0;
      this._blendStartVel[1] = options.startVel.y ?? options.startVel[1] ?? 0.0;
      this._blendStartVel[2] = options.startVel.z ?? options.startVel[2] ?? 0.0;
    }

    // Configure binary star system in orbital engine
    if (this.orbitalEngine) {
      if (this.binarySystem) {
        this.binarySystem.setup();
      } else {
        setupChapter2Binary(this.orbitalEngine);
      }
      // Re-place planet at active planet index with start state to ensure continuity
      const p2Idx = this._findPlanetIndex();
      if (p2Idx !== -1) {
        const i3 = p2Idx * 3;
        this.orbitalEngine.positions[i3] = this._blendStartPos[0];
        this.orbitalEngine.positions[i3 + 1] = this._blendStartPos[1];
        this.orbitalEngine.positions[i3 + 2] = this._blendStartPos[2];
        this.orbitalEngine.velocities[i3] = this._blendStartVel[0];
        this.orbitalEngine.velocities[i3 + 1] = this._blendStartVel[1];
        this.orbitalEngine.velocities[i3 + 2] = this._blendStartVel[2];
      }
    }

    if (options.targetPos) {
      this._blendTargetPos[0] = options.targetPos.x ?? options.targetPos[0] ?? (TRANSITION_CONFIG?.TARGET_POS?.x ?? 0.0);
      this._blendTargetPos[1] = options.targetPos.y ?? options.targetPos[1] ?? (TRANSITION_CONFIG?.TARGET_POS?.y ?? 2.4);
      this._blendTargetPos[2] = options.targetPos.z ?? options.targetPos[2] ?? (TRANSITION_CONFIG?.TARGET_POS?.z ?? 0.0);
    } else {
      this._blendTargetPos[0] = TRANSITION_CONFIG?.TARGET_POS?.x ?? 0.0;
      this._blendTargetPos[1] = TRANSITION_CONFIG?.TARGET_POS?.y ?? 2.4;
      this._blendTargetPos[2] = TRANSITION_CONFIG?.TARGET_POS?.z ?? 0.0;
    }

    if (options.targetVel) {
      this._blendTargetVel[0] = options.targetVel.x ?? options.targetVel[0] ?? (TRANSITION_CONFIG?.TARGET_VEL?.x ?? -0.9128709291752769);
      this._blendTargetVel[1] = options.targetVel.y ?? options.targetVel[1] ?? (TRANSITION_CONFIG?.TARGET_VEL?.y ?? 0.0);
      this._blendTargetVel[2] = options.targetVel.z ?? options.targetVel[2] ?? (TRANSITION_CONFIG?.TARGET_VEL?.z ?? 0.0);
    } else {
      this._blendTargetVel[0] = TRANSITION_CONFIG?.TARGET_VEL?.x ?? -0.9128709291752769;
      this._blendTargetVel[1] = TRANSITION_CONFIG?.TARGET_VEL?.y ?? 0.0;
      this._blendTargetVel[2] = TRANSITION_CONFIG?.TARGET_VEL?.z ?? 0.0;
    }

    if (this.eventBus && typeof this.eventBus.emit === 'function') {
      this.eventBus.emit(Events.MISSION, {
        chapter: 2,
        chapterState: this.chapterState,
        isTransitioning: true,
        cosmicEnergy: this.cosmicEnergy
      });
    }
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

      if (this.chapter === 2) {
        if (this.captureBurn) {
          const pIdx = this._findPlanetIndex();
          this.captureBurn.triggerBurn(pIdx !== -1 ? pIdx : 1, 0.5, 1.0);
        } else {
          this.startTransitionToBinary();
        }
      } else if (this.chapter === 3) {
        this.chapterState = 'CHAPTER_3';
        this._isTransitioning = false;
      } else if (this.chapter === 4) {
        this.chapterState = 'CHAPTER_4_FINALE';
        this._isTransitioning = false;
      }

      if (this.eventBus && typeof this.eventBus.emit === 'function') {
        this.eventBus.emit(Events.MISSION, {
          chapter: this.chapter,
          chapterState: this.chapterState,
          milestoneReached: true,
          cosmicEnergy: this.cosmicEnergy,
          targetEnergy: this.getChapterTargetEnergy(this.chapter)
        });

        // Notify Person A of rhythm cadence when transitioning to Chapter 2
        if (this.chapter === 2) {
          this.eventBus.emit(Events.CADENCE, {
            targetCadenceSeconds: CADENCE_CONFIG.TARGET_INTERVAL
          });
        }
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
      if (!this.isGoldIgnited) {
        this.isGoldIgnited = true;

        if (this.eventBus && typeof this.eventBus.emit === 'function') {
          const timestamp = Date.now();
          this.eventBus.emit(Events.FINALE_TRIGGER || 'finale_trigger', {
            isGoldIgnited: true,
            timestamp
          });
          this.eventBus.emit(Events.AUDIO_TRIGGER || 'audio_trigger', {
            cue: 'gold_ignition_chime'
          });
          this.eventBus.emit(Events.MISSION, {
            chapter: this.chapter,
            milestoneReached: true,
            cosmicEnergy: this.cosmicEnergy,
            targetEnergy: this.getChapterTargetEnergy(this.chapter),
            isGoldIgnited: true,
            timestamp
          });
        }

        if (this.finaleManager) {
          this.finaleManager.startChaosCycle(this.orbitalEngine);
        }
      }
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

      // In Chapter 2, track rolling cadence telemetry and evaluate on-cadence impulse
      if (this.chapter === 2) {
        let deltaSec = 0.0;
        if (typeof scoreEvent === 'object' && scoreEvent !== null) {
          if (Number.isFinite(scoreEvent.deltaSeconds)) {
            deltaSec = scoreEvent.deltaSeconds;
          } else if (Number.isFinite(scoreEvent.deltaMs)) {
            deltaSec = scoreEvent.deltaMs / 1000.0;
          } else if (Number.isFinite(scoreEvent.intervalSeconds)) {
            deltaSec = scoreEvent.intervalSeconds;
          } else if (Number.isFinite(scoreEvent.timestampMs)) {
            if (this._lastScoreTimestampMs !== null) {
              deltaSec = (scoreEvent.timestampMs - this._lastScoreTimestampMs) / 1000.0;
            }
            this._lastScoreTimestampMs = scoreEvent.timestampMs;
          } else if (Number.isFinite(scoreEvent.timestamp)) {
            const tMs = scoreEvent.timestamp > 1e10 ? scoreEvent.timestamp : scoreEvent.timestamp * 1000;
            if (this._lastScoreTimestampMs !== null) {
              deltaSec = (tMs - this._lastScoreTimestampMs) / 1000.0;
            }
            this._lastScoreTimestampMs = tMs;
          } else if (this.orbitalEngine) {
            const simTime = this.orbitalEngine.simulationTime;
            if (this._lastScoreSimTime !== null) {
              deltaSec = simTime - this._lastScoreSimTime;
            }
            this._lastScoreSimTime = simTime;
          }
        }

        const targetSec = CADENCE_CONFIG.TARGET_INTERVAL; // 1.75
        let devMs = 0.0;
        if (deltaSec > 0.0) {
          devMs = Math.abs(deltaSec - targetSec) * 1000.0;
        } else if (typeof scoreEvent === 'object' && scoreEvent !== null && Number.isFinite(scoreEvent.deviationMs)) {
          devMs = scoreEvent.deviationMs;
        }

        const isOnCadence = Boolean(
          typeof scoreEvent === 'object' && scoreEvent !== null && (
            scoreEvent.isOnCadence ||
            scoreEvent.cadenceMultiplier > 1.0 ||
            scoreEvent.multipliers?.cadence > 1.0 ||
            (deltaSec > 0.0 && devMs <= (CADENCE_CONFIG.WINDOW_TOLERANCE * 1000.0 + 1e-6))
          )
        );

        this._cadenceTelemetry.totalChapter2Catches++;
        if (isOnCadence) {
          this._cadenceTelemetry.onBeatChapter2Catches++;
        }

        this._cadenceTelemetry.lastCatchDeltaSeconds = deltaSec;
        this._cadenceTelemetry.targetCadenceSeconds = targetSec;
        this._cadenceTelemetry.deviationMs = devMs;
        this._cadenceTelemetry.onBeatHitRate = this._cadenceTelemetry.totalChapter2Catches > 0
          ? this._cadenceTelemetry.onBeatChapter2Catches / this._cadenceTelemetry.totalChapter2Catches
          : 1.0;

        if (isOnCadence) {
          const isAlreadyStabilized = this.chapterState === ChapterTransitionState.CHAPTER_2_STABILIZED ||
            (this._cadenceTelemetry.currentSemiMajorAxis >= 3.25);

          if (!isAlreadyStabilized) {
            if (this.binarySystem) {
              this.binarySystem.applyProgradeImpulse();
            } else if (this.orbitalEngine) {
              applyProgradeImpulse(this.orbitalEngine, 2, 0.05);
            }
          }
        }

        // Update currentSemiMajorAxis telemetry if orbitalEngine is attached
        if (this.orbitalEngine) {
          const pIdx = this._findPlanetIndex();
          if (pIdx !== -1) {
            const i3 = pIdx * 3;
            const px = this.orbitalEngine.positions[i3];
            const py = this.orbitalEngine.positions[i3 + 1];
            const pz = this.orbitalEngine.positions[i3 + 2];
            const vx = this.orbitalEngine.velocities[i3];
            const vy = this.orbitalEngine.velocities[i3 + 1];
            const vz = this.orbitalEngine.velocities[i3 + 2];
            const r = Math.sqrt(px * px + py * py + pz * pz);
            const vSq = vx * vx + vy * vy + vz * vz;
            const mu = 2.0; // Total central binary mass G * (m1 + m2)
            const eps = 0.5 * vSq - mu / r;
            if (eps < -1e-6) {
              this._cadenceTelemetry.currentSemiMajorAxis = -mu / (2.0 * eps);
            } else {
              this._cadenceTelemetry.currentSemiMajorAxis = r;
            }
          }
        }
      }
    }

    return this.getMissionState();
  }

  /**
   * Connects a BinarySystem instance to the mission controller.
   * @param {Object} binarySystem
   */
  setBinarySystem(binarySystem) {
    this.binarySystem = binarySystem;
  }

  /**
   * Connects an OrbitalEngine instance to the mission controller.
   * @param {Object} orbitalEngine
   */
  setOrbitalEngine(orbitalEngine) {
    this.orbitalEngine = orbitalEngine;
    if (this.finaleManager) {
      this.finaleManager.setOrbitalEngine(orbitalEngine);
    }
  }

  /**
   * Connects a CaptureBurn instance to the mission controller.
   * @param {Object} captureBurn
   */
  setCaptureBurn(captureBurn) {
    this.captureBurn = captureBurn;
  }

  /**
   * Returns connected CaptureBurn instance.
   * @returns {Object|null}
   */
  getCaptureBurn() {
    return this.captureBurn;
  }

  /**
   * Directly sets the active mission chapter (1 to 4).
   *
   * @param {number} chapterIndex
   * @returns {MissionState} Updated MissionState
   */
  setChapter(chapterIndex) {
    const ch = Math.max(1, Math.min(4, Math.floor(chapterIndex)));
    this.chapter = ch;
    this.trickSequencer.setChapter(ch);

    if (ch === 1) {
      this.chapterState = ChapterTransitionState.CHAPTER_1_CAPTURE;
      this._isTransitioning = false;
      this.transitionProgress = 0.0;
      this.transitionElapsed = 0.0;
    } else if (ch === 2) {
      if (this.chapterState === ChapterTransitionState.CHAPTER_1_CAPTURE) {
        this.chapterState = ChapterTransitionState.CHAPTER_2_RESONANCE;
        this._isTransitioning = false;
        this.transitionProgress = 1.0;
      }
    } else if (ch === 3) {
      this.chapterState = 'CHAPTER_3';
      this._isTransitioning = false;
      this.transitionProgress = 1.0;
    } else if (ch === 4) {
      this.chapterState = 'CHAPTER_4_FINALE';
      this._isTransitioning = false;
      this.transitionProgress = 1.0;
    }

    if (this.eventBus && typeof this.eventBus.emit === 'function') {
      this.eventBus.emit(Events.MISSION, {
        chapter: this.chapter,
        chapterState: this.chapterState,
        milestoneReached: true,
        cosmicEnergy: this.cosmicEnergy,
        targetEnergy: this.getChapterTargetEnergy(this.chapter)
      });

      if (this.chapter === 2) {
        this.eventBus.emit(Events.CADENCE, {
          targetCadenceSeconds: CADENCE_CONFIG.TARGET_INTERVAL
        });
      }
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
   * Advances exponential smoothing filters for all visual planet scalars toward their targets,
   * steps transition blending if active, and verifies three-body alignment.
   * Completely zero dynamic allocations in the runtime loop.
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

      // Handle active Chapter 1 retrograde capture burn
      if (this.captureBurn && this.captureBurn.isActive) {
        this.captureBurn.update(dt, this.orbitalEngine);
        if (!this.captureBurn.isActive) {
          this.startTransitionToBinary();
        }
      }

      // Handle active Chapter 1 -> Chapter 2 transition blending
      if (this._isTransitioning) {
        this.transitionElapsed += dt;
        const tau = Math.min(1.0, Math.max(0.0, this.transitionElapsed / this.transitionDuration));
        this.transitionProgress = tau;

        // Cubic Hermite smoothstep: S(tau) = 3*tau^2 - 2*tau^3
        const s = tau * tau * (3.0 - 2.0 * tau);
        // Time derivative: dS/dt = 6*tau*(1 - tau) / T
        const dsDt = (6.0 * tau * (1.0 - tau)) / this.transitionDuration;

        const dx = this._blendTargetPos[0] - this._blendStartPos[0];
        const dy = this._blendTargetPos[1] - this._blendStartPos[1];
        const dz = this._blendTargetPos[2] - this._blendStartPos[2];

        const posX = this._blendStartPos[0] + s * dx;
        const posY = this._blendStartPos[1] + s * dy;
        const posZ = this._blendStartPos[2] + s * dz;

        const velX = (1.0 - s) * this._blendStartVel[0] + s * this._blendTargetVel[0] + dsDt * dx;
        const velY = (1.0 - s) * this._blendStartVel[1] + s * this._blendTargetVel[1] + dsDt * dy;
        const velZ = (1.0 - s) * this._blendStartVel[2] + s * this._blendTargetVel[2] + dsDt * dz;

        if (this.orbitalEngine) {
          const pIdx = this._findPlanetIndex();
          if (pIdx !== -1) {
            const i3 = pIdx * 3;
            this.orbitalEngine.positions[i3] = posX;
            this.orbitalEngine.positions[i3 + 1] = posY;
            this.orbitalEngine.positions[i3 + 2] = posZ;
            this.orbitalEngine.velocities[i3] = velX;
            this.orbitalEngine.velocities[i3 + 1] = velY;
            this.orbitalEngine.velocities[i3 + 2] = velZ;
          }
        }

        if (this.transitionElapsed >= this.transitionDuration - 1e-10) {
          this._isTransitioning = false;
          this.transitionProgress = 1.0;
          this.chapterState = ChapterTransitionState.CHAPTER_2_RESONANCE;

          if (this.orbitalEngine) {
            const pIdx = this._findPlanetIndex();
            if (pIdx !== -1) {
              const i3 = pIdx * 3;
              this.orbitalEngine.positions[i3] = this._blendTargetPos[0];
              this.orbitalEngine.positions[i3 + 1] = this._blendTargetPos[1];
              this.orbitalEngine.positions[i3 + 2] = this._blendTargetPos[2];
              this.orbitalEngine.velocities[i3] = this._blendTargetVel[0];
              this.orbitalEngine.velocities[i3 + 1] = this._blendTargetVel[1];
              this.orbitalEngine.velocities[i3 + 2] = this._blendTargetVel[2];
            }
          }

          if (this.eventBus && typeof this.eventBus.emit === 'function') {
            this.eventBus.emit(Events.CADENCE, {
              targetCadenceSeconds: CADENCE_CONFIG.TARGET_INTERVAL
            });
            this.eventBus.emit(Events.MISSION, {
              chapter: 2,
              chapterState: this.chapterState,
              isTransitioning: false,
              cosmicEnergy: this.cosmicEnergy
            });
          }
        }
      }

      // Check collinear three-body alignment and resonance stabilization in Chapter 2
      if (this.chapter === 2) {
        const align = this.getThreeBodyAlignment();
        this.isThreeBodyAligned = align.isAligned;

        if (this.chapterState === ChapterTransitionState.CHAPTER_2_RESONANCE) {
          let shouldStabilize = false;
          if (this.cosmicEnergy >= MISSION_THRESHOLDS.CHAPTER_2) {
            shouldStabilize = true;
          } else if (this.orbitalEngine) {
            const pIdx = this._findPlanetIndex();
            if (pIdx !== -1) {
              const i3 = pIdx * 3;
              const px = this.orbitalEngine.positions[i3];
              const py = this.orbitalEngine.positions[i3 + 1];
              const pz = this.orbitalEngine.positions[i3 + 2];
              const r = Math.sqrt(px * px + py * py + pz * pz);
              if (r >= 3.15) {
                shouldStabilize = true;
              }
            }
          }

          if (shouldStabilize) {
            this.chapterState = ChapterTransitionState.CHAPTER_2_STABILIZED;
            if (this.eventBus && typeof this.eventBus.emit === 'function') {
              this.eventBus.emit(Events.MISSION, {
                chapter: 2,
                chapterState: this.chapterState,
                isStabilized: true,
                cosmicEnergy: this.cosmicEnergy
              });
            }
          }
        }
      } else {
        this.isThreeBodyAligned = false;
      }
    }

    if (this.finaleManager) {
      this.finaleManager.update(dt, this.orbitalEngine);
    }

    const missionState = this.getMissionState();
    const planetState = this.getPlanetState();

    if (this.eventBus && typeof this.eventBus.emit === 'function') {
      this.eventBus.emit(Events.PLANET, planetState);
    }

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
      activeIntervention: this.activeIntervention,
      chapterState: this.chapterState,
      isTransitioning: this._isTransitioning,
      transitionProgress: this.transitionProgress
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
   * Returns normalized finale progression [0.0, 1.0].
   * @returns {number}
   */
  getFinaleProgress() {
    return this.finaleManager ? this.finaleManager.getFinaleProgress() : (this.isGoldIgnited ? 1.0 : 0.0);
  }

  /**
   * Returns current chaos intensity [0.0, 1.0].
   * @returns {number}
   */
  getChaosIntensity() {
    return this.finaleManager ? this.finaleManager.getChaosIntensity() : 0.0;
  }

  /**
   * Returns whether the chaos perturbation cycle is currently active.
   * @returns {boolean}
   */
  isChaosActive() {
    return this.finaleManager ? this.finaleManager.isChaosActive() : false;
  }

  /**
   * Triggers the 9-second chaos cycle directly.
   * @returns {boolean}
   */
  startChaosCycle() {
    if (this.finaleManager) {
      return this.finaleManager.startChaosCycle(this.orbitalEngine);
    }
    return false;
  }

  /**
   * Returns underlying FinaleManager instance.
   * @returns {FinaleManager}
   */
  getFinaleManager() {
    return this.finaleManager;
  }

  /**
   * Subscribes to score, catch, and miss events on the designated EventBus.
   * Idempotent; guards against multiple registrations.
   *
   * @param {Object} [eventBus=this.eventBus]
   * @returns {Function|null} Unsubscribe function, or null if unattached
   */
  subscribeToEventBus(eventBus = this.eventBus) {
    if (!eventBus || typeof eventBus.on !== 'function') return null;
    if (this._isSubscribedToBus) return null;
    this._isSubscribedToBus = true;

    const unsubCatch = eventBus.on(Events.CATCH, (c) => this.handleCatch(c));
    const unsubScore = eventBus.on(Events.SCORE, (s) => this.handleScore(s));
    const unsubMiss = eventBus.on(Events.MISS, (m) => this.handleMiss(m));

    return () => {
      this._isSubscribedToBus = false;
      if (typeof unsubCatch === 'function') unsubCatch();
      if (typeof unsubScore === 'function') unsubScore();
      if (typeof unsubMiss === 'function') unsubMiss();
    };
  }

  /**
   * Returns the current TargetState from the trick sequencer.
   * @returns {Object}
   */
  getCurrentTarget() {
    return this.trickSequencer.getCurrentTarget();
  }

  /**
   * Returns the current TargetState from the trick sequencer.
   * Contract alias used by Person C WorldRenderer and GamePipeline snapshot dispatch.
   * @returns {Object}
   */
  getTargetState() {
    return this.getCurrentTarget();
  }

  /**
   * Emits the current TargetState onto the EventBus.
   * @returns {Object}
   */
  emitCurrentTarget() {
    if (this.trickSequencer && typeof this.trickSequencer.emitCurrentTarget === 'function') {
      return this.trickSequencer.emitCurrentTarget();
    }
    const target = this.getCurrentTarget();
    if (this.eventBus && typeof this.eventBus.emit === 'function') {
      this.eventBus.emit(Events.TARGET, target);
    }
    return target;
  }

  /**
   * Returns live cadence-resonance telemetry diagnostics for VR/emulator sessions.
   * Zero heap allocations: returns the internal diagnostic structure.
   *
   * @returns {{
   *   lastCatchDeltaSeconds: number,
   *   targetCadenceSeconds: number,
   *   deviationMs: number,
   *   onBeatHitRate: number,
   *   currentSemiMajorAxis: number,
   *   totalChapter2Catches: number,
   *   onBeatChapter2Catches: number
   * }}
   */
  getCadenceTelemetry() {
    return this._cadenceTelemetry;
  }

  /**
   * Returns whether Chapter 1 -> Chapter 2 orbital blending is currently active.
   * @returns {boolean}
   */
  isTransitioning() {
    return this._isTransitioning;
  }

  /**
   * Returns normalized transition progress [0.0, 1.0].
   * @returns {number}
   */
  getTransitionProgress() {
    return this.transitionProgress;
  }

  /**
   * Returns authoritative ChapterTransitionState enum string.
   * @returns {string}
   */
  getChapterState() {
    return this.chapterState;
  }

  /**
   * Evaluates three-body collinear alignment (Star 1, Star 2, Planet) strictly scoped to Chapter 2.
   * Returns { isAligned: false, angleDegrees: 180.0 } when outside Chapter 2.
   * Completely zero-allocation: writes to and returns a cached result object.
   *
   * @param {Object} [options={}]
   * @returns {{ isAligned: boolean, angleDegrees: number }}
   */
  getThreeBodyAlignment(options = {}) {
    // Strictly scoped to Chapter 2
    if (this.chapter !== 2 || this.chapterState === ChapterTransitionState.CHAPTER_1_CAPTURE) {
      this._threeBodyAlignmentCache.isAligned = false;
      this._threeBodyAlignmentCache.angleDegrees = 180.0;
      return this._threeBodyAlignmentCache;
    }

    if (this.binarySystem) {
      const res = this.binarySystem.getThreeBodyAlignment(options);
      this._threeBodyAlignmentCache.isAligned = res.isAligned;
      this._threeBodyAlignmentCache.angleDegrees = res.angleDegrees;
      return this._threeBodyAlignmentCache;
    }

    if (this.orbitalEngine) {
      const res = computeThreeBodyAlignment(this.orbitalEngine, {
        star1: 0,
        star2: 1,
        planet: this._findPlanetIndex(),
        ...options
      });
      this._threeBodyAlignmentCache.isAligned = res.isAligned;
      this._threeBodyAlignmentCache.angleDegrees = res.angleDegrees;
      return this._threeBodyAlignmentCache;
    }

    this._threeBodyAlignmentCache.isAligned = false;
    this._threeBodyAlignmentCache.angleDegrees = 180.0;
    return this._threeBodyAlignmentCache;
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

    this.chapterState = ChapterTransitionState.CHAPTER_1_CAPTURE;
    this.transitionDuration = TRANSITION_CONFIG?.DURATION ?? 2.0;
    this.transitionElapsed = 0.0;
    this.transitionProgress = 0.0;
    this._isTransitioning = false;
    this.isThreeBodyAligned = false;
    this._threeBodyAlignmentCache.isAligned = false;
    this._threeBodyAlignmentCache.angleDegrees = 180.0;

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

    // Reset cadence telemetry
    this._cadenceTelemetry.lastCatchDeltaSeconds = 0.0;
    this._cadenceTelemetry.targetCadenceSeconds = CADENCE_CONFIG.TARGET_INTERVAL;
    this._cadenceTelemetry.deviationMs = 0.0;
    this._cadenceTelemetry.onBeatHitRate = 1.0;
    this._cadenceTelemetry.currentSemiMajorAxis = BINARY_CONFIG?.PLANET_ORBIT_RADIUS ?? 2.4;
    this._cadenceTelemetry.totalChapter2Catches = 0;
    this._cadenceTelemetry.onBeatChapter2Catches = 0;
    this._lastScoreTimestampMs = null;
    this._lastScoreSimTime = null;

    if (this.finaleManager) {
      this.finaleManager.reset();
    }

    if (this.captureBurn) {
      this.captureBurn.reset();
    }

    this.trickSequencer.reset();
  }
}

