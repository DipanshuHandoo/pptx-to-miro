#!/usr/bin/env node
'use strict';

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { program } = require('commander');

const { runPythonParser } = require('./runner');
const { createMiroClient } = require('./miro/client');
const { createAllShapes } = require('./miro/shapes');
const { createAllConnectors } = require('./miro/connectors');
const { createAllImages } = require('./miro/images');
const { log } = require('./utils/logger');

program
  .name('pptx-to-miro')
  .description('Convert a PPTX file to Miro board elements')
  .requiredOption('-f, --file <path>', 'Path to the .pptx file')
  .option('-o, --output <dir>', 'Output directory for extraction JSON + images', './output')
  .option('--dry-run', 'Parse and map only; do not push to Miro')
  .option('--slide <number>', 'Process only this slide number (1-indexed)', (v) => parseInt(v, 10))
  .parse(process.argv);

const opts = program.opts();

const run = async () => {
  const pptxPath = path.resolve(opts.file);
  const outputDir = path.resolve(opts.output);

  if (!fs.existsSync(pptxPath)) {
    throw new Error(`File not found: ${pptxPath}`);
  }

  log.step(`Parsing ${pptxPath}`);
  const jsonPath = await runPythonParser(pptxPath, outputDir);
  const extraction = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  log.info(`Extraction written: ${jsonPath}`);
  log.info(`Slides: ${extraction.metadata.slide_count}`);

  let slides = extraction.slides;
  if (opts.slide) {
    slides = slides.filter((s) => s.slide_number === opts.slide);
    if (slides.length === 0) {
      throw new Error(`Slide ${opts.slide} not found (deck has ${extraction.slides.length} slides).`);
    }
  }

  if (opts.dryRun) {
    log.step('Dry run — not pushing to Miro.');
    for (const slide of slides) {
      log.info(
        `Slide ${slide.slide_number}: ` +
        `${slide.shapes.length} shapes, ` +
        `${slide.connectors.length} connectors, ` +
        `${slide.images.length} images`
      );
    }
    process.stdout.write(JSON.stringify({ metadata: extraction.metadata, slides }, null, 2) + '\n');
    return;
  }

  // Board id is often pasted straight from the URL; strip any surrounding
  // whitespace and trailing slash (and URL-decode, since "=" may arrive as %3D).
  const rawBoardId = process.env.MIRO_BOARD_ID;
  if (!rawBoardId) throw new Error('MIRO_BOARD_ID is not set. See .env.example.');
  const boardId = decodeURIComponent(rawBoardId.trim().replace(/\/+$/, ''));

  const client = createMiroClient();

  for (const slide of slides) {
    log.step(`Slide ${slide.slide_number}`);

    // 1. Shapes + text first (connectors need their Miro ids).
    const { shapeIdMap, created: sCreated, failed: sFailed } =
      await createAllShapes(client, boardId, slide.shapes, extraction.metadata);
    log.info(`Shapes: ${sCreated} created${sFailed ? `, ${sFailed} failed` : ''}`);

    // 2. Connectors, resolved to shape ids.
    const conn = await createAllConnectors(
      client, boardId, slide.connectors, shapeIdMap, slide.shapes
    );
    log.info(
      `Connectors: ${conn.created} created` +
      `${conn.skipped ? `, ${conn.skipped} skipped` : ''}` +
      `${conn.failed ? `, ${conn.failed} failed` : ''}`
    );

    // 3. Images.
    const img = await createAllImages(client, boardId, slide.images, extraction.metadata);
    log.info(
      `Images: ${img.created} uploaded` +
      `${img.skipped ? `, ${img.skipped} skipped` : ''}` +
      `${img.failed ? `, ${img.failed} failed` : ''}`
    );
  }

  log.step('Done. Check your Miro board.');
};

run().catch((err) => {
  log.error(err.message);
  process.exit(1);
});
