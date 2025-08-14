# FergeTid - Norwegian Ferry Timetable App v3.1.0

A modern, cross-platform mobile app for finding ferry timetables and nearby ferry stops in Norway. Built with React, Capacitor, and powered by Entur's public transportation API.

## 🎉 Version 3.1.0 - UI/UX Improvements

### New Features & Improvements
- **Improved color coding** - Better visual feedback for departure times and wait times
- **Strikethrough for missed departures** - Clear visual indication when you can't make a ferry
- **Standardized distance formatting** - Consistent 1 decimal for km (e.g., 14.1 km) and meters under 1km
- **Enhanced spinner messages** - More informative loading states based on location status
- **Better GPS fallback handling** - Improved iOS GPS integration with browser fallback

## 🎉 Version 3.0.1 - iOS Fixes

### Bug Fixes
- **Fixed distance display on iOS** - Resolved issue where distances showed as "0m" instead of correct values
- **Improved Haversine fallback** - Now accepts Haversine distance calculations when routing APIs fail
- **Enhanced HERE API handling** - Better fallback when HERE API returns 0m distances
- **Fixed SplashScreen timing** - Improved splash screen hiding to prevent timeout warnings

## 🎉 Version 3.0.0 - Major Update

### New Features & Improvements:
- **🚗 HERE Routing API Integration** - Better ferry exclusion and more accurate routes
- **🗺️ Enhanced Geocoding** - HERE Geocoding API for better Norwegian location names
- **🔒 Improved Security** - Fixed API key exposure and better state management
- **⚡ GPS State Management** - Fixed race conditions and state consistency issues
- **🎯 Auto-enable Driving Times** - Shows driving times automatically when GPS is available
- **🛡️ Ferry Exclusion** - Strict ferry avoidance in routing calculations

## 🚢 Features

- **GPS Location**: Find nearby ferry stops using your current location
- **Search Functionality**: Search for ferry stops by name across Norway
- **Real-time Departures**: View upcoming ferry departures with time calculations
- **Cross-platform**: Works on iOS, Android, and web browsers
- **Offline-friendly**: Caches ferry stop data for better performance
- **Modern UI**: Beautiful glassmorphism design with smooth animations

## 🛠️ Technology Stack

- **Frontend**: React 18 with Vite
- **Mobile**: Capacitor.js for native iOS/Android builds
- **Styling**: Tailwind CSS with custom glassmorphism design
- **API**: Entur GraphQL API for Norwegian public transportation data
- **Routing**: HERE Routing API v8 (primary) with Google Maps Routes API v2 (fallback)
- **Geolocation**: Google Maps Geocoding API for location names
- **Build Tool**: Vite for fast development and optimized builds

## 📱 Screenshots

*Screenshots coming soon*

## 📊 Analytics og Performance

### Vercel Analytics
Appen bruker Vercel Analytics for å spore brukerinteraksjoner og forbedre brukeropplevelsen:

#### Sporede hendelser:
- **`app_initialized`** - Når appen starter opp
- **`gps_search_clicked`** - Når brukeren klikker på GPS-knappen
- **`gps_search_success`** - Når GPS-søk finner fergekaier
- **`gps_error`** - Når GPS-funksjonen feiler
- **`gps_coordinates_snapped`** - Når GPS-koordinater justeres til nærmeste vei
- **`search_success`** - Når manuelt søk finner resultater
- **`search_no_results`** - Når søk ikke finner resultater
- **`driving_times_toggled`** - Når kjøretidsberegning aktiveres/deaktiveres

#### Konfigurasjon:
- Analytics er aktivert i `vercel.json`
- Custom events sendes med relevant metadata
- Ingen personlig informasjon spores

### Vercel Speed Insights
Automatisk performance-overvåking for å identifisere treghetsproblemer.

## 📍 GPS-funksjonalitet

### Routing API
Appen bruker HERE Routing API v8 som primær routing-tjeneste med Google Maps som fallback:

- **HERE Routing API v8** - Bedre ferry-ekskludering og nøyaktigere ruter
- **Google Maps Routes API v2** - Fallback hvis HERE ikke er tilgjengelig
- **Haversine-beregning** - Enkel avstandsberegning som siste fallback
- **Automatisk failover** mellom API-tjenester for pålitelighet

### Snap to Road
Appen bruker Google Maps Roads API for å justere GPS-koordinater til nærmeste vei:

- **Automatisk justering** av GPS-punkter som er på sjø eller i mark
- **Maksimal avstand** på 500m for justering
- **Visuell indikator** "(nærmeste vei)" når koordinater justeres
- **Tracking** av når koordinater justeres for analyse

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn
- iOS Simulator (for iOS development)
- Android Studio (for Android development)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/fergetid-app.git
   cd fergetid-app
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   Create a `.env` file in the root directory:
   ```env
   VITE_HERE_API_KEY=your_here_api_key_here
   VITE_GOOGLE_MAPS_API_KEY_IOS=your_ios_api_key_here
   VITE_GOOGLE_MAPS_API_KEY_WEB=your_web_api_key_here
   VITE_ENTUR_CLIENT_NAME=your_entur_client_name
   ```

4. **Build the project**
   ```bash
   npm run build
   ```

### Development

```bash
# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

### Mobile Development

```bash
# Sync with iOS
npx cap sync ios

# Open in Xcode
npx cap open ios

# Sync with Android
npx cap sync android

# Open in Android Studio
npx cap open android
```

## 📋 API Requirements

### Entur API
- **Endpoint**: https://api.entur.io/journey-planner/v3/graphql
- **Client Name**: Required for API access
- **Rate Limits**: Please respect Entur's usage guidelines

### Google Maps API
- **Geocoding API**: For reverse geocoding location names
- **Separate keys**: iOS and web platforms require different API keys

## 🔧 Troubleshooting

### Geolocation Issues

If you're experiencing geolocation timeout errors:

1. **Development Environment**: The app uses extended timeouts (45 seconds) in development mode
2. **Retry Logic**: The app automatically retries failed geolocation requests
3. **Fallback Location**: If geolocation fails completely, the app will use Oslo as a fallback location
4. **Browser Permissions**: Ensure your browser has location permissions enabled
5. **Simulator Issues**: iOS/Android simulators may have limited geolocation support

### Common Error Messages

- **"Timeout ved henting av posisjon"**: Geolocation is taking too long, the app will retry automatically
- **"Tilgang til posisjon ble avvist"**: Location permissions are denied, check browser settings
- **"Posisjon kunne ikke bestemmes"**: Network or GPS issues, the app will retry

### Debug Mode

In development mode, the app logs detailed geolocation information to the console:
- Geolocation options being used
- Attempt counts and retry logic
- Success/failure details
- Location accuracy information
- **Billing**: Google Maps API has usage-based billing

## 🏗️ Project Structure

```
fergetid-app/
├── src/
│   ├── components/          # React components
│   ├── utils/              # Utility functions
│   ├── hooks/              # Custom React hooks
│   ├── App.jsx             # Main application component
│   ├── config.js           # Configuration and API keys
│   └── constants.js        # App constants
├── ios/                    # iOS native project
├── android/                # Android native project
├── public/                 # Static assets
└── dist/                   # Build output
```

## 🎨 Design System

The app uses a custom glassmorphism design with:
- **Primary Colors**: Purple gradient background
- **Accent Colors**: Blue for distance indicators and departure times
- **Typography**: Clean, readable fonts with dynamic sizing
- **Animations**: Smooth transitions and hover effects

## 📄 Documentation

- [App Support](app-support.html) - User guide and technical information
- [Privacy Policy](privacy-policy.html) - Data handling and privacy information

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **Entur** for providing the Norwegian public transportation API
- **Google Maps** for geocoding services
- **Capacitor** team for the excellent cross-platform framework
- **React** and **Vite** communities for the amazing development tools

## 📞 Support

For support and questions:
- **Email**: support@locationsentralen.no
- **Website**: [locationsentralen.no/fergetid-app/support](https://www.locationsentralen.no/fergetid-app/support)

---

Made with ❤️ for Norwegian ferry travelers
