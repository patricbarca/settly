import { personColor, initials as initialsOf } from "../lib/format";

function isImage(a?: string) {
  return !!a && (a.startsWith("http") || a.startsWith("data:") || a.startsWith("blob:"));
}

/** Avatar de un miembro: muestra la foto (URL o data URL) si la hay; si no, un
 *  emoji o las iniciales (personalizadas o derivadas) sobre un fondo de color. */
export function Avatar({
  name,
  avatar,
  initials,
  size = 24,
  className = "",
}: {
  name: string;
  avatar?: string;
  initials?: string;
  size?: number;
  className?: string;
}) {
  if (isImage(avatar)) {
    return (
      // key={avatar}: fuerza a React a crear un <img> nuevo cuando cambia la
      // foto, en vez de reutilizar el nodo y mostrar la imagen de otra persona
      // (bug de fotos repetidas/cruzadas en las tiras de miembros).
      // referrerPolicy no-referrer: las fotos de Google (lh3.googleusercontent)
      // fallan si se envía el referer → salían rotas/genéricas.
      <img
        key={avatar}
        src={avatar}
        alt=""
        referrerPolicy="no-referrer"
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
      {avatar || initials?.trim() || initialsOf(name)}
    </span>
  );
}
