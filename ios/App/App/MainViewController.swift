import Capacitor
import UIKit

/// Controlador principal: el de Capacitor + plugins propios de la app (los que
/// no vienen de npm, que Capacitor no descubre solo).
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(SharedImagePlugin())
        bridge?.registerPluginInstance(WalletPrefsPlugin())
        // Los toques en la notificación "¿Compartir este gasto?" (local, no push)
        // llegan por aquí una vez cargado Capacitor.
        if let router = bridge?.notificationRouter {
            router.localNotificationHandler = PaymentNotifications.shared
            PaymentNotifications.shared.router = router
        }
    }
}
