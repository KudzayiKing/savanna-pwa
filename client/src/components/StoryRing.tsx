/*
 * Segmented gold ring for Story avatars, Instagram-style:
 *
 *   1 live Story  -> one continuous ring
 *   2 live Stories -> the ring is split into two arcs
 *   N live Stories -> N arcs with a small gap between each
 *
 * It is drawn as N SVG <circle> elements with a stroke-dash pattern rather than
 * a CSS conic-gradient, because the same component has to stay crisp at 30px
 * (collapsed header cluster), 44px (desktop rail) and 56px (expanded mobile
 * rail), and a gradient ring shows a seam where it wraps.
 *
 * The SVG strokes with `currentColor`, so the gold is themed by the
 * `.savanna-story-ring` rule in index.css — keep the ring OUTSIDE any
 * `.savanna-brand-token` element, whose descendant rule would otherwise
 * force the colour with `!important`.
 */

/** Beyond this, individual arcs stop being legible on a 30px chip. */
const MAX_SEGMENTS = 12;

type StoryRingProps = {
  /** Live Story count for this author. Values <= 0 render nothing useful. */
  count: number;
  /** Stroke width in viewBox units (the viewBox is 100 x 100). */
  strokeWidth?: number;
  /** Gap between arcs, as a fraction of one arc's sweep. */
  gapRatio?: number;
  className?: string;
};

export function StoryRing({
  count,
  strokeWidth = 3.5,
  gapRatio = 0.22,
  className = "",
}: StoryRingProps) {
  const segments = Math.max(1, Math.min(Math.floor(count) || 1, MAX_SEGMENTS));
  const radius = 50 - strokeWidth / 2;
  const circumference = 2 * Math.PI * radius;

  // A single Story is one unbroken ring, so no dash pattern at all.
  if (segments === 1) {
    return (
      <svg
        viewBox="0 0 100 100"
        aria-hidden="true"
        className={["savanna-story-ring", className].filter(Boolean).join(" ")}
      >
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
        />
      </svg>
    );
  }

  const step = circumference / segments;
  // Round caps extend each end of a dash by half a stroke width, so the dash we
  // draw is a full stroke width shorter than the sweep we want it to occupy.
  // Without that correction the caps eat the gap and the ring looks solid.
  const gap = Math.min(step * gapRatio, strokeWidth * 1.9);
  const dash = Math.max(step - gap - strokeWidth, step * 0.3);

  return (
    <svg
      viewBox="0 0 100 100"
      aria-hidden="true"
      className={["savanna-story-ring", className].filter(Boolean).join(" ")}
    >
      {/* Start the first arc at 12 o'clock instead of 3 o'clock. */}
      <g transform="rotate(-90 50 50)">
        {Array.from({ length: segments }, (_, index) => (
          <circle
            key={index}
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circumference - dash}`}
            strokeDashoffset={-index * step}
          />
        ))}
      </g>
    </svg>
  );
}

export default StoryRing;
