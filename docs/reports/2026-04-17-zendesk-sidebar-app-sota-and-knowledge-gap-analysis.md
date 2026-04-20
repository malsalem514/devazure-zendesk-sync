# Zendesk Sidebar App SOTA and Knowledge Gap Analysis

**Prepared On:** 2026-04-17  
**Purpose:** Identify battle-tested sidebar app patterns, code we can reuse, and the remaining research needed before building the private Zendesk app for the Zendesk <-> Azure DevOps integration.

## Executive Summary

We should not build the Zendesk sidebar app from scratch.

The strongest leverage path is:

1. Start from Zendesk's current official React scaffold: `zendesk/app_scaffolds` -> `packages/react`
2. Use Zendesk Garden for the UI so the app feels native in Agent Workspace
3. Keep our existing backend integration service as the system of record for Azure DevOps, Oracle, routing, and sync logic
4. Use the sidebar app only as the agent interaction layer: `Create`, `Link existing`, `Open in ADO`, current linked item summary, and later `Re-sync`

There are already battle-tested Zendesk Marketplace apps that validate the UX pattern we want:

- a ticket sidebar app
- create vs link-existing
- visible linked work item card
- optional search / notify / history

However, I did **not** find a maintained open-source Zendesk + Azure DevOps sidebar app we should adopt wholesale. The closest code reference is Microsoft's older `vsts-zendesk-app`, which is still valuable for information architecture and flow design, but not as a modern codebase to extend.

## Best Existing App Patterns

### 1. DevOps Integration Azure DevOps app

**Source:** Zendesk Marketplace listing  
**Why it matters:** This is the clearest current proof that the UX pattern we want is normal and battle-tested in Zendesk.

What it offers today:

- `Create New Work Item`
- `Link Existing Work Item`
- `Search Work Item`
- `Notify linked Work Items`
- `Work Item History`
- configurable field mapping
- comments, status, and attachment sync

Signals of maturity:

- `33 reviews`
- `200+ installs`

What to borrow:

- sidebar-first workflow
- explicit `create` vs `link existing`
- linked work item detail/history view
- search as a secondary action, not the only action

What not to copy into v1:

- full search/history/notify surface on day one
- broad multi-work-item complexity unless the client confirms it is needed

## 2. Git-Zen for Azure DevOps

**Source:** Zendesk Marketplace listing  
**Why it matters:** Validates a more opinionated but still battle-tested support-to-dev sidebar experience.

What it offers today:

- work item create/link from Zendesk
- bidirectional sync claims
- commit visibility and code context
- search and historical troubleshooting context

Signals of maturity:

- `18 reviews`
- `100+ installs`

What to borrow:

- keep the app focused on helping the agent stay inside Zendesk
- show the linked engineering artifact at the top
- provide one obvious path to create or connect engineering work

What to ignore for v1:

- commit/repository context
- broader DevOps surface beyond ADO work item linkage

## 3. IdentifYou Azure DevOps app

**Source:** Zendesk Marketplace listing  
**Why it matters:** Its IA is especially relevant because it is small and close to the private-app shape we want.

Their documented app shape:

- `Home`
- `Create Work Item`
- `Link Work Item`
- `Notify Work Item`
- `Work Item Log`

What to borrow:

- compact home screen
- modal or tab split between `create` and `link`
- log/history as a secondary screen, not clutter on the main screen

What to avoid:

- overloading the first version with every secondary action

## 4. Exalate

**Source:** Exalate product/docs  
**Why it matters:** Exalate is the strongest current reference for sophisticated cross-system syncing, especially around `create new` vs `connect existing`.

What it documents:

- a bidirectional integration platform for Zendesk and Azure DevOps-class systems
- a `Connect` operation for syncing two existing entities
- a Zendesk sync panel with explicit `Exalate` and `Connect` actions

What to borrow:

- explicit separation between:
  - create a new engineering item
  - connect an existing engineering item
- treat "link existing" as a first-class workflow, not an admin workaround

What not to copy:

- Exalate's full integration admin console
- generic cross-tool scripting model

## 5. Tasktop Integration Hub

**Source:** Zendesk Marketplace listing  
**Why it matters:** This is proof that large-scale enterprises buy this class of workflow and expect reliability, auditability, and scale.

What it signals:

- Zendesk <-> engineering system integration is an enterprise-grade problem
- production expectations include scale, observability, and operational maturity

What to borrow:

- reliability mindset
- clear ownership and traceability

What not to copy:

- heavy enterprise platform scope

## Best Existing Code We Can Reuse

### 1. Zendesk official React scaffold

**Primary recommendation:** Use this as the starting point for the private sidebar app.

Relevant sources:

- Zendesk docs: the React scaffold is the supported starting point for experienced web developers
- GitHub: `zendesk/app_scaffolds`
- GitHub: `packages/react`

Why this is the right base:

- current, official scaffold
- React 18
- Vite-based build
- ZCLI-native workflow
- Garden dependencies already wired in
- private app packaging/update flow already documented

Why this matters for us:

- avoids hand-rolling manifest/build/test/dev tooling
- gives us the right Zendesk iframe conventions from day one
- reduces implementation risk more than starting from a blank Vite app

## 2. Zendesk Garden

**Primary recommendation:** Use Garden for all visible sidebar UI.

Why:

- open-source design system used by Zendesk
- accessible components
- native-looking agent experience
- speeds up development with prebuilt UI primitives

Most relevant components for our app:

- buttons
- forms
- dropdowns
- loaders
- notifications
- typography
- tables or list rows
- modals

This is the fastest way to make the app feel "Zendesk-native" without inventing a design system.

## 3. Zendesk App Framework SDK + Support sidebar APIs

**Primary recommendation:** Build directly on ZAF primitives rather than inventing our own iframe/event layer.

The important capabilities we already know are available:

- `ticket_sidebar` app location
- `ticket.form.id` and `ticket.form.id.changed`
- `ticket.save` hook
- `ticket.updated`
- `client.invoke('hide')` / `client.invoke('show')`
- `client.request()` for backend/API calls

This is enough to implement the pilot rule:

- show app only on `Musa ADO Form Testing` during development
- hide it elsewhere

It is also enough to implement ticket-aware UX:

- read ticket id / subject / requester / form / product inputs
- react if the form changes
- optionally gate save-time actions

## 4. `requirements.json`

**Recommendation:** Reuse selectively, not blindly.

This is potentially very powerful because Zendesk can create app-dependent resources on install, including:

- ticket fields
- triggers
- automations
- targets
- webhooks

Good fit candidates:

- webhook(s)
- trigger(s)
- maybe a macro or support view later

Important risk:

- Zendesk documents that uninstalling an app deletes resources listed in `requirements.json`
- for custom fields, that means the field itself is deleted and the field data is no longer present as a field, even though history remains in ticket audits

So the open question is not whether `requirements.json` works. It does. The real question is whether we want lifecycle coupling between the sidebar app and production data-bearing ticket fields.

My current recommendation:

- use `requirements.json` for non-critical installables like webhook/trigger resources if convenient
- do **not** make production-critical ticket fields depend on app uninstall behavior until we decide lifecycle policy explicitly

## 5. Microsoft `vsts-zendesk-app`

**Recommendation:** Use as a pattern reference only.

Why it is still useful:

- exact same problem domain
- sidebar UI with `Create`, `Link`, `Notify`
- linked work item list/details
- direct evidence that this UX has existed for years

Why we should not build on it directly:

- older stack
- older Azure DevOps/VSTS assumptions
- older manifest/settings model
- dated dependencies like Webpack 3 / Node Sass era tooling

Still worth borrowing from:

- information architecture
- copy hierarchy
- view decomposition
- modal boundaries

Its templates show a practical flow we can simplify:

- main screen with action buttons
- dedicated link/create modals
- linked work item summary block

## Recommended Leverage Strategy for This Project

### Recommended v1 architecture

1. Build a **client-side** Zendesk sidebar app using the official React scaffold
2. Use Zendesk Garden for all UI components
3. Keep our existing Node integration service as the backend
4. Add a small app API surface to the backend just for sidebar actions
5. Let the app call backend endpoints via `client.request()`
6. Secure backend calls with a ZAF JWT or another supported signed request pattern

### Why client-side first

Zendesk's `request()` method already gives us:

- cross-domain request support via Zendesk proxying
- secure settings
- OAuth token management
- ZAF JWT support

That means a client-side sidebar app may be enough for our needs without also converting the UI into a server-side app.

**Inference:** Based on the current docs, the simplest likely-good architecture is a client-side React app plus our backend, not a server-rendered sidebar app. We should still validate this with a short proof-of-concept before committing.

### Recommended v1 UX surface

Keep the app intentionally small:

- linked ADO summary card
- `Create New ADO`
- `Link Existing ADO`
- ID/URL paste
- `Open in Azure DevOps`
- short activity/status summary

Defer:

- full search UI
- comment history
- notify workflow
- multi-link management
- admin configuration UI inside the app

## What We Should Not Reinvent

Do not custom-build these unless forced:

- app manifest structure
- Zendesk iframe wiring
- sidebar sizing/show-hide behavior
- visual design tokens and base components
- private app packaging/update workflow
- resource provisioning model

Use official Zendesk pieces for all of the above.

## Knowledge Gap Analysis

## Gap 1. Best app-to-backend auth model

We still need to choose one implementation path:

- client-side app -> backend via `client.request()` + shared-secret ZAF JWT
- server-side app with `signedUrls`
- hybrid

Why this matters:

- affects how we secure the app backend endpoints
- affects local development and deployment simplicity
- affects what secrets stay in Zendesk app settings vs our server env

Current best guess:

- client-side app + backend API is likely sufficient

What research remains:

- confirm the cleanest production pattern for verifying app-originated calls into our backend
- decide whether app settings should hold a shared secret or whether we should rely on other authentication context

## Gap 2. Whether `requirements.json` should manage production ticket fields

We know it can create ticket fields, triggers, and webhooks.

We do **not** yet have a project decision on whether the app should own production fields through install/uninstall lifecycle.

What research remains:

- decide which resources should be app-owned vs environment-owned
- confirm whether uninstall/delete semantics are acceptable for this client

## Gap 3. Search UX for "Link existing"

We know battle-tested apps often support search.

We do not yet know whether v1 should include:

- ID/URL paste only
- ADO ID lookup only
- full title/query search against ADO

What research remains:

- confirm desired agent flow with the client
- confirm API scope and latency implications for live ADO search

## Gap 4. App action semantics

We still need to choose between:

- immediate action in the app
- save-hook-driven action
- mixed model

This matters because:

- `Create` or `Link` can happen without forcing agents through form gymnastics
- but save-hook flows can keep ticket data and action submission tightly coupled

What research remains:

- prototype the UX and choose whether the primary action should require ticket save

## Gap 5. Final reverse-sync ownership model

The sync field ownership model is documented, but the app changes the UX surface.

We still need to finalize:

- what the app shows live
- which hidden fields stay for reporting/audit
- whether `Dev Funnel #` remains the human-visible canonical link outside the app

## Gap 6. Stable production ingress

The sidebar app itself does not remove the underlying integration networking needs.

We still need stable production ingress for:

- Zendesk -> backend webhook delivery
- ADO -> backend service hook delivery
- app -> backend API calls, depending on final architecture

The current Cloudflare quick tunnel is good for pilot, not final production.

## Gap 7. Testing and release workflow for a private app

We know how to package and update a private app with ZCLI.

We do not yet have a project-specific workflow for:

- local development against the real Zendesk tenant
- preview / pilot install
- controlled rollout from `Musa ADO Form Testing` to broader support forms
- app versioning and rollback

## Gap 8. Accessibility and responsive behavior in the narrow sidebar

Garden reduces this risk a lot, but we still need to test:

- keyboard navigation
- focus management
- error messaging
- small-width layout states
- empty/loading/error states

This is a smaller gap than the auth and lifecycle questions, but it still needs explicit verification.

## Recommended Next Research Tasks

1. Build a 1-day proof of concept using `zendesk/app_scaffolds/packages/react`
   - show only on `Musa ADO Form Testing`
   - read ticket id + form id
   - render a simple linked-item card
   - call one backend endpoint

2. Validate app-to-backend auth
   - prove `client.request()` + signed JWT or equivalent backend verification works cleanly

3. Decide app lifecycle ownership
   - document whether `requirements.json` will manage:
     - webhook(s)
     - trigger(s)
     - ticket fields

4. Confirm `Link existing` UX scope
   - ID/URL only for v1
   - or search against Azure DevOps in v1

5. Decide action semantics
   - immediate app action vs save-hook vs hybrid

6. Write the app API contract
   - `POST /app/ado/create`
   - `POST /app/ado/link`
   - `GET /app/ado/ticket/:ticketId`
   - `POST /app/ado/resync`
   - exact request/response models and auth contract

## Practical Conclusion

The best way to avoid reinventing the wheel is:

- **reuse Zendesk's official app scaffold**
- **reuse Zendesk Garden**
- **reuse ZAF APIs instead of inventing app plumbing**
- **borrow proven UX patterns from current marketplace apps**
- **borrow only IA from Microsoft's older app**
- **keep our custom work focused on the part that is actually custom: backend integration logic and our client's field/routing/sync rules**

That is the highest-leverage path with the lowest change-management cost.

## Sources

- Zendesk React scaffold docs: <https://developer.zendesk.com/documentation/apps/app-developer-guide/about-the-zendesk-react-app-scaffold/>
- Zendesk Support React app tutorial: <https://developer.zendesk.com/documentation/apps/build-an-app/using-react-in-a-support-app/>
- Zendesk Garden docs: <https://developer.zendesk.com/documentation/apps/app-design-guidelines/using-zendesk-garden/>
- Zendesk manifest reference: <https://developer.zendesk.com/documentation/apps/app-developer-guide/manifest/>
- Zendesk app requirements docs: <https://developer.zendesk.com/documentation/apps/app-developer-guide/apps_requirements/>
- Zendesk `request()` / proxy / JWT docs: <https://developer.zendesk.com/documentation/apps/app-developer-guide/making-api-requests-from-a-zendesk-app/>
- Zendesk Apps framework hook docs: <https://developer.zendesk.com/documentation/apps/app-developer-guide/using-the-apps-framework/>
- Zendesk ticket sidebar API: <https://developer.zendesk.com/api-reference/apps/apps-support-api/ticket_sidebar/>
- Zendesk all locations API: <https://developer.zendesk.com/api-reference/apps/apps-support-api/all_locations/>
- Zendesk private app install docs: <https://developer.zendesk.com/documentation/apps/build-an-app/build-your-first-support-app/part-5-installing-the-app-in-zendesk-support/>
- Zendesk official scaffold repo: <https://github.com/zendesk/app_scaffolds>
- Zendesk ZAF SDK repo: <https://github.com/zendesk/zendesk_app_framework_sdk>
- Microsoft VSTS/Zendesk app repo: <https://github.com/microsoft/vsts-zendesk-app>
- Zendesk Marketplace, DevOps Integration: <https://www.zendesk.com/marketplace/apps/support/394508/azure-devops-integration/>
- Zendesk Marketplace, Azure DevOps by IdentifYou: <https://www.zendesk.com/marketplace/apps/support/644237/azure-devops-by-identifyou//>
- Zendesk Marketplace, Azure DevOps by Git-Zen: <https://www.zendesk.com/marketplace/apps/support/195958/azure-devops-by-git-zen/>
- Zendesk Marketplace, Tasktop Integration Hub: <https://www.zendesk.com/in/marketplace/apps/support/27763/tasktop-integration-hub/>
- Exalate Zendesk integration overview: <https://exalate.com/integrations/zendesk/>
- Exalate Connect operation: <https://docs.exalate.com/docs/connect-operation>
- Exalate Zendesk manual synchronization panel: <https://docs.exalate.com/docs/manual-synchronization-zendesk>
