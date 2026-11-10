/**
 * CRLogo — CR split-colour monogram logo mark.
 *
 * Left half: dark imperial blue (#002147) with white "C"
 * Right half: white (#ffffff) with near-black "R" (#1a1a18)
 * Clean vertical divider, rounded square.
 *
 * Props:
 *   size — side length in px (default 32). Border-radius scales proportionally.
 */

interface CRLogoProps {
  size?: number;
  className?: string;
}

export function CRLogo({ size = 32, className }: CRLogoProps) {
  const r = Math.round((size / 64) * 16); // border-radius scales from 16 at 64px
  const half = size / 2;
  const fontSize = Math.round(size * 0.6875); // 44/64 ≈ 0.6875
  const textY = Math.round(size * 0.72);      // 46/64 ≈ 0.72

  const uid = `cr-${size}`;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={className}
      aria-label="ClosingRoom logo"
      role="img"
    >
      <defs>
        <clipPath id={`${uid}-left`}>
          <rect x="0" y="0" width={half} height={size} />
        </clipPath>
        <clipPath id={`${uid}-right`}>
          <rect x={half} y="0" width={half} height={size} />
        </clipPath>
      </defs>

      {/* Full rounded square — blue (left half colour) */}
      <rect x="0" y="0" width={size} height={size} rx={r} ry={r} fill="#002147" />

      {/* Right half — white */}
      <rect
        x="0" y="0" width={size} height={size}
        rx={r} ry={r}
        fill="#ffffff"
        clipPath={`url(#${uid}-right)`}
      />

      {/* Letter C — centred in left half */}
      <text
        x={half / 2}
        y={textY}
        fontFamily="'Arial Black', 'Helvetica Neue', Arial, sans-serif"
        fontWeight="900"
        fontSize={fontSize}
        fill="#ffffff"
        textAnchor="middle"
        clipPath={`url(#${uid}-left)`}
      >
        C
      </text>

      {/* Letter R — centred in right half */}
      <text
        x={half + half / 2}
        y={textY}
        fontFamily="'Arial Black', 'Helvetica Neue', Arial, sans-serif"
        fontWeight="900"
        fontSize={fontSize}
        fill="#1a1a18"
        textAnchor="middle"
        clipPath={`url(#${uid}-right)`}
      >
        R
      </text>

      {/* Vertical divider */}
      <line
        x1={half} y1="0" x2={half} y2={size}
        stroke="#cbd5e1"
        strokeWidth={Math.max(0.5, size / 64)}
      />
    </svg>
  );
}
