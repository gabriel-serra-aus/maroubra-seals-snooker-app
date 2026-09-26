"use client";

import { useId } from "react";

// A player's face beside their name (spec 6.6, O-18): their photo, or their initials on a colour picked from
// the name, so a row without a photo keeps the same shape as one with.

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const first = words[0][0];
  const last = words.length > 1 ? words[words.length - 1][0] : "";
  return (first + last).toUpperCase();
}

/** A steady hue per name, so a player keeps their colour from week to week. */
function hue(name: string): number {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

/** A round photo or initials, `size` pixels across, for HTML. */
export function Avatar({ name, photo, size = 26, className }: { name: string; photo: string | null; size?: number; className?: string }) {
  const style = { width: size, height: size, fontSize: Math.round(size * 0.42) };
  if (photo) {
    // Served by our own route with a year-long cache (spec 7.2): no image service, which would cost a
    // function call per size per viewer on Netlify's free tier.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={photo} alt="" className={`avatar ${className ?? ""}`} style={style} loading="lazy" decoding="async" />;
  }
  return (
    <span className={`avatar initials ${className ?? ""}`} style={{ ...style, background: `hsl(${hue(name)} 40% 42%)` }} aria-hidden>
      {initials(name)}
    </span>
  );
}

/** The same, inside the SVG tree: centred on (cx, cy) with radius r. */
export function AvatarSvg({ name, photo, cx, cy, r }: { name: string; photo: string | null; cx: number; cy: number; r: number }) {
  const clip = useId();
  if (photo) {
    return (
      <g className="tree-avatar">
        <clipPath id={clip}>
          <circle cx={cx} cy={cy} r={r} />
        </clipPath>
        <image href={photo} x={cx - r} y={cy - r} width={2 * r} height={2 * r} clipPath={`url(#${clip})`} preserveAspectRatio="xMidYMid slice" />
      </g>
    );
  }
  return (
    <g className="tree-avatar" aria-hidden>
      <circle cx={cx} cy={cy} r={r} style={{ fill: `hsl(${hue(name)} 40% 42%)` }} />
      <text x={cx} y={cy + r * 0.36} className="tree-initials" style={{ fontSize: r * 0.95 }}>
        {initials(name)}
      </text>
    </g>
  );
}
