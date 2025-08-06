import React, { useState } from 'react';
import { premiumService } from '../utils/premiumService';

const PremiumModal = ({ isOpen, onClose, onPurchaseSuccess }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handlePurchase = async () => {
    setIsLoading(true);
    setMessage('');
    
    try {
      const result = await premiumService.purchasePremium();
      
      if (result.success) {
        setMessage(result.message);
        setTimeout(() => {
          onPurchaseSuccess();
          onClose();
        }, 1500);
      } else {
        setMessage(result.message);
      }
    } catch (error) {
      setMessage('En feil oppstod. Prøv igjen.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRestore = async () => {
    setIsLoading(true);
    setMessage('');
    
    try {
      const result = await premiumService.restorePurchases();
      setMessage(result.message);
      
      if (result.success) {
        setTimeout(() => {
          onPurchaseSuccess();
          onClose();
        }, 1500);
      }
    } catch (error) {
      setMessage('Gjenoppretting feilet. Prøv igjen.');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="text-4xl mb-2">💎</div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Få Premium</h2>
          <p className="text-gray-600">Lås opp kjøretidsberegning</p>
        </div>

        {/* Features */}
        <div className="mb-6">
          <h3 className="font-semibold text-gray-800 mb-3">Premium funksjoner:</h3>
          <ul className="space-y-2">
            <li className="flex items-center">
              <span className="text-green-500 mr-2">✓</span>
              <span className="text-gray-700">Nøyaktig kjøretidsberegning</span>
            </li>
            <li className="flex items-center">
              <span className="text-green-500 mr-2">✓</span>
              <span className="text-gray-700">Ventetid på fergekaien</span>
            </li>
            <li className="flex items-center">
              <span className="text-green-500 mr-2">✓</span>
              <span className="text-gray-700">Fargekodet avgangstider</span>
            </li>
            <li className="flex items-center">
              <span className="text-green-500 mr-2">✓</span>
              <span className="text-gray-700">Ingen reklame</span>
            </li>
          </ul>
        </div>

        {/* Price */}
        <div className="text-center mb-6">
          <div className="text-3xl font-bold text-blue-600">29 kr</div>
          <div className="text-sm text-gray-500">Engangskjøp</div>
        </div>

        {/* Message */}
        {message && (
          <div className={`text-center mb-4 p-3 rounded-lg ${
            message.includes('feilet') ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
          }`}>
            {message}
          </div>
        )}

        {/* Buttons */}
        <div className="space-y-3">
          <button
            onClick={handlePurchase}
            disabled={isLoading}
            className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Kjøper...' : 'Kjøp Premium'}
          </button>
          
          <button
            onClick={handleRestore}
            disabled={isLoading}
            className="w-full bg-gray-200 text-gray-700 py-2 px-4 rounded-lg font-medium hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Gjenopprett kjøp
          </button>
          
          <button
            onClick={onClose}
            disabled={isLoading}
            className="w-full text-gray-500 py-2 px-4 rounded-lg font-medium hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Avbryt
          </button>
        </div>

        {/* Terms */}
        <div className="text-xs text-gray-400 text-center mt-4">
          Kjøp gjelder for alltid. Du kan gjenopprette kjøp på ny enhet.
        </div>
      </div>
    </div>
  );
};

export default PremiumModal; 