'use strict';

const { spawn } = require('child_process');
const path = require('path');
const { log } = require('./utils/logger');

/**
 * Pick the Python executable. Windows ships `python`, most *nix ship `python3`.
 * Override with the PYTHON_BIN env var.
 */
const pythonBin = () =>
  process.env.PYTHON_BIN || (process.platform === 'win32' ? 'python' : 'python3');

/**
 * Spawn the Python parser and resolve with the extraction.json path it prints.
 * Args are passed as an array (no shell) to avoid command injection.
 */
const runPythonParser = (pptxPath, outputDir) =>
  new Promise((resolve, reject) => {
    const scriptPath = path.resolve(__dirname, '../../python/parser.py');
    const proc = spawn(pythonBin(), [scriptPath, pptxPath, outputDir], { shell: false });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    proc.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      stderr += text;
      // Surface parser warnings live.
      text.split('\n').filter(Boolean).forEach((line) => log.warn(`python: ${line}`));
    });

    proc.on('error', (err) => {
      reject(new Error(
        `Failed to launch Python ("${pythonBin()}"): ${err.message}. ` +
        `Is Python installed and on PATH? Set PYTHON_BIN to override.`
      ));
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(`Python parser exited with code ${code}.\n${stderr}`));
      }
      const jsonPath = stdout.trim().split('\n').pop().trim();
      if (!jsonPath) {
        return reject(new Error('Python parser produced no output path.'));
      }
      resolve(jsonPath);
    });
  });

module.exports = { runPythonParser };
