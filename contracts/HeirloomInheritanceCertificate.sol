// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";

/// @title Heirloom Inheritance Certificate
/// @notice ERC-721 certificates issued after a separately confirmed inheritance execution.
/// @dev This contract cannot prove that DigitalInheritance.sol executed. The intended flow is
///      for an authorized minter to verify the confirmed PlanExecuted event off-chain, read the
///      beneficiary data, and then submit certificate mint transactions.
contract HeirloomInheritanceCertificate is ERC721URIStorage, Ownable {
    struct CertificateDetails {
        address beneficiary;
        uint256 allocationBasisPoints;
        uint256 executionTimestamp;
        bytes32 cycleReference;
    }

    address public immutable sourceInheritanceContract;
    address public minter;

    mapping(uint256 => CertificateDetails) private _certificateDetails;
    mapping(bytes32 => bool) public usedCycleReferences;

    uint256 private _nextTokenId = 1;

    event CertificateMinted(
        uint256 indexed tokenId,
        address indexed beneficiary,
        uint256 allocationBasisPoints,
        uint256 executionTimestamp,
        bytes32 indexed cycleReference
    );
    event MinterUpdated(address indexed previousMinter, address indexed newMinter);

    modifier onlyMinter() {
        require(msg.sender == minter, "Caller is not the authorized minter");
        _;
    }

    constructor(address sourceContract, address initialMinter)
        ERC721("Heirloom Inheritance Certificate", "HIC")
    {
        require(sourceContract != address(0), "Source contract cannot be zero address");
        require(initialMinter != address(0), "Minter cannot be zero address");

        sourceInheritanceContract = sourceContract;
        minter = initialMinter;
    }

    function mintCertificate(
        address beneficiary,
        uint256 allocationBasisPoints,
        uint256 executionTimestamp,
        bytes32 cycleReference,
        string calldata metadataURI
    ) external onlyMinter returns (uint256 tokenId) {
        require(beneficiary != address(0), "Beneficiary cannot be zero address");
        require(allocationBasisPoints > 0, "Allocation must be greater than zero");
        require(allocationBasisPoints <= 10000, "Allocation cannot exceed 10000 basis points");
        require(executionTimestamp > 0, "Execution timestamp must be greater than zero");
        require(cycleReference != bytes32(0), "Cycle reference cannot be zero");
        require(!usedCycleReferences[cycleReference], "Cycle reference already used");
        require(bytes(metadataURI).length > 0, "Metadata URI cannot be empty");

        usedCycleReferences[cycleReference] = true;
        tokenId = _nextTokenId++;

        _safeMint(beneficiary, tokenId);
        _setTokenURI(tokenId, metadataURI);

        _certificateDetails[tokenId] = CertificateDetails({
            beneficiary: beneficiary,
            allocationBasisPoints: allocationBasisPoints,
            executionTimestamp: executionTimestamp,
            cycleReference: cycleReference
        });

        emit CertificateMinted(
            tokenId,
            beneficiary,
            allocationBasisPoints,
            executionTimestamp,
            cycleReference
        );
    }

    function setMinter(address newMinter) external onlyOwner {
        require(newMinter != address(0), "Minter cannot be zero address");

        address previousMinter = minter;
        minter = newMinter;
        emit MinterUpdated(previousMinter, newMinter);
    }

    function certificateDetails(uint256 tokenId)
        external
        view
        returns (
            address beneficiary,
            uint256 allocationBasisPoints,
            uint256 executionTimestamp,
            bytes32 cycleReference
        )
    {
        require(_exists(tokenId), "Certificate does not exist");
        CertificateDetails memory details = _certificateDetails[tokenId];
        return (
            details.beneficiary,
            details.allocationBasisPoints,
            details.executionTimestamp,
            details.cycleReference
        );
    }

    function certificateCount() external view returns (uint256) {
        return _nextTokenId - 1;
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721URIStorage)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    function _burn(uint256 tokenId) internal override(ERC721URIStorage) {
        super._burn(tokenId);
        delete _certificateDetails[tokenId];
    }
}