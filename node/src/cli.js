#!/usr/bin/env node
'use strict';

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { program } = require('commander');

const { runPythonParser } = require('./runner');
const { createMiroClient } = require('./miro/client');
const { createOrderedItems } = require('./miro/items');
const { createAllConnectors } = require('./miro/connectors');
const { createFrame } = require('./miro/frames');
const { clearBoard } = require('./miro/clear');
const { buildPreview } = require('./preview');
const { log } = require('./utils/logger');

program
  .name('pptx-to-miro')
  .description('Convert a PPTX file to Miro board elements')
  .requiredOption('-f, --file <path>', 'Path to the .pptx file')
  .option('-o, --output <dir>', 'Output directory for extraction JSON + images', './output')
  .option('--dry-run', 'Parse and map only; do not push to Miro')
  .option('--preview', 'Parse and render a local HTML preview (output/preview.html); no push')
  .option('--clear', 'Delete ALL existing items on the board before pushing')
  .option('--no-frames', 'Do not wrap each slide in a frame (slides are still offset)')
  .option('--gap <pt>', 'Gap (pt) between slides when laid out in a row', (v) => parseFloat(v), 200)
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

  if (opts.preview) {
    const previewPath = buildPreview({ metadata: extraction.metadata, slides }, outputDir);
    log.step(`Preview written: ${previewPath}`);
    log.info('Open it, or run the "preview" dev server to view in the browser.');
    return;
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

  if (opts.clear) {
    log.step('Clearing board (deleting all existing items)...');
    const cleared = await clearBoard(client, boardId);
    log.info(`Cleared: ${cleared.items} items, ${cleared.connectors} connectors`);
  }

  const { slide_width_pt: slideW, slide_height_pt: slideH } = extraction.metadata;
  const pitchX = slideW + opts.gap; // slide-to-slide spacing, laid out in a row

  for (let i = 0; i < slides.length; i += 1) {
    const slide = slides[i];
    log.step(`Slide ${slide.slide_number}`);

    // Lay slides out left-to-right so they never overlap.
    const offsetX = i * pitchX;

    // Optionally wrap the slide in a frame (a slide container). Items are then
    // nested in it via parentId and positioned relative to the frame top-left.
    let parentId;
    if (opts.frames) {
      parentId = await createFrame(client, boardId, {
        title: `Slide ${slide.slide_number}`,
        x: offsetX,
        y: 0,
        width: slideW,
        height: slideH,
      });
      log.info(`Frame created: "Slide ${slide.slide_number}"`);
    }

    const itemOptions = { parentId, offsetX };

    // 1. Shapes, text, and images in ONE ordered pass (document order) so Miro's
    //    stacking matches the PPTX back-to-front paint order.
    const drawables = [...slide.shapes, ...slide.images].sort((a, b) => (a.z || 0) - (b.z || 0));
    const { shapeIdMap, shapes, texts, images, failed, skipped } =
      await createOrderedItems(client, boardId, drawables, extraction.metadata, itemOptions);
    log.info(
      `Items: ${shapes} shapes, ${texts} text, ${images} images` +
      `${skipped ? `, ${skipped} skipped` : ''}${failed ? `, ${failed} failed` : ''}`
    );

    // 2. Connectors, resolved to shape ids (attachment handles positioning).
    const conn = await createAllConnectors(
      client, boardId, slide.connectors, shapeIdMap, slide.shapes
    );
    log.info(
      `Connectors: ${conn.created} created` +
      `${conn.skipped ? `, ${conn.skipped} skipped` : ''}` +
      `${conn.failed ? `, ${conn.failed} failed` : ''}`
    );
  }

  log.step('Done. Check your Miro board.');
};

run().catch((err) => {
  log.error(err.message);
  process.exit(1);
});
