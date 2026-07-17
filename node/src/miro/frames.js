'use strict';

/**
 * Create a frame to act as a slide container. Returns the frame id.
 * Position is the frame CENTER in board space (canvas_center origin).
 */
const createFrame = async (client, boardId, { title, x, y, width, height }) => {
  const { data } = await client.post(`/boards/${boardId}/frames`, {
    data: { title, type: 'freeform', format: 'custom' },
    position: { x, y, origin: 'center' },
    geometry: { width, height },
  });
  return data.id;
};

module.exports = { createFrame };
