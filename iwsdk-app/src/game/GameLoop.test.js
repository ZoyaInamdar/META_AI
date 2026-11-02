/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * ============================================================================
 * Unit Tests for GameLoop (Person A Coordinator & Pipeline Facets)
 * Role: Person A (The Hands)
 * ============================================================================
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { GameLoop } from './GameLoop.js';
import {
  Events,
  CupKey,
  CatchType,
  BallMode,
  TargetState,
  ScoreEvent,
} from '../contracts/Interfaces.js';
import { EventBus } from '../contracts/EventBus.js';
import { BallTrajectory } from './BallTrajectory.js';
import { CatchFlow } from './CatchFlow.js';
import { ScoreManager } from './ScoreManager.js';
import { KendamaInputAndDetector } from '../input/KendamaInputAndDetector.js';
import { FakeInput } from '../input/FakeInput.js';
import { HandPoseAdapter } from '../input/HandPoseAdapter.js';
import { GamePipeline, createGameplayKenGroup, DefaultMissionController } from '../main.js';

function createMockKenGroup() {
  return createGameplayKenGroup();
}

describe('GameLoop (Person A)', () => {
  let eventBus;
  let kenGroup;
  let trajectory;
  let catchFlow;
  let detector;
  let scoreManager;
  let gameLoop;

  beforeEach(() => {
    eventBus = new EventBus();
    kenGroup = createMockKenGroup();
    trajectory = new BallTrajectory();
    catchFlow = new CatchFlow({ initialCup: CupKey.BIG, kenPose: kenGroup });
    detector = new KendamaInputAndDetector(kenGroup);
    scoreManager = new ScoreManager({ targetCadenceSeconds: 1.75 });

    gameLoop = new GameLoop({
      eventBus,
      gameplayKenGroup: kenGroup,
      trajectory,
      catchFlow,
      detector,
      scoreManager,
      initialCup: CupKey.BIG,
      targetCadenceSeconds: 1.75,
    });
  });

  // ==========================================================================
  // A. Construction and contracts
  // ==========================================================================
  describe('A. Construction and contracts', () => {
    it('1. GameLoop can be constructed with injected dependencies', () => {
      expect(gameLoop).toBeDefined();
      expect(gameLoop.eventBus).toBe(eventBus);
      expect(gameLoop.gameplayKenGroup).toBe(kenGroup);
      expect(gameLoop.trajectory).toBe(trajectory);
      expect(gameLoop.catchFlow).toBe(catchFlow);
      expect(gameLoop.detector).toBe(detector);
    });

    it('2. getBallState() returns a BallState-compatible object', () => {
      const state = gameLoop.getBallState();
      expect(state).toBeDefined();
      expect(state).toHaveProperty('position');
      expect(state).toHaveProperty('velocity');
      expect(state).toHaveProperty('mode');
    });

    it('3. BallState uses positional {x,y,z} position and velocity arguments', () => {
      const state = gameLoop.getBallState();
      expect(Array.isArray(state.position)).toBe(false);
      expect(typeof state.position).toBe('object');
      expect(Number.isFinite(state.position.x)).toBe(true);
      expect(Number.isFinite(state.position.y)).toBe(true);
      expect(Number.isFinite(state.position.z)).toBe(true);

      expect(Array.isArray(state.velocity)).toBe(false);
      expect(typeof state.velocity).toBe('object');
      expect(Number.isFinite(state.velocity.x)).toBe(true);
      expect(Number.isFinite(state.velocity.y)).toBe(true);
      expect(Number.isFinite(state.velocity.z)).toBe(true);
    });

    it('4. Initial ball state uses the correct seated mode', () => {
      const state = gameLoop.getBallState();
      expect(state.mode).toBe(BallMode.SEATED);
    });
  });

  // ==========================================================================
  // B. Launch lifecycle
  // ==========================================================================
  describe('B. Launch lifecycle', () => {
    it('5. Launch succeeds when CatchFlow is seated', () => {
      expect(catchFlow.state).toBe('seated');
      const launched = gameLoop.launchBall();
      expect(launched).toBe(true);
      expect(catchFlow.state).toBe('air');
    });

    it('6. Launch increments BallTrajectory flightId exactly once', () => {
      expect(trajectory.flightId).toBe(0);
      gameLoop.launchBall();
      expect(trajectory.flightId).toBe(1);
    });

    it('7. CatchFlow receives the same flightId', () => {
      gameLoop.launchBall();
      expect(catchFlow.flightId).toBe(trajectory.flightId);
      expect(catchFlow.flightId).toBe(1);
    });

    it('8. Launch is rejected when CatchFlow is airborne', () => {
      gameLoop.launchBall();
      expect(catchFlow.state).toBe('air');

      const secondLaunch = gameLoop.launchBall();
      expect(secondLaunch).toBe(false);
    });

    it('9. Rejected launch does not increment flightId or restart trajectory', () => {
      gameLoop.launchBall();
      expect(trajectory.flightId).toBe(1);

      trajectory.update(0.1);
      const elapsedBefore = trajectory.elapsed;
      expect(elapsedBefore).toBeGreaterThan(0);

      const secondLaunch = gameLoop.launchBall();
      expect(secondLaunch).toBe(false);
      expect(trajectory.flightId).toBe(1);
      expect(trajectory.elapsed).toBe(elapsedBefore);
    });

    it('10. Multiple completed flights keep CatchFlow and BallTrajectory flight IDs synchronized', () => {
      // Flight 1: Launch and complete through GameLoop coordination
      gameLoop.launchBall();
      expect(trajectory.flightId).toBe(1);
      expect(catchFlow.flightId).toBe(1);

      // Confirm catch via detector stub and advance through seating lerp (> 0.15s)
      detector.evaluateCatch = () => ({
        confirmed: true,
        valid: true,
        cupKey: CupKey.BIG,
        catchType: 'clean',
        details: { distance: 0.005, relativeSpeed: 0.2, approachDot: -0.9 },
      });
      gameLoop.catchDetector.update(0.016, kenGroup); // Enters 'catching'
      expect(catchFlow.state).toBe('catching');

      detector.evaluateCatch = () => ({ confirmed: false, valid: false });
      gameLoop.catchDetector.update(0.16, kenGroup); // Lerp completes to 'seated'
      expect(catchFlow.state).toBe('seated');

      // Flight 2: Launch second flight
      const launched2 = gameLoop.launchBall();
      expect(launched2).toBe(true);
      expect(trajectory.flightId).toBe(2);
      expect(catchFlow.flightId).toBe(2);
    });
  });

  // ==========================================================================
  // C. Catch lifecycle
  // ==========================================================================
  describe('C. Catch lifecycle', () => {
    it('11. Confirmed detector result invokes CatchFlow.onCatchConfirmed with the correct cupKey and ball position', () => {
      gameLoop.launchBall();
      expect(catchFlow.state).toBe('air');

      detector.evaluateCatch = () => ({
        confirmed: true,
        valid: true,
        cupKey: CupKey.BIG,
        catchType: 'clean',
        details: {
          distance: 0.005,
          relativeSpeed: 0.2,
          approachDot: -0.9,
        },
      });

      gameLoop.catchDetector.update(0.016, kenGroup);

      expect(catchFlow.state).toBe('catching');
    });

    it('11b. Invalid confirmed detector result ({ confirmed: true, valid: false }) does not trigger catch or score', () => {
      const missionController = new DefaultMissionController(eventBus);
      const initialEnergy = missionController.missionState.cosmicEnergy;

      let catchEmitted = false;
      let scoreEmitted = false;
      eventBus.on(Events.CATCH, () => {
        catchEmitted = true;
      });
      eventBus.on(Events.SCORE, () => {
        scoreEmitted = true;
      });

      gameLoop.launchBall();
      expect(catchFlow.state).toBe('air');

      // Detector reports confirmed: true, but valid: false
      detector.evaluateCatch = () => ({
        confirmed: true,
        valid: false,
        cupKey: CupKey.BIG,
        catchType: 'clean',
        details: {},
      });

      gameLoop.catchDetector.update(0.016, kenGroup);
      gameLoop.scoreManager.update(0.016);
      missionController.update(0.016);

      expect(catchFlow.state).toBe('air');
      expect(catchEmitted).toBe(false);
      expect(scoreEmitted).toBe(false);
      expect(missionController.missionState.cosmicEnergy).toBe(initialEnergy);
    });

    it('12. CatchFlow completes its seating transition after the configured duration', () => {
      gameLoop.launchBall();

      // Trigger catch through GameLoop catchDetector update
      detector.evaluateCatch = () => ({
        confirmed: true,
        valid: true,
        cupKey: CupKey.BIG,
        catchType: 'clean',
        details: { distance: 0.005, relativeSpeed: 0.2, approachDot: -0.9 },
      });
      gameLoop.catchDetector.update(0.016, kenGroup);
      expect(catchFlow.state).toBe('catching');

      // Reset detector confirmation and advance lerp duration (> 0.15s)
      detector.evaluateCatch = () => ({ confirmed: false, valid: false });
      gameLoop.catchDetector.update(0.16, kenGroup);

      expect(catchFlow.state).toBe('seated');
      expect(gameLoop.getBallState().mode).toBe(BallMode.SEATED);
    });

    it('13. A catch produces at most one score event', () => {
      let scoreEventCount = 0;
      eventBus.on(Events.SCORE, () => {
        scoreEventCount++;
      });

      gameLoop.launchBall();
      detector.evaluateCatch = () => ({
        confirmed: true,
        valid: true,
        cupKey: CupKey.BIG,
        catchType: 'clean',
        details: { distance: 0.005, relativeSpeed: 0.2, approachDot: -0.9 },
      });

      // Frame 1: catch confirmed & staged in detector update, scored in scoreManager update
      gameLoop.catchDetector.update(0.016, kenGroup);
      gameLoop.scoreManager.update(0.016);
      expect(scoreEventCount).toBe(1);

      // Frame 2: catching lerp continues; should NOT re-score
      gameLoop.catchDetector.update(0.016, kenGroup);
      gameLoop.scoreManager.update(0.016);
      expect(scoreEventCount).toBe(1);

      // Frame 3: seated completed; should NOT re-score
      gameLoop.catchDetector.update(0.15, kenGroup);
      gameLoop.scoreManager.update(0.016);
      expect(scoreEventCount).toBe(1);
    });

    it('14. Catch evaluation is suppressed while tracking is invalid', () => {
      // Injected mock input reporting tracking loss
      const mockInput = {
        update: () => ({
          position: { x: 0, y: 1.25, z: -0.45 },
          quaternion: { x: 0, y: 0, z: 0, w: 1 },
          isTrackingValid: false,
        }),
      };

      const loopWithUntracked = new GameLoop({
        eventBus,
        gameplayKenGroup: kenGroup,
        inputSource: mockInput,
        trajectory,
        catchFlow,
        detector,
        scoreManager,
      });

      loopWithUntracked.inputSystem.update(0.016, null);
      loopWithUntracked.launchBall();

      let evaluateCalled = false;
      detector.evaluateCatch = () => {
        evaluateCalled = true;
        return { confirmed: true, valid: true, cupKey: CupKey.BIG, catchType: 'clean', details: {} };
      };

      loopWithUntracked.catchDetector.update(0.016, kenGroup);

      expect(evaluateCalled).toBe(false);
      expect(catchFlow.state).toBe('air');
    });
  });

  // ==========================================================================
  // D. Miss lifecycle
  // ==========================================================================
  describe('D. Miss lifecycle', () => {
    it('15. A descending ball crossing the miss boundary produces one MISS event', () => {
      let missPayload = null;
      eventBus.on(Events.MISS, (payload) => {
        missPayload = payload;
      });

      // Injected trajectory stub representing downward flight past miss depth (y < ken.y - 0.45)
      const fallingTrajectory = {
        flightId: 1,
        state: {
          position: { x: 0, y: kenGroup.position.y - 0.55, z: -0.45 },
          velocity: { x: 0, y: -1.5, z: 0 },
          mode: 'air',
          flightId: 1,
        },
        update: () => {},
        launch: () => {},
        reset: () => {},
      };

      const loopWithFalling = new GameLoop({
        eventBus,
        gameplayKenGroup: kenGroup,
        trajectory: fallingTrajectory,
        catchFlow,
        detector,
        scoreManager,
      });

      loopWithFalling.launchBall();

      loopWithFalling.catchDetector.update(0.016, kenGroup);
      loopWithFalling.scoreManager.update(0.016);

      expect(missPayload).toBeTruthy();
      expect(missPayload.flightId).toBe(1);
      expect(catchFlow.state).toBe('seated');
    });

    it('16. The same flight cannot produce duplicate MISS events', () => {
      let missCount = 0;
      eventBus.on(Events.MISS, () => {
        missCount++;
      });

      const fallingTrajectory = {
        flightId: 1,
        state: {
          position: { x: 0, y: kenGroup.position.y - 0.55, z: -0.45 },
          velocity: { x: 0, y: -1.5, z: 0 },
          mode: 'air',
          flightId: 1,
        },
        update: () => {},
        launch: () => {},
        reset: () => {},
      };

      const loopWithFalling = new GameLoop({
        eventBus,
        gameplayKenGroup: kenGroup,
        trajectory: fallingTrajectory,
        catchFlow,
        detector,
        scoreManager,
      });

      loopWithFalling.launchBall();

      // Frame 1: Miss detected and emitted
      loopWithFalling.catchDetector.update(0.016, kenGroup);
      loopWithFalling.scoreManager.update(0.016);
      expect(missCount).toBe(1);

      // Frame 2: State is seated; should not emit miss again
      loopWithFalling.catchDetector.update(0.016, kenGroup);
      loopWithFalling.scoreManager.update(0.016);
      expect(missCount).toBe(1);
    });

    it('17. A miss calls ScoreManager.registerMiss()', () => {
      // Build streak first
      scoreManager.processCatchEvent({ type: 'CLEAN' }, 1000, 99);
      expect(scoreManager.currentStreak).toBe(1);

      const fallingTrajectory = {
        flightId: 1,
        state: {
          position: { x: 0, y: kenGroup.position.y - 0.55, z: -0.45 },
          velocity: { x: 0, y: -1.5, z: 0 },
          mode: 'air',
          flightId: 1,
        },
        update: () => {},
        launch: () => {},
        reset: () => {},
      };

      const loopWithFalling = new GameLoop({
        eventBus,
        gameplayKenGroup: kenGroup,
        trajectory: fallingTrajectory,
        catchFlow,
        detector,
        scoreManager,
      });

      loopWithFalling.launchBall();

      loopWithFalling.catchDetector.update(0.016, kenGroup);
      loopWithFalling.scoreManager.update(0.016);

      expect(scoreManager.currentStreak).toBe(0);
    });
  });

  // ==========================================================================
  // E. Scoring
  // ==========================================================================
  describe('E. Scoring', () => {
    it('18. A valid catch produces a SCORE event', () => {
      let scoreEvent = null;
      eventBus.on(Events.SCORE, (evt) => {
        scoreEvent = evt;
      });

      gameLoop.launchBall();
      detector.evaluateCatch = () => ({
        confirmed: true,
        valid: true,
        cupKey: CupKey.BIG,
        catchType: 'clean',
        details: { distance: 0.01, relativeSpeed: 0.1, approachDot: -0.95 },
      });

      gameLoop.catchDetector.update(0.016, kenGroup);
      gameLoop.scoreManager.update(0.016);

      expect(scoreEvent).toBeTruthy();
      expect(scoreEvent).toHaveProperty('payload');
    });

    it('19. The SCORE payload contains awardedEnergy compatible with DefaultMissionController', () => {
      // Integrate with Person B's DefaultMissionController
      const missionController = new DefaultMissionController(eventBus);
      const initialEnergy = missionController.missionState.cosmicEnergy;

      let scoreEventWrapper = null;
      eventBus.on(Events.SCORE, (evt) => {
        scoreEventWrapper = evt;
      });

      gameLoop.launchBall();
      detector.evaluateCatch = () => ({
        confirmed: true,
        valid: true,
        cupKey: CupKey.BIG,
        catchType: 'clean',
        details: { distance: 0.01, relativeSpeed: 0.1, approachDot: -0.95 },
      });

      gameLoop.catchDetector.update(0.016, kenGroup);
      gameLoop.scoreManager.update(0.016);

      // Validate nested payload property directly
      expect(scoreEventWrapper).toHaveProperty('payload');
      const scorePayload = scoreEventWrapper.payload;
      expect(scorePayload).toHaveProperty('awardedEnergy');
      expect(typeof scorePayload.awardedEnergy).toBe('number');
      expect(scorePayload.awardedEnergy).toBeGreaterThan(0);

      // Validate Person B's MissionController successfully consumed the payload
      missionController.update(0.016);
      expect(missionController.missionState.cosmicEnergy).toBe(initialEnergy + scorePayload.awardedEnergy);
    });

    it('20. The SCORE payload is compatible with the existing ScoreEvent contract', () => {
      let scoreEventWrapper = null;
      eventBus.on(Events.SCORE, (evt) => {
        scoreEventWrapper = evt;
      });

      gameLoop.launchBall();
      detector.evaluateCatch = () => ({
        confirmed: true,
        valid: true,
        cupKey: CupKey.BIG,
        catchType: 'clean',
        details: { distance: 0.01, relativeSpeed: 0.1, approachDot: -0.95 },
      });

      gameLoop.catchDetector.update(0.016, kenGroup);
      gameLoop.scoreManager.update(0.016);

      expect(scoreEventWrapper).toHaveProperty('payload');
      const scorePayload = scoreEventWrapper.payload;
      expect(scorePayload.eventId).toBe(`flight_${trajectory.flightId}`);
      expect(scorePayload.catchType).toBe(CatchType.CLEAN);
      expect(scorePayload.currentStreak).toBe(1);
      expect(scorePayload.streak).toBe(1);
      expect(scorePayload.multipliers).toBeDefined();
      expect(scorePayload.totalEnergy).toBe(scorePayload.awardedEnergy);

      // ScoreEvent constructor compatibility validation
      const eventInstance = new ScoreEvent(scorePayload);
      expect(eventInstance.awardedEnergy).toBe(scorePayload.awardedEnergy);
      expect(eventInstance.currentStreak).toBe(scorePayload.currentStreak);
    });

    it('21. Duplicate flight IDs cannot be scored twice', () => {
      let scoreCount = 0;
      eventBus.on(Events.SCORE, () => {
        scoreCount++;
      });

      gameLoop.launchBall();
      detector.evaluateCatch = () => ({
        confirmed: true,
        valid: true,
        cupKey: CupKey.BIG,
        catchType: 'clean',
        details: { distance: 0.01, relativeSpeed: 0.1, approachDot: -0.95 },
      });

      // Frame 1: scored for flight 1
      gameLoop.catchDetector.update(0.016, kenGroup);
      gameLoop.scoreManager.update(0.016);
      expect(scoreCount).toBe(1);

      // Frame 2: subsequent update on same flight cannot score again
      gameLoop.catchDetector.update(0.016, kenGroup);
      gameLoop.scoreManager.update(0.016);
      expect(scoreCount).toBe(1);
    });

    it('22. Scoring updates through the GamePipeline-compatible scoreManager.update(dt) facet', () => {
      expect(typeof gameLoop.scoreManager.update).toBe('function');
    });
  });

  // ==========================================================================
  // F. Pipeline compatibility
  // ==========================================================================
  describe('F. Pipeline compatibility', () => {
    it('23. GameLoop exposes inputSystem.update(dt, xrFrame)', () => {
      expect(gameLoop.inputSystem).toBeDefined();
      expect(typeof gameLoop.inputSystem.update).toBe('function');
    });

    it('24. GameLoop exposes catchDetector.update(dt, gameplayKenGroup)', () => {
      expect(gameLoop.catchDetector).toBeDefined();
      expect(typeof gameLoop.catchDetector.update).toBe('function');
    });

    it('24b. catchDetector.update synchronizes active ken group with detector via setKenGroup', () => {
      const alternateKen = createMockKenGroup();
      expect(detector.gameplayKenGroup).toBe(kenGroup);

      gameLoop.catchDetector.update(0.016, alternateKen);

      expect(detector.gameplayKenGroup).toBe(alternateKen);
    });

    it('25. GameLoop exposes catchDetector.getBallState()', () => {
      expect(typeof gameLoop.catchDetector.getBallState).toBe('function');
      const bs = gameLoop.catchDetector.getBallState();
      expect(bs).toHaveProperty('position');
      expect(bs).toHaveProperty('velocity');
      expect(bs).toHaveProperty('mode');
    });

    it('26. GameLoop exposes scoreManager.update(dt)', () => {
      expect(gameLoop.scoreManager).toBeDefined();
      expect(typeof gameLoop.scoreManager.update).toBe('function');
    });

    it('27. The three facets can be injected into GamePipeline using the actual constructor contract', () => {
      const mockMissionController = {
        update: () => {},
        getMissionState: () => ({ chapter: 1 }),
        getPlanetState: () => ({ scars: 0 }),
        getTargetState: () => ({ cupKey: 'big' }),
      };
      const mockOrbitalEngine = {
        step: () => {},
        getPhysicsState: () => ({ bodies: [] }),
      };
      const mockWorldRenderer = {
        render: () => {},
      };

      const pipeline = new GamePipeline({
        eventBus,
        gameplayKenGroup: kenGroup,
        inputSystem: gameLoop.inputSystem,
        catchDetector: gameLoop.catchDetector,
        scoreManager: gameLoop.scoreManager,
        missionController: mockMissionController,
        orbitalEngine: mockOrbitalEngine,
        worldRenderer: mockWorldRenderer,
        fixedDelta: 1 / 120,
      });

      expect(pipeline.inputSystem).toBe(gameLoop.inputSystem);
      expect(pipeline.catchDetector).toBe(gameLoop.catchDetector);
      expect(pipeline.scoreManager).toBe(gameLoop.scoreManager);

      expect(() => {
        pipeline.tick(16.6667, null, 1 / 120);
      }).not.toThrow();
    });
  });

  // ==========================================================================
  // G. Input behavior
  // ==========================================================================
  describe('G. Input behavior', () => {
    it("28. FakeInput's internally created gameplayKenGroup is synchronized with the canonical gameplayKenGroup", () => {
      const fakeInput = new FakeInput();
      const loopWithFake = new GameLoop({
        eventBus,
        gameplayKenGroup: kenGroup,
        inputSource: fakeInput,
        trajectory,
        catchFlow,
        detector,
        scoreManager,
      });

      // Move Ken through FakeInput's public mouse handler
      fakeInput.handleMouseMove({ movementX: 100, movementY: -50 });

      loopWithFake.inputSystem.update(0.016, null);

      expect(kenGroup.position.x).not.toBe(0.0);
      expect(kenGroup.position.y).not.toBe(1.25);
    });

    it("29. FakeInput's launch request is consumed only once", () => {
      const fakeInput = new FakeInput();
      const loopWithFake = new GameLoop({
        eventBus,
        gameplayKenGroup: kenGroup,
        inputSource: fakeInput,
        trajectory,
        catchFlow,
        detector,
        scoreManager,
      });

      // Public key down requesting launch
      fakeInput.handleKeyDown({ code: 'Space' });

      // Frame 1: Consumes launch request and launches ball
      loopWithFake.inputSystem.update(0.016, null);
      expect(catchFlow.state).toBe('air');
      expect(fakeInput.consumeLaunchRequest()).toBe(false);

      // Frame 2: Subsequent update does not re-launch
      loopWithFake.inputSystem.update(0.016, null);
      expect(catchFlow.state).toBe('air');
    });

    it('30. HandPoseAdapter accepts a valid joints object containing wrist position and orientation', () => {
      const adapter = new HandPoseAdapter({ hand: 'right', gripSource: 'wrist' });
      const loopWithHand = new GameLoop({
        eventBus,
        gameplayKenGroup: kenGroup,
        inputSource: adapter,
        trajectory,
        catchFlow,
        detector,
        scoreManager,
      });

      const validJoints = {
        wrist: {
          position: { x: 0.05, y: 1.28, z: -0.42 },
          quaternion: { x: 0.0, y: 0.0, z: 0.0, w: 1.0 },
          valid: true,
        },
      };

      loopWithHand.inputSystem.update(0.016, validJoints);

      expect(kenGroup.position.x).toBeCloseTo(0.05);
      expect(kenGroup.position.y).toBeCloseTo(1.28);
      expect(kenGroup.position.z).toBeCloseTo(-0.42);
      expect(adapter.isTrackingValid).toBe(true);
    });

    it('31. Invalid or missing joint data is handled as tracking loss', () => {
      const adapter = new HandPoseAdapter({ hand: 'right', gripSource: 'wrist' });
      const loopWithHand = new GameLoop({
        eventBus,
        gameplayKenGroup: kenGroup,
        inputSource: adapter,
        trajectory,
        catchFlow,
        detector,
        scoreManager,
      });

      const validJoints = {
        wrist: {
          position: { x: 0.05, y: 1.28, z: -0.42 },
          quaternion: { x: 0.0, y: 0.0, z: 0.0, w: 1.0 },
          valid: true,
        },
      };
      loopWithHand.inputSystem.update(0.016, validJoints);
      expect(adapter.isTrackingValid).toBe(true);

      // Pass null joints -> tracking loss
      loopWithHand.inputSystem.update(0.016, null);
      expect(adapter.isTrackingValid).toBe(false);
    });

    it('32. Tracking recovery restores valid pose handling', () => {
      const adapter = new HandPoseAdapter({ hand: 'right', gripSource: 'wrist' });
      const loopWithHand = new GameLoop({
        eventBus,
        gameplayKenGroup: kenGroup,
        inputSource: adapter,
        trajectory,
        catchFlow,
        detector,
        scoreManager,
      });

      const validJoints = {
        wrist: {
          position: { x: 0.05, y: 1.28, z: -0.42 },
          quaternion: { x: 0.0, y: 0.0, z: 0.0, w: 1.0 },
          valid: true,
        },
      };

      // Frame 1: Tracking loss
      loopWithHand.inputSystem.update(0.016, null);
      expect(adapter.isTrackingValid).toBe(false);

      // Frame 2: Tracking recovered
      loopWithHand.inputSystem.update(0.016, validJoints);
      expect(adapter.isTrackingValid).toBe(true);
      expect(kenGroup.position.x).toBeCloseTo(0.05);
    });
  });

  // ==========================================================================
  // H. Event handling
  // ==========================================================================
  describe('H. Event handling', () => {
    it('33. TARGET events update the active target cup', () => {
      expect(gameLoop.activeTargetCup).toBe(CupKey.BIG);

      const target = new TargetState(CupKey.SMALL, 'alternate', 1);
      eventBus.emit(Events.TARGET, target);

      expect(gameLoop.activeTargetCup).toBe(CupKey.SMALL);
    });

    it("34. CADENCE events update the scoring engine's target cadence", () => {
      let updatedCadence = null;
      const originalSet = scoreManager.setTargetCadence.bind(scoreManager);
      scoreManager.setTargetCadence = (s) => {
        updatedCadence = s;
        originalSet(s);
      };

      eventBus.emit(Events.CADENCE, 1.5);
      expect(updatedCadence).toBe(1.5);
    });

    it("35. dispose() unsubscribes GameLoop's event listeners", () => {
      let cadenceCalled = false;
      scoreManager.setTargetCadence = () => {
        cadenceCalled = true;
      };

      gameLoop.dispose();

      eventBus.emit(Events.TARGET, new TargetState(CupKey.BASE, 'around', 2));
      expect(gameLoop.activeTargetCup).toBe(CupKey.BIG); // Unchanged

      eventBus.emit(Events.CADENCE, 2.2);
      expect(cadenceCalled).toBe(false); // Unsubscribed
    });
  });
});
