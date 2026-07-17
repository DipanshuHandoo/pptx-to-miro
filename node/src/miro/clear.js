'use strict';

const pLimit = require('p-limit');
const { log } = require('../utils/logger');

const limit = pLimit(4);

const describeError = (err) =>
  err.response ? `HTTP ${err.response.status}: ${JSON.stringify(err.response.data)}` : err.message;

/** Page through a collection endpoint, yielding every element's id. */
const collectIds = async (client, url) => {
  const ids = [];
  let cursor;
  do {
    const { data } = await client.get(url, { params: { limit: 50, cursor } });
    for (const el of data.data || []) ids.push(el.id);
    cursor = data.cursor;
  } while (cursor);
  return ids;
};

/**
 * Delete every connector and item on a board.
 *
 * Miro has no bulk-delete / clear-board endpoint, so this deletes each element
 * individually (parallelized, with the client's retry). Connectors are removed
 * first; deleting the items would cascade-remove attached connectors anyway, but
 * doing it explicitly keeps the counts accurate.
 *
 * NOTE: this wipes ALL content on the board, not just items this tool created.
 */
const clearBoard = async (client, boardId) => {
  const connectorIds = await collectIds(client, `/boards/${boardId}/connectors`);
  let connectors = 0;
  await Promise.all(connectorIds.map((id) =>
    limit(async () => {
      try {
        await client.delete(`/boards/${boardId}/connectors/${id}`);
        connectors += 1;
      } catch (err) {
        log.warn(`clear: connector ${id} failed: ${describeError(err)}`);
      }
    })
  ));

  const itemIds = await collectIds(client, `/boards/${boardId}/items`);
  let items = 0;
  await Promise.all(itemIds.map((id) =>
    limit(async () => {
      try {
        await client.delete(`/boards/${boardId}/items/${id}`);
        items += 1;
      } catch (err) {
        log.warn(`clear: item ${id} failed: ${describeError(err)}`);
      }
    })
  ));

  return { connectors, items };
};

module.exports = { clearBoard };
