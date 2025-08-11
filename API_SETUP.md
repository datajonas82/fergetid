# API Setup Guide

## 1. Environment Variables

Create a `.env` file in the root directory with the following variables:

```env
# Entur API (no key required)
VITE_ENTUR_CLIENT_NAME=your-app-name

# Google Maps API Keys
# Get your API keys from: https://console.cloud.google.com/
# Enable the following APIs: Routes API, Geocoding API
VITE_GOOGLE_MAPS_API_KEY_WEB=your_google_maps_web_api_key_here
VITE_GOOGLE_MAPS_API_KEY_IOS=your_google_maps_ios_api_key_here
```

## 2. Google Maps API Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the following APIs:
   - Routes API
   - Geocoding API
4. Create API keys for both web and iOS platforms
5. **Important**: Configure HTTP referrers to allow localhost development

### 2.1 Configure HTTP Referrers (Fix CORS Issues)

To resolve CORS policy blocking requests from localhost, you need to configure HTTP referrers in your Google Cloud Console:

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Navigate to **APIs & Services** > **Credentials**
3. Find your API key and click on it
4. Under **Application restrictions**, select **HTTP referrers (web sites)**
5. Add the following referrers:
   ```
   http://localhost:5173/*
   http://localhost:3000/*
   http://localhost:8080/*
   https://your-production-domain.com/*
   ```
6. Under **API restrictions**, select **Restrict key** and choose:
   - Routes API
   - Geocoding API
7. Click **Save**

**Note**: The wildcard `*` at the end of localhost URLs allows any path on that port.

### 3. CORS and API Issues

**Current Issues Being Addressed:**
- CORS policy blocking API calls from browser
- 502 Bad Gateway errors from Google Maps API
- 429 Too Many Requests from OpenRouteService
- Missing API keys causing fallback to simple distance calculation

**Solutions Implemented:**
- Graceful fallback to simple distance calculation when APIs fail
- Better error handling and logging
- Automatic fallback chain: Google Maps → OpenRouteService → Simple calculation
- **HTTP referrer configuration** to resolve CORS issues

**Common Error Messages:**
- `CORS policy: No 'Access-Control-Allow-Origin' header` → Configure HTTP referrers in Google Cloud Console
- `502 (Bad Gateway)` → Temporary Google Maps server issue, handled by fallback
- `429 (Too Many Requests)` → Rate limiting, handled by fallback
- `404 (Not Found)` → No route found or invalid coordinates, handled by fallback

## 4. Testing

After setting up the API keys and HTTP referrers:

1. Restart your development server: `npm run dev`
2. Open the app in your browser
3. Try searching for a ferry route or using GPS mode
4. Check the browser console for API call logs:
   - `✅ Google Maps API key found` - API key is configured
   - `🌐 Making Google Maps Routes API request` - API call attempt
   - `✅ Google Maps API call successful` - API call succeeded
   - `❌ Google Maps API failed` - API call failed, fallback activated
   - `📏 Using simple distance calculation` - Final fallback used 