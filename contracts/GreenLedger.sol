// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract GreenLedger {
    struct ESGReport {
        string company;
        uint256 greenScore;
        string grade;
        uint256 timestamp;
        address submitter;
    }

    mapping(bytes32 => ESGReport) public reports;
    bytes32[] public allHashes;

    event ReportStored(
        bytes32 indexed docHash,
        string company,
        uint256 score,
        string grade,
        address submitter
    );

    function storeReport(
        bytes32 docHash,
        string memory company,
        uint256 greenScore,
        string memory grade
    ) external {
        require(reports[docHash].timestamp == 0, "Report already stored");
        require(greenScore <= 100, "Score must be 0-100");
        require(bytes(company).length > 0, "Company name required");

        reports[docHash] = ESGReport({
            company: company,
            greenScore: greenScore,
            grade: grade,
            timestamp: block.timestamp,
            submitter: msg.sender
        });
        allHashes.push(docHash);
        emit ReportStored(docHash, company, greenScore, grade, msg.sender);
    }

    function getReport(bytes32 docHash) external view returns (ESGReport memory) {
        return reports[docHash];
    }

    function getTotalReports() external view returns (uint256) {
        return allHashes.length;
    }

    function isStored(bytes32 docHash) external view returns (bool) {
        return reports[docHash].timestamp != 0;
    }
}
