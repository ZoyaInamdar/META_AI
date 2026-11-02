/**
 * Celestial Kendama - Cup Inspection System
 * Role: Person C (Visuals & Rendering)
 *
 * Provides camera-facing inspection controls and gentle turntable auto-rotation
 * for visual validation of the procedural Big Cup geometry in IWSDK.
 *
 * Controls:
 * - [Space]: Toggle continuous turntable auto-rotation on / off
 * - [1]: Front / Three-Quarter perspective view
 * - [2]: Left / 90 degree side view
 * - [3]: Rear / 180 degree view (inspecting the outer bottom)
 * - [4]: Right / 270 degree side view
 */

import { createSystem } from '@iwsdk/core';
import { Box3, Frustum, Matrix4, Raycaster, Vector3 } from 'three';

export class CupInspectionSystem extends createSystem({}) {
    init() {
        this.cupPreviewNode = null;
        this.autoRotate = true;
        this.rotationSpeed = 0.35; // ~20 degrees per second for comfortable VR inspection

        console.log('[DIAGNOSTIC] CupInspectionSystem.init() invoked');
        const cupNode = this.world.getSceneObject('cup-preview');
        console.log('[DIAGNOSTIC] world.getSceneObject("cup-preview") returned:', !!cupNode, cupNode?.name);
        if (cupNode) {
            this.cupPreviewNode = cupNode;

            // 1. Hierarchy & Scene Attachment Verification
            let current = cupNode;
            let attachedToScene = false;
            const sceneHierarchy = [];
            while (current) {
                sceneHierarchy.push(`${current.name || current.type} (id: ${current.userData?.iwsdkSceneNodeId || 'none'})`);
                if (current === this.world.scene) {
                    attachedToScene = true;
                    break;
                }
                current = current.parent;
            }
            console.log('[DIAGNOSTIC] Attached to world.scene:', attachedToScene);
            console.log('[DIAGNOSTIC] Ancestor path to scene root:', sceneHierarchy.join(' -> '));

            // 2. Wire cloned directional light targets to the center cup
            const cavityLight = cupNode.getObjectByName('cavity-light');
            const underLight = cupNode.getObjectByName('under-light');
            const centerCupMesh = cupNode.getObjectByName('big-cup-three-quarter');
            if (cavityLight && centerCupMesh) {
                cavityLight.target = centerCupMesh;
                console.log('[DIAGNOSTIC] cavity-light target wired to cloned center cup');
            }
            if (underLight && centerCupMesh) {
                underLight.target = centerCupMesh;
                console.log('[DIAGNOSTIC] under-light target wired to cloned center cup');
            }

            // Ensure world matrices are fully updated
            cupNode.updateWorldMatrix(true, true);

            // =========================================================================
            // Temporary Diagnostic: Inspect Kendama Assembly Hierarchy and World Geometry
            // =========================================================================
            const assemblyNames = [
                'big-cup-three-quarter',
                'big-cup-cavity-view',
                'big-cup-profile-view',
            ];

            console.log('[DIAGNOSTIC] === Kendama Component Hierarchy & World-Space Inspection ===');

            for (const assemblyName of assemblyNames) {
                const assembly = cupNode.getObjectByName(assemblyName);
                const exists = !!assembly;
                console.log(`[DIAGNOSTIC] Assembly Group "${assemblyName}": exists = ${exists}`);

                if (assembly) {
                    const childNames = assembly.children.map((child) => child.name || child.type);
                    console.log(`[DIAGNOSTIC] Assembly "${assemblyName}" direct children (${childNames.length}):`, childNames);

                    // Update assembly world matrices
                    assembly.updateWorldMatrix(true, true);

                    // Inspect every direct component / child
                    for (const child of assembly.children) {
                        const childPos = new Vector3();
                        child.getWorldPosition(childPos);
                        const childBox = new Box3().setFromObject(child);
                        const vertexCount = child.geometry?.attributes?.position?.count ?? 'N/A (no geometry)';

                        console.log(`[DIAGNOSTIC]   Component "${child.name || child.type}":`, {
                            name: child.name,
                            visible: child.visible,
                            worldPosition: [
                                Number(childPos.x.toFixed(5)),
                                Number(childPos.y.toFixed(5)),
                                Number(childPos.z.toFixed(5)),
                            ],
                            worldBoundingBox: {
                                min: [
                                    Number(childBox.min.x.toFixed(5)),
                                    Number(childBox.min.y.toFixed(5)),
                                    Number(childBox.min.z.toFixed(5)),
                                ],
                                max: [
                                    Number(childBox.max.x.toFixed(5)),
                                    Number(childBox.max.y.toFixed(5)),
                                    Number(childBox.max.z.toFixed(5)),
                                ],
                            },
                            vertexCount,
                        });
                    }
                }
            }
            console.log('[DIAGNOSTIC] =============================================================');

            // 3. Camera Verification
            const camera = this.world.camera;
            let frustum = null;
            if (camera) {
                camera.updateMatrixWorld();
                frustum = new Frustum();
                const projScreenMatrix = new Matrix4();
                projScreenMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
                frustum.setFromProjectionMatrix(projScreenMatrix);
                console.log('[DIAGNOSTIC] Active camera verified:', {
                    isCamera: camera.isCamera,
                    position: [camera.position.x.toFixed(4), camera.position.y.toFixed(4), camera.position.z.toFixed(4)],
                    fov: camera.fov,
                    near: camera.near,
                    far: camera.far
                });
            }

            // 4. Material Shader Pre-Compilation & Renderer Readiness
            if (this.world.renderer && this.world.scene && camera) {
                try {
                    this.world.renderer.compile(this.world.scene, camera);
                    console.log('[DIAGNOSTIC] Material shaders compiled successfully via renderer.compile()');
                } catch (compileErr) {
                    console.error('[DIAGNOSTIC] Material shader compilation failed:', compileErr);
                }
            }

            // 5. Kendama Meshes & Materials Runtime Audit
            console.log('[DIAGNOSTIC] === Kendama Mesh & Material Runtime Audit ===');
            cupNode.traverse((child) => {
                if (child.isMesh) {
                    const mat = child.material;
                    child.onBeforeRender = () => {
                        if (!child.userData._hasLoggedRender) {
                            child.userData._hasLoggedRender = true;
                            console.log(`[RENDER-DIAGNOSTIC] Mesh "${child.name}" rendering with material "${mat?.name}" (cacheKey: ${mat?.customProgramCacheKey?.()})`);
                        }
                    };
                    console.log(`[DIAGNOSTIC] Mesh "${child.name}" in "${child.parent?.name}":`, {
                        materialName: mat?.name,
                        materialType: mat?.type,
                        hasOnBeforeCompile: typeof mat?.onBeforeCompile === 'function',
                        cacheKey: mat?.customProgramCacheKey?.(),
                        clearcoat: mat?.clearcoat,
                        iridescence: mat?.iridescence,
                    });
                }
            });

            // 6. Assembly Groups Inspection: Matrices, Bounding Boxes, Frustum
            const cupMeshNames = ['big-cup-three-quarter', 'big-cup-cavity-view', 'big-cup-profile-view'];
            for (const name of cupMeshNames) {
                const assemblyGroup = cupNode.getObjectByName(name);
                if (assemblyGroup) {
                    const worldPos = new Vector3();
                    assemblyGroup.getWorldPosition(worldPos);
                    const box = new Box3().setFromObject(assemblyGroup);
                    const inFrustum = frustum ? frustum.intersectsBox(box) : 'unknown (no camera)';

                    console.log(`[DIAGNOSTIC] Assembly "${name}":`, {
                        visible: assemblyGroup.visible,
                        worldPosition: [worldPos.x.toFixed(4), worldPos.y.toFixed(4), worldPos.z.toFixed(4)],
                        boundingBox: {
                            min: [box.min.x.toFixed(4), box.min.y.toFixed(4), box.min.z.toFixed(4)],
                            max: [box.max.x.toFixed(4), box.max.y.toFixed(4), box.max.z.toFixed(4)]
                        },
                        matrixWorldValid: !Number.isNaN(assemblyGroup.matrixWorld.elements[0]),
                        insideCameraFrustum: inFrustum
                    });
                } else {
                    console.warn(`[DIAGNOSTIC] Assembly "${name}" NOT found in cupNode!`);
                }
            }

            // 6. Occlusion / Plinth Height Check
            const plinth = this.world.scene.getObjectByName('Select Plinth') || this.world.scene.getObjectByName('select-plinth');
            if (plinth) {
                const plinthPos = new Vector3();
                plinth.getWorldPosition(plinthPos);
                // Exclude preview children so plinthBox computes the plinth's actual visible stone slab geometry
                const plinthBox = new Box3();
                for (const child of plinth.children) {
                    if (child !== cupNode && child.name !== 'cup-preview' && child.name !== 'big-cup-preview-root' && !child.name.endsWith('-preview-root')) {
                        plinthBox.expandByObject(child);
                    }
                }
                const centerBox = centerCupMesh ? new Box3().setFromObject(centerCupMesh) : null;
                const cupWorldY = centerCupMesh ? new Vector3().setFromMatrixPosition(centerCupMesh.matrixWorld).y : null;
                const cupsRestAbovePlinth = centerBox ? centerBox.min.y >= plinthBox.max.y - 0.001 : false;
                console.log('[DIAGNOSTIC] Plinth vs Cup height check:', {
                    plinthWorldY: plinthPos.y.toFixed(4),
                    plinthBoxTopY: plinthBox.max.y.toFixed(4),
                    cupCenterY: cupWorldY !== null ? cupWorldY.toFixed(4) : 'unknown',
                    cupBottomY: centerBox ? centerBox.min.y.toFixed(4) : 'unknown',
                    clearanceAbovePlinth: centerBox ? (centerBox.min.y - plinthBox.max.y).toFixed(4) : 'unknown',
                    cupsRestAbovePlinth
                });
            }

            // 7. Line-of-Sight Raycast Check
            if (camera && centerCupMesh) {
                const centerPos = new Vector3();
                centerCupMesh.getWorldPosition(centerPos);
                const raycaster = new Raycaster();
                const rayDir = new Vector3().subVectors(centerPos, camera.position).normalize();
                raycaster.set(camera.position, rayDir);
                const intersects = raycaster.intersectObjects(this.world.scene.children, true);
                const firstHit = intersects[0];
                let isCupHitDirectly = false;
                let cur = firstHit?.object;
                while (cur) {
                    if (cur === centerCupMesh || cur === cupNode) {
                        isCupHitDirectly = true;
                        break;
                    }
                    cur = cur.parent;
                }
                console.log('[DIAGNOSTIC] Camera line-of-sight raycast:', {
                    targetCup: 'big-cup-three-quarter',
                    firstHitObject: firstHit?.object?.name,
                    firstHitDistance: firstHit ? firstHit.distance.toFixed(4) : 'none',
                    isCupHitDirectly
                });
            }
        } else {
            console.warn('[DIAGNOSTIC] cup-preview node was NOT found in active level!');
        }

        // Keyboard navigation for desktop browser inspection
        this.handleKeyDown = (event) => {
            if (!this.cupPreviewNode) {
                this.cupPreviewNode = this.world.getSceneObject('cup-preview');
            }
            if (!this.cupPreviewNode) return;

            switch (event.code) {
                case 'Space':
                    this.autoRotate = !this.autoRotate;
                    break;
                case 'Digit1':
                case 'Numpad1':
                    this.autoRotate = false;
                    this.cupPreviewNode.rotation.y = 0;
                    break;
                case 'Digit2':
                case 'Numpad2':
                    this.autoRotate = false;
                    this.cupPreviewNode.rotation.y = Math.PI * 0.5;
                    break;
                case 'Digit3':
                case 'Numpad3':
                    this.autoRotate = false;
                    this.cupPreviewNode.rotation.y = Math.PI;
                    break;
                case 'Digit4':
                case 'Numpad4':
                    this.autoRotate = false;
                    this.cupPreviewNode.rotation.y = Math.PI * 1.5;
                    break;
                default:
                    break;
            }
        };

        if (typeof window !== 'undefined') {
            window.addEventListener('keydown', this.handleKeyDown);
            this.cleanupFuncs.push(() => {
                window.removeEventListener('keydown', this.handleKeyDown);
            });
        }
    }

    update(delta) {
        if (!this.cupPreviewNode) {
            this.cupPreviewNode = this.world.getSceneObject('cup-preview');
        }

        if (this.cupPreviewNode && this.autoRotate && delta > 0) {
            this.cupPreviewNode.rotation.y += this.rotationSpeed * delta;
        }
    }
}

export default CupInspectionSystem;
