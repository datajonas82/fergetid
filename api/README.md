# Vipps-betaling på web (Fase 2)

Serverless-funksjoner (Vercel) som håndterer Vipps ePayment. Kalles fra web-appen;
secrets ligger kun her (miljøvariabler), aldri i frontend-bundelen.

## Miljøvariabler (settes i Vercel → Project → Settings → Environment Variables)

| Variabel | Beskrivelse |
|----------|-------------|
| `VIPPS_CLIENT_ID` | Fra Vipps Portal → Utvikler |
| `VIPPS_CLIENT_SECRET` | Fra Vipps Portal → Utvikler |
| `VIPPS_SUBSCRIPTION_KEY` | Ocp-Apim-Subscription-Key |
| `VIPPS_MSN` | Merchant Serial Number (6 siffer) |
| `VIPPS_UNLOCK_SECRET` | Tilfeldig streng (min. 32 tegn) for å signere opplåsings-token. Generer selv, del med ingen. |
| `VIPPS_ENV` | `test` (standard) eller `prod` |
| `PUBLIC_BASE_URL` | Valgfri, f.eks. `https://fergetid.app`. Ellers utledes fra request-host. |

**Hent TEST-nøklene først** (`VIPPS_ENV=test`). Bytt til prod-nøkler + `VIPPS_ENV=prod` når dere skal live.

## Endepunkter

- `POST /api/vipps/create` → `{ reference, redirectUrl }` — starter betaling (49 kr). Send brukeren til `redirectUrl`.
- `POST /api/vipps/confirm` `{ reference }` → `{ paid: true, token }` eller `{ paid: false, state }` — verifiserer + fanger betaling, returnerer signert opplåsings-token.
- `POST /api/vipps/verify` `{ token }` → `{ valid: true|false }` — sjekker at et lagret token er ekte.

## Flyt

1. Bruker trykker «Betal med Vipps» → `create` → redirect til Vipps.
2. Bruker betaler → Vipps sender tilbake til `…/?vippspay=<reference>`.
3. Frontend ser query-paramet → `confirm` → lagrer `token` i localStorage → låst opp.
4. Ved senere oppstart → `verify` på lagret token.

## Merk (herding, senere)
Web-gaten er klient-side. For ekte håndheving bør HERE-ruting for web gå via et
`/api`-proxy som krever gyldig token (skjuler også HERE-nøkkelen). Ikke nødvendig
for å teste betalingsflyten, men verdt å gjøre før mye trafikk.
