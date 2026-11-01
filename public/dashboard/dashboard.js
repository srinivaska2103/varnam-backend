// Professional SVG Icon Registry (Heroicons / Lucide high-precision vector paths)
const SVG_ICONS = {
  // Navigation & System
  'layout-dashboard': `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>`,
  'network': `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="16" y="16" width="6" height="6" rx="1"/><rect x="2" y="16" width="6" height="6" rx="1"/><rect x="9" y="2" width="6" height="6" rx="1"/><path d="M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3"/><path d="M12 12V8"/></svg>`,
  'boxes': `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.97 12.92A2 2 0 0 0 2 14.63v3.24a2 2 0 0 0 .97 1.71l6 3.43a2 2 0 0 0 2.06 0l6-3.43a2 2 0 0 0 .97-1.71v-3.24a2 2 0 0 0-.97-1.71L11 9.49a2 2 0 0 0-2.06 0z"/><path d="m7 16.5-4.74-2.85"/><path d="m7 16.5 5 3"/><path d="M7 16.5v5.17"/><path d="M12 13.5V19"/><path d="M17 16.5l4.74-2.85"/><path d="M17 16.5l-5 3"/><path d="M17 16.5v5.17"/><path d="M7.97 4.42A2 2 0 0 0 7 6.13v4.37l5 3 5-3V6.13a2 2 0 0 0-.97-1.71l-3-1.71a2 2 0 0 0-2.06 0z"/><path d="M12 8 7.26 5.15"/><path d="m12 8 4.74-2.85"/><path d="M12 13.5V8"/></svg>`,
  'database': `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 21 19V5"/><path d="M3 12A9 3 0 0 0 21 12"/></svg>`,
  'shield-check': `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/></svg>`,
  'settings': `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>`,

  // Module Icons (20x20 in cards)
  'lock': `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`,
  'mail-check': `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 13V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v12c0 1.1.9 2 2 2h9"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/><path d="m16 19 2 2 4-4"/></svg>`,
  'building-2': `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/></svg>`,
  'credit-card': `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>`,
  'users': `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  'help-circle': `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>`,
  'calendar': `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/></svg>`,
  'calendar-days': `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/><path d="M8 14h.01"/><path d="M12 14h.01"/><path d="M16 14h.01"/><path d="M8 18h.01"/><path d="M12 18h.01"/><path d="M16 18h.01"/></svg>`,
  'receipt': `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 17.5v-11"/></svg>`,
  'sparkles': `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/><path d="M20 3v4"/><path d="M22 5h-4"/><path d="M4 17v2"/><path d="M5 18H3"/></svg>`,
  'file-text': `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/></svg>`,
  'trending-down': `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 17 13.5 8.5 8.5 13.5 2 7"/><polyline points="16 17 22 17 22 11"/></svg>`,
  'package': `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>`,
  'bar-chart-3': `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/></svg>`,
  'bell': `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>`,
  'mail': `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>`,
  'message-square': `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
  'image': `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>`,
  'globe': `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>`,
  'layers': `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/></svg>`,
  'activity': `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>`,
  'heart-pulse': `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/><path d="M3.22 12H9.5l.5-1 2 4.5 2-7 1.5 3.5h5.27"/></svg>`,
  'zap': `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
  'table': `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18"/><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/></svg>`,
  'key': `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15.5 7.5 2.3 2.3a1 1 0 0 0 1.4 0l2.1-2.1a1 1 0 0 0 0-1.4L19 4"/><path d="m21 2-9.6 9.6"/><circle cx="7.5" cy="15.5" r="5.5"/></svg>`,
  'sliders': `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" x2="4" y1="21" y2="14"/><line x1="4" x2="4" y1="10" y2="3"/><line x1="12" x2="12" y1="21" y2="12"/><line x1="12" x2="12" y1="8" y2="3"/><line x1="20" x2="20" y1="21" y2="16"/><line x1="20" x2="20" y1="12" y2="3"/><line x1="1" x2="7" y1="14" y2="14"/><line x1="9" x2="15" y1="8" y2="8"/><line x1="17" x2="23" y1="16" y2="16"/></svg>`,
  'search': `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>`,
  'refresh-cw': `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>`,
  'copy': `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`,
  'check': `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>`,
  'menu': `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/></svg>`,
  'x': `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`,
  'external-link': `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>`,
  'check-circle-2': `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>`,
  'heart': `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>`,
  'box': `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>`
};

/**
 * Returns an inline SVG element or fallback
 */
function getIconSvg(name, size = 18) {
  const normalized = (name || '').toLowerCase().replace(/_/g, '-').trim();
  if (SVG_ICONS[normalized]) {
    return SVG_ICONS[normalized];
  }
  return SVG_ICONS['box'];
}

let monitoringData = null;
let currentTab = 'overview';

// Navigation & Tab Switching
function navigateToTab(tabId) {
  currentTab = tabId;

  // Update nav menu UI
  document.querySelectorAll('.nav-item').forEach((item) => {
    if (item.getAttribute('data-tab') === tabId) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });

  // Update tab pane UI
  document.querySelectorAll('.tab-pane').forEach((pane) => {
    pane.classList.remove('active');
  });

  const activePane = document.getElementById(`tab-${tabId}`);
  if (activePane) {
    activePane.classList.add('active');
  }

  // Update Breadcrumb
  const titles = {
    overview: 'Overview',
    routes: 'API Routes Explorer',
    modules: 'Modules Catalogue',
    database: 'Database & Schema',
    authentication: 'Authentication & Security',
    config: 'Configuration',
  };
  const crumb = document.getElementById('current-crumb');
  if (crumb) crumb.textContent = titles[tabId] || tabId;

  // Close mobile sidebar if open
  document.getElementById('sidebar')?.classList.remove('mobile-open');
}

// Fetch real metrics from backend
async function fetchMonitoringData() {
  const refreshIcon = document.getElementById('refresh-icon');
  if (refreshIcon) refreshIcon.classList.add('spinning');

  try {
    const res = await fetch('/api/dev/monitoring-data');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    monitoringData = json.data;
    renderDashboard(monitoringData);
  } catch (error) {
    console.error('Failed to fetch monitoring telemetry:', error);
    const badge = document.getElementById('overall-status-badge');
    const badgeText = document.getElementById('overall-status-text');
    if (badge && badgeText) {
      badge.className = 'status-badge offline';
      badgeText.textContent = 'OFFLINE';
    }
  } finally {
    if (refreshIcon) {
      setTimeout(() => refreshIcon.classList.remove('spinning'), 400);
    }
  }
}

// Render data into DOM
function renderDashboard(data) {
  if (!data) return;

  const { stats, serviceHealth, apiRoutes, modules, databaseTables, configuration } = data;

  // 1. Overall Header Badge
  const statusBadge = document.getElementById('overall-status-badge');
  const statusText = document.getElementById('overall-status-text');
  if (statusBadge && statusText) {
    statusBadge.className = `status-badge ${stats.apiStatus.toLowerCase()}`;
    statusText.textContent = stats.apiStatus;
  }

  // 2. Metrics Cards
  const apiStatusEl = document.getElementById('card-api-status');
  const apiLatencyEl = document.getElementById('card-api-latency');
  if (apiStatusEl) apiStatusEl.textContent = stats.apiStatus === 'OPERATIONAL' ? 'Operational' : 'Degraded';
  if (apiLatencyEl) apiLatencyEl.textContent = `${stats.responseTimeMs || 2} ms`;

  const dbStatusEl = document.getElementById('card-db-status');
  const dbLatencyEl = document.getElementById('card-db-latency');
  if (dbStatusEl) dbStatusEl.textContent = stats.databaseStatus;
  if (dbLatencyEl) dbLatencyEl.textContent = `${stats.databaseLatencyMs || 3} ms`;

  const routesCountEl = document.getElementById('card-routes-count');
  const routesPlannedEl = document.getElementById('card-routes-planned');
  if (routesCountEl) routesCountEl.textContent = `${stats.implementedRoutesCount} Active`;
  if (routesPlannedEl) routesPlannedEl.textContent = stats.totalRoutesCount - stats.implementedRoutesCount;

  const modulesCountEl = document.getElementById('card-modules-count');
  const modulesImplEl = document.getElementById('card-modules-implemented');
  if (modulesCountEl) modulesCountEl.textContent = `${stats.totalModulesCount} Total`;
  if (modulesImplEl) modulesImplEl.textContent = `${stats.implementedModulesCount + stats.partiallyImplementedModulesCount}`;

  // 3. Last Checked Time
  const lastCheckedEl = document.getElementById('last-checked-time');
  if (lastCheckedEl) {
    const timeStr = new Date(data.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    lastCheckedEl.textContent = timeStr;
  }

  // 4. Sidebar info
  const sideEnv = document.getElementById('sidebar-env-name');
  const sideEnvBadge = document.getElementById('sidebar-env-badge');
  if (sideEnv) sideEnv.textContent = configuration.environment;
  if (sideEnvBadge) sideEnvBadge.textContent = configuration.environment.toUpperCase();

  // 5. Service Health Table
  renderServiceHealth(serviceHealth);

  // 6. Routes Tables
  renderRoutes(apiRoutes);

  // 7. Modules Grid
  renderModules(modules);

  // 8. Database Tables Inventory
  renderDbTables(databaseTables);

  // 9. Configuration Grid
  renderConfiguration(configuration);

  // Render static icons if any data-icon attributes exist
  document.querySelectorAll('[data-icon]').forEach(el => {
    const iconName = el.getAttribute('data-icon');
    el.innerHTML = getIconSvg(iconName);
  });
}

function renderServiceHealth(services) {
  const tbody = document.getElementById('service-health-tbody');
  if (!tbody || !services) return;

  tbody.innerHTML = services
    .map((s) => {
      let badgeClass = 'badge-green';
      if (s.badge === 'Error' || s.status === 'Disconnected') badgeClass = 'badge-red';
      else if (s.badge === 'Pending' || s.status === 'Not Configured') badgeClass = 'badge-orange';

      return `
      <tr>
        <td><strong>${s.service}</strong></td>
        <td><span class="badge ${badgeClass}">${s.status}</span></td>
        <td style="color: var(--text-secondary);">${s.details}</td>
      </tr>
    `;
    })
    .join('');
}

function renderRoutes(routes) {
  const tbodyOverview = document.getElementById('overview-routes-tbody');
  const tbodyExplorer = document.getElementById('routes-table-tbody');

  if (tbodyOverview) {
    tbodyOverview.innerHTML = routes
      .slice(0, 6)
      .map(
        (r) => `
      <tr>
        <td><span class="method-badge method-${r.method.toLowerCase()}">${r.method}</span></td>
        <td><code>${r.endpoint}</code></td>
        <td>${r.module}</td>
        <td><span class="badge ${r.auth.includes('Required') ? 'badge-purple' : 'badge-gray'}">${r.auth}</span></td>
        <td><span class="badge ${r.status === 'Implemented' ? 'badge-green' : 'badge-orange'}">${r.status}</span></td>
      </tr>
    `
      )
      .join('');
  }

  if (tbodyExplorer) {
    renderFilteredRoutes(routes);
  }
}

function renderFilteredRoutes(routes) {
  const tbodyExplorer = document.getElementById('routes-table-tbody');
  if (!tbodyExplorer) return;

  const methodFilter = document.getElementById('route-method-filter')?.value || 'ALL';
  const authFilter = document.getElementById('route-auth-filter')?.value || 'ALL';
  const statusFilter = document.getElementById('route-status-filter')?.value || 'ALL';
  const search = document.getElementById('global-search')?.value.toLowerCase() || '';

  const filtered = routes.filter((r) => {
    if (methodFilter !== 'ALL' && r.method !== methodFilter) return false;
    if (authFilter === 'Public' && !r.auth.includes('Public')) return false;
    if (authFilter === 'Bearer' && !r.auth.includes('Bearer')) return false;
    if (statusFilter !== 'ALL' && r.status !== statusFilter) return false;
    if (search && !r.endpoint.toLowerCase().includes(search) && !r.module.toLowerCase().includes(search) && !r.description.toLowerCase().includes(search)) {
      return false;
    }
    return true;
  });

  if (filtered.length === 0) {
    tbodyExplorer.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-secondary); padding: 32px;">No endpoints match the filter criteria.</td></tr>`;
    return;
  }

  tbodyExplorer.innerHTML = filtered
    .map(
      (r) => `
    <tr>
      <td><span class="method-badge method-${r.method.toLowerCase()}">${r.method}</span></td>
      <td><code style="font-weight: 600;">${r.endpoint}</code></td>
      <td>${r.module}</td>
      <td><span class="badge ${r.auth.includes('Required') ? 'badge-purple' : 'badge-gray'}">${r.auth}</span></td>
      <td><span class="badge ${r.status === 'Implemented' ? 'badge-green' : 'badge-orange'}">${r.status}</span></td>
      <td style="color: var(--text-secondary); max-width: 320px;">${r.description}</td>
      <td style="text-align: right;">
        <button class="copy-btn" onclick="openRouteDrawer('${encodeURIComponent(JSON.stringify(r))}')">
          Details
        </button>
      </td>
    </tr>
  `
    )
    .join('');
}

function renderModules(modules) {
  const container = document.getElementById('modules-container');
  if (!container || !modules) return;

  const statusFilter = document.getElementById('module-status-filter')?.value || 'ALL';

  const filtered = modules.filter((m) => {
    if (statusFilter !== 'ALL' && m.status !== statusFilter) return false;
    return true;
  });

  // Icon mapping dictionary ensuring exact match to SVG_ICONS keys
  const iconMap = {
    'auth': 'lock',
    'email_otp': 'mail-check',
    'business_mgmt': 'building-2',
    'subscription_plans': 'credit-card',
    'customers': 'users',
    'enquiries': 'help-circle',
    'bookings': 'calendar',
    'booking_calendar': 'calendar-days',
    'payment_tracking': 'receipt',
    'services_packages': 'sparkles',
    'quotations': 'file-text',
    'expenses': 'trending-down',
    'inventory': 'package',
    'analytics': 'bar-chart-3',
    'notifications': 'bell',
    'email_integration': 'mail',
    'whatsapp_integration': 'message-square',
    'portfolio': 'image',
    'exclusive_website': 'globe',
    'audit_logs': 'shield-check',
  };

  container.innerHTML = filtered
    .map((m) => {
      let badgeClass = 'badge-green';
      if (m.status === 'Planned') badgeClass = 'badge-orange';
      else if (m.status === 'Partially Implemented') badgeClass = 'badge-blue';
      else if (m.status === 'Needs Configuration') badgeClass = 'badge-red';

      const iconKey = iconMap[m.id] || (m.icon ? m.icon.toLowerCase().replace(/([a-z])([A-Z0-9])/g, '$1-$2').toLowerCase() : 'box');
      const iconSvg = getIconSvg(iconKey);

      return `
      <div class="module-card">
        <div class="module-card-top">
          <div class="module-icon">
            ${iconSvg}
          </div>
          <span class="badge ${badgeClass}">${m.status}</span>
        </div>
        <div class="module-title">${m.name}</div>
        <div class="module-desc">${m.description}</div>
        <div class="module-meta">
          <span>Category: <strong>${m.category}</strong></span>
          <span>Routes: <strong>${m.routesCount}</strong></span>
        </div>
      </div>
    `;
    })
    .join('');
}

function renderDbTables(tables) {
  const tbody = document.getElementById('db-tables-tbody');
  if (!tbody || !tables) return;

  const search = document.getElementById('db-search')?.value.toLowerCase() || '';

  const filtered = tables.filter((t) => {
    if (search && !t.name.toLowerCase().includes(search) && !t.category.toLowerCase().includes(search) && !t.description.toLowerCase().includes(search)) {
      return false;
    }
    return true;
  });

  tbody.innerHTML = filtered
    .map(
      (t) => `
    <tr>
      <td><code style="font-size: 13.5px; font-weight: 700; color: var(--color-primary);">${t.name}</code></td>
      <td><span class="badge badge-purple">${t.category}</span></td>
      <td><span class="badge badge-gray">${t.records}</span></td>
      <td style="color: var(--text-secondary);">${t.description}</td>
    </tr>
  `
    )
    .join('');
}

function renderConfiguration(config) {
  const grid = document.getElementById('config-grid');
  if (!grid || !config) return;

  const items = [
    { key: 'Application Name', val: config.applicationName },
    { key: 'Developer / Vendor', val: config.vendor },
    { key: 'API Version', val: config.apiVersion },
    { key: 'Node.js Version', val: config.nodeVersion },
    { key: 'Environment Mode', val: config.environment },
    { key: 'Server Port', val: config.port },
    { key: 'Allowed Frontend URL', val: config.frontendUrl },
    { key: 'Database Engine', val: config.databaseProvider },
    { key: 'Database Connection', val: config.databaseStatus },
    { key: 'Email Transporter', val: config.emailStatus },
    { key: 'SMTP Host & Port', val: `${config.smtpHost}:${config.smtpPort}` },
    { key: 'Sender Email Address', val: config.senderAddress },
    { key: 'JWT Auth Status', val: config.jwtStatus },
    { key: 'JWT Token Expiration', val: config.jwtExpiresIn },
    { key: 'OTP Expiry Duration', val: `${config.otpExpiryMinutes} minutes` },
    { key: 'Max OTP Verification Attempts', val: config.otpMaxAttempts },
  ];

  grid.innerHTML = items
    .map(
      (item) => `
    <div class="config-item">
      <div class="config-key">${item.key}</div>
      <div class="config-val">${item.val}</div>
    </div>
  `
    )
    .join('');
}

// Route Drawer Handlers
function openRouteDrawer(routeJsonStr) {
  try {
    const route = JSON.parse(decodeURIComponent(routeJsonStr));
    const overlay = document.getElementById('drawer-overlay');
    if (!overlay) return;

    document.getElementById('drawer-method').textContent = route.method;
    document.getElementById('drawer-method').className = `method-badge method-${route.method.toLowerCase()}`;
    document.getElementById('drawer-title').textContent = route.endpoint;
    document.getElementById('drawer-desc').textContent = route.description;
    document.getElementById('drawer-auth').textContent = route.auth;
    document.getElementById('drawer-status').textContent = route.status;

    document.getElementById('drawer-request-body').textContent = route.requestBody ? JSON.stringify(route.requestBody, null, 2) : 'null (No body required)';
    document.getElementById('drawer-response-body').textContent = route.responseExample ? JSON.stringify(route.responseExample, null, 2) : '{}';

    const copyBtn = document.getElementById('drawer-copy-btn');
    if (copyBtn) {
      copyBtn.onclick = () => {
        navigator.clipboard.writeText(route.endpoint);
        copyBtn.innerHTML = `${getIconSvg('check')}<span>Copied!</span>`;
        setTimeout(() => {
          copyBtn.innerHTML = `${getIconSvg('copy')}<span>Copy Endpoint</span>`;
        }, 1500);
      };
    }

    overlay.classList.add('open');
  } catch (err) {
    console.error('Failed to open drawer:', err);
  }
}

// Event Listeners Setup
document.addEventListener('DOMContentLoaded', () => {
  // Navigation tabs click listener
  document.querySelectorAll('.nav-item').forEach((item) => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const tabId = item.getAttribute('data-tab');
      if (tabId) navigateToTab(tabId);
    });
  });

  // Mobile drawer toggle
  document.getElementById('mobile-toggle')?.addEventListener('click', () => {
    document.getElementById('sidebar')?.classList.toggle('mobile-open');
  });

  // Refresh button click
  document.getElementById('refresh-btn')?.addEventListener('click', () => {
    fetchMonitoringData();
  });

  // Drawer close buttons
  document.getElementById('drawer-close')?.addEventListener('click', () => {
    document.getElementById('drawer-overlay')?.classList.remove('open');
  });

  document.getElementById('drawer-overlay')?.addEventListener('click', (e) => {
    if (e.target === document.getElementById('drawer-overlay')) {
      document.getElementById('drawer-overlay')?.classList.remove('open');
    }
  });

  // Filter change events
  ['route-method-filter', 'route-auth-filter', 'route-status-filter'].forEach((id) => {
    document.getElementById(id)?.addEventListener('change', () => {
      if (monitoringData) renderFilteredRoutes(monitoringData.apiRoutes);
    });
  });

  document.getElementById('module-status-filter')?.addEventListener('change', () => {
    if (monitoringData) renderModules(monitoringData.modules);
  });

  document.getElementById('global-search')?.addEventListener('input', () => {
    if (monitoringData) {
      renderFilteredRoutes(monitoringData.apiRoutes);
    }
  });

  document.getElementById('db-search')?.addEventListener('input', () => {
    if (monitoringData) {
      renderDbTables(monitoringData.databaseTables);
    }
  });

  // Hydrate all static vector icons immediately
  document.querySelectorAll('[data-icon]').forEach((el) => {
    const iconName = el.getAttribute('data-icon');
    el.innerHTML = getIconSvg(iconName);
  });

  // Initial Fetch
  fetchMonitoringData();
});
