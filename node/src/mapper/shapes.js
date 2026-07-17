'use strict';

const { toMiroPosition, toFramePosition } = require('./coordinates');

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

const fontSizeOf = (shape, fallback, min = 1) => {
  const size = firstRun(shape).font_size_pt;
  const rounded = size != null ? Math.round(size) : fallback;
  return String(Math.max(min, rounded));
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

  const positionOf = (item) => {
    if (parentId) return toFramePosition(item);
    const p = toMiroPosition(item, slideMetadata);
    p.x += offsetX;
    return p;
  };

  // Text boxes become native Miro text items (no border/fill container).
  if (shape.type === 'TEXT_BOX') {
    const payload = {
      data: {
        content: (shape.text && (shape.text.html || shape.text.content)) || '',
      },
      style: {
        fontFamily: 'arial',
        fontSize: fontSizeOf(shape, 14),
        textAlign: (shape.text && shape.text.alignment) || 'left',
        color: run.color || DEFAULT_FONT_COLOR,
      },
      position: positionOf(shape),
      geometry: {
        width: shape.width_pt,
        rotation: shape.rotation || 0,
      },
    };
    if (parentId) payload.parent = { id: parentId };
    return { elementType: 'text', payload };
  }

  const miroType = SHAPE_TYPE_MAP[shape.type] || 'rectangle';
  const hasFill = shape.fill && shape.fill.type !== 'NONE' && shape.fill.color;
  const hasBorder = shape.border && shape.border.color;

  const style = {
    color: run.color || DEFAULT_FONT_COLOR,
    fontSize: fontSizeOf(shape, 14, SHAPE_MIN_FONT),
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
