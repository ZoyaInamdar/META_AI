/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * ============================================================================
 * Celestial Kendama - ScoreManager
 * Role: Person A (The Hands) / Scoring & Progression Engine
 * ============================================================================
 */

export class ScoreManager {
    /**
     * @param {Object} [options={}]
     * @param {number} [options.targetCadenceSeconds=2.0]
     */
    constructor({ targetCadenceSeconds = 2.0 } = {}) {
        this._targetCadenceSeconds = targetCadenceSeconds;
        this._totalEnergy = 0;
        this._streak = 0;
        this._lastCatchTimestampMs = null;
        this._processedFlightIds = new Set();
    }

    /**
     * Updates target rhythm cadence in seconds.
     * @param {number} seconds
     */
    setTargetCadence(seconds) {
        if (typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0) {
            this._targetCadenceSeconds = seconds;
        }
    }

    /**
     * Evaluates scoring, multipliers, cadence, and progression for a catch event.
     *
     * @param {{ type: string }} catchResult - Catch result object containing catch type
     * @param {number} timestampMs - Timestamp in milliseconds
     * @param {string|number} flightId - Unique flight identifier
     * @returns {Object|null} Score event object or null if invalid or duplicate
     */
    processCatchEvent(catchResult, timestampMs, flightId) {
        // 1. If catchResult is missing or catchResult.type is not 'CLEAN' or 'ASSISTED' (e.g. 'NONE', 'MISS'), return null and change nothing.
        if (!catchResult || (catchResult.type !== 'CLEAN' && catchResult.type !== 'ASSISTED')) {
            return null;
        }

        // 2. eventId = `flight_${flightId}`. If that eventId was already processed, return null and change nothing.
        // Keep a Set of processed IDs and drop the oldest when it exceeds 50 entries.
        const eventId = `flight_${flightId}`;
        if (this._processedFlightIds.has(eventId)) {
            return null;
        }
        this._processedFlightIds.add(eventId);
        if (this._processedFlightIds.size > 50) {
            const oldest = this._processedFlightIds.values().next().value;
            this._processedFlightIds.delete(oldest);
        }

        // 3. Update streak FIRST: CLEAN -> streak + 1. ASSISTED -> max(0, streak - 1).
        if (catchResult.type === 'CLEAN') {
            this._streak += 1;
        } else {
            this._streak = Math.max(0, this._streak - 1);
        }

        // 4. Cadence (use integer milliseconds to avoid float errors):
        // If a previous catch timestamp exists and Math.abs((timestampMs - lastCatchTimestampMs) - Math.round(targetCadenceSeconds * 1000)) <= 350,
        // cadence multiplier = 1.25, otherwise 1.0.
        // Then store timestampMs as lastCatchTimestampMs. The very first catch (or the first after registerMiss/reset) gets cadence 1.0.
        let cadence = 1.0;
        const targetCadenceMs = Math.round(this._targetCadenceSeconds * 1000);
        if (this._lastCatchTimestampMs !== null) {
            const deltaMs = timestampMs - this._lastCatchTimestampMs;
            if (Math.abs(deltaMs - targetCadenceMs) <= 350) {
                cadence = 1.25;
            }
        }
        this._lastCatchTimestampMs = timestampMs;

        // 5. accuracy = 1.4 for CLEAN, 1.0 for ASSISTED.
        // streakMult = 1 + Math.min(streak, 5) * 0.15.
        // total = Math.min(2.5, accuracy * cadence * streakMult).
        const accuracy = catchResult.type === 'CLEAN' ? 1.4 : 1.0;
        const streakMult = 1 + Math.min(this._streak, 5) * 0.15;
        const total = Math.min(2.5, accuracy * cadence * streakMult);

        // 6. baseEnergy = 20. awardedEnergy = Math.round(Math.round(baseEnergy * total * 1e6) / 1e6).
        // (The inner rounding removes floating point noise so 45.5 reliably rounds to 46.)
        const baseEnergy = 20;
        const awardedEnergy = Math.round(Math.round(baseEnergy * total * 1e6) / 1e6);

        // 7. totalEnergy += awardedEnergy.
        this._totalEnergy += awardedEnergy;

        // 8. Return { eventId, catchType, baseEnergy: 20, multipliers: { accuracy, cadence, streak: streakMult, total }, awardedEnergy, totalEnergy, currentStreak: streak }.
        return {
            eventId,
            catchType: catchResult.type,
            baseEnergy,
            multipliers: {
                accuracy,
                cadence,
                streak: streakMult,
                total,
            },
            awardedEnergy,
            totalEnergy: this._totalEnergy,
            currentStreak: this._streak,
        };
    }

    /**
     * Handles a miss by resetting current streak and clearing cadence tracking.
     */
    registerMiss() {
        this._streak = 0;
        this._lastCatchTimestampMs = null;
    }

    /**
     * Resets the entire scoring manager back to its initial state.
     */
    reset() {
        this._totalEnergy = 0;
        this._streak = 0;
        this._lastCatchTimestampMs = null;
        this._processedFlightIds.clear();
    }

    /**
     * Cumulative total energy.
     * @returns {number}
     */
    get totalEnergy() {
        return this._totalEnergy;
    }

    /**
     * Current consecutive catch streak.
     * @returns {number}
     */
    get currentStreak() {
        return this._streak;
    }
}

export default ScoreManager;
