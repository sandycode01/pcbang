
const PCB_ICONS = {
  cpu: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="6" y="6" width="12" height="12" rx="1"/><rect x="9" y="9" width="6" height="6"/><path d="M9 2v3M12 2v3M15 2v3M9 19v3M12 19v3M15 19v3M2 9h3M2 12h3M2 15h3M19 9h3M19 12h3M19 15h3"/></svg>`,
  gpu: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2" y="7" width="20" height="10" rx="1.5"/><circle cx="7" cy="12" r="2"/><circle cx="13" cy="12" r="2"/><path d="M18 10h2M18 14h2M2 17v2M6 17v2"/></svg>`,
  mobo: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="1.5"/><rect x="6" y="6" width="5" height="5"/><path d="M14 6h4M14 9h4M6 14h3M6 17h3M13 13h5v5h-5z"/></svg>`,
  ram: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="5" width="4" height="16" rx="1"/><rect x="9" y="5" width="4" height="16" rx="1"/><rect x="15" y="5" width="4" height="16" rx="1"/><path d="M4 5v-1M6 5v-1M10 5v-1M12 5v-1M16 5v-1M18 5v-1"/></svg>`,
  storage: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="0.8" fill="currentColor"/><path d="M7 7h.01"/></svg>`,
  psu: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="5" width="18" height="14" rx="1.5"/><circle cx="8" cy="12" r="3"/><path d="M14 9h4M14 12h4M14 15h4"/></svg>`,
  case: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="5" y="2" width="14" height="20" rx="1.5"/><circle cx="9" cy="6" r="1"/><rect x="8" y="10" width="8" height="8" rx="1"/><path d="M9 20h6"/></svg>`,
  cooling: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 3c1.5 2 1.5 4 0 5.5M12 21c1.5-2 1.5-4 0-5.5M3 12c2-1.5 4-1.5 5.5 0M21 12c-2 1.5-4 1.5-5.5 0"/><circle cx="12" cy="12" r="2"/></svg>`,
  peripherals: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M9 10h.01M12 10h.01M15 10h.01M18 10h.01M7 14h10"/></svg>`,
  laptops: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2" y="4" width="20" height="16" rx="2"/><rect x="4" y="6" width="16" height="12" rx="1"/><path d="M8 10h8M8 14h8"/></svg>`
};

// Fallback generic "box" icon for anything unmapped
const PCB_ICON_FALLBACK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/></svg>`;

function pcbIcon(key) {
  return PCB_ICONS[key] || PCB_ICON_FALLBACK;
}
