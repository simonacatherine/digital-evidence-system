async function main() {
  const hre = require("hardhat");

  const CONTRACT_ADDRESS = "0x610178dA211FEF7D417bC0e6FeD39F05609AD788";
  const EVIDENCE_ID = "21c31e83-349e-4347-9867-8e9366a5dfe0";

  const contract = await hre.ethers.getContractAt(
    "EvidenceRegistry",
    CONTRACT_ADDRESS
  );

  const evidence = await contract.getEvidence(EVIDENCE_ID);
  //console.log(evidence);
  console.log({
    evidenceHash: evidence.evidenceHash,
    caseId: evidence.caseId,
    uploaderId: evidence.uploaderId,
    timestamp: evidence.timestamp.toString()
  });

}

main().catch(console.error);
