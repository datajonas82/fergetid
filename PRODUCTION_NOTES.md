# Production Notes

## App Overview
- **Name:** FergTid
- **Bundle ID:** com.fergetid.ferryapp
- **Platform:** iOS (Capacitor)
- **Framework:** React + Vite

## Dependencies
- **Capacitor:** Cross-platform native functionality
- **GraphQL:** Entur API for ferry data
- **Google Maps API:** Location services and geocoding
- **Apple StoreKit:** Native in-app purchases

## Features
- **Ferry Stop Search:** Find ferry stops by name
- **GPS Location:** Find nearby ferry stops
- **Departure Times:** Real-time departure information
- **Responsive Design:** Works on all iOS devices
- **Premium Features:** Driving time calculation (iOS only)

## Premium Implementation
- **Product ID:** com.fergetid.ferryapp.premium
- **Price:** 29 kr (one-time purchase)
- **Features:**
  - Accurate driving time calculation
  - Wait time at ferry terminal
  - Color-coded departure times
  - No advertisements
- **Platform:** iOS only (native StoreKit)
- **Web Environment:** Premium not available (shows appropriate message)

## APIs Used
- **Entur API:** Norwegian public transport data
- **Google Maps API:** Location services and geocoding

## Build Process
1. **Development:** `npm run dev`
2. **Build:** `npm run build`
3. **iOS Sync:** `npx cap sync ios`
4. **Xcode:** Open `ios/App/App.xcworkspace`

## App Store Submission
- **iOS Version:** 14.0+
- **Devices:** iPhone and iPad
- **Category:** Travel
- **Content Rating:** 4+

## Technical Notes
- Uses Capacitor for native iOS functionality
- GraphQL queries for efficient data fetching
- Responsive design with Tailwind CSS
- Error handling for network issues
- Native StoreKit bridge for in-app purchases
- Environment-aware premium functionality 