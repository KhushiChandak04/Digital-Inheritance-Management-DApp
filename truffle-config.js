module.exports = {
  networks: {
    development: {
      host: "127.0.0.1",
      port: 7545,       // default Ganache GUI port; use 8545 for ganache-cli
      network_id: "*",
    },
  },

  mocha: {
    // timeout: 100000
  },

  compilers: {
    solc: {
      version: "0.8.20",
      settings: {
        optimizer: {
          enabled: true,
          runs: 200,
        },
      },
    },
  },
};
