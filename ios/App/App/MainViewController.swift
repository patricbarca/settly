import Capacitor
import UIKit

/// Controlador principal: el de Capacitor + plugins propios de la app (los que
/// no vienen de npm, que Capacitor no descubre solo).
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(SharedImagePlugin())
    }
}
