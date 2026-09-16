import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// Versjon fra package.json, og iOS-byggnummeret rett fra Xcode-prosjektet, så
// menyen kan vise nøyaktig hvilket bygg som kjører (nyttig ved TestFlight-testing).
const readAppVersion = () => {
  try {
    return JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8')).version || ''
  } catch {
    return ''
  }
}

const readIosBuildNumber = () => {
  try {
    const pbx = fs.readFileSync(
      path.join(projectRoot, 'ios/App/App.xcodeproj/project.pbxproj'),
      'utf8'
    )
    const match = pbx.match(/CURRENT_PROJECT_VERSION = (\d+);/)
    return match ? match[1] : ''
  } catch {
    return ''
  }
}

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(readAppVersion()),
    __APP_BUILD__: JSON.stringify(readIosBuildNumber()),
  },
  server: {
    // Let Vite choose an available port automatically
    strictPort: false,
    cors: true,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  },
})
