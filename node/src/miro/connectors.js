'use strict';

const pLimit = require('p-limit');
const { mapConnectorToMiro } = require('../mapper/connectors');
const { log } = require('../utils/logger');

const limit = pLimit(4);

const describeError = (err) => {
  if (err.response) {
    return `HTTP ${err.response.status}: ${JSON.stringify(err.response.data)}`;
  }
  return err.message;
};

/**
 * Create connectors. Each endpoint is resolved to a Miro item id (Miro cannot
 * create free-floating connectors); unresolved ones are skipped with a warning.
 * Returns { created, skipped, failed }.
 */
const createAllConnectors = async (client, boardId, connectors, shapeIdMap, shapes) => {
  let created = 0;
  let skipped = 0;
  let failed = 0;

  const tasks = connectors.map((connector) =>
    limit(async () => {
      const mapped = mapConnectorToMiro(connector, shapeIdMap, shapes);
      if (mapped.skip) {
        skipped += 1;
        log.warn(`connector ${connector.id} skipped: ${mapped.reason}`);
        return;
      }
      try {
        await client.post(`/boards/${boardId}/connectors`, mapped.payload);
        created += 1;
      } catch (err) {
        failed += 1;
        log.warn(`connector ${connector.id} failed: ${describeError(err)}`);
      }
    })
  );

  await Promise.all(tasks);
  return { created, skipped, failed };
};

module.exports = { createAllConnectors };
