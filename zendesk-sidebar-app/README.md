# Zendesk Sidebar App

Private Zendesk ticket sidebar app for the DevAzure Zendesk sync project.

This package is based on Zendesk's official React scaffold pattern and is intentionally scoped to the current pilot form:

- `Musa ADO Form Testing`
- Zendesk form ID `50882600373907`

## Current scaffold status

The package currently provides:

- official-scaffold-style React + Vite structure
- Zendesk Garden UI foundation
- ticket sidebar rendering
- pilot-form gating
- read-only linked-item summary from current Zendesk custom fields

The package does not yet provide:

- create ADO action
- link existing ADO action
- backend app API integration

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
