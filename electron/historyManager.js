// Reads/writes the history JSON file. Thin on purpose — the actual logic
// (building an entry, capping the list, parsing safely) lives in
// history.js, where it's unit-tested. This file takes a path in rather
// than resolving one itself, same reasoning as downloadManager.js taking
// its paths from main.js instead of reaching for app.getPath() itself.

const fs = require('fs/promises');
const { addEntry, parseHistoryFile } = require('./history');

async function readHistory(historyFilePath) {
  try {
    const text = await fs.readFile(historyFilePath, 'utf-8');
    return parseHistoryFile(text);
  } catch (err) {
    if (err.code === 'ENOENT') return []; // no history yet — not an error
    throw err;
  }
}

async function writeHistory(historyFilePath, entries) {
  await fs.writeFile(historyFilePath, JSON.stringify(entries, null, 2), 'utf-8');
}

async function addToHistory(historyFilePath, entry) {
  const current = await readHistory(historyFilePath);
  const updated = addEntry(current, entry);
  await writeHistory(historyFilePath, updated);
  return updated;
}

async function clearHistory(historyFilePath) {
  await writeHistory(historyFilePath, []);
  return [];
}

module.exports = { readHistory, writeHistory, addToHistory, clearHistory };
