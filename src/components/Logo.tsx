export function Logo({ size = 40 }: { size?: number }) {
  const radius = Math.round(size * 0.22);
  const pad = Math.round(size * 0.12);
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background: "linear-gradient(145deg, #0f2d54 0%, #0a1a2e 60%, #0d2340 100%)",
        boxShadow:
          "inset 0 1px 0 rgba(255,255,255,0.18), inset 0 -1px 0 rgba(0,0,0,0.3), 0 4px 20px rgba(0,0,0,0.45)",
        border: "1px solid rgba(255,255,255,0.10)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <img
        src="/icons/logo-s.png"
        width={size - pad * 2}
        height={size - pad * 2}
        alt="Settlia"
        style={{ display: "block", objectFit: "contain" }}
      />
    </div>
  );
}
