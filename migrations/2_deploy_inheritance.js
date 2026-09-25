const DigitalInheritance = artifacts.require("DigitalInheritance");

module.exports = function (deployer, network, accounts) {
  const executor =
    network === "sepolia"
      ? process.env.EXECUTOR_ADDRESS
      : accounts[1];

  const timelockDurationSeconds = 60 * 60 * 24 * 30; // 30 days

  if (!executor) {
    throw new Error("Executor address is not configured.");
  }

  deployer.deploy(
    DigitalInheritance,
    executor,
    timelockDurationSeconds
  );
};