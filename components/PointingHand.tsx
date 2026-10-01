"use client";

// A simple, flat-style pointing hand with a colored wristband, used to show
// which player a revealed card belongs to. The hand tone is a neutral
// glove-like cream so it reads as a stylized UI element rather than a
// depiction of a specific skin tone.
const HAND_TONE = "#f3ddc3";
const HAND_SHADE = "#d9bb95";

export default function PointingHand({
  color,
  className,
  style,
}: {
  color: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <svg
      viewBox="0 0 60 92"
      className={className}
      style={style}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* forearm */}
      <rect x="19" y="58" width="22" height="24" rx="8" fill={HAND_TONE} />
      {/* wristband */}
      <rect x="15" y="64" width="30" height="13" rx="6" fill={color} stroke="rgba(0,0,0,0.25)" strokeWidth="1" />
      {/* palm */}
      <rect x="13" y="38" width="34" height="27" rx="13" fill={HAND_TONE} />
      {/* folded fingers */}
      <circle cx="19" cy="40" r="7.5" fill={HAND_SHADE} />
      <circle cx="30" cy="37" r="7.5" fill={HAND_SHADE} />
      <circle cx="41" cy="40" r="7.5" fill={HAND_SHADE} />
      {/* thumb */}
      <ellipse cx="11" cy="54" rx="7" ry="10" fill={HAND_TONE} transform="rotate(-28 11 54)" />
      {/* index finger, pointing up */}
      <rect x="23" y="2" width="13" height="40" rx="6.5" fill={HAND_TONE} />
      <rect x="23" y="2" width="13" height="10" rx="5" fill={HAND_SHADE} opacity="0.5" />
    </svg>
  );
}
