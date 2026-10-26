import { useEffect, useState } from "react";
import type { Group } from "../lib/types";
import { useT, tr } from "../lib/i18n";
import { useUser } from "../lib/auth";
import { supabase } from "../lib/supabase";
import { approveJoinRequest, listJoinRequests, rejectJoinRequest, type JoinRequest } from "../lib/invite";
import { notifyUser } from "../lib/push";
import { Avatar } from "./Avatar";

/** Solicitudes para unirse por link: solo las ve el dueño del grupo, arriba
 *  del grupo, con Aceptar / Rechazar. Se actualiza en tiempo real. */
export function JoinRequests({ group }: { group: Group }) {
  const t = useT();
  const user = useUser();
  const isOwner = !!user && group.ownerId === user.id;
  const [reqs, setReqs] = useState<JoinRequest[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!isOwner) return;
    let alive = true;
    const load = () => listJoinRequests(group.id).then((r) => alive && setReqs(r));
    load();
    const ch = supabase
      .channel(`join_requests:${group.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "join_requests", filter: `group_id=eq.${group.id}` }, load)
      .subscribe();
    return () => {
      alive = false;
      supabase.removeChannel(ch);
    };
  }, [group.id, isOwner]);

  if (!isOwner || reqs.length === 0) return null;

  async function decide(r: JoinRequest, ok: boolean) {
    setBusy(r.id);
    const done = ok ? await approveJoinRequest(r.id) : await rejectJoinRequest(r.id);
    setBusy(null);
    if (!done) return;
    setReqs((list) => list.filter((x) => x.id !== r.id));
    if (ok) notifyUser(group.id, r.user_id, tr("joinReq.approvedTitle"), tr("joinReq.approvedBody", { group: group.name }));
  }

  return (
    <div
      className="rounded-2xl p-3.5 mb-3"
      style={{ background: "rgba(91,91,240,0.10)", border: "1px solid rgba(91,91,240,0.28)" }}
    >
      <div className="text-sm font-semibold mb-0.5">{t("joinReq.title", { n: reqs.length })}</div>
      <div className="text-xs text-muted mb-2.5">{t("joinReq.hint")}</div>
      <div className="space-y-2">
        {reqs.map((r) => (
          <div key={r.id} className="flex items-center gap-2.5">
            <Avatar name={r.name || "?"} avatar={r.avatar || ""} size={32} />
            <span className="flex-1 min-w-0 truncate text-sm font-medium">{r.name || t("joinReq.someone")}</span>
            <button
              disabled={busy === r.id}
              onClick={() => decide(r, false)}
              className="rounded-full px-3 py-1.5 text-xs font-semibold"
              style={{ background: "var(--glass-border)", color: "var(--muted)" }}
            >
              {t("joinReq.reject")}
            </button>
            <button
              disabled={busy === r.id}
              onClick={() => decide(r, true)}
              className="rounded-full px-3 py-1.5 text-xs font-semibold text-white"
              style={{ background: "var(--teal)" }}
            >
              {t("joinReq.accept")}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
