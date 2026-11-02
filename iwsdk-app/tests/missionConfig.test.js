/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * ============================================================================
 * Unit Tests for Mission & Physics Configuration
 * Role: Person B (The Physics & Mission Lead)
 * Verification for Step 0.2 under Vitest
 * ============================================================================
 */

import { describe, it, expect } from 'vitest';
import {
  MISSION_THRESHOLDS,
  CADENCE_CONFIG,
  COSMIC_SCALE,
  PHYSICS_TIMESTEP,
  CHAPTER_CONFIG,
  CHAPTER_CONFIGS,
  SCORING_CONFIG,
  WORLD_CONFIG,
  INTEGRATION_CONFIG,
  getChapterByEnergy,
  getChapterConfig
} from '../src/mission/missionConfig.js';
import { CupKey, TrickType } from '../src/contracts/Interfaces.js';

describe('Mission & Physics Config Verification (Step 0.2)', () => {
  describe('MISSION_THRESHOLDS', () => {
    it('defines agreed energy targets for chapters 1, 2, 3, and finale', () => {
      expect(MISSION_THRESHOLDS.CHAPTER_1).toBe(400);
      expect(MISSION_THRESHOLDS.CHAPTER_2).toBe(1000);
      expect(MISSION_THRESHOLDS.CHAPTER_3).toBe(1700);
      expect(MISSION_THRESHOLDS.FINALE).toBe(2200);
    });

    it('thresholds are strictly monotonically increasing (CHAPTER_1 < CHAPTER_2 < CHAPTER_3 < FINALE)', () => {
      expect(MISSION_THRESHOLDS.CHAPTER_1 < MISSION_THRESHOLDS.CHAPTER_2).toBe(true);
      expect(MISSION_THRESHOLDS.CHAPTER_2 < MISSION_THRESHOLDS.CHAPTER_3).toBe(true);
      expect(MISSION_THRESHOLDS.CHAPTER_3 < MISSION_THRESHOLDS.FINALE).toBe(true);
    });

    it('is immutable (frozen)', () => {
      expect(Object.isFrozen(MISSION_THRESHOLDS)).toBe(true);
    });
  });

  describe('CADENCE_CONFIG (Person A & B timing)', () => {
    it('defines target interval of 1.75s with 0.35s tolerance window', () => {
      expect(CADENCE_CONFIG.TARGET_INTERVAL).toBe(1.75);
      expect(CADENCE_CONFIG.WINDOW_TOLERANCE).toBe(0.35);
      expect(CADENCE_CONFIG.MIN_CADENCE).toBe(1.5);
      expect(CADENCE_CONFIG.MAX_CADENCE).toBe(2.0);
    });

    it('is immutable (frozen)', () => {
      expect(Object.isFrozen(CADENCE_CONFIG)).toBe(true);
    });
  });

  describe('COSMIC_SCALE & WORLD_CONFIG (Person C rendering & scale)', () => {
    it('defines WORLD_SCALE of 10.0 (1 sim unit = 10.0 visual meters in VR sky)', () => {
      expect(COSMIC_SCALE.WORLD_SCALE).toBe(10.0);
      expect(WORLD_CONFIG.WORLD_SCALE).toBe(10.0);
    });

    it('defines sky view origin in forward upper frustum (y=+1.2m, z=-3.5m)', () => {
      expect(COSMIC_SCALE.SKY_ORIGIN).toEqual({ x: 0.0, y: 1.2, z: -3.5 });
      expect(WORLD_CONFIG.SKY_VIEW_OFFSET).toEqual({ x: 0.0, y: 1.2, z: -3.5 });
    });

    it('is immutable (frozen)', () => {
      expect(Object.isFrozen(COSMIC_SCALE)).toBe(true);
      expect(Object.isFrozen(COSMIC_SCALE.SKY_ORIGIN)).toBe(true);
      expect(Object.isFrozen(WORLD_CONFIG)).toBe(true);
    });
  });

  describe('PHYSICS_TIMESTEP & INTEGRATION_CONFIG', () => {
    it('FIXED_DELTA is strictly positive and equals 1/120', () => {
      expect(PHYSICS_TIMESTEP.FIXED_DELTA > 0).toBe(true);
      expect(PHYSICS_TIMESTEP.FIXED_DELTA).toBe(1 / 120);
    });

    it('defines MAX_ACCUMULATED_FRAMES as 5 and DEFAULT_SOFTENING as 0.05', () => {
      expect(PHYSICS_TIMESTEP.MAX_ACCUMULATED_FRAMES).toBe(5);
      expect(PHYSICS_TIMESTEP.DEFAULT_SOFTENING).toBe(0.05);
    });

    it('is immutable (frozen)', () => {
      expect(Object.isFrozen(PHYSICS_TIMESTEP)).toBe(true);
    });

    it('integration config references fixed timestep and adaptive substeps', () => {
      expect(INTEGRATION_CONFIG.PHYSICS_TIMESTEP).toBe(1 / 120);
      expect(INTEGRATION_CONFIG.DEFAULT_SUBSTEPS).toBe(1);
      expect(INTEGRATION_CONFIG.CLOSE_APPROACH_SUBSTEPS).toBe(4);
      expect(INTEGRATION_CONFIG.EXTREME_PROXIMITY_SUBSTEPS).toBe(12);
    });
  });

  describe('CHAPTER_CONFIG Metadata', () => {
    it('Chapter 1 defines Gravitational Capture metadata', () => {
      const ch1 = CHAPTER_CONFIG[1];
      expect(ch1.name).toBe('Gravitational Capture');
      expect(ch1.threshold).toBe(400);
      expect(ch1.targetCup).toBe('big');
      expect(ch1.trick).toBe('single');
      expect(ch1.metric).toBe('kintsugiVeinGlow');
      expect(ch1.allowedTricks).toContain(TrickType.SINGLE);
    });

    it('Chapter 2 defines Binary Resonance metadata', () => {
      const ch2 = CHAPTER_CONFIG[2];
      expect(ch2.name).toBe('Binary Resonance');
      expect(ch2.threshold).toBe(1000);
      expect(ch2.targetCup).toBe('small');
      expect(ch2.trick).toBe('alternate');
      expect(ch2.metric).toBe('atmosphereDensity');
      expect(ch2.allowedTricks).toContain(TrickType.ALTERNATE);
    });

    it('Chapter 3 defines The Slingshot metadata', () => {
      const ch3 = CHAPTER_CONFIG[3];
      expect(ch3.name).toBe('The Slingshot');
      expect(ch3.threshold).toBe(1700);
      expect(ch3.targetCup).toBe('base');
      expect(ch3.trick).toBe('around');
      expect(ch3.metric).toBe('oceanFillLevel');
    });

    it('Chapter 4 defines Calibration Climax metadata', () => {
      const ch4 = CHAPTER_CONFIG[4];
      expect(ch4.name).toBe('Calibration Climax');
      expect(ch4.threshold).toBe(2200);
      expect(ch4.targetCup).toBe('spike');
      expect(ch4.trick).toBe('spike');
      expect(ch4.metric).toBe('isGoldIgnited');
      expect(ch4.planetEvolution.isGoldIgnited).toBe(true);
    });

    it('CHAPTER_CONFIG and all chapter entries are deep-frozen / immutable', () => {
      expect(Object.isFrozen(CHAPTER_CONFIG)).toBe(true);
      for (const ch of Object.values(CHAPTER_CONFIG)) {
        expect(Object.isFrozen(ch)).toBe(true);
        expect(Object.isFrozen(ch.allowedTricks)).toBe(true);
        expect(Object.isFrozen(ch.intervention)).toBe(true);
        expect(Object.isFrozen(ch.planetEvolution)).toBe(true);
      }
    });

    it('CHAPTER_CONFIGS alias is identical to CHAPTER_CONFIG', () => {
      expect(CHAPTER_CONFIGS).toBe(CHAPTER_CONFIG);
    });
  });

  describe('Progression Helpers', () => {
    it('getChapterByEnergy returns correct active chapter progression', () => {
      expect(getChapterByEnergy(0)).toBe(1);
      expect(getChapterByEnergy(399)).toBe(1);
      expect(getChapterByEnergy(400)).toBe(2);
      expect(getChapterByEnergy(999)).toBe(2);
      expect(getChapterByEnergy(1000)).toBe(3);
      expect(getChapterByEnergy(1699)).toBe(3);
      expect(getChapterByEnergy(1700)).toBe(4);
      expect(getChapterByEnergy(2200)).toBe(4);
      expect(getChapterByEnergy(2500)).toBe(4);
    });

    it('getChapterConfig safely clamps chapter indices', () => {
      expect(getChapterConfig(1).chapter).toBe(1);
      expect(getChapterConfig(0).chapter).toBe(1);
      expect(getChapterConfig(-5).chapter).toBe(1);
      expect(getChapterConfig(99).chapter).toBe(4);
    });
  });
});
