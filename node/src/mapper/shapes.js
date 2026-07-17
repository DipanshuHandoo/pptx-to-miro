'use strict';

const { toMiroPosition } = require('./coordinates');

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

const fontSizeOf = (shape, fallback) => {
  const size = firstRun(shape).font_size_pt;
  return String(size != null ? Math.round(size) : fallback);
};

/**
 * Map a parsed shape to a Miro element descriptor.
 * Returns { elementType: 'shape' | 'text', payload }.
 */
const mapShapeToMiro = (shape, slideMetadata) => {
  const run = firstRun(shape);

  // Text boxes become native Miro text items (no border/fill container).
  if (shape.type === 'TEXT_BOX') {
    return {
      elementType: 'text',
      payload: {
        data: {
          content: (shape.text && (shape.text.html || shape.text.content)) || '',
        },
        style: {
          fontFamily: 'arial',
          fontSize: fontSizeOf(shape, 14),
          textAlign: (shape.text && shape.text.alignment) || 'left',
          color: run.color || DEFAULT_FONT_COLOR,
        },
        position: toMiroPosition(shape, slideMetadata),
        geometry: {
          width: shape.width_pt,
          rotation: shape.rotation || 0,
        },
      },
    };
  }

  const miroType = SHAPE_TYPE_MAP[shape.type] || 'rectangle';
  const hasFill = shape.fill && shape.fill.type !== 'NONE' && shape.fill.color;
  const hasBorder = shape.border && shape.border.color;

  const style = {
    color: run.color || DEFAULT_FONT_COLOR,
    fontSize: fontSizeOf(shape, 14),
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

  return {
    elementType: 'shape',
    payload: {
      data: {
        shape: miroType,
        content: (shape.text && shape.text.html) || '',
      },
      style,
      position: toMiroPosition(shape, slideMetadata),
      geometry: {
        width: shape.width_pt,
        height: shape.height_pt,
        rotation: shape.rotation || 0,
      },
    },
  };
};

module.exports = { mapShapeToMiro, SHAPE_TYPE_MAP };
