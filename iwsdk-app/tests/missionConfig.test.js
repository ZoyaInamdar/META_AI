/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * ============================================================================
 * Unit Tests for Mission & Physics Configuration
 * Role: Person B (The Physics & Mission Lead)
 * Verification for Step 0.2: missionConfig.js
 * ============================================================================
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
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
      assert.equal(MISSION_THRESHOLDS.CHAPTER_1, 400);
      assert.equal(MISSION_THRESHOLDS.CHAPTER_2, 1000);
      assert.equal(MISSION_THRESHOLDS.CHAPTER_3, 1700);
      assert.equal(MISSION_THRESHOLDS.FINALE, 2200);
    });

    it('thresholds are strictly monotonically increasing (CHAPTER_1 < CHAPTER_2 < CHAPTER_3 < FINALE)', () => {
      assert.ok(MISSION_THRESHOLDS.CHAPTER_1 < MISSION_THRESHOLDS.CHAPTER_2);
      assert.ok(MISSION_THRESHOLDS.CHAPTER_2 < MISSION_THRESHOLDS.CHAPTER_3);
      assert.ok(MISSION_THRESHOLDS.CHAPTER_3 < MISSION_THRESHOLDS.FINALE);
    });

    it('is immutable (frozen)', () => {
      assert.ok(Object.isFrozen(MISSION_THRESHOLDS));
    });
  });

  describe('CADENCE_CONFIG (Person A & B timing)', () => {
    it('defines target interval of 1.75s with 0.35s tolerance window', () => {
      assert.equal(CADENCE_CONFIG.TARGET_INTERVAL, 1.75);
      assert.equal(CADENCE_CONFIG.WINDOW_TOLERANCE, 0.35);
      assert.equal(CADENCE_CONFIG.MIN_CADENCE, 1.5);
      assert.equal(CADENCE_CONFIG.MAX_CADENCE, 2.0);
    });

    it('is immutable (frozen)', () => {
      assert.ok(Object.isFrozen(CADENCE_CONFIG));
    });
  });

  describe('COSMIC_SCALE & WORLD_CONFIG (Person C rendering & scale)', () => {
    it('defines WORLD_SCALE of 10.0 (1 sim unit = 10.0 visual meters in VR sky)', () => {
      assert.equal(COSMIC_SCALE.WORLD_SCALE, 10.0);
      assert.equal(WORLD_CONFIG.WORLD_SCALE, 10.0);
    });

    it('defines sky view origin in forward upper frustum (y=+1.2m, z=-3.5m)', () => {
      assert.deepEqual(COSMIC_SCALE.SKY_ORIGIN, { x: 0.0, y: 1.2, z: -3.5 });
      assert.deepEqual(WORLD_CONFIG.SKY_VIEW_OFFSET, { x: 0.0, y: 1.2, z: -3.5 });
    });

    it('is immutable (frozen)', () => {
      assert.ok(Object.isFrozen(COSMIC_SCALE));
      assert.ok(Object.isFrozen(COSMIC_SCALE.SKY_ORIGIN));
      assert.ok(Object.isFrozen(WORLD_CONFIG));
    });
  });

  describe('PHYSICS_TIMESTEP & INTEGRATION_CONFIG', () => {
    it('FIXED_DELTA is strictly positive and equals 1/120', () => {
      assert.ok(PHYSICS_TIMESTEP.FIXED_DELTA > 0);
      assert.equal(PHYSICS_TIMESTEP.FIXED_DELTA, 1 / 120);
    });

    it('defines MAX_ACCUMULATED_FRAMES as 5 and DEFAULT_SOFTENING as 0.05', () => {
      assert.equal(PHYSICS_TIMESTEP.MAX_ACCUMULATED_FRAMES, 5);
      assert.equal(PHYSICS_TIMESTEP.DEFAULT_SOFTENING, 0.05);
    });

    it('is immutable (frozen)', () => {
      assert.ok(Object.isFrozen(PHYSICS_TIMESTEP));
    });

    it('integration config references fixed timestep and adaptive substeps', () => {
      assert.equal(INTEGRATION_CONFIG.PHYSICS_TIMESTEP, 1 / 120);
      assert.equal(INTEGRATION_CONFIG.DEFAULT_SUBSTEPS, 1);
      assert.equal(INTEGRATION_CONFIG.CLOSE_APPROACH_SUBSTEPS, 4);
      assert.equal(INTEGRATION_CONFIG.EXTREME_PROXIMITY_SUBSTEPS, 12);
    });
  });

  describe('CHAPTER_CONFIG Metadata', () => {
    it('Chapter 1 defines Gravitational Capture metadata', () => {
      const ch1 = CHAPTER_CONFIG[1];
      assert.equal(ch1.name, 'Gravitational Capture');
      assert.equal(ch1.threshold, 400);
      assert.equal(ch1.targetCup, 'big');
      assert.equal(ch1.trick, 'single');
      assert.equal(ch1.metric, 'kintsugiVeinGlow');
      assert.ok(ch1.allowedTricks.includes(TrickType.SINGLE));
    });

    it('Chapter 2 defines Binary Resonance metadata', () => {
      const ch2 = CHAPTER_CONFIG[2];
      assert.equal(ch2.name, 'Binary Resonance');
      assert.equal(ch2.threshold, 1000);
      assert.equal(ch2.targetCup, 'small');
      assert.equal(ch2.trick, 'alternate');
      assert.equal(ch2.metric, 'atmosphereDensity');
      assert.ok(ch2.allowedTricks.includes(TrickType.ALTERNATE));
    });

    it('Chapter 3 defines The Slingshot metadata', () => {
      const ch3 = CHAPTER_CONFIG[3];
      assert.equal(ch3.name, 'The Slingshot');
      assert.equal(ch3.threshold, 1700);
      assert.equal(ch3.targetCup, 'base');
      assert.equal(ch3.trick, 'around');
      assert.equal(ch3.metric, 'oceanFillLevel');
    });

    it('Chapter 4 defines Calibration Climax metadata', () => {
      const ch4 = CHAPTER_CONFIG[4];
      assert.equal(ch4.name, 'Calibration Climax');
      assert.equal(ch4.threshold, 2200);
      assert.equal(ch4.targetCup, 'spike');
      assert.equal(ch4.trick, 'spike');
      assert.equal(ch4.metric, 'isGoldIgnited');
      assert.equal(ch4.planetEvolution.isGoldIgnited, true);
    });

    it('CHAPTER_CONFIG and all chapter entries are deep-frozen / immutable', () => {
      assert.ok(Object.isFrozen(CHAPTER_CONFIG));
      for (const ch of Object.values(CHAPTER_CONFIG)) {
        assert.ok(Object.isFrozen(ch));
        assert.ok(Object.isFrozen(ch.allowedTricks));
        assert.ok(Object.isFrozen(ch.intervention));
        assert.ok(Object.isFrozen(ch.planetEvolution));
      }
    });

    it('CHAPTER_CONFIGS alias is identical to CHAPTER_CONFIG', () => {
      assert.equal(CHAPTER_CONFIGS, CHAPTER_CONFIG);
    });
  });

  describe('Progression Helpers', () => {
    it('getChapterByEnergy returns correct active chapter progression', () => {
      assert.equal(getChapterByEnergy(0), 1);
      assert.equal(getChapterByEnergy(399), 1);
      assert.equal(getChapterByEnergy(400), 2);
      assert.equal(getChapterByEnergy(999), 2);
      assert.equal(getChapterByEnergy(1000), 3);
      assert.equal(getChapterByEnergy(1699), 3);
      assert.equal(getChapterByEnergy(1700), 4);
      assert.equal(getChapterByEnergy(2200), 4);
      assert.equal(getChapterByEnergy(2500), 4);
    });

    it('getChapterConfig safely clamps chapter indices', () => {
      assert.equal(getChapterConfig(1).chapter, 1);
      assert.equal(getChapterConfig(0).chapter, 1);
      assert.equal(getChapterConfig(-5).chapter, 1);
      assert.equal(getChapterConfig(99).chapter, 4);
    });
  });
});
