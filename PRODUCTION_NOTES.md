# Production Notes - Fergetid App

## 🚀 App Information

**App Name:** Fergetid  
**Bundle ID:** com.fergetid.app  
**Version:** 1.0.0  
**Build:** 1  

## 📱 Features

### Free Version
- ✅ Søk etter fergekaier
- ✅ Se avganger for valgt fergekai
- ✅ GPS-basert fergekai-søk
- ✅ Avgangstider og destinasjoner
- ✅ Responsivt design

### Premium Version (29 kr)
- ✅ Nøyaktig kjøretidsberegning
- ✅ Ventetid på fergekaien
- ✅ Fargekodet avgangstider (rød/gul/grønn)
- ✅ Avstand til fergekaier
- ✅ Ingen reklame

## 🔧 Technical Details

### APIs Used
- **Entur API:** Fergeavganger og fergekai-informasjon
- **Google Maps API:** Kjøretidsberegning og geocoding
- **OpenRouteService API:** Fallback for kjøretidsberegning
- **RevenueCat:** In-app purchases

### Permissions
- **Location:** For GPS-basert fergekai-søk og kjøretidsberegning

### Dependencies
- React 18
- Vite
- Capacitor
- RevenueCat Purchases
- GraphQL (Entur API)

## 🎨 Design Features

### UI/UX
- Glassmorphism design
- Responsive layout
- Dynamic font sizing
- Color-coded departure times
- Modern card design
- Smooth animations

### Color Scheme
- Primary: Blue (#3b82f6)
- Success: Green (#16a34a)
- Warning: Yellow (#ca8a04)
- Error: Red (#dc2626)
- Background: Gradient purple

## 📋 App Store Requirements

### Screenshots Needed
1. **Main Screen:** GPS-modus med fergekaier
2. **Search Screen:** Søk etter fergekaier
3. **Premium Modal:** Kjøp premium funksjon
4. **Departure Details:** Utvidet fergekort med avganger

### App Icon
- Size: 1024x1024 PNG
- Style: Ferge-relatert design
- Colors: Match app's color scheme

## 🔐 Security & Privacy

### Data Collection
- **Location Data:** Kun for kjøretidsberegning (ikke lagret)
- **User Data:** Ingen personlig data samles inn
- **Analytics:** Kun anonym bruk-statistikk

### Privacy Policy Required
- Location usage explanation
- No personal data collection
- Third-party API usage (Google Maps, Entur)
- In-app purchase information

## 🧪 Testing Checklist

### Functionality
- [ ] GPS location works
- [ ] Ferry stop search works
- [ ] Departure times load correctly
- [ ] Premium features work
- [ ] In-app purchase flows
- [ ] Error handling

### Devices
- [ ] iPhone 14 Pro Max (6.7")
- [ ] iPhone 14 (6.1")
- [ ] iPhone SE (4.7")
- [ ] iPad (hvis støttet)

## 📞 Support Information

### Contact Details
- **Support Email:** [din-email@domain.com]
- **Privacy Policy:** [din-privacy-policy-url]
- **Terms of Service:** [din-terms-url]

### App Store Information
- **Category:** Travel
- **Content Rating:** 4+
- **Languages:** Norwegian (Bokmål)
- **Age Rating:** 4+

## 🚀 Deployment Steps

1. **RevenueCat Setup**
   - Create account
   - Add app
   - Configure API key
   - Set up product

2. **App Store Connect**
   - Create new app
   - Fill app information
   - Upload screenshots
   - Configure in-app purchase

3. **Xcode Archive**
   - Select "Any iOS Device"
   - Archive project
   - Upload to App Store Connect

4. **Submit for Review**
   - Complete app review information
   - Submit for review
   - Wait for Apple's response

## 🎯 Post-Launch

### Monitoring
- Crash reports
- User feedback
- Revenue tracking
- Performance metrics

### Updates
- Bug fixes
- New features
- Performance improvements
- UI/UX enhancements

---

**Status:** Ready for App Store submission  
**Last Updated:** December 2024  
**Next Review:** After App Store approval 