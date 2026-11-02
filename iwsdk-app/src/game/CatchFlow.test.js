/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * ============================================================================
 * Unit Tests for CatchFlow
 * Role: Person A (The Hands)
 * ============================================================================
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { CatchFlow, MISS_DEPTH, computeCupWorldSeatPoint } from './CatchFlow.js';
import { CUP_IDS, getCupConfig } from '../input/cupConfigs.js';

describe('CatchFlow', () => {
    const originPose = {
        position: { x: 0.0, y: 0.0, z: 0.0 },
        quaternion: { x: 0.0, y: 0.0, z: 0.0, w: 1.0 },
    };

    let flow;

    beforeEach(() => {
        flow = new CatchFlow({ initialCup: CUP_IDS.SPIKE, kenPose: originPose });
    });

    it('(1) launch from seated gives air', () => {
        expect(flow.state).toBe('seated');
        flow.onLaunch();
        expect(flow.state).toBe('air');
    });

    it('(2) a second launch while in air is ignored', () => {
        flow.onLaunch();
        expect(flow.state).toBe('air');

        // Second launch in air
        flow.onLaunch();
        expect(flow.state).toBe('air');
    });

    it('(3) a confirmed catch gives catching, then seated after 0.15 s, with the ball exactly at cupWorldPos + normal*seatOffset', () => {
        flow.onLaunch();

        const catchBallPos = { x: 0.1, y: 0.2, z: -0.1 };
        flow.onCatchConfirmed(CUP_IDS.BIG_CUP, catchBallPos);
        expect(flow.state).toBe('catching');

        // Halfway through lerp (0.075s)
        const midRes = flow.update(0.075, originPose);
        expect(midRes).toBeNull();
        expect(flow.state).toBe('catching');

        // Complete 0.15s duration
        const finishRes = flow.update(0.075, originPose);
        expect(finishRes).toEqual({ type: 'SEATED', cupKey: CUP_IDS.BIG_CUP });
        expect(flow.state).toBe('seated');
        expect(flow.seatCupKey).toBe(CUP_IDS.BIG_CUP);

        const expectedSeat = computeCupWorldSeatPoint(CUP_IDS.BIG_CUP, originPose);
        const ballPos = flow.ballPosition;
        expect(ballPos.x).toBeCloseTo(expectedSeat.x, 6);
        expect(ballPos.y).toBeCloseTo(expectedSeat.y, 6);
        expect(ballPos.z).toBeCloseTo(expectedSeat.z, 6);
    });

    it('(4) with the ken moving during the 0.15 s, the final ball position equals the seat point at the FINAL ken pose, not the start pose', () => {
        flow.onLaunch();

        const initialKenPose = {
            position: { x: 0.0, y: 1.0, z: -0.45 },
            quaternion: { x: 0.0, y: 0.0, z: 0.0, w: 1.0 },
        };
        const finalKenPose = {
            position: { x: 0.2, y: 1.35, z: -0.40 },
            quaternion: { x: 0.0, y: 0.0, z: Math.SQRT1_2, w: Math.SQRT1_2 },
        };

        const initialSeat = computeCupWorldSeatPoint(CUP_IDS.BIG_CUP, initialKenPose);
        const finalSeat = computeCupWorldSeatPoint(CUP_IDS.BIG_CUP, finalKenPose);

        flow.onCatchConfirmed(CUP_IDS.BIG_CUP, { x: 0.0, y: 1.1, z: -0.45 });

        // Update with moving Ken reaching final pose at t = 0.15s
        const res = flow.update(0.15, finalKenPose);
        expect(res).toEqual({ type: 'SEATED', cupKey: CUP_IDS.BIG_CUP });

        const ballPos = flow.ballPosition;
        expect(ballPos.x).toBeCloseTo(finalSeat.x, 6);
        expect(ballPos.y).toBeCloseTo(finalSeat.y, 6);
        expect(ballPos.z).toBeCloseTo(finalSeat.z, 6);

        // Confirm it did not stay at initialSeat
        expect(Math.abs(ballPos.x - initialSeat.x) + Math.abs(ballPos.y - initialSeat.y)).toBeGreaterThan(0.1);
    });

    it('(5) the ball falling below ken.y - MISS_DEPTH while descending gives exactly one MISS, then seated on the previous cup', () => {
        flow = new CatchFlow({ initialCup: CUP_IDS.SMALL_CUP, kenPose: originPose });
        expect(flow.seatCupKey).toBe(CUP_IDS.SMALL_CUP);

        flow.onLaunch();

        // Ken at origin (ken.y = 0). MISS_DEPTH = 0.45, so threshold is y < -0.45.
        const lowBallPos = { x: 0.0, y: -0.46, z: 0.0 };
        const descendingVel = { x: 0.0, y: -1.0, z: 0.0 };

        const res = flow.update(0.016, originPose, lowBallPos, descendingVel);

        expect(res).toEqual({ type: 'MISS' });
        expect(flow.state).toBe('seated');
        expect(flow.seatCupKey).toBe(CUP_IDS.SMALL_CUP);

        // Seated ball position should be at previous cup seat point
        const expectedSeat = computeCupWorldSeatPoint(CUP_IDS.SMALL_CUP, originPose);
        expect(flow.ballPosition.x).toBeCloseTo(expectedSeat.x, 5);
        expect(flow.ballPosition.y).toBeCloseTo(expectedSeat.y, 5);
        expect(flow.ballPosition.z).toBeCloseTo(expectedSeat.z, 5);
    });

    it('(6) no MISS is reported while the ball is still rising even if low', () => {
        flow.onLaunch();

        // Low ball position, but upward (rising) velocity (vy > 0)
        const lowBallPos = { x: 0.0, y: -0.50, z: 0.0 };
        const risingVel = { x: 0.0, y: 1.5, z: 0.0 };

        const res = flow.update(0.016, originPose, lowBallPos, risingVel);

        expect(res).toBeNull();
        expect(flow.state).toBe('air');
    });

    it('(7) after a MISS a new launch works', () => {
        flow.onLaunch();

        // Trigger miss
        const lowBallPos = { x: 0.0, y: -0.46, z: 0.0 };
        const descendingVel = { x: 0.0, y: -1.0, z: 0.0 };
        flow.update(0.016, originPose, lowBallPos, descendingVel);
        expect(flow.state).toBe('seated');

        // New launch from seated
        flow.onLaunch();
        expect(flow.state).toBe('air');
    });

    it('(8) a second update after a MISS returns null', () => {
        flow.onLaunch();

        // Trigger miss
        const lowBallPos = { x: 0.0, y: -0.46, z: 0.0 };
        const descendingVel = { x: 0.0, y: -1.0, z: 0.0 };
        const firstRes = flow.update(0.016, originPose, lowBallPos, descendingVel);
        expect(firstRes).toEqual({ type: 'MISS' });

        // Second update while now seated returns null and does not repeat MISS
        const secondRes = flow.update(0.016, originPose, lowBallPos, descendingVel);
        expect(secondRes).toBeNull();
        expect(flow.state).toBe('seated');
    });
});
