export function Logo({ size = 40 }: { size?: number }) {
  return (
    <img
      src="/icons/logo-s.png"
      width={size}
      height={size}
      alt="Settlia"
      style={{ display: "block", objectFit: "contain" }}
    />
  );
}
