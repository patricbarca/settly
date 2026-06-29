export function Logo({ size = 40 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: "block" }}
    >
      <defs>
        <linearGradient id="sg-top" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#1FD5A0" />
          <stop offset="100%" stopColor="#0FA3A3" />
        </linearGradient>
        <linearGradient id="sg-mid" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#0FA3A3" />
          <stop offset="100%" stopColor="#3B82F6" />
        </linearGradient>
        <linearGradient id="sg-bot" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#3B82F6" />
          <stop offset="100%" stopColor="#2563EB" />
        </linearGradient>
        <linearGradient id="sg-shadow-top" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0c8a80" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#0c8a80" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="sg-shadow-bot" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1a4faa" stopOpacity="0" />
          <stop offset="100%" stopColor="#1a4faa" stopOpacity="0.5" />
        </linearGradient>
      </defs>

      {/* Top arc of S — outer ribbon */}
      <path
        d="M 62 14 C 82 14 88 28 88 36 C 88 50 74 56 58 56 L 42 56 C 26 56 18 62 18 72 C 18 82 26 88 38 88"
        stroke="url(#sg-top)"
        strokeWidth="17"
        strokeLinecap="round"
        fill="none"
      />
      {/* Bottom arc of S — outer ribbon */}
      <path
        d="M 38 88 C 18 88 12 74 12 66 C 12 52 26 46 42 46 L 58 46 C 74 46 82 40 82 30 C 82 20 74 14 62 14"
        stroke="url(#sg-bot)"
        strokeWidth="17"
        strokeLinecap="round"
        fill="none"
      />

      {/* Inner ribbon shadow top */}
      <path
        d="M 62 14 C 82 14 88 28 88 36 C 88 50 74 56 58 56 L 42 56"
        stroke="url(#sg-shadow-top)"
        strokeWidth="17"
        strokeLinecap="round"
        fill="none"
      />
      {/* Inner ribbon shadow bot */}
      <path
        d="M 42 46 C 26 46 12 52 12 66 C 12 74 18 88 38 88"
        stroke="url(#sg-shadow-bot)"
        strokeWidth="17"
        strokeLinecap="round"
        fill="none"
      />

      {/* Mid crossover highlight */}
      <path
        d="M 58 56 L 42 46"
        stroke="url(#sg-mid)"
        strokeWidth="17"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}
