'use strict';

// Position math is inlined here (positionFromCenter) so no-wrap text can be
// anchored by alignment; coordinates.js still serves the image/connector paths.

// Normalized PPTX type -> Miro shape name. null => handled as a different element.
const SHAPE_TYPE_MAP = {
  RECTANGLE: 'rectangle',
  ROUNDED_RECTANGLE: 'round_rectangle',
  ELLIPSE: 'circle',
  DIAMOND: 'rhombus',
  TRIANGLE: 'triangle',
  PARALLELOGRAM: 'parallelogram',
  TRAPEZOID: 'trapezoid',
  PENTAGON: 'pentagon',
  HEXAGON: 'hexagon',
  OCTAGON: 'octagon',
  CROSS: 'cross',
  STAR: 'star',
  CLOUD: 'cloud',
  CYLINDER: 'can',
  CHEVRON: 'right_arrow',
  RIGHT_ARROW: 'right_arrow',
  TEXT_BOX: null,
  LINE: null,
};

const DEFAULT_FONT_COLOR = '#1a1a1a';

const firstRun = (shape) => (shape.text && shape.text.runs && shape.text.runs[0]) || {};

// Miro enforces a minimum fontSize of 10 for shapes (text items allow smaller).
const SHAPE_MIN_FONT = 10;
// Miro enforces a minimum shape width/height of 8 pt.
const MIN_DIMENSION = 8;
// PowerPoint's default text size when a run/paragraph specifies none.
const DEFAULT_FONT_SIZE = 18;

const fontSizeOf = (shape, fallback, min = 1) => {
  const size = firstRun(shape).font_size_pt;
  const rounded = size != null ? Math.round(size) : fallback;
  return String(Math.max(min, rounded));
};

// Rough single-line text width (pt) for no-wrap boxes. Deliberately generous so
// Miro never wraps; alignment anchoring keeps the visible text correctly placed.
const estimateTextWidth = (text, fontPt) => {
  const content = (text && text.content) || '';
  const bold = text && text.runs && text.runs[0] && text.runs[0].bold;
  const factor = bold ? 0.68 : 0.62;
  let maxChars = 1;
  for (const line of content.split('\n')) {
    if (line.length > maxChars) maxChars = line.length;
  }
  return maxChars * fontPt * factor + 8;
};

/**
 * Map a parsed shape to a Miro element descriptor.
 * Returns { elementType: 'shape' | 'text', payload }.
 *
 * options:
 *   parentId  when set, the item is nested in that frame and positioned
 *             relative to the frame's top-left (PPTX-native coords).
 *   offsetX   board-space X offset applied in non-framed mode so multiple
 *             slides don't overlap.
 */
const mapShapeToMiro = (shape, slideMetadata, options = {}) => {
  const { parentId, offsetX = 0 } = options;
  const run = firstRun(shape);

  // Transform a box-center point (in PPTX slide coords) to a Miro position.
  const positionFromCenter = (cx, cy) => {
    if (parentId) return { x: cx, y: cy, origin: 'center' };
    return {
      x: cx - slideMetadata.slide_width_pt / 2 + offsetX,
      y: cy - slideMetadata.slide_height_pt / 2,
      origin: 'center',
    };
  };

  const positionOf = (item) =>
    positionFromCenter(item.x_pt + item.width_pt / 2, item.y_pt + item.height_pt / 2);

  // Text boxes become native Miro text items (no border/fill container).
  if (shape.type === 'TEXT_BOX') {
    // wrap === false: PPTX lets text overflow the box on one line (no wrapping).
    // Miro would force-wrap at the box width, so we give it a width wide enough
    // for the text and anchor it by alignment so labels stay put.
    const noWrap = shape.text && shape.text.wrap === false;
    const fontPt = Number(fontSizeOf(shape, DEFAULT_FONT_SIZE));

    const payload = {
      data: {
        content: (shape.text && (shape.text.html || shape.text.content)) || '',
      },
      style: {
        fontFamily: 'arial',
        fontSize: String(fontPt),
        textAlign: (shape.text && shape.text.alignment) || 'left',
        color: run.color || DEFAULT_FONT_COLOR,
      },
    };

    const geometry = {};
    if (noWrap) {
      const align = (shape.text && shape.text.alignment) || 'left';
      const width = Math.max(shape.width_pt, estimateTextWidth(shape.text, fontPt));
      const cy = shape.y_pt + shape.height_pt / 2;
      let cx;
      if (align === 'center') cx = shape.x_pt + shape.width_pt / 2;
      else if (align === 'right') cx = shape.x_pt + shape.width_pt - width / 2;
      else cx = shape.x_pt + width / 2; // left: keep left edge at the box's left
      payload.position = positionFromCenter(cx, cy);
      geometry.width = width;
    } else {
      payload.position = positionOf(shape);
      geometry.width = shape.width_pt;
    }
    if (shape.rotation) geometry.rotation = shape.rotation;
    payload.geometry = geometry;

    if (parentId) payload.parent = { id: parentId };
    return { elementType: 'text', payload };
  }

  const miroType = SHAPE_TYPE_MAP[shape.type] || 'rectangle';
  const hasFill = shape.fill && shape.fill.type !== 'NONE' && shape.fill.color;
  const hasBorder = shape.border && shape.border.color;

  const style = {
    color: run.color || DEFAULT_FONT_COLOR,
    fontSize: fontSizeOf(shape, DEFAULT_FONT_SIZE, SHAPE_MIN_FONT),
    fontFamily: 'arial',
    textAlign: (shape.text && shape.text.alignment) || 'center',
    textAlignVertical: (shape.text && shape.text.vertical_alignment) || 'middle',
    fillColor: hasFill ? shape.fill.color : '#ffffff',
    fillOpacity: hasFill ? '1.0' : '0.0',
  };

  if (hasBorder) {
    style.borderColor = shape.border.color;
    style.borderWidth = String(shape.border.width_pt || 1);
    style.borderOpacity = '1.0';
    style.borderStyle = shape.border.style === 'DASHED'
      ? 'dashed'
      : shape.border.style === 'DOTTED'
        ? 'dotted'
        : 'normal';
  } else {
    style.borderOpacity = '0.0';
  }

  const payload = {
    data: {
      shape: miroType,
      content: (shape.text && shape.text.html) || '',
    },
    style,
    position: positionOf(shape),
    geometry: {
      // Miro requires shape width/height >= 8.
      width: Math.max(MIN_DIMENSION, shape.width_pt),
      height: Math.max(MIN_DIMENSION, shape.height_pt),
      rotation: shape.rotation || 0,
    },
  };
  if (parentId) payload.parent = { id: parentId };
  return { elementType: 'shape', payload };
};

module.exports = { mapShapeToMiro, SHAPE_TYPE_MAP };
