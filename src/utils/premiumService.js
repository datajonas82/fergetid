import { Purchases } from '@revenuecat/purchases-capacitor';

// RevenueCat API Key - du må få denne fra RevenueCat dashboard
const REVENUECAT_API_KEY = 'your_revenuecat_api_key_here';

// Product ID for premium funksjon
const PREMIUM_PRODUCT_ID = 'com.fergetid.premium';

// Test mode - sett til false for production
const TEST_MODE = false;
const TEST_PREMIUM = false; // Ikke brukt i production

class PremiumService {
  constructor() {
    this.isInitialized = false;
    this.isPremium = false;
  }

  async initialize() {
    try {
      if (TEST_MODE) {
        // Test mode - ikke initialiser RevenueCat
        this.isInitialized = true;
        this.isPremium = TEST_PREMIUM;

        return;
      }

      // Initialiser RevenueCat
      await Purchases.configure({
        apiKey: REVENUECAT_API_KEY,
        appUserID: null // RevenueCat vil generere en anonym bruker-ID
      });
      
      this.isInitialized = true;
      
      // Sjekk om brukeren allerede har premium
      await this.checkPremiumStatus();
      

    } catch (error) {
      console.error('❌ Failed to initialize premium service:', error);
    }
  }

  async checkPremiumStatus() {
    try {
      if (TEST_MODE) {
        return this.isPremium;
      }

      const customerInfo = await Purchases.getCustomerInfo();
      
      // Sjekk om brukeren har kjøpt premium
      this.isPremium = customerInfo.entitlements.active['premium'] !== undefined;
      

      return this.isPremium;
    } catch (error) {
      console.error('❌ Failed to check premium status:', error);
      return false;
    }
  }

  async purchasePremium() {
    try {
      if (TEST_MODE) {
        // Test mode - simuler vellykket kjøp
        this.isPremium = true;

        return { success: true, message: 'Premium kjøpt! (Test mode)' };
      }


      
      // Hent tilgjengelige produkter
      const offerings = await Purchases.getOfferings();
      const premiumOffering = offerings.current?.availablePackages.find(
        pkg => pkg.identifier === PREMIUM_PRODUCT_ID
      );
      
      if (!premiumOffering) {
        throw new Error('Premium product not found');
      }
      
      // Utfør kjøpet
      const { customerInfo } = await Purchases.purchasePackage({
        aPackage: premiumOffering
      });
      
      // Sjekk om kjøpet var vellykket
      this.isPremium = customerInfo.entitlements.active['premium'] !== undefined;
      
      if (this.isPremium) {

        return { success: true, message: 'Premium kjøpt!' };
      } else {
        throw new Error('Purchase completed but premium not activated');
      }
    } catch (error) {
      console.error('❌ Premium purchase failed:', error);
      return { success: false, message: 'Kjøp feilet: ' + error.message };
    }
  }

  async restorePurchases() {
    try {
      if (TEST_MODE) {
        // Test mode - simuler gjenoppretting
        this.isPremium = TEST_PREMIUM;
        const message = this.isPremium ? 'Kjøp gjenopprettet! (Test mode)' : 'Ingen kjøp å gjenopprette (Test mode)';

        return { success: this.isPremium, message };
      }


      
      const customerInfo = await Purchases.restorePurchases();
      this.isPremium = customerInfo.entitlements.active['premium'] !== undefined;
      
      if (this.isPremium) {

        return { success: true, message: 'Kjøp gjenopprettet!' };
      } else {
        return { success: false, message: 'Ingen kjøp å gjenopprette' };
      }
    } catch (error) {
      console.error('❌ Failed to restore purchases:', error);
      return { success: false, message: 'Gjenoppretting feilet' };
    }
  }

  isPremiumUser() {
    return this.isPremium;
  }

  // Test funksjoner for enkel testing
  setTestPremium(status) {
    if (TEST_MODE) {
      this.isPremium = status;
      
    }
  }

  getTestMode() {
    return TEST_MODE;
  }

  async showPremiumModal() {
    // Dette kan du implementere med en modal-komponent

  }
}

// Eksporter en singleton instance
export const premiumService = new PremiumService(); 