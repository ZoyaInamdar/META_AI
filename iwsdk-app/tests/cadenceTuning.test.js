/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * ============================================================================
 * Cross-Subsystem Cadence Tuning & Resonance Verification Tests (Step 3)
 * Role: Person B (Physics & Mission Lead)
 * ============================================================================
 *
 * Verifies:
 * 1. ScoreManager rhythm cadence window evaluation (1.75s +/- 0.35s = [1.40s, 2.10s]).
 * 2. On-cadence 1.25x multiplier awarded if and only if |delta - target| <= 0.35s.
 * 3. MissionController live cadence-resonance telemetry (getCadenceTelemetry()).
 * 4. Progressive semi-major axis expansion from r = 2.4 to resonant r ≈ 3.2
 *    across ~15 on-cadence catches from 400 to 1000 energy.
 * 5. Preservation of binary star stability (separation 0.8 +/- 10^-3).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ScoreManager } from '../src/game/ScoreManager.js';
import { OrbitalEngine } from '../src/physics/OrbitalEngine.js';
import { setupChapter2Binary, BinarySystem } from '../src/physics/BinarySystem.js';
import { MissionController } from '../src/mission/MissionController.js';
import { EventBus } from '../src/contracts/EventBus.js';
import { Events } from '../src/contracts/Interfaces.js';
import { CADENCE_CONFIG, BINARY_CONFIG, MISSION_THRESHOLDS } from '../src/mission/missionConfig.js';
import { calculateSemiMajorAxis } from '../src/physics/orbits.js';

describe('Cross-Subsystem Cadence Tuning (Step 3)', () => {
  let eventBus;
  let scoreManager;
  let engine;
  let binarySystem;
  let missionController;

  beforeEach(() => {
    eventBus = new EventBus();
    scoreManager = new ScoreManager({ targetCadenceSeconds: CADENCE_CONFIG.TARGET_INTERVAL }); // 1.75s

    engine = new OrbitalEngine({ maxBodies: 4, G: 1.0, softening: 0.0 });
    engine.setSoftening(0.0);
    engine.setG(1.0);

    binarySystem = new BinarySystem(engine);
    missionController = new MissionController(eventBus, {
      orbitalEngine: engine,
      binarySystem
    });
  });

  describe('1. ScoreManager Cadence Acceptance Envelope', () => {
    it('evaluates target interval 1.75s with window tolerance +/- 0.35s ([1.40s, 2.10s])', () => {
      // First catch initializes timestamp baseline at t = 10,000 ms
      const c1 = scoreManager.processCatchEvent({ type: 'CLEAN' }, 10000, 'fl_0');
      expect(c1).toBeTruthy();
      expect(c1.multipliers.cadence).toBe(1.0); // Baseline catch has no prior delta

      // Fast player: 1.45s interval (10,000 + 1,450 = 11,450 ms) -> deviation 300 ms <= 350 ms -> ON BEAT
      const cFast = scoreManager.processCatchEvent({ type: 'CLEAN' }, 11450, 'fl_fast');
      expect(cFast.multipliers.cadence).toBe(1.25);

      // Nominal player: 1.75s interval (11,450 + 1,750 = 13,200 ms) -> deviation 0 ms <= 350 ms -> ON BEAT
      const cNominal = scoreManager.processCatchEvent({ type: 'CLEAN' }, 13200, 'fl_nom');
      expect(cNominal.multipliers.cadence).toBe(1.25);

      // Relaxed player: 2.05s interval (13,200 + 2,050 = 15,250 ms) -> deviation 300 ms <= 350 ms -> ON BEAT
      const cRelaxed = scoreManager.processCatchEvent({ type: 'CLEAN' }, 15250, 'fl_relax');
      expect(cRelaxed.multipliers.cadence).toBe(1.25);

      // Off-beat player: 2.40s interval (15,250 + 2,400 = 17,650 ms) -> deviation 650 ms > 350 ms -> OFF BEAT
      const cOffBeat = scoreManager.processCatchEvent({ type: 'CLEAN' }, 17650, 'fl_off');
      expect(cOffBeat.multipliers.cadence).toBe(1.0);
    });

    it('honors exact window boundaries (1.40s and 2.10s) while rejecting points outside (1.39s and 2.11s)', () => {
      // Baseline at t = 20,000 ms
      scoreManager.processCatchEvent({ type: 'CLEAN' }, 20000, 'b_base');

      // Exact lower bound: 1.40s (1400 ms) -> deviation 350 ms -> ON BEAT
      const cLower = scoreManager.processCatchEvent({ type: 'CLEAN' }, 21400, 'b_lower');
      expect(cLower.multipliers.cadence).toBe(1.25);

      // Just outside lower bound: 1.39s (1390 ms) -> deviation 360 ms > 350 ms -> OFF BEAT
      const cBelow = scoreManager.processCatchEvent({ type: 'CLEAN' }, 22790, 'b_below');
      expect(cBelow.multipliers.cadence).toBe(1.0);

      // Exact upper bound: 2.10s (2100 ms) -> deviation 350 ms -> ON BEAT
      const cUpper = scoreManager.processCatchEvent({ type: 'CLEAN' }, 24890, 'b_upper');
      expect(cUpper.multipliers.cadence).toBe(1.25);

      // Just outside upper bound: 2.11s (2110 ms) -> deviation 360 ms > 350 ms -> OFF BEAT
      const cAbove = scoreManager.processCatchEvent({ type: 'CLEAN' }, 27000, 'b_above');
      expect(cAbove.multipliers.cadence).toBe(1.0);
    });
  });

  describe('2. MissionController Cadence-Resonance Telemetry Diagnostics', () => {
    it('initializes telemetry with defaults and tracks rolling catch statistics during Chapter 2', () => {
      binarySystem.setup();
      missionController.setChapter(2);

      const initialTelem = missionController.getCadenceTelemetry();
      expect(initialTelem.targetCadenceSeconds).toBe(1.75);
      expect(initialTelem.totalChapter2Catches).toBe(0);
      expect(initialTelem.onBeatHitRate).toBe(1.0);
      expect(initialTelem.currentSemiMajorAxis).toBeCloseTo(2.4, 2);

      // Catch 1: on-beat (1.75s nominal)
      missionController.handleScore({
        eventId: 't_c1',
        awardedEnergy: 40,
        deltaSeconds: 1.75,
        multipliers: { cadence: 1.25 }
      });

      const telem1 = missionController.getCadenceTelemetry();
      expect(telem1.totalChapter2Catches).toBe(1);
      expect(telem1.onBeatChapter2Catches).toBe(1);
      expect(telem1.onBeatHitRate).toBe(1.0);
      expect(telem1.lastCatchDeltaSeconds).toBe(1.75);
      expect(telem1.deviationMs).toBeCloseTo(0.0);
      expect(telem1.currentSemiMajorAxis).toBeGreaterThan(2.4);

      // Catch 2: on-beat fast (1.45s)
      missionController.handleScore({
        eventId: 't_c2',
        awardedEnergy: 40,
        deltaSeconds: 1.45,
        multipliers: { cadence: 1.25 }
      });

      const telem2 = missionController.getCadenceTelemetry();
      expect(telem2.totalChapter2Catches).toBe(2);
      expect(telem2.onBeatChapter2Catches).toBe(2);
      expect(telem2.onBeatHitRate).toBe(1.0);
      expect(telem2.lastCatchDeltaSeconds).toBe(1.45);
      expect(telem2.deviationMs).toBeCloseTo(300.0);

      // Catch 3: off-beat (2.40s)
      missionController.handleScore({
        eventId: 't_c3',
        awardedEnergy: 20,
        deltaSeconds: 2.40,
        multipliers: { cadence: 1.0 }
      });

      const telem3 = missionController.getCadenceTelemetry();
      expect(telem3.totalChapter2Catches).toBe(3);
      expect(telem3.onBeatChapter2Catches).toBe(2);
      expect(telem3.onBeatHitRate).toBeCloseTo(2 / 3, 4);
      expect(telem3.lastCatchDeltaSeconds).toBe(2.40);
      expect(telem3.deviationMs).toBeCloseTo(650.0);
    });

    it('reset() resets all telemetry statistics back to initial conditions', () => {
      binarySystem.setup();
      missionController.setChapter(2);

      missionController.handleScore({
        eventId: 'r_c1',
        awardedEnergy: 40,
        deltaSeconds: 1.75,
        multipliers: { cadence: 1.25 }
      });

      expect(missionController.getCadenceTelemetry().totalChapter2Catches).toBe(1);

      missionController.reset();

      const telem = missionController.getCadenceTelemetry();
      expect(telem.totalChapter2Catches).toBe(0);
      expect(telem.onBeatChapter2Catches).toBe(0);
      expect(telem.onBeatHitRate).toBe(1.0);
      expect(telem.currentSemiMajorAxis).toBe(BINARY_CONFIG.PLANET_ORBIT_RADIUS);
    });
  });

  describe('3. Pacing & Orbital Resonance Expansion (400 -> 1000 Energy)', () => {
    it('expands semi-major axis from r = 2.4 to target resonance r ≈ 3.2 across ~15 on-cadence catches', () => {
      const tunedBinary = new BinarySystem(engine, { boostDeltaV: 0.0085 });
      tunedBinary.setup();
      const tunedMission = new MissionController(eventBus, {
        orbitalEngine: engine,
        binarySystem: tunedBinary
      });
      tunedMission.setChapter(2);
      tunedMission.cosmicEnergy = 400; // Start at Chapter 2 entrance

      const initialPos = engine.getBodyPosition(2);
      const initialVel = engine.getBodyVelocity(2);
      const initialA = calculateSemiMajorAxis(initialPos, initialVel, 2.0);
      expect(initialA).toBeCloseTo(2.4, 2);

      const dt = 1 / 120;
      const stepsBetweenCatches = Math.round(1.75 / dt); // 210 steps = 1.75s cadence

      let catchCount = 0;
      let prevA = initialA;

      // Simulate 15 consecutive on-cadence catches (+40 energy each = 600 energy gained -> total 1000)
      while (tunedMission.cosmicEnergy < MISSION_THRESHOLDS.CHAPTER_2) {
        catchCount++;

        // Step physics between catches along circumbinary arc
        for (let s = 0; s < stepsBetweenCatches; s++) {
          engine.stepRK4(dt);
          tunedMission.update(dt);
        }

        // Process on-cadence catch score event
        tunedMission.handleScore({
          eventId: `pacing_c${catchCount}`,
          awardedEnergy: 40,
          deltaSeconds: 1.75,
          isOnCadence: true,
          multipliers: { cadence: 1.25 }
        });

        const curPos = engine.getBodyPosition(2);
        const curVel = engine.getBodyVelocity(2);
        const curA = calculateSemiMajorAxis(curPos, curVel, 2.0);

        // Every on-cadence impulse strictly expands the semi-major axis until resonance stabilization
        if (catchCount <= 14) {
          expect(curA).toBeGreaterThan(prevA);
          prevA = curA;
        }
      }

      // Reached 1000 energy in exactly 15 catches
      expect(catchCount).toBe(15);
      expect(tunedMission.cosmicEnergy).toBe(1000);

      // Verify semi-major axis expanded from 2.4 to target resonance region [3.0, 3.45] (target 3.2)
      const finalPos = engine.getBodyPosition(2);
      const finalVel = engine.getBodyVelocity(2);
      const finalA = calculateSemiMajorAxis(finalPos, finalVel, 2.0);

      expect(finalA).toBeGreaterThanOrEqual(3.0);
      expect(finalA).toBeLessThanOrEqual(3.45);
      expect(finalA).toBeCloseTo(3.2, 0); // Within ~0.2 of exact 3.2 resonance

      // Binary stars separation remained strictly bounded to 0.8 +/- 10^-3
      const s1 = engine.getBodyPosition(0);
      const s2 = engine.getBodyPosition(1);
      const separation = Math.hypot(s1.x - s2.x, s1.y - s2.y, s1.z - s2.z);
      expect(Math.abs(separation - 0.8)).toBeLessThan(1e-3);
    });

    it('off-beat catches do not trigger prograde impulse or expand semi-major axis', () => {
      binarySystem.setup();
      missionController.setChapter(2);

      const posBefore = engine.getBodyPosition(2);
      const velBefore = engine.getBodyVelocity(2);
      const aBefore = calculateSemiMajorAxis(posBefore, velBefore, 2.0);

      // Off-beat catch: 2.40s (deviation 650 ms > 350 ms)
      missionController.handleScore({
        eventId: 'off_beat_1',
        awardedEnergy: 20,
        deltaSeconds: 2.40,
        multipliers: { cadence: 1.0 }
      });

      const posAfter = engine.getBodyPosition(2);
      const velAfter = engine.getBodyVelocity(2);
      const aAfter = calculateSemiMajorAxis(posAfter, velAfter, 2.0);

      expect(aAfter).toBeCloseTo(aBefore, 6);
      expect(velAfter.x).toBeCloseTo(velBefore.x, 6);
      expect(velAfter.y).toBeCloseTo(velBefore.y, 6);
    });
  });

  describe('4. Cross-Subsystem Events Integration', () => {
    it('MissionController chapter change emits Events.CADENCE updating target cadence to 1.75s', () => {
      let receivedCadence = null;
      eventBus.on(Events.CADENCE, (payload) => {
        receivedCadence = payload;
      });

      missionController.setChapter(2);

      expect(receivedCadence).toBeTruthy();
      expect(receivedCadence.targetCadenceSeconds).toBe(1.75);

      // ScoreManager updates targetCadence
      scoreManager.setTargetCadence(receivedCadence.targetCadenceSeconds);

      // Process catch at t = 1.75s (1750 ms) after baseline at 0
      scoreManager.processCatchEvent({ type: 'CLEAN' }, 0, 'f0');
      const score = scoreManager.processCatchEvent({ type: 'CLEAN' }, 1750, 'f1');
      expect(score.multipliers.cadence).toBe(1.25);
    });
  });
});
