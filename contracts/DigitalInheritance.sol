// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title Digital Inheritance Management Prototype
/// @notice Academic prototype demonstrating programmable, timelocked
///         distribution of digital assets to predefined beneficiaries.
/// @dev    This contract does NOT determine whether a person has died.
///         It relies on an authorized executor (or, in the extended
///         version, a set of verifiers) to attest that the real-world
///         condition for inheritance has been satisfied. This is a
///         deliberate design choice made to address the blockchain
///         "oracle problem" honestly rather than pretend it can be
///         solved on-chain.
contract DigitalInheritance {

    // ---------------------------------------------------------------
    // Types
    // ---------------------------------------------------------------

    enum PlanStatus {
        ACTIVE,               // plan created, funded, and awaiting a trigger
        VERIFICATION_PENDING, // executor has initiated inheritance, timelock running
        EXECUTED,             // assets have been distributed
        CANCELLED              // owner cancelled the plan
    }

    struct Beneficiary {
        address wallet;
        uint256 percentageBasisPoints; // 1% = 100 bps, so 100% = 10000
    }

    // ---------------------------------------------------------------
    // State
    // ---------------------------------------------------------------

    address public owner;
    address public executor;

    Beneficiary[] private beneficiaries;

    uint256 public totalDeposited;
    uint256 public timelockDuration;      // seconds
    uint256 public activationTimestamp;   // when executor triggered inheritance
    uint256 public unlockTimestamp;       // activationTimestamp + timelockDuration
    uint256 public creationTimestamp;

    PlanStatus public status;

    // optional: hash/CID of an encrypted off-chain document (e.g. IPFS)
    string public documentReference;

    uint256 private constant BASIS_POINTS_TOTAL = 10000;

    // ---------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------

    event PlanCreated(address indexed owner, address indexed executor, uint256 timelockDuration);
    event BeneficiaryAdded(address indexed wallet, uint256 percentageBasisPoints);
    event BeneficiaryRemoved(address indexed wallet);
    event AssetsDeposited(address indexed from, uint256 amount);
    event ExecutorUpdated(address indexed newExecutor);
    event InheritanceInitiated(address indexed executor, uint256 activationTimestamp, uint256 unlockTimestamp);
    event InheritanceCancelled(uint256 timestamp);
    event AssetsDistributed(address indexed beneficiary, uint256 amount);
    event PlanExecuted(uint256 timestamp);
    event DocumentReferenceSet(string cidOrHash);

    // ---------------------------------------------------------------
    // Modifiers
    // ---------------------------------------------------------------

    modifier onlyOwner() {
        require(msg.sender == owner, "Caller is not the owner");
        _;
    }

    modifier onlyExecutor() {
        require(msg.sender == executor, "Caller is not the executor");
        _;
    }

    modifier inStatus(PlanStatus expected) {
        require(status == expected, "Invalid plan status for this action");
        _;
    }

    // ---------------------------------------------------------------
    // Constructor
    // ---------------------------------------------------------------

    /// @param _executor Address authorized to initiate the inheritance process.
    /// @param _timelockDuration Waiting period, in seconds, between initiation
    ///        and the earliest possible distribution (e.g. 30 days = 2592000).
    constructor(address _executor, uint256 _timelockDuration) {
        require(_executor != address(0), "Executor cannot be zero address");
        require(_timelockDuration > 0, "Timelock must be greater than zero");

        owner = msg.sender;
        executor = _executor;
        timelockDuration = _timelockDuration;
        creationTimestamp = block.timestamp;
        status = PlanStatus.ACTIVE;

        emit PlanCreated(owner, executor, timelockDuration);
    }

    // ---------------------------------------------------------------
    // Owner: plan configuration
    // ---------------------------------------------------------------

    /// @notice Adds a beneficiary. Total allocation across all beneficiaries
    ///         must equal exactly 100% (10000 basis points) before assets
    ///         can be distributed. This is checked at distribution time,
    ///         not at add time, so beneficiaries can be added incrementally.
    function addBeneficiary(address wallet, uint256 percentageBasisPoints)
        external
        onlyOwner
        inStatus(PlanStatus.ACTIVE)
    {
        require(wallet != address(0), "Beneficiary cannot be zero address");
        require(percentageBasisPoints > 0, "Percentage must be greater than zero");
        require(_totalAllocatedBasisPoints() + percentageBasisPoints <= BASIS_POINTS_TOTAL,
            "Total allocation would exceed 100%");

        beneficiaries.push(Beneficiary(wallet, percentageBasisPoints));
        emit BeneficiaryAdded(wallet, percentageBasisPoints);
    }

    /// @notice Removes a beneficiary by index. Only allowed while the plan
    ///         is still ACTIVE (i.e. before the executor has triggered
    ///         inheritance).
    function removeBeneficiary(uint256 index)
        external
        onlyOwner
        inStatus(PlanStatus.ACTIVE)
    {
        require(index < beneficiaries.length, "Index out of range");
        address removed = beneficiaries[index].wallet;

        beneficiaries[index] = beneficiaries[beneficiaries.length - 1];
        beneficiaries.pop();

        emit BeneficiaryRemoved(removed);
    }

    /// @notice Updates the percentage allocated to an existing beneficiary.
    function updateBeneficiaryShare(uint256 index, uint256 newPercentageBasisPoints)
        external
        onlyOwner
        inStatus(PlanStatus.ACTIVE)
    {
        require(index < beneficiaries.length, "Index out of range");
        require(newPercentageBasisPoints > 0, "Percentage must be greater than zero");

        uint256 currentTotal = _totalAllocatedBasisPoints();
        uint256 withoutThisEntry = currentTotal - beneficiaries[index].percentageBasisPoints;

        require(withoutThisEntry + newPercentageBasisPoints <= BASIS_POINTS_TOTAL,
            "Total allocation would exceed 100%");

        beneficiaries[index].percentageBasisPoints = newPercentageBasisPoints;
    }

    /// @notice Reassigns the executor address. Only while the plan is ACTIVE.
    function setExecutor(address newExecutor)
        external
        onlyOwner
        inStatus(PlanStatus.ACTIVE)
    {
        require(newExecutor != address(0), "Executor cannot be zero address");
        executor = newExecutor;
        emit ExecutorUpdated(newExecutor);
    }

    /// @notice Stores a reference (e.g. an IPFS CID or a document hash) to an
    ///         encrypted off-chain document. The document itself is never
    ///         stored on-chain, only a pointer/fingerprint for integrity
    ///         verification.
    function setDocumentReference(string calldata cidOrHash)
        external
        onlyOwner
        inStatus(PlanStatus.ACTIVE)
    {
        documentReference = cidOrHash;
        emit DocumentReferenceSet(cidOrHash);
    }

    // ---------------------------------------------------------------
    // Owner: funding
    // ---------------------------------------------------------------

    /// @notice Deposits native ETH into the contract to be distributed
    ///         according to the beneficiary percentages once inheritance
    ///         is executed.
    function depositAssets() external payable onlyOwner inStatus(PlanStatus.ACTIVE) {
        require(msg.value > 0, "Deposit must be greater than zero");
        totalDeposited += msg.value;
        emit AssetsDeposited(msg.sender, msg.value);
    }

    // Allow the owner to top up via plain transfers as well.
    receive() external payable {
        require(msg.sender == owner, "Only owner may deposit");
        require(status == PlanStatus.ACTIVE, "Plan is not active");
        totalDeposited += msg.value;
        emit AssetsDeposited(msg.sender, msg.value);
    }

    // ---------------------------------------------------------------
    // Executor: triggering inheritance
    // ---------------------------------------------------------------

    /// @notice Called by the executor once they have verified, through an
    ///         off-chain process, that the real-world condition required
    ///         for inheritance (e.g. confirmed death of the owner) has
    ///         been satisfied. This does not distribute assets immediately;
    ///         it starts the timelock.
    function initiateInheritance() external onlyExecutor inStatus(PlanStatus.ACTIVE) {
        require(_totalAllocatedBasisPoints() == BASIS_POINTS_TOTAL,
            "Beneficiary allocations must total exactly 100% before initiation");
        require(totalDeposited > 0, "No assets deposited");

        status = PlanStatus.VERIFICATION_PENDING;
        activationTimestamp = block.timestamp;
        unlockTimestamp = block.timestamp + timelockDuration;

        emit InheritanceInitiated(msg.sender, activationTimestamp, unlockTimestamp);
    }

    // ---------------------------------------------------------------
    // Owner: emergency cancellation
    // ---------------------------------------------------------------

    /// @notice Allows the owner to cancel an in-progress inheritance during
    ///         the timelock window, for example if the executor triggered
    ///         it incorrectly and the owner is, in fact, still able to act.
    function cancelInheritance() external onlyOwner inStatus(PlanStatus.VERIFICATION_PENDING) {
        status = PlanStatus.CANCELLED;
        emit InheritanceCancelled(block.timestamp);
    }

    // ---------------------------------------------------------------
    // Distribution
    // ---------------------------------------------------------------

    /// @notice Executes the distribution once the timelock has elapsed.
    ///         Callable by anyone (executor or a beneficiary) so that the
    ///         process does not depend on a single party remaining online;
    ///         the amounts are already fixed by the beneficiary percentages,
    ///         so the caller has no discretion over the outcome.
    function executeInheritance() external inStatus(PlanStatus.VERIFICATION_PENDING) {
        require(block.timestamp >= unlockTimestamp, "Timelock has not yet elapsed");

        // Effects before interactions to mitigate reentrancy.
        status = PlanStatus.EXECUTED;
        uint256 pool = totalDeposited;
        totalDeposited = 0;

        for (uint256 i = 0; i < beneficiaries.length; i++) {
            uint256 amount = (pool * beneficiaries[i].percentageBasisPoints) / BASIS_POINTS_TOTAL;
            if (amount > 0) {
                (bool sent, ) = payable(beneficiaries[i].wallet).call{value: amount}("");
                require(sent, "Transfer to beneficiary failed");
                emit AssetsDistributed(beneficiaries[i].wallet, amount);
            }
        }

        emit PlanExecuted(block.timestamp);
    }

    // ---------------------------------------------------------------
    // View helpers
    // ---------------------------------------------------------------

    function getBeneficiaries() external view returns (Beneficiary[] memory) {
        return beneficiaries;
    }

    function getBeneficiaryCount() external view returns (uint256) {
        return beneficiaries.length;
    }

    function getInheritanceStatus() external view returns (PlanStatus) {
        return status;
    }

    function getUnlockTime() external view returns (uint256) {
        return unlockTimestamp;
    }

    function _totalAllocatedBasisPoints() internal view returns (uint256 total) {
        for (uint256 i = 0; i < beneficiaries.length; i++) {
            total += beneficiaries[i].percentageBasisPoints;
        }
    }
}
