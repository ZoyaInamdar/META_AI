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
import { PoseFilter } from '../input/PoseFilter.js';
import { extractWristJoint, extractPinchJoints } from '../input/XRHandJointExtractor.js';
import { PinchDetector } from '../input/PinchDetector.js';

export class GameLoop {
  /**
   * @param {Object} [options={}]
   * @param {EventBus} [options.eventBus]
   * @param {any} [options.gameplayKenGroup]
   * @param {any} [options.inputSource]
   * @param {string} [options.inputSourceType]
   * @param {PoseFilter|null} [options.poseFilter]
   * @param {Object} [options.filterOptions={}]
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
      poseFilter = undefined,
      filterOptions = {},
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

    // Pose filter for smoothing noisy hardware hand tracking (bypassed for FakeInput)
    this.poseFilter = poseFilter !== undefined
      ? poseFilter
      : new PoseFilter(filterOptions);

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

    this.targetOverride = options.targetOverride || null;
    this.activeTargetCup = this.targetOverride || initialCup;
    this._isTrackingValid = true;
    this.lastEvaluatedVelocity = null;

    // WebXR context references for wrist joint extraction
    this.referenceSpace = options.referenceSpace || null;
    this.xrInputSource = options.xrInputSource || null;
    this.hand = options.hand || 'right';
    this.gripSource = options.gripSource || 'wrist';
    this.world = options.world || null;
    this.launchHand = options.launchHand || 'left';
    this.otherInputSource = options.otherInputSource || null;
    this.pinchDetector = options.pinchDetector || new PinchDetector();
    this.trajectoryUpdateCount = 0;
    this.lastLaunchInfo = null;
    this.lastCatchEvaluation = null;
    this.lastDt = 0.016;

    // Staging queues across intra-frame stages (Stage 2 -> Stage 3)
    this._pendingCatchResult = null;
    this._pendingMissFlightId = null;

    // Subscriptions to Person B events
    this._unsubTarget = this.eventBus.on(Events.TARGET, (target) => {
      if (this.targetOverride) {
        return; // Forced target in debug mode
      }
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
      gameLoop: self,
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
        this.launchBall('space/fakeInput');
      }
    }

    // Determine input source handling without relying on update.length
    const isHandAdapter = this.inputSourceType === 'hand' ||
      this.inputSource.gripSource !== undefined ||
      typeof this.inputSource.consumeLaunchRequest !== 'function';

    let inputOutput = null;
    let actualFrame = xrFrame;
    if (xrFrame && typeof xrFrame === 'object' && typeof xrFrame.getJointPose !== 'function') {
      // If an XR context wrapper was passed
      this.setXRContext(xrFrame);
      actualFrame = xrFrame.frame ?? xrFrame.xrFrame ?? null;
    } else if (!actualFrame && this.currentXRFrame) {
      actualFrame = this.currentXRFrame;
    }

    if (isHandAdapter) {
      let resolvedJoints = null;
      if (xrFrame && typeof xrFrame === 'object' && 'wrist' in xrFrame) {
        // Fast path: already a resolved joints dictionary
        resolvedJoints = xrFrame;
      } else {
        // Always pass the actual XRFrame (not the wrapper object) and live context options
        resolvedJoints = extractWristJoint(actualFrame, {
          referenceSpace: this.referenceSpace,
          inputSource: this.xrInputSource,
          hand: this.hand,
          gripSource: this.gripSource,
          world: this.world,
        });
      }

      // Check pinch gesture for hand tracking if XR frame and reference space are active
      if (actualFrame && typeof actualFrame.getJointPose === 'function' && this.referenceSpace) {
        const sourcesToCheck = [];
        const kenSource = this.xrInputSource;
        const offSource = this.otherInputSource ||
          (this.world?.input?.xr?.getPrimaryInputSource
            ? this.world.input.xr.getPrimaryInputSource(this.hand === 'right' ? 'left' : 'right')
            : null);

        if (this.launchHand === 'left') {
          const leftSource = this.hand === 'left' ? kenSource : offSource;
          if (leftSource) sourcesToCheck.push(leftSource);
        } else if (this.launchHand === 'right') {
          const rightSource = this.hand === 'right' ? kenSource : offSource;
          if (rightSource) sourcesToCheck.push(rightSource);
        } else {
          // 'either'
          if (kenSource) sourcesToCheck.push(kenSource);
          if (offSource && offSource !== kenSource) sourcesToCheck.push(offSource);
        }

        let pinchValid = false;
        let minDistance = null;

        for (const src of sourcesToCheck) {
          const res = extractPinchJoints(actualFrame, src, this.referenceSpace);
          if (res.valid && res.distance !== null) {
            pinchValid = true;
            if (minDistance === null || res.distance < minDistance) {
              minDistance = res.distance;
            }
          }
        }

        this.pinchDetector.update(pinchValid, minDistance);
      }

      // Pass resolved joint dictionary to HandPoseAdapter
      inputOutput = this.inputSource.update(dt, resolvedJoints);
    } else {
      inputOutput = this.inputSource.update(dt);
    }

    // Edge-triggered pinch launch check (calls identical launchBall() path)
    if (this.pinchDetector && typeof this.pinchDetector.consumeLaunchRequest === 'function') {
      if (this.pinchDetector.consumeLaunchRequest()) {
        this.launchBall('pinch');
      }
    }

    // Synchronize resulting pose to canonical gameplayKenGroup
    if (inputOutput && inputOutput.position && inputOutput.quaternion) {
      const isCurrentlyValid = inputOutput.isTrackingValid !== false;

      if (isHandAdapter) {
        if (!isCurrentlyValid) {
          // Tracking is lost: reset filter, do not feed invalid tracking samples,
          // and preserve the existing canonical gameplayKenGroup transform in-place.
          if (this.poseFilter) {
            this.poseFilter.reset();
          }
        } else {
          // Tracking is valid: if recovering from lost tracking, start with a fresh filter state
          if (!this._isTrackingValid && this.poseFilter) {
            this.poseFilter.reset();
          }

          // Apply filter only to valid hand position data
          const filteredPos = this.poseFilter
            ? this.poseFilter.filter(inputOutput.position, dt)
            : inputOutput.position;

          if (this.gameplayKenGroup) {
            if (typeof this.gameplayKenGroup.position?.copy === 'function') {
              this.gameplayKenGroup.position.copy(filteredPos);
            }
            // Quaternion remains completely unfiltered; copy directly
            if (typeof this.gameplayKenGroup.quaternion?.copy === 'function') {
              this.gameplayKenGroup.quaternion.copy(inputOutput.quaternion);
            }
          }
        }
      } else {
        // Non-hand input: bypass PoseFilter
        if (this.gameplayKenGroup) {
          if (typeof this.gameplayKenGroup.position?.copy === 'function') {
            this.gameplayKenGroup.position.copy(inputOutput.position);
          }
          if (typeof this.gameplayKenGroup.quaternion?.copy === 'function') {
            this.gameplayKenGroup.quaternion.copy(inputOutput.quaternion);
          }
        }
      }

      this._isTrackingValid = isCurrentlyValid;
    } else if (this.inputSource.gameplayKenGroup) {
      // FakeInput creates an internal gameplayKenGroup; bypass PoseFilter
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
    this.trajectoryUpdateCount++;
    this.trajectory.update(dt);
    this.lastDt = dt;

    // 2. Advance catch flow state machine
    // Defer expiration check so catch evaluation (step 3) runs on the final tick first
    const trajState = this.trajectory?.state ?? this.trajectory;
    const flowResult = this.catchFlow.update(dt, activeKen, {
      ...trajState,
      deferExpiration: true,
    });

    // 3. Catch candidate evaluation while in air mode
    if (this.catchFlow.state === 'air' && this._isTrackingValid) {
      const ballPos = this.catchFlow.ballPosition;
      const ballVel = this.trajectory.state.velocity;
      const nowSec = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;

      this.lastEvaluatedVelocity = ballVel ? { ...ballVel } : { x: 0, y: 0, z: 0 };

      const evalRes = this.detector.evaluateCatch(
        ballPos,
        ballVel,
        this.activeTargetCup,
        nowSec,
        dt
      );
      this.lastCatchEvaluation = evalRes;

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

    // 4. Staging any miss:
    // (a) Depth-based miss detected by CatchFlow
    if (flowResult && flowResult.type === 'MISS') {
      this._pendingMissFlightId = flowResult.flightId;
    } else if (this.catchFlow.state === 'air') {
      // (b) Flight expiration miss: if still in 'air' (no catch confirmed) and trajectory ended
      const expirationMiss = typeof this.catchFlow.checkFlightExpiration === 'function'
        ? this.catchFlow.checkFlightExpiration(activeKen, {
            ...trajState,
            mode: trajState?.mode ?? this.trajectory?.mode,
            isAirborne: trajState?.isAirborne ?? this.trajectory?.isAirborne,
            elapsed: trajState?.elapsed ?? this.trajectory?.elapsed,
            flightDuration: trajState?.flightDuration ?? this.trajectory?.flightDuration,
          })
        : null;

      if (expirationMiss && expirationMiss.type === 'MISS') {
        this._pendingMissFlightId = expirationMiss.flightId;
      }
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
   * @param {string} [source='manual'] - Input source triggering the launch ('pinch', 'space/fakeInput', etc.)
   * @returns {boolean} True if launch was accepted, false if rejected
   */
  launchBall(source = 'manual') {
    if (this.catchFlow.state !== 'seated') {
      return false;
    }

    const launchPos = this.catchFlow.ballPosition;
    this.trajectory.launch(launchPos);
    this.catchFlow.onLaunch(this.trajectory.flightId);
    this.lastLaunchInfo = {
      source,
      position: { x: launchPos.x, y: launchPos.y, z: launchPos.z },
      velocity: {
        x: this.trajectory.state.velocity.x,
        y: this.trajectory.state.velocity.y,
        z: this.trajectory.state.velocity.z,
      },
      flightId: this.trajectory.flightId,
      timestamp: typeof performance !== 'undefined' ? performance.now() : Date.now(),
    };
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
   * Current tracking validity status of the active input source.
   * @returns {boolean}
   */
  get isTrackingValid() {
    return this._isTrackingValid;
  }

  /**
   * Updates WebXR context references used for wrist extraction.
   *
   * @param {Object} [context={}]
   * @param {any} [context.referenceSpace]
   * @param {any} [context.inputSource]
   * @param {string} [context.hand]
   * @param {string} [context.gripSource]
   * @param {any} [context.world]
   */
  setXRContext(context = {}) {
    if (context.referenceSpace !== undefined) this.referenceSpace = context.referenceSpace;
    if (context.inputSource !== undefined) this.xrInputSource = context.inputSource;
    else if (context.xrInputSource !== undefined) this.xrInputSource = context.xrInputSource;
    if (context.otherInputSource !== undefined) this.otherInputSource = context.otherInputSource;
    if (context.hand !== undefined) this.hand = context.hand;
    if (context.gripSource !== undefined) this.gripSource = context.gripSource;
    if (context.world !== undefined) this.world = context.world;
    if (context.frame !== undefined) this.currentXRFrame = context.frame;
    else if (context.xrFrame !== undefined) this.currentXRFrame = context.xrFrame;
    if (context.launchHand !== undefined) this.launchHand = context.launchHand;
  }

  /**
   * Cleans up event listeners registered on the shared EventBus and context references.
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
    this.referenceSpace = null;
    this.xrInputSource = null;
    this.world = null;
  }
}

export default GameLoop;
