async function main(){
  const hre = require("hardhat");

  const EvidenceRegistry = await hre.ethers.getContractFactory("EvidenceRegistry");
  const contract = await EvidenceRegistry.deploy();
  await contract.deployed();

  console.log("Deployed to:",contract.address);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
