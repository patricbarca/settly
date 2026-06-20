import type { CSSProperties, ReactNode } from "react";

export type IconName =
  | "food"
  | "transport"
  | "home"
  | "leisure"
  | "shopping"
  | "other"
  | "mic"
  | "camera"
  | "card"
  | "trash"
  | "plus"
  | "close"
  | "check"
  | "back"
  | "power"
  | "paperclip"
  | "clock"
  | "chevron"
  | "edit"
  | "users"
  | "balance"
  | "flag"
  | "copy"
  | "sun"
  | "moon"
  | "archive"
  | "repeat"
  | "pause"
  | "play";

function glyph(name: IconName): ReactNode {
  switch (name) {
    case "food":
      return (
        <>
          <path d="M6 3v5a2 2 0 0 0 4 0V3" />
          <path d="M8 8v13" />
          <path d="M16 3c-1.4 1.2-2 3.4-2 6 0 1.6.7 2.6 2 2.8V21" />
        </>
      );
    case "transport":
      return (
        <>
          <path d="M5 13l1.6-4.4A2 2 0 0 1 8.5 7h7a2 2 0 0 1 1.9 1.6L19 13" />
          <path d="M4 13h16v4h-2.5M7.5 17H4z" />
          <path d="M7 17v1.5M17 17v1.5" />
        </>
      );
    case "home":
      return (
        <>
          <path d="M3 11l9-7 9 7" />
          <path d="M5 10v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-9" />
        </>
      );
    case "leisure":
      return (
        <>
          <path d="M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2 2 2 0 0 0 0 4 2 2 0 0 1-2 2H6a2 2 0 0 1-2-2 2 2 0 0 0 0-4z" />
          <path d="M14 5v8" />
        </>
      );
    case "shopping":
      return (
        <>
          <path d="M6 8h12l-1 11a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1z" />
          <path d="M9 8V6.5a3 3 0 0 1 6 0V8" />
        </>
      );
    case "other":
      return (
        <>
          <path d="M4 5h7l9 9-7 7-9-9z" />
          <path d="M8 8.5h.01" />
        </>
      );
    case "mic":
      return (
        <>
          <rect x="9" y="3" width="6" height="11" rx="3" />
          <path d="M5 11a7 7 0 0 0 14 0" />
          <path d="M12 18v3" />
        </>
      );
    case "camera":
      return (
        <>
          <path d="M3 8.5A1.5 1.5 0 0 1 4.5 7H7l1.3-2h7.4L17 7h2.5A1.5 1.5 0 0 1 21 8.5V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <circle cx="12" cy="12.5" r="3.3" />
        </>
      );
    case "card":
      return (
        <>
          <rect x="3" y="5" width="18" height="14" rx="2.5" />
          <path d="M3 10h18" />
        </>
      );
    case "trash":
      return (
        <>
          <path d="M4 7h16" />
          <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
          <path d="M6.5 7l.8 12a1 1 0 0 0 1 .9h7.4a1 1 0 0 0 1-.9L17.5 7" />
        </>
      );
    case "plus":
      return <path d="M12 5v14M5 12h14" />;
    case "close":
      return <path d="M6 6l12 12M18 6L6 18" />;
    case "check":
      return <path d="M5 12.5l4.5 4.5L19 7" />;
    case "back":
      return <path d="M15 5l-7 7 7 7" />;
    case "power":
      return (
        <>
          <path d="M12 3.5v8" />
          <path d="M7.3 6.7a8 8 0 1 0 9.4 0" />
        </>
      );
    case "paperclip":
      return <path d="M20 11.5l-8 8a4.5 4.5 0 0 1-6.4-6.4l8.1-8.1a3 3 0 0 1 4.3 4.3l-8.1 8.1a1.5 1.5 0 0 1-2.2-2.1l7.4-7.4" />;
    case "clock":
      return (
        <>
          <circle cx="12" cy="12" r="8" />
          <path d="M12 8v4.2l3 1.8" />
        </>
      );
    case "chevron":
      return <path d="M6 9l6 6 6-6" />;
    case "edit":
      return (
        <>
          <path d="M4 20h4L19 9l-4-4L4 16z" />
          <path d="M13.5 6.5l4 4" />
        </>
      );
    case "users":
      return (
        <>
          <circle cx="9" cy="8" r="3.2" />
          <path d="M3 20a6 6 0 0 1 12 0" />
          <path d="M16 5.2a3 3 0 0 1 0 5.6" />
          <path d="M21 20a6 6 0 0 0-4.5-5.8" />
        </>
      );
    case "balance":
      return (
        <>
          <path d="M12 4v16" />
          <path d="M6 7h12l3 5a3 3 0 0 1-6 0zM6 7l-3 5a3 3 0 0 0 6 0z" />
          <path d="M8 20h8" />
          <path d="M12 4l-3 3M12 4l3 3" />
        </>
      );
    case "flag":
      return (
        <>
          <path d="M5 21V4" />
          <path d="M5 4.5h11.5l-2 4 2 4H5" />
        </>
      );
    case "copy":
      return (
        <>
          <rect x="8" y="8" width="12" height="12" rx="2" />
          <path d="M4 16V6a2 2 0 0 1 2-2h10" />
        </>
      );
    case "sun":
      return (
        <>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </>
      );
    case "moon":
      return <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />;
    case "archive":
      return (
        <>
          <rect x="3" y="4" width="18" height="4" rx="1" />
          <path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8" />
          <path d="M10 12h4" />
        </>
      );
    case "repeat":
      return (
        <>
          <path d="M17 3l4 4-4 4" />
          <path d="M3 11V9a4 4 0 0 1 4-4h14" />
          <path d="M7 21l-4-4 4-4" />
          <path d="M21 13v2a4 4 0 0 1-4 4H3" />
        </>
      );
    case "pause":
      return (
        <>
          <rect x="6" y="4" width="4" height="16" rx="1" />
          <rect x="14" y="4" width="4" height="16" rx="1" />
        </>
      );
    case "play":
      return <path d="M6 4l14 8-14 8z" />;
    default:
      return null;
  }
}

export function Icon({
  name,
  size = 20,
  className,
  strokeWidth = 1.8,
  style,
}: {
  name: IconName;
  size?: number;
  className?: string;
  strokeWidth?: number;
  style?: CSSProperties;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden="true"
    >
      {glyph(name)}
    </svg>
  );
}
