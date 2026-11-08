/**
 * Time utility configured for GMT+3 (Damascus / Riyadh / Istanbul time)
 */
export const GMT_OFFSET_HOURS = 3;
export const GMT_OFFSET_MS = GMT_OFFSET_HOURS * 60 * 60 * 1000;

/**
 * Returns current Date adjusted to GMT+3
 */
export function getNowGmt3() {
  const now = new Date();
  return new Date(now.getTime() + GMT_OFFSET_MS);
}

/**
 * Formats any Date or ISO string into GMT+3 standard Arabic string
 * e.g. "2026/11/08 - 03:45"
 */
export function formatGmt3String(date, withSeconds = false) {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return String(date);
  // Add 3 hours to UTC time
  const gmt3 = new Date(d.getTime() + GMT_OFFSET_MS);
  const y = gmt3.getUTCFullYear();
  const m = String(gmt3.getUTCMonth() + 1).padStart(2, '0');
  const day = String(gmt3.getUTCDate()).padStart(2, '0');
  const hr = String(gmt3.getUTCHours()).padStart(2, '0');
  const min = String(gmt3.getUTCMinutes()).padStart(2, '0');
  if (withSeconds) {
    const sec = String(gmt3.getUTCSeconds()).padStart(2, '0');
    return `${y}/${m}/${day} - ${hr}:${min}:${sec}`;
  }
  return `${y}/${m}/${day} - ${hr}:${min}`;
}

