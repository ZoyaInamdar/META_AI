/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * ============================================================================
 * Unit Tests for MissionController (Step 1.7)
 * Role: Person B (The Mission & Physics Lead)
 * ============================================================================
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MissionController } from '../src/mission/MissionController.js';
import { MissionState, PlanetState, Events, CupKey, TrickType } from '../src/contracts/Interfaces.js';
import { MISSION_THRESHOLDS } from '../src/mission/missionConfig.js';

describe('MissionController: Cosmic Progression & Visual Easing (Step 1.7)', () => {
  let controller;
  let mockEventBus;

  beforeEach(() => {
    mockEventBus = {
      emit: vi.fn(),
      on: vi.fn()
    };
    controller = new MissionController(mockEventBus);
  });

  describe('Test 1: Default Initial State', () => {
    it('initializes with 0 energy, Chapter 1, target energy 400, all visual scalars 0.0, and isGoldIgnited false', () => {
      const mission = controller.getMissionState();
      const planet = controller.getPlanetState();

      expect(mission).toBeInstanceOf(MissionState);
      expect(mission.chapter).toBe(1);
      expect(mission.cosmicEnergy).toBe(0);
      expect(mission.targetEnergy).toBe(MISSION_THRESHOLDS.CHAPTER_1); // 400
      expect(mission.milestoneReached).toBe(false);

      expect(planet).toBeInstanceOf(PlanetState);
      expect(planet.kintsugiVeinGlow).toBe(0.0);
      expect(planet.atmosphereDensity).toBe(0.0);
      expect(planet.oceanFillLevel).toBe(0.0);
      expect(planet.ringFormationAlpha).toBe(0.0);
      expect(planet.scarsCount).toBe(0);
      expect(planet.isGoldIgnited).toBe(false);

      // Target cup is Chapter 1 BIG
      expect(controller.getCurrentTarget().cupKey).toBe(CupKey.BIG);
      expect(controller.getCurrentTarget().trick).toBe(TrickType.SINGLE);
    });
  });

  describe('Test 2: Energy & Chapter Thresholds', () => {
    it('transitions chapters exactly at 400, 1000, and 1700 energy, updating TrickSequencer and emitting Events.MISSION', () => {
      // 1. Below Chapter 1 threshold: 350 energy
      controller.handleScore(350);
      expect(controller.getMissionState().chapter).toBe(1);
      expect(controller.getMissionState().cosmicEnergy).toBe(350);
      expect(controller.getCurrentTarget().trick).toBe(TrickType.SINGLE);

      // 2. Cross into Chapter 2 exactly at 400 energy (350 + 50 = 400)
      controller.handleScore(50);
      expect(controller.getMissionState().chapter).toBe(2);
      expect(controller.getMissionState().cosmicEnergy).toBe(400);
      expect(controller.getMissionState().targetEnergy).toBe(MISSION_THRESHOLDS.CHAPTER_2); // 1000
      expect(controller.getCurrentTarget().trick).toBe(TrickType.ALTERNATE);
      expect(controller.getCurrentTarget().cupKey).toBe(CupKey.BIG);

      expect(mockEventBus.emit).toHaveBeenCalledWith(
        Events.MISSION,
        expect.objectContaining({ chapter: 2, milestoneReached: true })
      );

      // 3. Advance to Chapter 3 threshold at 1000 energy (400 + 600 = 1000)
      controller.handleScore(600);
      expect(controller.getMissionState().chapter).toBe(3);
      expect(controller.getMissionState().cosmicEnergy).toBe(1000);
      expect(controller.getMissionState().targetEnergy).toBe(MISSION_THRESHOLDS.CHAPTER_3); // 1700
      expect(controller.getCurrentTarget().trick).toBe(TrickType.AROUND);

      expect(mockEventBus.emit).toHaveBeenCalledWith(
        Events.MISSION,
        expect.objectContaining({ chapter: 3, milestoneReached: true })
      );

      // 4. Advance to Chapter 4 / Finale threshold at 1700 energy (1000 + 700 = 1700)
      controller.handleScore(700);
      expect(controller.getMissionState().chapter).toBe(4);
      expect(controller.getMissionState().cosmicEnergy).toBe(1700);
      expect(controller.getMissionState().targetEnergy).toBe(MISSION_THRESHOLDS.FINALE); // 2200
      expect(controller.getCurrentTarget().trick).toBe(TrickType.SPIKE);
      expect(controller.getCurrentTarget().cupKey).toBe(CupKey.SPIKE);

      expect(mockEventBus.emit).toHaveBeenCalledWith(
        Events.MISSION,
        expect.objectContaining({ chapter: 4, milestoneReached: true })
      );
    });

    it('handles deduplication of score events with identical eventId', () => {
      controller.handleScore({ eventId: 'evt_101', awardedEnergy: 50 });
      expect(controller.getMissionState().cosmicEnergy).toBe(50);

      // Duplicate event
      controller.handleScore({ eventId: 'evt_101', awardedEnergy: 50 });
      expect(controller.getMissionState().cosmicEnergy).toBe(50);
    });
  });

  describe('Test 3: Climax Ignition', () => {
    it('flips isGoldIgnited to true once energy reaches or exceeds 2200', () => {
      // Feed energy just below climax
      controller.handleScore(2199);
      expect(controller.getPlanetState().isGoldIgnited).toBe(false);

      // Push across 2200 boundary
      controller.handleScore(1);
      expect(controller.getMissionState().cosmicEnergy).toBe(2200);
      expect(controller.getPlanetState().isGoldIgnited).toBe(true);

      // Further energy maintains ignited flag
      controller.handleScore(100);
      expect(controller.getPlanetState().isGoldIgnited).toBe(true);
    });
  });

  describe('Test 4: Exponential Easing', () => {
    it('smooths visual scalar targets monotonically toward targets without overshoot [0.0, 1.0]', () => {
      // Feed energy to set Chapter 1 progress to 50% (200 / 400)
      controller.handleScore(200);

      const dt = 0.05;
      let prevGlow = controller.getPlanetState().kintsugiVeinGlow;
      expect(prevGlow).toBe(0.0);

      // Step multiple render frames
      for (let f = 0; f < 10; f++) {
        const { planetState } = controller.update(dt);
        const currentGlow = planetState.kintsugiVeinGlow;

        // Monotonically increasing
        expect(currentGlow).toBeGreaterThanOrEqual(prevGlow);
        // Bounded strictly within [0.0, 1.0]
        expect(currentGlow).toBeGreaterThanOrEqual(0.0);
        expect(currentGlow).toBeLessThanOrEqual(1.0);
        // Approaching target 0.5 without overshooting
        expect(currentGlow).toBeLessThanOrEqual(0.5);

        prevGlow = currentGlow;
      }

      // After sufficient steps, should converge very close to target 0.5
      for (let f = 0; f < 50; f++) {
        controller.update(dt);
      }
      expect(controller.getPlanetState().kintsugiVeinGlow).toBeCloseTo(0.5, 4);
    });
  });

  describe('Test 5: One-Miss-Per-Flight Invariant', () => {
    it('increments scarsCount by exactly 1 on handleMiss, and does not modify scarsCount on handleCatch', () => {
      expect(controller.getPlanetState().scarsCount).toBe(0);

      // 1. Initial miss
      const scars1 = controller.handleMiss();
      expect(scars1).toBe(1);
      expect(controller.getPlanetState().scarsCount).toBe(1);

      // 2. Successful catch resets flight, does NOT increment scars
      controller.handleCatch({ cupKey: CupKey.BIG });
      expect(controller.getPlanetState().scarsCount).toBe(1);

      // 3. Subsequent miss in next flight cycle increments to 2
      const scars2 = controller.handleMiss();
      expect(scars2).toBe(2);
      expect(controller.getPlanetState().scarsCount).toBe(2);
    });

    it('guards against duplicate miss events for the same flightId', () => {
      controller.handleMiss({ flightId: 'flight_100' });
      expect(controller.getPlanetState().scarsCount).toBe(1);

      // Duplicate invocation with identical flightId
      controller.handleMiss({ flightId: 'flight_100' });
      expect(controller.getPlanetState().scarsCount).toBe(1);

      // New flightId increments
      controller.handleMiss({ flightId: 'flight_101' });
      expect(controller.getPlanetState().scarsCount).toBe(2);
    });
  });

  describe('Reset Utility', () => {
    it('restores all state to Chapter 1 defaults', () => {
      controller.handleScore(1500);
      controller.handleMiss();
      controller.update(0.5);

      expect(controller.getMissionState().chapter).toBe(3);
      expect(controller.getPlanetState().scarsCount).toBe(1);

      controller.reset();

      expect(controller.getMissionState().chapter).toBe(1);
      expect(controller.getMissionState().cosmicEnergy).toBe(0);
      expect(controller.getPlanetState().scarsCount).toBe(0);
      expect(controller.getPlanetState().kintsugiVeinGlow).toBe(0.0);
      expect(controller.getCurrentTarget().cupKey).toBe(CupKey.BIG);
    });
  });
});

