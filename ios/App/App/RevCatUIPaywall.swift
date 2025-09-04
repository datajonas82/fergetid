import Foundation
import Capacitor
#if canImport(RevenueCatUI)
import RevenueCatUI
#endif

@objc(RevCatUIPaywall)
public class RevCatUIPaywall: CAPPlugin {
    @objc public func show(_ call: CAPPluginCall) {
        #if canImport(RevenueCatUI)
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            let offeringId = call.getString("offeringId")

            #if canImport(RevenueCatUI)
            let controller: UIViewController
            if let offeringId = offeringId, !offeringId.isEmpty {
                controller = PaywallViewController(offeringIdentifier: offeringId)
            } else {
                controller = PaywallViewController(offeringIdentifier: nil)
            }
            controller.modalPresentationStyle = .formSheet
            self.bridge?.viewController?.present(controller, animated: true) {
                call.resolve()
            }
            #else
            call.reject("RevenueCatUI not available")
            #endif
        }
        #else
        call.reject("RevenueCatUI not available")
        #endif
    }
}


