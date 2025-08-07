# FergeTid - Norwegian Ferry Timetable App

A modern, cross-platform mobile app for finding ferry timetables and nearby ferry stops in Norway. Built with React, Capacitor, and powered by Entur's public transportation API.

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
- **Geolocation**: Google Maps Geocoding API for location names
- **Build Tool**: Vite for fast development and optimized builds

## 📱 Screenshots

*Screenshots coming soon*

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
