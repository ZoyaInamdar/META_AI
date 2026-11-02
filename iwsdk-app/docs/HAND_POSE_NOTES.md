# IWSDK Hand Tracking & Pose Investigation Notes
**Role:** Person A (The Hands)  
**Project:** Celestial Kendama (`iwsdk-app`)  
**Document Path:** `iwsdk-app/docs/HAND_POSE_NOTES.md`

This document details how the Immersive Web SDK (IWSDK) exposes player hand and wrist tracking, how the desktop emulator (IWER) simulates hands, what pose shapes are consumed by Person A's catch detection engine, and how the `HandPoseAdapter` bridges raw joint tracking to the Kendama pose pipeline.

---

## 1. Hand Tracking Activation & Architecture

### Configuration & Feature Flags
In IWSDK, hand tracking is requested via WebXR session feature flags:
* **Project Manifest Configuration:**  
  Configured in [`iwsdk-app/iwsdk.config.json`](file:///Users/zoya/META_AI/iwsdk-app/iwsdk.config.json#L14-L16):
  ```json
  "world": {
    "xr": {
      "mode": "vr",
      "offer": "always",
      "features": {
        "handTracking": true
      }
    }
  }
  ```
* **Runtime Feature Flag Mapping:**  
  Defined in [`@iwsdk/core/dist/init/xr.js`](file:///Users/zoya/META_AI/iwsdk-app/node_modules/@iwsdk/core/dist/init/xr.js#L46-L71):
  ```javascript
  const map = {
      handTracking: 'hand-tracking',
      // ...
  };
  push('handTracking', normalizeFlag(f.handTracking));
  ```
  - Setting `handTracking: true` maps to the standard WebXR feature token `'hand-tracking'` as an **optional** feature (lines 66–68).
  - Setting `handTracking: { required: true }` requests `'hand-tracking'` as a **required** feature (lines 63–65).
  - Schema validation for this flag is enforced in [`@iwsdk/core/dist/project/validation.js`](file:///Users/zoya/META_AI/iwsdk-app/node_modules/@iwsdk/core/dist/project/validation.js#L153).

### Exposing Module, System & Class
* **`XRInputManager`:** Defined in [`@iwsdk/xr-input/dist/xr-input-manager.js`](file:///Users/zoya/META_AI/iwsdk-app/node_modules/@iwsdk/xr-input/dist/xr-input-manager.js#L32) and instantiated during world setup in [`@iwsdk/core/dist/init/world-initializer.js`](file:///Users/zoya/META_AI/iwsdk-app/node_modules/@iwsdk/core/dist/init/world-initializer.js#L298-L308).
* **Access Points:**
  - `world.input.xr`: The canonical `XRInputManager` instance (see [`@iwsdk/core/dist/input/input-manager.d.ts`](file:///Users/zoya/META_AI/iwsdk-app/node_modules/@iwsdk/core/dist/input/input-manager.d.ts#L25)).
  - `world.input.xr.getPrimaryInputSource('right' | 'left')`: Returns the active `XRInputSource` for that hand ([`xr-input-manager.js`](file:///Users/zoya/META_AI/iwsdk-app/node_modules/@iwsdk/xr-input/dist/xr-input-manager.js#L122)).
  - `world.player`: An instance of `XROrigin` ([`@iwsdk/xr-input/dist/rig/xr-origin.js`](file:///Users/zoya/META_AI/iwsdk-app/node_modules/@iwsdk/xr-input/dist/rig/xr-origin.js)) providing pre-transformed spaces: `gripSpaces.right`, `raySpaces.right`, and `indexTipSpaces.right`.
  - `world.input.xr.visualAdapters.hand[handedness]`: Instance of `XRHandVisualAdapter` managing hand visualization and joint transforms ([`@iwsdk/xr-input/dist/visual/adapter/hand-visual-adapter.js`](file:///Users/zoya/META_AI/iwsdk-app/node_modules/@iwsdk/xr-input/dist/visual/adapter/hand-visual-adapter.js#L72)).

---

## 2. Joint Availability, Spaces & Reading Joint Poses

### Available Joints
IWSDK and its underlying runtime `iwer` implement the standard W3C WebXR Hand Input specification with **25 distinct joints**, enumerated in [`iwer/lib/input/XRHand.d.ts`](file:///Users/zoya/META_AI/iwsdk-app/node_modules/iwer/lib/input/XRHand.d.ts#L8-L34) (`XRHandJoint` enum):
1. `wrist`
2. Thumb: `thumb-metacarpal`, `thumb-phalanx-proximal`, `thumb-phalanx-distal`, `thumb-tip`
3. Index Finger: `index-finger-metacarpal`, `index-finger-phalanx-proximal`, `index-finger-phalanx-intermediate`, `index-finger-phalanx-distal`, `index-finger-tip`
4. Middle Finger: `middle-finger-metacarpal`, `middle-finger-phalanx-proximal`, `middle-finger-phalanx-intermediate`, `middle-finger-phalanx-distal`, `middle-finger-tip`
5. Ring Finger: `ring-finger-metacarpal`, `ring-finger-phalanx-proximal`, `ring-finger-phalanx-intermediate`, `ring-finger-phalanx-distal`, `ring-finger-tip`
6. Pinky Finger: `pinky-finger-metacarpal`, `pinky-finger-phalanx-proximal`, `pinky-finger-phalanx-intermediate`, `pinky-finger-phalanx-distal`, `pinky-finger-tip`

> [!NOTE]
> **Palm Joint Representation:** The standard WebXR specification does **not** contain a joint named `"palm"`. The anatomical base of the palm is represented by `wrist`, and the mid-palm ray originates from `middle-finger-metacarpal`. In high-level scripting tools and IWER MCP contracts ([`@iwsdk/cli/dist/contract.js`](file:///Users/zoya/META_AI/iwsdk-app/node_modules/@iwsdk/cli/dist/contract.js#L640)), `"palm"` is supported as an orientation direction (where the palm faces) or anchor target, but in raw WebXR `XRHand` Map instances only the 25 standard joints exist.

### Per-Frame Reading of Wrist & Finger Joints
Joint poses can be retrieved each frame through two pathways:

1. **Direct WebXR Frame API (`getJointPose`):**  
   Implemented in [`iwer/lib/frameloop/XRFrame.js`](file:///Users/zoya/META_AI/iwsdk-app/node_modules/iwer/lib/frameloop/XRFrame.js#L94-L98):
   ```javascript
   const inputSource = world.input.xr.getPrimaryInputSource('right');
   if (inputSource?.hand) {
       const wristSpace = inputSource.hand.get('wrist');
       const jointPose = frame.getJointPose(wristSpace, referenceSpace);
       if (jointPose) {
           const pos = jointPose.transform.position;    // { x, y, z } in meters
           const rot = jointPose.transform.orientation; // { x, y, z, w } unit quaternion
           const radius = jointPose.radius;             // joint sphere radius in meters
       }
   }
   ```
2. **Batch Matrix Buffer API (`fillPoses`):**  
   Implemented in [`iwer/lib/frameloop/XRFrame.js`](file:///Users/zoya/META_AI/iwsdk-app/node_modules/iwer/lib/frameloop/XRFrame.js#L120-L134) and used in [`@iwsdk/xr-input/dist/visual/adapter/hand-visual-adapter.js`](file:///Users/zoya/META_AI/iwsdk-app/node_modules/@iwsdk/xr-input/dist/visual/adapter/hand-visual-adapter.js#L125):
   ```javascript
   frame.fillPoses(this.jointSpaces, referenceSpace, this.jointTransforms);
   ```
   This fills a pre-allocated `Float32Array(400)` with 16-element column-major transform matrices for all 25 joints in a single call with zero allocations.

### Coordinate Space & Units
* **Coordinate Space:** Reference space (`referenceSpace`), typically `'local-floor'` in IWSDK VR. This directly corresponds to world coordinates relative to the player origin (`world.player`).
* **Units:**
  - Position: **meters** (e.g. eye level ~1.6m, table ~0.92m, neutral ken ~1.25m).
  - Orientation: **unit quaternion** (normalized, length 1).
  - Velocity: **meters per second (m/s)**.
  - Validity: `jointPose !== null` and `Number.isFinite(pos.x)`.

---

## 3. Hand Distinction & Tracking Loss Handling

### Handedness Distinction
Input sources expose `inputSource.handedness`: `'left' | 'right' | 'none'`.  
In [`@iwsdk/xr-input/dist/xr-input-manager.js`](file:///Users/zoya/META_AI/iwsdk-app/node_modules/@iwsdk/xr-input/dist/xr-input-manager.js#L434-L444), sources are categorized and deduplicated:
```javascript
assignInputSource(inputSource, isPrimary) {
    const handedness = inputSource.handedness;
    if (handedness === 'left' || handedness === 'right') {
        const target = inputSource.hand ? this.activeInputSources.hand : this.activeInputSources.controller;
        target[handedness] = { inputSource, isPrimary };
    }
}
```

### Lost or Untracked Hand Detection
Runtimes can keep reporting an `XRInputSource` even when the player's physical hand moves out of headset camera view. IWSDK explicitly detects tracking loss via `hasWristPose`:
* **Detection Implementation:** [`@iwsdk/xr-input/dist/xr-input-manager.js`](file:///Users/zoya/META_AI/iwsdk-app/node_modules/@iwsdk/xr-input/dist/xr-input-manager.js#L629-L635):
  ```javascript
  function hasWristPose(frame, hand, refSpace) {
      const wrist = hand.get('wrist');
      if (!wrist || typeof frame.getJointPose !== 'function') {
          return true;
      }
      return frame.getJointPose(wrist, refSpace) !== null;
  }
  ```
* **Handling Untracked State:** [`xr-input-manager.js`](file:///Users/zoya/META_AI/iwsdk-app/node_modules/@iwsdk/xr-input/dist/xr-input-manager.js#L468-L470, L490-L492):
  - When `tracked === false`, `this.untrackedPrimary[handedness] = true;`.
  - The hand visual is hidden: `visualAdapter.visual.model.visible = false;`.
  - Pointers are disconnected so rays do not freeze or trigger accidental grabs in space.

---

## 4. Built-in Visualization, Gestures & Pointers

IWSDK includes comprehensive built-in modules that can be leveraged or referenced:

### Visualization
* **`AnimatedHand`:** Defined in [`@iwsdk/xr-input/dist/visual/impl/animated-hand.js`](file:///Users/zoya/META_AI/iwsdk-app/node_modules/@iwsdk/xr-input/dist/visual/impl/animated-hand.js#L89-L100). A skinned 3D hand mesh with custom vertex shaders, outline effects, and stencil-buffered depth.
* **`XRHandVisualAdapter`:** Defined in [`@iwsdk/xr-input/dist/visual/adapter/hand-visual-adapter.js`](file:///Users/zoya/META_AI/iwsdk-app/node_modules/@iwsdk/xr-input/dist/visual/adapter/hand-visual-adapter.js#L72). Automatically updates bone transforms from `jointTransforms` every frame.
* **`AnimatedControllerHand`:** Defined in [`@iwsdk/xr-input/dist/visual/impl/animated-controller-hand.js`](file:///Users/zoya/META_AI/iwsdk-app/node_modules/@iwsdk/xr-input/dist/visual/impl/animated-controller-hand.js). Blends hand meshes over controller models based on trigger/grip capacitive sensors.

### Gestures
* **Continuous Pinch Tracking:** Implemented in `XRHandVisualAdapter.updatePinch` ([`hand-visual-adapter.js`](file:///Users/zoya/META_AI/iwsdk-app/node_modules/@iwsdk/xr-input/dist/visual/adapter/hand-visual-adapter.js#L154-L186)). Computes distance between `index-finger-tip` and `thumb-tip`:
  - `pinchThreshold`: 0.008 m (8 mm).
  - `pinchStrength`: normalized continuous float from 0 (open) to 1 (closed pinch).
* **Discrete Select States:** `XRInputManager.getSelectState(handedness)` ([`xr-input-manager.js`](file:///Users/zoya/META_AI/iwsdk-app/node_modules/@iwsdk/xr-input/dist/xr-input-manager.js#L129)) returns `{ start, end, active }`.
* **Microgestures:** Supported in `TurnSystem` and `TeleportSystem` ([`@iwsdk/core/dist/locomotion/turn.d.ts`](file:///Users/zoya/META_AI/iwsdk-app/node_modules/@iwsdk/core/dist/locomotion/turn.d.ts#L28), [`teleport.d.ts`](file:///Users/zoya/META_AI/iwsdk-app/node_modules/@iwsdk/core/dist/locomotion/teleport.d.ts#L24)) for thumb swipes against the index finger.

### Pointer Helpers
* **`TouchPointer`:** ([`@iwsdk/xr-input/dist/pointer/touch-pointer.js`](file:///Users/zoya/META_AI/iwsdk-app/node_modules/@iwsdk/xr-input/dist/pointer/touch-pointer.js)). Uses `XROrigin.indexTipSpaces` to provide direct poke interactions for spatial UI buttons.
* **`GrabPointer` & `GrabSystem`:** ([`@iwsdk/core/dist/grab/grab-system.js`](file:///Users/zoya/META_AI/iwsdk-app/node_modules/@iwsdk/core/dist/grab/grab-system.js#L328)). Supports `OneHandGrabbable`, `TwoHandsGrabbable`, and `DistanceGrabbable`. Hand pinch gestures automatically forward as squeeze/grab events.

---

## 5. Emulator & Dev Plugin Simulation (IWER)

IWSDK incorporates **IWER** (Immersive Web Emulator Runtime v2.7.0) via `@iwsdk/vite-plugin-dev`, serving WebSocket bridge RPCs at `/__iwer_mcp`.

### Programmatic Control & Test Scripting
Defined in [`iwer/lib/remote/RemoteControlInterface.js`](file:///Users/zoya/META_AI/iwsdk-app/node_modules/iwer/lib/remote/RemoteControlInterface.js) (and [`.d.ts`](file:///Users/zoya/META_AI/iwsdk-app/node_modules/iwer/lib/remote/RemoteControlInterface.d.ts#L10-L60)):
Commands can be dispatched directly to the virtual device queue:
```javascript
import { XRDevice, metaQuest3 } from 'iwer';
const device = new XRDevice(metaQuest3);

// Animate virtual hand to target position
await device.remote.dispatch('animate_to', {
    device: 'hand-right',
    position: { x: 0.1, y: 1.25, z: -0.45 },
    duration: 0.5,
});

// Set named hand pose
await device.remote.dispatch('set_hand_pose', {
    device: 'hand-right',
    poseId: 'pinch',
});
```

### MCP & CLI Tools
The CLI contract in [`@iwsdk/cli/dist/contract.js`](file:///Users/zoya/META_AI/iwsdk-app/node_modules/@iwsdk/cli/dist/contract.js) exposes commands for AI assistants and scripts:
* `xr_set_hand_pose` / `npx @iwsdk/cli xr set-hand-pose` (lines 1591, 3363): Sets named poses: `default` (relaxed), `pinch`, `point`, `fist`, `open`, `flat`, `horns`, `thumbs-up`, `peace`, `cup`, `claw`, `hook`, `grip`, `tripod`, `key-pinch`, `microgesture` (lines 673–698).
* `xr_get_hand_state` / `npx @iwsdk/cli xr get-hand-state` (lines 1621, 3365): Returns hand pose, pinch value, select state, and XR-origin positions of `wrist`, `grip`, `grasp`, `index-tip`, and `thumb-tip`.
* `xr_set_device_state` / `npx @iwsdk/cli xr set-device-state` (lines 3325, 3362): Teleports or reorients virtual hands.
* `xr_run_sequence` / `npx @iwsdk/cli xr run-sequence` (lines 1643, 3366): Drives scripted multi-step interactions (`press`, `grasp`, `place`, `touch`) with anchor points (`wrist`, `index-tip`, `grasp`).

### Interactive UI Controls
In the browser development overlay:
* Mode toggle switches input devices between standard 6DoF Touch controllers and tracked hands.
* Keyboard controls (WASD + mouse look) translate the head/body, while preset dropdowns and pinch sliders manipulate hand joints.

---

## 6. Per-Frame Update Hook

In IWSDK applications, the authoritative per-frame update hook is the **ECS System `update` loop** ([`@iwsdk/core/dist/ecs/system.js`](file:///Users/zoya/META_AI/iwsdk-app/node_modules/@iwsdk/core/dist/ecs/system.js), [`api-reference.md`](file:///Users/zoya/META_AI/iwsdk-app/.agents/skills/iwsdk-dev/references/api-reference.md#L44-L78), and [`src/robot.js`](file:///Users/zoya/META_AI/iwsdk-app/src/robot.js#L28)):
```javascript
import { createSystem } from '@iwsdk/core';
import { HandPoseAdapter } from './input/HandPoseAdapter.js';

export class KendamaInputSystem extends createSystem() {
    init() {
        this.handAdapter = new HandPoseAdapter({ hand: 'right', gripSource: 'wrist' });
    }

    update(delta, time) {
        // delta is dt in seconds
        const inputSource = this.world.input.xr.getPrimaryInputSource('right');
        const frame = this.world.renderer?.xr?.getFrame();
        const refSpace = this.world.renderer?.xr?.getReferenceSpace();

        // Sample joints if hand tracking is active
        let joints = null;
        if (inputSource?.hand && frame && refSpace) {
            const wristJoint = inputSource.hand.get('wrist');
            const wristPose = frame.getJointPose(wristJoint, refSpace);
            if (wristPose) {
                joints = {
                    wrist: {
                        position: wristPose.transform.position,
                        quaternion: wristPose.transform.orientation,
                        valid: true,
                        radius: wristPose.radius,
                    },
                };
            }
        }

        // Update thin adapter to produce canonical Ken pose
        const kenPose = this.handAdapter.update(delta, joints);

        // Feed kenPose to KendamaInputAndDetector / CatchFlow
    }
}
```

---

## 7. Ken Pose Shape in FakeInput & KendamaInputAndDetector

### Field Names & Units in `FakeInput.js`
In [`iwsdk-app/src/input/FakeInput.js`](file:///Users/zoya/META_AI/iwsdk-app/src/input/FakeInput.js#L145-L178, L395-L412), simulated input exposes `this.gameplayKenGroup`:
* `position`: `{ x: number, y: number, z: number }` in **meters**.
* `quaternion`: `{ x: number, y: number, z: number, w: number }` **unit quaternion**.
* `rotation`: `{ x: number, y: number, z: number }` **Euler angles in radians**.
* Top-level getters: `x`, `y`, `z` (meters), `rollAngle` (radians).

### Expectations in `KendamaInputAndDetector.js`
In [`iwsdk-app/src/input/KendamaInputAndDetector.js`](file:///Users/zoya/META_AI/iwsdk-app/src/input/KendamaInputAndDetector.js#L148-L251, L326-L394):
* **World Position Extraction:** Reads `kenGroup.position.x`, `kenGroup.position.y`, `kenGroup.position.z` (or `matrixWorld`).
* **Orientation Transformation:** Uses `kenGroup.quaternion` (`rotateVectorByQuat`) to orient cup catch normals and calculate alignment angles against world up `(0, 1, 0)`.
* **Velocity Calculation:** Tracks linear velocity in m/s across frames using `(pos - prevPos) / dt`.

### Canonical Adapter Output Specification
To act as a seamless drop-in replacement, `HandPoseAdapter.update(dt, joints)` returns:
```javascript
{
    position: { x, y, z },          // [meters] World/reference space position
    quaternion: { x, y, z, w },      // [unit] Normalized orientation quaternion
    rotation: { x, y, z },          // [radians] Euler angles
    linearVelocity: { x, y, z },    // [m/s] Instantaneous velocity (0 on first frame & after recovery)
    isTrackingValid: boolean,       // true when tracking is active and finite
    trackingConfidence: number,     // 1.0 (valid) ramping to 0.0 over lostFrameLimit frames
    lostFrames: number,             // Number of consecutive untracked frames
    x: number,                      // Convenience alias for position.x
    y: number,                      // Convenience alias for position.y
    z: number,                      // Convenience alias for position.z
}
```

---

## Open questions / things I could not verify

1. **Physical Quest Grip Offset Tuning (`gripOffset`):**  
   The WebXR `wrist` joint sits at the anatomical wrist crease. A physical or virtual Kendama is gripped in the palm with fingers wrapped around the ken stem or crossbar. Because there is no standard hardware controller rigidly defining this transform, the exact translation/rotation offset from wrist/palm to the crossbar origin will need empirical user-testing and calibration in headset.
2. **Hand Tracking Extrapolation & Frame Latency (60 Hz vs 90/120 Hz):**  
   Meta Quest headsets often capture hand tracking optical frames at 60 Hz while the display renders at 90 Hz or 120 Hz with predictive pose extrapolation. It is unverified whether fast kendama swinging gestures produce extrapolation overshoot in `frame.getJointPose`, or if `PoseFilter`'s One Euro tuning will require distinct cutoff frequencies for hand tracking versus controller input.
3. **Non-Standard Runtime Joint Spaces:**  
   While Quest Browser and IWER strictly adhere to the 25 standard joints, future Horizon OS runtimes or third-party OpenXR browsers may surface additional experimental joint anchors (such as dedicated palm center joints). The adapter gracefully falls back to `wrist` when `palm` is omitted.
