// Named accent-color presets for the "theme" setting. Every literal
// Tailwind class used here has to appear as a complete string somewhere in
// this file for Tailwind's build-time scanner to generate CSS for it —
// that's why this is a lookup table of whole class names rather than
// anything built with a template literal like `bg-${color}-500`, which
// Tailwind can't see coming and would silently produce no CSS for.
//
// ACCENT_COLORS must stay in sync with electron/settings.js's own
// ACCENT_COLORS — the renderer can't import that file directly (see
// isPlaylistUrl in App.jsx for the same situation), so this is the
// renderer's copy of the same fixed list.
export const ACCENT_COLORS = ['emerald', 'blue', 'violet', 'rose'];

export const ACCENT_THEMES = {
  emerald: {
    swatch: 'bg-emerald-500',
    solid: 'bg-emerald-500 hover:bg-emerald-400',
    fill: 'bg-emerald-500',
    border: 'border-emerald-500',
    ring: 'focus:ring-emerald-500',
  },
  blue: {
    swatch: 'bg-blue-500',
    solid: 'bg-blue-500 hover:bg-blue-400',
    fill: 'bg-blue-500',
    border: 'border-blue-500',
    ring: 'focus:ring-blue-500',
  },
  violet: {
    swatch: 'bg-violet-500',
    solid: 'bg-violet-500 hover:bg-violet-400',
    fill: 'bg-violet-500',
    border: 'border-violet-500',
    ring: 'focus:ring-violet-500',
  },
  rose: {
    swatch: 'bg-rose-500',
    solid: 'bg-rose-500 hover:bg-rose-400',
    fill: 'bg-rose-500',
    border: 'border-rose-500',
    ring: 'focus:ring-rose-500',
  },
};
