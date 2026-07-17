'use strict';

const fs = require('fs');
const FormData = require('form-data');
const pLimit = require('p-limit');
const { toMiroPosition } = require('../mapper/coordinates');
const { log } = require('../utils/logger');

const limit = pLimit(3); // uploads are heavier than JSON item creation

const describeError = (err) => {
  if (err.response) {
    return `HTTP ${err.response.status}: ${JSON.stringify(err.response.data)}`;
  }
  return err.message;
};

/**
 * Upload one image via multipart/form-data. Miro expects TWO parts:
 *   - resource: the file stream
 *   - data:     a JSON string with position/geometry/title
 * (Position/geometry are NOT query params.)
 */
const createImage = async (client, boardId, image, slideMetadata) => {
  if (image.supported === false) {
    log.warn(`image ${image.id} (${image.format}) not supported by Miro — skipped`);
    return { skipped: true };
  }
  if (!fs.existsSync(image.file_path)) {
    log.warn(`image ${image.id} file missing: ${image.file_path} — skipped`);
    return { skipped: true };
  }

  const form = new FormData();
  form.append('resource', fs.createReadStream(image.file_path));
  form.append('data', JSON.stringify({
    title: image.name || image.id,
    position: toMiroPosition(image, slideMetadata),
    geometry: { width: image.width_pt, rotation: image.rotation || 0 },
  }));

  await client.post(`/boards/${boardId}/images`, form, {
    headers: {
      ...form.getHeaders(),
      // Let form-data own Content-Type (multipart boundary); keep auth from the client.
      Authorization: `Bearer ${process.env.MIRO_ACCESS_TOKEN}`,
    },
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
  });
  return { created: true };
};

const createAllImages = async (client, boardId, images, slideMetadata) => {
  let created = 0;
  let skipped = 0;
  let failed = 0;

  const tasks = images.map((image) =>
    limit(async () => {
      try {
        const result = await createImage(client, boardId, image, slideMetadata);
        if (result.created) created += 1;
        else skipped += 1;
      } catch (err) {
        failed += 1;
        log.warn(`image ${image.id} failed: ${describeError(err)}`);
      }
    })
  );

  await Promise.all(tasks);
  return { created, skipped, failed };
};

module.exports = { createAllImages };
