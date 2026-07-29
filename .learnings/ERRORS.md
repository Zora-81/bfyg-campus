# Errors

Command failures and integration errors.

---

## [ERR-20260728-001] standalone Explore agent invocation

**Logged**: 2026-07-28T09:24:00+08:00
**Priority**: low
**Status**: resolved
**Area**: config

### Summary
Explore agent invocation failed because a non-empty `team_name` was supplied without an active team.

### Error
```
No active team found. Create a team first using TeamCreate.
```

### Context
- Attempted a standalone read-only codebase investigation.
- Passing `team_name` as an empty string or `none` is treated as a team-mode request.

### Suggested Fix
Omit `team_name` entirely for a standalone agent; only provide it after creating a team.

### Metadata
- Reproducible: yes
- Related Files: none

### Resolution
- **Resolved**: 2026-07-28T09:24:00+08:00
- **Notes**: Retry without the `team_name` field.

---

## [ERR-20260728-002] Glob on absent learnings directory

**Logged**: 2026-07-28T09:24:00+08:00
**Priority**: low
**Status**: resolved
**Area**: config

### Summary
A file search targeted `.learnings/` before first-use initialization.

### Error
```
Search path does not exist: .learnings
```

### Context
- The self-improvement workflow had not been initialized in this workspace.

### Suggested Fix
Check the parent workspace first, then create `.learnings/` and its standard files before searching within it.

### Metadata
- Reproducible: yes
- Related Files: .learnings/ERRORS.md

### Resolution
- **Resolved**: 2026-07-28T09:24:00+08:00
- **Notes**: Initialized the standard `.learnings/` files.

---
