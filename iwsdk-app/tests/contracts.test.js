/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * ============================================================================
 * Unit Tests for Interfaces & Data Contracts
 * Role: Person B (The Physics & Mission Lead)
 * Verification for Step 0.1: TargetState, CupKey, TrickType, Events contracts
 * ============================================================================
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
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
      assert.equal(CupKey.BIG, 'big');
      assert.equal(CupKey.SMALL, 'small');
      assert.equal(CupKey.BASE, 'base');
      assert.equal(CupKey.SPIKE, 'spike');
    });

    it('CupKey is frozen against mutations', () => {
      assert.ok(Object.isFrozen(CupKey));
    });

    it('TargetCup alias maintains backward compatibility', () => {
      assert.equal(TargetCup.BIG, 'big');
      assert.equal(TargetCup.SMALL, 'small');
      assert.equal(TargetCup.BASE, 'base');
      assert.equal(TargetCup.SPIKE, 'spike');
    });
  });

  describe('TrickType Constants', () => {
    it('defines trick types across all 5 epochs', () => {
      assert.equal(TrickType.SINGLE, 'single');
      assert.equal(TrickType.ALTERNATE, 'alternate');
      assert.equal(TrickType.AROUND, 'around');
      assert.equal(TrickType.SPIKE, 'spike');
    });

    it('TrickType is frozen against mutations', () => {
      assert.ok(Object.isFrozen(TrickType));
    });
  });

  describe('Events Map', () => {
    it('defines Events.TARGET as "target"', () => {
      assert.equal(Events.TARGET, 'target');
    });

    it('defines all required cross-system event bus symbols', () => {
      assert.equal(Events.SCORE, 'score');
      assert.equal(Events.MISS, 'miss');
      assert.equal(Events.CATCH, 'catch');
      assert.equal(Events.BALL, 'ball');
      assert.equal(Events.CADENCE, 'cadence');
      assert.equal(Events.TARGET, 'target');
      assert.equal(Events.MISSION, 'mission');
      assert.equal(Events.PHYSICS, 'physics');
      assert.equal(Events.PLANET, 'planet');
    });

    it('Events is frozen against mutations', () => {
      assert.ok(Object.isFrozen(Events));
    });
  });

  describe('TargetState Contract', () => {
    it('new TargetState() initializes with default { cupKey: "big", trick: "single", sequenceIndex: 0 }', () => {
      const target = new TargetState();
      assert.equal(target.cupKey, 'big');
      assert.equal(target.trick, 'single');
      assert.equal(target.sequenceIndex, 0);
    });

    it('exposes exactly { cupKey, trick, sequenceIndex } as own enumerable properties', () => {
      const target = new TargetState(CupKey.SMALL, TrickType.ALTERNATE, 3);
      assert.equal(target.cupKey, 'small');
      assert.equal(target.trick, 'alternate');
      assert.equal(target.sequenceIndex, 3);
      assert.deepEqual(Object.keys(target), ['cupKey', 'trick', 'sequenceIndex']);
    });

    it('provides backward-compatible targetCup getter', () => {
      const target = new TargetState(CupKey.BASE, TrickType.AROUND, 2);
      assert.equal(target.targetCup, 'base');
    });

    it('supports Around the World sequence progression', () => {
      const step1 = new TargetState(CupKey.BIG, TrickType.AROUND, 0);
      const step2 = new TargetState(CupKey.SMALL, TrickType.AROUND, 1);
      const step3 = new TargetState(CupKey.BASE, TrickType.AROUND, 2);

      assert.equal(step1.cupKey, 'big');
      assert.equal(step2.cupKey, 'small');
      assert.equal(step3.cupKey, 'base');
      assert.equal(step3.sequenceIndex, 2);
    });

    it('supports Chapter 5 Spike technique', () => {
      const spikeTarget = new TargetState(CupKey.SPIKE, TrickType.SPIKE, 4);
      assert.equal(spikeTarget.cupKey, 'spike');
      assert.equal(spikeTarget.trick, 'spike');
      assert.equal(spikeTarget.sequenceIndex, 4);
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

      assert.ok(received);
      assert.equal(received.cupKey, 'small');
      assert.equal(received.trick, 'alternate');
      assert.equal(received.sequenceIndex, 1);
    });

    it('supports unsubscribe callback', () => {
      const bus = new EventBus();
      let callCount = 0;

      const unsubscribe = bus.on(Events.CADENCE, () => {
        callCount++;
      });

      bus.emit(Events.CADENCE, 1.75);
      assert.equal(callCount, 1);

      unsubscribe();
      bus.emit(Events.CADENCE, 1.75);
      assert.equal(callCount, 1);
    });
  });

  describe('Preserved Data Contracts', () => {
    it('BallState initializes with default position, velocity, and seated mode', () => {
      const ball = new BallState();
      assert.deepEqual(ball.position, { x: 0, y: 0, z: 0 });
      assert.deepEqual(ball.velocity, { x: 0, y: 0, z: 0 });
      assert.equal(ball.mode, BallMode.SEATED);
    });

    it('CatchType defines CLEAN, ASSISTED, MISS, and NONE', () => {
      assert.equal(CatchType.CLEAN, 'CLEAN');
      assert.equal(CatchType.ASSISTED, 'ASSISTED');
      assert.equal(CatchType.MISS, 'MISS');
      assert.equal(CatchType.NONE, 'NONE');
    });

    it('ScoreEvent supports both positional and object initialization with aliases', () => {
      // Positional
      const scorePos = new ScoreEvent('evt_1', CatchType.CLEAN, 28, 2);
      assert.equal(scorePos.eventId, 'evt_1');
      assert.equal(scorePos.catchType, 'CLEAN');
      assert.equal(scorePos.awardedEnergy, 28);
      assert.equal(scorePos.streak, 2);
      assert.equal(scorePos.currentStreak, 2);

      // Object
      const scoreObj = new ScoreEvent({
        eventId: 'evt_2',
        catchType: CatchType.CLEAN,
        baseEnergy: 20,
        awardedEnergy: 46,
        totalEnergy: 74,
        currentStreak: 3
      });
      assert.equal(scoreObj.eventId, 'evt_2');
      assert.equal(scoreObj.awardedEnergy, 46);
      assert.equal(scoreObj.totalEnergy, 74);
      assert.equal(scoreObj.currentStreak, 3);
      assert.equal(scoreObj.streak, 3);
    });

    it('MissionState defaults to Chapter 1 with 100 energy target and aliases', () => {
      const mission = new MissionState();
      assert.equal(mission.chapter, 1);
      assert.equal(mission.cosmicEnergy, 0);
      assert.equal(mission.targetEnergy, 100);
      assert.equal(mission.chapterTargetEnergy, 100);
      assert.equal(mission.milestoneReached, false);
      assert.equal(mission.milestoneUnlocked, false);
      assert.equal(mission.activeIntervention, null);
    });

    it('PlanetState tracks all 5 chapter planetary evolution properties with aliases', () => {
      const planet = new PlanetState();
      assert.equal(planet.kintsugiGlow, 0.0);
      assert.equal(planet.kintsugiVeinGlow, 0.0);
      assert.equal(planet.atmosphereDensity, 0.0);
      assert.equal(planet.oceanFill, 0.0);
      assert.equal(planet.oceanFillLevel, 0.0);
      assert.equal(planet.ringAlpha, 0.0);
      assert.equal(planet.ringFormationAlpha, 0.0);
      assert.equal(planet.shieldCharge, 0.0);
      assert.equal(planet.scarsCount, 0);
      assert.equal(planet.scars, 0);
      assert.equal(planet.goldIgnited, false);
      assert.equal(planet.isGoldIgnited, false);
    });

    it('PhysicsState tracks simulation time, substeps, and bodies array with aliases', () => {
      const physics = new PhysicsState();
      assert.equal(physics.simTime, 0.0);
      assert.equal(physics.simulationTime, 0.0);
      assert.equal(physics.substeps, 1);
      assert.equal(physics.substepCount, 1);
      assert.deepEqual(physics.bodies, []);
    });

    it('KendamaInputState and CatchResult initialize with defaults', () => {
      const input = new KendamaInputState();
      assert.equal(input.isTrackingValid, false);
      assert.equal(input.trackingConfidence, 1.0);

      const catchResult = new CatchResult();
      assert.equal(catchResult.type, CatchType.NONE);
      assert.equal(catchResult.cupKey, 'none');
    });
  });
});
