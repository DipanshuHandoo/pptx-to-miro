'use strict';

/**
 * PPTX uses a top-left origin (x right, y down), points as units.
 * Miro uses a center origin by default. We convert a shape's top-left box to its
 * center point, then offset by half the slide so the slide re-centers on (0, 0).
 */
const toMiroPosition = (item, slideMetadata) => {
  const centerX = item.x_pt + item.width_pt / 2;
  const centerY = item.y_pt + item.height_pt / 2;

  return {
    x: centerX - slideMetadata.slide_width_pt / 2,
    y: centerY - slideMetadata.slide_height_pt / 2,
    origin: 'center',
  };
};

module.exports = { toMiroPosition };
