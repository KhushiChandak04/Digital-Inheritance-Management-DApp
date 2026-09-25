export const DEFAULT_CONTRACT_ADDRESS = "0x58887563f42aA1252702b600aeAE58B0a6F0f7DB";
export const CONTRACT_STORAGE_KEY = "inheritance.contractAddress.v3";

export const EXPECTED_CHAIN_IDS = [1337, 5777, 11155111];
export const EXPECTED_NETWORK_LABEL = "Sepolia";
export const SEPOLIA_CHAIN_ID = 11155111;
export const SEPOLIA_NETWORK_LABEL = "Sepolia";

export const EXPLORER_BASE_URL = "https://sepolia.etherscan.io";

export const NETWORK_CONFIG = {
  local: {
    label: "Ganache local",
    chainId: 1337,
    rpcUrl: "http://127.0.0.1:7545",
  },
  sepolia: {
    label: "Sepolia",
    chainId: 11155111,
    rpcUrl: "https://ethereum-sepolia-rpc.publicnode.com",
  },
};
