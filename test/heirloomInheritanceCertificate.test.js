const HeirloomInheritanceCertificate = artifacts.require("HeirloomInheritanceCertificate");
const { expectEvent, expectRevert } = require("@openzeppelin/test-helpers");

contract("HeirloomInheritanceCertificate", (accounts) => {
  const [owner, minter, beneficiaryA, beneficiaryB, stranger, sourceContract] = accounts;
  const EXECUTION_TIMESTAMP = 1700000000;
  const CYCLE_ONE = web3.utils.soliditySha3("cycle-one");
  const CYCLE_TWO = web3.utils.soliditySha3("cycle-two");
  const URI_ONE = "ipfs://heirloom-certificate-one";
  const URI_TWO = "ipfs://heirloom-certificate-two";

  let certificate;

  beforeEach(async () => {
    certificate = await HeirloomInheritanceCertificate.new(sourceContract, minter, { from: owner });
  });

  it("deploys with the source contract and initial minter", async () => {
    assert.equal(await certificate.sourceInheritanceContract(), sourceContract);
    assert.equal(await certificate.minter(), minter);
    assert.equal(await certificate.name(), "Heirloom Inheritance Certificate");
    assert.equal(await certificate.symbol(), "HIC");
    assert.equal((await certificate.certificateCount()).toString(), "0");
  });

  it("mints the first certificate to the beneficiary with stored details", async () => {
    const result = await certificate.mintCertificate(
      beneficiaryA,
      4000,
      EXECUTION_TIMESTAMP,
      CYCLE_ONE,
      URI_ONE,
      { from: minter }
    );

    expectEvent(result, "CertificateMinted", {
      tokenId: "1",
      beneficiary: beneficiaryA,
      allocationBasisPoints: "4000",
      executionTimestamp: EXECUTION_TIMESTAMP.toString(),
      cycleReference: CYCLE_ONE,
    });
    assert.equal(await certificate.ownerOf(1), beneficiaryA);
    assert.equal((await certificate.certificateCount()).toString(), "1");
    assert.equal(await certificate.tokenURI(1), URI_ONE);

    const details = await certificate.certificateDetails(1);
    assert.equal(details.beneficiary, beneficiaryA);
    assert.equal(details.allocationBasisPoints.toString(), "4000");
    assert.equal(details.executionTimestamp.toString(), EXECUTION_TIMESTAMP.toString());
    assert.equal(details.cycleReference, CYCLE_ONE);
  });

  it("increments token IDs and supports multiple beneficiaries", async () => {
    await certificate.mintCertificate(beneficiaryA, 4000, EXECUTION_TIMESTAMP, CYCLE_ONE, URI_ONE, { from: minter });
    await certificate.mintCertificate(beneficiaryB, 6000, EXECUTION_TIMESTAMP, CYCLE_TWO, URI_TWO, { from: minter });

    assert.equal(await certificate.ownerOf(1), beneficiaryA);
    assert.equal(await certificate.ownerOf(2), beneficiaryB);
    assert.equal(await certificate.tokenURI(2), URI_TWO);
    assert.equal((await certificate.certificateCount()).toString(), "2");
  });

  it("rejects unauthorized minting", async () => {
    await expectRevert(
      certificate.mintCertificate(beneficiaryA, 4000, EXECUTION_TIMESTAMP, CYCLE_ONE, URI_ONE, { from: stranger }),
      "Caller is not the authorized minter"
    );
  });

  it("rejects invalid certificate inputs", async () => {
    await expectRevert(
      certificate.mintCertificate("0x0000000000000000000000000000000000000000", 4000, EXECUTION_TIMESTAMP, CYCLE_ONE, URI_ONE, { from: minter }),
      "Beneficiary cannot be zero address"
    );
    await expectRevert(
      certificate.mintCertificate(beneficiaryA, 0, EXECUTION_TIMESTAMP, CYCLE_ONE, URI_ONE, { from: minter }),
      "Allocation must be greater than zero"
    );
    await expectRevert(
      certificate.mintCertificate(beneficiaryA, 10001, EXECUTION_TIMESTAMP, CYCLE_ONE, URI_ONE, { from: minter }),
      "Allocation cannot exceed 10000 basis points"
    );
    await expectRevert(
      certificate.mintCertificate(beneficiaryA, 4000, 0, CYCLE_ONE, URI_ONE, { from: minter }),
      "Execution timestamp must be greater than zero"
    );
    await expectRevert(
      certificate.mintCertificate(beneficiaryA, 4000, EXECUTION_TIMESTAMP, web3.utils.padLeft("0x0", 64), URI_ONE, { from: minter }),
      "Cycle reference cannot be zero"
    );
    await expectRevert(
      certificate.mintCertificate(beneficiaryA, 4000, EXECUTION_TIMESTAMP, CYCLE_ONE, "", { from: minter }),
      "Metadata URI cannot be empty"
    );
  });

  it("rejects duplicate cycle references", async () => {
    await certificate.mintCertificate(beneficiaryA, 4000, EXECUTION_TIMESTAMP, CYCLE_ONE, URI_ONE, { from: minter });

    await expectRevert(
      certificate.mintCertificate(beneficiaryB, 6000, EXECUTION_TIMESTAMP, CYCLE_ONE, URI_TWO, { from: minter }),
      "Cycle reference already used"
    );
  });

  it("allows the owner to change the minter", async () => {
    const result = await certificate.setMinter(beneficiaryB, { from: owner });

    expectEvent(result, "MinterUpdated", {
      previousMinter: minter,
      newMinter: beneficiaryB,
    });
    assert.equal(await certificate.minter(), beneficiaryB);
  });

  it("rejects unauthorized and zero-address minter changes", async () => {
    await expectRevert(
      certificate.setMinter(beneficiaryB, { from: stranger }),
      "Ownable: caller is not the owner"
    );
    await expectRevert(
      certificate.setMinter("0x0000000000000000000000000000000000000000", { from: owner }),
      "Minter cannot be zero address"
    );
  });
});