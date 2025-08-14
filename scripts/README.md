# Versjonshåndtering Scripts

Dette mappen inneholder scripts for å håndtere versjoner i Fergetid-appen.

## Tilgjengelige Scripts

### 1. `version-bump` - Hovedscript for versjonsoppdatering
Oppdaterer både `package.json` og iOS-versjonen, samt øker build-nummeret.

```bash
npm run version-bump <ny-versjon>
```

**Eksempel:**
```bash
npm run version-bump 3.2.0
```

**Hva scriptet gjør:**
- ✅ Oppdaterer versjon i `package.json`
- ✅ Oppdaterer `MARKETING_VERSION` i iOS-prosjektet
- ✅ Øker `CURRENT_PROJECT_VERSION` (build-nummer) med 1
- ✅ Viser neste steg for git

### 2. `sync-ios-version` - Synkroniser iOS-versjon
Synkroniserer iOS-versjonen med versjonen i `package.json` uten å endre build-nummeret.

```bash
npm run sync-ios-version
```

**Brukes når:**
- Du har oppdatert versjon i `package.json` manuelt
- Du vil synkronisere iOS-versjonen uten å øke build-nummeret

### 3. `bump-build` - Øk build-nummer
Øker kun build-nummeret i iOS-prosjektet.

```bash
npm run bump-build
```

**Brukes når:**
- Du vil øke build-nummeret uten å endre versjonen
- Nyttig for testing eller mindre endringer

## Anbefalt arbeidsflyt

### For nye versjoner:
1. Kjør `npm run version-bump <ny-versjon>`
2. Test endringene
3. Commit og tag:
   ```bash
   git add .
   git commit -m "Bump version to <ny-versjon>"
   git tag v<ny-versjon>
   git push && git push --tags
   ```

### For build-nummer økning:
1. Kjør `npm run bump-build`
2. Test endringene
3. Commit:
   ```bash
   git add .
   git commit -m "Bump build number"
   git push
   ```

## Versjonsformat

Bruk semantic versioning format: `X.Y.Z`
- `X` = Major version (breaking changes)
- `Y` = Minor version (new features)
- `Z` = Patch version (bug fixes)

**Eksempler:**
- `3.1.0` - Minor versjon
- `3.1.1` - Patch versjon
- `4.0.0` - Major versjon

## Feilsøking

### Scriptet feiler med "Kunne ikke finne MARKETING_VERSION"
- Sjekk at iOS-prosjektfilen eksisterer på riktig sted
- Sjekk at filen ikke har blitt endret manuelt

### Versjonen blir ikke oppdatert
- Sjekk at du har skrivetilgang til filene
- Sjekk at versjonsformatet er korrekt (X.Y.Z)
- Kjør `npm run sync-ios-version` for å synkronisere manuelt
