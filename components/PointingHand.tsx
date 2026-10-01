"use client";

// A simple, flat-style pointing hand with a colored wristband, used to show
// which player voted for a given card. The index finger is offset to one
// side with the other three fingers curled beside it (a normal "pointing"
// gesture) - NOT centered, which would misread as a raised middle finger.
// The hand tone is a neutral glove-like cream so it reads as a stylized UI
// element rather than a depiction of a specific skin tone.
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
      {/* palm / back of hand */}
      <rect x="9" y="36" width="44" height="28" rx="13" fill={HAND_TONE} />
      {/* folded middle/ring/pinky fingers, grouped to one side */}
      <circle cx="33" cy="38" r="7.5" fill={HAND_SHADE} />
      <circle cx="42" cy="35" r="7.5" fill={HAND_SHADE} />
      <circle cx="50" cy="39" r="7" fill={HAND_SHADE} />
      {/* thumb, tucked to the other side */}
      <ellipse cx="14" cy="52" rx="7" ry="10" fill={HAND_TONE} transform="rotate(-25 14 52)" />
      {/* index finger, extended and pointing up, offset to the left */}
      <rect x="9" y="2" width="14" height="40" rx="7" fill={HAND_TONE} />
      <rect x="9" y="2" width="14" height="10" rx="5" fill={HAND_SHADE} opacity="0.5" />
    </svg>
  );
}
