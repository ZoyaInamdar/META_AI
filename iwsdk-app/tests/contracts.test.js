/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * ============================================================================
 * Unit Tests for Interfaces & Data Contracts
 * Role: Person B (The Physics & Mission Lead)
 * Verification for Step 0.1 under Vitest
 * ============================================================================
 */

import { describe, it, expect } from 'vitest';
import {
  CupKey,
  TargetCup,
  TrickType,
  Events,
  CatchType,
  BallMode,
  TargetState,
  BallState,
  KendamaInputState,
  CatchResult,
  ScoreEvent,
  MissionState,
  PlanetState,
  PhysicsState
} from '../src/contracts/Interfaces.js';
import { EventBus, eventBus } from '../src/contracts/EventBus.js';

describe('Contracts & Interfaces Verification (Step 0.1)', () => {
  describe('CupKey & TargetCup Constants', () => {
    it('defines canonical cup keys matching "big", "small", "base", and "spike"', () => {
      expect(CupKey.BIG).toBe('big');
      expect(CupKey.SMALL).toBe('small');
      expect(CupKey.BASE).toBe('base');
      expect(CupKey.SPIKE).toBe('spike');
    });

    it('CupKey is frozen against mutations', () => {
      expect(Object.isFrozen(CupKey)).toBe(true);
    });

    it('TargetCup alias maintains backward compatibility', () => {
      expect(TargetCup.BIG).toBe('big');
      expect(TargetCup.SMALL).toBe('small');
      expect(TargetCup.BASE).toBe('base');
      expect(TargetCup.SPIKE).toBe('spike');
    });
  });

  describe('TrickType Constants', () => {
    it('defines trick types across all 5 epochs', () => {
      expect(TrickType.SINGLE).toBe('single');
      expect(TrickType.ALTERNATE).toBe('alternate');
      expect(TrickType.AROUND).toBe('around');
      expect(TrickType.SPIKE).toBe('spike');
    });

    it('TrickType is frozen against mutations', () => {
      expect(Object.isFrozen(TrickType)).toBe(true);
    });
  });

  describe('Events Map', () => {
    it('defines Events.TARGET as "target"', () => {
      expect(Events.TARGET).toBe('target');
    });

    it('defines all required cross-system event bus symbols', () => {
      expect(Events.SCORE).toBe('score');
      expect(Events.MISS).toBe('miss');
      expect(Events.CATCH).toBe('catch');
      expect(Events.BALL).toBe('ball');
      expect(Events.CADENCE).toBe('cadence');
      expect(Events.TARGET).toBe('target');
      expect(Events.MISSION).toBe('mission');
      expect(Events.PHYSICS).toBe('physics');
      expect(Events.PLANET).toBe('planet');
    });

    it('Events is frozen against mutations', () => {
      expect(Object.isFrozen(Events)).toBe(true);
    });
  });

  describe('TargetState Contract', () => {
    it('new TargetState() initializes with default { cupKey: "big", trick: "single", sequenceIndex: 0 }', () => {
      const target = new TargetState();
      expect(target.cupKey).toBe('big');
      expect(target.trick).toBe('single');
      expect(target.sequenceIndex).toBe(0);
    });

    it('exposes exactly { cupKey, trick, sequenceIndex } as own enumerable properties', () => {
      const target = new TargetState(CupKey.SMALL, TrickType.ALTERNATE, 3);
      expect(target.cupKey).toBe('small');
      expect(target.trick).toBe('alternate');
      expect(target.sequenceIndex).toBe(3);
      expect(Object.keys(target)).toEqual(['cupKey', 'trick', 'sequenceIndex']);
    });

    it('provides backward-compatible targetCup getter', () => {
      const target = new TargetState(CupKey.BASE, TrickType.AROUND, 2);
      expect(target.targetCup).toBe('base');
    });

    it('supports Around the World sequence progression', () => {
      const step1 = new TargetState(CupKey.BIG, TrickType.AROUND, 0);
      const step2 = new TargetState(CupKey.SMALL, TrickType.AROUND, 1);
      const step3 = new TargetState(CupKey.BASE, TrickType.AROUND, 2);

      expect(step1.cupKey).toBe('big');
      expect(step2.cupKey).toBe('small');
      expect(step3.cupKey).toBe('base');
      expect(step3.sequenceIndex).toBe(2);
    });

    it('supports Chapter 5 Spike technique', () => {
      const spikeTarget = new TargetState(CupKey.SPIKE, TrickType.SPIKE, 4);
      expect(spikeTarget.cupKey).toBe('spike');
      expect(spikeTarget.trick).toBe('spike');
      expect(spikeTarget.sequenceIndex).toBe(4);
    });
  });

  describe('EventBus Integration', () => {
    it('allows publishing and subscribing to Events.TARGET', () => {
      const bus = new EventBus();
      let received = null;

      bus.on(Events.TARGET, (payload) => {
        received = payload;
      });

      const target = new TargetState(CupKey.SMALL, TrickType.ALTERNATE, 1);
      bus.emit(Events.TARGET, target);

      expect(received).toBeTruthy();
      expect(received.cupKey).toBe('small');
      expect(received.trick).toBe('alternate');
      expect(received.sequenceIndex).toBe(1);
    });

    it('supports unsubscribe callback', () => {
      const bus = new EventBus();
      let callCount = 0;

      const unsubscribe = bus.on(Events.CADENCE, () => {
        callCount++;
      });

      bus.emit(Events.CADENCE, 1.75);
      expect(callCount).toBe(1);

      unsubscribe();
      bus.emit(Events.CADENCE, 1.75);
      expect(callCount).toBe(1);
    });
  });

  describe('Preserved Data Contracts', () => {
    it('BallState initializes with default position, velocity, and seated mode', () => {
      const ball = new BallState();
      expect(ball.position).toEqual({ x: 0, y: 0, z: 0 });
      expect(ball.velocity).toEqual({ x: 0, y: 0, z: 0 });
      expect(ball.mode).toBe(BallMode.SEATED);
    });

    it('CatchType defines CLEAN, ASSISTED, MISS, and NONE', () => {
      expect(CatchType.CLEAN).toBe('CLEAN');
      expect(CatchType.ASSISTED).toBe('ASSISTED');
      expect(CatchType.MISS).toBe('MISS');
      expect(CatchType.NONE).toBe('NONE');
    });

    it('ScoreEvent supports both positional and object initialization with aliases', () => {
      // Positional
      const scorePos = new ScoreEvent('evt_1', CatchType.CLEAN, 28, 2);
      expect(scorePos.eventId).toBe('evt_1');
      expect(scorePos.catchType).toBe('CLEAN');
      expect(scorePos.awardedEnergy).toBe(28);
      expect(scorePos.streak).toBe(2);
      expect(scorePos.currentStreak).toBe(2);

      // Object
      const scoreObj = new ScoreEvent({
        eventId: 'evt_2',
        catchType: CatchType.CLEAN,
        baseEnergy: 20,
        awardedEnergy: 46,
        totalEnergy: 74,
        currentStreak: 3
      });
      expect(scoreObj.eventId).toBe('evt_2');
      expect(scoreObj.awardedEnergy).toBe(46);
      expect(scoreObj.totalEnergy).toBe(74);
      expect(scoreObj.currentStreak).toBe(3);
      expect(scoreObj.streak).toBe(3);
    });

    it('MissionState defaults to Chapter 1 with 100 energy target and aliases', () => {
      const mission = new MissionState();
      expect(mission.chapter).toBe(1);
      expect(mission.cosmicEnergy).toBe(0);
      expect(mission.targetEnergy).toBe(100);
      expect(mission.chapterTargetEnergy).toBe(100);
      expect(mission.milestoneReached).toBe(false);
      expect(mission.milestoneUnlocked).toBe(false);
      expect(mission.activeIntervention).toBeNull();
    });

    it('PlanetState tracks all 5 chapter planetary evolution properties with aliases', () => {
      const planet = new PlanetState();
      expect(planet.kintsugiGlow).toBe(0.0);
      expect(planet.kintsugiVeinGlow).toBe(0.0);
      expect(planet.atmosphereDensity).toBe(0.0);
      expect(planet.oceanFill).toBe(0.0);
      expect(planet.oceanFillLevel).toBe(0.0);
      expect(planet.ringAlpha).toBe(0.0);
      expect(planet.ringFormationAlpha).toBe(0.0);
      expect(planet.shieldCharge).toBe(0.0);
      expect(planet.scarsCount).toBe(0);
      expect(planet.scars).toBe(0);
      expect(planet.goldIgnited).toBe(false);
      expect(planet.isGoldIgnited).toBe(false);
    });

    it('PhysicsState tracks simulation time, substeps, and bodies array with aliases', () => {
      const physics = new PhysicsState();
      expect(physics.simTime).toBe(0.0);
      expect(physics.simulationTime).toBe(0.0);
      expect(physics.substeps).toBe(1);
      expect(physics.substepCount).toBe(1);
      expect(physics.bodies).toEqual([]);
    });

    it('KendamaInputState and CatchResult initialize with defaults', () => {
      const input = new KendamaInputState();
      expect(input.isTrackingValid).toBe(false);
      expect(input.trackingConfidence).toBe(1.0);

      const catchResult = new CatchResult();
      expect(catchResult.type).toBe(CatchType.NONE);
      expect(catchResult.cupKey).toBe('none');
    });
  });
});
