/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * Permanent, zero-dependency patch script for IWER simulator degrees-to-radians fix.
 * Automatically reapplies after `npm install` or `npm ci` via the `postinstall` hook.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const PATCHES = [
  {
    name: '@iwer/devui Hand UI',
    filePath: path.join(projectRoot, 'node_modules/@iwer/devui/lib/components/hand.js'),
    original: '_jsx(Vector3Input, { vector: handle.position, label: "Pos", marginBottom: Layout.gap }), _jsx(Vector3Input, { vector: handle.rotation, label: "Rot" })',
    patched: '_jsx(Vector3Input, { vector: handle.position, label: "Pos", marginBottom: Layout.gap }), _jsx(Vector3Input, { vector: handle.rotation, label: "Rot", multiplier: Math.PI / 180, precision: 1 })',
  },
  {
    name: '@iwsdk/vite-plugin-dev Injection Runtime Chunk',
    filePath: path.join(projectRoot, 'node_modules/@iwsdk/vite-plugin-dev/dist/injection/chunks/injection-template-0HSd4CcE.js'),
    original: 'u.jsx(Mr,{vector:n.position,label:"Pos",marginBottom:In}),u.jsx(Mr,{vector:n.rotation,label:"Rot"})',
    patched: 'u.jsx(Mr,{vector:n.position,label:"Pos",marginBottom:In}),u.jsx(Mr,{vector:n.rotation,label:"Rot",multiplier:Math.PI/180,precision:1})',
  },
];

function applyPatches() {
  console.log('[patch-simulator] Checking IWER simulator rotation patches...');
  let hasErrors = false;

  for (const { name, filePath, original, patched } of PATCHES) {
    const relativePath = path.relative(projectRoot, filePath);

    if (!fs.existsSync(filePath)) {
      console.error(`[patch-simulator] ERROR: Target file not found: ${relativePath}`);
      console.error(`[patch-simulator] Ensure dependencies are installed before running this patch.`);
      hasErrors = true;
      continue;
    }

    try {
      const content = fs.readFileSync(filePath, 'utf8');

      if (content.includes(patched)) {
        console.log(`[patch-simulator] [OK] Already patched (${name}): ${relativePath}`);
      } else if (content.includes(original)) {
        const updatedContent = content.replace(original, patched);
        fs.writeFileSync(filePath, updatedContent, 'utf8');
        console.log(`[patch-simulator] [APPLIED] Successfully patched (${name}): ${relativePath}`);
      } else {
        console.error(`[patch-simulator] ERROR: Neither original nor patched code pattern found in: ${relativePath}`);
        console.error(`[patch-simulator] Upstream dependency may have changed. Aborting to avoid corrupting file.`);
        hasErrors = true;
      }
    } catch (err) {
      console.error(`[patch-simulator] ERROR: Failed reading or writing ${relativePath}:`, err);
      hasErrors = true;
    }
  }

  if (hasErrors) {
    console.error('[patch-simulator] One or more patches failed.');
    process.exit(1);
  }

  console.log('[patch-simulator] All simulator rotation patches are in place.');
}

applyPatches();
