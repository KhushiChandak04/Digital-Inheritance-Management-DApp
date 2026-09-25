# Frontend Refactor Notes

## Files changed

- `frontend/index.html`: responsive application shell with dashboard, plan, beneficiaries, assets, verification, activity, security, and settings views.
- `frontend/styles.css`: premium dark institutional visual system, responsive layouts, states, dialogs, tables, and mobile navigation.
- `frontend/app.js`: application state, navigation, wallet lifecycle, role-aware permissions, validation, forms, confirmation dialogs, activity rendering, and transaction feedback.
- `frontend/contract-service.js`: centralized ethers.js v5 contract ABI, reads, writes, event queries, address normalization, deployment persistence, and error translation.
- `frontend/config.js`: local deployment defaults and accepted Ganache chain IDs. The selected contract address is also stored in browser local storage.
- `frontend/index.backup.html`: preserved original static frontend before the refactor.
- `scripts/check-frontend.cjs`: no-dependency frontend build/check script.
- `package.json`: added `frontend:check`, `frontend:build`, and `frontend:serve` scripts.
- `README.md`: updated frontend architecture and local run instructions.
- `frontend/config.js`, `frontend/app.js`, `frontend/contract-service.js`, and `frontend/index.html`: fixed deployment persistence and stale loaded-plan state after redeployment, wallet disconnect, and chain changes.
- Configurable timelock duration: the owner can select 7, 30, 90, 180, or 1–365 custom days while the plan is ACTIVE. The frontend converts days to seconds for `setTimelockDuration`, while the contract remains the source of truth for the displayed duration, unlock date, and blockchain-clock countdown. The control is locked after verification begins, and `TimelockDurationUpdated` appears in activity history.

The generated contract artifact already contained local deployment metadata and was not changed by the frontend implementation. Solidity, Truffle configuration, migrations, and tests were intentionally left intact.

## Redeployment stale-state audit

The audit inspected `config.js`, `app.js`, `contract-service.js`, `index.html`, all frontend `localStorage` access, contract-address initialization, wallet auto-reconnect, `accountsChanged`, `chainChanged`, and Settings' Load Plan flow.

An actual stale-deployment defect existed: the default address still pointed to the previous deployment, and the unversioned persisted key could override it after a redeploy. The default now points to the current Ganache deployment (`0x3A3561F6b60f34677Ff7f5bC7111797D94324166`) and the storage key is versioned, so the old value is ignored. The loaded address is visibly labeled as the selected deployment.

An actual stale-view defect also existed: a failed replacement load, wallet disconnect, or wrong-network transition could leave the previous contract-derived UI visible. The frontend now clears the snapshot, events, beneficiary list, and summary fields before replacing a deployment and when wallet/network state becomes invalid. `accountsChanged` still refreshes the same loaded deployment and recalculates role; it never changes the contract address.

The connected MetaMask account and loaded contract remain separate state domains. No frontend file contains the previous hard-coded contract address after this fix.

## Controlled UI/UX polish pass

- Beneficiary registration now clears address, local label, and percentage fields only after confirmation, then returns focus to the address field.
- Account changes update the displayed account and role immediately, show feedback, and refresh the same loaded deployment instead of restoring or replacing its address.
- Lifecycle presentation now derives READY / ACTIVE, TIMED LOCK ACTIVE, DISTRIBUTION AVAILABLE, EXECUTED, and CANCELLED from contract status plus the latest blockchain block timestamp. Initiation and execution controls cannot remain actionable in contradictory states.
- Countdown text uses the latest blockchain timestamp and `unlockTimestamp`; it is not persisted locally.
- Transaction feedback distinguishes preparation, wallet approval, submitted/pending, confirmation, rejection, and failure.
- Verification copy uses plain-language `OFF-CHAIN VERIFICATION`; the oracle model remains visible in blockchain details.
- Loaded balances show synchronized status, and activity labels use human-readable deposit, verification, cancellation, and distribution wording.
- Light/dark theme, desktop navigation, mobile navigation, all eight views, and horizontal overflow were smoke-tested.

Remaining UI limitations: the live deployment used for validation is already executed, so READY, pending-lock, and unlocked action states were verified by code-path inspection rather than by sending or reverting transactions. No blockchain transactions were sent during this polish pass. Modal focus trapping and event-block timestamp resolution remain future accessibility/audit enhancements.

## Comprehensive reconciliation checklist

| Area | Result | Evidence / remaining scope |
|---|---|---|
| Wallet and loaded contract separation | DONE | Account switching updates wallet/role while retaining the loaded deployment; current browser smoke test confirmed both addresses remain distinct. |
| Versioned deployment persistence | DONE | Current `0x3A3561...4166` deployment restored; legacy key removed; old address search returned no active-frontend match. |
| Beneficiary validation and workflow | DONE | Checksum normalization, duplicate/owner/executor checks, field errors, ordinary percentages, confirmation, allocation refresh, and confirmed-submit form reset are implemented. |
| Role-aware controls | DONE | Owner controls, executor initiation, public execution, beneficiary recognition, and unavailable-state hiding are derived from role and lifecycle. |
| Lifecycle reconciliation | DONE | One lifecycle model drives badges, headings, helper copy, timeline, eligibility, countdown, and actions. Live executed state showed no initiate/execute actions. |
| Blockchain time | DONE | Latest provider block timestamp is read before snapshot and during active countdown refresh; no countdown is stored locally. |
| Verification/oracle copy | DONE | User-facing copy is off-chain verification; technical details expose the oracle model. |
| Assets and activity | DONE | Valid loaded balance shows synchronized state; event descriptions are human-readable and include block-derived dates plus copyable hashes. |
| Transaction feedback | DONE | Preparing, wallet approval, submitted/pending, confirmed, rejected, and failed paths are distinct. |
| Consequential confirmation | DONE | Removal, allocation edit, executor change, cancellation, and execution use confirmation dialogs with consequences. |
| Dialog accessibility | DONE | Initial focus moves to confirm, Escape closes, Tab is trapped among dialog controls, and focus returns to the trigger. |
| Light/dark themes | DONE | Both themes were toggled and persisted; all eight views were visited. |
| Responsive behavior | DONE | 390px mobile smoke test passed with no horizontal overflow and working navigation drawer; desktop views also had no overflow. |
| READY / pending / unlocked / cancelled live transactions | PARTIAL | Lifecycle code paths are covered, but the current live contract is EXECUTED. No transactions or state-reset deployments were performed only for UI testing. |
| Full automated accessibility audit | PARTIAL | Semantic labels, focus-visible styles, form labels, status regions, disabled styling, and modal keyboard behavior were checked. A dedicated axe audit is not installed. |

## Final invariants

- Solidity unchanged.
- Truffle and Ganache configuration unchanged.
- Migrations unchanged.
- Frontend architecture unchanged.
- No old contract address or legacy deployment key restored.
- No blockchain transaction was sent during this final polish audit.
- Existing verified allocation, deposit, timelock, and distribution behavior was not modified.

## Architecture decisions

The frontend remains static rather than migrating the existing Truffle repository to React/Vite. This keeps the working contract toolchain and current Ganache state untouched while still separating responsibilities into an application controller, contract service, configuration, and styles.

The contract service uses ethers.js 5.7-compatible APIs and exposes every core contract read/write required by the interface. The UI keeps wallet state in memory, persists only the selected contract address and optional beneficiary labels locally, and rehydrates authorized MetaMask accounts on page load. `accountsChanged` and `chainChanged` listeners immediately recalculate role and network state.

All user-entered addresses pass through `ethers.utils.isAddress` and `ethers.utils.getAddress`, so valid lower-, upper-, and mixed-case addresses are accepted and displayed in checksum form. Beneficiary preflight validation blocks duplicates, owner/executor conflicts, invalid percentages, and over-allocation before opening MetaMask.

Confirmed contract events are queried through the deployed contract and rendered as an activity feed. Event timestamps are intentionally presented as block metadata where the contract does not emit a user-facing event timestamp.

## Known limitations

- The contract does not store beneficiary display names, so labels are local to the current browser.
- The contract does not expose a total-allocation view helper; the frontend calculates it from `getBeneficiaries()`.
- The contract does not expose a historical deposit total separate from `totalDeposited`; the Assets view therefore reports current protected custody rather than lifetime deposits.
- The frontend ABI/service was intentionally not changed during the contract-only hardening pass, so the new `BeneficiaryShareUpdated` event is available in the compiled contract but is not yet rendered by the existing frontend activity feed.
- The frontend uses a local Ganache default address in `frontend/config.js` for this academic session. Settings/local storage can replace it after a new deployment.
- Network acceptance is limited to common Ganache chain IDs `1337` and `5777`. A different local chain ID should be added to `EXPECTED_CHAIN_IDS` in `frontend/config.js`.
- No blockchain transaction is initiated automatically by page load or refresh. Distribution remains an explicit user action.

## Remaining contract-level improvements

These were intentionally not changed during this frontend pass:

- The contract now rejects duplicate beneficiaries and owner/executor role conflicts on-chain.
- The contract now emits `BeneficiaryShareUpdated`; frontend event rendering remains a separate future UI task.
- Add an explicit lifetime deposit counter if reporting total deposits is required.
- Replace the single executor with a multi-party verifier scheme for production-grade trust assumptions.
- `executeInheritance` remains checks-effects-interactions safe for the current flow, but its sequential ETH calls are all-or-nothing: if any beneficiary rejects ETH, the whole execution reverts and all beneficiaries remain unpaid. A production design should consider a withdrawal/claim model or another failure-isolation strategy.
- Consider a formal security review before any deployment beyond an academic local prototype.

## Contract hardening pass

- `addBeneficiary` now rejects duplicate wallets, the owner, and the current executor before allocation is changed.
- `setExecutor` now rejects the zero address, owner, and any existing beneficiary.
- `updateBeneficiaryShare` emits `BeneficiaryShareUpdated` with old and new basis-point values.
- Allocation, status, timelock, cancellation, execution-once, and post-initiation configuration rules remain unchanged.
- Added targeted tests for every new revert/event/invariant. The complete suite reports 15 passing tests.

## Configurable timelock pass

- Added owner-only `setTimelockDuration(uint256)` restricted to the ACTIVE plan state.
- Added `TimelockDurationUpdated(oldDuration, newDuration)` and frontend activity rendering with block-derived dates.
- Added coverage for authorization, zero-duration rejection, event emission, selected 7-day and 90-day unlock timestamps, and post-initiation, post-cancellation, and post-execution locking.
- The complete contract suite now reports 20 passing tests.

## Run and test

```text
npm install
npm run frontend:build
npm run frontend:serve
```

Open `http://127.0.0.1:4173`, connect MetaMask to Ganache at `http://127.0.0.1:7545`, and use **Settings** to load the deployed contract address when necessary. The frontend build command validates required files, JavaScript syntax, the preserved backup, and core action hooks. Contract tests remain available through the existing `npm test` command.
