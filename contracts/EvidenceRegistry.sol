//SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract EvidenceRegistry{

    struct Evidence{
        string evidenceHash;
        string caseId;
        string uploaderId;
        uint256 timestamp;
    }
    mapping(string => Evidence) private evidenceStore;

    uint256 public evidenceCount;

    event EvidenceRegistered(
        string evidenceId,
        string evidenceHash,
        string caseId,
        string uploaderId,
        uint256 timestamp
    );

    function registerEvidence(
        string memory evidenceId,
        string memory evidenceHash,
        string memory caseId,
        string memory uploaderId
    ) public{
        require(bytes(evidenceStore[evidenceId].evidenceHash).length == 0, "Evidence already exists");

        evidenceStore[evidenceId] = Evidence(
            evidenceHash,
            caseId,
            uploaderId,
            block.timestamp
        );

        evidenceCount++; 

        emit EvidenceRegistered(
            evidenceId,
            evidenceHash,
            caseId,
            uploaderId,
            block.timestamp
        );
    }

    function getEvidence(string memory evidenceId) public view returns(Evidence memory)
    {
        require(bytes(evidenceStore[evidenceId].evidenceHash).length != 0, "Evidence not found");
        return evidenceStore[evidenceId];
    }

}
