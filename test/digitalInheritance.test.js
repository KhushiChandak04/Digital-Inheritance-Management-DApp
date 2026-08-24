const DigitalInheritance = artifacts.require("DigitalInheritance");
const { expectRevert, time } = require("@openzeppelin/test-helpers");

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
