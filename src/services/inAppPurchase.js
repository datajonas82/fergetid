import { Capacitor } from '@capacitor/core';

// Import cordova-plugin-purchase
import 'cordova-plugin-purchase';

// In-app purchase product ID
const PRODUCT_ID = 'kjoretidbeskrivelse';

class InAppPurchaseService {
  constructor() {
    this.isAvailable = Capacitor.isNativePlatform();
    this.isPurchased = false;
    this.isInitialized = false;
    this.product = null;
    this.store = null;
  }

  // Initialize the in-app purchase service
  async initialize() {
    if (!this.isAvailable) {
      console.log('In-app purchases not available on web platform');
      return false;
    }

    // Wait for Cordova to be ready before accessing CdvPurchase
    let attempts = 0;
    const maxAttempts = 10;
    
    while (attempts < maxAttempts) {
      if (typeof window !== 'undefined' && window.CdvPurchase && window.CdvPurchase.store) {
        this.store = window.CdvPurchase.store;
        console.log('CdvPurchase found after', attempts + 1, 'attempts');
        break;
      } else {
        console.log('Waiting for CdvPurchase... attempt', attempts + 1);
        await new Promise(resolve => setTimeout(resolve, 500));
        attempts++;
      }
    }
    
    if (!this.store) {
      console.error('CdvPurchase not available after', maxAttempts, 'attempts');
      return false;
    }

    try {
      console.log('Store object:', this.store);
      
      // Configure the store with debug logging
      this.store.verbosity = this.store.DEBUG;
      
      console.log('Registering product:', PRODUCT_ID);
      
      // Register the product
      this.store.register([{
        id: PRODUCT_ID,
        type: this.store.NON_CONSUMABLE
      }]);
      
      // Also try registering with platform specification
      this.store.register([{
        id: PRODUCT_ID,
        platform: 'ios',
        type: this.store.NON_CONSUMABLE
      }]);
      
      // Set up event handlers
      this.setupEventHandlers();

      console.log('Initializing store...');
      
      // Initialize the store
      this.store.initialize();
      
      // Also try to refresh the store to load products
      setTimeout(() => {
        console.log('Refreshing store after initialization...');
        this.store.refresh();
      }, 2000);
      
      // Wait for store to be ready
      return new Promise((resolve) => {
        const checkReady = () => {
          console.log('Checking store ready state:', this.store.ready);
          
          if (this.store.ready) {
            console.log('Store is ready');
            this.isInitialized = true;
            console.log('In-app purchase service initialized successfully');
            
            // Check if product is loaded
            const product = this.store.get(PRODUCT_ID);
            console.log('Product after initialization:', product);
            
            resolve(true);
          } else {
            console.log('Store not ready yet, waiting...');
            setTimeout(checkReady, 500);
          }
        };
        
        // Start checking for ready state
        setTimeout(checkReady, 1000);
      });
      
    } catch (error) {
      console.error('Failed to initialize in-app purchase service:', error);
      return false;
    }
  }

  // Set up event handlers for purchase events
  setupEventHandlers() {
    if (!this.store) {
      console.log('Store not available in setupEventHandlers');
      return;
    }

    console.log('Setting up event handlers...');

    try {
      // Handle when products are loaded
      this.store.when('product').loaded((product) => {
        console.log('Product loaded:', product.id, product.title, product.price);
        this.product = product;
      });

      // Handle when products are updated
      this.store.when('product').updated((product) => {
        console.log('Product updated:', product.id, product.owned);
        if (product.owned) {
          this.isPurchased = true;
        }
        this.product = product;
      });

      // Handle when products are owned
      this.store.when('product').owned((product) => {
        console.log('Product owned:', product.id);
        this.isPurchased = true;
        this.product = product;
      });

      // Handle when products are purchased
      this.store.when('product').purchased((product) => {
        console.log('Product purchased:', product.id);
        this.isPurchased = true;
        this.product = product;
      });

      // Handle when products are approved
      this.store.when('product').approved((product) => {
        console.log('Product approved:', product.id);
        this.isPurchased = true;
        this.product = product;
      });

      // Handle when products are cancelled
      this.store.when('product').cancelled((product) => {
        console.log('Product purchase cancelled:', product.id);
      });

      // Handle when products have errors
      this.store.when('product').error((error) => {
        console.error('Product error:', error);
      });

      // Handle when store is ready
      this.store.when('store').ready(() => {
        console.log('Store is ready');
        this.isInitialized = true;
      });

      // Handle when store is refreshed
      this.store.when('store').refreshed(() => {
        console.log('Store refreshed');
        this.checkPurchaseStatus();
      });

      console.log('Event handlers set up successfully');
      
    } catch (error) {
      console.error('Error setting up event handlers:', error);
    }
  }

  // Check if the user has already purchased the feature
  async checkPurchaseStatus() {
    if (!this.isAvailable || !this.store) return false;

    try {
      // Check if the product is owned using the store's owned method
      const isOwned = this.store.owned(PRODUCT_ID);
      if (isOwned) {
        this.isPurchased = true;
        return true;
      }
      
      // Also check the product directly
      const product = this.store.get(PRODUCT_ID);
      if (product && product.owned) {
        this.isPurchased = true;
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Error checking purchase status:', error);
      return false;
    }
  }

  // Get product information
  async getProductInfo() {
    if (!this.isAvailable) {
      return {
        id: PRODUCT_ID,
        title: 'Kjøretidbeskrivelse',
        description: 'Få kjøretid, fargekodet avganger og informasjon om du rekker avgangen',
        price: 'N/A',
        available: false
      };
    }

    if (!this.store) {
      return {
        id: PRODUCT_ID,
        title: 'Kjøretidbeskrivelse',
        description: 'Få kjøretid, fargekodet avganger og informasjon om du rekker avgangen',
        price: 'N/A',
        available: false
      };
    }

    try {
      const product = this.store.get(PRODUCT_ID);
      if (product && product.valid) {
        return {
          id: product.id,
          title: product.title || 'Kjøretidbeskrivelse',
          description: product.description || 'Få kjøretid, fargekodet avganger og informasjon om du rekker avgangen',
          price: product.price || 'N/A',
          available: true,
          owned: product.owned || false
        };
      }
      
      return {
        id: PRODUCT_ID,
        title: 'Kjøretidbeskrivelse',
        description: 'Få kjøretid, fargekodet avganger og informasjon om du rekker avgangen',
        price: 'N/A',
        available: false
      };
    } catch (error) {
      console.error('Error getting product info:', error);
      return {
        id: PRODUCT_ID,
        title: 'Kjøretidbeskrivelse',
        description: 'Få kjøretid, fargekodet avganger og informasjon om du rekker avgangen',
        price: 'N/A',
        available: false
      };
    }
  }

  // Purchase the feature
  async purchase() {
    if (!this.isAvailable) {
      throw new Error('In-app purchases not available on this platform');
    }

    if (!this.store) {
      throw new Error('Store not available');
    }

    if (!this.isInitialized) {
      throw new Error('In-app purchase service not initialized');
    }

    if (this.isPurchased) {
      throw new Error('Feature already purchased');
    }

    try {
      console.log('Starting purchase process for:', PRODUCT_ID);
      console.log('Current purchase status:', this.getPurchaseStatus());
      console.log('Store ready state:', this.store.ready);
      console.log('Store initialized state:', this.store.initialized);
      console.log('Store products before refresh:', this.store.products ? this.store.products.length : 0);
      console.log('Product before refresh:', this.store.get(PRODUCT_ID));
      
      // Refresh the store to get latest product info
      console.log('Refreshing store to get latest product info...');
      await this.store.refresh();
      
      // Wait a bit for the refresh to complete
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      console.log('Store after refresh - ready:', this.store.ready);
      console.log('Store after refresh - products count:', this.store.products ? this.store.products.length : 0);
      
      // Get the product
      const product = this.store.get(PRODUCT_ID);
      console.log('Product found:', product);
      console.log('Product type:', typeof product);
      console.log('Product keys:', product ? Object.keys(product) : 'null');
      
      if (!product) {
        console.log('Available products:', this.store.products);
        console.log('Store products array:', Array.from(this.store.products || []));
        console.log('Store state:', {
          ready: this.store.ready,
          initialized: this.store.initialized,
          products: this.store.products ? this.store.products.length : 0
        });
        
        // Try to get all products
        const allProducts = [];
        if (this.store.products) {
          this.store.products.forEach(p => {
            allProducts.push({
              id: p.id,
              title: p.title,
              price: p.price,
              valid: p.valid,
              owned: p.owned
            });
          });
        }
        console.log('All products in store:', allProducts);
        
        throw new Error('Product not found in store. Make sure the StoreKit configuration file is properly set up.');
      }
      
      console.log('Product details:', {
        id: product.id,
        title: product.title,
        price: product.price,
        owned: product.owned,
        valid: product.valid,
        canPurchase: product.canPurchase,
        state: product.state
      });
      
      if (!product.valid) {
        throw new Error('Product not available for purchase. Product is not valid.');
      }

      if (product.owned) {
        this.isPurchased = true;
        throw new Error('Product already owned');
      }

      console.log('Product is valid, attempting to order...');
      console.log('Product order method available:', typeof product.order === 'function');
      
      // Order the product
      try {
        console.log('Calling product.order()...');
        const orderResult = await product.order();
        console.log('Order result:', orderResult);
        console.log('Order result type:', typeof orderResult);
        console.log('Order result keys:', orderResult ? Object.keys(orderResult) : 'null');
      } catch (orderError) {
        console.error('Error calling product.order():', orderError);
        console.error('Order error details:', JSON.stringify(orderError, null, 2));
        throw orderError;
      }
      
      if (orderResult && orderResult.error) {
        console.error('Order error:', orderResult.error);
        if (orderResult.error.code === this.store.ERR_PAYMENT_CANCELLED) {
          throw new Error('Payment cancelled by user');
        } else {
          throw new Error(`Purchase failed: ${orderResult.error.message || 'Unknown error'}`);
        }
      } else {
        console.log('Purchase order created successfully');
        return true;
      }
    } catch (error) {
      console.error('Purchase failed:', error);
      console.error('Error details:', JSON.stringify(error, null, 2));
      console.error('Error message:', error.message);
      console.error('Error name:', error.name);
      console.error('Error stack:', error.stack);
      
      // If error object is empty, provide more context
      if (!error.message && Object.keys(error).length === 0) {
        console.error('Empty error object detected. This usually means the product was not found or the store is not properly initialized.');
        console.error('Store state at error:', {
          ready: this.store.ready,
          initialized: this.store.initialized,
          productsCount: this.store.products ? this.store.products.length : 0,
          productFound: this.store.get(PRODUCT_ID) ? true : false
        });
        throw new Error('Produktet ble ikke funnet. Sjekk at StoreKit konfigurasjonen er riktig.');
      }
      
      throw error;
    }
  }

  // Restore purchases
  async restorePurchases() {
    if (!this.isAvailable) {
      throw new Error('In-app purchases not available on this platform');
    }

    if (!this.store) {
      throw new Error('Store not available');
    }

    try {
      console.log('Restoring purchases...');
      
      // Refresh the store to restore purchases
      await this.store.refresh();
      
      // Check if any products are now owned
      const product = this.store.get(PRODUCT_ID);
      if (product && product.owned) {
        this.isPurchased = true;
        console.log('Purchase restored successfully');
        return true;
      }
      
      console.log('No purchases to restore');
      return false;
    } catch (error) {
      console.error('Error restoring purchases:', error);
      throw error;
    }
  }

  // Check if the feature is available
  isFeatureAvailable() {
    return this.isAvailable && this.isPurchased;
  }

  // Get purchase status
  getPurchaseStatus() {
    return {
      isAvailable: this.isAvailable,
      isPurchased: this.isPurchased,
      isInitialized: this.isInitialized,
      product: this.product ? {
        id: this.product.id,
        title: this.product.title,
        price: this.product.price,
        owned: this.product.owned
      } : null
    };
  }

  // Get the store instance (for advanced usage)
  getStore() {
    return this.store;
  }
}

// Create singleton instance
const inAppPurchaseService = new InAppPurchaseService();

export default inAppPurchaseService;
