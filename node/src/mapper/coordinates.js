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

/**
 * Position for an item nested inside a frame. Miro interprets a child's
 * coordinates as its center relative to the parent frame's top-left. Since PPTX
 * is already a top-left system, the item's frame-relative center is simply its
 * top-left plus half its size — no slide-centering needed.
 */
const toFramePosition = (item) => ({
  x: item.x_pt + item.width_pt / 2,
  y: item.y_pt + item.height_pt / 2,
  origin: 'center',
});

module.exports = { toMiroPosition, toFramePosition };
