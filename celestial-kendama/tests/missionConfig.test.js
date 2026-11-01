// tests/missionConfig.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  MISSION_THRESHOLDS,
  SCORING_CONFIG,
  WORLD_CONFIG,
  INTEGRATION_CONFIG,
  CHAPTER_CONFIGS,
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

    it('is immutable (frozen)', () => {
      assert.ok(Object.isFrozen(MISSION_THRESHOLDS));
    });
  });

  describe('SCORING_CONFIG (Person A balance)', () => {
    it('contains base energy of 20 and max multiplier cap of 2.5', () => {
      assert.equal(SCORING_CONFIG.BASE_ENERGY, 20);
      assert.equal(SCORING_CONFIG.MAX_TOTAL_MULTIPLIER, 2.5);
    });

    it('defines clean multiplier of 1.4 and cadence bonus of 1.25', () => {
      assert.equal(SCORING_CONFIG.CLEAN_MULTIPLIER, 1.4);
      assert.equal(SCORING_CONFIG.CADENCE_BONUS_MULTIPLIER, 1.25);
    });

    it('defines cadence timing tolerance of 0.35s and flight cycle of 0.84s', () => {
      assert.equal(SCORING_CONFIG.CADENCE_TOLERANCE_SEC, 0.35);
      assert.equal(SCORING_CONFIG.FLIGHT_CYCLE_SEC, 0.84);
    });
  });

  describe('WORLD_CONFIG (Person C rendering & scale)', () => {
    it('defines WORLD_SCALE of 10.0', () => {
      assert.equal(WORLD_CONFIG.WORLD_SCALE, 10.0);
    });

    it('defines sky view center offset in forward frustum', () => {
      assert.deepEqual(WORLD_CONFIG.SKY_VIEW_OFFSET, { x: 0.0, y: 1.2, z: -3.5 });
    });

    it('defines gravitational constant 1.0 and softening 0.04', () => {
      assert.equal(WORLD_CONFIG.SIM_GRAVITATIONAL_CONSTANT, 1.0);
      assert.equal(WORLD_CONFIG.SOFTENING_PARAM_SQ, 0.04);
    });
  });

  describe('INTEGRATION_CONFIG (RK4 Adaptive Substepping)', () => {
    it('defines substeps 1, 4, 12 and distance squared thresholds', () => {
      assert.equal(INTEGRATION_CONFIG.DEFAULT_SUBSTEPS, 1);
      assert.equal(INTEGRATION_CONFIG.CLOSE_APPROACH_SUBSTEPS, 4);
      assert.equal(INTEGRATION_CONFIG.EXTREME_PROXIMITY_SUBSTEPS, 12);
      assert.equal(INTEGRATION_CONFIG.CLOSE_APPROACH_DIST_SQ, 1.0);
      assert.equal(INTEGRATION_CONFIG.EXTREME_PROXIMITY_DIST_SQ, 0.25);
    });
  });

  describe('CHAPTER_CONFIGS & Helpers', () => {
    it('defines configurations for chapters 1 through 4', () => {
      assert.equal(CHAPTER_CONFIGS[1].targetEnergy, 400);
      assert.equal(CHAPTER_CONFIGS[1].defaultCupKey, CupKey.BIG);
      assert.ok(CHAPTER_CONFIGS[1].allowedTricks.includes(TrickType.SINGLE));

      assert.equal(CHAPTER_CONFIGS[2].targetEnergy, 1000);
      assert.ok(CHAPTER_CONFIGS[2].allowedTricks.includes(TrickType.ALTERNATE));

      assert.equal(CHAPTER_CONFIGS[3].targetEnergy, 1700);
      assert.equal(CHAPTER_CONFIGS[3].defaultCupKey, CupKey.BASE);

      assert.equal(CHAPTER_CONFIGS[4].targetEnergy, 2200);
      assert.equal(CHAPTER_CONFIGS[4].planetEvolution.goldIgnited, true);
    });

    it('getChapterByEnergy returns correct active chapter progression', () => {
      assert.equal(getChapterByEnergy(0), 1);
      assert.equal(getChapterByEnergy(399), 1);
      assert.equal(getChapterByEnergy(400), 2);
      assert.equal(getChapterByEnergy(999), 2);
      assert.equal(getChapterByEnergy(1000), 3);
      assert.equal(getChapterByEnergy(1699), 3);
      assert.equal(getChapterByEnergy(1700), 4);
      assert.equal(getChapterByEnergy(2500), 4);
    });

    it('getChapterConfig clamps gracefully to valid chapters', () => {
      assert.equal(getChapterConfig(1).chapter, 1);
      assert.equal(getChapterConfig(0).chapter, 1);
      assert.equal(getChapterConfig(99).chapter, 4);
    });
  });
});
