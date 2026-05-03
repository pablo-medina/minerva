/**
 * Which chat export formats are reasonable to offer on this client.
 * (Conservative checks — we avoid promising PDF where canvas/memory is often problematic.)
 */

export type ExportCapabilitySet = {
  html: boolean;
  markdown: boolean;
  pdf: boolean;
};

function isIOSLike(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const maxTouchPoints = navigator.maxTouchPoints ?? 0;
  const platform = navigator.platform || '';
  if (/iPhone|iPod/i.test(ua)) return true;
  if (/iPad/i.test(ua)) return true;
  if (platform === 'MacIntel' && maxTouchPoints > 1) return true;
  return false;
}

export function getExportCapabilities(): ExportCapabilitySet {
  const pdf = !isIOSLike();
  return {
    html: true,
    markdown: true,
    pdf,
  };
}
