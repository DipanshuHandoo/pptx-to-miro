'use strict';

// Miro connectors MUST attach to existing items on both ends — free-floating /
// dangling connectors are not supported by the REST API. So we resolve each
// endpoint to a Miro item id, inferring the nearest shape when the PPTX did not
// record an explicit connection.

const ARROW_CAP_MAP = {
  NONE: 'none',
  ARROW: 'arrow',
  STEALTH: 'stealth',
  DIAMOND: 'diamond',
  OVAL: 'oval',
  TRIANGLE: 'arrow',
};

// Max distance (pt) between a connector endpoint and a shape's center for the
// endpoint to be inferred as attached to that shape.
const INFERENCE_THRESHOLD_PT = 48;

/** Find the shape whose box contains (x, y), else nearest center within threshold. */
const findShapeAt = (x, y, shapes) => {
  for (const s of shapes) {
    if (x >= s.x_pt && x <= s.x_pt + s.width_pt &&
        y >= s.y_pt && y <= s.y_pt + s.height_pt) {
      return s.id;
    }
  }

  let best = null;
  let bestDist = Infinity;
  for (const s of shapes) {
    const cx = s.x_pt + s.width_pt / 2;
    const cy = s.y_pt + s.height_pt / 2;
    const dist = Math.hypot(cx - x, cy - y);
    if (dist < bestDist) {
      bestDist = dist;
      best = s.id;
    }
  }
  return bestDist <= INFERENCE_THRESHOLD_PT ? best : null;
};

/** Resolve a connector endpoint to a Miro item id, or null if unresolvable. */
const resolveEndpoint = (explicitShapeId, x, y, shapeIdMap, shapes) => {
  if (explicitShapeId && shapeIdMap[explicitShapeId]) {
    return shapeIdMap[explicitShapeId];
  }
  const inferred = findShapeAt(x, y, shapes);
  return inferred ? shapeIdMap[inferred] || null : null;
};

/**
 * Build a Miro connector payload, or return { skip: true, reason } when an
 * endpoint cannot be attached to any item.
 *
 * shapeIdMap: { "shape_<pptxId>" -> miroItemId }
 * shapes:     the slide's parsed shapes (for nearest-shape inference)
 */
const mapConnectorToMiro = (connector, shapeIdMap, shapes) => {
  const line = connector.line || {};

  const startId = resolveEndpoint(
    connector.start_shape_id, connector.start_x_pt, connector.start_y_pt, shapeIdMap, shapes
  );
  const endId = resolveEndpoint(
    connector.end_shape_id, connector.end_x_pt, connector.end_y_pt, shapeIdMap, shapes
  );

  if (!startId || !endId) {
    return { skip: true, reason: `unresolved endpoint (start=${!!startId}, end=${!!endId})` };
  }
  if (startId === endId) {
    return { skip: true, reason: 'both endpoints resolved to the same item' };
  }

  return {
    payload: {
      startItem: { id: startId },
      endItem: { id: endId },
      shape: connector.type === 'ELBOW' ? 'elbowed' : 'straight',
      style: {
        strokeColor: line.color || '#000000',
        strokeWidth: String(line.width_pt || 1),
        strokeStyle: line.style === 'DASHED' ? 'dashed' : line.style === 'DOTTED' ? 'dotted' : 'normal',
        startStrokeCap: ARROW_CAP_MAP[line.arrow_start] || 'none',
        endStrokeCap: ARROW_CAP_MAP[line.arrow_end] || 'none',
      },
    },
  };
};

module.exports = { mapConnectorToMiro };
