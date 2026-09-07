# Digital Inheritance Management Prototype

A blockchain-based prototype that demonstrates how a Solidity smart
contract can automate the distribution of digital assets to predefined
beneficiaries, according to fixed rules, once an authorized party confirms
that the required real-world condition has been met.

This project does not create or execute a legally binding will. It is an
academic demonstration of programmable inheritance logic: role-based
access control, percentage-based distribution, timelocked execution, and
on-chain auditability.

## Contents

```
inheritance-dapp/
├── contracts/
│   └── DigitalInheritance.sol   Core smart contract
├── migrations/
│   └── 2_deploy_inheritance.js  Truffle deployment script
├── test/
│   └── digitalInheritance.test.js
├── frontend/
│   ├── index.html               Application shell
│   ├── app.js                   UI state and wallet lifecycle
│   ├── contract-service.js      Centralized ethers.js contract service
│   ├── styles.css               Responsive product styling
│   └── index.backup.html        Original frontend backup
├── truffle-config.js
├── package.json
└── README.md
```

## Prerequisites

- Node.js (LTS release)
- npm
- Ganache (desktop application or `ganache-cli`)
- MetaMask browser extension
- Truffle: `npm install -g truffle`

## Setup

1. Install dependencies:

   ```
   npm install
   ```

2. Start a local blockchain with Ganache and note the RPC port (default
   `7545` for the desktop app, `8545` for `ganache-cli`). Update
   `truffle-config.js` if your port differs.

3. Compile the contract:

   ```
   truffle compile
   ```

4. Deploy to your local network:

   ```
   truffle migrate --reset
   ```

   Note the deployed contract address printed in the migration output.

5. Run the test suite:

   ```
   truffle test
   ```

## Using the Frontend

The frontend remains a static application so it can be demonstrated without
migrating the Truffle project or resetting Ganache. It is split into a shell,
styles, an application controller, and a centralized contract service.

1. Run the frontend check/build command:

   ```
   npm run frontend:build
   ```

2. Serve the frontend over HTTP (recommended for ES modules):

   ```
   npm run frontend:serve
   ```

   Then open `http://127.0.0.1:4173`.

3. Import one or more Ganache private keys into MetaMask and connect
   MetaMask to the Ganache network (RPC URL `http://127.0.0.1:7545`,
   chain ID as reported by Ganache).
4. Click **Connect wallet**. The frontend attempts to reconnect to an
   already-authorized account after reload and reacts to account or network
   changes.
5. Confirm the deployed contract address under **Settings**. The current
   local address is prefilled from `frontend/config.js`; the selected address
   is saved in browser local storage and is not embedded into contract logic.
6. Use the owner account to manage beneficiaries, allocations, document
   reference, executor, and protected ETH. Switch to the executor account to
   initiate verification. Once the timelock has elapsed, any account can
   execute distribution.

For a quick static preview, `frontend/index.html` can also be opened directly,
although some browsers restrict ES modules from `file://` URLs.

The interface validates addresses, detects duplicate and conflicting roles,
normalizes mixed-case input, shows allocation progress, translates common
transaction errors, and displays confirmed contract events as an activity
feed. Beneficiary display names are deliberately stored only in this browser;
the deployed contract stores wallet addresses and percentages, not labels.

See [FRONTEND_REFACTOR_NOTES.md](FRONTEND_REFACTOR_NOTES.md) for the changed
files, architecture decisions, known limitations, and validation commands.

## Core Contract Behavior

| Function | Caller | Purpose |
|---|---|---|
| `addBeneficiary` | owner | Registers a beneficiary and their share (basis points, 10000 = 100%) |
| `removeBeneficiary` | owner | Removes a beneficiary before activation |
| `updateBeneficiaryShare` | owner | Adjusts an existing beneficiary's share |
| `setExecutor` | owner | Changes the authorized executor |
| `depositAssets` | owner | Deposits ETH held for eventual distribution |
| `initiateInheritance` | executor | Starts the timelock after off-chain verification |
| `cancelInheritance` | owner | Cancels an in-progress inheritance during the timelock |
| `executeInheritance` | anyone | Distributes funds once the timelock has elapsed |

## Important Limitation

The contract has no ability to independently verify that the owner has
died. This is the blockchain oracle problem: real-world events are not
natively observable on-chain. The prototype addresses this by requiring
an authorized executor to attest, off-chain, that the condition has been
met, and by adding a timelock so the owner can intervene if the
attestation was made in error. A production system would likely replace
the single executor with a multi-party verification scheme (see the
project guide for a suggested 2-of-3 extension).

## License

MIT, for academic use.
