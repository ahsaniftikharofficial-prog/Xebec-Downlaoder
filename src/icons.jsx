// Minimal, hand-drawn line icons used across the toolbar. Kept dependency-free
// (no icon package to install) and deliberately plain: 24x24 viewBox, ~1.6
// stroke weight, currentColor throughout so each icon inherits whatever
// text color its button already has (including the dark-on-accent case for
// the Direct Download button).

export function IconGear({ className = 'w-5 h-5' }) {
  const teeth = Array.from({ length: 8 });
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
      {teeth.map((_, i) => (
        <rect
          key={i}
          x="10.9"
          y="1.3"
          width="2.2"
          height="3.6"
          rx="1"
          fill="currentColor"
          transform={`rotate(${(i * 360) / teeth.length} 12 12)`}
        />
      ))}
      <circle cx="12" cy="12" r="6.1" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="12" cy="12" r="2.1" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

export function IconHistory({ className = 'w-5 h-5' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
      <path
        d="M4.5 9.6A7.9 7.9 0 1 1 4 14.2"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path d="M4.3 5.8V9.7h3.9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 8.4v4.1l2.9 1.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconPaste({ className = 'w-5 h-5' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
      <rect x="5.5" y="4.3" width="13" height="16.4" rx="2.1" stroke="currentColor" strokeWidth="1.6" />
      <rect x="9" y="2.6" width="6" height="3.2" rx="1" fill="currentColor" />
      <path d="M8.7 11.6h6.6M8.7 15.3h4.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function IconInfo({ className = 'w-5 h-5' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="8.3" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="12" cy="8.1" r="1.05" fill="currentColor" />
      <path d="M12 11.1v5.3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function IconDownload({ className = 'w-5 h-5' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
      <path
        d="M12 3.8v10.6M7.8 11.2 12 15.5l4.2-4.3"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M4.8 16.2v1.9a2.3 2.3 0 0 0 2.3 2.3h9.8a2.3 2.3 0 0 0 2.3-2.3v-1.9"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconClose({ className = 'w-4 h-4' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
      <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function IconSpinner({ className = 'w-5 h-5' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={`${className} animate-spin`} xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.2" strokeOpacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}
