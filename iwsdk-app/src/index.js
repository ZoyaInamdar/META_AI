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
import { initGame, gameplayKenGroup } from './main.js';
import { GameLoop } from './game/GameLoop.js';
import { HandPoseAdapter } from './input/HandPoseAdapter.js';
import { setupDebugScene } from './game/debugScene.js';
import { AudioSystem } from './audio/AudioSystem.js';

// Ensure hand tracking is requested in XR session features
if (!projectOptions.xr) {
    projectOptions.xr = { sessionMode: 'immersive-vr', offer: 'always', features: { handTracking: true } };
} else {
    if (!projectOptions.xr.features) {
        projectOptions.xr.features = {};
    }
    if (!projectOptions.xr.features.handTracking) {
        projectOptions.xr.features.handTracking = true;
    }
}

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
            const modeParam = params.get('mode');
            if (modeParam === 'gameplay') {
                startupMode = 'gameplay';
            } else if (modeParam === 'planet-showcase') {
                startupMode = 'planet-showcase';
            }
        }
        envSystem.setMode(startupMode);
        const liveOrrery = envSystem.ensureOrreryVisualSystem();
        if (typeof window !== 'undefined') {
            window.celestialEnvironment = envSystem;
            window.planetoidRenderer = envSystem.planetoidRenderer;
            window.celestialEvolution = envSystem.evolutionController;
            window.celestialTransformation = envSystem.transformationController;
            window.planetUnlockCelebration = envSystem.unlockCelebration;
            window.planetUnlockUI = envSystem.unlockUI;
            window.narrativeDirector = envSystem.narrativeDirector;
            window.orreryVisualSystem = liveOrrery;
            window.__ORRERY_SYSTEM__ = liveOrrery;
        }
        console.log(`[CelestialEnvironmentSystem] Started in "${startupMode}" mode`);
    }

    // Resolve launchHand: defaults to 'left' (off hand), overridable via ?launchHand=right|either in URL
    let launchHand = 'left';
    let targetOverride = null;
    let initialCupOverride = null;
    if (typeof window !== 'undefined' && window.location && typeof window.location.search === 'string') {
        const params = new URLSearchParams(window.location.search);
        const paramVal = params.get('launchHand');
        if (paramVal === 'right' || paramVal === 'either' || paramVal === 'left') {
            launchHand = paramVal;
        }
        if (params.has('debug')) {
            const t = params.get('target');
            if (t === 'big' || t === 'small' || t === 'base' || t === 'spike') {
                targetOverride = t;
            }
            const s = params.get('seatCup') || params.get('initialCup');
            if (s === 'big' || s === 'small' || s === 'base' || s === 'spike') {
                initialCupOverride = s;
            }
        }
    }

    // Person A: Instantiate real GameLoop with HandPoseAdapter and canonical gameplayKenGroup
    const inputSource = new HandPoseAdapter({ hand: 'right', gripSource: 'wrist' });
    const gameLoop = new GameLoop({
        gameplayKenGroup,
        inputSource,
        inputSourceType: 'hand',
        hand: 'right',
        gripSource: 'wrist',
        launchHand,
        targetOverride,
        initialCup: initialCupOverride || targetOverride || 'big',
    });

    // Initialize game pipeline and register KendamaXRSystem into IWSDK World
    const game = initGame({
        world,
        gameLoop,
        hand: 'right',
        gameplayKenGroup,
    });
    console.log('[DIAGNOSTIC] Celestial Kendama initGame booted successfully:', !!game);

    // Person C: AudioSystem initialization and first-interaction unlock
    const audioSystem = new AudioSystem(game.eventBus);
    audioSystem.init();
    gameLoop.setAudioSystem(audioSystem);

    if (typeof window !== 'undefined') {
        window.audioSystem = audioSystem;
        window.__AUDIO_SYSTEM__ = audioSystem;

        const unlockAudio = () => {
            audioSystem.unlock();
            window.removeEventListener('pointerdown', unlockAudio);
            window.removeEventListener('keydown', unlockAudio);
            window.removeEventListener('touchstart', unlockAudio);
        };
        window.addEventListener('pointerdown', unlockAudio, { once: true });
        window.addEventListener('keydown', unlockAudio, { once: true });
        window.addEventListener('touchstart', unlockAudio, { once: true });
    }

    // Add canonical gameplayKenGroup to world scene
    if (world.scene && game.gameplayKenGroup) {
        world.scene.add(game.gameplayKenGroup);
    }

    // Setup debug visuals and diagnostics (?debug URL parameter only)
    setupDebugScene({ world, game, gameLoop });
}).catch((error) => {
    console.error('[DIAGNOSTIC] World.create failed with error:', error);
});
