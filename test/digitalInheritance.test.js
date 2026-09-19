const DigitalInheritance = artifacts.require("DigitalInheritance");
const { expectEvent, expectRevert, time } = require("@openzeppelin/test-helpers");

contract("DigitalInheritance", (accounts) => {
  const [owner, executor, beneficiaryA, beneficiaryB, beneficiaryC, stranger] = accounts;
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
  });
});
