import UIKit
import UniformTypeIdentifiers

// "Compartir con Settlia": la extensión del menú Compartir de iOS.
//
// No guarda nada por su cuenta (igual que las App Intents de Siri): prepara lo
// compartido y abre la app con un deep link, y el gasto entra en el flujo
// normal → Revisar y confirmar.
//
//  · Imagen (foto del ticket, captura del pago en la app del banco) → se deja en
//    un portapapeles CON NOMBRE, privado del equipo de desarrollador (no hace
//    falta App Group), y se abre `app.settlia.pwa://scan?shared=1`. La app la
//    recoge con el plugin SharedImage y la pasa al escáner.
//  · Texto o enlace (p. ej. el texto de una notificación del banco) → se abre
//    `app.settlia.pwa://add?text=…` y la IA lo interpreta como cualquier nota.
final class ShareViewController: UIViewController {
    static let pasteboardName = UIPasteboard.Name("app.settlia.pwa.share")
    static let appGroup = "group.app.settlia.shared"

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 0.05, green: 0.11, blue: 0.16, alpha: 0.6)
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        Task { await handle() }
    }

    private func handle() async {
        let providers = (extensionContext?.inputItems as? [NSExtensionItem] ?? [])
            .flatMap { $0.attachments ?? [] }

        if let p = providers.first(where: { $0.hasItemConformingToTypeIdentifier(UTType.image.identifier) }),
           let image = await loadImage(p),
           let jpeg = Self.scaled(image).jpegData(compressionQuality: 0.85) {
            // Vía principal: archivo en el contenedor del App Group (lo comparten
            // la app y la extensión). El portapapeles con nombre queda de respaldo.
            if let dir = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: Self.appGroup) {
                try? jpeg.write(to: dir.appendingPathComponent("shared.jpg"), options: .atomic)
            }
            let pb = UIPasteboard(name: Self.pasteboardName, create: true)
            pb?.setData(jpeg, forPasteboardType: UTType.jpeg.identifier)
            open("app.settlia.pwa://scan?shared=1&id=\(UUID().uuidString)")
            return
        }

        if let p = providers.first(where: { $0.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) || $0.hasItemConformingToTypeIdentifier(UTType.url.identifier) }),
           let text = await loadText(p), !text.isEmpty {
            var c = URLComponents(string: "app.settlia.pwa://add")!
            c.queryItems = [
                URLQueryItem(name: "text", value: String(text.prefix(300))),
                URLQueryItem(name: "id", value: UUID().uuidString),
            ]
            if let url = c.url?.absoluteString { open(url); return }
        }

        finish()
    }

    // MARK: - Carga

    private func loadImage(_ p: NSItemProvider) async -> UIImage? {
        await withCheckedContinuation { cont in
            p.loadItem(forTypeIdentifier: UTType.image.identifier, options: nil) { item, _ in
                if let url = item as? URL, let data = try? Data(contentsOf: url) { cont.resume(returning: UIImage(data: data)); return }
                if let data = item as? Data { cont.resume(returning: UIImage(data: data)); return }
                if let img = item as? UIImage { cont.resume(returning: img); return }
                cont.resume(returning: nil)
            }
        }
    }

    private func loadText(_ p: NSItemProvider) async -> String? {
        let type = p.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) ? UTType.plainText : UTType.url
        return await withCheckedContinuation { cont in
            p.loadItem(forTypeIdentifier: type.identifier, options: nil) { item, _ in
                if let s = item as? String { cont.resume(returning: s.trimmingCharacters(in: .whitespacesAndNewlines)); return }
                if let u = item as? URL { cont.resume(returning: u.absoluteString); return }
                cont.resume(returning: nil)
            }
        }
    }

    /// Mismo tamaño que usa la web para escanear (≤2000 px): legible para la IA
    /// sin mandar originales de varios MB.
    private static func scaled(_ image: UIImage, maxSide: CGFloat = 2000) -> UIImage {
        let s = image.size
        let k = min(1, maxSide / max(s.width, s.height))
        if k >= 1 { return image }
        let size = CGSize(width: s.width * k, height: s.height * k)
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        return UIGraphicsImageRenderer(size: size, format: format).image { _ in image.draw(in: CGRect(origin: .zero, size: size)) }
    }

    // MARK: - Abrir la app

    /// Una extensión no tiene `UIApplication.shared`; se busca en la cadena de
    /// responders (el método documentado `open(_:options:)`, que sigue
    /// funcionando en iOS 18 — el viejo selector `openURL:` dejó de hacerlo).
    private func open(_ urlString: String) {
        guard let url = URL(string: urlString) else { return finish() }
        var r: UIResponder? = self
        while let current = r {
            if let app = current as? UIApplication {
                app.open(url, options: [:], completionHandler: nil)
                break
            }
            r = current.next
        }
        finish()
    }

    private func finish() {
        extensionContext?.completeRequest(returningItems: nil, completionHandler: nil)
    }
}
