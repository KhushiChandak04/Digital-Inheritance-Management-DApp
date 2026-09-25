export const DEFAULT_CONTRACT_ADDRESS = "0x3A3561F6b60f34677Ff7f5bC7111797D94324166";
export const CONTRACT_STORAGE_KEY = "inheritance.contractAddress.v2";
export const EXPECTED_CHAIN_IDS = [1337, 5777, 11155111];
export const EXPECTED_NETWORK_LABEL = "Ganache local";
export const SEPOLIA_CHAIN_ID = 11155111;
export const SEPOLIA_NETWORK_LABEL = "Sepolia";
export const EXPLORER_BASE_URL = "";

export const NETWORK_CONFIG = {
  local: {
    label: "Ganache local",
    chainId: 1337,
    rpcUrl: "http://127.0.0.1:7545",
  },
  sepolia: {
    label: "Sepolia",
    chainId: 11155111,
    rpcUrl: "https://sepolia.gateway.tenderly.co",
  },
};
