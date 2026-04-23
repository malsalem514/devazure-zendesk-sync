# Zendesk Sidebar App

Private Zendesk ticket sidebar app for the DevAzure Zendesk sync project.

This package is based on Zendesk's official React scaffold pattern and is intentionally scoped to the current pilot form:

- `Musa ADO Form Testing`
- Zendesk form ID `50882600373907`

## Current Status

The package currently provides:

- official-scaffold-style React + Vite structure
- Zendesk Garden UI foundation
- ticket sidebar rendering
- pilot-form gating
- backend-backed linked-item summary with direct-field fallback
- create ADO action via the integration backend
- link existing ADO action via the integration backend

Live backend validation and private-app package upload passed on 2026-04-23. Remaining pilot work is one visual smoke in Zendesk on the `Musa ADO Form Testing` form.

## Development

Install dependencies:

```bash
npm install
```

Run the Vite app:

```bash
npm run dev
```

In a second terminal, serve the Zendesk app through ZCLI:

```bash
npm run start
```

Then open a Zendesk ticket URL with `?zcli_apps=true` appended.

## Build

```bash
npm run build
```

The build output lands in `dist/` and follows the manifest shape expected by Zendesk private app packaging.
