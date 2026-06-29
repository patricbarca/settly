export function Logo({ size = 40 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: "block" }}
    >
      <defs>
        <linearGradient id="settly-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#5B5BF0" />
          <stop offset="55%" stopColor="#0FA3A3" />
          <stop offset="100%" stopColor="#0EA5E9" />
        </linearGradient>
      </defs>
      <rect x="3" y="3" width="42" height="42" rx="13" fill="url(#settly-g)" />
      <circle cx="19" cy="24" r="9" fill="#ffffff" fillOpacity="0.92" />
      <circle cx="29" cy="24" r="9" fill="#ffffff" fillOpacity="0.5" />
      <path
        d="M15.6 24.4l2.7 2.7 5.1-5.6"
        stroke="#5B5BF0"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
