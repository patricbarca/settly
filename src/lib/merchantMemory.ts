import type { Category } from "./types";
import { supabase } from "./supabase";

// Memoria de comercios POR GRUPO: al confirmar un gasto se recuerda, para ese
// comercio, la descripción, la categoría y entre quiénes se repartió. El
// siguiente pago en el mismo comercio (Wallet) se rellena solo, sin IA.
//
// Vive en Supabase (`merchant_memory`, migrate_v15) para compartirse entre
// miembros y dispositivos, con copia local en localStorage: así funciona
// offline, en modo invitado y aunque la tabla aún no exista.

export type MerchantMemo = {
  label: string;
  category: Category;
  participantIds: string[];
  uses: number;
};

const LS = (groupId: string) => `settlia.merchantMemory.${groupId}`;
const cache = new Map<string, Record<string, MerchantMemo>>();

function readLocal(groupId: string): Record<string, MerchantMemo> {
  try {
    return JSON.parse(localStorage.getItem(LS(groupId)) || "{}");
  } catch {
    return {};
  }
}
function writeLocal(groupId: string, all: Record<string, MerchantMemo>) {
  try {
    localStorage.setItem(LS(groupId), JSON.stringify(all));
  } catch {
    /* ignore */
  }
}

/** Carga la memoria del grupo (servidor + local). Nunca lanza. */
export async function loadMerchantMemory(groupId: string): Promise<Record<string, MerchantMemo>> {
  const all = { ...readLocal(groupId) };
  try {
    const { data, error } = await supabase
      .from("merchant_memory")
      .select("key,label,category,participant_ids,uses")
      .eq("group_id", groupId);
    if (!error && data) {
      for (const r of data as any[]) {
        all[r.key] = {
          label: r.label,
          category: r.category,
          participantIds: Array.isArray(r.participant_ids) ? r.participant_ids : [],
          uses: r.uses ?? 1,
        };
      }
      writeLocal(groupId, all);
    }
  } catch {
    /* sin red o sin tabla: vale la copia local */
  }
  cache.set(groupId, all);
  return all;
}

export async function recallMerchant(groupId: string, key: string): Promise<MerchantMemo | null> {
  if (!key) return null;
  const all = cache.get(groupId) ?? (await loadMerchantMemory(groupId));
  return all[key] ?? null;
}

/** Recuerda lo que el usuario confirmó. Fire-and-forget. */
export function rememberMerchant(
  groupId: string,
  key: string,
  memo: Omit<MerchantMemo, "uses">
) {
  if (!key || !memo.label) return;
  const all = cache.get(groupId) ?? readLocal(groupId);
  const uses = (all[key]?.uses ?? 0) + 1;
  all[key] = { ...memo, uses };
  cache.set(groupId, all);
  writeLocal(groupId, all);
  void (async () => {
    try {
      await supabase.from("merchant_memory").upsert({
        group_id: groupId,
        key,
        label: memo.label,
        category: memo.category,
        participant_ids: memo.participantIds,
        uses,
        updated_at: new Date().toISOString(),
      });
    } catch {
      /* se queda en local */
    }
  })();
}
