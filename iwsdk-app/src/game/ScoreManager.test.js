/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * ============================================================================
 * Unit Tests for ScoreManager
 * Role: Person A (The Hands) / Scoring & Progression Engine
 * ============================================================================
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ScoreManager } from './ScoreManager.js';

describe('ScoreManager', () => {
    let scoreManager;

    beforeEach(() => {
        scoreManager = new ScoreManager({ targetCadenceSeconds: 2.0 });
    });

    it('a. First CLEAN (flight 1, t=0): streak 1, multipliers.total ≈ 1.61, awardedEnergy 32, totalEnergy 32', () => {
        const result = scoreManager.processCatchEvent({ type: 'CLEAN' }, 0, 1);

        expect(result).not.toBeNull();
        expect(result.eventId).toBe('flight_1');
        expect(result.catchType).toBe('CLEAN');
        expect(result.baseEnergy).toBe(20);
        expect(result.currentStreak).toBe(1);
        expect(result.multipliers.accuracy).toBe(1.4);
        expect(result.multipliers.cadence).toBe(1.0);
        expect(result.multipliers.streak).toBeCloseTo(1.15, 5);
        expect(result.multipliers.total).toBeCloseTo(1.61, 5);
        expect(result.awardedEnergy).toBe(32);
        expect(result.totalEnergy).toBe(32);
        expect(scoreManager.currentStreak).toBe(1);
        expect(scoreManager.totalEnergy).toBe(32);
    });

    it('b. Second CLEAN (flight 2, t=2000, on cadence): streak 2, cadence 1.25, total ≈ 2.275, awardedEnergy 46, totalEnergy 78', () => {
        scoreManager.processCatchEvent({ type: 'CLEAN' }, 0, 1);
        const result = scoreManager.processCatchEvent({ type: 'CLEAN' }, 2000, 2);

        expect(result).not.toBeNull();
        expect(result.currentStreak).toBe(2);
        expect(result.multipliers.cadence).toBe(1.25);
        expect(result.multipliers.streak).toBeCloseTo(1.30, 5);
        expect(result.multipliers.total).toBeCloseTo(2.275, 5);
        expect(result.awardedEnergy).toBe(46);
        expect(result.totalEnergy).toBe(78);
        expect(scoreManager.currentStreak).toBe(2);
        expect(scoreManager.totalEnergy).toBe(78);
    });

    it('c. Third CLEAN (flight 3, t=4000, on cadence): streak 3, uncapped value 2.5375 so total is exactly 2.5, awardedEnergy 50, totalEnergy 128', () => {
        scoreManager.processCatchEvent({ type: 'CLEAN' }, 0, 1);
        scoreManager.processCatchEvent({ type: 'CLEAN' }, 2000, 2);
        const result = scoreManager.processCatchEvent({ type: 'CLEAN' }, 4000, 3);

        expect(result).not.toBeNull();
        expect(result.currentStreak).toBe(3);
        expect(result.multipliers.cadence).toBe(1.25);
        expect(result.multipliers.streak).toBeCloseTo(1.45, 5);
        expect(result.multipliers.total).toBe(2.5);
        expect(result.awardedEnergy).toBe(50);
        expect(result.totalEnergy).toBe(128);
        expect(scoreManager.currentStreak).toBe(3);
        expect(scoreManager.totalEnergy).toBe(128);
    });

    it('d. CLEAN catches off cadence (e.g. gaps of 5000 ms) until streak 5: the fifth gives total ≈ 2.45 and awardedEnergy 49', () => {
        scoreManager.processCatchEvent({ type: 'CLEAN' }, 0, 1);
        scoreManager.processCatchEvent({ type: 'CLEAN' }, 5000, 2);
        scoreManager.processCatchEvent({ type: 'CLEAN' }, 10000, 3);
        scoreManager.processCatchEvent({ type: 'CLEAN' }, 15000, 4);
        const res5 = scoreManager.processCatchEvent({ type: 'CLEAN' }, 20000, 5);

        expect(res5).not.toBeNull();
        expect(res5.currentStreak).toBe(5);
        expect(res5.multipliers.cadence).toBe(1.0);
        expect(res5.multipliers.streak).toBeCloseTo(1.75, 5);
        expect(res5.multipliers.total).toBeCloseTo(2.45, 5);
        expect(res5.awardedEnergy).toBe(49);
    });

    it('e. ASSISTED as the first catch: streak stays 0, cadence 1.0, awardedEnergy 20', () => {
        const result = scoreManager.processCatchEvent({ type: 'ASSISTED' }, 0, 1);

        expect(result).not.toBeNull();
        expect(result.currentStreak).toBe(0);
        expect(result.multipliers.accuracy).toBe(1.0);
        expect(result.multipliers.cadence).toBe(1.0);
        expect(result.multipliers.streak).toBeCloseTo(1.0, 5);
        expect(result.multipliers.total).toBeCloseTo(1.0, 5);
        expect(result.awardedEnergy).toBe(20);
        expect(result.totalEnergy).toBe(20);
        expect(scoreManager.currentStreak).toBe(0);
        expect(scoreManager.totalEnergy).toBe(20);
    });

    it('f. ASSISTED when streak is 3 (off cadence): streak becomes 2, total ≈ 1.30, awardedEnergy 26', () => {
        scoreManager.processCatchEvent({ type: 'CLEAN' }, 0, 1);
        scoreManager.processCatchEvent({ type: 'CLEAN' }, 5000, 2);
        scoreManager.processCatchEvent({ type: 'CLEAN' }, 10000, 3);
        expect(scoreManager.currentStreak).toBe(3);

        const result = scoreManager.processCatchEvent({ type: 'ASSISTED' }, 15000, 4);

        expect(result).not.toBeNull();
        expect(result.currentStreak).toBe(2);
        expect(result.multipliers.accuracy).toBe(1.0);
        expect(result.multipliers.cadence).toBe(1.0);
        expect(result.multipliers.streak).toBeCloseTo(1.30, 5);
        expect(result.multipliers.total).toBeCloseTo(1.30, 5);
        expect(result.awardedEnergy).toBe(26);
        expect(scoreManager.currentStreak).toBe(2);
    });

    it('g. registerMiss() after a streak: currentStreak 0; the next catch gets cadence 1.0 even if it arrives exactly one cadence later', () => {
        scoreManager.processCatchEvent({ type: 'CLEAN' }, 0, 1);
        scoreManager.processCatchEvent({ type: 'CLEAN' }, 2000, 2);
        expect(scoreManager.currentStreak).toBe(2);

        scoreManager.registerMiss();
        expect(scoreManager.currentStreak).toBe(0);

        // Next catch arrives at t=4000 (which would be exactly 2000 ms from flight 2, but miss cleared last timestamp)
        const result = scoreManager.processCatchEvent({ type: 'CLEAN' }, 4000, 3);

        expect(result).not.toBeNull();
        expect(result.currentStreak).toBe(1);
        expect(result.multipliers.cadence).toBe(1.0);
        expect(result.multipliers.total).toBeCloseTo(1.61, 5);
        expect(result.awardedEnergy).toBe(32);
    });

    it('h. Same flightId processed twice: second call returns null and totalEnergy is unchanged', () => {
        const first = scoreManager.processCatchEvent({ type: 'CLEAN' }, 0, 1);
        expect(first).not.toBeNull();
        const energyAfterFirst = scoreManager.totalEnergy;

        const second = scoreManager.processCatchEvent({ type: 'CLEAN' }, 2000, 1);
        expect(second).toBeNull();
        expect(scoreManager.totalEnergy).toBe(energyAfterFirst);
        expect(scoreManager.currentStreak).toBe(1);
    });

    it('i. type "NONE" and type "MISS": return null and nothing changes', () => {
        const initialEnergy = scoreManager.totalEnergy;
        const initialStreak = scoreManager.currentStreak;

        expect(scoreManager.processCatchEvent(null, 0, 1)).toBeNull();
        expect(scoreManager.processCatchEvent(undefined, 0, 2)).toBeNull();
        expect(scoreManager.processCatchEvent({ type: 'NONE' }, 0, 3)).toBeNull();
        expect(scoreManager.processCatchEvent({ type: 'MISS' }, 0, 4)).toBeNull();
        expect(scoreManager.processCatchEvent({ type: 'UNKNOWN' }, 0, 5)).toBeNull();

        expect(scoreManager.totalEnergy).toBe(initialEnergy);
        expect(scoreManager.currentStreak).toBe(initialStreak);
    });

    it('j. Boundary: previous catch at t=0, next at t=2350 (diff 350 ms): cadence bonus applies. Next at t=2360 (diff 360 ms): no bonus.', () => {
        // Test boundary at +350 ms: cadence applies
        scoreManager.processCatchEvent({ type: 'CLEAN' }, 0, 1);
        const bonusRes = scoreManager.processCatchEvent({ type: 'CLEAN' }, 2350, 2);
        expect(bonusRes.multipliers.cadence).toBe(1.25);

        // Test boundary at +360 ms: no bonus
        const sm2 = new ScoreManager({ targetCadenceSeconds: 2.0 });
        sm2.processCatchEvent({ type: 'CLEAN' }, 0, 1);
        const noBonusRes = sm2.processCatchEvent({ type: 'CLEAN' }, 2360, 2);
        expect(noBonusRes.multipliers.cadence).toBe(1.0);
    });

    it('k. setTargetCadence(1.5) then catches 1500 ms apart: bonus applies.', () => {
        scoreManager.setTargetCadence(1.5);
        scoreManager.processCatchEvent({ type: 'CLEAN' }, 0, 1);
        const res = scoreManager.processCatchEvent({ type: 'CLEAN' }, 1500, 2);

        expect(res.multipliers.cadence).toBe(1.25);
    });

    it('l. reset() clears streak, totalEnergy, processed IDs and the cadence timer.', () => {
        scoreManager.processCatchEvent({ type: 'CLEAN' }, 0, 1);
        scoreManager.processCatchEvent({ type: 'CLEAN' }, 2000, 2);
        expect(scoreManager.totalEnergy).toBeGreaterThan(0);
        expect(scoreManager.currentStreak).toBeGreaterThan(0);

        scoreManager.reset();

        expect(scoreManager.totalEnergy).toBe(0);
        expect(scoreManager.currentStreak).toBe(0);

        // Processed IDs cleared -> can reprocess flight 1
        const reprocessed = scoreManager.processCatchEvent({ type: 'CLEAN' }, 2000, 1);
        expect(reprocessed).not.toBeNull();
        // Cadence timer cleared -> gets cadence 1.0
        expect(reprocessed.multipliers.cadence).toBe(1.0);
        expect(reprocessed.awardedEnergy).toBe(32);
        expect(scoreManager.totalEnergy).toBe(32);
    });

    it('m. Streak multiplier stops growing after streak 5 (streak 6 and 7 give the same streakMult as 5).', () => {
        let t = 0;
        let res;
        for (let flightId = 1; flightId <= 7; flightId++) {
            res = scoreManager.processCatchEvent({ type: 'CLEAN' }, t, flightId);
            t += 5000; // off-cadence to keep total uncapped
            if (flightId >= 5) {
                expect(res.multipliers.streak).toBeCloseTo(1.75, 5);
            }
        }
        expect(scoreManager.currentStreak).toBe(7);
    });

    it('n. 1000 processed flights do not make the processed-ID set grow beyond 50', () => {
        for (let i = 1; i <= 1000; i++) {
            scoreManager.processCatchEvent({ type: 'CLEAN' }, i * 1000, i);
        }

        // Old flight 1 from 999 catches ago should have been dropped from the 50-item cache
        const reprocessedOld = scoreManager.processCatchEvent({ type: 'CLEAN' }, 1001000, 1);
        expect(reprocessedOld).not.toBeNull();

        // Recent flight 1000 should still be in cache and rejected
        const recentDuplicate = scoreManager.processCatchEvent({ type: 'CLEAN' }, 1002000, 1000);
        expect(recentDuplicate).toBeNull();
    });
});
