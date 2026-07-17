'use strict';

const pLimit = require('p-limit');
const { mapShapeToMiro } = require('../mapper/shapes');
const { log } = require('../utils/logger');

const limit = pLimit(4); // keep well under Miro's rate-limit credit budget

const describeError = (err) => {
  if (err.response) {
    return `HTTP ${err.response.status}: ${JSON.stringify(err.response.data)}`;
  }
  return err.message;
};

/**
 * Create every shape/text item for a slide.
 * Returns { shapeIdMap, created, failed } where shapeIdMap maps the parsed
 * shape id ("shape_<pptxId>") to the created Miro item id.
 */
const createAllShapes = async (client, boardId, shapes, slideMetadata, options = {}) => {
  const shapeIdMap = {};
  let created = 0;
  let failed = 0;

  const tasks = shapes.map((shape) =>
    limit(async () => {
      const mapped = mapShapeToMiro(shape, slideMetadata, options);
      const endpoint = mapped.elementType === 'text'
        ? `/boards/${boardId}/texts`
        : `/boards/${boardId}/shapes`;
      try {
        const { data } = await client.post(endpoint, mapped.payload);
        shapeIdMap[shape.id] = data.id;
        created += 1;
      } catch (err) {
        failed += 1;
        log.warn(`shape ${shape.id} (${shape.type}) failed: ${describeError(err)}`);
      }
    })
  );

  await Promise.all(tasks);
  return { shapeIdMap, created, failed };
};

module.exports = { createAllShapes };
