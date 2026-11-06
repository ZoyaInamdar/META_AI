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
import { PresetSelectorSystem } from './preset-selector.js';
import { CelestialEnvironmentSystem } from './render/CelestialEnvironment.js';

console.log('[DIAGNOSTIC] src/index.js starting World.create with level URL:', projectOptions.level);
World.create(document.getElementById('scene-container'), projectOptions).then((world) => {
    console.log('[DIAGNOSTIC] World.create resolved. Active level ID:', world.activeLevelId);
    world.registerSystem(RobotSystem);
    world.registerSystem(PanelSystem);
    world.registerSystem(CupInspectionSystem);
    world.registerSystem(PresetSelectorSystem);
    world.registerSystem(CelestialEnvironmentSystem);

    const envSystem = world.getSystem(CelestialEnvironmentSystem);
    if (envSystem) {
        let startupMode = 'showroom';
        if (typeof window !== 'undefined' && window.location?.search) {
            const params = new URLSearchParams(window.location.search);
            if (params.get('mode') === 'gameplay') {
                startupMode = 'gameplay';
            }
        }
        envSystem.setMode(startupMode);
        if (typeof window !== 'undefined') {
            window.celestialEnvironment = envSystem;
            window.planetoidRenderer = envSystem.planetoidRenderer;
        }
        console.log(`[CelestialEnvironmentSystem] Started in "${startupMode}" mode`);
    }
}).catch((error) => {
    console.error('[DIAGNOSTIC] World.create failed with error:', error);
});
