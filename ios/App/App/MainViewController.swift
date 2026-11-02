import Capacitor
import StoreKit
import UIKit

/// Controlador principal: el de Capacitor + plugins propios de la app (los que
/// no vienen de npm, que Capacitor no descubre solo).
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(SharedImagePlugin())
        bridge?.registerPluginInstance(WalletPrefsPlugin())
        bridge?.registerPluginInstance(StoreReviewPlugin())
        // Los toques en la notificación "¿Compartir este gasto?" (local, no push)
        // llegan por aquí una vez cargado Capacitor.
        if let router = bridge?.notificationRouter {
            router.localNotificationHandler = PaymentNotifications.shared
            PaymentNotifications.shared.router = router
        }
    }
}

/// Ventana de valoración de Apple (la muestra o no según sus límites).
@objc(StoreReviewPlugin)
public class StoreReviewPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "StoreReviewPlugin"
    public let jsName = "StoreReview"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "request", returnType: CAPPluginReturnPromise)
    ]

    @objc func request(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if let scene = UIApplication.shared.connectedScenes
                .first(where: { $0.activationState == .foregroundActive }) as? UIWindowScene {
                SKStoreReviewController.requestReview(in: scene)
            }
            call.resolve()
        }
    }
}
