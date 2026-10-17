import Capacitor
import UIKit
import UniformTypeIdentifiers

/// Entrega a la web la imagen que dejó la extensión "Compartir con Settlia"
/// (ShareExtension) en el portapapeles con nombre del equipo, y la borra.
@objc(SharedImagePlugin)
public class SharedImagePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SharedImagePlugin"
    public let jsName = "SharedImage"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "take", returnType: CAPPluginReturnPromise),
    ]

    @objc func take(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            // 1) Archivo en el contenedor del App Group.
            if let dir = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: "group.app.settlia.pwa") {
                let f = dir.appendingPathComponent("shared.jpg")
                if let data = try? Data(contentsOf: f) {
                    try? FileManager.default.removeItem(at: f)
                    UIPasteboard(name: UIPasteboard.Name("app.settlia.pwa.share"), create: false)?.items = []
                    call.resolve(["dataUrl": "data:image/jpeg;base64," + data.base64EncodedString()])
                    return
                }
            }
            // 2) Respaldo: portapapeles con nombre.
            guard let pb = UIPasteboard(name: UIPasteboard.Name("app.settlia.pwa.share"), create: false),
                  let data = pb.data(forPasteboardType: UTType.jpeg.identifier) else {
                call.resolve([:])
                return
            }
            pb.items = []
            call.resolve(["dataUrl": "data:image/jpeg;base64," + data.base64EncodedString()])
        }
    }
}
