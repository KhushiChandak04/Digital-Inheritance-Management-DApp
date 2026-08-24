# Project Guide: Building the Digital Inheritance Prototype

This document explains how to build, test, and present this project from
start to finish, including the reasoning behind each tooling decision.

## 1. Project Framing

Describe the project as a **blockchain-based digital inheritance
management prototype**, not as a digital will. The distinction matters
academically: a will is a legal instrument; this system is a technical
demonstration of how smart contracts can enforce predefined,
percentage-based asset distribution once an authorized party confirms
that a real-world condition has been met. Keeping this framing
consistent across the report, the code comments, and the viva answers
makes the project read as deliberately scoped rather than overreaching.

## 2. Remix IDE or VS Code

Both tools are useful at different stages. Use them together rather than
choosing one exclusively.

**Remix IDE** (remix.ethereum.org) is best for:

- Writing and compiling the contract for the first time, since it shows
  compiler errors and warnings instantly with no local setup.
- Quick manual testing: deploying to Remix's in-browser JavaScript VM and
  calling functions directly through its UI.
- Early-stage debugging when you are still shaping the contract logic
  and do not yet want to manage a local Truffle/Ganache environment.

**VS Code** (with the Truffle project structure provided here) is best
for:

- The actual submitted project, because it gives you version control
  (Git), a proper test suite, migration scripts, and a reproducible
  build.
- Writing the frontend, since you will be editing HTML/JS/CSS files
  alongside the contract.
- Running automated tests (`truffle test`), which is difficult to do
  meaningfully inside Remix.

**Recommended workflow**: prototype the contract logic in Remix first to
get fast feedback on syntax and basic behavior, then move the finished
contract into this VS Code project structure, write the Truffle tests,
and build the frontend around it. This mirrors how the contract
evolves from a rough draft into a tested, deployable artifact, and gives
you two independent ways to demonstrate correctness in your report: manual
verification in Remix, and automated tests in Truffle.

## 3. Local Blockchain: Ganache

Ganache simulates an Ethereum blockchain on your machine, with 10
pre-funded test accounts and instant block confirmation. Use it for all
development and testing. Do not deploy to a public testnet unless your
syllabus specifically asks for it; Ganache is sufficient to demonstrate
every feature in this project (deployment, deposits, timelocks,
distribution, cancellation) without needing testnet ETH or waiting for
real block times.

Two options:

- **Ganache UI** (desktop app): easiest for beginners, gives you a visual
  list of accounts, balances, and transactions. Default RPC port 7545.
- **ganache-cli**: lighter weight, runs in a terminal, useful if you want
  to script your testing. Default RPC port 8545.

Either works with the `truffle-config.js` in this project; just make sure
the port matches.

## 4. Development Sequence

Follow this order rather than building everything simultaneously; each
stage depends on the previous one working correctly.

### Stage 1: Contract skeleton
Write the state variables (owner, executor, beneficiaries, timelock,
status) and the constructor. Compile in Remix to confirm there are no
syntax errors.

### Stage 2: Owner configuration functions
Implement `addBeneficiary`, `removeBeneficiary`,
`updateBeneficiaryShare`, and `setExecutor`, each with the `onlyOwner`
modifier. Test manually in Remix by deploying with a few different
accounts and calling these functions from the correct and incorrect
callers to confirm access control reverts as expected.

### Stage 3: Funding
Implement `depositAssets` and the `receive()` fallback. Confirm the
contract balance increases and `totalDeposited` tracks it correctly.

### Stage 4: Executor trigger and timelock
Implement `initiateInheritance`, which validates that allocations sum to
100% and assets have been deposited, then records the activation and
unlock timestamps. This is the step most worth explaining carefully in
your report, since it is where the "oracle problem" discussion belongs.

### Stage 5: Cancellation
Implement `cancelInheritance`, restricted to the owner and only callable
while status is `VERIFICATION_PENDING`. This demonstrates state-based
access control, which is worth calling out explicitly as a security
design choice.

### Stage 6: Distribution
Implement `executeInheritance`, which checks the timelock has elapsed,
computes each beneficiary's share from the stored percentages, and
transfers funds. Note in the code and in your report why state is
updated before external calls are made (the checks-effects-interactions
pattern), since this is a standard reentrancy mitigation.

### Stage 7: Events
Add events for every state transition. These are what your frontend
dashboard displays as an audit trail, and they are worth demonstrating
live during a viva by watching them appear in Remix's transaction log or
in MetaMask activity.

### Stage 8: Move to Truffle, write tests
Copy the finished contract into `contracts/DigitalInheritance.sol` in
this project structure, write the migration script, and write tests
covering: successful configuration, rejection of over-100% allocation,
access control rejections, the full initiate/timelock/execute flow, and
cancellation. Automated tests are strong evidence of correctness for
your report and are far more convincing in a viva than manual
demonstration alone.

### Stage 9: Frontend
Build the dashboard last, once the contract's behavior is stable, since
frontend changes are much faster to iterate on than contract changes
(redeploying a modified contract gives it a new address and resets its
state). The provided `frontend/index.html` is deliberately a single
static file using `ethers.js` from a CDN, so it can be opened directly
in a browser with no build tooling, which keeps the demonstration simple
during a viva.

## 5. Technology Stack and Why Each Piece Is There

| Layer | Technology | Why |
|---|---|---|
| Smart contract language | Solidity 0.8.x | Built-in overflow checks, the standard language for EVM contracts |
| Local blockchain | Ganache | Instant local testing without real ETH or network latency |
| Development framework | Truffle | Compilation, migration, and a mature test runner (Mocha/Chai under the hood) |
| Contract testing | `@openzeppelin/test-helpers` | Provides `expectRevert` and `time.increase`, both needed to test access control and the timelock |
| Frontend-blockchain bridge | ethers.js | Cleaner API than raw Web3.js for contract calls, wallet connection, and unit conversion |
| Wallet | MetaMask | Standard browser wallet, handles key management and transaction signing |
| Frontend | Static HTML/CSS/JS | No build step needed for a project of this scope; easy to demonstrate live |
| Off-chain document storage (optional) | IPFS | Keeps sensitive documents off the public ledger; only a hash/CID is stored on-chain |

If your syllabus specifically requires React, the same `ethers.js` calls
in `frontend/index.html` translate directly into a React component:
wrap the contract calls in `useEffect`/event handlers and store the
dashboard values (`status`, `totalDeposited`, `unlockTimestamp`) in
`useState`. The contract and its ABI do not change either way.

## 6. Security Points Worth Discussing in Your Report

- **Access control**: `onlyOwner` and `onlyExecutor` modifiers restrict
  who can call sensitive functions; state-based modifiers (`inStatus`)
  prevent actions from being called out of order (e.g. distributing
  twice, or cancelling after execution).
- **Reentrancy**: `executeInheritance` updates `status` and zeroes
  `totalDeposited` before making external calls, following the
  checks-effects-interactions pattern, so a malicious beneficiary
  contract cannot re-enter and drain funds twice.
- **Input validation**: beneficiary addresses cannot be the zero
  address, percentages must be positive, and total allocation cannot
  exceed 100%, checked both when adding and when updating beneficiaries.
- **The oracle problem**: explicitly acknowledge that the contract
  cannot verify death or any other real-world condition. The executor's
  attestation and the timelock are the mitigations offered in this
  prototype; a production system might extend this to multi-party
  verification (see below).

## 7. Suggested Extension: Multi-Signature Verification

If time allows, replace the single `executor` with a small set of
verifier addresses and require, for example, 2 of 3 to call an
`approveInheritance()` function before the timelock starts. This is a
natural "advanced feature" to add on top of the current contract without
changing its overall structure, and it directly strengthens the
oracle-problem discussion in your report by reducing reliance on a
single trusted party.

## 8. Presenting the Project (Viva Framing)

Lead with the architecture, not the "will" concept. A suggested framing:

> "We developed a blockchain-based digital inheritance management
> system that uses a Solidity smart contract to encode predefined
> asset-distribution rules, role-based authorization, timelocked
> execution, and transparent on-chain auditability. Since real-world
> events such as death cannot be natively observed by a blockchain, our
> architecture introduces an authorized verification layer that
> triggers the smart contract's inheritance workflow, with a timelock
> giving the owner a window to intervene if that verification was made
> in error."

The strongest material for questions is not the inheritance concept
itself but the surrounding design decisions: the oracle problem, access
control, timelock reasoning, deterministic percentage-based
distribution, and reentrancy protection. Be ready to explain each of
those from the code, not just describe them abstractly.
