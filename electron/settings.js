// Pure functions for app settings — default shape, merging updates, and
// safely parsing whatever's on disk. Kept free of fs/electron so this can
// be unit-tested directly.

const ACCENT_COLORS = ['emerald', 'blue', 'violet', 'rose'];

const DEFAULT_SETTINGS = {
  defaultFolder: null,
  defaultQuality: null,
  accentColor: 'emerald',
};

// Unknown keys and invalid values (like an accentColor with no palette)
// are dropped rather than saved — a typo or a future rollback shouldn't be
// able to corrupt someone's settings file into an unusable state.
function mergeSettings(current, updates) {
  const next = { ...current };

  if ('defaultFolder' in updates) {
    next.defaultFolder = updates.defaultFolder || null;
  }
  if ('defaultQuality' in updates) {
    next.defaultQuality = updates.defaultQuality ? String(updates.defaultQuality) : null;
  }
  if ('accentColor' in updates && ACCENT_COLORS.includes(updates.accentColor)) {
    next.accentColor = updates.accentColor;
  }

  return next;
}

function parseSettingsFile(jsonText) {
  try {
    const data = JSON.parse(jsonText);
    return mergeSettings(DEFAULT_SETTINGS, data && typeof data === 'object' ? data : {});
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

module.exports = { ACCENT_COLORS, DEFAULT_SETTINGS, mergeSettings, parseSettingsFile };
