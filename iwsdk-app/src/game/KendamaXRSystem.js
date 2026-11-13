/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * ============================================================================
 * Celestial Kendama - KendamaXRSystem (IWSDK ECS Frame Loop Bridge)
 * Role: Person A (The Hands)
 * ============================================================================
 *
 * Authoritative IWSDK ECS System owning the per-frame XR runtime callback.
 * Bridges IWSDK World.xrFrame, World.xrReferenceSpace, and World.input.xr
 * into Person A's GameLoop and Person B's GamePipeline.
 *
 * Guarantees:
 * - Exactly one pipeline update per frame.
 * - xrFrame and delta correspond to the same frame.
 * - Zero competing requestAnimationFrame loops.
 * - Seamless desktop fallback when running without an XR session.
 */

import { createSystem } from '@iwsdk/core';

export class KendamaXRSystem extends createSystem({}) {
  constructor(world = {}, queryManager, priority) {
    super(world || {}, queryManager, priority);
    this.gameLoop = null;
    this.pipeline = null;
    this.hand = 'right';
    this.updateCount = 0;
    this._xrContext = {
      frame: null,
      referenceSpace: null,
      inputSource: null,
      otherInputSource: null,
      hand: this.hand,
      world: this.world,
    };
  }

  init() {
    this.updateCount = 0;
  }

  setHand(hand) {
    this.hand = hand || 'right';
    this._xrContext.hand = this.hand;
    const loop = this.gameLoop || this.pipeline?.inputSystem?.gameLoop;
    if (loop && typeof loop.setXRContext === 'function') {
      loop.setXRContext({ hand: this.hand });
    }
  }

  setGameLoop(gameLoop) {
    this.gameLoop = gameLoop;
    if (this.gameLoop && this.world) {
      this.gameLoop.setXRContext({ world: this.world, hand: this.hand });
    }
  }

  setPipeline(pipeline) {
    this.pipeline = pipeline;
    if (!this.gameLoop && pipeline?.inputSystem?.gameLoop) {
      this.setGameLoop(pipeline.inputSystem.gameLoop);
    }
  }

  update(delta, time) {
    this.updateCount++;

    // 1. Obtain live WebXR objects from IWSDK World
    const xrFrame = this.world?.xrFrame
      ?? (this.world?.renderer?.xr?.getFrame ? this.world.renderer.xr.getFrame() : null);
    const refSpace = this.world?.xrReferenceSpace
      ?? (this.world?.renderer?.xr?.getReferenceSpace ? this.world.renderer.xr.getReferenceSpace() : null);
    const inputSource = this.world?.input?.xr?.getPrimaryInputSource?.(this.hand)
      ?? this.input?.xr?.getPrimaryInputSource?.(this.hand)
      ?? null;
    const otherHand = this.hand === 'right' ? 'left' : 'right';
    const otherInputSource = this.world?.input?.xr?.getPrimaryInputSource?.(otherHand)
      ?? this.input?.xr?.getPrimaryInputSource?.(otherHand)
      ?? null;

    this._xrContext.frame = xrFrame;
    this._xrContext.referenceSpace = refSpace;
    this._xrContext.inputSource = inputSource;
    this._xrContext.otherInputSource = otherInputSource;
    this._xrContext.hand = this.hand;
    this._xrContext.world = this.world;

    const xrContext = this._xrContext;

    // Ensure the latest context reaches GameLoop before input processing
    const loop = this.gameLoop || this.pipeline?.inputSystem?.gameLoop;
    if (loop && typeof loop.setXRContext === 'function') {
      loop.setXRContext(xrContext);
    }

    const timestampMs = Number.isFinite(time)
      ? time * 1000
      : (typeof performance !== 'undefined' ? performance.now() : 0);

    // 2. Dispatch frame update exactly once
    if (this.pipeline && typeof this.pipeline.tick === 'function') {
      this.pipeline.tick(timestampMs, xrContext, delta);
    } else if (loop && typeof loop.inputSystem?.update === 'function') {
      loop.inputSystem.update(delta, xrContext);
    }
  }

  destroy() {
    this.pipeline = null;
    this.gameLoop = null;
    if (Array.isArray(this.cleanupFuncs)) {
      this.cleanupFuncs.forEach((func) => {
        try { func(); } catch {}
      });
    }
  }
}

export default KendamaXRSystem;
