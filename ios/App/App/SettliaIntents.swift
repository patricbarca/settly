import AppIntents
import Capacitor
import UIKit

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
        let fromWallet = [merchant, amount]
            .compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
            .joined(separator: " ")
        let text = typed.isEmpty ? fromWallet : typed
        guard !text.isEmpty else {
            // Siri pregunta "¿Qué gastaste?" y vuelve a ejecutar con la respuesta.
            throw $note.needsValueError(IntentDialog("What did you spend?"))
        }
        if let url = QuickAddLink.url(route: "add", text: String(text.prefix(200))) {
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
        Summary("Scan a receipt") {
            \.$merchant
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
