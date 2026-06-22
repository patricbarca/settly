import cowLogo from "../assets/logo-cow.svg";

export function Logo({ size = 40 }: { size?: number }) {
  return (
    <img
      src={cowLogo}
      width={size}
      height={size}
      alt="cow.ai"
      style={{ display: "block", borderRadius: size * 0.235 }}
    />
  );
}
