/**
 * Celestial Kendama - Set 5: Porcelain Dreams Procedural Pattern Engine
 * Role: Person C (Visuals & Rendering)
 *
 * Implements an original procedural blue-and-white porcelain pattern generator using
 * Three.js and HTML5 2D Canvas (with headless fallback / recording for Node.js/Vitest).
 *
 * Visual Direction (High-Contrast, Prominent Porcelain Decor):
 * - Porcelain Ivory base: #F5F0E5
 * - Rich Cobalt Blue: #174A9C
 * - Royal Blue: #245EB8
 * - Deep Cobalt: #10366F
 * - Soft Blue Accent: #7896C7
 * - Saturated, bold, opaque ornamental motifs clearly recognizable from showroom viewing distance.
 * - Substantial motif sizing (2-3x larger) with balanced ivory negative space.
 */

import {
    CanvasTexture,
    RepeatWrapping,
    ClampToEdgeWrapping,
    LinearMipmapLinearFilter,
    LinearFilter,
    SRGBColorSpace,
} from 'three';

// --- Authoritative Porcelain Dreams Palette ---
export const PORCELAIN_PALETTE = Object.freeze({
    WARM_IVORY: '#F5F0E5',         // Base porcelain ivory ceramic
    RICH_COBALT: '#174A9C',        // Primary rich cobalt blue
    ROYAL_BLUE: '#245EB8',         // Vivid royal blue
    DEEP_COBALT: '#10366F',        // Deepest cobalt outline & shadow
    SOFT_BLUE: '#7896C7',          // Soft blue accent & petal highlights
    // Compatibility aliases:
    MUTED_BLUE: '#7896C7',
    DEEP_COBALT_SHADOW: '#10366F',
    GLAZE_HIGHLIGHT: '#FDFBF7',
});

/**
 * Creates a canvas element or a headless recording mock canvas for Node.js / Vitest.
 *
 * @param {number} width - Canvas width in pixels
 * @param {number} height - Canvas height in pixels
 * @returns {HTMLCanvasElement | object} Canvas instance or headless mock
 */
export function createPatternCanvas(width, height) {
    if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        return canvas;
    }

    if (typeof OffscreenCanvas !== 'undefined') {
        return new OffscreenCanvas(width, height);
    }

    // Headless / Node.js test environment mock context
    const calls = [];
    const contextMock = {
        canvas: null,
        fillStyle: PORCELAIN_PALETTE.WARM_IVORY,
        strokeStyle: PORCELAIN_PALETTE.RICH_COBALT,
        lineWidth: 1,
        lineCap: 'round',
        lineJoin: 'round',
        _calls: calls,
        beginPath: () => calls.push({ method: 'beginPath' }),
        moveTo: (x, y) => calls.push({ method: 'moveTo', x, y }),
        lineTo: (x, y) => calls.push({ method: 'lineTo', x, y }),
        bezierCurveTo: (cp1x, cp1y, cp2x, cp2y, x, y) =>
            calls.push({ method: 'bezierCurveTo', cp1x, cp1y, cp2x, cp2y, x, y }),
        quadraticCurveTo: (cpx, cpy, x, y) =>
            calls.push({ method: 'quadraticCurveTo', cpx, cpy, x, y }),
        arc: (x, y, r, sa, ea, ccw) =>
            calls.push({ method: 'arc', x, y, r, sa, ea, ccw }),
        closePath: () => calls.push({ method: 'closePath' }),
        stroke: () => calls.push({ method: 'stroke' }),
        fill: () => calls.push({ method: 'fill' }),
        fillRect: (x, y, w, h) => calls.push({ method: 'fillRect', x, y, w, h }),
        clearRect: (x, y, w, h) => calls.push({ method: 'clearRect', x, y, w, h }),
        save: () => calls.push({ method: 'save' }),
        restore: () => calls.push({ method: 'restore' }),
        translate: (x, y) => calls.push({ method: 'translate', x, y }),
        rotate: (angle) => calls.push({ method: 'rotate', angle }),
        scale: (sx, sy) => calls.push({ method: 'scale', sx, sy }),
        setLineDash: (dash) => calls.push({ method: 'setLineDash', dash }),
        createLinearGradient: () => ({
            addColorStop: () => {},
        }),
        createRadialGradient: () => ({
            addColorStop: () => {},
        }),
    };

    const canvasMock = {
        width,
        height,
        getContext: (type) => (type === '2d' ? contextMock : null),
        _isMockCanvas: true,
        _context: contextMock,
    };
    contextMock.canvas = canvasMock;

    return canvasMock;
}

/**
 * Draws a prominent, stylized blue-and-white porcelain flower medallion.
 *
 * @param {CanvasRenderingContext2D} ctx - 2D rendering context
 * @param {number} x - Center X coordinate
 * @param {number} y - Center Y coordinate
 * @param {number} radius - Outer petal radius in pixels
 * @param {object} [options={}] - Customization options
 */
export function drawFlower(ctx, x, y, radius, options = {}) {
    const {
        petals = 8,
        rotation = 0,
        cobaltColor = PORCELAIN_PALETTE.RICH_COBALT,
        royalColor = PORCELAIN_PALETTE.ROYAL_BLUE,
        deepColor = PORCELAIN_PALETTE.DEEP_COBALT,
        accentColor = PORCELAIN_PALETTE.SOFT_BLUE,
        ivoryColor = PORCELAIN_PALETTE.WARM_IVORY,
        innerLayers = 2,
        centerRadius = radius * 0.25,
    } = options;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);

    const angleStep = (Math.PI * 2) / petals;

    // 1. Outer Layer of Bold Cobalt Petals
    for (let i = 0; i < petals; i++) {
        const angle = i * angleStep;
        ctx.save();
        ctx.rotate(angle);

        ctx.beginPath();
        ctx.moveTo(0, 0);

        const ctrlDist = radius * 0.68;
        const halfSpread = radius * 0.36;

        // Graceful pointed petal contour
        ctx.bezierCurveTo(-halfSpread, ctrlDist * 0.45, -halfSpread * 0.75, radius * 0.95, 0, radius);
        ctx.bezierCurveTo(halfSpread * 0.75, radius * 0.95, halfSpread, ctrlDist * 0.45, 0, 0);

        ctx.fillStyle = cobaltColor;
        ctx.fill();

        ctx.lineWidth = Math.max(2.0, radius * 0.055);
        ctx.strokeStyle = deepColor;
        ctx.stroke();

        // Prominent interior petal vein
        ctx.beginPath();
        ctx.moveTo(0, radius * 0.22);
        ctx.lineTo(0, radius * 0.88);
        ctx.strokeStyle = accentColor;
        ctx.lineWidth = Math.max(1.5, radius * 0.038);
        ctx.stroke();

        ctx.restore();
    }

    // 2. Secondary Inner Layer of Royal Blue Petals
    if (innerLayers >= 2) {
        const innerRadius = radius * 0.65;
        const offsetAngle = angleStep * 0.5;

        for (let i = 0; i < petals; i++) {
            const angle = i * angleStep + offsetAngle;
            ctx.save();
            ctx.rotate(angle);

            ctx.beginPath();
            ctx.moveTo(0, 0);

            const ctrlDist = innerRadius * 0.62;
            const halfSpread = innerRadius * 0.34;

            ctx.bezierCurveTo(-halfSpread, ctrlDist * 0.45, -halfSpread * 0.7, innerRadius * 0.93, 0, innerRadius);
            ctx.bezierCurveTo(halfSpread * 0.7, innerRadius * 0.93, halfSpread, ctrlDist * 0.45, 0, 0);

            ctx.fillStyle = royalColor;
            ctx.fill();

            ctx.lineWidth = Math.max(1.6, innerRadius * 0.05);
            ctx.strokeStyle = deepColor;
            ctx.stroke();

            // Ivory spine line
            ctx.beginPath();
            ctx.moveTo(0, innerRadius * 0.20);
            ctx.lineTo(0, innerRadius * 0.80);
            ctx.strokeStyle = ivoryColor;
            ctx.lineWidth = Math.max(1.2, innerRadius * 0.035);
            ctx.stroke();

            ctx.restore();
        }
    }

    // 3. Substantial Multi-Ring Core & Stamen Medallion
    ctx.beginPath();
    ctx.arc(0, 0, centerRadius, 0, Math.PI * 2);
    ctx.fillStyle = deepColor;
    ctx.fill();
    ctx.lineWidth = Math.max(2.0, centerRadius * 0.16);
    ctx.strokeStyle = royalColor;
    ctx.stroke();

    // Secondary inner ring
    ctx.beginPath();
    ctx.arc(0, 0, centerRadius * 0.65, 0, Math.PI * 2);
    ctx.fillStyle = royalColor;
    ctx.fill();

    // Central ivory core pip
    ctx.beginPath();
    ctx.arc(0, 0, centerRadius * 0.38, 0, Math.PI * 2);
    ctx.fillStyle = ivoryColor;
    ctx.fill();

    // Radiating stamen dots around core
    const numDots = Math.min(petals * 2, 16);
    const dotOrbit = centerRadius * 0.82;
    for (let d = 0; d < numDots; d++) {
        const dotAngle = (d / numDots) * Math.PI * 2;
        const dx = Math.cos(dotAngle) * dotOrbit;
        const dy = Math.sin(dotAngle) * dotOrbit;

        ctx.beginPath();
        ctx.arc(dx, dy, Math.max(1.8, centerRadius * 0.14), 0, Math.PI * 2);
        ctx.fillStyle = ivoryColor;
        ctx.fill();
    }

    ctx.restore();
}

/**
 * Draws an elegant, substantial porcelain leaf motif.
 *
 * @param {CanvasRenderingContext2D} ctx - 2D rendering context
 * @param {number} x - Attachment point X
 * @param {number} y - Attachment point Y
 * @param {number} length - Leaf length in pixels
 * @param {number} width - Leaf half-width in pixels
 * @param {number} angle - Direction angle in radians
 * @param {object} [options={}] - Customization options
 */
export function drawLeaf(ctx, x, y, length, width, angle, options = {}) {
    const {
        curvature = 0.25,
        cobaltColor = PORCELAIN_PALETTE.RICH_COBALT,
        royalColor = PORCELAIN_PALETTE.ROYAL_BLUE,
        deepColor = PORCELAIN_PALETTE.DEEP_COBALT,
        accentColor = PORCELAIN_PALETTE.SOFT_BLUE,
        veinCount = 4,
    } = options;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    ctx.beginPath();
    ctx.moveTo(0, 0);

    const tipX = length;
    const tipY = length * curvature;

    // Left curved lobe
    ctx.bezierCurveTo(
        length * 0.35, -width,
        length * 0.75, -width * 0.85 + tipY * 0.5,
        tipX, tipY
    );

    // Right curved lobe back to origin
    ctx.bezierCurveTo(
        length * 0.72, width * 0.75 + tipY * 0.5,
        length * 0.30, width * 0.95,
        0, 0
    );

    ctx.fillStyle = royalColor;
    ctx.fill();

    ctx.lineWidth = Math.max(2.2, width * 0.16);
    ctx.strokeStyle = deepColor;
    ctx.stroke();

    // Central leaf spine
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(length * 0.5, tipY * 0.5, tipX * 0.94, tipY * 0.94);
    ctx.lineWidth = Math.max(1.8, width * 0.14);
    ctx.strokeStyle = deepColor;
    ctx.stroke();

    // Lateral ribs
    for (let v = 1; v <= veinCount; v++) {
        const t = v / (veinCount + 1);
        const vx = length * t;
        const vy = length * curvature * (t * t);

        // Left vein
        ctx.beginPath();
        ctx.moveTo(vx, vy);
        ctx.lineTo(vx + width * 0.38, vy - width * 0.60);
        ctx.lineWidth = Math.max(1.2, width * 0.08);
        ctx.strokeStyle = accentColor;
        ctx.stroke();

        // Right vein
        ctx.beginPath();
        ctx.moveTo(vx, vy);
        ctx.lineTo(vx + width * 0.32, vy + width * 0.55);
        ctx.stroke();
    }

    ctx.restore();
}

/**
 * Draws a flowing calligraphic vine between two points with branching tendrils.
 *
 * @param {CanvasRenderingContext2D} ctx - 2D rendering context
 * @param {number} startX - Start X
 * @param {number} startY - Start Y
 * @param {number} endX - End X
 * @param {number} endY - End Y
 * @param {Array<{x: number, y: number}>} controlPoints - Intermediate control points
 * @param {object} [options={}] - Customization options
 */
export function drawCurvingVine(ctx, startX, startY, endX, endY, controlPoints = [], options = {}) {
    const {
        lineWidth = 5.0,
        color = PORCELAIN_PALETTE.RICH_COBALT,
        deepColor = PORCELAIN_PALETTE.DEEP_COBALT,
        withTendrils = true,
    } = options;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(startX, startY);

    if (controlPoints.length === 1) {
        ctx.quadraticCurveTo(controlPoints[0].x, controlPoints[0].y, endX, endY);
    } else if (controlPoints.length >= 2) {
        ctx.bezierCurveTo(
            controlPoints[0].x, controlPoints[0].y,
            controlPoints[1].x, controlPoints[1].y,
            endX, endY
        );
    } else {
        ctx.lineTo(endX, endY);
    }

    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = color;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();

    // Branching filigree tendrils along the curve
    if (withTendrils && controlPoints.length >= 1) {
        for (let i = 0; i < controlPoints.length; i++) {
            const cp = controlPoints[i];
            const tendrilRadius = lineWidth * 5.0;
            const sign = (i % 2 === 0) ? 1 : -1;

            drawDecorativeCurl(ctx, cp.x, cp.y, tendrilRadius, 0, Math.PI * 1.35, {
                direction: sign,
                color: deepColor,
                lineWidth: lineWidth * 0.65,
            });
        }
    }

    ctx.restore();
}

/**
 * Draws an authentic porcelain filigree curl / rinceau spiral flourish.
 *
 * @param {CanvasRenderingContext2D} ctx - 2D rendering context
 * @param {number} x - Center X
 * @param {number} y - Center Y
 * @param {number} radius - Spiral outer radius in pixels
 * @param {number} [startAngle=0] - Initial angle in radians
 * @param {number} [sweep=Math.PI*1.5] - Total angular sweep in radians
 * @param {object} [options={}] - Customization options
 */
export function drawDecorativeCurl(ctx, x, y, radius, startAngle = 0, sweep = Math.PI * 1.5, options = {}) {
    const {
        direction = 1,
        color = PORCELAIN_PALETTE.RICH_COBALT,
        lineWidth = 3.2,
        steps = 28,
    } = options;

    ctx.save();
    ctx.beginPath();

    for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const currentAngle = startAngle + direction * sweep * t;
        const currentR = radius * (1.0 - t * 0.65);

        const px = x + Math.cos(currentAngle) * currentR;
        const py = y + Math.sin(currentAngle) * currentR;

        if (s === 0) {
            ctx.moveTo(px, py);
        } else {
            ctx.lineTo(px, py);
        }
    }

    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';
    ctx.stroke();

    ctx.restore();
}

/**
 * Draws a seamless horizontally repeating geometric border band.
 * Guaranteed to repeat seamlessly across the canvas width (u = 0 meets u = 1).
 *
 * @param {CanvasRenderingContext2D} ctx - 2D rendering context
 * @param {number} y - Top Y coordinate of border band
 * @param {number} width - Total canvas width in pixels
 * @param {number} height - Border band height in pixels
 * @param {object} [options={}] - Customization options
 */
export function drawGeometricBorder(ctx, y, width, height, options = {}) {
    const {
        patternType = 'meander',
        repeatCount = 12,
        cobaltColor = PORCELAIN_PALETTE.RICH_COBALT,
        royalColor = PORCELAIN_PALETTE.ROYAL_BLUE,
        deepColor = PORCELAIN_PALETTE.DEEP_COBALT,
        accentColor = PORCELAIN_PALETTE.SOFT_BLUE,
        ivoryColor = PORCELAIN_PALETTE.WARM_IVORY,
    } = options;

    ctx.save();

    // Bold guard lines (top and bottom)
    const guardLineWidth = Math.max(2.5, height * 0.08);
    ctx.lineWidth = guardLineWidth;
    ctx.strokeStyle = deepColor;

    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.moveTo(0, y + height);
    ctx.lineTo(width, y + height);
    ctx.stroke();

    const cellWidth = width / repeatCount;
    const innerTop = y + guardLineWidth * 1.5;
    const innerBottom = y + height - guardLineWidth * 1.5;
    const innerHeight = innerBottom - innerTop;

    for (let i = 0; i < repeatCount; i++) {
        const x0 = i * cellWidth;
        const x1 = x0 + cellWidth;
        const xm = x0 + cellWidth * 0.5;

        if (patternType === 'meander') {
            // Traditional bold Greek key / fretwork interlock
            const padX = cellWidth * 0.12;
            const padY = innerHeight * 0.12;

            ctx.beginPath();
            ctx.moveTo(x0 + padX, innerBottom - padY);
            ctx.lineTo(x0 + padX, innerTop + padY);
            ctx.lineTo(x1 - padX, innerTop + padY);
            ctx.lineTo(x1 - padX, innerBottom - padY * 2);
            ctx.lineTo(xm, innerBottom - padY * 2);
            ctx.lineTo(xm, innerTop + padY * 2.2);

            ctx.lineWidth = Math.max(2.2, height * 0.07);
            ctx.strokeStyle = cobaltColor;
            ctx.stroke();
        } else if (patternType === 'lotus-petal') {
            // Scalloped lotus petal arches with royal blue fill & cobalt tip
            ctx.beginPath();
            ctx.moveTo(x0, innerBottom);
            ctx.quadraticCurveTo(xm, innerTop, x1, innerBottom);
            ctx.closePath();

            ctx.fillStyle = royalColor;
            ctx.fill();
            ctx.lineWidth = Math.max(2.0, height * 0.065);
            ctx.strokeStyle = deepColor;
            ctx.stroke();

            // Inner petal vein
            ctx.beginPath();
            ctx.moveTo(xm, innerTop + innerHeight * 0.08);
            ctx.lineTo(xm, innerBottom);
            ctx.strokeStyle = accentColor;
            ctx.lineWidth = Math.max(1.5, height * 0.04);
            ctx.stroke();
        } else if (patternType === 'ruyi-cloud') {
            // Three-lobed Ruyi cloud collar head
            ctx.beginPath();
            ctx.arc(xm, innerTop + innerHeight * 0.45, cellWidth * 0.24, Math.PI, 0, false);
            ctx.arc(x1 - cellWidth * 0.14, innerBottom - innerHeight * 0.22, cellWidth * 0.15, Math.PI * 1.2, Math.PI * 0.2, false);
            ctx.arc(x0 + cellWidth * 0.14, innerBottom - innerHeight * 0.22, cellWidth * 0.15, Math.PI * 0.8, Math.PI * 1.8, false);

            ctx.fillStyle = cobaltColor;
            ctx.fill();
            ctx.strokeStyle = deepColor;
            ctx.lineWidth = Math.max(2.0, height * 0.06);
            ctx.stroke();

            // Center ivory dot
            ctx.beginPath();
            ctx.arc(xm, innerTop + innerHeight * 0.45, Math.max(2.0, cellWidth * 0.08), 0, Math.PI * 2);
            ctx.fillStyle = ivoryColor;
            ctx.fill();
        } else {
            // 'diamond-chain' interlaced lozenges
            ctx.beginPath();
            ctx.moveTo(x0, innerTop + innerHeight * 0.5);
            ctx.lineTo(xm, innerTop);
            ctx.lineTo(x1, innerTop + innerHeight * 0.5);
            ctx.lineTo(xm, innerBottom);
            ctx.closePath();

            ctx.fillStyle = royalColor;
            ctx.fill();
            ctx.strokeStyle = deepColor;
            ctx.lineWidth = Math.max(2.0, height * 0.065);
            ctx.stroke();

            // Inner diamond in rich cobalt
            ctx.beginPath();
            ctx.moveTo(xm - cellWidth * 0.16, innerTop + innerHeight * 0.5);
            ctx.lineTo(xm, innerTop + innerHeight * 0.28);
            ctx.lineTo(xm + cellWidth * 0.16, innerTop + innerHeight * 0.5);
            ctx.lineTo(xm, innerBottom - innerHeight * 0.28);
            ctx.closePath();
            ctx.fillStyle = cobaltColor;
            ctx.fill();
        }
    }

    ctx.restore();
}

/**
 * Draws miniature ornamental porcelain flourishes (florets, teardrops, trefoils, pips).
 *
 * @param {CanvasRenderingContext2D} ctx - 2D rendering context
 * @param {number} x - Center X
 * @param {number} y - Center Y
 * @param {number} size - Motif radius in pixels
 * @param {string} [type='floret'] - Motif type ('floret', 'teardrop', 'trefoil', 'cloud-pip')
 * @param {object} [options={}] - Customization options
 */
export function drawOrnamentalDetail(ctx, x, y, size, type = 'floret', options = {}) {
    const {
        color = PORCELAIN_PALETTE.RICH_COBALT,
        accentColor = PORCELAIN_PALETTE.ROYAL_BLUE,
        deepColor = PORCELAIN_PALETTE.DEEP_COBALT,
    } = options;

    ctx.save();
    ctx.translate(x, y);

    if (type === 'floret') {
        const dotR = Math.max(2.2, size * 0.32);
        const orbit = size * 0.68;

        for (let i = 0; i < 4; i++) {
            const angle = (i * Math.PI) / 2;
            ctx.beginPath();
            ctx.arc(Math.cos(angle) * orbit, Math.sin(angle) * orbit, dotR, 0, Math.PI * 2);
            ctx.fillStyle = color;
            ctx.fill();
            ctx.strokeStyle = deepColor;
            ctx.lineWidth = 1.0;
            ctx.stroke();
        }

        // Center accent pip
        ctx.beginPath();
        ctx.arc(0, 0, Math.max(1.5, dotR * 0.8), 0, Math.PI * 2);
        ctx.fillStyle = accentColor;
        ctx.fill();
    } else if (type === 'teardrop') {
        ctx.beginPath();
        ctx.moveTo(0, -size);
        ctx.bezierCurveTo(size * 0.65, -size * 0.2, size * 0.65, size * 0.8, 0, size);
        ctx.bezierCurveTo(-size * 0.65, size * 0.8, -size * 0.65, -size * 0.2, 0, -size);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = deepColor;
        ctx.lineWidth = 1.2;
        ctx.stroke();
    } else if (type === 'trefoil') {
        const leafR = size * 0.45;
        const orbit = size * 0.48;
        for (let i = 0; i < 3; i++) {
            const angle = (i * Math.PI * 2) / 3 - Math.PI / 2;
            ctx.beginPath();
            ctx.arc(Math.cos(angle) * orbit, Math.sin(angle) * orbit, leafR, 0, Math.PI * 2);
            ctx.fillStyle = color;
            ctx.fill();
            ctx.strokeStyle = deepColor;
            ctx.lineWidth = 1.0;
            ctx.stroke();
        }
    } else {
        // 'cloud-pip' clustered triad of dots
        const r = Math.max(2.0, size * 0.35);
        ctx.beginPath();
        ctx.arc(0, -size * 0.38, r, 0, Math.PI * 2);
        ctx.arc(-size * 0.38, size * 0.38, r, 0, Math.PI * 2);
        ctx.arc(size * 0.38, size * 0.38, r, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
    }

    ctx.restore();
}

// -----------------------------------------------------------------------------
// Component-Specific Texture Generators
// -----------------------------------------------------------------------------

/**
 * Creates the procedural CanvasTexture for the Porcelain Tama (ball).
 * Features prominent, large cobalt floral medallions and seamless wrapping foliage.
 *
 * @param {object} [options={}] - Customization options
 * @returns {CanvasTexture} High-resolution procedural porcelain texture
 */
export function createPorcelainTamaTexture(options = {}) {
    const width = options.width ?? 1024;
    const height = options.height ?? 512;

    const canvas = createPatternCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // 1. Fill base warm porcelain ivory
    ctx.fillStyle = PORCELAIN_PALETTE.WARM_IVORY;
    ctx.fillRect(0, 0, width, height);

    // 2. Upper North Pole collar (lotus petal scallop border: Y ~ 10 to 60)
    drawGeometricBorder(ctx, 12, width, 50, {
        patternType: 'lotus-petal',
        repeatCount: 12,
    });

    // 3. Lower Hemisphere border (framing above bore opening: Y ~ 430 to 485)
    drawGeometricBorder(ctx, height - 64, width, 52, {
        patternType: 'meander',
        repeatCount: 12,
    });

    // 4. Prominent Equatorial Floral Medallions:
    // 2 large primary medallions (radius 105px) + 2 flank medallions (radius 78px)
    const midY = height * 0.50;
    const numMedallions = 4;
    const spacing = width / numMedallions;

    for (let m = 0; m < numMedallions; m++) {
        const cx = m * spacing + spacing * 0.5;
        const isPrimary = (m % 2 === 0);
        const radius = isPrimary ? 105 : 78;

        // Main floral blossom medallion
        drawFlower(ctx, cx, midY, radius, {
            petals: 8,
            rotation: m * 0.4,
            innerLayers: 2,
        });

        // Foliage acanthus leaves radiating from medallion
        const leafLen = isPrimary ? 62 : 46;
        const leafW = isPrimary ? 22 : 16;
        drawLeaf(ctx, cx - radius * 0.75, midY - radius * 0.55, leafLen, leafW, -Math.PI * 0.35);
        drawLeaf(ctx, cx + radius * 0.75, midY - radius * 0.55, leafLen, leafW, -Math.PI * 0.65);
        drawLeaf(ctx, cx - radius * 0.75, midY + radius * 0.55, leafLen, leafW, Math.PI * 0.35);
        drawLeaf(ctx, cx + radius * 0.75, midY + radius * 0.55, leafLen, leafW, Math.PI * 0.65);

        // Filigree cloud curls flanking each medallion
        const curlR = isPrimary ? 34 : 26;
        drawDecorativeCurl(ctx, cx - radius - 16, midY, curlR, 0, Math.PI * 1.5, { direction: 1 });
        drawDecorativeCurl(ctx, cx + radius + 16, midY, curlR, Math.PI, Math.PI * 1.5, { direction: -1 });

        // Accent trefoils & florets
        drawOrnamentalDetail(ctx, cx, midY - radius - 24, 18, 'trefoil');
        drawOrnamentalDetail(ctx, cx, midY + radius + 24, 18, 'trefoil');
    }

    // 5. Connecting undulating sinusoidal vine across entire width (seamless loop)
    for (let m = 0; m < numMedallions; m++) {
        const x0 = m * spacing + spacing * 0.5;
        const targetX1 = (m === numMedallions - 1) ? x0 + spacing : (m + 1) * spacing + spacing * 0.5;

        const waveAmp = 55;
        const cp1x = x0 + spacing * 0.33;
        const cp1y = midY + ((m % 2 === 0) ? waveAmp : -waveAmp);
        const cp2x = x0 + spacing * 0.67;
        const cp2y = midY + ((m % 2 === 0) ? -waveAmp : waveAmp);

        drawCurvingVine(ctx, x0 + 75, midY, targetX1 - 75, midY, [
            { x: cp1x, y: cp1y },
            { x: cp2x, y: cp2y },
        ], {
            lineWidth: 5.5,
            withTendrils: true,
        });

        // Bold leaf pairs along the connecting vine
        drawLeaf(ctx, cp1x, cp1y, 44, 15, (m % 2 === 0) ? 0.55 : -0.55);
        drawLeaf(ctx, cp2x, cp2y, 44, 15, (m % 2 === 0) ? -0.55 : 0.55);

        // Gap florets
        drawOrnamentalDetail(ctx, (x0 + targetX1) * 0.5, midY + ((m % 2 === 0) ? -waveAmp * 0.8 : waveAmp * 0.8), 16, 'floret');
    }

    const texture = new CanvasTexture(canvas);
    texture.name = 'tex-porcelain-tama';
    texture.wrapS = RepeatWrapping;
    texture.wrapT = ClampToEdgeWrapping;
    texture.generateMipmaps = true;
    texture.minFilter = LinearMipmapLinearFilter;
    texture.magFilter = LinearFilter;
    texture.colorSpace = SRGBColorSpace;
    texture.needsUpdate = true;

    return texture;
}

/**
 * Creates the procedural CanvasTexture for a Ken Cup component.
 * Features prominent rim border, large body floral motifs, and flared mount collar.
 *
 * @param {'big' | 'small' | 'base'} cupType - Type of cup
 * @param {object} [options={}] - Customization options
 * @returns {CanvasTexture} High-resolution procedural cup texture
 */
export function createPorcelainCupTexture(cupType = 'big', options = {}) {
    const width = options.width ?? 512;
    const height = options.height ?? 256;

    const canvas = createPatternCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // 1. Warm porcelain ivory base
    ctx.fillStyle = PORCELAIN_PALETTE.WARM_IVORY;
    ctx.fillRect(0, 0, width, height);

    // 2. Prominent Lip / Rim border at upper cup edge (Y ~ 8 to 56)
    drawGeometricBorder(ctx, 8, width, 46, {
        patternType: cupType === 'base' ? 'ruyi-cloud' : 'meander',
        repeatCount: 8,
    });

    // 3. Encircling Floral Vine around cup body
    const numMotifs = (cupType === 'small') ? 2 : 3;
    const spacing = width / numMotifs;
    const midY = height * 0.56;
    const flowerRadius = (cupType === 'big') ? 50 : (cupType === 'base' ? 45 : 42);

    for (let m = 0; m < numMotifs; m++) {
        const cx = m * spacing + spacing * 0.5;

        drawFlower(ctx, cx, midY, flowerRadius, {
            petals: 8,
            innerLayers: 2,
            rotation: m * 0.6,
        });

        // Large flanking acanthus leaves
        drawLeaf(ctx, cx - flowerRadius * 0.8, midY - 24, 44, 15, -Math.PI * 0.35);
        drawLeaf(ctx, cx + flowerRadius * 0.8, midY + 24, 44, 15, Math.PI * 0.65);

        // Filigree cloud curls
        drawDecorativeCurl(ctx, cx - flowerRadius - 20, midY, 24, 0, Math.PI * 1.4, { direction: 1 });
        drawDecorativeCurl(ctx, cx + flowerRadius + 20, midY, 24, Math.PI, Math.PI * 1.4, { direction: -1 });

        // Ornamental gap florets
        drawOrnamentalDetail(ctx, cx, midY - flowerRadius - 16, 14, 'floret');
    }

    // Bold connecting horizontal vine
    for (let m = 0; m < numMotifs; m++) {
        const x0 = m * spacing + spacing * 0.5;
        const targetX1 = (m === numMotifs - 1) ? x0 + spacing : (m + 1) * spacing + spacing * 0.5;

        drawCurvingVine(ctx, x0 + flowerRadius * 0.9, midY, targetX1 - flowerRadius * 0.9, midY, [
            { x: x0 + spacing * 0.5, y: midY + ((m % 2 === 0) ? 22 : -22) },
        ], {
            lineWidth: 4.5,
            withTendrils: true,
        });
    }

    // 4. Lower mount border band
    drawGeometricBorder(ctx, height - 48, width, 40, {
        patternType: 'lotus-petal',
        repeatCount: 8,
    });

    const texture = new CanvasTexture(canvas);
    texture.name = `tex-porcelain-cup-${cupType}`;
    texture.wrapS = RepeatWrapping;
    texture.wrapT = ClampToEdgeWrapping;
    texture.generateMipmaps = true;
    texture.minFilter = LinearMipmapLinearFilter;
    texture.magFilter = LinearFilter;
    texture.colorSpace = SRGBColorSpace;
    texture.needsUpdate = true;

    return texture;
}

/**
 * Creates the procedural CanvasTexture for the Ken Handle (stem).
 * Features prominent lower grip fretwork, twin climbing vertical vines, and upper neck collar.
 *
 * @param {object} [options={}] - Customization options
 * @returns {CanvasTexture} High-resolution procedural handle texture
 */
export function createPorcelainHandleTexture(options = {}) {
    const width = options.width ?? 512;
    const height = options.height ?? 512;

    const canvas = createPatternCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // 1. Warm porcelain ivory base
    ctx.fillStyle = PORCELAIN_PALETTE.WARM_IVORY;
    ctx.fillRect(0, 0, width, height);

    // 2. Lower grip fretwork (near base cup: Y ~ 15 to 75)
    drawGeometricBorder(ctx, 16, width, 56, {
        patternType: 'meander',
        repeatCount: 6,
    });

    // 3. Central handle stem: 2 vertical climbing vines curling upward
    const numVines = 2;
    const vineSpacing = width / numVines;

    for (let v = 0; v < numVines; v++) {
        const vx = v * vineSpacing + vineSpacing * 0.5;

        // Climbing S-curve stem from Y = 85 to Y = 430
        drawCurvingVine(ctx, vx, 85, vx, 430, [
            { x: vx - 50, y: 165 },
            { x: vx + 50, y: 265 },
            { x: vx - 40, y: 365 },
        ], {
            lineWidth: 5.5,
            withTendrils: true,
        });

        // Substantial floral blossoms along vertical climb
        drawFlower(ctx, vx - 36, 165, 36, { petals: 6, innerLayers: 2 });
        drawFlower(ctx, vx + 36, 265, 40, { petals: 8, innerLayers: 2 });
        drawFlower(ctx, vx - 30, 365, 34, { petals: 6, innerLayers: 2 });

        // Large acanthus foliage leaves
        drawLeaf(ctx, vx, 115, 46, 16, -Math.PI * 0.32);
        drawLeaf(ctx, vx, 215, 46, 16, Math.PI * 0.32);
        drawLeaf(ctx, vx, 315, 46, 16, -Math.PI * 0.32);
        drawLeaf(ctx, vx, 405, 40, 14, Math.PI * 0.32);

        // Gap fillers
        drawOrnamentalDetail(ctx, vx + 60, 165, 14, 'floret');
        drawOrnamentalDetail(ctx, vx - 60, 265, 14, 'floret');
    }

    // 4. Upper neck collar (near sarado junction: Y ~ 445 to 495)
    drawGeometricBorder(ctx, height - 58, width, 50, {
        patternType: 'lotus-petal',
        repeatCount: 6,
    });

    const texture = new CanvasTexture(canvas);
    texture.name = 'tex-porcelain-handle';
    texture.wrapS = RepeatWrapping;
    texture.wrapT = ClampToEdgeWrapping;
    texture.generateMipmaps = true;
    texture.minFilter = LinearMipmapLinearFilter;
    texture.magFilter = LinearFilter;
    texture.colorSpace = SRGBColorSpace;
    texture.needsUpdate = true;

    return texture;
}

/**
 * Creates the procedural CanvasTexture for the Ken Crossbar (Sarado).
 * Features a grand center medallion and rich wing vines.
 *
 * @param {object} [options={}] - Customization options
 * @returns {CanvasTexture} High-resolution procedural crossbar texture
 */
export function createPorcelainCrossbarTexture(options = {}) {
    const width = options.width ?? 512;
    const height = options.height ?? 256;

    const canvas = createPatternCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // 1. Warm porcelain ivory base
    ctx.fillStyle = PORCELAIN_PALETTE.WARM_IVORY;
    ctx.fillRect(0, 0, width, height);

    const midX = width * 0.5;
    const midY = height * 0.5;

    // 2. Central junction floral medallion (grand center)
    drawFlower(ctx, midX, midY, 56, {
        petals: 8,
        innerLayers: 2,
    });

    // Flanking symmetrical scrollwork around center
    drawDecorativeCurl(ctx, midX - 85, midY, 36, 0, Math.PI * 1.5, { direction: 1 });
    drawDecorativeCurl(ctx, midX + 85, midY, 36, Math.PI, Math.PI * 1.5, { direction: -1 });

    // 3. Left wing vine (-X towards Small Cup)
    drawCurvingVine(ctx, midX - 90, midY, 55, midY, [
        { x: midX - 145, y: midY - 36 },
        { x: midX - 200, y: midY + 36 },
    ], {
        lineWidth: 5.0,
        withTendrils: true,
    });
    drawFlower(ctx, midX - 165, midY - 22, 34, { petals: 6, innerLayers: 1 });
    drawLeaf(ctx, midX - 120, midY + 24, 42, 14, Math.PI * 0.75);
    drawLeaf(ctx, midX - 205, midY - 20, 38, 13, -Math.PI * 0.75);

    // 4. Right wing vine (+X towards Big Cup)
    drawCurvingVine(ctx, midX + 90, midY, width - 55, midY, [
        { x: midX + 145, y: midY + 36 },
        { x: midX + 200, y: midY - 36 },
    ], {
        lineWidth: 5.0,
        withTendrils: true,
    });
    drawFlower(ctx, midX + 165, midY + 22, 36, { petals: 6, innerLayers: 1 });
    drawLeaf(ctx, midX + 120, midY - 24, 42, 14, -Math.PI * 0.25);
    drawLeaf(ctx, midX + 205, midY + 20, 38, 13, Math.PI * 0.25);

    // 5. Cup mount ends geometric border bands
    drawGeometricBorder(ctx, 10, width, 38, {
        patternType: 'meander',
        repeatCount: 6,
    });
    drawGeometricBorder(ctx, height - 48, width, 38, {
        patternType: 'lotus-petal',
        repeatCount: 6,
    });

    const texture = new CanvasTexture(canvas);
    texture.name = 'tex-porcelain-crossbar';
    texture.wrapS = RepeatWrapping;
    texture.wrapT = ClampToEdgeWrapping;
    texture.generateMipmaps = true;
    texture.minFilter = LinearMipmapLinearFilter;
    texture.magFilter = LinearFilter;
    texture.colorSpace = SRGBColorSpace;
    texture.needsUpdate = true;

    return texture;
}

/**
 * Creates the procedural CanvasTexture for the Ken Spike (Kensaki).
 * Keeps spike predominantly clean ivory with a restrained blue accent near its base.
 *
 * @param {object} [options={}] - Customization options
 * @returns {CanvasTexture} High-resolution procedural spike texture
 */
export function createPorcelainSpikeTexture(options = {}) {
    const width = options.width ?? 256;
    const height = options.height ?? 512;

    const canvas = createPatternCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // 1. Warm porcelain ivory base (predominant body)
    ctx.fillStyle = PORCELAIN_PALETTE.WARM_IVORY;
    ctx.fillRect(0, 0, width, height);

    // 2. Base collar border band (restrained bottom ring: Y ~ 455 to 498)
    drawGeometricBorder(ctx, height - 52, width, 44, {
        patternType: 'lotus-petal',
        repeatCount: 4,
    });

    // 3. Restrained ascending accent near base only (stops at Y = 360, leaving upper 70% pure ivory)
    const midX = width * 0.5;
    drawCurvingVine(ctx, midX, height - 60, midX, 360, [
        { x: midX - 28, y: height * 0.82 },
        { x: midX + 28, y: height * 0.74 },
    ], {
        lineWidth: 3.5,
        withTendrils: true,
    });

    // Single petite blossom and leaf pair at the base accent
    drawFlower(ctx, midX - 22, height * 0.80, 20, { petals: 5, innerLayers: 1 });
    drawLeaf(ctx, midX + 16, height * 0.75, 26, 9, Math.PI * 0.35);

    const texture = new CanvasTexture(canvas);
    texture.name = 'tex-porcelain-spike';
    texture.wrapS = RepeatWrapping;
    texture.wrapT = ClampToEdgeWrapping;
    texture.generateMipmaps = true;
    texture.minFilter = LinearMipmapLinearFilter;
    texture.magFilter = LinearFilter;
    texture.colorSpace = SRGBColorSpace;
    texture.needsUpdate = true;

    return texture;
}
