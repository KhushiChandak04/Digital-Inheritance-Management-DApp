const HeirloomInheritanceCertificate = artifacts.require("HeirloomInheritanceCertificate");
const DigitalInheritance = artifacts.require("DigitalInheritance");

module.exports = async function (deployer, network, accounts) {
  const inheritance = await DigitalInheritance.deployed();
  const initialMinter = accounts[0];

  await deployer.deploy(
    HeirloomInheritanceCertificate,
    inheritance.address,
    initialMinter
  );

  const certificate = await HeirloomInheritanceCertificate.deployed();

  console.log(`Existing DigitalInheritance address: ${inheritance.address}`);
  console.log(`New HeirloomInheritanceCertificate address: ${certificate.address}`);
  console.log(`Initial certificate minter: ${initialMinter}`);
};
