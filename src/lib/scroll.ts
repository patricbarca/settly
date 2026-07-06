/** El shell de la app ya no deja hacer scroll a `window` (fixed inset-0,
 *  ver App.tsx) — todo el scroll ocurre dentro de #main-scroll. Las vistas
 *  que antes reseteaban `window.scrollTo` al cambiar de grupo/pestaña deben
 *  resetear ese contenedor en su lugar. */
export function resetMainScroll() {
  document.getElementById("main-scroll")?.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
}
