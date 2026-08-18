# components/

Reusable UI components (React).

- Presentational and composable UI building blocks used by `app/` routes.
- Keep domain logic out of components. Components render data and dispatch
  intent; they do not compute rankings or talk to providers/persistence
  directly. See the Technical Architecture: "Keep domain logic separate from UI
  components."
