// Grupos "archivados" POR PERSONA: una lista LOCAL (por dispositivo) de group
// IDs que el usuario archivó en su propia vista. NO toca el dato compartido del
// grupo — cada quien archiva/desarchiva para sí mismo, sin afectar a los demás.
// (El campo compartido `group.archived` queda como legado: se sigue respetando
// para grupos ya archivados antes de este cambio, y al desarchivar uno de esos
// se limpia el flag compartido.)
import { useState, useEffect } from "react";

const KEY = "settly.archivedGroups";

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
    window.dispatchEvent(new Event("settly:archivedGroups"));
  } catch {
    /* ignore */
  }
}

/** Lectura puntual (fuera de React). */
export function loadArchivedGroups(): Set<string> {
  return load();
}

/** Hook reactivo: { archived, archive, unarchive }. */
export function useArchivedGroups() {
  const [archived, setArchived] = useState<Set<string>>(load);

  useEffect(() => {
    const sync = () => setArchived(load());
    window.addEventListener("settly:archivedGroups", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("settly:archivedGroups", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  function archive(id: string) {
    const next = new Set(load());
    next.add(id);
    save(next);
    setArchived(next);
  }
  function unarchive(id: string) {
    const next = new Set(load());
    next.delete(id);
    save(next);
    setArchived(next);
  }

  return { archived, archive, unarchive };
}
