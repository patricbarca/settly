import AppIntents
import Capacitor
import UIKit
import UserNotifications

// Acciones de Settlia para Siri, la app Atajos, el Botón de Acción y la
// automatización de Wallet ("al pagar con Apple Pay").
//
// No guardan nada por su cuenta: abren la app con un deep link que recoge la
// capa web (src/lib/quickAdd.ts) y el gasto acaba en "Revisar y confirmar",
// igual que si lo hubieras escrito. Toda la lógica (IA, reparto, a qué grupo
// va) vive en un solo sitio: la web.

enum QuickAddLink {
    /// app.settlia.pwa://<route>?id=<uuid>[&text=<nota>]
    /// El id hace el enlace idempotente: Capacitor recuerda el último URL y la
    /// web lo ignora si ya lo procesó.
    static func url(route: String, text: String? = nil, extra: [String: String?] = [:]) -> URL? {
        var c = URLComponents()
        c.scheme = "app.settlia.pwa"
        c.host = route
        var items = [URLQueryItem(name: "id", value: UUID().uuidString)]
        if let text = text {
            items.append(URLQueryItem(name: "text", value: text))
        }
        for (key, value) in extra {
            let v = (value ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            if !v.isEmpty { items.append(URLQueryItem(name: key, value: String(v.prefix(80)))) }
        }
        c.queryItems = items
        return c.url
    }

    /// Se lo entrega a Capacitor por el mismo camino que AppDelegate usa para
    /// los deep links. Así llega tanto con la app abierta (evento appUrlOpen)
    /// como en arranque en frío (queda como lastURL → getLaunchUrl()).
    @MainActor
    static func deliver(_ url: URL) {
        _ = ApplicationDelegateProxy.shared.application(UIApplication.shared, open: url, options: [:])
    }
}

@available(iOS 16.0, *)
struct AddExpenseIntent: AppIntent {
    static var title: LocalizedStringResource = "Add expense"
    static var description = IntentDescription("Describe an expense, like “taxi 30 with Emma”. Settlia opens it ready for you to review before saving.")
    static var openAppWhenRun: Bool = true

    /// Lo que dictas a Siri o escribes en Atajos.
    @Parameter(title: "Expense")
    var note: String?

    /// Para la automatización de Wallet: se enlazan aquí el comercio y el
    /// importe del pago con Apple Pay.
    @Parameter(title: "Merchant")
    var merchant: String?

    @Parameter(title: "Amount")
    var amount: String?

    static var parameterSummary: some ParameterSummary {
        Summary("Add \(\.$note) to Settlia") {
            \.$merchant
            \.$amount
        }
    }

    @MainActor
    func perform() async throws -> some IntentResult {
        let typed = (note ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let shop = (merchant ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let paid = (amount ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let text = typed.isEmpty ? shop : typed
        guard !text.isEmpty || !paid.isEmpty else {
            // Siri pregunta "¿Qué gastaste?" y vuelve a ejecutar con la respuesta.
            throw $note.needsValueError(IntentDialog("What did you spend?"))
        }
        // El importe de Wallet va APARTE, nunca mezclado en el texto: el nombre
        // del comercio trae números de tienda ("Woolworths 2393") y el parser
        // tomaba ese número como importe.
        if let url = QuickAddLink.url(route: "add", text: String(text.prefix(200)), extra: ["paid": paid]) {
            QuickAddLink.deliver(url)
        }
        return .result()
    }
}

@available(iOS 16.0, *)
struct ScanReceiptIntent: AppIntent {
    static var title: LocalizedStringResource = "Scan receipt"
    static var description = IntentDescription("Opens Settlia straight to the receipt scanner.")
    static var openAppWhenRun: Bool = true

    /// Desde la automatización de Wallet: lo que se cobró en la tarjeta. El
    /// escáner lo usa para comprobar que el ticket leído suma lo mismo.
    @Parameter(title: "Merchant")
    var merchant: String?

    @Parameter(title: "Amount")
    var amount: String?

    static var parameterSummary: some ParameterSummary {
        // Con un parámetro dentro de la frase, Atajos muestra la flecha › y los
        // campos; con un Summary de texto fijo los escondía (visto en iPhone).
        Summary("Scan a receipt from \(\.$merchant)") {
            \.$amount
        }
    }

    @MainActor
    func perform() async throws -> some IntentResult {
        if let url = QuickAddLink.url(route: "scan", extra: ["paid": amount, "merchant": merchant]) {
            QuickAddLink.deliver(url)
        }
        return .result()
    }
}

/// Frases de Siri. Disponibles sin que el usuario configure nada; las versiones
/// en español están en es.lproj/AppShortcuts.strings (el formato .xcstrings
/// para frases exige iOS 17 y la app soporta desde iOS 15).
@available(iOS 16.0, *)
struct SettliaShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: AddExpenseIntent(),
            phrases: [
                "Add an expense in \(.applicationName)",
                "Add expense to \(.applicationName)",
                "Add a \(.applicationName) expense",
                "Split a bill in \(.applicationName)",
                "New expense in \(.applicationName)",
                "Log an expense in \(.applicationName)",
                "Add a cost to \(.applicationName)",
                "Split a cost with \(.applicationName)",
            ]
        )
        AppShortcut(
            intent: ScanReceiptIntent(),
            phrases: [
                "Scan a receipt in \(.applicationName)",
                "Scan receipt with \(.applicationName)",
                "Scan a ticket in \(.applicationName)",
                "Scan a ticket with \(.applicationName)",
                "Scan the receipt in \(.applicationName)",
                "Scan the bill in \(.applicationName)",
                "Scan with \(.applicationName)",
                "Scan in \(.applicationName)",
            ]
        )
    }
}

// MARK: - "Preguntar por un pago" (automatización de Wallet sin abrir la app)
//
// La automatización de Wallet llama a esta acción en segundo plano. En vez de
// abrir Settlia con un menú, deja una NOTIFICACIÓN con botones:
//   Añadir · Con ticket · Siempre a Personal · No preguntar por este comercio
// Los ajustes (importe mínimo, comercios ignorados o que van solos a Personal)
// los edita la web (pantalla "Siri y Atajos") y se guardan en el App Group,
// porque esta acción corre sin la web cargada.

enum PaymentPrefs {
    static let group = "group.app.settlia.pwa"
    static var defaults: UserDefaults { UserDefaults(suiteName: group) ?? .standard }
    static let minKey = "pay.minAmount"
    static let ignoredKey = "pay.ignored"
    static let personalKey = "pay.personal"
    static let queueKey = "pay.queue"
    static let langKey = "pay.lang"
    // Bandeja de pagos: cada pago se guarda al momento en el servidor y por la noche llega un solo aviso.
    static let modeKey = "pay.mode"            // "ask" (notificación por pago) | "inbox"
    static let tokenKey = "pay.token"          // token de dispositivo (RPC wallet_device_token)
    static let apiUrlKey = "pay.apiUrl"        // URL de Supabase
    static let apiKeyKey = "pay.apiKey"        // clave pública (anon) de Supabase
    static let digestHourKey = "pay.digestHour"
    static let digestCountKey = "pay.digestCount"
    static let digestDayKey = "pay.digestDay"
    static let openInboxKey = "pay.openInbox"

    static var inboxMode: Bool {
        defaults.string(forKey: modeKey) == "inbox" && !(defaults.string(forKey: tokenKey) ?? "").isEmpty
    }
    static var digestHour: Int {
        let h = defaults.object(forKey: digestHourKey) as? Int ?? 20
        return min(max(h, 0), 23)
    }
    static func dayString(_ d: Date) -> String {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f.string(from: d)
    }

    static var minAmount: Double { defaults.double(forKey: minKey) }

    static func list(_ k: String) -> [[String: String]] {
        (defaults.array(forKey: k) as? [[String: String]]) ?? []
    }
    static func keys(_ k: String) -> Set<String> {
        Set(list(k).compactMap { $0["key"] })
    }
    static func add(_ k: String, key: String, name: String) {
        guard !key.isEmpty else { return }
        var l = list(k).filter { $0["key"] != key }
        l.append(["key": key, "name": String(name.prefix(60))])
        defaults.set(l, forKey: k)
    }

    /// Pagos que van solos a "Personal": la web los recoge al abrirse.
    static func enqueue(merchant: String, amount: String, inbox: Bool = false, id: String = UUID().uuidString) {
        var q = list(queueKey)
        var item = ["id": id, "merchant": String(merchant.prefix(80)), "amount": amount, "date": dayString(Date())]
        if inbox { item["inbox"] = "1" }
        q.append(item)
        defaults.set(Array(q.suffix(200)), forKey: queueKey)
    }

    /// Clave estable de un comercio: "TRANSLINK ROMA ST 0042" → "translink".
    /// Sin números ni símbolos; la primera palabra con sustancia (o las dos
    /// primeras si es corta). Así todas las tiendas de una cadena coinciden.
    static func merchantKey(_ s: String) -> String {
        let lowered = s.lowercased().folding(options: .diacriticInsensitive, locale: nil)
        let stop: Set<String> = ["the", "el", "la", "los", "las", "le", "les", "de", "del", "pty", "ltd", "inc", "sq", "sp"]
        let words = lowered.components(separatedBy: CharacterSet.letters.inverted).filter { $0.count >= 2 && !stop.contains($0) }
        guard let first = words.first else { return lowered.trimmingCharacters(in: .whitespacesAndNewlines) }
        return first.count >= 4 ? first : words.prefix(2).joined(separator: " ")
    }

    /// Mismo criterio que parseMoney() de la web: "A$1,234.56", "48,00 €", "200.000 ₫".
    static func parseAmount(_ raw: String) -> Double? {
        let compact = raw.replacingOccurrences(of: " ", with: "")
        guard let r = compact.range(of: "[0-9][0-9.,]*", options: .regularExpression) else { return nil }
        var s = String(compact[r])
        while let last = s.last, last == "." || last == "," { s.removeLast() }
        let decIdx = [s.lastIndex(of: "."), s.lastIndex(of: ",")].compactMap { $0 }.max()
        if let d = decIdx {
            let after = s.distance(from: d, to: s.endIndex) - 1
            if after >= 1 && after <= 2 {
                let intPart = s[..<d].replacingOccurrences(of: ".", with: "").replacingOccurrences(of: ",", with: "")
                s = intPart + "." + s[s.index(after: d)...]
            } else {
                s = s.replacingOccurrences(of: ".", with: "").replacingOccurrences(of: ",", with: "")
            }
        }
        guard let v = Double(s), v > 0 else { return nil }
        return v
    }

    static var spanish: Bool {
        if let l = defaults.string(forKey: langKey) { return l == "es" }
        return (Locale.preferredLanguages.first ?? "en").hasPrefix("es")
    }
    static func L(_ es: String, _ en: String) -> String { spanish ? es : en }
}

/// Guarda un pago en la bandeja del grupo Personal sin abrir la app (RPC
/// wallet_capture con la clave pública + el token de este dispositivo).
enum WalletCapture {
    static func send(merchant: String, amount: Double, id: String) async -> Bool {
        let d = PaymentPrefs.defaults
        guard let base = d.string(forKey: PaymentPrefs.apiUrlKey), !base.isEmpty,
              let key = d.string(forKey: PaymentPrefs.apiKeyKey), !key.isEmpty,
              let tok = d.string(forKey: PaymentPrefs.tokenKey), !tok.isEmpty,
              let url = URL(string: base + "/rest/v1/rpc/wallet_capture") else { return false }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.timeoutInterval = 15
        req.setValue(key, forHTTPHeaderField: "apikey")
        req.setValue("Bearer " + key, forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let body: [String: Any] = [
            "p_token": tok, "p_id": id, "p_merchant": String(merchant.prefix(80)),
            "p_amount": amount, "p_date": PaymentPrefs.dayString(Date()),
        ]
        req.httpBody = try? JSONSerialization.data(withJSONObject: body)
        do {
            let (data, resp) = try await URLSession.shared.data(for: req)
            guard (resp as? HTTPURLResponse)?.statusCode == 200,
                  let s = String(data: data, encoding: .utf8) else { return false }
            return s.contains("ok") || s.contains("dup")
        } catch {
            return false
        }
    }

    /// Un solo aviso por la noche ("Tienes N pagos por revisar"). Se reprograma
    /// con el mismo id en cada pago, así solo queda uno con el número al día.
    static func bumpDigest() async {
        let d = PaymentPrefs.defaults
        let cal = Calendar.current
        var comps = cal.dateComponents([.year, .month, .day], from: Date())
        comps.hour = PaymentPrefs.digestHour
        comps.minute = 0
        var fire = cal.date(from: comps) ?? Date()
        if fire <= Date() { fire = cal.date(byAdding: .day, value: 1, to: fire) ?? fire }
        let day = PaymentPrefs.dayString(fire)
        let n = (d.string(forKey: PaymentPrefs.digestDayKey) == day ? d.integer(forKey: PaymentPrefs.digestCountKey) : 0) + 1
        d.set(n, forKey: PaymentPrefs.digestCountKey)
        d.set(day, forKey: PaymentPrefs.digestDayKey)

        let center = UNUserNotificationCenter.current()
        let s = await center.notificationSettings()
        guard s.authorizationStatus == .authorized || s.authorizationStatus == .provisional else { return }
        let L = PaymentPrefs.L
        let c = UNMutableNotificationContent()
        c.title = L("Pagos por revisar", "Payments to review")
        c.body = n == 1
            ? L("Tienes 1 pago con Apple Pay en tu bandeja. ¿Lo repartimos?", "You have 1 Apple Pay payment in your inbox. Split it?")
            : L("Tienes \(n) pagos con Apple Pay en tu bandeja. ¿Los repartimos?", "You have \(n) Apple Pay payments in your inbox. Split them?")
        c.categoryIdentifier = PaymentNotifications.digestCategory
        c.sound = .default
        let fc = cal.dateComponents([.year, .month, .day, .hour, .minute], from: fire)
        let req = UNNotificationRequest(identifier: "settlia.digest", content: c,
                                        trigger: UNCalendarNotificationTrigger(dateMatching: fc, repeats: false))
        try? await center.add(req)
    }
}

/// Notificación "¿Compartir este gasto?" y lo que pasa al tocar sus botones.
final class PaymentNotifications: NSObject, NotificationHandlerProtocol, UNUserNotificationCenterDelegate {
    static let shared = PaymentNotifications()
    static let category = "SETTLIA_PAY"
    static let digestCategory = "SETTLIA_DIGEST"

    /// Delegado de Capacitor al que se reenvía todo lo que no es nuestro.
    weak var router: NotificationRouter?

    static func registerCategory() async {
        let center = UNUserNotificationCenter.current()
        let L = PaymentPrefs.L
        let cat = UNNotificationCategory(
            identifier: category,
            actions: [
                UNNotificationAction(identifier: "add", title: L("Añadir", "Add"), options: [.foreground]),
                UNNotificationAction(identifier: "scan", title: L("Añadir con ticket", "Add with receipt"), options: [.foreground]),
                UNNotificationAction(identifier: "personal", title: L("Siempre a Personal", "Always to Personal"), options: []),
                UNNotificationAction(identifier: "never", title: L("No preguntar por este comercio", "Don't ask for this merchant"), options: [.destructive]),
            ],
            intentIdentifiers: [],
            options: []
        )
        let existing = await center.notificationCategories()
        center.setNotificationCategories(existing.filter { $0.identifier != category }.union([cat]))
    }

    /// Devuelve false si el usuario no permite notificaciones.
    static func post(merchant: String, amount: String, key: String) async -> Bool {
        let center = UNUserNotificationCenter.current()
        let settings = await center.notificationSettings()
        guard settings.authorizationStatus == .authorized || settings.authorizationStatus == .provisional
            || settings.authorizationStatus == .ephemeral else { return false }
        await registerCategory()
        let L = PaymentPrefs.L
        let c = UNMutableNotificationContent()
        c.title = L("¿Compartir este gasto?", "Share this expense?")
        let shop = merchant.isEmpty ? L("Pago con Apple Pay", "Apple Pay payment") : merchant
        c.body = amount.isEmpty ? shop : "\(shop) · \(amount)"
        c.categoryIdentifier = category
        c.threadIdentifier = "settlia.pay"
        c.sound = .default
        c.userInfo = ["settliaPay": true, "merchant": merchant, "amount": amount, "key": key]
        let req = UNNotificationRequest(identifier: "settlia.pay." + UUID().uuidString, content: c, trigger: nil)
        do { try await center.add(req) } catch { return false }
        return true
    }

    private func isOurs(_ n: UNNotification) -> Bool {
        n.request.content.categoryIdentifier == Self.category || n.request.content.categoryIdentifier == Self.digestCategory
    }

    func willPresent(notification: UNNotification) -> UNNotificationPresentationOptions {
        [.banner, .list, .sound]
    }

    func didReceive(response: UNNotificationResponse) {
        if response.notification.request.content.categoryIdentifier == Self.digestCategory {
            // Al abrir la app, la web lleva a la bandeja (WalletPrefs.takeQueue → openInbox).
            PaymentPrefs.defaults.set(true, forKey: PaymentPrefs.openInboxKey)
            PaymentPrefs.defaults.set(0, forKey: PaymentPrefs.digestCountKey)
            return
        }
        let info = response.notification.request.content.userInfo
        let merchant = info["merchant"] as? String ?? ""
        let amount = info["amount"] as? String ?? ""
        let key = info["key"] as? String ?? PaymentPrefs.merchantKey(merchant)
        switch response.actionIdentifier {
        case "never":
            PaymentPrefs.add(PaymentPrefs.ignoredKey, key: key, name: merchant)
        case "personal":
            PaymentPrefs.add(PaymentPrefs.personalKey, key: key, name: merchant)
            PaymentPrefs.enqueue(merchant: merchant, amount: amount)
        case "scan":
            if let url = QuickAddLink.url(route: "scan", extra: ["paid": amount, "merchant": merchant]) {
                DispatchQueue.main.async { QuickAddLink.deliver(url) }
            }
        case UNNotificationDismissActionIdentifier:
            break
        default: // "add" o tocar la notificación
            if let url = QuickAddLink.url(route: "add", text: String(merchant.prefix(200)), extra: ["paid": amount]) {
                DispatchQueue.main.async { QuickAddLink.deliver(url) }
            }
        }
    }

    // Delegado propio solo para el arranque en frío (antes de que Capacitor
    // ponga el suyo). Lo que no es nuestro se reenvía a Capacitor.
    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification,
                                withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        if isOurs(notification) { completionHandler(willPresent(notification: notification)); return }
        if let r = router { r.userNotificationCenter(center, willPresent: notification, withCompletionHandler: completionHandler) }
        else { completionHandler([]) }
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse,
                                withCompletionHandler completionHandler: @escaping () -> Void) {
        if isOurs(response.notification) { didReceive(response: response); completionHandler(); return }
        if let r = router { r.userNotificationCenter(center, didReceive: response, withCompletionHandler: completionHandler) }
        else { completionHandler() }
    }
}

@available(iOS 16.0, *)
enum PaymentPromptError: Error, CustomLocalizedStringResourceConvertible {
    case notificationsOff
    var localizedStringResource: LocalizedStringResource {
        "Turn on Settlia notifications in Settings so it can ask about your payments."
    }
}

@available(iOS 16.0, *)
struct PaymentPromptIntent: AppIntent {
    static var title: LocalizedStringResource = "Ask about a payment"
    static var description = IntentDescription("For the Wallet automation: Settlia sends a notification to add the payment, without opening the app. Small payments and merchants you chose are skipped.")
    static var openAppWhenRun: Bool = false

    @Parameter(title: "Merchant")
    var merchant: String?

    @Parameter(title: "Amount")
    var amount: String?

    static var parameterSummary: some ParameterSummary {
        Summary("Ask about a payment at \(\.$merchant)") {
            \.$amount
        }
    }

    func perform() async throws -> some IntentResult {
        let shop = (merchant ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let paid = (amount ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let key = PaymentPrefs.merchantKey(shop)
        if !key.isEmpty && PaymentPrefs.keys(PaymentPrefs.ignoredKey).contains(key) {
            return .result()
        }
        if !key.isEmpty && PaymentPrefs.keys(PaymentPrefs.personalKey).contains(key) {
            PaymentPrefs.enqueue(merchant: shop, amount: paid)
            return .result()
        }
        let min = PaymentPrefs.minAmount
        if min > 0, let v = PaymentPrefs.parseAmount(paid), v < min {
            return .result()
        }
        // Modo bandeja: se guarda al momento, sin preguntar; aviso único por la noche.
        if PaymentPrefs.inboxMode, let v = PaymentPrefs.parseAmount(paid) {
            let id = UUID().uuidString
            if !(await WalletCapture.send(merchant: shop, amount: v, id: id)) {
                // Sin red o error: queda en cola y la app lo sube a la bandeja al abrirse.
                PaymentPrefs.enqueue(merchant: shop, amount: paid, inbox: true, id: id)
            }
            await WalletCapture.bumpDigest()
            return .result()
        }
        if !(await PaymentNotifications.post(merchant: shop, amount: paid, key: key)) {
            throw PaymentPromptError.notificationsOff
        }
        return .result()
    }
}

/// Puente para la web: leer/guardar los ajustes de pagos y recoger la cola de
/// "Siempre a Personal".
@objc(WalletPrefsPlugin)
public class WalletPrefsPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "WalletPrefsPlugin"
    public let jsName = "WalletPrefs"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "get", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "set", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "takeQueue", returnType: CAPPluginReturnPromise),
    ]

    @objc func get(_ call: CAPPluginCall) {
        UNUserNotificationCenter.current().getNotificationSettings { s in
            call.resolve([
                "minAmount": PaymentPrefs.minAmount,
                "ignored": PaymentPrefs.list(PaymentPrefs.ignoredKey),
                "personal": PaymentPrefs.list(PaymentPrefs.personalKey),
                "notifications": s.authorizationStatus == .authorized || s.authorizationStatus == .provisional,
                "mode": PaymentPrefs.inboxMode ? "inbox" : "ask",
                "digestHour": PaymentPrefs.digestHour,
            ])
        }
    }

    @objc func set(_ call: CAPPluginCall) {
        let d = PaymentPrefs.defaults
        if let m = call.getDouble("minAmount") { d.set(max(0, m), forKey: PaymentPrefs.minKey) }
        if let l = call.getString("lang") { d.set(l, forKey: PaymentPrefs.langKey) }
        if let m = call.getString("mode") { d.set(m == "inbox" ? "inbox" : "ask", forKey: PaymentPrefs.modeKey) }
        if let t = call.getString("token") { d.set(t, forKey: PaymentPrefs.tokenKey) }
        if let u = call.getString("apiUrl") { d.set(u, forKey: PaymentPrefs.apiUrlKey) }
        if let k = call.getString("apiKey") { d.set(k, forKey: PaymentPrefs.apiKeyKey) }
        if let h = call.getInt("digestHour") { d.set(min(max(h, 0), 23), forKey: PaymentPrefs.digestHourKey) }
        for (field, key) in [("ignored", PaymentPrefs.ignoredKey), ("personal", PaymentPrefs.personalKey)] {
            if let arr = call.getArray(field) as? [[String: Any]] {
                let clean = arr.compactMap { o -> [String: String]? in
                    guard let k = o["key"] as? String, !k.isEmpty else { return nil }
                    return ["key": k, "name": (o["name"] as? String) ?? k]
                }
                d.set(clean, forKey: key)
            }
        }
        call.resolve()
    }

    @objc func takeQueue(_ call: CAPPluginCall) {
        let q = PaymentPrefs.list(PaymentPrefs.queueKey)
        PaymentPrefs.defaults.removeObject(forKey: PaymentPrefs.queueKey)
        let open = PaymentPrefs.defaults.bool(forKey: PaymentPrefs.openInboxKey)
        PaymentPrefs.defaults.removeObject(forKey: PaymentPrefs.openInboxKey)
        call.resolve(["items": q, "openInbox": open])
    }
}
