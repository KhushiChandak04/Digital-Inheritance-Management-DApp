const fs = require("fs");
const Web3 = require("web3");

const sourceAddress = "0xB369c5987d6661913171D3d9Ef6d0af96B64A7aE";
const certificateAddress = "0x1770AD82A518341A4160EF4661A04ecBe509eAfb";
const expectedOwner = "0x6C167AF4652BeAfE98D1505E00bf56bd737dc2ef";
const expectedExecutor = "0x2C3A3A49D318EFE12770eBC7B3047B2838Fd8577";
const beneficiaries = [
  "0x326Ab6A316BF69Bcb482353f052D47701b94C9b6",
  "0xa222B0DFe37E3653557ceb0A01d867A6622cDc37",
  "0x1e16693d40e564CB589AFa12Fb02a982672385a2",
];

const web3 = new Web3();
const rpc = fs.readFileSync("frontend/config.js", "utf8").match(/sepolia:\s*\{[\s\S]*?rpcUrl:\s*"([^"]+)"/)[1];

async function rpcCall(method, params) {
  const response = await fetch(rpc, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const result = await response.json();
  if (result.error) throw new Error(result.error.message);
  return result.result;
}

async function read(address, signature, outputType, argument) {
  const selector = web3.utils.sha3(signature).slice(0, 10);
  const encodedArgument = argument ? argument.slice(2).padStart(64, "0") : "";
  const raw = await rpcCall("eth_call", [{ to: address, data: selector + encodedArgument }, "latest"]);
  return web3.eth.abi.decodeParameter(outputType, raw);
}

async function main() {
  const [chainId, sourceCode, certificateCode, name, symbol, certificateOwner, issuer, source, count, owner, executor, ...balances] = await Promise.all([
    rpcCall("eth_chainId", []).then(value => parseInt(value, 16)),
    rpcCall("eth_getCode", [sourceAddress, "latest"]),
    rpcCall("eth_getCode", [certificateAddress, "latest"]),
    read(certificateAddress, "name()", "string"),
    read(certificateAddress, "symbol()", "string"),
    read(certificateAddress, "owner()", "address"),
    read(certificateAddress, "minter()", "address"),
    read(certificateAddress, "sourceInheritanceContract()", "address"),
    read(certificateAddress, "certificateCount()", "uint256"),
    read(sourceAddress, "owner()", "address"),
    read(sourceAddress, "executor()", "address"),
    ...beneficiaries.map(beneficiary => read(certificateAddress, "balanceOf(address)", "uint256", beneficiary)),
  ]);

  const config = fs.readFileSync("frontend/config.js", "utf8");
  const service = fs.readFileSync("frontend/contract-service.js", "utf8");
  const checks = {
    chainId: chainId === 11155111,
    sourceCode: sourceCode !== "0x",
    certificateCode: certificateCode !== "0x",
    certificateName: name === "Heirloom Inheritance Certificate",
    certificateSymbol: symbol === "HIC",
    certificateOwner: certificateOwner.toLowerCase() === expectedOwner.toLowerCase(),
    certificateIssuer: issuer.toLowerCase() === expectedOwner.toLowerCase(),
    certificateSource: source.toLowerCase() === sourceAddress.toLowerCase(),
    inheritanceOwner: owner.toLowerCase() === expectedOwner.toLowerCase(),
    inheritanceExecutor: executor.toLowerCase() === expectedExecutor.toLowerCase(),
    frontendCertificateAddress: config.includes(certificateAddress),
    frontendSourceAddress: config.includes(sourceAddress),
    frontendIssuerAddress: config.includes(expectedOwner),
    frontendCertificateAbi: ["name()", "symbol()", "owner()", "minter()", "sourceInheritanceContract()", "certificateCount()", "balanceOf(address)", "tokenURI(uint256)", "mintCertificate(address beneficiary,uint256 allocationBasisPoints,uint256 executionTimestamp,bytes32 cycleReference,string metadataURI)"].every(signature => service.includes(signature)),
  };

  console.log(JSON.stringify({ checks, values: { chainId, name, symbol, certificateOwner, issuer, source, count, owner, executor, beneficiaryBalances: Object.fromEntries(beneficiaries.map((beneficiary, index) => [beneficiary, balances[index]])) } }, null, 2));
  if (Object.values(checks).some(value => !value)) process.exitCode = 1;
}

main().catch(error => {
  console.error(`Read-only Sepolia smoke test failed: ${error.message}`);
  process.exitCode = 1;
});