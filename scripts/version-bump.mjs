#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Sjekk om ny versjon er gitt som argument
const newVersion = process.argv[2];
if (!newVersion) {
  console.error('❌ Vennligst spesifiser ny versjon: npm run version-bump <ny-versjon>');
  console.error('Eksempel: npm run version-bump 3.2.0');
  process.exit(1);
}

// Valider versjonsformat (semantic versioning)
const versionRegex = /^\d+\.\d+\.\d+$/;
if (!versionRegex.test(newVersion)) {
  console.error('❌ Ugyldig versjonsformat. Bruk format: X.Y.Z (f.eks. 3.2.0)');
  process.exit(1);
}

console.log(`🚀 Oppdaterer versjon til ${newVersion}...`);

// Oppdater package.json
const packageJsonPath = path.join(__dirname, '..', 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const oldVersion = packageJson.version;
packageJson.version = newVersion;
fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
console.log(`✅ package.json oppdatert: ${oldVersion} → ${newVersion}`);

// Oppdater iOS prosjektfil
const iosProjectPath = path.join(__dirname, '..', 'ios', 'App', 'App.xcodeproj', 'project.pbxproj');
let projectContent = fs.readFileSync(iosProjectPath, 'utf8');

// Oppdater MARKETING_VERSION
const versionRegex2 = /MARKETING_VERSION = [^;]+;/g;
const newVersionLine = `MARKETING_VERSION = ${newVersion};`;
projectContent = projectContent.replace(versionRegex2, newVersionLine);

// Øk build-nummeret
const buildNumberRegex = /CURRENT_PROJECT_VERSION = (\d+);/g;
const matches = [...projectContent.matchAll(buildNumberRegex)];
if (matches.length > 0) {
  const currentBuildNumber = parseInt(matches[0][1]);
  const newBuildNumber = currentBuildNumber + 1;
  projectContent = projectContent.replace(buildNumberRegex, `CURRENT_PROJECT_VERSION = ${newBuildNumber};`);
  console.log(`📱 iOS build-nummer økt: ${currentBuildNumber} → ${newBuildNumber}`);
}

fs.writeFileSync(iosProjectPath, projectContent);
console.log(`✅ iOS-versjon oppdatert til ${newVersion}`);

console.log('\n🎉 Versjonsoppdatering fullført!');
console.log(`📦 Ny versjon: ${newVersion}`);
console.log('\n💡 Neste steg:');
console.log('   git add .');
console.log(`   git commit -m "Bump version to ${newVersion}"`);
console.log(`   git tag v${newVersion}`);
console.log('   git push && git push --tags');
