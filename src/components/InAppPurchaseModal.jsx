import React, { useState, useEffect } from 'react';
import inAppPurchaseService from '../services/inAppPurchase';

const InAppPurchaseModal = ({ isOpen, onClose, onPurchaseSuccess }) => {
  const [productInfo, setProductInfo] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isOpen) {
      loadProductInfo();
    }
  }, [isOpen]);

  const loadProductInfo = async () => {
    try {
      const info = await inAppPurchaseService.getProductInfo();
      setProductInfo(info);
    } catch (error) {
      console.error('Error loading product info:', error);
      setError('Kunne ikke laste produktinformasjon');
    }
  };

  const handlePurchase = async () => {
    setIsLoading(true);
    setError(null);

    try {
      await inAppPurchaseService.purchase();
      onPurchaseSuccess();
      onClose();
    } catch (error) {
      console.error('Purchase failed:', error);
      console.error('Error details:', JSON.stringify(error, null, 2));
      console.error('Error message:', error.message);
      console.error('Error name:', error.name);
      
      // Show more specific error messages
      let errorMessage = 'Kjøpet feilet. Prøv igjen senere.';
      
      if (error.message) {
        if (error.message.includes('Product not found')) {
          errorMessage = 'Produktet ble ikke funnet. Sjekk StoreKit konfigurasjon.';
        } else if (error.message.includes('Payment cancelled')) {
          errorMessage = 'Betalingen ble avbrutt.';
        } else if (error.message.includes('already purchased')) {
          errorMessage = 'Du har allerede kjøpt dette produktet.';
        } else if (error.message.includes('not available')) {
          errorMessage = 'Produktet er ikke tilgjengelig for kjøp.';
        } else {
          errorMessage = `Kjøpet feilet: ${error.message}`;
        }
      }
      
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRestore = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const restored = await inAppPurchaseService.restorePurchases();
      if (restored) {
        onPurchaseSuccess();
        onClose();
      } else {
        setError('Ingen kjøp å gjenopprette');
      }
    } catch (error) {
      console.error('Restore failed:', error);
      setError('Gjenoppretting feilet. Prøv igjen senere.');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-800 mb-4">
            Kjøretidbeskrivelse
          </h2>
          
          <div className="mb-6">
            <div className="bg-fuchsia-100 rounded-lg p-4 mb-4">
              <h3 className="font-semibold text-fuchsia-800 mb-2">
                Hva får du?
              </h3>
              <ul className="text-sm text-fuchsia-700 space-y-1">
                <li>• Kjøretid til fergekaier</li>
                <li>• Fargekodet avganger (grønn/rød)</li>
                <li>• Informasjon om du rekker avgangen</li>
                <li>• Ventetid til neste avgang</li>
              </ul>
            </div>
            
            {productInfo && (
              <div className="text-center">
                <div className="text-3xl font-bold text-fuchsia-600 mb-2">
                  {productInfo.price}
                </div>
                <div className="text-sm text-gray-600">
                  Kun engangsbetaling
                </div>
              </div>
            )}
          </div>

          {error && (
            <div className="bg-red-100 border border-red-300 text-red-700 px-4 py-3 rounded-lg mb-4">
              {error}
            </div>
          )}

          <div className="space-y-3">
            <button
              onClick={handlePurchase}
              disabled={isLoading}
              className="w-full bg-fuchsia-600 hover:bg-fuchsia-700 disabled:bg-gray-400 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
            >
              {isLoading ? 'Kjøper...' : 'Kjøp nå'}
            </button>
            
            <button
              onClick={handleRestore}
              disabled={isLoading}
              className="w-full bg-gray-200 hover:bg-gray-300 disabled:bg-gray-100 text-gray-700 font-semibold py-3 px-6 rounded-lg transition-colors"
            >
              Gjenopprett kjøp
            </button>
            
            <button
              onClick={onClose}
              disabled={isLoading}
              className="w-full bg-transparent hover:bg-gray-100 text-gray-600 font-semibold py-3 px-6 rounded-lg transition-colors"
            >
              Avbryt
            </button>
          </div>

          <div className="mt-4 text-xs text-gray-500">
            Kjøpet vil bli lagt til din App Store-konto
          </div>
        </div>
      </div>
    </div>
  );
};

export default InAppPurchaseModal;
