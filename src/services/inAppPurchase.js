import { Capacitor } from '@capacitor/core';
import { InAppPurchase } from 'capacitor-plugin-purchase';

// In-app purchase product ID
const PRODUCT_ID = 'kjoretidberegning';

class InAppPurchaseService {
  constructor() {
    this.isAvailable = Capacitor.isNativePlatform();
    this.isPurchased = false;
    this.isInitialized = false;
  }

  // Initialize the in-app purchase service
  async initialize() {
    if (!this.isAvailable) {
      console.log('In-app purchases not available on web platform');
      return false;
    }

    try {
      // Verify device can make purchases
      const { allowed } = await InAppPurchase.canMakePurchases();
      if (!allowed) {
        console.warn('In-app purchases are disabled on this device');
        this.isInitialized = true;
        return false;
      }

      // Check if user has already purchased the feature
      this.isPurchased = await this.checkPurchaseStatus();
      this.isInitialized = true;
      console.log('In-app purchase service initialized. Purchased:', this.isPurchased);
      return true;
    } catch (error) {
      console.error('Failed to initialize in-app purchase service:', error);
      return false;
    }
  }

  // Check if the user has already purchased the feature
  async checkPurchaseStatus() {
    if (!this.isAvailable) return false;

    try {
      // Ask StoreKit for active purchases
      const result = await InAppPurchase.getActivePurchases();
      const owned = (result?.purchases || []).some(p => p.productId === PRODUCT_ID);
      if (owned) {
        this.isPurchased = true;
        localStorage.setItem('kjoretidberegning_purchased', 'true');
        return true;
      }
      // Fallback to local storage for previously stored state
      const purchaseStatus = localStorage.getItem('kjoretidberegning_purchased');
      return purchaseStatus === 'true';
    } catch (error) {
      console.error('Error checking purchase status:', error);
      // Fallback to local state if StoreKit query fails
      try {
        const purchaseStatus = localStorage.getItem('kjoretidberegning_purchased');
        return purchaseStatus === 'true';
      } catch (_) {
        return false;
      }
    }
  }

  // Get product information
  async getProductInfo() {
    if (!this.isAvailable) {
      return {
        id: PRODUCT_ID,
        title: 'Kjøretidberegning',
        description: 'Beregn kjøretid til fergekaier og få fargekodet avganger',
        price: 'N/A',
        available: false
      };
    }

    try {
      const products = await InAppPurchase.getProducts({
        productIds: [PRODUCT_ID],
        productType: 'non-consumable'
      });
      const product = (products?.products || []).find(p => p.productId === PRODUCT_ID);
      if (!product) return null;
      return {
        id: product.productId,
        title: product.title || 'Kjøretidberegning',
        description: product.description || 'Beregn kjøretid til fergekaier og få fargekodet avganger basert på om du rekker avgangen eller ikke',
        price: product.price || '—',
        available: true
      };
    } catch (error) {
      console.error('Error getting product info:', error);
      return null;
    }
  }

  // Purchase the feature
  async purchase() {
    if (!this.isAvailable) {
      throw new Error('In-app purchases not available on this platform');
    }

    if (this.isPurchased) {
      throw new Error('Feature already purchased');
    }

    try {
      console.log('Starting purchase process for:', PRODUCT_ID);
      const result = await InAppPurchase.purchaseProduct({
        productId: PRODUCT_ID,
        productType: 'non-consumable'
      });

      if (result?.transactionId) {
        this.isPurchased = true;
        localStorage.setItem('kjoretidberegning_purchased', 'true');
        return true;
      }
      throw new Error('Purchase did not return a transactionId');
    } catch (error) {
      console.error('Purchase failed:', error);
      throw error;
    }
  }

  // Simulated purchase removed – real StoreKit used

  // Restore purchases
  async restorePurchases() {
    if (!this.isAvailable) {
      throw new Error('In-app purchases not available on this platform');
    }

    try {
      console.log('Restoring purchases...');
      const result = await InAppPurchase.restorePurchases();
      const restored = (result?.purchases || []).some(p => p.productId === PRODUCT_ID);
      if (restored) {
        this.isPurchased = true;
        localStorage.setItem('kjoretidberegning_purchased', 'true');
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
      isInitialized: this.isInitialized
    };
  }
}

// Create singleton instance
const inAppPurchaseService = new InAppPurchaseService();

export default inAppPurchaseService;
