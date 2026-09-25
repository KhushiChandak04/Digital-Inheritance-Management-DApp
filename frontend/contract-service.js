import { CONTRACT_STORAGE_KEY, DEFAULT_CONTRACT_ADDRESS, NETWORK_CONFIG, SEPOLIA_CHAIN_ID } from "./config.js";

export const ABI = [
  "function owner() view returns (address)",
  "function executor() view returns (address)",
  "function totalDeposited() view returns (uint256)",
  "function timelockDuration() view returns (uint256)",
  "function activationTimestamp() view returns (uint256)",
  "function unlockTimestamp() view returns (uint256)",
  "function creationTimestamp() view returns (uint256)",
  "function documentReference() view returns (string)",
  "function getInheritanceStatus() view returns (uint8)",
  "function getUnlockTime() view returns (uint256)",
  "function getBeneficiaries() view returns (tuple(address wallet,uint256 percentageBasisPoints)[])",
  "function getBeneficiaryCount() view returns (uint256)",
  "function addBeneficiary(address wallet,uint256 percentageBasisPoints)",
  "function removeBeneficiary(uint256 index)",
  "function updateBeneficiaryShare(uint256 index,uint256 newPercentageBasisPoints)",
  "function setExecutor(address newExecutor)",
  "function setTimelockDuration(uint256 newDuration)",
  "function setDocumentReference(string cidOrHash)",
  "function depositAssets() payable",
  "function initiateInheritance()",
  "function cancelInheritance()",
  "function executeInheritance()",
  "function withdrawCancelledAssets()",
  "function resetPlan()",
  "event PlanCreated(address indexed owner,address indexed executor,uint256 timelockDuration)",
  "event BeneficiaryAdded(address indexed wallet,uint256 percentageBasisPoints)",
  "event BeneficiaryRemoved(address indexed wallet)",
  "event AssetsDeposited(address indexed from,uint256 amount)",
  "event ExecutorUpdated(address indexed newExecutor)",
  "event TimelockDurationUpdated(uint256 oldDuration,uint256 newDuration)",
  "event InheritanceInitiated(address indexed executor,uint256 activationTimestamp,uint256 unlockTimestamp)",
  "event InheritanceCancelled(uint256 timestamp)",
  "event AssetsDistributed(address indexed beneficiary,uint256 amount)",
  "event PlanExecuted(uint256 timestamp)",
  "event DocumentReferenceSet(string cidOrHash)",
  "event CancelledAssetsWithdrawn(address indexed owner,uint256 amount)",
  "event PlanReset(uint256 timestamp)"
];

export const STATUS_NAMES = ["ACTIVE", "VERIFICATION_PENDING", "EXECUTED", "CANCELLED"];

export function getSavedAddress() {
  localStorage.removeItem("inheritance.contractAddress");
  return localStorage.getItem(CONTRACT_STORAGE_KEY) || DEFAULT_CONTRACT_ADDRESS;
}

export function normalizeAddress(ethers, value) {
  const input = String(value || "").trim();
  if (!/^0x[0-9a-f]{40}$/i.test(input)) throw new Error("Enter a valid Ethereum address.");
  return ethers.utils.getAddress(input.toLowerCase());
}

export function readableError(error) {
  const code = error?.code;
  if (code === 4001 || code === "ACTION_REJECTED") return "Transaction cancelled in your wallet.";
  if (code === "INSUFFICIENT_FUNDS" || /insufficient funds/i.test(error?.message || "")) return "Your wallet does not have enough ETH for this transaction and its gas.";
  const reason = error?.error?.data?.message || error?.data?.message || error?.reason || error?.message || "The transaction could not be completed.";
  if (/Caller is not the owner/i.test(reason)) return "Only the plan owner can perform this action.";
  if (/Caller is not the executor/i.test(reason)) return "Only the trusted executor can initiate verification.";
  if (/Invalid plan status/i.test(reason)) return "This action is unavailable in the current inheritance status.";
  if (/Timelock has not yet elapsed/i.test(reason)) return "The distribution date has not arrived yet.";
  if (/Total allocation would exceed/i.test(reason)) return "Allocation cannot exceed 100%.";
  if (/allocations must total/i.test(reason)) return "Beneficiary allocations must total exactly 100% before verification.";
  if (/No assets deposited/i.test(reason)) return "Deposit protected assets before initiating inheritance.";
  if (/Transfer to beneficiary failed/i.test(reason)) return "A beneficiary transfer failed. No partial distribution was completed.";
  if (/No cancelled assets to withdraw/i.test(reason)) return "There are no cancelled assets left to recover.";
  if (/Contract balance must be zero/i.test(reason)) return "Recover the cancelled assets before resetting the plan.";
  if (/Plan must be executed or cancelled/i.test(reason)) return "Reset is available only after execution or cancellation.";
  if (/Cancelled asset withdrawal failed/i.test(reason)) return "Cancelled asset recovery failed.";
  return reason.replace(/^execution reverted:\s*/i, "").split("{", 1)[0].trim();
}

export class ContractService {
  constructor(ethers) {
    this.ethers = ethers;
    this.readProvider = null;
    this.readContract = null;
    this.signer = null;
    this.contract = null;
    this.address = "";
  }

  setProvider(provider) {
    this.readProvider = provider;
    if (this.address) this.readContract = new this.ethers.Contract(this.address, ABI, provider);
  }
  setSigner(signer) {
    this.signer = signer;
    if (this.address) this.contract = new this.ethers.Contract(this.address, ABI, signer);
  }
  setAddress(address) {
    this.address = normalizeAddress(this.ethers, address);
    localStorage.setItem(CONTRACT_STORAGE_KEY, this.address);
    const runner = this.signer || this.readProvider;
    this.contract = new this.ethers.Contract(this.address, ABI, runner);
    this.readContract = new this.ethers.Contract(this.address, ABI, this.readProvider || runner);
  }
  async readSnapshot() {
    if (!this.contract) throw new Error("Load a deployed contract first.");
    const readContract = this.readContract || this.contract;
    const [owner, executor, totalDeposited, timelockDuration, activationTimestamp, unlockTimestamp, creationTimestamp, documentReference, status, beneficiaries] = await Promise.all([
      readContract.owner(), readContract.executor(), readContract.totalDeposited(), readContract.timelockDuration(),
      readContract.activationTimestamp(), readContract.unlockTimestamp(), readContract.creationTimestamp(),
      readContract.documentReference(), readContract.getInheritanceStatus(), readContract.getBeneficiaries()
    ]);
    return { owner, executor, totalDeposited, timelockDuration, activationTimestamp, unlockTimestamp, creationTimestamp, documentReference, status: Number(status), beneficiaries };
  }
  async getEvents() {
    const readContract = this.readContract || this.contract;
    if (!readContract) return [];
    const names = ["PlanCreated", "BeneficiaryAdded", "BeneficiaryRemoved", "AssetsDeposited", "ExecutorUpdated", "TimelockDurationUpdated", "InheritanceInitiated", "InheritanceCancelled", "AssetsDistributed", "PlanExecuted", "DocumentReferenceSet", "CancelledAssetsWithdrawn", "PlanReset"];
    const events = (await Promise.all(names.map(name => readContract.queryFilter(readContract.filters[name]())))).flat();
    if (this.readProvider) await Promise.all(events.map(async event => { event.blockTimestamp = (await this.readProvider.getBlock(event.blockNumber)).timestamp; }));
    return events.sort((a, b) => b.blockNumber - a.blockNumber || b.transactionIndex - a.transactionIndex);
  }
  write(method, args = [], overrides = {}) { return this.contract.connect(this.signer)[method](...args, overrides); }
  addBeneficiary(address, bps) { return this.write("addBeneficiary", [address, bps]); }
  removeBeneficiary(index) { return this.write("removeBeneficiary", [index]); }
  updateBeneficiary(index, bps) { return this.write("updateBeneficiaryShare", [index, bps]); }
  setExecutor(address) { return this.write("setExecutor", [address]); }
  setTimelockDuration(seconds) { return this.write("setTimelockDuration", [seconds]); }
  setDocumentReference(value) { return this.write("setDocumentReference", [value]); }
  depositAssets(value) { return this.write("depositAssets", [], { value }); }
  initiateInheritance() { return this.write("initiateInheritance"); }
  cancelInheritance() { return this.write("cancelInheritance"); }
  executeInheritance() { return this.write("executeInheritance"); }
  withdrawCancelledAssets() { return this.write("withdrawCancelledAssets"); }
  resetPlan() { return this.write("resetPlan"); }
}
