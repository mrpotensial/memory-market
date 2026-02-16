// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";

/**
 * @title IdentityRegistry (ERC-8004 Trustless Agents)
 * @notice ERC-721 based agent identity registry for Memory Markets.
 * @dev Each agent registers with a URI and receives a unique NFT (agentId).
 *      Testnet deployment — mainnet should use official ERC-8004 contracts.
 */
contract IdentityRegistry is ERC721URIStorage {
    uint256 private _nextAgentId = 1;

    // Metadata: agentId => key => value
    mapping(uint256 => mapping(string => bytes)) private _metadata;

    // Agent wallet: agentId => wallet address
    mapping(uint256 => address) private _agentWallets;

    event Registered(uint256 indexed agentId, string agentURI, address indexed owner);

    constructor() ERC721("ERC8004 Agent Identity", "AGENT") {}

    /**
     * @notice Register a new agent identity on-chain.
     * @param agentURI Metadata URI (data: URL with JSON containing name, description, capabilities)
     * @return agentId The unique token ID for the registered agent
     */
    function register(string calldata agentURI) external returns (uint256) {
        uint256 agentId = _nextAgentId++;
        _safeMint(msg.sender, agentId);
        _setTokenURI(agentId, agentURI);
        emit Registered(agentId, agentURI, msg.sender);
        return agentId;
    }

    /**
     * @notice Update the agent URI (only owner).
     */
    function setAgentURI(uint256 agentId, string calldata newURI) external {
        require(ownerOf(agentId) == msg.sender, "Not owner");
        _setTokenURI(agentId, newURI);
    }

    /**
     * @notice Get metadata value for an agent.
     */
    function getMetadata(uint256 agentId, string calldata key) external view returns (bytes memory) {
        return _metadata[agentId][key];
    }

    /**
     * @notice Set metadata for an agent (only owner).
     */
    function setMetadata(uint256 agentId, string calldata key, bytes calldata value) external {
        require(ownerOf(agentId) == msg.sender, "Not owner");
        _metadata[agentId][key] = value;
    }

    /**
     * @notice Get the wallet address associated with an agent.
     */
    function getAgentWallet(uint256 agentId) external view returns (address) {
        return _agentWallets[agentId];
    }
}
