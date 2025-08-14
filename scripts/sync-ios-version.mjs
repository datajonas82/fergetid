#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Les package.json for å få versjonen
const packageJsonPath = path.join(__dirname, '..', 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const version = packageJson.version;

console.log(`Synkroniserer iOS-versjon til ${version}...`);

// Les iOS prosjektfil
const iosProjectPath = path.join(__dirname, '..', 'ios', 'App', 'App.xcodeproj', 'project.pbxproj');
let projectContent = fs.readFileSync(iosProjectPath, 'utf8');

// Oppdater MARKETING_VERSION i begge build-konfigurasjonene
const versionRegex = /MARKETING_VERSION = [^;]+;/g;
const newVersionLine = `MARKETING_VERSION = ${version};`;

if (projectContent.includes('MARKETING_VERSION')) {
  projectContent = projectContent.replace(versionRegex, newVersionLine);
  fs.writeFileSync(iosProjectPath, projectContent);
  console.log('✅ iOS-versjon oppdatert til', version);
} else {
  console.error('❌ Kunne ikke finne MARKETING_VERSION i iOS-prosjektfilen');
  process.exit(1);
}

// Oppdater build-nummer hvis det er nødvendig
// Dette kan være nyttig for å øke build-nummeret automatisk
const buildNumberRegex = /CURRENT_PROJECT_VERSION = (\d+);/g;
const matches = [...projectContent.matchAll(buildNumberRegex)];

if (matches.length > 0) {
  console.log(`📱 Nåværende build-nummer: ${matches[0][1]}`);
  console.log('💡 For å øke build-nummeret, kjør: npm run bump-build');
}

console.log('🎉 Versjonssynkronisering fullført!');
