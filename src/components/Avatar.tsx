import { personColor, initials } from "../lib/format";

function isImage(a?: string) {
  return !!a && (a.startsWith("http") || a.startsWith("data:") || a.startsWith("blob:"));
}

/** Avatar de un miembro: muestra la foto (URL o data URL) si la hay; si no, un
 *  emoji o las iniciales sobre un fondo de color derivado del nombre. */
export function Avatar({
  name,
  avatar,
  size = 24,
  className = "",
}: {
  name: string;
  avatar?: string;
  size?: number;
  className?: string;
}) {
  if (isImage(avatar)) {
    return (
      <img
        src={avatar}
        alt=""
        className={`rounded-full object-cover shrink-0 ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className={`rounded-full flex items-center justify-center font-bold shrink-0 ${className}`}
      style={{
        width: size,
        height: size,
        background: personColor(name) + "22",
        fontSize: Math.round(size * 0.42),
      }}
    >
      {avatar || initials(name)}
    </span>
  );
}
