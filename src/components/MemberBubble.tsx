function isImage(a?: string) {
  return !!a && (a.startsWith("http") || a.startsWith("data:") || a.startsWith("blob:"));
}

/** Burbuja de un miembro: muestra la foto de perfil si la hay; si no, la
 *  etiqueta (iniciales) sobre su color. Comparte el estilo de las burbujas de
 *  iniciales usadas en las filas de gasto, tarjetas de grupo y recurrentes. */
export function MemberBubble({
  avatar,
  label,
  color = "#888",
  size = 20,
  ring,
  title,
  className = "",
}: {
  avatar?: string;
  label: string;
  color?: string;
  size?: number;
  /** box-shadow extra, p.ej. el anillo verde de "ya pagó". */
  ring?: string;
  title?: string;
  className?: string;
}) {
  if (isImage(avatar)) {
    return (
      <img
        src={avatar}
        alt=""
        title={title}
        className={`rounded-full object-cover shrink-0 ${className}`}
        style={{ width: size, height: size, boxShadow: ring }}
      />
    );
  }
  return (
    <span
      title={title}
      className={`rounded-full flex items-center justify-center font-semibold shrink-0 ${className}`}
      style={{
        width: size,
        height: size,
        background: color + "22",
        color,
        fontSize: Math.round(size * 0.4),
        boxShadow: ring,
      }}
    >
      {label}
    </span>
  );
}
