#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Les iOS prosjektfil
const iosProjectPath = path.join(__dirname, '..', 'ios', 'App', 'App.xcodeproj', 'project.pbxproj');
let projectContent = fs.readFileSync(iosProjectPath, 'utf8');

// Finn og øk build-nummeret
const buildNumberRegex = /CURRENT_PROJECT_VERSION = (\d+);/g;
const matches = [...projectContent.matchAll(buildNumberRegex)];

if (matches.length === 0) {
  console.error('❌ Kunne ikke finne CURRENT_PROJECT_VERSION i iOS-prosjektfilen');
  process.exit(1);
}

const currentBuildNumber = parseInt(matches[0][1]);
const newBuildNumber = currentBuildNumber + 1;

console.log(`📱 Øker build-nummer fra ${currentBuildNumber} til ${newBuildNumber}...`);

// Erstatt alle forekomster av build-nummeret
projectContent = projectContent.replace(buildNumberRegex, `CURRENT_PROJECT_VERSION = ${newBuildNumber};`);

fs.writeFileSync(iosProjectPath, projectContent);
console.log('✅ Build-nummer oppdatert til', newBuildNumber);
