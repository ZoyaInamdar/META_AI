/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * ============================================================================
 * Celestial Kendama - GameLoop (Person A Coordinator & Pipeline Facets)
 * Role: Person A (The Hands)
 * ============================================================================
 *
 * Coordinates Person A's sub-components:
 * - Input (FakeInput / HandPoseAdapter)
 * - Projectile Flight (BallTrajectory)
 * - Catch Flow & Seating State Machine (CatchFlow)
 * - Spatial Contact Evaluation (KendamaInputAndDetector)
 * - Cadence & Streak Scoring Engine (ScoreManager)
 *
 * Exposes three pipeline facets consumed by Person B's GamePipeline:
 * - inputSystem.update(dt, xrFrame)
 * - catchDetector.update(dt, gameplayKenGroup) & catchDetector.getBallState()
 * - scoreManager.update(dt)
 */

import {
  Events,
  CupKey,
  CatchType,
  BallState,
  CatchResult,
  ScoreEvent,
} from '../contracts/Interfaces.js';
import { eventBus as defaultEventBus } from '../contracts/EventBus.js';
import { BallTrajectory } from './BallTrajectory.js';
import { CatchFlow } from './CatchFlow.js';
import { ScoreManager } from './ScoreManager.js';
import { KendamaInputAndDetector } from '../input/KendamaInputAndDetector.js';

export class GameLoop {
  /**
   * @param {Object} [options={}]
   * @param {EventBus} [options.eventBus]
   * @param {any} [options.gameplayKenGroup]
   * @param {any} [options.inputSource]
   * @param {string} [options.inputSourceType]
   * @param {BallTrajectory} [options.trajectory]
   * @param {CatchFlow} [options.catchFlow]
   * @param {KendamaInputAndDetector} [options.detector]
   * @param {ScoreManager} [options.scoreManager]
   * @param {string} [options.initialCup=CupKey.SPIKE]
   * @param {number} [options.targetCadenceSeconds=1.75]
   * @param {Object} [options.detectorOptions={}]
   */
  constructor(options = {}) {
    const {
      eventBus = defaultEventBus,
      gameplayKenGroup = null,
      inputSource = null,
      inputSourceType = null,
      trajectory = null,
      catchFlow = null,
      detector = null,
      scoreManager = null,
      initialCup = CupKey.SPIKE,
      targetCadenceSeconds = 1.75,
      detectorOptions = {},
    } = options;

    this.eventBus = eventBus;
    this.gameplayKenGroup = gameplayKenGroup;
    this.inputSource = inputSource;
    this.inputSourceType = inputSourceType;

    // Component instances
    this.trajectory = trajectory || new BallTrajectory();
    this.catchFlow = catchFlow || new CatchFlow({
      initialCup,
      kenPose: this.gameplayKenGroup,
    });

    // KendamaInputAndDetector constructor takes (gameplayKenGroup, options)
    this.detector = detector || new KendamaInputAndDetector(
      this.gameplayKenGroup,
      detectorOptions
    );

    // Pure ScoreManager scoring engine
    this.scoreEngine = scoreManager || new ScoreManager({
      targetCadenceSeconds,
    });

    this.activeTargetCup = initialCup;
    this._isTrackingValid = true;

    // Staging queues across intra-frame stages (Stage 2 -> Stage 3)
    this._pendingCatchResult = null;
    this._pendingMissFlightId = null;

    // Subscriptions to Person B events
    this._unsubTarget = this.eventBus.on(Events.TARGET, (target) => {
      if (target && target.cupKey) {
        this.activeTargetCup = target.cupKey;
      }
    });

    this._unsubCadence = this.eventBus.on(Events.CADENCE, (payload) => {
      const sec = typeof payload === 'number'
        ? payload
        : payload?.targetCadenceSeconds;
      if (typeof sec === 'number' && Number.isFinite(sec) && sec > 0) {
        this.scoreEngine.setTargetCadence(sec);
      }
    });

    // ------------------------------------------------------------------------
    // Pipeline Facets for Person B's GamePipeline
    // ------------------------------------------------------------------------
    const self = this;

    this.inputSystem = {
      update: (dt, xrFrame) => self.updateInput(dt, xrFrame),
    };

    this.catchDetector = {
      update: (dt, kenGroup) => self.updateCatchDetection(dt, kenGroup),
      getBallState: () => self.getBallState(),
    };

    this.scoreManager = {
      update: (dt) => self.updateScoring(dt),
      get totalEnergy() {
        return self.scoreEngine.totalEnergy;
      },
      get currentStreak() {
        return self.scoreEngine.currentStreak;
      },
    };
  }

  /**
   * Stage 1: Updates input source and synchronizes gameplayKenGroup.
   *
   * @param {number} dt - Frame delta time in seconds
   * @param {any} xrFrame - Joint dictionary for HandPoseAdapter or WebXR frame
   * @returns {any} Synchronized gameplayKenGroup
   */
  updateInput(dt, xrFrame) {
    if (!this.inputSource) {
      if (this.gameplayKenGroup && typeof this.gameplayKenGroup.updateMatrixWorld === 'function') {
        this.gameplayKenGroup.updateMatrixWorld(true);
      }
      return this.gameplayKenGroup;
    }

    // Edge-triggered launch check for sources supporting it (FakeInput)
    if (typeof this.inputSource.consumeLaunchRequest === 'function') {
      if (this.inputSource.consumeLaunchRequest()) {
        this.launchBall();
      }
    }

    // Determine input source handling without relying on update.length
    const isHandAdapter = this.inputSourceType === 'hand' ||
      this.inputSource.gripSource !== undefined ||
      typeof this.inputSource.consumeLaunchRequest !== 'function';

    let inputOutput = null;
    if (isHandAdapter) {
      // Pass xrFrame / joint dictionary to HandPoseAdapter
      inputOutput = this.inputSource.update(dt, xrFrame);
    } else {
      inputOutput = this.inputSource.update(dt);
    }

    // Synchronize resulting pose to canonical gameplayKenGroup
    if (inputOutput && inputOutput.position && inputOutput.quaternion) {
      if (this.gameplayKenGroup) {
        if (typeof this.gameplayKenGroup.position?.copy === 'function') {
          this.gameplayKenGroup.position.copy(inputOutput.position);
        }
        if (typeof this.gameplayKenGroup.quaternion?.copy === 'function') {
          this.gameplayKenGroup.quaternion.copy(inputOutput.quaternion);
        }
      }
      this._isTrackingValid = inputOutput.isTrackingValid !== false;
    } else if (this.inputSource.gameplayKenGroup) {
      // FakeInput creates an internal gameplayKenGroup
      if (this.gameplayKenGroup && this.gameplayKenGroup !== this.inputSource.gameplayKenGroup) {
        if (typeof this.gameplayKenGroup.position?.copy === 'function') {
          this.gameplayKenGroup.position.copy(this.inputSource.gameplayKenGroup.position);
        }
        if (typeof this.gameplayKenGroup.quaternion?.copy === 'function') {
          this.gameplayKenGroup.quaternion.copy(this.inputSource.gameplayKenGroup.quaternion);
        }
      }
      this._isTrackingValid = true;
    } else if (typeof this.inputSource.isTrackingValid === 'boolean') {
      this._isTrackingValid = this.inputSource.isTrackingValid;
    }

    if (this.gameplayKenGroup && typeof this.gameplayKenGroup.updateMatrixWorld === 'function') {
      this.gameplayKenGroup.updateMatrixWorld(true);
    }

    return this.gameplayKenGroup;
  }

  /**
   * Stage 2: Advances ballistic trajectory, updates CatchFlow, and evaluates catches.
   *
   * @param {number} dt - Frame delta time in seconds
   * @param {any} [kenGroup] - Active Ken pose / group
   */
  updateCatchDetection(dt, kenGroup) {
    const activeKen = kenGroup || this.gameplayKenGroup;

    // Synchronize detector ken group if activeKen differs
    if (activeKen && this.detector && typeof this.detector.setKenGroup === 'function') {
      if (this.detector.gameplayKenGroup !== activeKen) {
        this.detector.setKenGroup(activeKen);
      }
    }

    // 1. Advance ballistic trajectory
    this.trajectory.update(dt);

    // 2. Advance catch flow state machine
    const flowResult = this.catchFlow.update(dt, activeKen, this.trajectory.state);

    // 3. Catch candidate evaluation while in air mode
    if (this.catchFlow.state === 'air' && this._isTrackingValid) {
      const ballPos = this.catchFlow.ballPosition;
      const ballVel = this.trajectory.state.velocity;
      const nowSec = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;

      const evalRes = this.detector.evaluateCatch(
        ballPos,
        ballVel,
        this.activeTargetCup,
        nowSec,
        dt
      );

      // Process catch only when BOTH evalRes.confirmed and evalRes.valid are true
      if (evalRes && evalRes.confirmed && evalRes.valid) {
        this.catchFlow.onCatchConfirmed(evalRes.cupKey, ballPos);

        const catchResult = new CatchResult({
          type: evalRes.catchType === 'clean' ? CatchType.CLEAN : CatchType.ASSISTED,
          cupKey: evalRes.cupKey,
          distance: evalRes.details?.distance ?? 0,
          relativeSpeed: evalRes.details?.relativeSpeed ?? 0,
          alignmentDot: evalRes.details?.approachDot ?? 0,
          timestamp: nowSec * 1000,
        });

        this._pendingCatchResult = {
          catchResult,
          flightId: this.trajectory.flightId,
          timestampMs: nowSec * 1000,
        };

        this.eventBus.emit(Events.CATCH, catchResult);
      }
    }

    // 4. Staging any miss detected by CatchFlow
    if (flowResult && flowResult.type === 'MISS') {
      this._pendingMissFlightId = flowResult.flightId;
    }

    // 5. Emit BALL state every frame
    this.eventBus.emit(Events.BALL, this.getBallState());
  }

  /**
   * Stage 3: Evaluates pending score or miss events.
   *
   * @param {number} _dt - Frame delta time in seconds
   */
  updateScoring(_dt) {
    const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();

    // Process pending catch scoring
    if (this._pendingCatchResult) {
      const { catchResult, flightId, timestampMs } = this._pendingCatchResult;
      this._pendingCatchResult = null;

      const scoreObj = this.scoreEngine.processCatchEvent(
        catchResult,
        timestampMs || nowMs,
        flightId
      );

      if (scoreObj !== null) {
        const scoreEvent = new ScoreEvent(scoreObj);
        // Emit SCORE event with canonical ScoreEvent wrapped in payload property
        // No circular reference or mutation of scoreEvent
        const eventPayload = {
          payload: scoreEvent,
          awardedEnergy: scoreEvent.awardedEnergy,
        };
        this.eventBus.emit(Events.SCORE, eventPayload);
      }
    }

    // Process pending miss event
    if (this._pendingMissFlightId !== null) {
      const flightId = this._pendingMissFlightId;
      this._pendingMissFlightId = null;

      this.scoreEngine.registerMiss();
      this.eventBus.emit(Events.MISS, { flightId, timestamp: nowMs });
    }
  }

  /**
   * Initiates ball launch from seated state.
   *
   * @returns {boolean} True if launch was accepted, false if rejected
   */
  launchBall() {
    if (this.catchFlow.state !== 'seated') {
      return false;
    }

    const launchPos = this.catchFlow.ballPosition;
    this.trajectory.launch(launchPos);
    this.catchFlow.onLaunch(this.trajectory.flightId);
    return true;
  }

  /**
   * Retrieves current canonical BallState.
   *
   * @returns {BallState}
   */
  getBallState() {
    const pos = this.catchFlow.ballPosition;
    const vel = this.trajectory.state.velocity;
    return new BallState(
      { x: pos.x, y: pos.y, z: pos.z },
      { x: vel.x, y: vel.y, z: vel.z },
      this.catchFlow.state
    );
  }

  /**
   * Cleans up event listeners registered on the shared EventBus.
   */
  dispose() {
    if (typeof this._unsubTarget === 'function') {
      this._unsubTarget();
      this._unsubTarget = null;
    }
    if (typeof this._unsubCadence === 'function') {
      this._unsubCadence();
      this._unsubCadence = null;
    }
  }
}

export default GameLoop;
