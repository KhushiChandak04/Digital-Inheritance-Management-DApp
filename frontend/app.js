import { CertificateService, ContractService, STATUS_NAMES, getSavedAddress, normalizeAddress, readableError } from "./contract-service.js";
import { CERTIFICATE_CONTRACT_ADDRESS, CERTIFICATE_ISSUER_ADDRESS, EXPECTED_CHAIN_IDS, EXPECTED_NETWORK_LABEL, EXPLORER_BASE_URL, NETWORK_CONFIG } from "./config.js";

const { ethers } = window;
const service = new ContractService(ethers);
const certificateService = new CertificateService(ethers);
const DAY_SECONDS = 86400;
const PRESET_TIMELOCK_DAYS = [7, 30, 90, 180];
const state = { provider: null, signer: null, account: "", chainId: null, chainTimestamp: null, networkOk: false, snapshot: null, events: [], page: "dashboard", loading: false, modalPreviousFocus: null, labels: JSON.parse(localStorage.getItem("inheritance.labels") || "{}"), certificate: { transactionHash: "", executionTimestamp: "", records: [], status: "NOT_ELIGIBLE", error: "" } };
const $ = id => document.getElementById(id);
const q = selector => document.querySelector(selector);
const qa = selector => [...document.querySelectorAll(selector)];

function shortAddress(address) { return address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "—"; }
function formatDate(value) { const number = Number(value || 0); return number ? new Date(number * 1000).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "Not scheduled"; }
function formatDateShort(value) { const number = Number(value || 0); return number ? new Date(number * 1000).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" }) : "—"; }
function bpsToPercent(value) { return Number(value) / 100; }
function getRole() { if (!state.account || !state.snapshot) return "Public viewer"; const account = state.account.toLowerCase(); if (account === state.snapshot.owner.toLowerCase()) return "Plan owner"; if (account === state.snapshot.executor.toLowerCase()) return "Trusted executor"; if (state.snapshot.beneficiaries.some(item => item.wallet.toLowerCase() === account)) return "Beneficiary"; return "Public viewer"; }
function isOwner() { return getRole() === "Plan owner"; }
function isExecutor() { return getRole() === "Trusted executor"; }
function isBeneficiary() { return getRole() === "Beneficiary"; }
function showToast(message, error = false) { const toast = document.createElement("div"); toast.className = `toast${error ? " error" : ""}`; toast.textContent = message; $("toastStack").appendChild(toast); setTimeout(() => toast.remove(), 5200); }
function setNotice(message, error = false) { const notice = $("appNotice"); notice.textContent = message; notice.classList.toggle("hidden", !message); notice.style.color = error ? "var(--red)" : "var(--teal)"; }
function setFieldError(id, message) { const node = $(id); if (node) node.textContent = message || ""; }
function saveLabels() { localStorage.setItem("inheritance.labels", JSON.stringify(state.labels)); }
function labelFor(address) { return state.labels[address.toLowerCase()] || "Unnamed recipient"; }
function setText(id, value) { if ($(id)) $(id).textContent = value; }
function effectiveChainTimestamp() {
  if (state.chainTimestamp === null) return null;
  const blockchainSeconds = Number(state.chainTimestamp);
  if (!state.chainClockAnchor || state.chainClockAnchor.blockTimestamp !== blockchainSeconds) {
    state.chainClockAnchor = { blockTimestamp: blockchainSeconds, localMs: performance.now() };
  }
  return blockchainSeconds + (performance.now() - state.chainClockAnchor.localMs) / 1000;
}
function durationDays(seconds) { return Number(seconds) / DAY_SECONDS; }
function formatDuration(seconds) { const totalSeconds = Number(seconds); if (totalSeconds === 30) return "30 seconds"; const days = durationDays(totalSeconds); return `${days} day${days === 1 ? "" : "s"}`; }
function setTimelockControl(seconds) { const totalSeconds = Number(seconds); const select = $("timelockSelect"); const custom = $("customTimelockInput"); if (!select || !custom) return; if (totalSeconds === 30) { select.value = "30s"; custom.value = ""; $("customTimelockWrap").classList.add("hidden"); return; } const days = durationDays(totalSeconds); const preset = PRESET_TIMELOCK_DAYS.includes(days); select.value = preset ? String(days) : "custom"; custom.value = preset ? "" : String(days); $("customTimelockWrap").classList.toggle("hidden", preset); }
function validateTimelockDays(seconds) { const select = $("timelockSelect"); const custom = $("customTimelockInput"); if (select.value === "30s") return { days: 30 / DAY_SECONDS, seconds: 30 }; const value = select.value === "custom" ? custom.value.trim() : select.value; if (!/^\d+$/.test(value)) return { error: "Enter a whole number of days from 1 to 365." }; const days = Number(value); if (days < 1 || days > 365) return { error: "Timelock duration must be between 1 and 365 whole days." }; return { days, seconds: days * DAY_SECONDS }; }
function ensureActionHints() { const execute = $("executeBtn"); if (execute && !$("executeHint")) { const hint = document.createElement("p"); hint.id = "executeHint"; hint.className = "action-hint"; execute.insertAdjacentElement("afterend", hint); execute.setAttribute("aria-describedby", "executeHint"); } const technicalSummary = q(".blockchain-details summary span"); if (technicalSummary) technicalSummary.textContent = "Oracle model: off-chain executor attestation"; }
function setupTheme() {
  const saved = localStorage.getItem("inheritance.theme") || "dark";
  applyTheme(saved);
  $("themeToggle").addEventListener("click", () => applyTheme(document.documentElement.dataset.theme === "light" ? "dark" : "light"));
}
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem("inheritance.theme", theme);
  const brandLogo = $("brandLogo");
  if (brandLogo) brandLogo.src = theme === "light" ? "./brand-logo-light.png" : "./brand-logo-dark.png";
  setText("themeIcon", theme === "light" ? "\u263e" : "\u263c");
  setText("themeLabel", theme === "light" ? "Dark mode" : "Light mode");
  $("themeToggle")?.setAttribute("aria-label", `Switch to ${theme === "light" ? "dark" : "light"} theme`);
}

function setupNavigation() {
  qa("[data-page]").forEach(button => button.addEventListener("click", () => navigate(button.dataset.page)));
  qa("[data-go]").forEach(button => button.addEventListener("click", () => navigate(button.dataset.go)));
  $("menuBtn").addEventListener("click", () => $("sidebar").classList.toggle("open"));
  $("primaryAction").addEventListener("click", () => navigate(isOwner() ? "beneficiaries" : "verification"));
}

function createReadProvider(chainId, walletProvider) {
  if (chainId !== 11155111) return walletProvider;
  const config = NETWORK_CONFIG.sepolia;
  const urls = [config.rpcUrl, ...(config.fallbackRpcUrls || [])];
  const providers = urls.map(url => new ethers.providers.JsonRpcProvider(url, chainId));
  return new ethers.providers.FallbackProvider(providers, 1);
}

function navigate(page) {
  state.page = page;
  qa(".page").forEach(section => section.classList.toggle("active", section.dataset.view === page));
  qa("[data-page]").forEach(button => button.classList.toggle("active", button.dataset.page === page));
  const current = q(`[data-view="${page}"]`);
  setText("pageTitle", current?.querySelector("h1")?.textContent || "Dashboard");
  setText("pageEyebrow", current?.querySelector(".eyebrow")?.textContent || "OVERVIEW");
  $("sidebar").classList.remove("open");
  if (page === "activity" && state.events.length === 0) refreshEvents();
}

async function connect(request = false) {
  if (!window.ethereum) { setNotice("MetaMask was not detected. Install it to connect this local prototype.", true); return; }
  try {
    const previousAccount = state.account;
    state.provider = new ethers.providers.Web3Provider(window.ethereum, "any");
    const accounts = await state.provider.send(request ? "eth_requestAccounts" : "eth_accounts", []);
    if (!accounts.length) { state.account = ""; state.signer = null; clearLoadedPlan(); updateConnection(); return; }
    state.signer = state.provider.getSigner(accounts[0]);
    state.account = ethers.utils.getAddress(accounts[0]);
    const network = await state.provider.getNetwork(); state.chainId = Number(network.chainId); state.networkOk = EXPECTED_CHAIN_IDS.includes(state.chainId);
    service.setProvider(createReadProvider(state.chainId, state.provider)); service.setSigner(state.signer); certificateService.setProvider(service.readProvider); certificateService.setSigner(state.signer); certificateService.setAddress(CERTIFICATE_CONTRACT_ADDRESS);
    updateConnection(); if (previousAccount && previousAccount.toLowerCase() !== state.account.toLowerCase()) { showToast(`Connected account changed to ${shortAddress(state.account)}.`); }
    if (state.snapshot) renderPermissions();
    if (state.networkOk) {
      if (service.address) await refreshAll(); else await loadContract(getSavedAddress());
    } else {
      clearLoadedPlan(); showWrongNetwork();
    }
  } catch (error) { const message = readableError(error); setNotice(message, true); showToast(message, true); }
}
function updateConnection() { setText("walletLabel", state.account ? shortAddress(state.account) : "Connect wallet"); setText("networkLabel", state.networkOk ? EXPECTED_NETWORK_LABEL : state.chainId ? `Chain ${state.chainId}` : "Network unavailable"); $("networkChip").classList.toggle("wrong", !state.networkOk); setText("roleValue", getRole()); setText("roleHint", state.account ? "Permissions update with your wallet" : "Connect to see permissions"); }
function showWrongNetwork() { $("wrongNetwork").classList.remove("hidden"); }
function hideWrongNetwork() { $("wrongNetwork").classList.add("hidden"); }
function clearLoadedPlan() {
  state.snapshot = null;
  state.events = [];
  state.certificate = { transactionHash: "", executionTimestamp: "", records: [], status: "NOT_ELIGIBLE", error: "" };
  ["heroStatus", "balanceValue", "assetPageBalance", "beneficiaryCount", "allocationValue", "executorShort", "distributionDate", "detailOwner", "planOwner", "planExecutor", "verificationExecutor", "planTimelock"].forEach(id => setText(id, "—"));
  setText("statusPill", "NOT LOADED");
  setText("planStatusPill", "—");
  setText("verificationStatus", "—");
  setText("nextAction", "Load a deployed contract to begin.");
  setText("recentActivity", "No confirmed activity found for this deployment.");
  setText("contractLoadState", "No deployment loaded");
  setText("assetHealth", "Awaiting plan");
  renderCertificatePanel();
  $("initiateBtn").disabled = true;
  $("executeBtn").disabled = true;
  $("cycleControls")?.classList.add("hidden");
  $("timelockSelect").disabled = true;
  $("timelockSubmit").disabled = true;
  $("beneficiaryRows").innerHTML = `<tr><td colspan="5"><div class="empty-state">No contract loaded.</div></td></tr>`;
}

async function loadContract(address) {
  clearLoadedPlan();
  try { service.setAddress(address); $("contractInput").value = service.address; await refreshAll(true); setText("contractLoadState", `Loaded ${shortAddress(service.address)}`); hideWrongNetwork(); setNotice("Plan loaded. Reads are synchronized with the selected deployment."); setTimeout(() => setNotice(""), 3500); }
  catch (error) { setFieldError("contractError", readableError(error)); showToast(readableError(error), true); }
}
async function refreshAll(throwOnError = false) {
  if (!service.contract) return;
  try { await refreshBlockchainClock(); state.snapshot = await service.readSnapshot(); await refreshEvents(); render(); } catch (error) { clearLoadedPlan(); setNotice(`Unable to read the plan: ${readableError(error)}`, true); if (throwOnError) throw error; }
}
async function refreshBlockchainClock() { if (state.provider) state.chainTimestamp = (await state.provider.getBlock("latest")).timestamp; }
async function refreshEvents() { try { state.events = await service.getEvents(); renderActivity(); polishActivityCopy(); } catch (error) { if (state.page === "activity") showToast(`Activity unavailable: ${readableError(error)}`, true); } }
function polishActivityCopy() { qa(".activity-item strong").forEach(node => { node.textContent = node.textContent.replace("Protected assets deposited", "Deposit received").replace("Assets distributed", "Distribution executed").replace("Plan executed", "Distribution executed"); }); }

function render() {
  const data = state.snapshot; if (!data) return;
  const status = STATUS_NAMES[data.status]; const totalBps = data.beneficiaries.reduce((sum, item) => sum + Number(item.percentageBasisPoints), 0); const allocated = bpsToPercent(totalBps); const remaining = Math.max(0, 100 - allocated); const balance = ethers.utils.formatEther(data.totalDeposited);
  setText("heroStatus", status === "VERIFICATION_PENDING" ? "Inheritance pending" : status === "ACTIVE" ? "Plan active" : status === "EXECUTED" ? "Plan executed" : "Plan cancelled"); setText("statusPill", status.replace("_", " ")); setText("planStatusPill", status.replace("_", " ")); setText("verificationStatus", status.replace("_", " ")); ["statusPill", "planStatusPill", "verificationStatus"].forEach(id => { const node = $(id); node.className = `status-pill ${status.toLowerCase().replace("_", "-")}`; });
  setText("balanceValue", balance); setText("assetPageBalance", balance); setText("beneficiaryCount", data.beneficiaries.length); setText("allocationValue", `${allocated.toFixed(2)}%`); setText("allocatedText", `${allocated.toFixed(2)}%`); setText("remainingText", `${remaining.toFixed(2)}%`); setText("allocationRemaining", `${remaining.toFixed(2)}% remaining`); setText("allocationBig", `${allocated.toFixed(0)}%`); setText("allocationHeadline", allocated === 100 ? "Allocation complete" : "Build your distribution"); setText("allocationMessage", allocated === 100 ? "Allocation complete — 100%. This plan is ready for verification." : `${remaining.toFixed(2)}% remains available for allocation.`); $("allocationBar").style.width = `${Math.min(100, allocated)}%`; $("allocationBarLarge").style.width = `${Math.min(100, allocated)}%`; $("allocationRing").style.background = `conic-gradient(var(--teal) ${allocated * 3.6}deg, #25343d 0deg)`;
  if (state.provider) state.provider.getBalance(data.owner).then(value => setText("ownerWalletBalance", `${Number(ethers.utils.formatEther(value)).toFixed(4)} ETH`)).catch(() => setText("ownerWalletBalance", "Unavailable"));
  setText("executorShort", shortAddress(data.executor)); setText("executorState", isExecutor() ? "You are the trusted executor" : "Authorized verification party"); setText("distributionDate", data.unlockTimestamp > 0 ? formatDateShort(data.unlockTimestamp) : "Not scheduled"); setText("distributionCountdown", data.status === 1 ? countdown(data.unlockTimestamp) : "No active timelock"); setText("nextAction", nextAction(status, allocated)); setText("timelockSummary", data.status === 1 ? `Unlocks ${formatDate(data.unlockTimestamp)}` : "No timelock active");
  setText("detailContract", service.address); setText("detailOwner", data.owner); setText("detailNetwork", `${EXPECTED_NETWORK_LABEL} (${state.chainId || "—"})`); setText("detailCreated", formatDate(data.creationTimestamp)); setText("planOwner", shortAddress(data.owner)); setText("planExecutor", shortAddress(data.executor)); setText("planTimelock", formatDuration(data.timelockDuration)); setTimelockControl(data.timelockDuration); setText("planCreated", formatDate(data.creationTimestamp)); setText("planActivated", data.activationTimestamp > 0 ? formatDate(data.activationTimestamp) : "Not started"); setText("planUnlocked", data.unlockTimestamp > 0 ? formatDate(data.unlockTimestamp) : "Not scheduled"); setText("verificationExecutor", shortAddress(data.executor)); setText("verificationText", status === "ACTIVE" ? "Ready for authorized initiation." : status === "VERIFICATION_PENDING" ? "Timelock is running." : "No initiation available."); setText("verificationEligibility", isExecutor() && status === "ACTIVE" ? "Eligible" : status === "ACTIVE" ? "Executor only" : "Unavailable"); setText("activationDate", data.activationTimestamp ? formatDate(data.activationTimestamp) : "—"); setText("unlockDate", data.unlockTimestamp ? formatDate(data.unlockTimestamp) : "—"); setText("timelockTitle", data.status === 1 ? "Inheritance pending" : "No active timelock"); setText("documentValue", data.documentReference || "Not configured"); $("documentInput").value = data.documentReference || "";
  const progress = data.status === 1 ? Math.min(100, Math.max(0, (Date.now() / 1000 - Number(data.activationTimestamp)) / (Number(data.unlockTimestamp) - Number(data.activationTimestamp)) * 100)) : data.status > 1 ? 100 : 0; setText("countdown", data.status === 1 ? countdown(data.unlockTimestamp) : "—"); $("timelockProgress").classList.toggle("complete", progress >= 100); renderBeneficiaries(); renderPermissions(); renderLabels(); renderCertificatePanel();
}
function nextAction(status, allocated) { if (!state.account) return "Connect a wallet to begin."; if (status === "ACTIVE" && isOwner() && allocated < 100) return `Add ${ (100 - allocated).toFixed(2)}% to complete allocation.`; if (status === "ACTIVE" && isExecutor()) return "Review the off-chain condition, then initiate verification."; if (status === "VERIFICATION_PENDING") return "Review the timelock before distribution."; if (status === "EXECUTED") return "Distribution has been completed."; if (status === "CANCELLED") return "This plan was cancelled."; return "Review the plan details."; }
function countdown(unlock) {
  const now = effectiveChainTimestamp();
  if (now === null) return "Syncing blockchain clock…";
  const diff = Number(unlock) - now;
  if (diff <= 0) return "Ready to distribute";
  const totalSeconds = Math.floor(diff);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${days}d ${hours}h ${minutes}m ${seconds}s`;
}
function lifecycleFor(data = state.snapshot) {
  if (!data) return "NOT_LOADED";
  const now = effectiveChainTimestamp() ?? 0;
  if (data.status === 0) return "READY";
  if (data.status === 1) return Number(data.unlockTimestamp) <= now ? "UNLOCKED" : "TIMED_LOCK_ACTIVE";
  if (data.status === 2) return "EXECUTED";
  return "CANCELLED";
}
function applyLifecycleState() {
  const lifecycle = lifecycleFor();
  if (!state.snapshot) return;
  const labels = { READY: "READY / ACTIVE", TIMED_LOCK_ACTIVE: "TIMED LOCK ACTIVE", UNLOCKED: "DISTRIBUTION AVAILABLE", EXECUTED: "EXECUTED", CANCELLED: "CANCELLED" };
  const statusClass = { READY: "active", TIMED_LOCK_ACTIVE: "pending", UNLOCKED: "unlocked", EXECUTED: "executed", CANCELLED: "cancelled" }[lifecycle];
  ["statusPill", "planStatusPill", "verificationStatus"].forEach(id => { const node = $(id); node.textContent = labels[lifecycle]; node.className = `status-pill ${statusClass}`; });
  setText("heroStatus", { READY: "Plan active", TIMED_LOCK_ACTIVE: "Inheritance pending", UNLOCKED: "Distribution available", EXECUTED: "Plan executed", CANCELLED: "Plan cancelled" }[lifecycle]);
  setText("assetHealth", "Balance synchronized");
  setText("verificationText", { READY: "Awaiting executor initiation.", TIMED_LOCK_ACTIVE: "Owner review window is active.", UNLOCKED: "The timelock has elapsed. Distribution is available.", EXECUTED: "Distribution completed.", CANCELLED: "This inheritance was cancelled." }[lifecycle]);
  setText("verificationEligibility", lifecycle === "READY" && isExecutor() ? "Eligible to initiate" : lifecycle === "READY" ? "Executor only" : lifecycle === "TIMED_LOCK_ACTIVE" ? "Review window active" : lifecycle === "UNLOCKED" ? "Public execution available" : "Unavailable");
  setText("timelockTitle", lifecycle === "TIMED_LOCK_ACTIVE" ? "Review window active" : lifecycle === "UNLOCKED" ? "Distribution available" : lifecycle === "EXECUTED" ? "Distribution completed" : "No active timelock");
  setText("timelockSummary", lifecycle === "TIMED_LOCK_ACTIVE" ? `Unlocks ${formatDate(state.snapshot.unlockTimestamp)}` : lifecycle === "UNLOCKED" ? "Ready to distribute" : lifecycle === "EXECUTED" ? "Distribution complete" : "No timelock active");
  setText("countdown", lifecycle === "TIMED_LOCK_ACTIVE" || lifecycle === "UNLOCKED" ? countdown(state.snapshot.unlockTimestamp) : "—");
  setText("distributionCountdown", lifecycle === "TIMED_LOCK_ACTIVE" ? countdown(state.snapshot.unlockTimestamp) : lifecycle === "UNLOCKED" ? "Ready to distribute" : lifecycle === "EXECUTED" ? "Completed" : "No active timelock");
  setText("timelockLockNote", lifecycle === "READY" ? "Timelock duration can be changed while the plan is active." : "Timelock duration is locked after verification begins.");
  setText("nextAction", lifecycle === "READY" ? nextAction("ACTIVE", state.snapshot.beneficiaries.reduce((sum, item) => sum + Number(item.percentageBasisPoints), 0) / 100) : lifecycle === "TIMED_LOCK_ACTIVE" ? "Review the active timelock before distribution." : lifecycle === "UNLOCKED" ? "Distribution can now be executed by any account." : lifecycle === "EXECUTED" ? "All protected assets have been distributed." : "This plan was cancelled.");
  const initiate = $("initiateBtn"), execute = $("executeBtn");
  initiate.classList.toggle("hidden", !(isExecutor() && lifecycle === "READY"));
  initiate.disabled = !(isExecutor() && lifecycle === "READY");
  execute.classList.toggle("hidden", !["TIMED_LOCK_ACTIVE", "UNLOCKED"].includes(lifecycle));
  execute.disabled = lifecycle !== "UNLOCKED";
  execute.title = lifecycle === "TIMED_LOCK_ACTIVE" ? "Unavailable until the timelock expires" : lifecycle === "UNLOCKED" ? "Execute the protected-asset distribution" : "Distribution is not available";
  setText("executeHint", lifecycle === "TIMED_LOCK_ACTIVE" ? "Distribution becomes available after the timelock expires." : lifecycle === "UNLOCKED" ? "The timelock has elapsed. Review the allocation before confirming." : "");
  updateCycleControls(lifecycle);
  $("planActivation")?.classList.toggle("complete", lifecycle !== "READY");
  $("planUnlock")?.classList.toggle("complete", ["UNLOCKED", "EXECUTED"].includes(lifecycle));
  const compactItems = qa('[data-view="verification"] .timeline.compact .timeline-item');
  if (compactItems.length) { compactItems[0].classList.toggle("complete", lifecycle !== "READY"); compactItems[0].querySelector("strong").textContent = lifecycle === "READY" ? "Awaiting executor initiation" : "Verification initiated"; compactItems[0].querySelector("small").textContent = lifecycle === "READY" ? "No verification transaction has been submitted" : "Executor transaction confirmed"; compactItems[1].classList.toggle("complete", ["UNLOCKED", "EXECUTED"].includes(lifecycle)); compactItems[2].classList.toggle("complete", lifecycle === "EXECUTED"); }
}

function updateCycleControls(lifecycle) { const controls = $("cycleControls"), withdraw = $("withdrawCancelledBtn"), reset = $("resetPlanBtn"); if (!controls || !withdraw || !reset || !state.snapshot) return; const owner = isOwner(); const cancelled = lifecycle === "CANCELLED"; const executed = lifecycle === "EXECUTED"; const balanceRemaining = !state.snapshot.totalDeposited.isZero(); controls.classList.toggle("hidden", !owner); withdraw.classList.toggle("hidden", !cancelled); withdraw.disabled = !cancelled || !balanceRemaining; reset.classList.toggle("hidden", !cancelled && !executed); reset.disabled = cancelled && balanceRemaining; setText("cycleStateHint", lifecycle === "EXECUTED" ? "Reset is available for a new inheritance cycle." : lifecycle === "CANCELLED" && balanceRemaining ? "Recover the remaining assets before resetting the plan." : lifecycle === "CANCELLED" ? "Cancelled assets recovered. Reset is available." : lifecycle === "TIMED_LOCK_ACTIVE" ? "Reset is unavailable while verification is pending." : lifecycle === "READY" ? "Reset is available only after execution or cancellation." : ""); }
function renderPermissions() { const owner = isOwner(); const lifecycle = lifecycleFor(); qa(".owner-action").forEach(node => node.classList.toggle("hidden", !owner || (node.id === "cancelBtn" ? lifecycle !== "TIMED_LOCK_ACTIVE" : lifecycle !== "READY"))); ["executorForm", "documentForm", "showBeneficiaryForm", "depositForm"].forEach(id => { const node = $(id); if (node) node.classList.toggle("hidden", !owner || lifecycle !== "READY"); }); const timelockForm = $("timelockForm"); if (timelockForm) { timelockForm.classList.toggle("hidden", !owner); [$("timelockSelect"), $("timelockSubmit"), $("customTimelockInput")].forEach(node => { if (node) node.disabled = lifecycle !== "READY"; }); } setText("ownerOnlyLabel", owner ? "You are the plan owner" : "Owner access required"); applyLifecycleState(); }
function renderBeneficiaries() { const data = state.snapshot; if (!data) return; const balance = Number(ethers.utils.formatEther(data.totalDeposited)); $("beneficiaryRows").innerHTML = data.beneficiaries.length ? data.beneficiaries.map((item, index) => { const percent = bpsToPercent(item.percentageBasisPoints); return `<tr><td><div class="recipient"><span class="recipient-mark">${(labelFor(item.wallet)[0] || "R").toUpperCase()}</span><div><strong>${escapeHtml(labelFor(item.wallet))}</strong><code>${shortAddress(item.wallet)} <button class="copy-button" data-copy="${item.wallet}" title="Copy address">⧉</button></code></div></div></td><td class="share">${percent.toFixed(2)}%</td><td class="amount">${(balance * percent / 100).toFixed(4)} ETH</td><td><span class="status-pill active">REGISTERED</span></td><td><div class="table-actions owner-action"><button class="table-action" data-edit="${index}">Edit</button><button class="table-action danger" data-remove="${index}">Remove</button></div></td></tr>`; }).join("") : `<tr><td colspan="5"><div class="empty-state">No beneficiaries registered yet. Add the first recipient to begin.</div></td></tr>`; setText("beneficiaryTableHint", `${data.beneficiaries.length} registered`); qa("[data-copy]").forEach(button => button.addEventListener("click", () => copy(button.dataset.copy))); qa("[data-remove]").forEach(button => button.addEventListener("click", () => confirmAction("Remove beneficiary", "This removes the recipient from the plan. The change requires an owner transaction.", () => transact("Removing beneficiary", () => service.removeBeneficiary(button.dataset.remove))))); qa("[data-edit]").forEach(button => button.addEventListener("click", () => editShare(Number(button.dataset.edit)))); }
function renderLabels() { const target = $("labelSettings"); if (!state.snapshot || !state.snapshot.beneficiaries.length) { target.innerHTML = `<div class="empty-state">Beneficiaries will appear here after they are registered.</div>`; return; } target.innerHTML = state.snapshot.beneficiaries.map(item => `<label class="label-setting"><code>${shortAddress(item.wallet)}</code><input data-label="${item.wallet}" value="${escapeHtml(labelFor(item.wallet) === "Unnamed recipient" ? "" : labelFor(item.wallet))}" placeholder="Local display name" /></label>`).join(""); qa("[data-label]").forEach(input => input.addEventListener("change", () => { const value = input.value.trim(); if (value) state.labels[input.dataset.label.toLowerCase()] = value; else delete state.labels[input.dataset.label.toLowerCase()]; saveLabels(); renderBeneficiaries(); })); }
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[character])); }

function validateBeneficiary() { const addressValue = $("beneficiaryAddress").value.trim(), shareValue = $("beneficiaryShare").value.trim(); let valid = true; ["beneficiaryAddressError", "beneficiaryShareError", "beneficiaryLabelError"].forEach(id => setFieldError(id, "")); let address; try { address = normalizeAddress(ethers, addressValue); } catch { setFieldError("beneficiaryAddressError", "Enter a valid Ethereum address, including 0x."); valid = false; } const share = Number(shareValue); if (!shareValue || !Number.isFinite(share) || share <= 0 || share > 100) { setFieldError("beneficiaryShareError", "Enter a percentage greater than 0 and no more than 100."); valid = false; } const snapshot = state.snapshot; if (address && snapshot) { if (address.toLowerCase() === snapshot.owner.toLowerCase()) { setFieldError("beneficiaryAddressError", "The plan owner cannot be a beneficiary."); valid = false; } else if (address.toLowerCase() === snapshot.executor.toLowerCase()) { setFieldError("beneficiaryAddressError", "The trusted executor cannot be a beneficiary."); valid = false; } else if (snapshot.beneficiaries.some(item => item.wallet.toLowerCase() === address.toLowerCase())) { setFieldError("beneficiaryAddressError", "This beneficiary is already registered."); valid = false; } const allocated = snapshot.beneficiaries.reduce((sum, item) => sum + Number(item.percentageBasisPoints), 0) / 100; if (allocated + share > 100) { setFieldError("beneficiaryShareError", `Only ${(100 - allocated).toFixed(2)}% remains available.`); valid = false; } } return valid ? { address, bps: Math.round(share * 100) } : null; }
function editShare(index) { const current = bpsToPercent(state.snapshot.beneficiaries[index].percentageBasisPoints); const value = window.prompt(`New allocation percentage (current ${current}%):`, current); if (value === null) return; const share = Number(value); const without = state.snapshot.beneficiaries.reduce((sum, item, itemIndex) => sum + (itemIndex === index ? 0 : Number(item.percentageBasisPoints)), 0) / 100; if (!Number.isFinite(share) || share <= 0 || share > 100 || without + share > 100) { showToast(`Enter a valid share. Maximum available is ${(100 - without).toFixed(2)}%.`, true); return; } confirmAction("Update allocation", `Change this beneficiary's share to ${share}%.`, () => transact("Updating beneficiary share", () => service.updateBeneficiary(index, Math.round(share * 100)))); }

function planExecutedEvent(receipt) { return (receipt?.events || []).find(event => event.event === "PlanExecuted" && event.address.toLowerCase() === service.address.toLowerCase()); }
function latestPlanExecutedEvent() { return state.events.find(event => event.event === "PlanExecuted"); }
function cycleReferenceFor(transactionHash, beneficiary, index) { return ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(["address", "bytes32", "address", "uint256"], [service.address, transactionHash, beneficiary, index])); }
function metadataUriFor(beneficiary, allocationBasisPoints, executionTimestamp, transactionHash, index) {
  const metadata = { name: "Heirloom Inheritance Certificate", description: "A verifiable certificate of completed inheritance execution.", external_url: `${EXPLORER_BASE_URL}/tx/${transactionHash}`, attributes: [{ trait_type: "Beneficiary", value: beneficiary }, { trait_type: "Allocation basis points", value: String(allocationBasisPoints) }, { trait_type: "Execution timestamp", value: String(executionTimestamp) }, { trait_type: "Certificate index", value: String(index + 1) }] };
  return `data:application/json,${encodeURIComponent(JSON.stringify(metadata))}`;
}
function isCertificateIssuer() { return state.chainId === 11155111 && Boolean(state.account) && state.account.toLowerCase() === CERTIFICATE_ISSUER_ADDRESS.toLowerCase(); }
function prepareCertificateContext(snapshot, event) {
  const transactionHash = event?.transactionHash || "";
  const executionTimestamp = event?.args?.timestamp?.toString() || "";
  if (!transactionHash || !executionTimestamp) return false;
  if (state.certificate.transactionHash !== transactionHash) {
    state.certificate.transactionHash = transactionHash;
    state.certificate.executionTimestamp = executionTimestamp;
    state.certificate.records = snapshot.beneficiaries.map((item, index) => ({ beneficiary: item.wallet, allocationBasisPoints: item.percentageBasisPoints.toString(), cycleReference: cycleReferenceFor(transactionHash, item.wallet, index), metadataURI: metadataUriFor(item.wallet, item.percentageBasisPoints, executionTimestamp, transactionHash, index), status: "ready", tokenId: "", txHash: "", error: "" }));
  }
  return true;
}
function renderCertificatePanel() {
  const panel = $("certificatePanel");
  if (!panel) return;
  const button = $("issueCertificatesBtn");
  const list = $("certificateList");
  setText("certificateAddress", CERTIFICATE_CONTRACT_ADDRESS);
  const executed = state.snapshot?.status === 2;
  panel.classList.toggle("hidden", !state.snapshot);
  if (!executed) { setText("certificateStatus", "Not eligible"); setText("certificateMessage", "Certificates become available after inheritance execution is confirmed."); if (button) button.disabled = true; if (list) list.innerHTML = `<div class="empty-state">No certificate issuance is available for this plan yet.</div>`; return; }
  if (!state.certificate.transactionHash) prepareCertificateContext(state.snapshot, latestPlanExecutedEvent());
  const allMinted = state.certificate.records.length > 0 && state.certificate.records.every(record => record.status === "minted");
  const hasFailure = state.certificate.records.some(record => record.status === "failed");
  const pending = state.certificate.records.some(record => record.status === "pending");
  const status = !isCertificateIssuer() ? "Certificate issuance requires the inheritance owner wallet." : pending ? "Certificate mint pending." : allMinted ? "Certificate minted." : hasFailure ? "Certificate mint failed. Retry available." : "Ready to issue certificates.";
  setText("certificateStatus", state.certificate.status === "MINTING" ? "Certificate mint pending." : status);
  setText("certificateMessage", state.chainId !== 11155111 ? "Inheritance executed successfully. Switch MetaMask to Sepolia before issuing certificate NFTs." : isCertificateIssuer() ? "Inheritance executed successfully. The owner is issuing certificate NFTs separately; asset distribution is already complete." : "Inheritance executed successfully. Connect the inheritance owner wallet to issue certificates.");
  if (button) { button.disabled = !isCertificateIssuer() || pending || allMinted || !state.certificate.records.length; button.classList.toggle("hidden", allMinted); }
  if (list) list.innerHTML = state.certificate.records.length ? state.certificate.records.map(record => `<div class="certificate-row"><div><strong>${escapeHtml(shortAddress(record.beneficiary))}</strong><small>${(Number(record.allocationBasisPoints) / 100).toFixed(2)}% allocation</small></div><span class="certificate-row-status ${record.status}">${record.status === "minted" ? `Token #${escapeHtml(record.tokenId)}` : record.status === "failed" ? "Failed" : record.status === "pending" ? "Pending" : "Ready"}</span>${record.txHash ? `<a href="${EXPLORER_BASE_URL}/tx/${record.txHash}" target="_blank" rel="noreferrer">Transaction</a>` : ""}</div>`).join("") : `<div class="empty-state">No beneficiary certificates are available for issuance.</div>`;
}
async function issueCertificates() {
  if (!state.snapshot || state.snapshot.status !== 2 || !isCertificateIssuer()) { renderCertificatePanel(); return; }
  const event = latestPlanExecutedEvent();
  if (!prepareCertificateContext(state.snapshot, event)) { state.certificate.error = "The confirmed PlanExecuted event could not be identified."; setText("certificateStatus", "Certificate issuance unavailable"); setText("certificateMessage", state.certificate.error); return; }
  state.certificate.status = "MINTING"; renderCertificatePanel();
  for (const record of state.certificate.records) {
    if (record.status === "minted") continue;
    try {
      if (await certificateService.isCycleUsed(record.cycleReference)) {
        const existing = await certificateService.findByCycleReference(record.cycleReference);
        record.status = "minted";
        record.tokenId = existing?.args?.tokenId?.toString() || "already issued";
        record.txHash = existing?.transactionHash || "";
        renderCertificatePanel();
        continue;
      }
      record.status = "pending";
      renderCertificatePanel();
      const tx = await certificateService.mintCertificate(record.beneficiary, record.allocationBasisPoints, state.certificate.executionTimestamp, record.cycleReference, record.metadataURI);
      record.txHash = tx.hash;
      const receipt = await tx.wait();
      const mintedEvent = (receipt.events || []).find(item => item.event === "CertificateMinted");
      record.tokenId = mintedEvent?.args?.tokenId?.toString() || "confirmed";
      record.status = "minted";
    } catch (error) {
      record.status = "failed";
      record.error = readableError(error);
    }
    renderCertificatePanel();
  }
  state.certificate.status = "";
  renderCertificatePanel();
}
async function handleExecutionConfirmed(receipt, tx) {
  const executedEvent = planExecutedEvent(receipt);
  if (!executedEvent) { setText("certificateStatus", "Certificate issuance unavailable"); setText("certificateMessage", "Inheritance executed successfully, but the confirmed PlanExecuted event was not found."); return; }
  try {
    const snapshot = await service.readSnapshot();
    state.snapshot = snapshot;
    prepareCertificateContext(snapshot, executedEvent);
    await issueCertificates();
  } catch (error) {
    setText("certificateStatus", "Certificate mint failed. Retry available.");
    setText("certificateMessage", `Inheritance executed successfully. Certificate issuance could not be prepared: ${readableError(error)}`);
  }
}

async function transact(label, action, onConfirmed) { if (!state.signer || !service.contract) { showToast("Connect a wallet and load a contract first.", true); return; } state.loading = true; document.body.classList.add("transaction-busy"); setNotice(`${label}: preparing transaction…`); try { setNotice(`${label}: waiting for wallet approval…`); const tx = await action(); setNotice(`${label}: submitted. Pending confirmation…`); showToast(`${label} submitted: ${shortAddress(tx.hash)}`); const receipt = await tx.wait(); if (onConfirmed) await onConfirmed(receipt, tx); await refreshAll(); setNotice(`${label}: confirmed.`); showToast(`${label} confirmed.`); setTimeout(() => setNotice(""), 3200); } catch (error) { const rejected = error?.code === 4001 || error?.code === "ACTION_REJECTED"; const message = rejected ? "Transaction rejected in your wallet." : readableError(error); setNotice(`${label} ${rejected ? "rejected" : "failed"}: ${message}`, true); showToast(message, true); } finally { state.loading = false; document.body.classList.remove("transaction-busy"); } }
function confirmAction(title, text, action) { state.modalPreviousFocus = document.activeElement; $("modalTitle").textContent = title; $("modalText").textContent = text; $("confirmModal").classList.remove("hidden"); const confirm = $("modalConfirm"); const cancel = $("modalCancel"); const close = () => { $("confirmModal").classList.add("hidden"); document.removeEventListener("keydown", trapModalFocus); state.modalPreviousFocus?.focus(); }; confirm.onclick = () => { close(); action(); }; cancel.onclick = close; $("modalClose").onclick = close; document.addEventListener("keydown", trapModalFocus); confirm.focus(); function trapModalFocus(event) { if (event.key === "Escape") close(); if (event.key !== "Tab") return; const focusable = [$("modalClose"), cancel, confirm]; const current = focusable.indexOf(document.activeElement); const next = event.shiftKey ? (current <= 0 ? focusable.length - 1 : current - 1) : (current === focusable.length - 1 ? 0 : current + 1); event.preventDefault(); focusable[next].focus(); } }
async function copy(value) { try { await navigator.clipboard.writeText(value); showToast("Copied to clipboard."); } catch { showToast("Copy was unavailable in this browser.", true); } }

function eventDescription(event) { const name = event.event; const args = event.args || {}; const address = args.wallet || args.from || args.beneficiary || args.newExecutor || ""; const amount = args.amount ? `${ethers.utils.formatEther(args.amount)} ETH` : ""; return { PlanCreated: "Plan created", BeneficiaryAdded: `Beneficiary added · ${shortAddress(address)}`, BeneficiaryRemoved: `Beneficiary removed · ${shortAddress(address)}`, AssetsDeposited: `Deposit received · ${amount}`, ExecutorUpdated: `Executor updated · ${shortAddress(address)}`, TimelockDurationUpdated: `Timelock duration updated · ${formatDuration(args.oldDuration)} → ${formatDuration(args.newDuration)}`, InheritanceInitiated: "Verification initiated · timelock started", InheritanceCancelled: "Inheritance cancelled", AssetsDistributed: `Distribution executed · ${amount}`, PlanExecuted: "Distribution executed", DocumentReferenceSet: "Document reference updated", CancelledAssetsWithdrawn: `Cancelled assets recovered · ${amount}`, PlanReset: "Plan reset" }[name] || name; }
function renderActivity() { const target = $("activityList"), recent = $("recentActivity"); const content = state.events.length ? state.events.slice(0, state.page === "activity" ? 50 : 4).map(event => `<div class="activity-item"><span class="activity-marker">${event.event === "PlanExecuted" ? "✓" : "•"}</span><div><strong>${escapeHtml(eventDescription(event))}</strong><small>Block ${event.blockNumber} · ${escapeHtml(formatDate(event.blockTimestamp))} · <button class="text-button" data-copy="${event.transactionHash}">Copy transaction</button></small></div><time>${escapeHtml(formatDate(event.blockTimestamp))}</time></div>`).join("") : `<div class="empty-state">No confirmed activity found for this deployment.</div>`; if (target) target.innerHTML = content; if (recent) recent.innerHTML = state.events.length ? state.events.slice(0, 4).map(event => `<div class="activity-item"><span class="activity-marker">•</span><div><strong>${escapeHtml(eventDescription(event))}</strong><small>${escapeHtml(formatDate(event.blockTimestamp))}</small></div><time>On-chain</time></div>`).join("") : `<div class="empty-state">No confirmed activity found for this deployment.</div>`; qa("[data-copy]").forEach(button => button.addEventListener("click", () => copy(button.dataset.copy))); }

let lastBlockchainSync = 0;
function renderLiveCountdown() {
  if (!state.snapshot || state.snapshot.status !== 1) return;
  const text = countdown(state.snapshot.unlockTimestamp);
  setText("countdown", text);
  setText("distributionCountdown", text);
}
function setupTimelockForm() {
  const form = $("timelockForm");
  if (!form) return;
  const select = $("timelockSelect");
  const customWrap = $("customTimelockWrap");
  const submit = form.querySelector('button[type="submit"]');
  if (submit) submit.id = "timelockSubmit";
  select.addEventListener("change", () => { customWrap.classList.toggle("hidden", select.value !== "custom"); setFieldError("timelockError", ""); });
  form.addEventListener("submit", event => { event.preventDefault(); const result = validateTimelockDays(); setFieldError("timelockError", result.error); if (result.error) return; const displayDuration = result.seconds === 30 ? "30 seconds" : `${result.days} day${result.days === 1 ? "" : "s"}`; confirmAction("Update timelock duration", `Set the plan timelock to ${displayDuration}?`, () => transact("Updating timelock duration", () => service.setTimelockDuration(result.seconds))); });
}

function setupForms() {
  $("connectBtn").addEventListener("click", () => connect(true)); $("reconnectBtn").addEventListener("click", () => connect(true)); $("refreshBtn").addEventListener("click", refreshAll); $("activityRefresh").addEventListener("click", refreshEvents); qa("[data-copy-target]").forEach(button => button.addEventListener("click", () => copy($(button.dataset.copyTarget).textContent)));
  $("contractForm").addEventListener("submit", event => { event.preventDefault(); setFieldError("contractError", ""); try { loadContract(normalizeAddress(ethers, $("contractInput").value)); } catch (error) { setFieldError("contractError", readableError(error)); } });
  $("showBeneficiaryForm").addEventListener("click", () => $("beneficiaryFormWrap").classList.remove("hidden")); ["closeBeneficiaryForm", "cancelBeneficiaryForm"].forEach(id => $(id).addEventListener("click", () => $("beneficiaryFormWrap").classList.add("hidden")));
  $("beneficiaryForm").addEventListener("submit", event => { event.preventDefault(); const values = validateBeneficiary(); if (!values) return; const label = $("beneficiaryLabel").value.trim(); confirmAction("Add beneficiary", `Register ${shortAddress(values.address)} with a ${values.bps / 100}% allocation.`, () => transact("Adding beneficiary", async () => { if (label) { state.labels[values.address.toLowerCase()] = label; saveLabels(); } return service.addBeneficiary(values.address, values.bps); }, () => { $("beneficiaryAddress").value = ""; $("beneficiaryLabel").value = ""; $("beneficiaryShare").value = ""; $("beneficiaryAddress").focus(); })); });
  $("depositForm").addEventListener("submit", event => { event.preventDefault(); setFieldError("depositError", ""); const amount = $("depositInput").value.trim(); try { const value = ethers.utils.parseEther(amount); if (value.lte(0)) throw new Error("Amount must be greater than zero."); transact("Depositing protected assets", () => service.depositAssets(value)); } catch (error) { setFieldError("depositError", error.message.includes("invalid") ? "Enter a valid ETH amount." : error.message); } });
  $("executorForm").addEventListener("submit", event => { event.preventDefault(); setFieldError("executorError", ""); try { const address = normalizeAddress(ethers, $("executorInput").value); if (address.toLowerCase() === state.snapshot.owner.toLowerCase()) throw new Error("The owner cannot also be the trusted executor."); confirmAction("Change trusted executor", `Set ${shortAddress(address)} as the new executor?`, () => transact("Changing trusted executor", () => service.setExecutor(address))); } catch (error) { setFieldError("executorError", readableError(error)); } });
  $("documentForm").addEventListener("submit", event => { event.preventDefault(); const value = $("documentInput").value.trim(); confirmAction("Update document reference", value ? "Store this reference on-chain? The document itself is never stored here." : "Clear the document reference on-chain?", () => transact("Updating document reference", () => service.setDocumentReference(value))); });
  $("initiateBtn").addEventListener("click", () => confirmAction("Initiate verification", "Only proceed after the required real-world condition has been verified off-chain. This starts the timelock.", () => transact("Initiating verification", () => service.initiateInheritance())));
  $("cancelBtn").addEventListener("click", () => confirmAction("Cancel inheritance", "This permanently marks the current plan as cancelled. Continue?", () => transact("Cancelling inheritance", () => service.cancelInheritance())));
  $("executeBtn").addEventListener("click", () => confirmAction("Execute distribution", "The contract will distribute the protected assets according to the registered percentages. Continue?", () => transact("Executing distribution", () => service.executeInheritance(), handleExecutionConfirmed)));
  $("issueCertificatesBtn").addEventListener("click", () => issueCertificates());
  $("withdrawCancelledBtn").addEventListener("click", () => confirmAction("Recover cancelled assets", "Recover the remaining contract balance to the plan owner before resetting this cycle?", () => transact("Recovering cancelled assets", () => service.withdrawCancelledAssets())));
  $("resetPlanBtn").addEventListener("click", () => confirmAction("Reset plan", "Clear this completed cycle and prepare the plan for new beneficiaries and deposits?", () => transact("Resetting plan", () => service.resetPlan())));
}

function init() { $("contractInput").value = getSavedAddress(); ensureActionHints(); const verificationEyebrow = q('[data-view="verification"] .verification-banner .eyebrow'); if (verificationEyebrow) verificationEyebrow.textContent = "OFF-CHAIN VERIFICATION"; const verificationStart = q('[data-view="verification"] .timeline.compact .timeline-item:first-child'); if (verificationStart) { verificationStart.querySelector("strong").textContent = "Awaiting executor initiation"; verificationStart.querySelector("small").textContent = "No verification transaction has been submitted"; verificationStart.classList.remove("complete"); } setupTheme(); setupNavigation(); setupForms(); if (window.ethereum) { window.ethereum.on("accountsChanged", accounts => { if (!accounts.length) { state.account = ""; state.signer = null; clearLoadedPlan(); updateConnection(); showToast("Wallet disconnected."); return; } const next = ethers.utils.getAddress(accounts[0]); if (state.account.toLowerCase() !== next.toLowerCase() && state.provider) { state.account = next; state.signer = state.provider.getSigner(next); service.setSigner(state.signer); updateConnection(); if (state.snapshot) renderPermissions(); showToast(`Connected account changed to ${shortAddress(next)}.`); } connect(false); }); window.ethereum.on("chainChanged", () => { clearLoadedPlan(); connect(false); }); connect(false); } else setNotice("MetaMask was not detected. You can inspect the interface, but blockchain actions require a wallet.", true); setInterval(async () => { if (state.snapshot?.status === 1) { try { await refreshBlockchainClock(); applyLifecycleState(); } catch { setNotice("Unable to refresh the blockchain clock.", true); } } }, 1000); }
setupTimelockForm();

/* HEIRLOOM_LIVE_COUNTDOWN_V1 */
setInterval(async () => {
  if (state.snapshot?.status !== 1) return;

  renderLiveCountdown();
  applyLifecycleState();

  const now = Date.now();

  if (now - lastBlockchainSync >= 10000) {
    lastBlockchainSync = now;

    try {
      await refreshBlockchainClock();
      renderLiveCountdown();
      applyLifecycleState();
    } catch {
      setNotice("Unable to refresh the blockchain clock.", true);
    }
  }
}, 1000);

init();

