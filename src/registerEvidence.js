const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const {ethers} = require("ethers");

const BASE_DIR = path.join(__dirname, "..");
const RECORDS_DIR = path.join(BASE_DIR, "data", "records");

const CONTRACT_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
const RPC_URL = "http://127.0.0.1:8545";

const ABI = [
  "function registerEvidence(string evidenceId,string evidenceHash,string caseId,string uploaderId)",
  "function getEvidence(string evidenceId) view returns (tuple(string evidenceHash,string caseId,string uploaderId,uint256 timestamp))"
];

//connecting to bc
const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
const signer = provider.getSigner(0);
const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);

async function registerEvidence(evidenceId){
  const recordPath = path.join(RECORDS_DIR, `${evidenceId}.json`);

  if(!fs.existsSync(recordPath)){
    throw new Error("Evidence record not found");
  }

  const record = JSON.parse(fs.readFileSync(recordPath));

  if(!fs.existsSync(record.storagePath)){
    throw new Error("Stored evidence file missing");
  }

  //read evidence & hash
  const fileData = fs.readFileSync(record.storagePath);
  const hash = crypto.createHash("sha256").update(fileData).digest("hex");

  //blockchain write
  const tx = await contract.registerEvidence(
    record.evidenceId,
    hash,
    record.caseId,
    record.uploaderId
  );

  const receipt = await tx.wait();

  //update record after success
  record.hashSHA256 = hash;
  record.blockNumber = receipt.blockNumber;
  record.status = "REGISTERED";
  record.registeredAt = new Date().toISOString();

  fs.writeFileSync(recordPath, JSON.stringify(record, null, 2));

  return{
    evidenceId: record.evidenceId,
    hashSHA256: hash,
    blockNumber: receipt.blockNumber
  };
}

module.exports = { registerEvidence };
