'use strict';

const { mapShapeToMiro } = require('../mapper/shapes');
const { createImage } = require('./images');
const { log } = require('../utils/logger');

const describeError = (err) =>
  err.response ? `HTTP ${err.response.status}: ${JSON.stringify(err.response.data)}` : err.message;

const isImage = (el) => el && el.file_path !== undefined;

/**
 * Create shapes, text, and images in a single pass, IN ORDER.
 *
 * Miro has no z-index on create — stacking follows creation order — so items are
 * created sequentially in PPTX document order (their `z`) to reproduce the deck's
 * back-to-front layering. Interleaving shapes/text/images in one ordered pass is
 * what makes stacking match (creating all images last would float them on top).
 *
 * Returns { shapeIdMap, shapes, texts, images, failed, skipped }.
 */
const createOrderedItems = async (client, boardId, drawables, slideMetadata, options = {}) => {
  const shapeIdMap = {};
  const counts = { shapes: 0, texts: 0, images: 0, failed: 0, skipped: 0 };

  for (const el of drawables) {
    try {
      if (isImage(el)) {
        const result = await createImage(client, boardId, el, slideMetadata, options);
        if (result.created) counts.images += 1;
        else counts.skipped += 1;
        continue;
      }

      const mapped = mapShapeToMiro(el, slideMetadata, options);
      const endpoint = mapped.elementType === 'text'
        ? `/boards/${boardId}/texts`
        : `/boards/${boardId}/shapes`;
      const { data } = await client.post(endpoint, mapped.payload);
      shapeIdMap[el.id] = data.id;
      if (mapped.elementType === 'text') counts.texts += 1;
      else counts.shapes += 1;
    } catch (err) {
      counts.failed += 1;
      log.warn(`item ${el.id} (${el.type || 'image'}) failed: ${describeError(err)}`);
    }
  }

  return { shapeIdMap, ...counts };
};

module.exports = { createOrderedItems };
