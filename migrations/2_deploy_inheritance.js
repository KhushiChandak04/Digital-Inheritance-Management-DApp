const DigitalInheritance = artifacts.require("DigitalInheritance");

module.exports = function (deployer, network, accounts) {
  // Local development deployment values for Ganache testing.
  const executor = accounts[1];
  const timelockDurationSeconds = 60 * 60 * 24 * 30; // 30 days

  deployer.deploy(DigitalInheritance, executor, timelockDurationSeconds);
};
