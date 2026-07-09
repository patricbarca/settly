import { useState } from "react";
import { createPortal } from "react-dom";
import { useT } from "../lib/i18n";
import { Icon } from "./Icon";

type FaqItem = { q: string; a: string };

function useFaqSections(): { title: string; items: FaqItem[] }[] {
  const t = useT();
  return [
    {
      title: t("faq.cat.groups"),
      items: [
        { q: t("faq.q.addMember"), a: t("faq.a.addMember") },
        { q: t("faq.q.claim"), a: t("faq.a.claim") },
      ],
    },
    {
      title: t("faq.cat.expenses"),
      items: [
        { q: t("faq.q.addExpense"), a: t("faq.a.addExpense") },
        { q: t("faq.q.split"), a: t("faq.a.split") },
        { q: t("faq.q.scan"), a: t("faq.a.scan") },
      ],
    },
    {
      title: t("faq.cat.balances"),
      items: [
        { q: t("faq.q.modes"), a: t("faq.a.modes") },
        { q: t("faq.q.markPaid"), a: t("faq.a.markPaid") },
        { q: t("faq.q.simplifiedPayee"), a: t("faq.a.simplifiedPayee") },
        { q: t("faq.q.paidBadge"), a: t("faq.a.paidBadge") },
        { q: t("faq.q.log"), a: t("faq.a.log") },
      ],
    },
    {
      title: t("faq.cat.other"),
      items: [
        { q: t("faq.q.recurring"), a: t("faq.a.recurring") },
        { q: t("faq.q.reports"), a: t("faq.a.reports") },
        { q: t("faq.q.pro"), a: t("faq.a.pro") },
      ],
    },
  ];
}

export function FaqModal({ onClose }: { onClose: () => void }) {
  const t = useT();
  const sections = useFaqSections();
  const [open, setOpen] = useState<string | null>(null);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-30 flex flex-col anim-up"
      style={{
        background: "var(--bg)",
        paddingTop: "env(safe-area-inset-top)",
      }}
    >
      <div className="max-w-2xl mx-auto w-full px-4 pt-5 flex-1 flex flex-col min-h-0">
        <div className="flex items-center gap-3 mb-5 shrink-0">
          <button
            onClick={onClose}
            className="glass rounded-full h-9 w-9 flex items-center justify-center text-muted hover-lift"
            title={t("common.back")}
          >
            <Icon name="back" size={16} />
          </button>
          <h2 className="font-display text-2xl font-bold">{t("faq.title")}</h2>
        </div>

        <div
          className="flex-1 overflow-y-auto space-y-5"
          style={{ paddingBottom: "calc(var(--bottomnav-h) + env(safe-area-inset-bottom) + 24px)" }}
        >
          {sections.map((section) => (
            <div key={section.title}>
              <div className="text-xs uppercase tracking-widest font-mono text-muted mb-2">{section.title}</div>
              <div className="glass rounded-3xl p-1.5 space-y-0.5">
                {section.items.map((item) => {
                  const id = item.q;
                  const isOpen = open === id;
                  return (
                    <div key={id} className="rounded-2xl overflow-hidden">
                      <button
                        onClick={() => setOpen(isOpen ? null : id)}
                        className="w-full flex items-center gap-2 text-left px-3 py-3 hover-lift"
                      >
                        <span className="text-sm font-semibold flex-1 min-w-0">{item.q}</span>
                        <Icon
                          name="chevron"
                          size={15}
                          className="text-muted shrink-0 transition-transform"
                          style={{ transform: isOpen ? "rotate(180deg)" : "none" }}
                        />
                      </button>
                      {isOpen && (
                        <div className="px-3 pb-3 text-sm text-muted leading-relaxed">{item.a}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
}
