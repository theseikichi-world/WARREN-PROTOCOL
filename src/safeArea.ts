/**
 * How many pixels the OS is covering at each edge of the viewport.
 *
 * `index.html` asks iOS for an edge-to-edge web view (`viewport-fit=cover`
 * plus a translucent status bar), which means the page is drawn *under* the
 * clock and the home indicator. Layout pays that back through the `--sa-*`
 * custom properties in `index.css`; this is for the few places that need the
 * numbers in JS rather than in a style rule.
 *
 * Everywhere that is not a notched iPhone, every value here is 0.
 */
export function safeArea(): { top: number; bottom: number; left: number; right: number } {
  if (typeof window === 'undefined') return { top: 0, bottom: 0, left: 0, right: 0 }
  const cs = getComputedStyle(document.documentElement)
  const px = (name: string) => parseFloat(cs.getPropertyValue(name)) || 0
  return { top: px('--sa-top'), bottom: px('--sa-bottom'), left: px('--sa-left'), right: px('--sa-right') }
}
