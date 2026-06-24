# SnapNext Merged Build

Branch: `snapnext-merged-build`

## Source apps reviewed

- `vipinlamba1985/snapnext` — kept as the production foundation because it contains the Next.js app, backend routes, AWS S3/Stripe-ready dependencies, and current SnapNext product structure.
- `vipinlamba1985/snapnext-clone-ui` — used as the UI/design source because it has the strongest mobile-first layout, sidebar/bottom navigation, storage widget, profile card, and modern SnapNext experience.

## Merge rule

Do not replace the working SnapNext backend with the clone app. The clone uses Vite/TanStack and many preview/demo API methods, so it should be migrated into the Next.js app as UI components and routes.

## Build direction

1. Keep `snapnext` as the deployable app.
2. Add a merged preview route inside `snapnext`.
3. Port clone UI patterns into Next-compatible React components.
4. Connect each screen back to existing SnapNext backend APIs.
5. Only after testing, replace old screens gradually.

## Current build added

- `/merged-preview` route added for the first SnapNext + Clone UI combined experience.
- This route is safe and does not remove existing production pages.

## Next merge targets

1. Upload / Backup screen
2. Library / Gallery screen
3. Memories screen
4. AI Create screen
5. Connect / Favorite Sharing screen
6. Profile / Billing screen
