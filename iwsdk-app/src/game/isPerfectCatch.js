/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * Perfect catch = a CLEAN catch (agreed by B and C, Nov 17).
 * Single shared definition for Chapter 4 Roche visuals and mission code.
 *
 * @param {Object} [scoreEvent]
 * @returns {boolean}
 */
export function isPerfectCatch(scoreEvent) {
  return scoreEvent?.catchType === 'CLEAN';
}
