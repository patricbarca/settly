import { useSyncExternalStore } from "react";

export type Lang = "es" | "en";
const KEY = "settly.lang";

let lang: Lang = load();
const listeners = new Set<() => void>();

function load(): Lang {
  try {
    const l = localStorage.getItem(KEY);
    if (l === "en" || l === "es") return l;
  } catch {}
  if (typeof navigator !== "undefined" && navigator.language?.toLowerCase().startsWith("en")) return "en";
  return "es";
}

function emit() {
  try {
    localStorage.setItem(KEY, lang);
  } catch {}
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function setLang(l: Lang) {
  lang = l;
  emit();
}

export function useLang(): Lang {
  return useSyncExternalStore(subscribe, () => lang, () => lang);
}

const DICT: Record<string, { es: string; en: string }> = {
  "app.footer": { es: "Settly · los datos se guardan en este navegador.", en: "Settly · data is saved in this browser." },
  "app.resetDemo": { es: "Reiniciar demo", en: "Reset demo" },
  "app.signout": { es: "Salir", en: "Sign out" },

  "login.tagline": { es: "Gastos en grupo, sin líos.", en: "Group expenses, no headaches." },
  "login.subtitle": { es: "Inicia sesión para guardar tus grupos y compartirlos.", en: "Sign in to save and share your groups." },
  "login.google": { es: "Continuar con Google", en: "Continue with Google" },
  "login.or": { es: "o", en: "or" },
  "login.name": { es: "Nombre", en: "Name" },
  "login.email": { es: "Email", en: "Email" },
  "login.signup": { es: "Crear cuenta", en: "Sign up" },
  "login.signin": { es: "Entrar", en: "Sign in" },
  "login.haveAccount": { es: "¿Ya tienes cuenta? Entra", en: "Already have an account? Sign in" },
  "login.noAccount": { es: "¿No tienes cuenta? Regístrate", en: "No account? Sign up" },
  "login.guest": { es: "Entrar como invitado", en: "Continue as guest" },
  "login.checkEmail": { es: "Revisa tu correo", en: "Check your email" },
  "login.otpSent": { es: "Enviamos un código a", en: "We sent a code to" },
  "login.otpPlaceholder": { es: "123456", en: "123456" },
  "login.verify": { es: "Verificar código", en: "Verify code" },
  "login.verifying": { es: "Verificando...", en: "Verifying..." },
  "login.resend": { es: "Reenviar código", en: "Resend code" },
  "login.sending": { es: "Enviando...", en: "Sending..." },
  "login.namePrompt": { es: "¿Cómo te llamas?", en: "What's your name?" },
  "login.nameHint": { es: "Solo necesitamos tu nombre para los grupos.", en: "We just need your name for groups." },
  "login.continue": { es: "Continuar", en: "Continue" },

  "group.invite": { es: "Invitar", en: "Invite" },
  "group.copied": { es: "¡Copiado!", en: "Copied!" },
  "group.inviteError": { es: "Error al crear link", en: "Error creating link" },
  "group.shareTitle": { es: "Compartir grupo", en: "Share group" },
  "group.shareHint": { es: "Comparte el enlace para que otros se unan.", en: "Share the link so others can join." },
  "group.shareBtn": { es: "Copiar enlace", en: "Copy link" },

  "app.footerCloud": { es: "Settly · datos guardados en la nube.", en: "Settly · data saved in the cloud." },

  "onboard.s1t": { es: "Gastos en grupo, sin líos", en: "Group expenses, no headaches" },
  "onboard.s1d": { es: "La app que hace que todos paguen lo que deben. Sin incomodidades, sin calculadoras, sin dramas.", en: "The app that makes sure everyone pays what they owe. No awkwardness, no calculators, no drama." },
  "onboard.s2t": { es: "Crea grupos al instante", en: "Create groups instantly" },
  "onboard.s2d": { es: "Viaje, piso, cena... Invita a tus amigos por email o teléfono, o comparte el link y únanse al instante.", en: "Trip, flat, dinner... Invite friends by email or phone, or share a link and join instantly." },
  "onboard.s3t": { es: "Escanea el ticket", en: "Scan the receipt" },
  "onboard.s3d": { es: "Haz una foto al recibo. La IA lee cada artículo y genera el gasto automáticamente. Tú solo confirmas.", en: "Take a photo of the receipt. AI reads each item and creates the expense automatically. You just confirm." },
  "onboard.s4t": { es: "Solo habla", en: "Just speak" },
  "onboard.s4d": { es: "«Cena con Ana y Pedro, pagué 90 euros». Settly lo entiende, crea el gasto y lo reparte. Sin tocar nada.", en: "«Dinner with Ana and Pedro, I paid 90». Settly understands, creates the expense, and splits it. Hands-free." },
  "onboard.s5t": { es: "Salda con el mínimo", en: "Settle up easily" },
  "onboard.s5d": { es: "Ve exactamente quién debe qué. Settly calcula las transferencias mínimas para que todos queden a cero de un golpe.", en: "See exactly who owes what. Settly finds the fewest transfers needed for everyone to settle up at once." },
  "onboard.s6t": { es: "Y mucho más", en: "And much more" },
  "onboard.s6d": { es: "Todo lo que necesitas para llevar las cuentas del grupo, en tu bolsillo.", en: "Everything you need to manage group expenses, in your pocket." },
  "onboard.extra1": { es: "Por categoría", en: "By category" },
  "onboard.extra2": { es: "Multi-moneda", en: "Multi-currency" },
  "onboard.extra3": { es: "Tiempo real", en: "Real-time sync" },
  "onboard.extra4": { es: "Historial pagos", en: "Payment history" },
  "onboard.next": { es: "Siguiente →", en: "Next →" },
  "onboard.start": { es: "¡Empezar!", en: "Get started!" },
  "onboard.skip": { es: "Omitir", en: "Skip" },

  "onboard.demo.group1":   { es: "Viaje a París",    en: "Paris Trip" },
  "onboard.demo.group2":   { es: "Piso compartido",  en: "Shared Flat" },
  "onboard.demo.dinner":   { es: "Cena de cumpleaños", en: "Birthday Dinner" },
  "onboard.demo.you":      { es: "Tú",               en: "You" },
  "onboard.demo.copy":     { es: "Copiar",            en: "Copy" },
  "onboard.demo.detected": { es: "✓ Gasto detectado", en: "✓ Expense detected" },
  "onboard.demo.restaurant":{ es: "Cena restaurante", en: "Restaurant Dinner" },
  "onboard.demo.addGroup": { es: "Añadir al grupo →", en: "Add to group →" },
  "onboard.demo.voiceText":{ es: "Cena con Ana y Pedro, pagué 90€", en: "Dinner with Ana and Pedro, I paid €90" },
  "onboard.demo.voiceTitle":{ es: "Cena",             en: "Dinner" },
  "onboard.demo.voiceMeta":{ es: "Pagó: Tú · Ana, Pedro", en: "Paid by: You · Ana, Pedro" },
  "onboard.demo.settled":  { es: "✓ Todos a cero · ¡Saldado!", en: "✓ All zero · Settled up!" },
  "onboard.demo.transfers":{ es: "Settly calculó 3 transferencias mínimas", en: "Settly found 3 minimal transfers" },
  "onboard.demo.detail1":  { es: "Comida · Ocio · Viaje", en: "Food · Leisure · Travel" },
  "onboard.demo.detail3":  { es: "Cambios al instante", en: "Instant sync" },
  "onboard.demo.detail4":  { es: "Comprobantes y recibos", en: "Receipts & proof" },
  "onboard.checklist": { es: "Primeros pasos", en: "Getting started" },
  "onboard.step1t": { es: "Crea tu primer grupo", en: "Create your first group" },
  "onboard.step1d": { es: "Viaje, piso o cena — empieza aquí.", en: "Trip, flat or dinner — start here." },
  "onboard.step2t": { es: "Añade un gasto", en: "Add an expense" },
  "onboard.step2d": { es: "Por voz, foto del ticket o manualmente.", en: "By voice, receipt photo, or manually." },
  "onboard.step3t": { es: "Salda una deuda", en: "Settle a debt" },
  "onboard.step3d": { es: "Confirma un pago para terminar el ciclo.", en: "Confirm a payment to close the loop." },

  "phone.title": { es: "Añade tu teléfono", en: "Add your phone" },
  "phone.hint": { es: "Te enviaremos un código SMS para verificarlo. Esto protege tu cuenta.", en: "We'll send you an SMS code to verify it. This keeps your account safe." },
  "phone.send": { es: "Enviar código SMS", en: "Send SMS code" },
  "phone.checkTitle": { es: "Verifica tu número", en: "Verify your number" },
  "phone.otpSent": { es: "Enviamos un código a", en: "We sent a code to" },
  "phone.verify": { es: "Verificar número", en: "Verify number" },
  "phone.skip": { es: "Ahora no", en: "Skip for now" },
  "phone.errorSend": { es: "Error al enviar el SMS. Revisa el número.", en: "Error sending SMS. Check the number." },
  "phone.errorOtp": { es: "Código incorrecto. Inténtalo de nuevo.", en: "Incorrect code. Try again." },

  "home.createGroup": { es: "Crear grupo", en: "Create group" },
  "home.featVoiceT": { es: "Habla y listo", en: "Just say it" },
  "home.featVoiceD": { es: "Dicta el gasto y la IA lo reparte solo.", en: "Dictate the expense and AI splits it." },
  "home.featClearT": { es: "Cuentas claras", en: "Clear balances" },
  "home.featClearD": { es: "Saldos al instante y el mínimo de pagos para saldar.", en: "Instant balances and the fewest payments to settle." },
  "home.featGroupT": { es: "En grupo", en: "Together" },
  "home.featGroupD": { es: "Viaje, piso o cena: cada grupo con sus cuentas.", en: "Trip, flat or dinner: each group its own." },
  "home.yourGroups": { es: "Tus grupos", en: "Your groups" },
  "home.new": { es: "Nuevo", en: "New" },
  "home.empty": { es: "Aún no tienes grupos. Crea el primero.", en: "No groups yet. Create your first one." },
  "home.meta": { es: "{p} personas · {amt} · {e} gastos", en: "{p} people · {amt} · {e} expenses" },
  "home.yourBalance": { es: "Tu saldo", en: "Your balance" },

  "bal.uptodate": { es: "al día", en: "settled" },
  "hero.uptodate": { es: "Estás al día", en: "You're all settled" },
  "hero.theyOwe": { es: "Te deben {amt}", en: "You're owed {amt}" },
  "hero.youOwe": { es: "Debes {amt}", en: "You owe {amt}" },
  "hero.total": { es: "Total del grupo {amt} · {e} gastos", en: "Group total {amt} · {e} expenses" },

  "group.back": { es: "Mis grupos", en: "My groups" },
  "group.delete": { es: "Eliminar grupo", en: "Delete group" },
  "group.archive": { es: "Archivar", en: "Archive" },
  "tab.expenses": { es: "Gastos", en: "Expenses" },
  "tab.balances": { es: "Saldos", en: "Balances" },
  "tab.stats": { es: "Stats", en: "Stats" },
  "tab.achievements": { es: "Logros", en: "Achievements" },

  "stats.noData":      { es: "Sin gastos aún. Añade el primero.", en: "No expenses yet. Add the first one." },
  "stats.totalSpent":  { es: "Total gastado",   en: "Total spent" },
  "stats.numExpenses": { es: "Nº gastos",        en: "# expenses" },
  "stats.avgExpense":  { es: "Gasto medio",      en: "Avg expense" },
  "stats.topPayer":    { es: "Paga más veces",   en: "Most payments" },
  "stats.byWeek":      { es: "Gasto por semana", en: "Spending by week" },
  "stats.byPerson":    { es: "Pagado por persona", en: "Paid by person" },
  "stats.topExpenses": { es: "Gastos más grandes", en: "Biggest expenses" },
  "home.archived": { es: "Archivados", en: "Archived" },
  "home.restore": { es: "Restaurar", en: "Restore" },
  "group.deleteQ": { es: "¿Eliminar “{name}”?", en: "Delete “{name}”?" },
  "group.deleteWarn": { es: "Se borrarán sus gastos. No se puede deshacer.", en: "Its expenses will be deleted. This can't be undone." },

  "members.you": { es: "tú", en: "you" },
  "members.add": { es: "+ miembro", en: "+ member" },
  "members.name": { es: "Nombre", en: "Name" },
  "members.searchHint": { es: "Busca por email o teléfono de un usuario registrado.", en: "Search by email or phone of a registered user." },
  "members.searchPh": { es: "email@ejemplo.com  o  +34 600 000 000", en: "email@example.com  or  +1 234 567 8900" },
  "members.search": { es: "Buscar", en: "Search" },
  "members.found": { es: "Usuario encontrado: {name}", en: "User found: {name}" },
  "members.addConfirm": { es: "Añadir al grupo", en: "Add to group" },
  "members.notFound": { es: "No hay cuenta con ese email/teléfono. Puedes invitarlos por link o añadirlos sin cuenta.", en: "No account found. You can invite them by link or add them without an account." },
  "members.addManual": { es: "Añadir sin cuenta", en: "Add without account" },
  "members.manualHint": { es: "Esta persona no necesita tener Settly instalado.", en: "This person doesn't need to have Settly installed." },
  "members.backSearch": { es: "← Buscar por email/teléfono", en: "← Search by email/phone" },

  "add.title": { es: "Añade un gasto hablando", en: "Add an expense by speaking" },
  "add.placeholder": { es: 'Ej: "Cena con Ale y Cote, pagué 90"', en: 'E.g. "Dinner with Ale and Cote, I paid 90"' },
  "add.interpret": { es: "Interpretar", en: "Interpret" },
  "add.manual": { es: "Manual", en: "Manual" },
  "add.scan": { es: "Escanear", en: "Scan" },
  "add.review": { es: "Revisa y confirma", en: "Review and confirm" },
  "add.submit": { es: "Añadir gasto", en: "Add expense" },
  "add.dictate": { es: "Dictar", en: "Dictate" },
  "add.voiceOff": { es: "Voz no disponible en este navegador", en: "Voice not available in this browser" },

  "form.concept": { es: "Concepto", en: "What for" },
  "form.paid": { es: "Pagó", en: "Paid" },
  "form.between": { es: "Entre", en: "Between" },
  "form.each": { es: "c/u", en: "each" },
  "form.category": { es: "Categoría", en: "Category" },
  "form.multiPay": { es: "Varios pagaron", en: "Multiple payers" },
  "form.singlePay": { es: "Solo uno pagó", en: "One payer" },
  "form.paymentOk": { es: "Correcto", en: "Correct" },
  "form.remaining": { es: "Falta: {amt}", en: "Remaining: {amt}" },
  "form.over": { es: "Excede: {amt}", en: "Excess: {amt}" },
  "form.sumMustBe100": { es: "Debe sumar 100%", en: "Must add up to 100%" },
  "common.save": { es: "Guardar", en: "Save" },
  "common.cancel": { es: "Cancelar", en: "Cancel" },
  "common.delete": { es: "Eliminar", en: "Delete" },

  "cat.comida": { es: "Comida", en: "Food" },
  "cat.transporte": { es: "Transporte", en: "Transport" },
  "cat.alojamiento": { es: "Alojamiento", en: "Lodging" },
  "cat.ocio": { es: "Ocio", en: "Leisure" },
  "cat.compras": { es: "Compras", en: "Shopping" },
  "cat.otros": { es: "Otros", en: "Other" },

  "bal.title": { es: "Saldos del grupo", en: "Group balances" },
  "bal.total": { es: "Total {amt} · {p} personas", en: "Total {amt} · {p} people" },
  "bal.toSettle": { es: "Para saldar", en: "To settle up" },
  "bal.simplified": { es: "Deudas simplificadas · mínimo de pagos", en: "Simplified debts · fewest payments" },
  "bal.allSettled": { es: "Todo saldado, sin deudas.", en: "All settled, no debts." },
  "bal.paid": { es: "pagó {amt}", en: "paid {amt}" },
  "bal.paysTo": { es: "paga a", en: "pays" },

  "exp.title": { es: "Gastos", en: "Expenses" },
  "exp.empty": { es: "Aún no hay gastos. Añade el primero arriba.", en: "No expenses yet. Add the first one above." },
  "exp.meta": { es: "{payer} pagó · entre {n} · {date}", en: "{payer} paid · among {n} · {date}" },
  "exp.edit": { es: "Editar gasto", en: "Edit expense" },
  "exp.shares": { es: "Reparto", en: "Split" },
  "exp.review": { es: "Solicitar revisión", en: "Request review" },
  "exp.inReview": { es: "En revisión", en: "Under review" },

  "create.title": { es: "Nuevo grupo", en: "New group" },
  "create.namePh": { es: "Viaje a Vietnam, Piso, Cena…", en: "Vietnam trip, Flat, Dinner…" },
  "create.currency": { es: "Moneda", en: "Currency" },
  "create.people": { es: "Personas", en: "People" },
  "create.peopleHint": { es: "(separadas por coma · la 1ª eres tú)", en: "(comma-separated · the 1st is you)" },
  "create.peoplePh": { es: "Tú, Ale, Cote, Javi", en: "You, Ale, Cote, Javi" },

  "scan.title": { es: "Escanear ticket", en: "Scan receipt" },
  "scan.pick": { es: "Sube o haz una foto del ticket. Marca quién consumió cada cosa y Settly reparte.", en: "Upload or snap a photo of the receipt. Mark who had what and Settly splits it." },
  "scan.choose": { es: "Elegir o hacer foto", en: "Choose or take photo" },
  "scan.analyzing": { es: "Leyendo el ticket…", en: "Reading the receipt…" },
  "scan.items": { es: "Artículos · marca quién consumió cada uno", en: "Items · mark who consumed each" },
  "scan.addItem": { es: "+ artículo", en: "+ item" },
  "scan.total": { es: "Total a repartir", en: "Total to split" },
  "scan.aiNote": { es: "Demo: los artículos son de ejemplo, edítalos. La lectura real con IA se conecta con tu clave.", en: "Demo: items are samples, edit them. Real AI reading connects with your key." },

  "pay.pay": { es: "Pagar", en: "Pay" },
  "pay.markPaid": { es: "Marcar pagado", en: "Mark paid" },
  "pay.methods": { es: "Métodos de pago", en: "Payment methods" },
  "pay.methodsHint": { es: "Cómo cobra cada persona. Se usa para el botón “Pagar”.", en: "How each person gets paid. Used by the “Pay” button." },
  "pay.handle": { es: "Usuario, teléfono o enlace", en: "Username, phone or link" },
  "pay.noMethod": { es: "{name} no tiene método de pago. Añádelo para pagar.", en: "{name} has no payment method. Add one to pay." },
  "pay.bizumCopied": { es: "Bizum copiado: {v}", en: "Bizum copied: {v}" },
  "pay.markTitle": { es: "Registrar pago", en: "Record payment" },
  "pay.markDesc": { es: "{from} paga {amt} a {to}", en: "{from} pays {amt} to {to}" },
  "pay.attach": { es: "Adjuntar comprobante (opcional)", en: "Attach proof (optional)" },
  "pay.confirmPay": { es: "Registrar pago", en: "Record payment" },
  "pay.pending": { es: "Pendiente de confirmar", en: "Pending confirmation" },
  "pay.saysPaid": { es: "{from} pagó {amt} a {to}", en: "{from} paid {amt} to {to}" },
  "pay.confirmReceived": { es: "Confirmar recepción", en: "Confirm received" },
  "pay.reject": { es: "Rechazar", en: "Reject" },
  "pay.history": { es: "Pagos saldados", en: "Settled payments" },
  "pay.copied": { es: "Copiado: {v} — pégalo en tu app de pago.", en: "Copied: {v} — paste it in your payment app." },

  "pay.label.payid": { es: "PayID", en: "PayID" },
  "pay.label.bank": { es: "Transferencia", en: "Bank transfer" },
  "pay.label.paypal": { es: "PayPal", en: "PayPal" },
  "pay.label.revolut": { es: "Revolut", en: "Revolut" },
  "pay.label.wise": { es: "Wise", en: "Wise" },
  "pay.label.bizum": { es: "Bizum", en: "Bizum" },
  "pay.label.bunq": { es: "bunq.me", en: "bunq.me" },
  "pay.label.other": { es: "Otro", en: "Other" },

  "pay.ph.payid": { es: "email o teléfono (PayID)", en: "email or phone (PayID)" },
  "pay.ph.bank": { es: "BSB + nº de cuenta", en: "BSB + account number" },
  "pay.ph.paypal": { es: "paypal.me/usuario", en: "paypal.me/username" },
  "pay.ph.revolut": { es: "revolut.me/usuario", en: "revolut.me/username" },
  "pay.ph.wise": { es: "usuario de Wise", en: "Wise username" },
  "pay.ph.bizum": { es: "+34 600 000 000", en: "+34 600 000 000" },
  "pay.ph.bunq": { es: "usuario de bunq", en: "bunq username" },
  "pay.ph.other": { es: "enlace o dato de pago", en: "payment link or detail" },

  "chart.byCategory": { es: "Gastos por categoría", en: "Spending by category" },

  "game.title": { es: "Logros", en: "Achievements" },
  "game.level": { es: "Nivel {n}", en: "Level {n}" },
  "game.settleScore": { es: "Settle Score", en: "Settle Score" },
  "game.groupAch": { es: "Logros del grupo", en: "Group achievements" },
  "ach.cuentasClaras.t": { es: "Cuentas claras", en: "All square" },
  "ach.cuentasClaras.d": { es: "Grupo a cero", en: "Group at zero" },
  "ach.anfitrion.t": { es: "Anfitrión", en: "Host" },
  "ach.anfitrion.d": { es: "Pagaste 3+ veces", en: "Paid 3+ times" },
  "ach.prontoPagador.t": { es: "Pronto pagador", en: "Quick settler" },
  "ach.prontoPagador.d": { es: "Saldó una deuda", en: "Settled a debt" },
  "ach.sinDeudas.t": { es: "Sin deudas", en: "Debt-free" },
  "ach.sinDeudas.d": { es: "Estás al día", en: "You're settled" },
  "ach.detallista.t": { es: "Detallista", en: "Organised" },
  "ach.detallista.d": { es: "Pagó 5+ veces", en: "Paid 5+ times" },

  "ready.title": { es: "Listos para saldar", en: "Ready to settle" },
  "ready.sub": { es: "Cada uno marca cuando ya agregó todos sus gastos.", en: "Each person marks when they've added all their expenses." },
  "ready.done": { es: "Listo", en: "Ready" },
  "ready.remind": { es: "Recordar", en: "Remind" },
  "ready.reminded": { es: "Recordatorio enviado a {name}.", en: "Reminder sent to {name}." },
  "ready.mark": { es: "Ya agregué todo", en: "I've added everything" },
  "ready.undo": { es: "Marcar pendiente", en: "Mark as pending" },
  "ready.allReady": { es: "Todos listos · hora de saldar", en: "Everyone's ready · time to settle" },
  "ach.crew.t": { es: "Crew", en: "Crew" },
  "ach.crew.d": { es: "4+ personas", en: "4+ people" },

  "recur.title":     { es: "Gastos recurrentes", en: "Recurring expenses" },
  "recur.new":       { es: "Nuevo", en: "New" },
  "recur.newTitle":  { es: "Nuevo gasto recurrente", en: "New recurring expense" },
  "recur.interval":  { es: "Frecuencia", en: "Frequency" },
  "recur.startDate": { es: "Primera fecha", en: "First date" },
  "recur.daily":     { es: "Diario", en: "Daily" },
  "recur.weekly":    { es: "Semanal", en: "Weekly" },
  "recur.monthly":   { es: "Mensual", en: "Monthly" },
  "recur.yearly":    { es: "Anual", en: "Yearly" },
  "recur.next":      { es: "Próx. {date}", en: "Next {date}" },
  "recur.paused":    { es: "Pausado", en: "Paused" },
  "recur.pause":     { es: "Pausar", en: "Pause" },
  "recur.resume":    { es: "Reanudar", en: "Resume" },
  "recur.save":      { es: "Guardar recurrente", en: "Save recurring" },
  "recur.addHint":   { es: "Añade un gasto recurrente (alquiler, suscripciones…)", en: "Add a recurring expense (rent, subscriptions…)" },

  "offline.banner": { es: "Sin conexión · los cambios se sincronizarán al reconectar", en: "Offline · changes will sync when you reconnect" },

  "settings.title":    { es: "Ajustes del grupo", en: "Group settings" },
  "settings.currency": { es: "Moneda", en: "Currency" },
  "settings.custom":   { es: "Otra", en: "Other" },
  "settings.members":  { es: "Miembros", en: "Members" },
  "settings.saved":    { es: "Guardado", en: "Saved" },

  "account.title":   { es: "Mi cuenta", en: "My account" },
  "account.name":    { es: "Tu nombre", en: "Your name" },
  "account.payHint": { es: "Se muestra al saldar deudas con el grupo.", en: "Shown when settling debts in a group." },
  "account.saved":   { es: "Guardado", en: "Saved" },
};

export function useT() {
  const l = useLang();
  return (key: string, params?: Record<string, string | number>) => {
    let s = DICT[key]?.[l] ?? key;
    if (params) for (const k in params) s = s.replace(new RegExp(`\\{${k}\\}`, "g"), String(params[k]));
    return s;
  };
}
