// tests/contracts.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  Events,
  CupKey,
  TargetCup,
  TrickType,
  CatchType,
  TargetState,
  BallState,
  ScoreEvent,
  PhysicsState,
  MissionState,
  PlanetState
} from '../src/contracts/Interfaces.js';

describe('Contracts & Interfaces Verification (Step 0.1)', () => {
  describe('CupKey & TargetCup', () => {
    it('defines the 4 canonical cup keys', () => {
      assert.equal(CupKey.BIG, 'big');
      assert.equal(CupKey.SMALL, 'small');
      assert.equal(CupKey.BASE, 'base');
      assert.equal(CupKey.SPIKE, 'spike');
    });

    it('is immutable (frozen)', () => {
      assert.ok(Object.isFrozen(CupKey));
    });

    it('maintains backwards compatibility via TargetCup alias', () => {
      assert.equal(TargetCup.BIG, 'big');
      assert.equal(TargetCup.SMALL, 'small');
      assert.equal(TargetCup.BASE, 'base');
      assert.equal(TargetCup.SPIKE, 'spike');
    });
  });

  describe('TrickType', () => {
    it('defines canonical trick types', () => {
      assert.equal(TrickType.SINGLE, 'single');
      assert.equal(TrickType.ALTERNATE, 'alternate');
      assert.equal(TrickType.AROUND, 'around');
      assert.equal(TrickType.SPIKE, 'spike');
    });

    it('is immutable (frozen)', () => {
      assert.ok(Object.isFrozen(TrickType));
    });
  });

  describe('Events', () => {
    it('exports all shared event symbols including TARGET and BALL', () => {
      assert.equal(Events.TARGET, 'target');
      assert.equal(Events.SCORE, 'score');
      assert.equal(Events.MISS, 'miss');
      assert.equal(Events.CATCH, 'catch');
      assert.equal(Events.BALL, 'ball');
      assert.equal(Events.CADENCE, 'cadence');
      assert.equal(Events.MISSION, 'mission');
      assert.equal(Events.PHYSICS, 'physics');
      assert.equal(Events.PLANET, 'planet');
    });

    it('is immutable (frozen)', () => {
      assert.ok(Object.isFrozen(Events));
    });
  });

  describe('TargetState', () => {
    it('initializes with default values: cupKey="big", trick="single", sequenceIndex=0', () => {
      const state = new TargetState();
      assert.equal(state.cupKey, 'big');
      assert.equal(state.trick, 'single');
      assert.equal(state.sequenceIndex, 0);
    });

    it('initializes with provided parameters', () => {
      const state = new TargetState(CupKey.SMALL, TrickType.ALTERNATE, 4);
      assert.equal(state.cupKey, 'small');
      assert.equal(state.trick, 'alternate');
      assert.equal(state.sequenceIndex, 4);
    });

    it('provides backwards-compatible targetCup getter', () => {
      const state = new TargetState(CupKey.BASE, TrickType.AROUND, 2);
      assert.equal(state.targetCup, 'base');
    });
  });

  describe('Preserved Data Contracts', () => {
    it('CatchType has CLEAN, ASSISTED, MISS, NONE', () => {
      assert.equal(CatchType.CLEAN, 'CLEAN');
      assert.equal(CatchType.ASSISTED, 'ASSISTED');
      assert.equal(CatchType.MISS, 'MISS');
      assert.equal(CatchType.NONE, 'NONE');
    });

    it('BallState instantiates correctly', () => {
      const ball = new BallState();
      assert.equal(ball.mode, 'seated');
      assert.deepEqual(ball.position, { x: 0, y: 0, z: 0 });
    });

    it('ScoreEvent instantiates correctly', () => {
      const event = new ScoreEvent('evt_1', CatchType.CLEAN, 28, 2);
      assert.equal(event.eventId, 'evt_1');
      assert.equal(event.catchType, 'CLEAN');
      assert.equal(event.awardedEnergy, 28);
      assert.equal(event.streak, 2);
    });

    it('PhysicsState instantiates correctly', () => {
      const physics = new PhysicsState();
      assert.equal(physics.simTime, 0.0);
      assert.equal(physics.substeps, 1);
      assert.ok(Array.isArray(physics.bodies));
    });

    it('MissionState instantiates correctly', () => {
      const mission = new MissionState();
      assert.equal(mission.chapter, 1);
      assert.equal(mission.cosmicEnergy, 0);
      assert.equal(mission.targetEnergy, 100);
      assert.equal(mission.milestoneReached, false);
    });

    it('PlanetState instantiates correctly', () => {
      const planet = new PlanetState();
      assert.equal(planet.kintsugiGlow, 0.0);
      assert.equal(planet.atmosphereDensity, 0.0);
      assert.equal(planet.oceanFill, 0.0);
      assert.equal(planet.ringAlpha, 0.0);
      assert.equal(planet.shieldCharge, 0.0);
      assert.equal(planet.scarsCount, 0);
      assert.equal(planet.goldIgnited, false);
    });
  });
});
