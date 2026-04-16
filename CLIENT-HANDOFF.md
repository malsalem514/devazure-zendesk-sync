# Client Handoff

This service is meant to be delivered as a standalone integration package.

## What to deliver

Preferred:

- The generated `release/devazure-zendesk-sync/` folder from `npm run package:standalone`

Alternative:

- This entire project folder, excluding any repo-specific files outside it

## Delivery contents

The standalone package includes:

- `dist/` compiled application files
- `src/` source files
- `.env.example`
- `README.md`
- `package.json`
- `tsconfig.json`

## Delivery steps

```bash
npm run package:standalone
```

After that, hand off the contents of:

```text
release/devazure-zendesk-sync/
```

## Client run steps

```bash
cp .env.example .env
node dist/index.js
```

If the client wants to rebuild from source:

```bash
npm install
npm run build
npm start
```

## Pre-delivery checklist

- Replace placeholder secrets in `.env`
- Confirm webhook endpoint URL and HTTPS termination plan
- Confirm Zendesk event filters and trigger rules
- Confirm DevAzure work item type and field mappings
- Confirm whether dry-run mode should remain enabled for first deployment
