import type { CSSProperties, ReactNode } from "react";

export type IconName =
  | "help"
  | "food"
  | "transport"
  | "home"
  | "leisure"
  | "shopping"
  | "cart"
  | "drink"
  | "health"
  | "bolt"
  | "plane"
  | "gift"
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
  | "play"
  | "settings"
  | "download"
  | "external"
  | "sparkles"
  | "bell"
  | "lock"
  | "chat";

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
    case "bell":
      return (
        <>
          <path d="M6 9a6 6 0 0 1 12 0c0 6 2.5 8 2.5 8h-17S6 15 6 9" />
          <path d="M10.2 21a2 2 0 0 0 3.6 0" />
        </>
      );
    case "cart":
      return (
        <>
          <circle cx="9" cy="20" r="1" />
          <circle cx="17" cy="20" r="1" />
          <path d="M3 4h2l2.4 11.2a1 1 0 0 0 1 .8h7.7a1 1 0 0 0 1-.8L20 7H6" />
        </>
      );
    case "drink":
      return (
        <>
          <path d="M6 3h12l-1.3 15a2 2 0 0 1-2 1.8H9.3a2 2 0 0 1-2-1.8z" />
          <path d="M5.5 8h13" />
        </>
      );
    case "health":
      return (
        <>
          <path d="M11 4h2a1 1 0 0 1 1 1v4h4a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1h-4v4a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1v-4H5a1 1 0 0 1-1-1v-2a1 1 0 0 1 1-1h4V5a1 1 0 0 1 1-1z" />
        </>
      );
    case "bolt":
      return <path d="M13 2 4 14h7l-1 8 9-12h-7z" />;
    case "plane":
      return (
        <path d="M21 15.5 13 11V4.5a1.5 1.5 0 0 0-3 0V11l-8 4.5V17l8-2.3V19l-2 1.4V22l3.5-1 3.5 1v-1.6L13 19v-4.3l8 2.3z" />
      );
    case "gift":
      return (
        <>
          <rect x="4" y="9" width="16" height="11" rx="1" />
          <path d="M3 9h18v3.5H3zM12 9v11" />
          <path d="M12 9S10.6 4 8.2 5.2 12 9 12 9zM12 9s1.4-5 3.8-3.8S12 9 12 9z" />
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
    case "external":
      return (
        <>
          <path d="M14 4h6v6" />
          <path d="M20 4l-9 9" />
          <path d="M19 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h4" />
        </>
      );
    case "help":
      return (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M9.6 9.5a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2-2.4 3.6" />
          <path d="M12 17.5h.01" />
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
    case "settings":
      return (
        <>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </>
      );
    case "download":
      return (
        <>
          <path d="M12 3v12" />
          <path d="M7 10l5 5 5-5" />
          <path d="M5 21h14" />
        </>
      );
    case "sparkles":
      return (
        <>
          <path d="M12 3l1.7 4.5L18 9l-4.3 1.5L12 15l-1.7-4.5L6 9l4.3-1.5z" />
          <path d="M18 13.5l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z" />
        </>
      );
    case "lock":
      return (
        <>
          <rect x="5" y="11" width="14" height="9" rx="2" />
          <path d="M8 11V8a4 4 0 0 1 8 0v3" />
        </>
      );
    case "chat":
      return (
        <>
          <path d="M21 12a8 8 0 0 1-8 8H7l-4 3v-5.5A8 8 0 1 1 21 12z" />
          <path d="M8 11h8M8 14.5h5" />
        </>
      );
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
