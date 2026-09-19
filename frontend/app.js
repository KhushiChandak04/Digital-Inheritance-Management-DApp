import { ContractService, STATUS_NAMES, getSavedAddress, normalizeAddress, readableError } from "./contract-service.js";
import { EXPECTED_CHAIN_IDS, EXPECTED_NETWORK_LABEL, EXPLORER_BASE_URL } from "./config.js";

const { ethers } = window;
const service = new ContractService(ethers);
const state = { provider: null, signer: null, account: "", chainId: null, networkOk: false, snapshot: null, events: [], page: "dashboard", loading: false, labels: JSON.parse(localStorage.getItem("inheritance.labels") || "{}") };
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
function setupTheme() {
  const saved = localStorage.getItem("inheritance.theme") || "dark";
  applyTheme(saved);
  $("themeToggle").addEventListener("click", () => applyTheme(document.documentElement.dataset.theme === "light" ? "dark" : "light"));
}
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem("inheritance.theme", theme);
  setText("themeIcon", theme === "light" ? "☾" : "☼");
  setText("themeLabel", theme === "light" ? "Dark mode" : "Light mode");
  $("themeToggle")?.setAttribute("aria-label", `Switch to ${theme === "light" ? "dark" : "light"} theme`);
}

function setupNavigation() {
  qa("[data-page]").forEach(button => button.addEventListener("click", () => navigate(button.dataset.page)));
  qa("[data-go]").forEach(button => button.addEventListener("click", () => navigate(button.dataset.go)));
  $("menuBtn").addEventListener("click", () => $("sidebar").classList.toggle("open"));
  $("primaryAction").addEventListener("click", () => navigate(isOwner() ? "beneficiaries" : "verification"));
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
    state.provider = new ethers.providers.Web3Provider(window.ethereum, "any");
    const accounts = await state.provider.send(request ? "eth_requestAccounts" : "eth_accounts", []);
    if (!accounts.length) { state.account = ""; updateConnection(); return; }
    state.signer = state.provider.getSigner(accounts[0]);
    state.account = ethers.utils.getAddress(accounts[0]);
    const network = await state.provider.getNetwork(); state.chainId = Number(network.chainId); state.networkOk = EXPECTED_CHAIN_IDS.includes(state.chainId);
    service.setProvider(state.provider); service.setSigner(state.signer);
    updateConnection();
    if (state.networkOk) await loadContract(getSavedAddress()); else showWrongNetwork();
  } catch (error) { const message = readableError(error); setNotice(message, true); showToast(message, true); }
}
function updateConnection() { setText("walletLabel", state.account ? shortAddress(state.account) : "Connect wallet"); setText("networkLabel", state.networkOk ? EXPECTED_NETWORK_LABEL : state.chainId ? `Chain ${state.chainId}` : "Network unavailable"); $("networkChip").classList.toggle("wrong", !state.networkOk); setText("roleValue", getRole()); setText("roleHint", state.account ? "Permissions update with your wallet" : "Connect to see permissions"); }
function showWrongNetwork() { $("wrongNetwork").classList.remove("hidden"); }
function hideWrongNetwork() { $("wrongNetwork").classList.add("hidden"); }
function clearLoadedPlan() {
  state.snapshot = null;
  state.events = [];
  ["heroStatus", "balanceValue", "assetPageBalance", "beneficiaryCount", "allocationValue", "executorShort", "distributionDate", "detailOwner", "planOwner", "planExecutor", "verificationExecutor"].forEach(id => setText(id, "—"));
  setText("statusPill", "NOT LOADED");
  setText("planStatusPill", "—");
  setText("verificationStatus", "—");
  setText("nextAction", "Load a deployed contract to begin.");
  setText("recentActivity", "");
  setText("contractLoadState", "No deployment loaded");
  $("beneficiaryRows").innerHTML = `<tr><td colspan="5"><div class="empty-state">No contract loaded.</div></td></tr>`;
}

async function loadContract(address) {
  clearLoadedPlan();
  try { service.setAddress(address); $("contractInput").value = service.address; await refreshAll(true); setText("contractLoadState", `Loaded ${shortAddress(service.address)}`); hideWrongNetwork(); setNotice("Plan loaded. Reads are synchronized with the selected deployment."); setTimeout(() => setNotice(""), 3500); }
  catch (error) { setFieldError("contractError", readableError(error)); showToast(readableError(error), true); }
}
async function refreshAll(throwOnError = false) {
  if (!service.contract) return;
  try { state.snapshot = await service.readSnapshot(); await refreshEvents(); render(); } catch (error) { clearLoadedPlan(); setNotice(`Unable to read the plan: ${readableError(error)}`, true); if (throwOnError) throw error; }
}
async function refreshEvents() { try { state.events = await service.getEvents(); renderActivity(); } catch (error) { if (state.page === "activity") showToast(`Activity unavailable: ${readableError(error)}`, true); } }

function render() {
  const data = state.snapshot; if (!data) return;
  const status = STATUS_NAMES[data.status]; const totalBps = data.beneficiaries.reduce((sum, item) => sum + Number(item.percentageBasisPoints), 0); const allocated = bpsToPercent(totalBps); const remaining = Math.max(0, 100 - allocated); const balance = ethers.utils.formatEther(data.totalDeposited);
  setText("heroStatus", status === "VERIFICATION_PENDING" ? "Inheritance pending" : status === "ACTIVE" ? "Plan active" : status === "EXECUTED" ? "Plan executed" : "Plan cancelled"); setText("statusPill", status.replace("_", " ")); setText("planStatusPill", status.replace("_", " ")); setText("verificationStatus", status.replace("_", " ")); ["statusPill", "planStatusPill", "verificationStatus"].forEach(id => { const node = $(id); node.className = `status-pill ${status.toLowerCase().replace("_", "-")}`; });
  setText("balanceValue", balance); setText("assetPageBalance", balance); setText("beneficiaryCount", data.beneficiaries.length); setText("allocationValue", `${allocated.toFixed(2)}%`); setText("allocatedText", `${allocated.toFixed(2)}%`); setText("remainingText", `${remaining.toFixed(2)}%`); setText("allocationRemaining", `${remaining.toFixed(2)}% remaining`); setText("allocationBig", `${allocated.toFixed(0)}%`); setText("allocationHeadline", allocated === 100 ? "Allocation complete" : "Build your distribution"); setText("allocationMessage", allocated === 100 ? "Allocation complete — 100%. This plan is ready for verification." : `${remaining.toFixed(2)}% remains available for allocation.`); $("allocationBar").style.width = `${Math.min(100, allocated)}%`; $("allocationBarLarge").style.width = `${Math.min(100, allocated)}%`; $("allocationRing").style.background = `conic-gradient(var(--teal) ${allocated * 3.6}deg, #25343d 0deg)`;
  if (state.provider) state.provider.getBalance(data.owner).then(value => setText("ownerWalletBalance", `${Number(ethers.utils.formatEther(value)).toFixed(4)} ETH`)).catch(() => setText("ownerWalletBalance", "Unavailable"));
  setText("executorShort", shortAddress(data.executor)); setText("executorState", isExecutor() ? "You are the trusted executor" : "Authorized verification party"); setText("distributionDate", data.unlockTimestamp > 0 ? formatDateShort(data.unlockTimestamp) : "Not scheduled"); setText("distributionCountdown", data.status === 1 ? countdown(data.unlockTimestamp) : "No active timelock"); setText("nextAction", nextAction(status, allocated)); setText("timelockSummary", data.status === 1 ? `Unlocks ${formatDate(data.unlockTimestamp)}` : "No timelock active");
  setText("detailContract", service.address); setText("detailOwner", data.owner); setText("detailNetwork", `${EXPECTED_NETWORK_LABEL} (${state.chainId || "—"})`); setText("detailCreated", formatDate(data.creationTimestamp)); setText("planOwner", shortAddress(data.owner)); setText("planExecutor", shortAddress(data.executor)); setText("planTimelock", formatDuration(data.timelockDuration)); setText("planCreated", formatDate(data.creationTimestamp)); setText("planActivated", data.activationTimestamp > 0 ? formatDate(data.activationTimestamp) : "Not started"); setText("planUnlocked", data.unlockTimestamp > 0 ? formatDate(data.unlockTimestamp) : "Not scheduled"); setText("verificationExecutor", shortAddress(data.executor)); setText("verificationText", status === "ACTIVE" ? "Ready for authorized initiation." : status === "VERIFICATION_PENDING" ? "Timelock is running." : "No initiation available."); setText("verificationEligibility", isExecutor() && status === "ACTIVE" ? "Eligible" : status === "ACTIVE" ? "Executor only" : "Unavailable"); setText("activationDate", data.activationTimestamp ? formatDate(data.activationTimestamp) : "—"); setText("unlockDate", data.unlockTimestamp ? formatDate(data.unlockTimestamp) : "—"); setText("timelockTitle", data.status === 1 ? "Inheritance pending" : "No active timelock"); setText("documentValue", data.documentReference || "Not configured"); $("documentInput").value = data.documentReference || "";
  const progress = data.status === 1 ? Math.min(100, Math.max(0, (Date.now() / 1000 - Number(data.activationTimestamp)) / (Number(data.unlockTimestamp) - Number(data.activationTimestamp)) * 100)) : data.status > 1 ? 100 : 0; setText("countdown", data.status === 1 ? countdown(data.unlockTimestamp) : "—"); $("timelockProgress").classList.toggle("complete", progress >= 100); renderBeneficiaries(); renderPermissions(); renderLabels();
}
function nextAction(status, allocated) { if (!state.account) return "Connect a wallet to begin."; if (status === "ACTIVE" && isOwner() && allocated < 100) return `Add ${ (100 - allocated).toFixed(2)}% to complete allocation.`; if (status === "ACTIVE" && isExecutor()) return "Review the off-chain condition, then initiate verification."; if (status === "VERIFICATION_PENDING") return "Review the timelock before distribution."; if (status === "EXECUTED") return "Distribution has been completed."; if (status === "CANCELLED") return "This plan was cancelled."; return "Review the plan details."; }
function formatDuration(seconds) { const days = Math.floor(Number(seconds) / 86400); return days ? `${days} days` : `${Math.floor(Number(seconds) / 3600)} hours`; }
function countdown(unlock) { const diff = Number(unlock) - Math.floor(Date.now() / 1000); if (diff <= 0) return "Ready to distribute"; const days = Math.floor(diff / 86400), hours = Math.floor(diff % 86400 / 3600), minutes = Math.floor(diff % 3600 / 60); return `${days}d ${hours}h ${minutes}m`; }

function renderPermissions() { const owner = isOwner(), executor = isExecutor(), publicCanExecute = state.snapshot?.status === 1; qa(".owner-action").forEach(node => node.classList.toggle("hidden", !owner)); qa(".executor-action").forEach(node => node.classList.toggle("hidden", !executor)); qa(".public-action").forEach(node => node.classList.toggle("hidden", !publicCanExecute)); setText("ownerOnlyLabel", owner ? "You are the plan owner" : "Owner access required"); }
function renderBeneficiaries() { const data = state.snapshot; if (!data) return; const balance = Number(ethers.utils.formatEther(data.totalDeposited)); $("beneficiaryRows").innerHTML = data.beneficiaries.length ? data.beneficiaries.map((item, index) => { const percent = bpsToPercent(item.percentageBasisPoints); return `<tr><td><div class="recipient"><span class="recipient-mark">${(labelFor(item.wallet)[0] || "R").toUpperCase()}</span><div><strong>${escapeHtml(labelFor(item.wallet))}</strong><code>${shortAddress(item.wallet)} <button class="copy-button" data-copy="${item.wallet}" title="Copy address">⧉</button></code></div></div></td><td class="share">${percent.toFixed(2)}%</td><td class="amount">${(balance * percent / 100).toFixed(4)} ETH</td><td><span class="status-pill active">REGISTERED</span></td><td><div class="table-actions owner-action"><button class="table-action" data-edit="${index}">Edit</button><button class="table-action danger" data-remove="${index}">Remove</button></div></td></tr>`; }).join("") : `<tr><td colspan="5"><div class="empty-state">No beneficiaries registered yet. Add the first recipient to begin.</div></td></tr>`; setText("beneficiaryTableHint", `${data.beneficiaries.length} registered`); qa("[data-copy]").forEach(button => button.addEventListener("click", () => copy(button.dataset.copy))); qa("[data-remove]").forEach(button => button.addEventListener("click", () => confirmAction("Remove beneficiary", "This removes the recipient from the plan. The change requires an owner transaction.", () => transact("Removing beneficiary", () => service.removeBeneficiary(button.dataset.remove))))); qa("[data-edit]").forEach(button => button.addEventListener("click", () => editShare(Number(button.dataset.edit)))); }
function renderLabels() { const target = $("labelSettings"); if (!state.snapshot || !state.snapshot.beneficiaries.length) { target.innerHTML = `<div class="empty-state">Beneficiaries will appear here after they are registered.</div>`; return; } target.innerHTML = state.snapshot.beneficiaries.map(item => `<label class="label-setting"><code>${shortAddress(item.wallet)}</code><input data-label="${item.wallet}" value="${escapeHtml(labelFor(item.wallet) === "Unnamed recipient" ? "" : labelFor(item.wallet))}" placeholder="Local display name" /></label>`).join(""); qa("[data-label]").forEach(input => input.addEventListener("change", () => { const value = input.value.trim(); if (value) state.labels[input.dataset.label.toLowerCase()] = value; else delete state.labels[input.dataset.label.toLowerCase()]; saveLabels(); renderBeneficiaries(); })); }
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[character])); }

function validateBeneficiary() { const addressValue = $("beneficiaryAddress").value.trim(), shareValue = $("beneficiaryShare").value.trim(); let valid = true; ["beneficiaryAddressError", "beneficiaryShareError", "beneficiaryLabelError"].forEach(id => setFieldError(id, "")); let address; try { address = normalizeAddress(ethers, addressValue); } catch { setFieldError("beneficiaryAddressError", "Enter a valid Ethereum address, including 0x."); valid = false; } const share = Number(shareValue); if (!shareValue || !Number.isFinite(share) || share <= 0 || share > 100) { setFieldError("beneficiaryShareError", "Enter a percentage greater than 0 and no more than 100."); valid = false; } const snapshot = state.snapshot; if (address && snapshot) { if (address.toLowerCase() === snapshot.owner.toLowerCase()) { setFieldError("beneficiaryAddressError", "The plan owner cannot be a beneficiary."); valid = false; } else if (address.toLowerCase() === snapshot.executor.toLowerCase()) { setFieldError("beneficiaryAddressError", "The trusted executor cannot be a beneficiary."); valid = false; } else if (snapshot.beneficiaries.some(item => item.wallet.toLowerCase() === address.toLowerCase())) { setFieldError("beneficiaryAddressError", "This beneficiary is already registered."); valid = false; } const allocated = snapshot.beneficiaries.reduce((sum, item) => sum + Number(item.percentageBasisPoints), 0) / 100; if (allocated + share > 100) { setFieldError("beneficiaryShareError", `Only ${(100 - allocated).toFixed(2)}% remains available.`); valid = false; } } return valid ? { address, bps: Math.round(share * 100) } : null; }
function editShare(index) { const current = bpsToPercent(state.snapshot.beneficiaries[index].percentageBasisPoints); const value = window.prompt(`New allocation percentage (current ${current}%):`, current); if (value === null) return; const share = Number(value); const without = state.snapshot.beneficiaries.reduce((sum, item, itemIndex) => sum + (itemIndex === index ? 0 : Number(item.percentageBasisPoints)), 0) / 100; if (!Number.isFinite(share) || share <= 0 || share > 100 || without + share > 100) { showToast(`Enter a valid share. Maximum available is ${(100 - without).toFixed(2)}%.`, true); return; } confirmAction("Update allocation", `Change this beneficiary's share to ${share}%.`, () => transact("Updating beneficiary share", () => service.updateBeneficiary(index, Math.round(share * 100)))); }

async function transact(label, action) { if (!state.signer || !service.contract) { showToast("Connect a wallet and load a contract first.", true); return; } state.loading = true; document.body.classList.add("transaction-busy"); setNotice(`${label}: wallet confirmation requested.`); try { const tx = await action(); setNotice(`${label}: transaction submitted. Waiting for confirmation…`); showToast(`${label} submitted: ${shortAddress(tx.hash)}`); await tx.wait(); setNotice(`${label}: confirmed.`); showToast(`${label} confirmed.`); await refreshAll(); setTimeout(() => setNotice(""), 3200); } catch (error) { const message = readableError(error); setNotice(`${label} failed: ${message}`, true); showToast(message, true); } finally { state.loading = false; document.body.classList.remove("transaction-busy"); } }
function confirmAction(title, text, action) { $("modalTitle").textContent = title; $("modalText").textContent = text; $("confirmModal").classList.remove("hidden"); const confirm = $("modalConfirm"); const close = () => $("confirmModal").classList.add("hidden"); confirm.onclick = () => { close(); action(); }; $("modalCancel").onclick = close; $("modalClose").onclick = close; }
async function copy(value) { try { await navigator.clipboard.writeText(value); showToast("Copied to clipboard."); } catch { showToast("Copy was unavailable in this browser.", true); } }

function eventDescription(event) { const name = event.event; const args = event.args || {}; const address = args.wallet || args.from || args.beneficiary || args.newExecutor || ""; const amount = args.amount ? `${ethers.utils.formatEther(args.amount)} ETH` : ""; return { PlanCreated: "Plan created", BeneficiaryAdded: `Beneficiary added · ${shortAddress(address)}`, BeneficiaryRemoved: `Beneficiary removed · ${shortAddress(address)}`, AssetsDeposited: `Protected assets deposited · ${amount}`, ExecutorUpdated: `Trusted executor changed · ${shortAddress(address)}`, InheritanceInitiated: "Verification initiated · timelock started", InheritanceCancelled: "Pending inheritance cancelled", AssetsDistributed: `Assets distributed · ${amount}`, PlanExecuted: "Plan executed · distribution complete", DocumentReferenceSet: "Document reference updated" }[name] || name; }
function renderActivity() { const target = $("activityList"), recent = $("recentActivity"); const content = state.events.length ? state.events.slice(0, state.page === "activity" ? 50 : 4).map(event => `<div class="activity-item"><span class="activity-marker">${event.event === "PlanExecuted" ? "✓" : "•"}</span><div><strong>${escapeHtml(eventDescription(event))}</strong><small>Block ${event.blockNumber} · <button class="text-button" data-copy="${event.transactionHash}">Copy transaction</button></small></div><time>${escapeHtml(new Date().toLocaleDateString())}</time></div>`).join("") : `<div class="empty-state">No confirmed events found for this deployment.</div>`; if (target) target.innerHTML = content; if (recent) recent.innerHTML = state.events.length ? state.events.slice(0, 4).map(event => `<div class="activity-item"><span class="activity-marker">•</span><div><strong>${escapeHtml(eventDescription(event))}</strong><small>Block ${event.blockNumber}</small></div><time>On-chain</time></div>`).join("") : `<div class="empty-state">Connect a wallet and load the plan to see activity.</div>`; qa("[data-copy]").forEach(button => button.addEventListener("click", () => copy(button.dataset.copy))); }

function setupForms() {
  $("connectBtn").addEventListener("click", () => connect(true)); $("reconnectBtn").addEventListener("click", () => connect(true)); $("refreshBtn").addEventListener("click", refreshAll); $("activityRefresh").addEventListener("click", refreshEvents); qa("[data-copy-target]").forEach(button => button.addEventListener("click", () => copy($(button.dataset.copyTarget).textContent)));
  $("contractForm").addEventListener("submit", event => { event.preventDefault(); setFieldError("contractError", ""); try { loadContract(normalizeAddress(ethers, $("contractInput").value)); } catch (error) { setFieldError("contractError", readableError(error)); } });
  $("showBeneficiaryForm").addEventListener("click", () => $("beneficiaryFormWrap").classList.remove("hidden")); ["closeBeneficiaryForm", "cancelBeneficiaryForm"].forEach(id => $(id).addEventListener("click", () => $("beneficiaryFormWrap").classList.add("hidden")));
  $("beneficiaryForm").addEventListener("submit", event => { event.preventDefault(); const values = validateBeneficiary(); if (!values) return; const label = $("beneficiaryLabel").value.trim(); confirmAction("Add beneficiary", `Register ${shortAddress(values.address)} with a ${values.bps / 100}% allocation.`, () => transact("Adding beneficiary", async () => { if (label) { state.labels[values.address.toLowerCase()] = label; saveLabels(); } return service.addBeneficiary(values.address, values.bps); })); });
  $("depositForm").addEventListener("submit", event => { event.preventDefault(); setFieldError("depositError", ""); const amount = $("depositInput").value.trim(); try { const value = ethers.utils.parseEther(amount); if (value.lte(0)) throw new Error("Amount must be greater than zero."); transact("Depositing protected assets", () => service.depositAssets(value)); } catch (error) { setFieldError("depositError", error.message.includes("invalid") ? "Enter a valid ETH amount." : error.message); } });
  $("executorForm").addEventListener("submit", event => { event.preventDefault(); setFieldError("executorError", ""); try { const address = normalizeAddress(ethers, $("executorInput").value); if (address.toLowerCase() === state.snapshot.owner.toLowerCase()) throw new Error("The owner cannot also be the trusted executor."); confirmAction("Change trusted executor", `Set ${shortAddress(address)} as the new executor?`, () => transact("Changing trusted executor", () => service.setExecutor(address))); } catch (error) { setFieldError("executorError", readableError(error)); } });
  $("documentForm").addEventListener("submit", event => { event.preventDefault(); const value = $("documentInput").value.trim(); confirmAction("Update document reference", value ? "Store this reference on-chain? The document itself is never stored here." : "Clear the document reference on-chain?", () => transact("Updating document reference", () => service.setDocumentReference(value))); });
  $("initiateBtn").addEventListener("click", () => confirmAction("Initiate verification", "Only proceed after the required real-world condition has been verified off-chain. This starts the timelock.", () => transact("Initiating verification", () => service.initiateInheritance())));
  $("cancelBtn").addEventListener("click", () => confirmAction("Cancel inheritance", "This permanently marks the current plan as cancelled. Continue?", () => transact("Cancelling inheritance", () => service.cancelInheritance())));
  $("executeBtn").addEventListener("click", () => confirmAction("Execute distribution", "The contract will distribute the protected assets according to the registered percentages. Continue?", () => transact("Executing distribution", () => service.executeInheritance())));
}

function init() { $("contractInput").value = getSavedAddress(); setupTheme(); setupNavigation(); setupForms(); if (window.ethereum) { window.ethereum.on("accountsChanged", accounts => { if (!accounts.length) { state.account = ""; state.signer = null; clearLoadedPlan(); updateConnection(); showToast("Wallet disconnected."); } else connect(false); }); window.ethereum.on("chainChanged", () => { clearLoadedPlan(); connect(false); }); connect(false); } else setNotice("MetaMask was not detected. You can inspect the interface, but blockchain actions require a wallet.", true); setInterval(() => { if (state.snapshot?.status === 1) { setText("countdown", countdown(state.snapshot.unlockTimestamp)); setText("distributionCountdown", countdown(state.snapshot.unlockTimestamp)); } }, 30000); }
init();
