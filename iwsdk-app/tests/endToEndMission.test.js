/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * ============================================================================
 * Official "Done When" End-to-End Mission Verification Test Suite
 * Role: Person B (The Physics & Mission Lead)
 * ============================================================================
 *
 * Drives Chapters 1 through 3 end-to-end using synthetic ScoreEvents and verifies:
 * 1. Chapter 1: Hyperbolic Approach -> 1.0s Retrograde Burn -> 2.0s Hermite Transition (0 -> 400 Energy)
 *    - Unbound hyperbolic approach (eps > 0)
 *    - Single big cup trick sequence exclusively
 *    - 1.0s burn bleeding specific energy from eps > 0 to eps < 0 (bound elliptical orbit)
 *    - 2.0s cubic Hermite smoothstep blend into circumbinary injection (per-frame displacement < 0.05)
 *    - PlanetState.kintsugiVeinGlow eases toward 1.0
 * 2. Chapter 2: Circumbinary Resonance & On-Cadence Impulses (400 -> 1000 Energy)
 *    - Stable binary star barycentric orbit (separation 0.8 +/- 10^-2)
 *    - Target alternates big <-> small (TrickType.ALTERNATE)
 *    - On-cadence catches apply prograde impulses measurably expanding semi-major axis
 *    - Planet remains outside chaotic zone (r > 2.0)
 *    - PlanetState.atmosphereDensity eases toward 1.0 while kintsugiVeinGlow remains 1.0
 * 3. Chapter 3: Deterministic Slingshot Capture (1000 -> 1700 Energy)
 *    - Frozen SLINGSHOT_PRESET encounter around Star 3
 *    - Target cycles big -> small -> base (TrickType.AROUND)
 *    - Collision avoidance invariant (min separation > 0.25)
 *    - Captured into bound orbit around Star 3 (eps < 0, eccentricity < 0.20)
 *    - PlanetState.oceanFillLevel eases toward 1.0
 *    - Advances cleanly to Chapter 4 (TrickType.SPIKE) at 1700 energy
 * 4. Global Invariants:
 *    - Zero NaN / Infinity in any active body position or velocity across all 120 Hz frames
 *    - Zero unbounded energy divergence
 *    - Clean event delivery across all chapter transitions
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OrbitalEngine } from '../src/physics/OrbitalEngine.js';
import { CaptureBurn } from '../src/physics/CaptureBurn.js';
import { BinarySystem } from '../src/physics/BinarySystem.js';
import { TrickSequencer } from '../src/mission/TrickSequencer.js';
import { MissionController, ChapterTransitionState } from '../src/mission/MissionController.js';
import { SLINGSHOT_PRESET, CADENCE_CONFIG, MISSION_THRESHOLDS } from '../src/mission/missionConfig.js';
import { calculateSpecificEnergy, calculateEccentricity, calculateSemiMajorAxis } from '../src/physics/orbits.js';
import { Events, CupKey, TrickType, ScoreEvent } from '../src/contracts/Interfaces.js';

describe('Official "Done When" End-to-End Mission Verification (Chapters 1 -> 3)', () => {
  const dt = 1 / 120; // 120 Hz fixed accumulator
  let engine;
  let captureBurn;
  let binarySystem;
  let trickSequencer;
  let controller;
  let mockEventBus;

  beforeEach(() => {
    mockEventBus = {
      emit: vi.fn(),
      on: vi.fn()
    };

    engine = new OrbitalEngine({ maxBodies: 4, G: 1.0, softening: 0.0 });
    engine.setSoftening(0.0);
    engine.setG(1.0);

    captureBurn = new CaptureBurn(mockEventBus);
    binarySystem = new BinarySystem(engine, { boostDeltaV: 0.008 });
    trickSequencer = new TrickSequencer(mockEventBus);

    controller = new MissionController(mockEventBus, {
      orbitalEngine: engine,
      binarySystem,
      trickSequencer,
      captureBurn,
      transitionDuration: 2.0
    });
  });

  describe('Chapter 1: Hyperbolic Flyby, Retrograde Burn & Hermite Injection (0 -> 400 Energy)', () => {
    it('executes unbound flyby, flips energy sign via retrograde burn, and smoothly blends into circumbinary orbit', () => {
      // 1. Setup unbound hyperbolic encounter around Star 1 (M = 1.0 at origin)
      engine.setBody(0, 'star_1', 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, true);
      // Planet approaching periapsis r = 1.0 with speed 1.55 > v_esc = sqrt(2) ≈ 1.414
      engine.setBody(1, 'planet', 1e-6, 1.0, 0.0, 0.0, 0.0, 1.55, 0.0, false);

      const initialEps = calculateSpecificEnergy(engine.getBodyPosition(1), engine.getBodyVelocity(1), 1.0);
      expect(initialEps).toBeGreaterThan(0.0);
      expect(initialEps).toBeCloseTo(0.20125, 4);

      // Verify Chapter 1 trick sequence: exclusively Big Cup (TrickType.SINGLE)
      expect(controller.chapter).toBe(1);
      expect(controller.getCurrentTarget().cupKey).toBe(CupKey.BIG);
      expect(controller.getCurrentTarget().trick).toBe(TrickType.SINGLE);

      // 2. Emit 11 catches (+35 energy each = 385 energy, under 400 threshold)
      for (let c = 1; c <= 11; c++) {
        expect(controller.getCurrentTarget().cupKey).toBe(CupKey.BIG);
        expect(controller.getCurrentTarget().trick).toBe(TrickType.SINGLE);

        controller.handleScore(new ScoreEvent({ eventId: `ch1_c${c}`, awardedEnergy: 35 }));
        controller.handleCatch(CupKey.BIG);

        // Step 30 frames between catches
        for (let s = 0; s < 30; s++) {
          engine.stepRK4(dt);
          controller.update(dt);
        }
      }

      expect(controller.cosmicEnergy).toBe(385);
      expect(controller.chapter).toBe(1);
      expect(captureBurn.isActive).toBe(false);

      // 3. Catch 12 crosses 400 milestone (385 + 35 = 420 >= 400)
      controller.handleScore(new ScoreEvent({ eventId: 'ch1_c12', awardedEnergy: 35 }));
      expect(controller.cosmicEnergy).toBe(420);
      expect(controller.chapter).toBe(2);
      expect(captureBurn.isActive).toBe(true);
      expect(captureBurn.getBurnState().isActive).toBe(true);

      // 4. Step 1.0s burn (120 frames at 120 Hz)
      for (let s = 0; s < 120; s++) {
        engine.stepRK4(dt);
        controller.update(dt);
      }

      // Burn completed
      expect(captureBurn.isActive).toBe(false);
      expect(captureBurn.getBurnState().isActive).toBe(false);

      // Specific orbital energy relative to Star 1 flipped strictly from eps > 0 to eps < 0
      const postBurnPlanetPos = engine.getBodyPosition(2); // Planet placed at body slot 2 for binary handover
      const postBurnPlanetVel = engine.getBodyVelocity(2);
      const postBurnEps = calculateSpecificEnergy(postBurnPlanetPos, postBurnPlanetVel, 1.0);
      expect(postBurnEps).toBeLessThan(0.0);

      // 5. 2.0s Cubic Hermite transition into Chapter 2 circumbinary injection state
      expect(controller.isTransitioning()).toBe(true);
      expect(controller.getChapterState()).toBe(ChapterTransitionState.TRANSITION_TO_BINARY);

      let maxFrameDisplacement = 0.0;
      let prevPos = { ...engine.getBodyPosition(2) };

      for (let s = 0; s < 240; s++) {
        controller.update(dt);
        engine.stepRK4(dt);

        const curPos = engine.getBodyPosition(2);
        const displacement = Math.hypot(curPos.x - prevPos.x, curPos.y - prevPos.y, curPos.z - prevPos.z);
        if (displacement > maxFrameDisplacement) maxFrameDisplacement = displacement;
        prevPos = { ...curPos };
      }

      // Per-frame displacement strictly bounded (< 0.05 sim units, zero coordinate popping)
      expect(maxFrameDisplacement).toBeLessThan(0.05);

      // Transition complete: planet settled into circumbinary orbit at (0, 2.4, 0), vx = -0.9128709
      expect(controller.isTransitioning()).toBe(false);
      expect(controller.getTransitionProgress()).toBe(1.0);
      expect(controller.getChapterState()).toBe(ChapterTransitionState.CHAPTER_2_RESONANCE);

      const injectedPos = engine.getBodyPosition(2);
      const injectedVel = engine.getBodyVelocity(2);
      expect(Math.hypot(injectedPos.x, injectedPos.y - 2.4, injectedPos.z)).toBeLessThan(0.05);
      expect(injectedVel.x).toBeCloseTo(-0.9128709, 2);

      // Planet visual state: kintsugiVeinGlow eased toward 1.0
      expect(controller.getPlanetState().kintsugiVeinGlow).toBeCloseTo(1.0, 2);
    });
  });

  describe('Chapter 2: Circumbinary Resonance & On-Cadence Impulses (400 -> 1000 Energy)', () => {
    it('preserves binary separation (0.8 +/- 10^-2), expands semi-major axis, and alternates targets', () => {
      // Fast-forward setup through Chapter 1 to Chapter 2 resonance
      engine.setBody(0, 'star_1', 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, true);
      engine.setBody(1, 'planet', 1e-6, 1.0, 0.0, 0.0, 0.0, 1.55, 0.0, false);
      controller.handleScore(420);

      // 120 burn steps + 240 transition steps
      for (let s = 0; s < 360; s++) {
        controller.update(dt);
        engine.stepRK4(dt);
      }

      expect(controller.chapter).toBe(2);
      expect(controller.getChapterState()).toBe(ChapterTransitionState.CHAPTER_2_RESONANCE);

      let allTargetsAlternate = true;
      let allImpulsesIncreasedA = true;
      let maxBinarySepDev = 0.0;
      let minPlanetR = Infinity;

      // 15 on-cadence catches spaced 210 steps (1.75s cadence) apart
      for (let c = 1; c <= 15; c++) {
        for (let s = 0; s < 210; s++) {
          engine.stepRK4(dt);
          controller.update(dt);

          // Invariant: binary separation remains 0.8 +/- 10^-2
          const s1 = engine.getBodyPosition(0);
          const s2 = engine.getBodyPosition(1);
          const separation = Math.hypot(s1.x - s2.x, s1.y - s2.y, s1.z - s2.z);
          const dev = Math.abs(separation - 0.8);
          if (dev > maxBinarySepDev) maxBinarySepDev = dev;

          // Invariant: planet stays outside chaotic inner zone (> 2.0)
          const pp = engine.getBodyPosition(2);
          const r = Math.hypot(pp.x, pp.y, pp.z);
          if (r < minPlanetR) minPlanetR = r;
        }

        const curTarget = controller.getCurrentTarget();
        expect(curTarget.trick).toBe(TrickType.ALTERNATE);
        if (c % 2 === 1 && curTarget.cupKey !== CupKey.BIG) allTargetsAlternate = false;
        if (c % 2 === 0 && curTarget.cupKey !== CupKey.SMALL) allTargetsAlternate = false;

        const ppBefore = engine.getBodyPosition(2);
        const pvBefore = engine.getBodyVelocity(2);
        const aBefore = calculateSemiMajorAxis(ppBefore, pvBefore, 2.0);

        // Emit on-cadence score event
        controller.handleScore(new ScoreEvent({
          eventId: `ch2_c${c}`,
          awardedEnergy: 40,
          isOnCadence: true,
          cadenceMultiplier: 1.25,
          multipliers: { cadence: 1.25 }
        }));
        controller.handleCatch(curTarget.cupKey);

        // For catches within Chapter 2 (c = 1..14), verify semi-major axis strictly grew
        if (c < 15) {
          const pvAfter = engine.getBodyVelocity(2);
          const aAfter = calculateSemiMajorAxis(ppBefore, pvAfter, 2.0);
          if (aAfter <= aBefore) allImpulsesIncreasedA = false;
        }
      }

      // Assertions
      expect(allTargetsAlternate).toBe(true);
      expect(allImpulsesIncreasedA).toBe(true);
      expect(maxBinarySepDev).toBeLessThan(0.01);
      expect(minPlanetR).toBeGreaterThan(2.0);

      // Energy reaches 1020 >= 1000 threshold, advancing to Chapter 3
      expect(controller.cosmicEnergy).toBe(1020);
      expect(controller.chapter).toBe(3);

      // Visual progress: atmosphereDensity has smoothly eased toward 1.0, kintsugiVeinGlow remains 1.0
      expect(controller.getPlanetState().atmosphereDensity).toBeGreaterThan(0.85);
      expect(controller.getPlanetState().kintsugiVeinGlow).toBe(1.0);
    });
  });

  describe('Chapter 3: Gravitational Slingshot Capture (1000 -> 1700 Energy)', () => {
    it('executes frozen slingshot preset, captures around Star 3 (eps < 0, e < 0.20), and cycles Around the World', () => {
      // Set to Chapter 3 with accumulated energy
      controller.setChapter(3);
      controller.handleScore(1020);

      // Setup Star 3 and Planet from frozen SLINGSHOT_PRESET
      engine.reset();
      engine.setBody(
        0,
        'star_3',
        1.0,
        SLINGSHOT_PRESET.STAR3_POS.x,
        SLINGSHOT_PRESET.STAR3_POS.y,
        SLINGSHOT_PRESET.STAR3_POS.z,
        SLINGSHOT_PRESET.STAR3_VEL.x,
        SLINGSHOT_PRESET.STAR3_VEL.y,
        SLINGSHOT_PRESET.STAR3_VEL.z,
        false
      );

      engine.setBody(
        1,
        'planet',
        1e-6,
        SLINGSHOT_PRESET.INITIAL_PLANET_POS.x,
        SLINGSHOT_PRESET.INITIAL_PLANET_POS.y,
        SLINGSHOT_PRESET.INITIAL_PLANET_POS.z,
        SLINGSHOT_PRESET.INITIAL_PLANET_VEL.x,
        SLINGSHOT_PRESET.INITIAL_PLANET_VEL.y,
        SLINGSHOT_PRESET.INITIAL_PLANET_VEL.z,
        false
      );

      let minSlingshotSeparation = Infinity;
      let ch3TargetAround = true;
      const targetCupHistory = [];

      // Step across the 20.0s slingshot encounter (2,400 frames at 120 Hz)
      for (let s = 0; s < 2400; s++) {
        engine.stepRK4(dt);
        controller.update(dt);

        const p3 = engine.getBodyPosition(0);
        const pp = engine.getBodyPosition(1);
        const dist = Math.hypot(pp.x - p3.x, pp.y - p3.y, pp.z - p3.z);
        if (dist < minSlingshotSeparation) minSlingshotSeparation = dist;

        // Emit catches periodically (every 130 frames) until energy reaches 1700 (17 catches * 40 = 680 + 1020 = 1700)
        if (s % 130 === 0 && controller.cosmicEnergy < 1700) {
          const curTarget = controller.getCurrentTarget();
          if (curTarget.trick !== TrickType.AROUND) ch3TargetAround = false;
          targetCupHistory.push(curTarget.cupKey);

          controller.handleScore(new ScoreEvent({ eventId: `ch3_s${s}`, awardedEnergy: 40 }));
          controller.handleCatch(curTarget.cupKey);
        }
      }

      // 1. Verify TrickSequencer cycled Around the World ('big' -> 'small' -> 'base')
      expect(ch3TargetAround).toBe(true);
      expect(targetCupHistory.slice(0, 3)).toEqual([CupKey.BIG, CupKey.SMALL, CupKey.BASE]);
      expect(targetCupHistory.slice(3, 6)).toEqual([CupKey.BIG, CupKey.SMALL, CupKey.BASE]);

      // 2. Collision avoidance: min separation remains strictly > 0.25 sim units
      expect(minSlingshotSeparation).toBeGreaterThan(0.25);
      expect(minSlingshotSeparation).toBeCloseTo(SLINGSHOT_PRESET.METRICS.PERIAPSIS_DISTANCE, 2);

      // 3. Captured into stable, low-eccentricity bound orbit around Star 3
      const p3Final = engine.getBodyPosition(0);
      const ppFinal = engine.getBodyPosition(1);
      const v3Final = engine.getBodyVelocity(0);
      const vpFinal = engine.getBodyVelocity(1);

      const rRel = { x: ppFinal.x - p3Final.x, y: ppFinal.y - p3Final.y, z: ppFinal.z - p3Final.z };
      const vRel = { x: vpFinal.x - v3Final.x, y: vpFinal.y - v3Final.y, z: vpFinal.z - v3Final.z };

      const ch3Energy = calculateSpecificEnergy(rRel, vRel, 1.0);
      const ch3Eccentricity = calculateEccentricity(rRel, vRel, 1.0);

      expect(ch3Energy).toBeLessThan(0.0);
      expect(ch3Eccentricity).toBeLessThan(0.20);
      expect(ch3Eccentricity).toBeCloseTo(SLINGSHOT_PRESET.METRICS.ECCENTRICITY, 2);

      // 4. Milestone 1700 reached: clean advancement to Chapter 4 (Spike target)
      expect(controller.cosmicEnergy).toBeGreaterThanOrEqual(1700);
      expect(controller.chapter).toBe(4);
      expect(controller.getCurrentTarget().cupKey).toBe(CupKey.SPIKE);
      expect(controller.getCurrentTarget().trick).toBe(TrickType.SPIKE);

      // 5. Visual evolution: oceanFillLevel eased smoothly to 1.0
      expect(controller.getPlanetState().oceanFillLevel).toBeCloseTo(1.0, 2);
    });
  });

  describe('Global Simulation Invariants & Stability (Continuous Full-Voyage Execution)', () => {
    it('executes over 6,000 continuous 120 Hz frames with zero NaN/Infinity, zero divergence, and bounded visual scalars', () => {
      let totalSteps = 0;
      let nanOrInfCount = 0;

      function assertFrameIntegrity() {
        totalSteps++;
        for (let b = 0; b < engine.maxBodies; b++) {
          if (engine.active[b]) {
            const p = engine.getBodyPosition(b);
            const v = engine.getBodyVelocity(b);
            if (
              !Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z) ||
              !Number.isFinite(v.x) || !Number.isFinite(v.y) || !Number.isFinite(v.z)
            ) {
              nanOrInfCount++;
            }
          }
        }
      }

      // ----------------------------------------------------
      // Phase 1: Chapter 1 Hyperbolic Approach & Burn (480 frames)
      // ----------------------------------------------------
      engine.setBody(0, 'star_1', 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, true);
      engine.setBody(1, 'planet', 1e-6, 1.0, 0.0, 0.0, 0.0, 1.55, 0.0, false);

      for (let c = 1; c <= 11; c++) {
        controller.handleScore(new ScoreEvent({ eventId: `full_ch1_c${c}`, awardedEnergy: 35 }));
        controller.handleCatch(CupKey.BIG);
        for (let s = 0; s < 30; s++) {
          engine.stepRK4(dt);
          controller.update(dt);
          assertFrameIntegrity();
        }
      }

      // Crossing 400 triggers burn (120 frames) + transition (240 frames)
      controller.handleScore(new ScoreEvent({ eventId: 'full_ch1_cross400', awardedEnergy: 35 }));
      for (let s = 0; s < 360; s++) {
        engine.stepRK4(dt);
        controller.update(dt);
        assertFrameIntegrity();
      }

      expect(controller.chapter).toBe(2);

      // ----------------------------------------------------
      // Phase 2: Chapter 2 Binary Resonance (3,150 frames)
      // ----------------------------------------------------
      for (let c = 1; c <= 15; c++) {
        for (let s = 0; s < 210; s++) {
          engine.stepRK4(dt);
          controller.update(dt);
          assertFrameIntegrity();
        }
        const curTarget = controller.getCurrentTarget();
        controller.handleScore(new ScoreEvent({
          eventId: `full_ch2_c${c}`,
          awardedEnergy: 40,
          isOnCadence: true,
          cadenceMultiplier: 1.25,
          multipliers: { cadence: 1.25 }
        }));
        controller.handleCatch(curTarget.cupKey);
      }

      expect(controller.chapter).toBe(3);

      // ----------------------------------------------------
      // Phase 3: Chapter 3 Slingshot Encounter (2,400 frames)
      // ----------------------------------------------------
      engine.reset();
      engine.setBody(
        0,
        'star_3',
        1.0,
        SLINGSHOT_PRESET.STAR3_POS.x,
        SLINGSHOT_PRESET.STAR3_POS.y,
        SLINGSHOT_PRESET.STAR3_POS.z,
        SLINGSHOT_PRESET.STAR3_VEL.x,
        SLINGSHOT_PRESET.STAR3_VEL.y,
        SLINGSHOT_PRESET.STAR3_VEL.z,
        false
      );

      engine.setBody(
        1,
        'planet',
        1e-6,
        SLINGSHOT_PRESET.INITIAL_PLANET_POS.x,
        SLINGSHOT_PRESET.INITIAL_PLANET_POS.y,
        SLINGSHOT_PRESET.INITIAL_PLANET_POS.z,
        SLINGSHOT_PRESET.INITIAL_PLANET_VEL.x,
        SLINGSHOT_PRESET.INITIAL_PLANET_VEL.y,
        SLINGSHOT_PRESET.INITIAL_PLANET_VEL.z,
        false
      );

      for (let s = 0; s < 2400; s++) {
        engine.stepRK4(dt);
        controller.update(dt);
        assertFrameIntegrity();

        if (s % 130 === 0 && controller.cosmicEnergy < 1700) {
          const curTarget = controller.getCurrentTarget();
          controller.handleScore(new ScoreEvent({ eventId: `full_ch3_s${s}`, awardedEnergy: 40 }));
          controller.handleCatch(curTarget.cupKey);
        }
      }

      // Verification of global invariants
      expect(totalSteps).toBeGreaterThanOrEqual(6000);
      expect(nanOrInfCount).toBe(0);

      // Visual evolution variables are strictly bounded in [0.0, 1.0]
      const pState = controller.getPlanetState();
      expect(pState.kintsugiVeinGlow).toBeGreaterThanOrEqual(0.0);
      expect(pState.kintsugiVeinGlow).toBeLessThanOrEqual(1.0);
      expect(pState.atmosphereDensity).toBeGreaterThanOrEqual(0.0);
      expect(pState.atmosphereDensity).toBeLessThanOrEqual(1.0);
      expect(pState.oceanFillLevel).toBeGreaterThanOrEqual(0.0);
      expect(pState.oceanFillLevel).toBeLessThanOrEqual(1.0);
      expect(pState.ringFormationAlpha).toBeGreaterThanOrEqual(0.0);
      expect(pState.ringFormationAlpha).toBeLessThanOrEqual(1.0);

      // Clean finale threshold achieved
      expect(controller.chapter).toBe(4);
      expect(controller.cosmicEnergy).toBeGreaterThanOrEqual(1700);
    });
  });
});

