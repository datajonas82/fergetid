import React, { useState, useEffect } from 'react';
import inAppPurchaseService from '../services/inAppPurchase';
import InAppPurchaseModal from './InAppPurchaseModal';

const DrivingTimeToggle = ({ isEnabled, onToggle, isIOS }) => {
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [purchaseStatus, setPurchaseStatus] = useState(null);

  useEffect(() => {
    initializePurchaseService();
  }, []);

  const initializePurchaseService = async () => {
    try {
      await inAppPurchaseService.initialize();
      const status = inAppPurchaseService.getPurchaseStatus();
      setPurchaseStatus(status);
    } catch (error) {
      console.error('Failed to initialize purchase service:', error);
    }
  };

  const handleToggle = () => {
    if (!isIOS) {
      // Feature not available on web
      return;
    }

    if (!purchaseStatus?.isPurchased) {
      // Show purchase modal
      setShowPurchaseModal(true);
    } else {
      // Toggle the feature
      onToggle(!isEnabled);
    }
  };

  const handlePurchaseSuccess = () => {
    // Refresh purchase status
    const status = inAppPurchaseService.getPurchaseStatus();
    setPurchaseStatus(status);
    
    // Enable the feature
    onToggle(true);
  };

  const getButtonText = () => {
    if (!isIOS) {
      return 'Kjøretidberegning (kun iOS)';
    }
    
    if (!purchaseStatus?.isPurchased) {
      return 'Kjøp kjøretidberegning';
    }
    
    return isEnabled ? 'Skru av kjøretidberegning' : 'Beregn kjøretid';
  };

  const getButtonStyle = () => {
    if (!isIOS) {
      return 'bg-gray-400 cursor-not-allowed';
    }
    
    if (!purchaseStatus?.isPurchased) {
      return 'bg-fuchsia-600 hover:bg-fuchsia-700';
    }
    
    return isEnabled ? 'bg-green-600 hover:bg-green-700' : 'bg-blue-600 hover:bg-blue-700';
  };

  return (
    <>
      <button
        onClick={handleToggle}
        disabled={!isIOS}
        className={`px-4 py-2 text-white font-semibold rounded-lg transition-colors ${getButtonStyle()}`}
        title={!isIOS ? 'Denne funksjonen er kun tilgjengelig på iOS' : ''}
      >
        {getButtonText()}
      </button>

      <InAppPurchaseModal
        isOpen={showPurchaseModal}
        onClose={() => setShowPurchaseModal(false)}
        onPurchaseSuccess={handlePurchaseSuccess}
      />
    </>
  );
};

export default DrivingTimeToggle;
