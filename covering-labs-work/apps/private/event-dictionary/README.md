# event-dictionary

Covering Labs private Next.js app for the internal event dictionary.

## Purpose

This app gives the product and growth team one operational screen for event definitions, recent usage, and events that exist in BigQuery but are not yet documented in the sheet. It replaces the legacy generated HTML/login flow with a private Labs app that is deployed and accessed through the standard covering-labs path.

## Execution Environment

- URL after merge/deploy: `https://labs.covering.app/event-dictionary`
- App type: `nextjs`
- Location: `apps/private/event-dictionary`
- Access boundary: private Labs VM/VPN. The legacy in-app login is intentionally not included.

## Key Files

- `app/page.tsx`: dynamic server-rendered page that loads event dictionary data.
- `components/EventDictionaryView.tsx`: client-side search, filter, list, funnel, and BQ-only views.
- `lib/event-data.ts`: server-side Google Sheets and BigQuery reads, parsing, reconciliation, and cache logic.
- `lib/types.ts`: shared event dictionary data contracts.
- `deploy.yml`: covering-labs app metadata used by the deploy scanner.

## Environment Variables

- `EVENT_DICTIONARY_SHEET_ID`: optional override for the Google Sheet ID. Default is the verified legacy generator sheet `1-v4gyRD9yzzNDqy5NwjDj02uJQZItM-R8EGE88-1diQ`.
- `EVENT_DICTIONARY_SHEET_GID`: optional override for the worksheet gid. Default is `1531837284`.
- `EVENT_DICTIONARY_BQ_PROJECT`: optional override for the BigQuery project. Default is `covering-app-ccd23`.
- `EVENT_DICTIONARY_BQ_TABLE`: optional override for the event table. Default is `covering-app-ccd23.mixpanel.mp_master_event`.
- `GOOGLE_APPLICATION_CREDENTIALS`: optional service account JSON path for Sheets. If omitted, local fallback is `~/.config/gcloud/sheets-service-account.json`; on the VM, application default credentials may be used.
- `GOOGLE_APPLICATION_CREDENTIALS_BQ`: optional service account JSON path for BigQuery. If omitted, application default credentials are used.

## How To Run

```bash
npm install
npm run typecheck
npm run build
npm run dev
```

For production-like local verification:

```bash
npm run start -- -p 3210
```

## Dependent Services

- Google Sheets: current event dictionary worksheet.
- BigQuery: `covering-app-ccd23.mixpanel.mp_master_event`.

## Important Notes

- Results are cached for 5 minutes in process memory to reduce repeated Sheets and BigQuery calls.
- BigQuery reads only `event_name` and `COUNT(*)` for the last 7 days, excludes system events, and limits output to 1000 grouped event names.
- Service account credentials are used only on the server and must never be exposed to the browser.
- The app is private by deployment location; do not add a separate browser login flow unless the access model changes.
