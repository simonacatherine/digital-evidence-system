async function main() {
  const hre = require("hardhat");

  const CONTRACT_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
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
