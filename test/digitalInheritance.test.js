const DigitalInheritance = artifacts.require("DigitalInheritance");
const { expectEvent, expectRevert, time } = require("@openzeppelin/test-helpers");

contract("DigitalInheritance", (accounts) => {
  const [owner, executor, beneficiaryA, beneficiaryB, beneficiaryC, stranger] = accounts;
  const DAY = 60 * 60 * 24;
  const THIRTY_DAYS = 60 * 60 * 24 * 30;

  let contract;

  beforeEach(async () => {
    contract = await DigitalInheritance.new(executor, THIRTY_DAYS, { from: owner });
  });

  it("sets owner and executor correctly on deployment", async () => {
    assert.equal(await contract.owner(), owner);
    assert.equal(await contract.executor(), executor);
  });

  it("allows the owner to add beneficiaries totalling 100%", async () => {
    await contract.addBeneficiary(beneficiaryA, 4000, { from: owner }); // 40%
    await contract.addBeneficiary(beneficiaryB, 3500, { from: owner }); // 35%
    await contract.addBeneficiary(beneficiaryC, 2500, { from: owner }); // 25%

    const list = await contract.getBeneficiaries();
    assert.equal(list.length, 3);
  });

  it("rejects allocations that exceed 100%", async () => {
    await contract.addBeneficiary(beneficiaryA, 9000, { from: owner });
    await expectRevert(
      contract.addBeneficiary(beneficiaryB, 2000, { from: owner }),
      "Total allocation would exceed 100%"
    );
  });

  it("prevents non-owners from adding beneficiaries", async () => {
    await expectRevert(
      contract.addBeneficiary(beneficiaryA, 5000, { from: stranger }),
      "Caller is not the owner"
    );
  });

  it("rejects duplicate beneficiaries", async () => {
    await contract.addBeneficiary(beneficiaryA, 4000, { from: owner });

    await expectRevert(
      contract.addBeneficiary(beneficiaryA, 1000, { from: owner }),
      "Beneficiary already exists"
    );
  });

  it("rejects the owner and executor as beneficiaries", async () => {
    await expectRevert(
      contract.addBeneficiary(owner, 1000, { from: owner }),
      "Owner cannot be a beneficiary"
    );

    await expectRevert(
      contract.addBeneficiary(executor, 1000, { from: owner }),
      "Executor cannot be a beneficiary"
    );
  });

  it("rejects assigning the executor role to the owner", async () => {
    await expectRevert(
      contract.setExecutor(owner, { from: owner }),
      "Executor cannot be the owner"
    );
  });

  it("rejects assigning the executor role to an existing beneficiary", async () => {
    await contract.addBeneficiary(beneficiaryA, 4000, { from: owner });

    await expectRevert(
      contract.setExecutor(beneficiaryA, { from: owner }),
      "Executor cannot be a beneficiary"
    );
  });

  it("prevents an existing beneficiary from becoming executor after assignment", async () => {
    await contract.addBeneficiary(beneficiaryA, 4000, { from: owner });
    await contract.setExecutor(beneficiaryB, { from: owner });

    await expectRevert(
      contract.setExecutor(beneficiaryA, { from: owner }),
      "Executor cannot be a beneficiary"
    );
  });

  it("allows the owner to update the timelock while ACTIVE and emits an event", async () => {
    const result = await contract.setTimelockDuration(7 * DAY, { from: owner });

    expectEvent(result, "TimelockDurationUpdated", {
      oldDuration: THIRTY_DAYS.toString(),
      newDuration: (7 * DAY).toString(),
    });
    assert.equal((await contract.timelockDuration()).toString(), (7 * DAY).toString());
  });

  it("rejects unauthorized and zero-duration timelock updates", async () => {
    await expectRevert(
      contract.setTimelockDuration(7 * DAY, { from: stranger }),
      "Caller is not the owner"
    );
    await expectRevert(
      contract.setTimelockDuration(0, { from: owner }),
      "Timelock must be greater than zero"
    );
  });

  it("emits BeneficiaryShareUpdated when a share changes", async () => {
    await contract.addBeneficiary(beneficiaryA, 4000, { from: owner });

    const result = await contract.updateBeneficiaryShare(0, 4500, { from: owner });

    expectEvent(result, "BeneficiaryShareUpdated", {
      wallet: beneficiaryA,
      oldPercentageBasisPoints: "4000",
      newPercentageBasisPoints: "4500",
    });
  });

  it("preserves allocation rules when updating a beneficiary share", async () => {
    await contract.addBeneficiary(beneficiaryA, 4000, { from: owner });
    await contract.addBeneficiary(beneficiaryB, 5000, { from: owner });

    await expectRevert(
      contract.updateBeneficiaryShare(0, 5001, { from: owner }),
      "Total allocation would exceed 100%"
    );

    await contract.updateBeneficiaryShare(0, 5000, { from: owner });
    const list = await contract.getBeneficiaries();
    assert.equal(list[0].percentageBasisPoints.toString(), "5000");
    assert.equal(list[1].percentageBasisPoints.toString(), "5000");
  });

  it("keeps owner configuration locked after inheritance starts", async () => {
    await contract.addBeneficiary(beneficiaryA, 10000, { from: owner });
    await contract.depositAssets({ from: owner, value: web3.utils.toWei("1", "ether") });
    await contract.initiateInheritance({ from: executor });

    await expectRevert(
      contract.setExecutor(beneficiaryB, { from: owner }),
      "Invalid plan status for this action"
    );
    await expectRevert(
      contract.updateBeneficiaryShare(0, 9000, { from: owner }),
      "Invalid plan status for this action"
    );
    await expectRevert(
      contract.setTimelockDuration(7 * DAY, { from: owner }),
      "Invalid plan status for this action"
    );
  });

  it("only lets the executor initiate inheritance, and only once fully funded and allocated", async () => {
    await contract.addBeneficiary(beneficiaryA, 5000, { from: owner });
    await contract.addBeneficiary(beneficiaryB, 5000, { from: owner });

    await expectRevert(
      contract.initiateInheritance({ from: executor }),
      "No assets deposited"
    );

    await contract.depositAssets({ from: owner, value: web3.utils.toWei("1", "ether") });

    await expectRevert(
      contract.initiateInheritance({ from: stranger }),
      "Caller is not the executor"
    );

    await contract.initiateInheritance({ from: executor });
    assert.equal((await contract.getInheritanceStatus()).toString(), "1"); // VERIFICATION_PENDING
  });

  it("blocks distribution before the timelock elapses, and allows it after", async () => {
    await contract.addBeneficiary(beneficiaryA, 6000, { from: owner });
    await contract.addBeneficiary(beneficiaryB, 4000, { from: owner });
    await contract.depositAssets({ from: owner, value: web3.utils.toWei("10", "ether") });
    await contract.initiateInheritance({ from: executor });

    await expectRevert(
      contract.executeInheritance({ from: stranger }),
      "Timelock has not yet elapsed"
    );

    await time.increase(THIRTY_DAYS + 1);

    const balBefore = web3.utils.toBN(await web3.eth.getBalance(beneficiaryA));
    await contract.executeInheritance({ from: stranger });
    const balAfter = web3.utils.toBN(await web3.eth.getBalance(beneficiaryA));

    assert.isTrue(balAfter.gt(balBefore));
    assert.equal((await contract.getInheritanceStatus()).toString(), "2"); // EXECUTED
  });

  it("uses a selected 7-day duration for the unlock timestamp", async () => {
    await contract.setTimelockDuration(7 * DAY, { from: owner });
    await contract.addBeneficiary(beneficiaryA, 10000, { from: owner });
    await contract.depositAssets({ from: owner, value: web3.utils.toWei("1", "ether") });

    const result = await contract.initiateInheritance({ from: executor });
    const initiated = result.logs.find(log => log.event === "InheritanceInitiated");

    assert.equal(initiated.args.unlockTimestamp.toString(), (Number(initiated.args.activationTimestamp) + 7 * DAY).toString());
    assert.equal((await contract.timelockDuration()).toString(), (7 * DAY).toString());
  });

  it("uses a selected 90-day duration for the unlock timestamp", async () => {
    await contract.setTimelockDuration(90 * DAY, { from: owner });
    await contract.addBeneficiary(beneficiaryA, 10000, { from: owner });
    await contract.depositAssets({ from: owner, value: web3.utils.toWei("1", "ether") });

    const result = await contract.initiateInheritance({ from: executor });
    const initiated = result.logs.find(log => log.event === "InheritanceInitiated");

    assert.equal(initiated.args.unlockTimestamp.toString(), (Number(initiated.args.activationTimestamp) + 90 * DAY).toString());
  });

  it("allows the owner to cancel during the timelock window", async () => {
    await contract.addBeneficiary(beneficiaryA, 10000, { from: owner });
    await contract.depositAssets({ from: owner, value: web3.utils.toWei("1", "ether") });
    await contract.initiateInheritance({ from: executor });

    await contract.cancelInheritance({ from: owner });
    assert.equal((await contract.getInheritanceStatus()).toString(), "3"); // CANCELLED

    await expectRevert(
      contract.executeInheritance({ from: stranger }),
      "Invalid plan status for this action"
    );
    await expectRevert(
      contract.setTimelockDuration(7 * DAY, { from: owner }),
      "Invalid plan status for this action"
    );
  });

  it("does not allow timelock changes after execution", async () => {
    await contract.addBeneficiary(beneficiaryA, 10000, { from: owner });
    await contract.depositAssets({ from: owner, value: web3.utils.toWei("1", "ether") });
    await contract.initiateInheritance({ from: executor });
    await time.increase(THIRTY_DAYS + 1);
    await contract.executeInheritance({ from: stranger });

    await expectRevert(
      contract.setTimelockDuration(7 * DAY, { from: owner }),
      "Invalid plan status for this action"
    );
  });

  it("resets an executed cycle and allows a second cycle", async () => {
    await contract.addBeneficiary(beneficiaryA, 10000, { from: owner });
    await contract.setDocumentReference("ipfs://cycle-one", { from: owner });
    await contract.depositAssets({ from: owner, value: web3.utils.toWei("1", "ether") });
    await contract.initiateInheritance({ from: executor });
    await time.increase(THIRTY_DAYS + 1);
    await contract.executeInheritance({ from: stranger });

    const reset = await contract.resetPlan({ from: owner });
    expectEvent(reset, "PlanReset");
    assert.equal((await contract.getInheritanceStatus()).toString(), "0");
    assert.equal((await contract.getBeneficiaries()).length, 0);
    assert.equal((await contract.totalDeposited()).toString(), "0");
    assert.equal((await contract.activationTimestamp()).toString(), "0");
    assert.equal((await contract.unlockTimestamp()).toString(), "0");
    assert.equal(await contract.documentReference(), "");
    assert.equal((await contract.timelockDuration()).toString(), THIRTY_DAYS.toString());
    assert.equal(await contract.owner(), owner);
    assert.equal(await contract.executor(), executor);

    await contract.addBeneficiary(beneficiaryB, 10000, { from: owner });
    await contract.depositAssets({ from: owner, value: web3.utils.toWei("1", "ether") });
    await contract.initiateInheritance({ from: executor });
    assert.equal((await contract.getInheritanceStatus()).toString(), "1");
    assert.equal((await contract.getBeneficiaries()).length, 1);
  });

  it("recovers cancelled assets before resetting the cycle", async () => {
    const amount = web3.utils.toWei("1", "ether");
    await contract.addBeneficiary(beneficiaryA, 10000, { from: owner });
    await contract.depositAssets({ from: owner, value: amount });
    await contract.initiateInheritance({ from: executor });
    await contract.cancelInheritance({ from: owner });

    const withdrawal = await contract.withdrawCancelledAssets({ from: owner });
    expectEvent(withdrawal, "CancelledAssetsWithdrawn", { owner, amount });
    assert.equal((await web3.eth.getBalance(contract.address)).toString(), "0");
    assert.equal((await contract.totalDeposited()).toString(), "0");

    await contract.resetPlan({ from: owner });
    assert.equal((await contract.getInheritanceStatus()).toString(), "0");
    assert.equal((await contract.getBeneficiaries()).length, 0);

    await contract.addBeneficiary(beneficiaryB, 10000, { from: owner });
    await contract.depositAssets({ from: owner, value: amount });
    await contract.initiateInheritance({ from: executor });
    assert.equal((await contract.getInheritanceStatus()).toString(), "1");
  });

  it("rejects reset from ACTIVE and VERIFICATION_PENDING", async () => {
    await expectRevert(
      contract.resetPlan({ from: owner }),
      "Plan must be executed or cancelled"
    );

    await contract.addBeneficiary(beneficiaryA, 10000, { from: owner });
    await contract.depositAssets({ from: owner, value: web3.utils.toWei("1", "ether") });
    await contract.initiateInheritance({ from: executor });

    await expectRevert(
      contract.resetPlan({ from: owner }),
      "Plan must be executed or cancelled"
    );
  });

  it("rejects reset while cancelled funds remain", async () => {
    await contract.addBeneficiary(beneficiaryA, 10000, { from: owner });
    await contract.depositAssets({ from: owner, value: web3.utils.toWei("1", "ether") });
    await contract.initiateInheritance({ from: executor });
    await contract.cancelInheritance({ from: owner });

    await expectRevert(
      contract.resetPlan({ from: owner }),
      "Contract balance must be zero"
    );
  });

  it("restricts cancelled-asset recovery to the owner and cancelled state", async () => {
    await expectRevert(
      contract.withdrawCancelledAssets({ from: owner }),
      "Invalid plan status for this action"
    );
    await expectRevert(
      contract.withdrawCancelledAssets({ from: stranger }),
      "Caller is not the owner"
    );

    await contract.addBeneficiary(beneficiaryA, 10000, { from: owner });
    await contract.depositAssets({ from: owner, value: web3.utils.toWei("1", "ether") });
    await contract.initiateInheritance({ from: executor });
    await expectRevert(
      contract.withdrawCancelledAssets({ from: owner }),
      "Invalid plan status for this action"
    );

    await contract.cancelInheritance({ from: owner });
    await contract.withdrawCancelledAssets({ from: owner });
    await expectRevert(
      contract.withdrawCancelledAssets({ from: owner }),
      "No cancelled assets to withdraw"
    );
  });

  it("preserves configuration and clears all cycle state on reset", async () => {
    await contract.setTimelockDuration(7 * DAY, { from: owner });
    await contract.addBeneficiary(beneficiaryA, 10000, { from: owner });
    await contract.setDocumentReference("cycle-document", { from: owner });
    await contract.depositAssets({ from: owner, value: web3.utils.toWei("1", "ether") });
    await contract.initiateInheritance({ from: executor });
    await time.increase(7 * DAY + 1);
    await contract.executeInheritance({ from: stranger });

    await contract.resetPlan({ from: owner });
    assert.equal((await contract.getInheritanceStatus()).toString(), "0");
    assert.equal((await contract.totalDeposited()).toString(), "0");
    assert.equal((await contract.activationTimestamp()).toString(), "0");
    assert.equal((await contract.unlockTimestamp()).toString(), "0");
    assert.equal((await contract.getBeneficiaryCount()).toString(), "0");
    assert.equal(await contract.documentReference(), "");
    assert.equal(await contract.owner(), owner);
    assert.equal(await contract.executor(), executor);
    assert.equal((await contract.timelockDuration()).toString(), (7 * DAY).toString());
  });
});
