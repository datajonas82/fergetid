# API Setup Guide

## Environment Variables

For security, API keys are now stored in environment variables instead of being hardcoded in the source code.

### 1. Create .env file

Create a `.env` file in the root directory of the project:

```bash
# Google Maps API Key
VITE_GOOGLE_MAPS_API_KEY=your_google_maps_api_key_here

# Entur API Client Name
VITE_ENTUR_CLIENT_NAME=fergetid-app
```

### 2. Get Google Maps API Key

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable the following APIs:
   - Routes API
   - Geocoding API
4. Create credentials (API Key)
5. Restrict the API key to:
   - Only the APIs you need
   - Your app's domain/IP
6. Copy the API key to your `.env` file

### 3. Security Best Practices

- ✅ Never commit `.env` files to git
- ✅ Use environment-specific API keys
- ✅ Restrict API keys to specific domains/IPs
- ✅ Monitor API usage
- ✅ Rotate keys regularly

### 4. Development vs Production

- **Development:** Use `.env.local` for local development
- **Production:** Set environment variables on your hosting platform

### 5. Troubleshooting

If you see warnings about missing API keys:
1. Check that `.env` file exists
2. Verify the variable name starts with `VITE_`
3. Restart your development server
4. Check browser console for configuration warnings

## File Structure

```
├── .env                    # Environment variables (not in git)
├── .gitignore             # Excludes .env files
├── src/
│   ├── config.js          # API configuration
│   ├── constants.js       # App constants
│   └── utils/
│       └── googleMapsService.js  # Uses config
└── API_SETUP.md           # This file
``` 