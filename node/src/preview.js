#!/usr/bin/env node
'use strict';

// Render a parsed extraction.json to a static HTML preview that approximates
// what will be pushed to Miro. It reuses the real mapper (mapShapeToMiro) so the
// preview reflects the actual positions/sizes/anchoring we send — useful for
// catching layout, sizing, and z-order issues without a Miro round-trip.
//
// Usage (standalone): node src/preview.js [path/to/extraction.json]
// Also exported as buildPreview(extraction, outDir) for the CLI --preview flag.

const fs = require('fs');
const path = require('path');
const { mapShapeToMiro } = require('./mapper/shapes');

const SCALE = 1.5; // upscale for a crisper screenshot
const px = (n) => `${n}px`;
const isImage = (el) => el.file_path !== undefined;

const SHAPE_CSS = {
  circle: 'border-radius:50%;',
  round_rectangle: 'border-radius:8px;',
};

function buildPreview(ex, outDir) {
  const SW = ex.metadata.slide_width_pt;
  const SH = ex.metadata.slide_height_pt;

  // Miro non-framed position (center, board origin) -> slide-space top-left.
  const toTopLeft = (pos, w, h) => ({
    left: pos.x + SW / 2 - w / 2,
    top: pos.y + SH / 2 - h / 2,
  });

  const centerOf = (box) => ({ x: box.x_pt + box.width_pt / 2, y: box.y_pt + box.height_pt / 2 });

  const renderShapeOrText = (el) => {
    const mapped = mapShapeToMiro(el, ex.metadata, {});
    const p = mapped.payload;

    if (mapped.elementType === 'text') {
      const w = p.geometry.width;
      const { left } = toTopLeft(p.position, w, 0);
      const top = el.y_pt;
      const nowrap = el.text && el.text.wrap === false ? 'white-space:nowrap;' : '';
      return `<div class="txt" style="left:${px(left)};top:${px(top)};width:${px(w)};` +
        `font-size:${p.style.fontSize}px;color:${p.style.color};text-align:${p.style.textAlign};${nowrap}">` +
        `${(el.text && el.text.html) || ''}</div>`;
    }

    const w = p.geometry.width;
    const h = p.geometry.height;
    const { left, top } = toTopLeft(p.position, w, h);
    const s = p.style;
    const bg = s.fillOpacity === '0.0' ? 'transparent' : s.fillColor;
    const border = s.borderOpacity === '0.0'
      ? 'none'
      : `${s.borderWidth || 1}px ${s.borderStyle === 'normal' ? 'solid' : s.borderStyle} ${s.borderColor}`;
    const shapeCss = SHAPE_CSS[p.data.shape] || '';
    return `<div class="shape" style="left:${px(left)};top:${px(top)};width:${px(w)};height:${px(h)};` +
      `background:${bg};border:${border};color:${s.color};font-size:${s.fontSize}px;` +
      `text-align:${s.textAlign};${shapeCss}">` +
      `<div class="shape-txt">${(el.data && el.data.content) || (el.text && el.text.html) || ''}</div></div>`;
  };

  const renderImage = (el) =>
    `<img src="images/${path.basename(el.file_path)}" style="position:absolute;` +
    `left:${px(el.x_pt)};top:${px(el.y_pt)};width:${px(el.width_pt)};height:${px(el.height_pt)};" />`;

  const renderConnectors = (slide) => {
    const byId = {};
    for (const sh of slide.shapes) byId[sh.id] = sh;
    const lines = slide.connectors.map((c) => {
      const a = c.start_shape_id && byId[c.start_shape_id]
        ? centerOf(byId[c.start_shape_id]) : { x: c.start_x_pt, y: c.start_y_pt };
      const b = c.end_shape_id && byId[c.end_shape_id]
        ? centerOf(byId[c.end_shape_id]) : { x: c.end_x_pt, y: c.end_y_pt };
      const color = (c.line && c.line.color) || '#555';
      return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${color}" ` +
        `stroke-width="1" marker-end="url(#arrow)"/>`;
    });
    return `<svg class="conn" width="${SW}" height="${SH}" style="position:absolute;left:0;top:0;">` +
      `<defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">` +
      `<path d="M0,0 L6,3 L0,6 Z" fill="#555"/></marker></defs>${lines.join('')}</svg>`;
  };

  const slidesHtml = ex.slides.map((slide) => {
    const drawables = [...slide.shapes, ...slide.images].sort((a, b) => (a.z || 0) - (b.z || 0));
    const body = drawables.map((el) => (isImage(el) ? renderImage(el) : renderShapeOrText(el))).join('\n');
    return `<div class="wrap"><div class="label">Slide ${slide.slide_number}</div>` +
      `<div class="slide" style="width:${px(SW)};height:${px(SH)};transform:scale(${SCALE});">` +
      `${renderConnectors(slide)}${body}</div>` +
      `<div style="height:${px(SH * SCALE)}"></div></div>`;
  }).join('\n');

  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    body{margin:0;background:#eee;font-family:Arial,Helvetica,sans-serif;}
    .wrap{margin:20px;}
    .label{font-weight:bold;margin-bottom:6px;}
    .slide{position:relative;background:#fff;transform-origin:top left;box-shadow:0 0 0 1px #ccc;overflow:hidden;}
    .shape{position:absolute;box-sizing:border-box;display:flex;align-items:center;justify-content:center;overflow:hidden;}
    .shape-txt{width:100%;}
    .txt{position:absolute;line-height:1.15;}
    .txt p,.shape-txt p{margin:0;}
    .conn{pointer-events:none;}
  </style></head><body>${slidesHtml}</body></html>`;

  const outPath = path.join(outDir, 'preview.html');
  fs.writeFileSync(outPath, html, 'utf8');
  return outPath;
}

module.exports = { buildPreview };

if (require.main === module) {
  const jsonPath = path.resolve(process.argv[2] || path.join(__dirname, '../../output/extraction.json'));
  const ex = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const outPath = buildPreview(ex, path.dirname(jsonPath));
  console.error(`Preview written: ${outPath}`);
}
