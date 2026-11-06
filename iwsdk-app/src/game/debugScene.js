/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * ============================================================================
 * Celestial Kendama - Debug Scene & Visualizer (Person A Debug Wiring)
 * ============================================================================
 *
 * Provides developer diagnostics activated exclusively behind the `?debug` URL parameter:
 * - Simple placeholder box for the Ken parented to gameplayKenGroup.
 * - Simple wireframe sphere of radius BALL_RADIUS following ballState.position each frame.
 * - Once-per-second console debug log reporting: isTrackingValid, ball mode, last catch result.
 * - Detailed tracking diagnostic explaining WHY isTrackingValid is false:
 *   * pipeline ticks in the last second (KendamaXRSystem.update count)
 *   * world.xrFrame present? (yes/no)
 *   * world.xrReferenceSpace present? (yes/no)
 *   * inputSource from world.input.xr.getPrimaryInputSource('right') present?
 *   * inputSource.hand present? and inputSource.handedness
 *   * wrist joint (hand.get('wrist')) present?
 *   * getJointPose(wrist, referenceSpace) result present?
 *   * HandPoseAdapter lostFrames and trackingConfidence
 *   * all current input sources: handedness, whether .hand exists, and whether .gamepad exists
 *
 * STRICT OWNERSHIP BOUNDARY:
 * - Does NOT import or touch Person C rendering modules in src/render or src/preview.
 * - Uses authoritative BALL_RADIUS from Person A's src/input/cupConfigs.js.
 */

import { BoxGeometry, SphereGeometry, MeshBasicMaterial, Mesh } from 'three';
import { BALL_RADIUS, getCupConfig } from '../input/cupConfigs.js';
import { Events } from '../contracts/Interfaces.js';
import { KendamaXRSystem } from './KendamaXRSystem.js';

/**
 * Pure math helper to rotate a 3D vector by a quaternion without external dependencies.
 *
 * @param {{ x: number, y: number, z: number }} v
 * @param {{ x: number, y: number, z: number, w: number }} q
 * @returns {{ x: number, y: number, z: number }}
 */
function rotateVectorByQuat(v, q) {
  const qx = q?.x ?? 0.0;
  const qy = q?.y ?? 0.0;
  const qz = q?.z ?? 0.0;
  const qw = q?.w ?? 1.0;

  const vx = v?.x ?? 0.0;
  const vy = v?.y ?? 0.0;
  const vz = v?.z ?? 0.0;

  const tx = 2.0 * (qy * vz - qz * vy);
  const ty = 2.0 * (qz * vx - qx * vz);
  const tz = 2.0 * (qx * vy - qy * vx);

  return {
    x: vx + qw * tx + (qy * tz - qz * ty),
    y: vy + qw * ty + (qz * tx - qx * tz),
    z: vz + qw * tz + (qx * ty - qy * tx),
  };
}

/**
 * Computes world-space position and normal for a specified cup on the Ken.
 *
 * @param {string} cupKey
 * @param {any} kenGroup
 * @returns {{ position: { x: number, y: number, z: number }, normal: { x: number, y: number, z: number } }}
 */
export function getCupWorldPose(cupKey, kenGroup) {
  const config = getCupConfig(cupKey);
  if (!config || !kenGroup) {
    return {
      position: { x: 0, y: 0, z: 0 },
      normal: { x: 0, y: 1, z: 0 },
    };
  }

  const mw = kenGroup.matrixWorld;
  const el = mw?.elements || (Array.isArray(mw) ? mw : null);
  if (el && el.length >= 16) {
    const px = config.position.x;
    const py = config.position.y;
    const pz = config.position.z;
    const nx = config.normal.x;
    const ny = config.normal.y;
    const nz = config.normal.z;

    const posX = el[0] * px + el[4] * py + el[8] * pz + el[12];
    const posY = el[1] * px + el[5] * py + el[9] * pz + el[13];
    const posZ = el[2] * px + el[6] * py + el[10] * pz + el[14];

    let normX = el[0] * nx + el[4] * ny + el[8] * nz;
    let normY = el[1] * nx + el[5] * ny + el[9] * nz;
    let normZ = el[2] * nx + el[6] * ny + el[10] * nz;
    const len = Math.hypot(normX, normY, normZ);
    if (len > 1e-6) {
      normX /= len;
      normY /= len;
      normZ /= len;
    }

    return {
      position: { x: posX, y: posY, z: posZ },
      normal: { x: normX, y: normY, z: normZ },
    };
  }

  const pos = kenGroup.position || { x: 0, y: 0, z: 0 };
  const quat = kenGroup.quaternion || { x: 0, y: 0, z: 0, w: 1 };
  const rotPos = rotateVectorByQuat(config.position, quat);
  const norm = rotateVectorByQuat(config.normal, quat);

  return {
    position: {
      x: (pos.x ?? 0) + rotPos.x,
      y: (pos.y ?? 0) + rotPos.y,
      z: (pos.z ?? 0) + rotPos.z,
    },
    normal: norm,
  };
}

/**
 * Computes Ken orientation in Euler degrees (XYZ order) from rotation or quaternion.
 *
 * @param {any} kenGroup
 * @returns {{ x: number, y: number, z: number }}
 */
export function getKenEulerDeg(kenGroup) {
  if (!kenGroup) return { x: 0, y: 0, z: 0 };
  if (kenGroup.rotation && typeof kenGroup.rotation.x === 'number') {
    return {
      x: (kenGroup.rotation.x * 180) / Math.PI,
      y: (kenGroup.rotation.y * 180) / Math.PI,
      z: (kenGroup.rotation.z * 180) / Math.PI,
    };
  }
  if (kenGroup.quaternion) {
    const qx = kenGroup.quaternion.x ?? 0;
    const qy = kenGroup.quaternion.y ?? 0;
    const qz = kenGroup.quaternion.z ?? 0;
    const qw = kenGroup.quaternion.w ?? 1;

    const sinr_cosp = 2 * (qw * qx + qy * qz);
    const cosr_cosp = 1 - 2 * (qx * qx + qy * qy);
    const roll = Math.atan2(sinr_cosp, cosr_cosp);

    const sinp = 2 * (qw * qy - qz * qx);
    let pitch;
    if (Math.abs(sinp) >= 1) {
      pitch = Math.sign(sinp) * (Math.PI / 2);
    } else {
      pitch = Math.asin(sinp);
    }

    const siny_cosp = 2 * (qw * qz + qx * qy);
    const cosy_cosp = 1 - 2 * (qy * qy + qz * qz);
    const yaw = Math.atan2(siny_cosp, cosy_cosp);

    return {
      x: (roll * 180) / Math.PI,
      y: (pitch * 180) / Math.PI,
      z: (yaw * 180) / Math.PI,
    };
  }
  return { x: 0, y: 0, z: 0 };
}

/**
 * Checks whether the `?debug` query parameter is present in the current URL.
 *
 * @returns {boolean}
 */
export function isDebugMode() {
  if (typeof window !== 'undefined' && window.location && typeof window.location.search === 'string') {
    return new URLSearchParams(window.location.search).has('debug');
  }
  return false;
}

/**
 * Resolves forced target cup override from `?target=big|small|base|spike` URL query parameter.
 * Active exclusively when debug mode is enabled.
 *
 * @returns {string|null}
 */
export function getTargetOverride() {
  if (typeof window !== 'undefined' && window.location && typeof window.location.search === 'string') {
    const params = new URLSearchParams(window.location.search);
    if (params.has('debug')) {
      const t = params.get('target');
      if (t === 'big' || t === 'small' || t === 'base' || t === 'spike') {
        return t;
      }
    }
  }
  return null;
}

/**
 * Initializes debug visuals and diagnostic logging if debug mode is active.
 *
 * @param {Object} [options={}]
 * @param {any} [options.world] - The IWSDK World instance (or mock)
 * @param {any} [options.game] - The return value of initGame({ world, gameLoop, ... })
 * @param {any} [options.gameLoop] - The Person A GameLoop instance
 * @param {boolean} [options.debug] - Optional override for isDebugMode()
 * @param {string} [options.target] - Optional override for target cup
 * @returns {{ kenBox: Mesh|null, tamaSphere: Mesh|null, syncSpherePosition: Function, logDebugStatus: Function, getDiagnosticState: Function, onFrame: Function, cleanup: Function } | null}
 */
export function setupDebugScene(options = {}) {
  const { world, game, gameLoop, debug } = options;
  const active = debug !== undefined ? Boolean(debug) : isDebugMode();
  if (!active) {
    return null;
  }

  const kenGroup = game?.gameplayKenGroup ?? gameLoop?.gameplayKenGroup;
  let kenBox = null;
  if (kenGroup && typeof kenGroup.add === 'function') {
    const kenBoxGeometry = new BoxGeometry(0.06, 0.18, 0.06);
    const kenBoxMaterial = new MeshBasicMaterial({
      color: 0x00ff88,
      wireframe: true,
      name: 'debug-ken-material',
    });
    kenBox = new Mesh(kenBoxGeometry, kenBoxMaterial);
    kenBox.name = 'debug-ken-box';
    kenGroup.add(kenBox);
  }

  let tamaSphere = null;
  const scene = world?.scene;
  if (scene && typeof scene.add === 'function') {
    const tamaSphereGeometry = new SphereGeometry(BALL_RADIUS, 16, 16);
    const tamaSphereMaterial = new MeshBasicMaterial({
      color: 0xff4444,
      wireframe: true,
      name: 'debug-tama-material',
    });
    tamaSphere = new Mesh(tamaSphereGeometry, tamaSphereMaterial);
    tamaSphere.name = 'debug-tama-sphere';
    scene.add(tamaSphere);
  }

  // Update sphere position to match ball position
  const syncSpherePosition = (position) => {
    if (tamaSphere && position && typeof position === 'object') {
      const x = Number(position.x ?? 0.0);
      const y = Number(position.y ?? 0.0);
      const z = Number(position.z ?? 0.0);
      if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) {
        tamaSphere.position.set(x, y, z);
      }
    }
  };

  // 1. Force target cup override if ?target=big|small|base|spike is specified (debug only)
  const targetOverride = options.target || getTargetOverride();
  if (targetOverride && gameLoop) {
    gameLoop.targetOverride = targetOverride;
    gameLoop.activeTargetCup = targetOverride;
    if (gameLoop.catchFlow && typeof gameLoop.catchFlow.resetSeatCup === 'function') {
      gameLoop.catchFlow.resetSeatCup(targetOverride, kenGroup);
    }
  }

  // Sync initial position if already available
  const initialBallState = gameLoop?.getBallState?.() ?? game?.pipeline?.catchDetector?.getBallState?.();
  if (initialBallState?.position) {
    syncSpherePosition(initialBallState.position);
  }

  // Follow ballState.position each frame via BALL events
  const bus = game?.eventBus || gameLoop?.eventBus;

  // Track last catch or miss result for logging
  let lastCatchResult = null;
  let unsubBall = null;
  let unsubCatch = null;
  let unsubMiss = null;
  let unsubScore = null;
  if (bus && typeof bus.on === 'function') {
    unsubCatch = bus.on(Events.CATCH, (result) => {
      lastCatchResult = result ?? null;
    });
    unsubMiss = bus.on(Events.MISS, (missPayload) => {
      lastCatchResult = missPayload ? { type: 'MISS', ...missPayload } : { type: 'MISS' };
      console.log(`[DEBUG Miss] flightId: ${missPayload?.flightId ?? 'none'}`);
    });
    unsubScore = bus.on(Events.SCORE, (eventPayload) => {
      const scoreObj = eventPayload?.payload || eventPayload;
      const mults = scoreObj?.multipliers;
      const multStr = mults
        ? `accuracy: ${mults.accuracy}, cadence: ${mults.cadence}, streak: ${mults.streak}, total: ${mults.total}`
        : 'none';
      console.log(
        `[DEBUG Score] catchType: ${scoreObj?.catchType} | multipliers: (${multStr}) | awardedEnergy: ${scoreObj?.awardedEnergy} | totalEnergy: ${scoreObj?.totalEnergy} | streak: ${scoreObj?.currentStreak ?? scoreObj?.streak}`
      );
    });
  }

  // Flight tracking state for target evaluation, closest distance, and launch/final-tick logging
  let activeFlightId = null;
  let flightMinDistance = Infinity;
  let flightMinDistanceTime = 0.0;
  let ticksInsideAssist = 0;
  let ticksInsideClean = 0;
  let lastRecordedDt = 0.016;
  let lastAirOneSecondLogTime = -1.0;
  let loggedTicksForFlight = new Set();
  let prevBallMode = null;

  // Track compact debug logging interval and change detection (Item 1)
  let secondsSinceLastLog = 0;
  let lastLoggedCompactState = null;

  /**
   * Per-frame hook triggered by Events.BALL updates.
   * Handles sphere syncing and per-flight diagnostics (Items 2, 3, 4).
   *
   * @param {any} ballState
   */
  const onFrame = (ballState) => {
    if (ballState?.position) {
      syncSpherePosition(ballState.position);
    }

    const currentMode = ballState?.mode ?? gameLoop?.catchFlow?.state ?? 'seated';
    const currentFlightId = gameLoop?.trajectory?.flightId ?? 'none';
    const activeCup = gameLoop?.activeTargetCup ?? 'big';
    const kenGroup = game?.gameplayKenGroup ?? gameLoop?.gameplayKenGroup;
    const trajectory = gameLoop?.trajectory;
    const elapsed = trajectory?.elapsed ?? 0.0;
    const flightDuration = trajectory?.flightDuration ?? 0.8390;
    const dt = gameLoop?.lastDt ?? 0.016;

    // Detect flight start (Launch)
    if (currentMode === 'air' && prevBallMode !== 'air') {
      activeFlightId = currentFlightId;
      flightMinDistance = Infinity;
      flightMinDistanceTime = 0.0;
      ticksInsideAssist = 0;
      ticksInsideClean = 0;
      lastAirOneSecondLogTime = 0.0;
      loggedTicksForFlight = new Set();

      // Item 3: Log target cup normal/position and Ken rotation at launch
      const cupPose = getCupWorldPose(activeCup, kenGroup);
      const kenRot = getKenEulerDeg(kenGroup);

      // Item 1: Ball world position at launch, seat cup, and distances to all 4 cup centers
      const ballLaunchPos = ballState?.position ?? gameLoop?.catchFlow?.ballPosition ?? trajectory?.state?.position ?? { x: 0, y: 0, z: 0 };
      const seatCup = gameLoop?.catchFlow?.seatCupKey ?? 'unknown';
      const cupKeys = ['big', 'small', 'base', 'spike'];
      const cupDists = cupKeys.map(key => {
        const p = getCupWorldPose(key, kenGroup);
        const d = Math.hypot(
          ballLaunchPos.x - p.position.x,
          ballLaunchPos.y - p.position.y,
          ballLaunchPos.z - p.position.z
        );
        return `${key}: ${d.toFixed(4)}m`;
      }).join(', ');

      console.log(
        `[DEBUG Launch] flight: ${currentFlightId} | target: ${activeCup} | seatCup: ${seatCup} | ` +
        `ballPos: (${ballLaunchPos.x.toFixed(4)}, ${ballLaunchPos.y.toFixed(4)}, ${ballLaunchPos.z.toFixed(4)}) | ` +
        `cupPos: (${cupPose.position.x.toFixed(4)}, ${cupPose.position.y.toFixed(4)}, ${cupPose.position.z.toFixed(4)}) | ` +
        `cupNorm: (${cupPose.normal.x.toFixed(4)}, ${cupPose.normal.y.toFixed(4)}, ${cupPose.normal.z.toFixed(4)}) | ` +
        `kenRotDeg: (${kenRot.x.toFixed(2)}°, ${kenRot.y.toFixed(2)}°, ${kenRot.z.toFixed(2)}°) | ` +
        `cupDists: (${cupDists})`
      );
    }

    // While ball mode is 'air'
    if (currentMode === 'air') {
      const evalRes = gameLoop?.lastCatchEvaluation ?? (gameLoop?.detector && ballState?.position && trajectory?.state?.velocity
        ? gameLoop.detector.evaluateCatch(ballState.position, trajectory.state.velocity, activeCup, (Date.now() / 1000), dt)
        : null);

      const cupPose = getCupWorldPose(activeCup, kenGroup);
      const dist = evalRes?.details?.distance ?? (ballState?.position
        ? Math.hypot(ballState.position.x - cupPose.position.x, ballState.position.y - cupPose.position.y, ballState.position.z - cupPose.position.z)
        : Infinity);

      const cleanR = evalRes?.details?.cleanRadius ?? 0.04;
      const assistR = evalRes?.details?.assistedRadius ?? 0.06;

      // Track ticks inside R_assist and R_clean (Item 4)
      if (Number.isFinite(dist)) {
        if (dist <= assistR) {
          ticksInsideAssist++;
        }
        if (dist <= cleanR) {
          ticksInsideClean++;
        }
      }
      lastRecordedDt = dt;

      // Track closest distance for Item 2 & 4 (only count ticks after apex vy < 0)
      const vy = trajectory?.state?.velocity?.y ?? ballState?.velocity?.y ?? 0.0;
      if (vy < 0.0 && Number.isFinite(dist) && dist < flightMinDistance) {
        flightMinDistance = dist;
        flightMinDistanceTime = elapsed;
      }

      // Calculate ticks remaining in flight
      const remainingTime = Math.max(0, flightDuration - elapsed);
      const ticksRemaining = Math.round(remainingTime / dt);

      const logTargetEvaluation = (tag) => {
        const approachDot = evalRes?.details?.approachDot ?? 0.0;
        const relSpeed = evalRes?.details?.relativeSpeed ?? 0.0;
        const maxRelSpeed = gameLoop?.detector?.maxRelativeSpeed;
        const maxRelSpeedStr = maxRelSpeed != null ? maxRelSpeed.toFixed(3) : 'none';
        const reason = evalRes?.reason;
        const firstFail = reason ? reason : (evalRes?.valid ? 'none (all checks pass)' : 'out_of_range');
        const confirmed = Boolean(evalRes?.confirmed);
        const valid = Boolean(evalRes?.valid);
        const confirmCount = evalRes?.confirmationCount ?? 0;

        console.log(
          `[DEBUG TargetEval ${tag}] flight: ${currentFlightId} | cup: ${activeCup} | ` +
          `dist: ${Number.isFinite(dist) ? dist.toFixed(4) : 'N/A'}m (R_clean: ${cleanR.toFixed(4)}m, R_assist: ${assistR.toFixed(4)}m) | ` +
          `dot: ${approachDot.toFixed(3)} (req < -0.2) | ` +
          `relSpeed: ${relSpeed.toFixed(3)} m/s (max: ${maxRelSpeedStr}) | ` +
          `firstFail: ${firstFail} | ` +
          `confirmed: ${confirmed}, valid: ${valid} | ` +
          `confirmCount: ${confirmCount}/2`
        );
      };

      // Item 2: Log once per second while in air
      if (elapsed >= 1.0 && (lastAirOneSecondLogTime === 0.0 || (elapsed - lastAirOneSecondLogTime) >= 1.0)) {
        lastAirOneSecondLogTime = elapsed;
        logTargetEvaluation('1s');
      }

      // Item 2: Log on each of the last 5 ticks of the flight
      if (ticksRemaining <= 5 && ticksRemaining >= 1) {
        if (!loggedTicksForFlight.has(ticksRemaining)) {
          loggedTicksForFlight.add(ticksRemaining);
          logTargetEvaluation(`Tick -${ticksRemaining}`);
        }
      }
    }

    // Detect flight end (Final tick / transition out of 'air')
    if (prevBallMode === 'air' && currentMode !== 'air') {
      // Item 3: Log target cup normal/position & Ken euler degrees on the final tick
      const cupPose = getCupWorldPose(activeCup, kenGroup);
      const kenRot = getKenEulerDeg(kenGroup);

      // Item 3: Velocity passed to evaluateCatch on final tick and pre/post clamp status
      const evalVel = gameLoop?.lastEvaluatedVelocity ?? trajectory?.state?.lastAirVelocity ?? trajectory?.state?.velocity ?? { x: 0, y: 0, z: 0 };
      const isZeroed = Math.hypot(evalVel.x, evalVel.y, evalVel.z) < 1e-6;
      const clampType = isZeroed ? 'post-clamp (zeroed)' : 'pre-clamp';

      console.log(
        `[DEBUG FinalTick] flight: ${activeFlightId ?? currentFlightId} | target: ${activeCup} | ` +
        `cupPos: (${cupPose.position.x.toFixed(4)}, ${cupPose.position.y.toFixed(4)}, ${cupPose.position.z.toFixed(4)}) | ` +
        `cupNorm: (${cupPose.normal.x.toFixed(4)}, ${cupPose.normal.y.toFixed(4)}, ${cupPose.normal.z.toFixed(4)}) | ` +
        `kenRotDeg: (${kenRot.x.toFixed(2)}°, ${kenRot.y.toFixed(2)}°, ${kenRot.z.toFixed(2)}°) | ` +
        `evalVel: (${evalVel.x.toFixed(4)}, ${evalVel.y.toFixed(4)}, ${evalVel.z.toFixed(4)}) [${clampType}]`
      );

      // Item 2: Log final tick target evaluation if not already logged
      if (!loggedTicksForFlight.has(0)) {
        loggedTicksForFlight.add(0);
        const evalRes = gameLoop?.lastCatchEvaluation;
        const cleanR = evalRes?.details?.cleanRadius ?? 0.04;
        const assistR = evalRes?.details?.assistedRadius ?? 0.06;
        const approachDot = evalRes?.details?.approachDot ?? 0.0;
        const relSpeed = evalRes?.details?.relativeSpeed ?? 0.0;
        const maxRelSpeed = gameLoop?.detector?.maxRelativeSpeed;
        const maxRelSpeedStr = maxRelSpeed != null ? maxRelSpeed.toFixed(3) : 'none';
        const reason = evalRes?.reason;
        const firstFail = reason ? reason : (evalRes?.valid ? 'none (all checks pass)' : 'flight_expired');
        const confirmed = Boolean(evalRes?.confirmed);
        const valid = Boolean(evalRes?.valid);
        const confirmCount = evalRes?.confirmationCount ?? 0;
        const dist = evalRes?.details?.distance ?? flightMinDistance;

        console.log(
          `[DEBUG TargetEval Final] flight: ${activeFlightId ?? currentFlightId} | target: ${activeCup} | ` +
          `evalVel: (${evalVel.x.toFixed(4)}, ${evalVel.y.toFixed(4)}, ${evalVel.z.toFixed(4)}) [${clampType}] | ` +
          `dist: ${Number.isFinite(dist) ? dist.toFixed(4) : 'N/A'}m (R_clean: ${cleanR.toFixed(4)}m, R_assist: ${assistR.toFixed(4)}m) | ` +
          `dot: ${approachDot.toFixed(3)} (req < -0.2) | ` +
          `relSpeed: ${relSpeed.toFixed(3)} m/s (max: ${maxRelSpeedStr}) | ` +
          `firstFail: ${firstFail} | ` +
          `confirmed: ${confirmed}, valid: ${valid} | ` +
          `confirmCount: ${confirmCount}/2`
        );
      }

      // Item 2 & 4: Once per flight, log closest distance reached after apex
      console.log(
        `[DEBUG Closest] flight: ${activeFlightId ?? currentFlightId} | target: ${activeCup} | ` +
        `minDistance: ${Number.isFinite(flightMinDistance) ? flightMinDistance.toFixed(4) : 'N/A'}m at t=${flightMinDistanceTime.toFixed(3)}s`
      );

      // Item 4: Once per flight, log ticks spent inside R_assist and R_clean, and dt
      console.log(
        `[DEBUG Proximity] flight: ${activeFlightId ?? currentFlightId} | ` +
        `ticksInsideAssist: ${ticksInsideAssist} | ticksInsideClean: ${ticksInsideClean} | ` +
        `dt: ${(lastRecordedDt * 1000).toFixed(2)}ms (~${Math.round(1 / lastRecordedDt)} FPS)`
      );

      ticksInsideAssist = 0;
      ticksInsideClean = 0;
      flightMinDistance = Infinity;
      activeFlightId = null;
    }

    prevBallMode = currentMode;
  };

  // Follow ballState.position each frame via BALL events
  if (bus && typeof bus.on === 'function') {
    unsubBall = bus.on(Events.BALL, (ballState) => {
      onFrame(ballState);
    });
  }

  // Track pipeline tick counts and trajectory update counts between 1-second intervals
  let lastUpdateCount = 0;
  let lastTrajectoryUpdateCount = 0;

  /**
   * Compiles detailed diagnostic data explaining why tracking is valid or invalid.
   */
  const getDiagnosticState = () => {
    const xrSys = game?.xrSystem
      ?? (typeof world?.getSystem === 'function' ? world.getSystem(KendamaXRSystem) : null);
    const currentUpdateCount = xrSys?.updateCount ?? 0;
    const ticksInLastSecond = currentUpdateCount - lastUpdateCount;
    lastUpdateCount = currentUpdateCount;

    const xrFrame = world?.xrFrame
      ?? (world?.renderer?.xr?.getFrame ? world.renderer.xr.getFrame() : null);
    const hasXrFrame = Boolean(xrFrame);

    const xrRefSpace = world?.xrReferenceSpace
      ?? (world?.renderer?.xr?.getReferenceSpace ? world.renderer.xr.getReferenceSpace() : null);
    const hasXrRefSpace = Boolean(xrRefSpace);

    const primaryInputSource = world?.input?.xr?.getPrimaryInputSource?.('right')
      ?? world?.input?.getPrimaryInputSource?.('right')
      ?? null;
    const hasPrimaryInputSource = Boolean(primaryInputSource);

    const hasHand = Boolean(primaryInputSource?.hand);
    const handedness = primaryInputSource?.handedness ?? 'none';

    let wristJoint = null;
    if (primaryInputSource?.hand) {
      if (typeof primaryInputSource.hand.get === 'function') {
        wristJoint = primaryInputSource.hand.get('wrist') ?? primaryInputSource.hand.get(0) ?? null;
      } else if (primaryInputSource.hand.wrist) {
        wristJoint = primaryInputSource.hand.wrist;
      }
    }
    const hasWristJoint = Boolean(wristJoint);

    let jointPose = null;
    if (xrFrame && wristJoint && xrRefSpace && typeof xrFrame.getJointPose === 'function') {
      try {
        jointPose = xrFrame.getJointPose(wristJoint, xrRefSpace);
      } catch {
        jointPose = null;
      }
    }
    const hasJointPose = Boolean(jointPose);

    const adapter = gameLoop?.inputSource;
    const lostFrames = adapter?.lostFrames ?? 'N/A';
    const trackingConfidence = typeof adapter?.trackingConfidence === 'number'
      ? adapter.trackingConfidence
      : (adapter?.trackingConfidence ?? 'N/A');

    // List all current input sources
    const session = world?.renderer?.xr?.getSession?.() ?? xrFrame?.session ?? null;
    let allSources = [];
    if (session?.inputSources) {
      allSources = Array.from(session.inputSources);
    } else {
      const leftSource = world?.input?.xr?.getPrimaryInputSource?.('left')
        ?? world?.input?.getPrimaryInputSource?.('left');
      const rightSource = primaryInputSource;
      if (leftSource) allSources.push(leftSource);
      if (rightSource && rightSource !== leftSource) allSources.push(rightSource);
    }

    const sourcesList = allSources.map((s) => ({
      handedness: s.handedness ?? 'none',
      hasHand: Boolean(s.hand),
      hasGamepad: Boolean(s.gamepad),
    }));

    // Pinch gesture state for calibration
    const pinchDetector = gameLoop?.pinchDetector;
    const isPinched = Boolean(pinchDetector?.isPinched);
    const pinchState = isPinched ? 'pinched' : 'open';
    const pinchDist = pinchDetector?.lastDistance;
    const pinchDistanceCm = typeof pinchDist === 'number'
      ? (pinchDist * 100).toFixed(2)
      : 'N/A';

    // Ball & trajectory diagnostics
    const ballState = gameLoop?.getBallState?.() ?? game?.pipeline?.catchDetector?.getBallState?.();
    const ballPos = ballState?.position ?? gameLoop?.catchFlow?.ballPosition ?? { x: 0, y: 0, z: 0 };
    const ballVel = ballState?.velocity ?? gameLoop?.trajectory?.state?.velocity ?? { x: 0, y: 0, z: 0 };
    const ballVelY = ballVel?.y ?? 0;
    const flightId = gameLoop?.trajectory?.flightId ?? gameLoop?.catchFlow?.flightId ?? 'none';
    const ballMode = ballState?.mode ?? gameLoop?.catchFlow?.state ?? 'unknown';

    // Ken position Y
    const kenGroup = game?.gameplayKenGroup ?? gameLoop?.gameplayKenGroup;
    let kenPosY = 'N/A';
    if (kenGroup?.position) {
      if (typeof kenGroup.position.y === 'number') {
        kenPosY = kenGroup.position.y;
      }
    }

    // Trajectory update tick rate (count per second)
    const currentTrajCount = gameLoop?.trajectoryUpdateCount ?? 0;
    const trajUpdatesInLastSecond = currentTrajCount - lastTrajectoryUpdateCount;
    lastTrajectoryUpdateCount = currentTrajCount;

    // Miss threshold information
    // In CatchFlow: MISS_DEPTH = 0.45. Miss condition: isDescending (vy < 0) && ball.y < ken.y - 0.45.
    // Note: Floor check (floor y <= 0) is not implemented in CatchFlow.
    const kenMissThreshold = typeof kenPosY === 'number' ? kenPosY - 0.45 : 'N/A';
    const missThresholdInfo = {
      floorThreshold: 'none (floor y<=0 not implemented)',
      kenRelativeThreshold: typeof kenPosY === 'number' ? kenMissThreshold.toFixed(4) : 'N/A',
      kenMissDepthConstant: 0.45,
      formula: 'isDescending (vy < 0) && ball.y < (ken.y - 0.45)',
    };

    // Last launch info
    const lastLaunchInfo = gameLoop?.lastLaunchInfo ?? null;

    return {
      ticksInLastSecond,
      hasXrFrame,
      hasXrRefSpace,
      hasPrimaryInputSource,
      hasHand,
      handedness,
      hasWristJoint,
      hasJointPose,
      lostFrames,
      trackingConfidence,
      sourcesList,
      isPinched,
      pinchState,
      pinchDist,
      pinchDistanceCm,
      ballPosition: {
        x: Number(ballPos.x ?? 0),
        y: Number(ballPos.y ?? 0),
        z: Number(ballPos.z ?? 0),
      },
      ballVelocityY: Number(ballVelY ?? 0),
      flightId,
      ballMode,
      kenPosY,
      missThresholdInfo,
      trajUpdatesInLastSecond,
      lastLaunchInfo,
    };
  };

  /**
   * Compact 1-second status logger (Item 1).
   * Replaces previous multi-line verbose debug logs with ONE compact line,
   * printed only when state has changed or every 5 seconds.
   */
  const logDebugStatus = () => {
    const isTrackingValid = Boolean(gameLoop ? gameLoop.isTrackingValid : false);
    const diag = getDiagnosticState();

    const pinchFormatted = diag.pinchDistanceCm === 'N/A'
      ? `${diag.pinchState} (N/A)`
      : `${diag.pinchState} (${diag.pinchDistanceCm} cm)`;

    let lastResultStr = 'none';
    if (lastCatchResult) {
      if (lastCatchResult.type === 'MISS') {
        lastResultStr = `MISS (flight ${lastCatchResult.flightId ?? diag.flightId})`;
      } else {
        lastResultStr = `CATCH: ${lastCatchResult.type ?? 'clean'} (${lastCatchResult.cupKey ?? '?'})`;
      }
    }

    const currentCompact = `valid: ${isTrackingValid} | pinch: ${pinchFormatted} | mode: ${diag.ballMode} | flight: ${diag.flightId} | last: ${lastResultStr}`;

    secondsSinceLastLog++;
    const hasChanged = currentCompact !== lastLoggedCompactState;

    if (hasChanged || secondsSinceLastLog >= 5) {
      console.log(`[DEBUG] ${currentCompact}`);
      lastLoggedCompactState = currentCompact;
      secondsSinceLastLog = 0;
    }
  };

  // Once-per-second interval
  let intervalId = null;
  if (typeof setInterval === 'function') {
    intervalId = setInterval(logDebugStatus, 1000);
  }

  const cleanup = () => {
    if (intervalId !== null && typeof clearInterval === 'function') {
      clearInterval(intervalId);
      intervalId = null;
    }
    if (typeof unsubBall === 'function') unsubBall();
    if (typeof unsubCatch === 'function') unsubCatch();
    if (typeof unsubMiss === 'function') unsubMiss();
    if (typeof unsubScore === 'function') unsubScore();

    if (kenBox && kenGroup && typeof kenGroup.remove === 'function') {
      kenGroup.remove(kenBox);
      kenBox.geometry?.dispose?.();
      kenBox.material?.dispose?.();
    }
    if (tamaSphere && scene && typeof scene.remove === 'function') {
      scene.remove(tamaSphere);
      tamaSphere.geometry?.dispose?.();
      tamaSphere.material?.dispose?.();
    }
  };

  return {
    kenBox,
    tamaSphere,
    syncSpherePosition,
    logDebugStatus,
    getDiagnosticState,
    onFrame,
    cleanup,
  };
}
