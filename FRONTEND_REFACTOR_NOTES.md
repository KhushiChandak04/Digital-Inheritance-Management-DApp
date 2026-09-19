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

The generated contract artifact already contained local deployment metadata and was not changed by the frontend implementation. Solidity, Truffle configuration, migrations, and tests were intentionally left intact.

## Redeployment stale-state audit

The audit inspected `config.js`, `app.js`, `contract-service.js`, `index.html`, all frontend `localStorage` access, contract-address initialization, wallet auto-reconnect, `accountsChanged`, `chainChanged`, and Settings' Load Plan flow.

An actual stale-deployment defect existed: the default address still pointed to the previous deployment, and the unversioned persisted key could override it after a redeploy. The default now points to the current Ganache deployment (`0x3A3561F6b60f34677Ff7f5bC7111797D94324166`) and the storage key is versioned, so the old value is ignored. The loaded address is visibly labeled as the selected deployment.

An actual stale-view defect also existed: a failed replacement load, wallet disconnect, or wrong-network transition could leave the previous contract-derived UI visible. The frontend now clears the snapshot, events, beneficiary list, and summary fields before replacing a deployment and when wallet/network state becomes invalid. `accountsChanged` still refreshes the same loaded deployment and recalculates role; it never changes the contract address.

The connected MetaMask account and loaded contract remain separate state domains. No frontend file contains the previous hard-coded contract address after this fix.

## Architecture decisions

The frontend remains static rather than migrating the existing Truffle repository to React/Vite. This keeps the working contract toolchain and current Ganache state untouched while still separating responsibilities into an application controller, contract service, configuration, and styles.

The contract service uses ethers.js 5.7-compatible APIs and exposes every core contract read/write required by the interface. The UI keeps wallet state in memory, persists only the selected contract address and optional beneficiary labels locally, and rehydrates authorized MetaMask accounts on page load. `accountsChanged` and `chainChanged` listeners immediately recalculate role and network state.

All user-entered addresses pass through `ethers.utils.isAddress` and `ethers.utils.getAddress`, so valid lower-, upper-, and mixed-case addresses are accepted and displayed in checksum form. Beneficiary preflight validation blocks duplicates, owner/executor conflicts, invalid percentages, and over-allocation before opening MetaMask.

Confirmed contract events are queried through the deployed contract and rendered as an activity feed. Event timestamps are intentionally presented as block metadata where the contract does not emit a user-facing event timestamp.

## Known limitations

- The contract does not store beneficiary display names, so labels are local to the current browser.
- The contract does not expose a total-allocation view helper; the frontend calculates it from `getBeneficiaries()`.
- The contract does not expose a historical deposit total separate from `totalDeposited`; the Assets view therefore reports current protected custody rather than lifetime deposits.
- The current contract emits no explicit beneficiary-share-updated event. The activity feed can show the resulting state after refresh, but cannot reconstruct that update as a distinct historical event.
- The frontend uses a local Ganache default address in `frontend/config.js` for this academic session. Settings/local storage can replace it after a new deployment.
- Network acceptance is limited to common Ganache chain IDs `1337` and `5777`. A different local chain ID should be added to `EXPECTED_CHAIN_IDS` in `frontend/config.js`.
- No blockchain transaction is initiated automatically by page load or refresh. Distribution remains an explicit user action.

## Remaining contract-level improvements

These were intentionally not changed during this frontend pass:

- Add duplicate-beneficiary protection inside Solidity, since frontend checks cannot protect direct contract callers.
- Emit a `BeneficiaryShareUpdated` event for complete audit history.
- Add an explicit lifetime deposit counter if reporting total deposits is required.
- Replace the single executor with a multi-party verifier scheme for production-grade trust assumptions.
- Consider a reentrancy guard and a formal security review before any deployment beyond an academic local prototype.

## Run and test

```text
npm install
npm run frontend:build
npm run frontend:serve
```

Open `http://127.0.0.1:4173`, connect MetaMask to Ganache at `http://127.0.0.1:7545`, and use **Settings** to load the deployed contract address when necessary. The frontend build command validates required files, JavaScript syntax, the preserved backup, and core action hooks. Contract tests remain available through the existing `npm test` command.
