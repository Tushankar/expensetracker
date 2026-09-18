/**
 * Alpha helpers.
 *
 * Glass is built almost entirely out of translucent restatements of colours that
 * already exist in the palette, so the one thing every layer needs is a way to
 * take a token and ask for a fraction of it.
 */

/** Accepts the `#RGB`, `#RRGGBB` and `rgb()/rgba()` forms used across the palette. */
export function withAlpha(color: string, alpha: number): string {
  const value = color.trim();

  const short = /^#([0-9a-f]{3})$/i.exec(value);
  if (short?.[1]) {
    const [r, g, b] = short[1].split('') as [string, string, string];
    return rgba(parseInt(r + r, 16), parseInt(g + g, 16), parseInt(b + b, 16), alpha);
  }

  const long = /^#([0-9a-f]{6})$/i.exec(value);
  if (long?.[1]) {
    const int = parseInt(long[1], 16);
    return rgba((int >> 16) & 255, (int >> 8) & 255, int & 255, alpha);
  }

  // Already functional: re-alpha it rather than layering a second wrapper, so
  // `withAlpha(withAlpha(x, 0.4), 0.2)` means 0.2 and not 0.08.
  const fn = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(value);
  if (fn?.[1] && fn[2] && fn[3]) {
    return rgba(Number(fn[1]), Number(fn[2]), Number(fn[3]), alpha);
  }

  return value;
}

/** Pure white at a given alpha — the specular highlight every glass edge uses. */
export function sheenWhite(alpha: number): string {
  return rgba(255, 255, 255, alpha);
}

/** Pure black at a given alpha — the shaded underside of a glass slab. */
export function shadeBlack(alpha: number): string {
  return rgba(0, 0, 0, alpha);
}

/**
 * Flatten a translucent colour against a backdrop.
 *
 * Needed because Reduce Transparency has to produce a *solid* surface that still
 * looks like the glass it replaces, and the only honest way to get that colour is
 * to composite the glass fill over the canvas by hand.
 */
export function flatten(color: string, backdrop: string): string {
  const top = parse(color);
  const base = parse(backdrop);
  if (!top || !base) return color;

  const a = top.a;
  return rgba(
    Math.round(top.r * a + base.r * (1 - a)),
    Math.round(top.g * a + base.g * (1 - a)),
    Math.round(top.b * a + base.b * (1 - a)),
    1,
  );
}

function parse(color: string): { r: number; g: number; b: number; a: number } | null {
  const value = color.trim();

  const long = /^#([0-9a-f]{6})$/i.exec(value);
  if (long?.[1]) {
    const int = parseInt(long[1], 16);
    return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255, a: 1 };
  }

  const short = /^#([0-9a-f]{3})$/i.exec(value);
  if (short?.[1]) {
    const [r, g, b] = short[1].split('') as [string, string, string];
    return {
      r: parseInt(r + r, 16),
      g: parseInt(g + g, 16),
      b: parseInt(b + b, 16),
      a: 1,
    };
  }

  const fn = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+))?/i.exec(value);
  if (fn?.[1] && fn[2] && fn[3]) {
    return {
      r: Number(fn[1]),
      g: Number(fn[2]),
      b: Number(fn[3]),
      a: fn[4] === undefined ? 1 : Number(fn[4]),
    };
  }

  return null;
}

function rgba(r: number, g: number, b: number, a: number): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  const alpha = Math.max(0, Math.min(1, a));
  return `rgba(${clamp(r)}, ${clamp(g)}, ${clamp(b)}, ${Number(alpha.toFixed(4))})`;
}
