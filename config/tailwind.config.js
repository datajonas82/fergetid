const path = require('path');

module.exports = {
  content: [
    path.join(__dirname, '../index.html'),
    path.join(__dirname, '../src/**/*.{js,ts,jsx,tsx}')
  ],
  theme: {
    extend: {
      fontFamily: {
        'sans': ['Manrope', 'ui-sans-serif', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'Noto Sans', 'sans-serif'],
      },
      backgroundImage: {
        'gradient-to-r': 'linear-gradient(to right, var(--tw-gradient-stops))',
      },
      gradientColorStops: {
        'blue-500': '#3b82f6',
        'blue-600': '#2563eb',
      },
    },
  },
  plugins: [],
}