# Goliath Project — Master TODO List

Last updated: 2026-06-28

## Current Branch / Deployment Status

- `dev` is deployed to the DEV VPS environment.
- `beta` is deployed to the BETA VPS environment.
- `production` is deployed to the PRODUCTION VPS environment.
- Manual VPS deploy scripts are working for all three environments.
- Automated CI/CD is planned but not yet implemented.

---

## Priority 1 — Core Stability & Cleanup

- [ ] Make scripts system fully single-file clean.
- [ ] Reduce scripts tooling to one maintained CLI entry point.
- [ ] Remove or prevent future duplicate / legacy tooling scripts.
- [ ] Standardise command registry usage across dev, beta, and production.
- [ ] Consolidate command sync logic into a single source of truth.
- [ ] Fix remaining module path inconsistencies.
- [ ] Clean up event system duplication.
- [ ] Consolidate logging system paths and remove scattered legacy logging folders.
- [ ] Add safe checks so broken merge-conflict markers are caught before push.

---

## Priority 2 — VPS & Deployment Architecture

- [ ] Fix VPS structure into proper environments.
- [ ] Improve separation between dev, beta, and production deployments.
- [ ] Standardise deploy scripts for each environment.
- [ ] Confirm each PM2 process uses the correct BOT_MODE and runtime root.
- [ ] Add safe restart flow per environment.
- [ ] Add post-deploy validation for dashboard build, PM2 status, and bot mode.
- [ ] Improve nginx routing consistency for dashboards.
- [ ] Document VPS folder layout and environment mapping.

---

## Priority 3 — CI/CD & Automation

- [ ] Build full GitHub to VPS CI/CD pipeline.
- [ ] Auto deploy `dev` branch to DEV VPS environment.
- [ ] Auto deploy `beta` branch to BETA VPS environment.
- [ ] Auto deploy `production` branch to PRODUCTION VPS environment.
- [ ] Remove manual SSH deployment requirement.
- [ ] Add deployment logs and audit trail.
- [ ] Add deployment safety checks and fail-safe deploys.
- [ ] Add rollback system with 48-hour restore capability.
- [ ] Add deploy notifications to Discord owner channel.

---

## Priority 4 — Runtime Systems

- [ ] Build runtime dashboard / live bot control panel.
- [ ] Show live bot health, uptime, memory, CPU, and connected guilds.
- [ ] Show active environment status for dev, beta, and production.
- [ ] Add command execution tracking.
- [ ] Add module enable / disable visibility.
- [ ] Add runtime logs viewer.
- [ ] Add deploy status / last deployed commit display.
- [ ] Add restart controls for owner-only use.

---

## Priority 5 — Goliath Feature Systems

- [ ] Runtime Monitor final build-out.
- [ ] Global Security Centre.
- [ ] Owner View Phase 2 expansion.
- [ ] Translation Hub completion.
- [ ] Translation Providers.
- [ ] Translation Threads.
- [ ] Forms Dashboard UI polish.
- [ ] Ticket Dashboard UI polish.
- [ ] Universal Forms to Tickets pipeline.
- [ ] Ticket recovery and ticket automation improvements.
- [ ] Role system expansion and permission presets.

---

## Priority 6 — Codebase Cleanup

- [ ] Reduce overall folder complexity.
- [ ] Merge duplicate module patterns.
- [ ] Remove unused admin / legacy functions.
- [ ] Standardise naming conventions.
- [ ] Ensure all environments use the same base architecture.
- [ ] Improve error handling consistency across bot and dashboard.
- [ ] Add stronger startup validation for missing optional modules.
- [ ] Add branch-specific sanity checks before deploy.

---

## Future Roadmap — Phase 2+

- [ ] Plugin-based module system.
- [ ] External module marketplace.
- [ ] Multi-server scaling support.
- [ ] Advanced analytics and logging system.
- [ ] Full enterprise-grade admin control panel.
- [ ] Automated billing / entitlement expansion.
- [ ] Public production-ready deployment flow.

---

## Recommended Immediate Build Order

1. Make scripts system fully single-file clean.
2. Fix VPS structure into proper environments.
3. Build runtime dashboard / live bot control panel.
4. Add automated CI/CD.
5. Add rollback and deploy audit trail.
