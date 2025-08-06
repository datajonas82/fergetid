# App Store Submission Checklist

## 📱 App Store Connect Setup

### ✅ App Information
- [ ] App Name: "Fergetid" (eller ønsket navn)
- [ ] Subtitle: "Fergeavganger og kjøretider"
- [ ] Description: Skriv beskrivelse av appen
- [ ] Keywords: "ferge, avganger, kjøretid, transport, norway"
- [ ] Category: Travel eller Utilities
- [ ] Content Rating: 4+ (ingen voldelig innhold)

### ✅ App Icon & Screenshots
- [ ] App Icon: 1024x1024 PNG
- [ ] iPhone Screenshots: 6.7" (1290x2796), 6.5" (1242x2688), 5.5" (1242x2208)
- [ ] iPad Screenshots (hvis støttet): 12.9" (2048x2732), 11" (1668x2388)

### ✅ In-App Purchase Setup
- [ ] Product ID: `com.fergetid.premium`
- [ ] Type: Non-Consumable
- [ ] Price: 29 kr (eller ønsket pris)
- [ ] Display Name: "Premium"
- [ ] Description: "Få tilgang til kjøretidsberegning og ventetid på fergekaien"

## 🔧 Technical Setup

### ✅ RevenueCat Configuration
- [ ] RevenueCat Account opprettet
- [ ] App lagt til i RevenueCat
- [ ] API Key konfigurert i `premiumService.js`
- [ ] Product ID matcher App Store Connect

### ✅ iOS Configuration
- [ ] Bundle Identifier: `com.fergetid.app` (eller ønsket)
- [ ] Version: 1.0.0
- [ ] Build: 1
- [ ] Deployment Target: iOS 13.0+
- [ ] Device Orientation: Portrait
- [ ] Required Device Capabilities: GPS

### ✅ Privacy & Permissions
- [ ] Location Usage Description: "Appen bruker din posisjon for å beregne kjøretid til fergekaier"
- [ ] Privacy Policy URL (kreves for in-app purchases)
- [ ] Terms of Service URL (anbefalt)

## 🧪 Testing

### ✅ Functionality Testing
- [ ] GPS-funksjon fungerer
- [ ] Fergeavganger lastes korrekt
- [ ] Kjøretidsberegning fungerer (premium)
- [ ] Premium modal vises for ikke-premium brukere
- [ ] In-app purchase fungerer
- [ ] Gjenopprett kjøp fungerer

### ✅ UI/UX Testing
- [ ] Alle skjermstørrelser støttes
- [ ] Dark mode fungerer (hvis implementert)
- [ ] Loading states vises korrekt
- [ ] Error handling fungerer
- [ ] Accessibility støttes

## 📋 App Store Review Guidelines

### ✅ Content Guidelines
- [ ] Ingen kopiert innhold
- [ ] App-navn er unikt
- [ ] Beskrivelse er nøyaktig
- [ ] Screenshots matcher app-funksjonalitet

### ✅ Technical Guidelines
- [ ] App crasher ikke
- [ ] Alle links fungerer
- [ ] In-app purchases fungerer
- [ ] App respekterer iOS design guidelines

### ✅ Legal Requirements
- [ ] Privacy Policy inkludert
- [ ] Terms of Service inkludert (anbefalt)
- [ ] GDPR compliance (hvis relevant)
- [ ] Cookie policy (hvis relevant)

## 🚀 Submission Steps

### ✅ Pre-Submission
1. [ ] Test appen grundig på fysisk enhet
2. [ ] Verifiser alle in-app purchases
3. [ ] Sjekk at appen ikke crasher
4. [ ] Test på både iPhone og iPad (hvis støttet)

### ✅ App Store Connect
1. [ ] Opprett ny app i App Store Connect
2. [ ] Fyll ut all app-informasjon
3. [ ] Last opp app icon og screenshots
4. [ ] Konfigurer in-app purchases
5. [ ] Sett opp app review information

### ✅ Xcode Archive
1. [ ] Velg "Any iOS Device" som target
2. [ ] Product → Archive
3. [ ] Upload to App Store Connect
4. [ ] Velg app og build i App Store Connect

### ✅ Submit for Review
1. [ ] Fyll ut app review information
2. [ ] Svar på alle spørsmål
3. [ ] Submit for Review
4. [ ] Vent på Apple's review (1-7 dager)

## 🔍 Common Rejection Reasons

### ❌ Avoid These Issues
- [ ] App crasher under testing
- [ ] In-app purchases fungerer ikke
- [ ] App beskrivelse matcher ikke funksjonalitet
- [ ] Manglende privacy policy
- [ ] App bruker private APIs
- [ ] App har bugs eller UI-problemer

## 📞 Support Information

### ✅ Contact Information
- [ ] Support URL: (din support-side)
- [ ] Marketing URL: (din app-side)
- [ ] Privacy Policy URL: (din privacy policy)
- [ ] Support Email: (din support email)

## 🎯 Post-Submission

### ✅ After Approval
1. [ ] Test live appen på App Store
2. [ ] Verifiser at in-app purchases fungerer
3. [ ] Overvåk crash reports
4. [ ] Svar på bruker-feedback
5. [ ] Planlegg fremtidige oppdateringer

---

**Husk:** App Store review kan ta 1-7 dager. Ha tålmodighet og svar raskt på eventuelle spørsmål fra Apple. 