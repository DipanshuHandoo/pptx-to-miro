'use strict';

// Minimal leveled logger. Everything goes to stderr except explicit results,
// so stdout stays clean for machine-readable output when needed.
const log = {
  info: (...args) => console.error('[info]', ...args),
  warn: (...args) => console.error('[warn]', ...args),
  error: (...args) => console.error('[error]', ...args),
  step: (...args) => console.error('\n>', ...args),
};

module.exports = { log };
