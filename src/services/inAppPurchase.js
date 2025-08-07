import { Capacitor } from '@capacitor/core';

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
      // Check local storage for purchase status
      const purchaseStatus = localStorage.getItem('kjoretidberegning_purchased');
      return purchaseStatus === 'true';
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
        title: 'Kjøretidberegning',
        description: 'Beregn kjøretid til fergekaier og få fargekodet avganger',
        price: 'N/A',
        available: false
      };
    }

    try {
      // For now, return static product info
      // In a real implementation, you would fetch this from StoreKit
      return {
        id: PRODUCT_ID,
        title: 'Kjøretidberegning',
        description: 'Beregn kjøretid til fergekaier og få fargekodet avganger basert på om du rekker avgangen eller ikke',
        price: '29 kr',
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
      // Simulate purchase process
      // In a real implementation, you would integrate with StoreKit here
      console.log('Starting purchase process for:', PRODUCT_ID);
      
      // For demo purposes, we'll simulate a successful purchase
      // In production, you would use the actual StoreKit API
      await this.simulatePurchase();
      
      return true;
    } catch (error) {
      console.error('Purchase failed:', error);
      throw error;
    }
  }

  // Simulate purchase (for demo purposes)
  async simulatePurchase() {
    return new Promise((resolve, reject) => {
      // Simulate network delay
      setTimeout(() => {
        try {
          // Mark as purchased
          this.isPurchased = true;
          localStorage.setItem('kjoretidberegning_purchased', 'true');
          console.log('Purchase completed successfully');
          resolve(true);
        } catch (error) {
          reject(error);
        }
      }, 2000);
    });
  }

  // Restore purchases
  async restorePurchases() {
    if (!this.isAvailable) {
      throw new Error('In-app purchases not available on this platform');
    }

    try {
      console.log('Restoring purchases...');
      
      // Check if user has purchased the feature
      const wasPurchased = await this.checkPurchaseStatus();
      if (wasPurchased) {
        this.isPurchased = true;
        console.log('Purchase restored successfully');
        return true;
      } else {
        console.log('No purchases to restore');
        return false;
      }
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
