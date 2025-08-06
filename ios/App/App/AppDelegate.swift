import UIKit
import StoreKit
import WebKit
import CoreLocation

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?
    var webView: WKWebView?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Override point for customization after application launch.
        // Setup StoreKit bridge for WKWebView
        setupStoreKitBridge()
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Called when the app was launched with a url. Feel free to add additional processing here,
        // but if you want the App API to support tracking app url opens, make sure to keep this call
        return true
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Called when the app was launched with an activity, including Universal Links.
        // Feel free to add additional processing here, but if you want the App API to support
        // tracking app url opens, make sure to keep this call
        return true
    }

    // MARK: - StoreKit Bridge Setup
    func setupStoreKitBridge() {
        // Find WKWebView in the view hierarchy after a delay to ensure it's loaded
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
            self.findAndSetupWebView()
        }
    }
    
    func findAndSetupWebView() {
        guard let window = UIApplication.shared.windows.first else { return }
        
        // Recursively search for WKWebView in the view hierarchy
        if let webView = findWKWebView(in: window.rootViewController?.view) {
            self.webView = webView
            let contentController = webView.configuration.userContentController
            contentController.add(StoreKitMessageHandler(webView: webView), name: "storekit")
            print("✅ StoreKit bridge setup complete")
        } else {
            print("⚠️ WKWebView not found, retrying...")
            DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) {
                self.findAndSetupWebView()
            }
        }
    }
    
    func findWKWebView(in view: UIView?) -> WKWebView? {
        guard let view = view else { return nil }
        
        if let webView = view as? WKWebView {
            return webView
        }
        
        for subview in view.subviews {
            if let webView = findWKWebView(in: subview) {
                return webView
            }
        }
        
        return nil
    }
}

// MARK: - StoreKit Message Handler
class StoreKitMessageHandler: NSObject, WKScriptMessageHandler {
    weak var webView: WKWebView?
    var productRequest: SKProductsRequest?
    var products: [SKProduct] = []

    init(webView: WKWebView) {
        self.webView = webView
        super.init()
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any],
              let action = body["action"] as? String else { return }
        
        switch action {
        case "loadProducts":
            if let productIds = body["productIds"] as? [String] {
                loadProducts(productIds: productIds)
            }
        case "purchaseProduct":
            if let productId = body["productId"] as? String {
                purchaseProduct(productId: productId)
            }
        case "restorePurchases":
            print("🔄 Restoring purchases...")
            SKPaymentQueue.default().restoreCompletedTransactions()
            // Send immediate response that restore is in progress
            sendToWeb(function: "storekitRestoreResponse", data: [
                "success": true,
                "purchases": [],
                "message": "Restore in progress..."
            ])
        case "getLocationName":
            if let lat = body["lat"] as? Double,
               let lng = body["lng"] as? Double {
                getLocationName(lat: lat, lng: lng)
            }
        default:
            break
        }
    }

    // MARK: - StoreKit Logic
    func loadProducts(productIds: [String]) {
        let request = SKProductsRequest(productIdentifiers: Set(productIds))
        request.delegate = self
        self.productRequest = request
        request.start()
    }

    func purchaseProduct(productId: String) {
        guard let product = products.first(where: { $0.productIdentifier == productId }) else {
            sendToWeb(function: "storekitPurchaseResponse", data: ["success": false, "error": "Product not found"])
            return
        }
        let payment = SKPayment(product: product)
        SKPaymentQueue.default().add(self)
        SKPaymentQueue.default().add(payment)
    }
    
    // MARK: - Geocoding
    func getLocationName(lat: Double, lng: Double) {
        let location = CLLocation(latitude: lat, longitude: lng)
        let geocoder = CLGeocoder()
        
        geocoder.reverseGeocodeLocation(location) { [weak self] placemarks, error in
            DispatchQueue.main.async {
                if let error = error {
                    print("❌ Geocoding error: \(error.localizedDescription)")
                    self?.sendToWeb(function: "geocodingResponse", data: [
                        "success": false,
                        "error": error.localizedDescription
                    ])
                    return
                }
                
                if let placemark = placemarks?.first {
                    let locationName = self?.formatLocationName(placemark: placemark) ?? "Unknown location"
                    print("📍 iOS Geocoding success: \(locationName)")
                    self?.sendToWeb(function: "geocodingResponse", data: [
                        "success": true,
                        "locationName": locationName
                    ])
                } else {
                    print("❌ No placemarks found")
                    self?.sendToWeb(function: "geocodingResponse", data: [
                        "success": false,
                        "error": "No location found"
                    ])
                }
            }
        }
    }
    
    private func formatLocationName(placemark: CLPlacemark) -> String {
        var components: [String] = []
        
        if let locality = placemark.locality {
            components.append(locality)
        }
        if let administrativeArea = placemark.administrativeArea {
            components.append(administrativeArea)
        }
        if let country = placemark.country {
            components.append(country)
        }
        
        return components.joined(separator: ", ")
    }

    // MARK: - Send Data to WebView
    func sendToWeb(function: String, data: [String: Any]) {
        guard let webView = self.webView else { return }
        if let jsonData = try? JSONSerialization.data(withJSONObject: data, options: []),
           let jsonString = String(data: jsonData, encoding: .utf8) {
            let js = "if (window.\(function)) { window.\(function)(\(jsonString)); }"
            DispatchQueue.main.async {
                webView.evaluateJavaScript(js, completionHandler: nil)
            }
        }
    }
}

// MARK: - SKProductsRequestDelegate, SKPaymentTransactionObserver
extension StoreKitMessageHandler: SKProductsRequestDelegate, SKPaymentTransactionObserver {
    func productsRequest(_ request: SKProductsRequest, didReceive response: SKProductsResponse) {
        self.products = response.products
        let productsArray = response.products.map { product in
            return [
                "id": product.productIdentifier,
                "title": product.localizedTitle,
                "description": product.localizedDescription,
                "price": product.price.stringValue
            ]
        }
        sendToWeb(function: "storekitResponse", data: ["products": productsArray])
    }

    func paymentQueue(_ queue: SKPaymentQueue, updatedTransactions transactions: [SKPaymentTransaction]) {
        for transaction in transactions {
            switch transaction.transactionState {
            case .purchased:
                sendToWeb(function: "storekitPurchaseResponse", data: ["success": true, "message": "Purchase successful!"])
                SKPaymentQueue.default().finishTransaction(transaction)
            case .failed:
                let errorMsg = transaction.error?.localizedDescription ?? "Unknown error"
                sendToWeb(function: "storekitPurchaseResponse", data: ["success": false, "error": errorMsg])
                SKPaymentQueue.default().finishTransaction(transaction)
            case .restored:
                sendToWeb(function: "storekitRestoreResponse", data: ["success": true, "message": "Purchase restored!"])
                SKPaymentQueue.default().finishTransaction(transaction)
            default:
                break
            }
        }
    }

    func paymentQueueRestoreCompletedTransactionsFinished(_ queue: SKPaymentQueue) {
        print("✅ Restore completed")
        let purchases = queue.transactions.filter { $0.transactionState == .restored }.map { transaction in
            return [
                "productId": transaction.payment.productIdentifier,
                "valid": true
            ]
        }
        
        sendToWeb(function: "storekitRestoreResponse", data: [
            "success": true,
            "purchases": purchases,
            "message": purchases.isEmpty ? "No purchases to restore" : "Purchases restored!"
        ])
    }

    func paymentQueue(_ queue: SKPaymentQueue, restoreCompletedTransactionsFailedWithError error: Error) {
        sendToWeb(function: "storekitRestoreResponse", data: ["success": false, "error": error.localizedDescription])
    }
}
