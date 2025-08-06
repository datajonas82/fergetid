const PREMIUM_PRODUCT_ID = 'com.fergetid.ferryapp.premium';

class StoreKitService {
  constructor() {
    this.isInitialized = false;
    this.isPremium = false;
    this.products = [];
  }

  async initialize() {
    try {
      // Check if we're in a web environment
      if (typeof window === 'undefined' || !window.Capacitor) {
        console.log('🌐 Web environment - premium not available');
        this.isInitialized = true;
        return;
      }

      // Check if we're on iOS
      if (window.Capacitor.getPlatform() === 'ios') {
        console.log('📱 iOS platform - initializing native StoreKit');
        await this.initializeNativeStoreKit();
      } else {
        console.log('📱 Non-iOS platform - premium not available');
        this.isInitialized = true;
      }
      
      this.isInitialized = true;
      console.log('✅ StoreKit service initialized');
    } catch (error) {
      console.error('❌ Failed to initialize StoreKit service:', error);
      this.isInitialized = true;
    }
  }

  async initializeNativeStoreKit() {
    try {
      // Create native StoreKit bridge if it doesn't exist
      if (!window.storekit) {
        this.createNativeStoreKitBridge();
      }

      // Load products
      await this.loadProducts();
      
      // Restore purchases
      await this.restorePurchases();
    } catch (error) {
      console.error('Native StoreKit initialization failed:', error);
      throw error;
    }
  }

  createNativeStoreKitBridge() {
    // Create StoreKit bridge for native iOS
    window.storekit = {
      loadProducts: async (productIds) => {
        return new Promise((resolve, reject) => {
          if (window.webkit?.messageHandlers?.storekit) {
            // Native iOS implementation
            window.webkit.messageHandlers.storekit.postMessage({
              action: 'loadProducts',
              productIds: productIds
            });
            
            // Listen for response
            window.storekitResponse = (data) => {
              resolve(data.products || data);
            };
          } else {
            // Fallback for simulator/testing
            resolve([{
              id: PREMIUM_PRODUCT_ID,
              title: 'Premium',
              description: 'Få tilgang til kjøretidsberegning og ventetid på fergekaien',
              price: '29 kr'
            }]);
          }
        });
      },

      purchaseProduct: async (productId) => {
        return new Promise((resolve, reject) => {
          if (window.webkit?.messageHandlers?.storekit) {
            // Native iOS implementation
            window.webkit.messageHandlers.storekit.postMessage({
              action: 'purchaseProduct',
              productId: productId
            });
            
            // Listen for response
            window.storekitPurchaseResponse = (data) => {
              resolve(data);
            };
          } else {
            // Fallback for simulator/testing
            resolve({ success: true, message: 'Purchase successful (simulator)' });
          }
        });
      },

      restorePurchases: async () => {
        return new Promise((resolve, reject) => {
          if (window.webkit?.messageHandlers?.storekit) {
            // Native iOS implementation
            window.webkit.messageHandlers.storekit.postMessage({
              action: 'restorePurchases'
            });
            
            // Listen for response
            window.storekitRestoreResponse = (data) => {
              resolve(data);
            };
          } else {
            // Fallback for simulator/testing
            resolve({ 
              success: false, 
              purchases: [],
              message: 'No purchases to restore (simulator)' 
            });
          }
        });
      }
    };
  }

  async loadProducts() {
    try {
      if (!window.storekit) {
        throw new Error('StoreKit not available');
      }

      const products = await window.storekit.loadProducts([PREMIUM_PRODUCT_ID]);
      this.products = products;
      console.log('📦 Products loaded:', products);
      return products;
    } catch (error) {
      console.error('Failed to load products:', error);
      throw error;
    }
  }

  async purchasePremium() {
    try {
      // Check if we're in a web environment
      if (typeof window === 'undefined' || !window.Capacitor) {
        return { success: false, message: 'Premium not available in web browser' };
      }

      // Check if we're on iOS
      if (window.Capacitor.getPlatform() !== 'ios') {
        return { success: false, message: 'Premium only available on iOS' };
      }

      // Check if StoreKit is available
      if (!window.storekit || !window.webkit?.messageHandlers?.storekit) {
        return { success: false, message: 'StoreKit not available' };
      }

      if (!this.products.length) {
        await this.loadProducts();
      }

      const product = this.products.find(p => p.id === PREMIUM_PRODUCT_ID);
      if (!product) {
        throw new Error('Premium product not found');
      }

      // Execute purchase
      const result = await window.storekit.purchaseProduct(PREMIUM_PRODUCT_ID);
      
      if (result.success) {
        this.isPremium = true;
        return { success: true, message: 'Premium purchased successfully!' };
      } else {
        throw new Error(result.error || 'Purchase failed');
      }
    } catch (error) {
      console.error('Premium purchase failed:', error);
      return { success: false, message: error.message || 'Purchase failed' };
    }
  }

  async restorePurchases() {
    try {
      // Check if we're in a web environment
      if (typeof window === 'undefined' || !window.Capacitor) {
        return { success: false, message: 'Premium not available in web browser' };
      }

      // Check if we're on iOS
      if (window.Capacitor.getPlatform() !== 'ios') {
        return { success: false, message: 'Premium only available on iOS' };
      }

      // Check if StoreKit is available
      if (!window.storekit || !window.webkit?.messageHandlers?.storekit) {
        return { success: false, message: 'StoreKit not available' };
      }

      // Restore purchases from App Store
      const result = await window.storekit.restorePurchases();
      
      // Check if premium was purchased
      this.isPremium = result.purchases && result.purchases.some(purchase => 
        purchase.productId === PREMIUM_PRODUCT_ID && purchase.valid
      );
      
      if (this.isPremium) {
        return { success: true, message: 'Purchases restored successfully!' };
      } else {
        return { success: false, message: 'No purchases to restore' };
      }
    } catch (error) {
      console.error('Failed to restore purchases:', error);
      return { success: false, message: error.message || 'Restore failed' };
    }
  }

  isPremiumUser() {
    return this.isPremium;
  }

  getProducts() {
    return this.products;
  }
}

export const storeKitService = new StoreKitService(); 