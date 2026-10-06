export const DEFAULT_CONTRACT_ADDRESS = "0xB369c5987d6661913171D3d9Ef6d0af96B64A7aE";
export const CERTIFICATE_CONTRACT_ADDRESS = "0x1770AD82A518341A4160EF4661A04ecBe509eAfb";
export const CERTIFICATE_ISSUER_ADDRESS = "0x6C167AF4652BeAfE98D1505E00bf56bd737dc2ef";
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
