// Contactos "ocultos" de Tu red: una lista LOCAL (por dispositivo) de userIds que
// el usuario no quiere ver en la pestaña Contacts ni en los sugeridos. Es solo un
// filtro visual reversible: NO borra nada en la BD ni impide volver a añadir a esa
// persona a un grupo (puedes restaurarla o buscarla por email).
import { useState, useEffect } from "react";

const KEY = "settly.hiddenContacts";

function load(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(KEY) || "[]"));
  } catch {
    return new Set();
  }
}

function save(s: Set<string>) {
  try {
    localStorage.setItem(KEY, JSON.stringify([...s]));
    // Avisa a otras instancias del hook en la misma pestaña.
    window.dispatchEvent(new Event("settly:hiddenContacts"));
  } catch {
    /* ignore */
  }
}

/** Hook reactivo: { hidden, hide, unhide }. */
export function useHiddenContacts() {
  const [hidden, setHidden] = useState<Set<string>>(load);

  useEffect(() => {
    const sync = () => setHidden(load());
    window.addEventListener("settly:hiddenContacts", sync);
    window.addEventListener("storage", sync); // otras pestañas
    return () => {
      window.removeEventListener("settly:hiddenContacts", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  function hide(id: string) {
    const next = new Set(load());
    next.add(id);
    save(next);
    setHidden(next);
  }
  function unhide(id: string) {
    const next = new Set(load());
    next.delete(id);
    save(next);
    setHidden(next);
  }
  return { hidden, hide, unhide };
}
