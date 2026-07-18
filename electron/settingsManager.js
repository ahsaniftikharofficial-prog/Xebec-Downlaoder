// Reads/writes the settings JSON file. Thin on purpose — the actual logic
// (defaults, merging/validating updates, parsing safely) lives in
// settings.js, where it's unit-tested. Deliberately has no folder-picker
// dialog code — that stays in main.js, which is the only file in this
// project that talks to Electron's native APIs directly.

const fs = require('fs/promises');
const { DEFAULT_SETTINGS, mergeSettings, parseSettingsFile } = require('./settings');

async function readSettings(settingsFilePath) {
  try {
    const text = await fs.readFile(settingsFilePath, 'utf-8');
    return parseSettingsFile(text);
  } catch (err) {
    if (err.code === 'ENOENT') return { ...DEFAULT_SETTINGS };
    throw err;
  }
}

async function writeSettings(settingsFilePath, settings) {
  await fs.writeFile(settingsFilePath, JSON.stringify(settings, null, 2), 'utf-8');
}

async function updateSettings(settingsFilePath, updates) {
  const current = await readSettings(settingsFilePath);
  const next = mergeSettings(current, updates);
  await writeSettings(settingsFilePath, next);
  return next;
}

module.exports = { readSettings, writeSettings, updateSettings };
