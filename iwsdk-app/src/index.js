/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { PanelSystem } from './panel.js';
import { RobotSystem } from './robot.js';
import { CupInspectionSystem } from './render/CupInspectionSystem.js';
import { initGame } from './main.js';

console.log('[DIAGNOSTIC] src/index.js starting World.create with level URL:', projectOptions.level);
World.create(document.getElementById('scene-container'), projectOptions).then((world) => {
    console.log('[DIAGNOSTIC] World.create resolved. Active level ID:', world.activeLevelId);
    world.registerSystem(RobotSystem);
    world.registerSystem(PanelSystem);
    world.registerSystem(CupInspectionSystem);

    // Initialize production Celestial Kendama pipeline & systems
    const game = initGame({ world });
    console.log('[DIAGNOSTIC] Celestial Kendama initGame booted successfully:', !!game);
}).catch((error) => {
    console.error('[DIAGNOSTIC] World.create failed with error:', error);
});
