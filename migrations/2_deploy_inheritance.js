const DigitalInheritance = artifacts.require("DigitalInheritance");

module.exports = function (deployer, network, accounts) {
  // Example deployment values for local testing on Ganache.
  // accounts[1] is used as a placeholder executor address.
  const executor = accounts[1];
  const timelockDurationSeconds = 60 * 60 * 24 * 30; // 30 days

  deployer.deploy(DigitalInheritance, executor, timelockDurationSeconds);
};
