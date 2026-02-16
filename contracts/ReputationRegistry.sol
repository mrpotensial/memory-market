// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title ReputationRegistry (ERC-8004 Trustless Agents)
 * @notice On-chain reputation feedback for registered agents.
 * @dev Stores feedback from clients (other agents/users) with tags and scoring.
 *      Testnet deployment — mainnet should use official ERC-8004 contracts.
 */
contract ReputationRegistry {
    address public identityRegistry;

    struct Feedback {
        int128 value;
        uint8 valueDecimals;
        string tag1;
        string tag2;
        string endpoint;
        string feedbackURI;
        bytes32 feedbackHash;
        bool isRevoked;
    }

    // agentId => clientAddress => feedbacks[]
    mapping(uint256 => mapping(address => Feedback[])) private _feedbacks;

    // agentId => client addresses list
    mapping(uint256 => address[]) private _clients;
    mapping(uint256 => mapping(address => bool)) private _isClient;

    event NewFeedback(
        uint256 indexed agentId,
        address indexed clientAddress,
        uint64 feedbackIndex,
        int128 value,
        uint8 valueDecimals,
        string indexed indexedTag1,
        string tag1,
        string tag2,
        string endpoint,
        string feedbackURI,
        bytes32 feedbackHash
    );

    constructor(address _identityRegistry) {
        identityRegistry = _identityRegistry;
    }

    /**
     * @notice Submit reputation feedback for an agent.
     * @param agentId The agent's ERC-721 token ID
     * @param value Feedback score (int128, positive = good, negative = bad)
     * @param valueDecimals Decimal precision for value
     * @param tag1 Primary category tag (e.g., "knowledge-quality")
     * @param tag2 Secondary tag (e.g., "memory-markets")
     * @param endpoint Service endpoint URL (optional)
     * @param feedbackURI Off-chain feedback data URI (optional)
     * @param feedbackHash Hash of off-chain feedback data (optional)
     */
    function giveFeedback(
        uint256 agentId,
        int128 value,
        uint8 valueDecimals,
        string calldata tag1,
        string calldata tag2,
        string calldata endpoint,
        string calldata feedbackURI,
        bytes32 feedbackHash
    ) external {
        _feedbacks[agentId][msg.sender].push(
            Feedback(value, valueDecimals, tag1, tag2, endpoint, feedbackURI, feedbackHash, false)
        );
        uint64 idx = uint64(_feedbacks[agentId][msg.sender].length - 1);

        if (!_isClient[agentId][msg.sender]) {
            _clients[agentId].push(msg.sender);
            _isClient[agentId][msg.sender] = true;
        }

        emit NewFeedback(
            agentId, msg.sender, idx, value, valueDecimals,
            tag1, tag1, tag2, endpoint, feedbackURI, feedbackHash
        );
    }

    /**
     * @notice Get aggregated reputation summary for an agent.
     * @param agentId The agent's token ID
     * @param clientAddresses Filter by specific clients (empty = all clients)
     * @param tag1 Filter by primary tag (empty = all tags)
     * @param tag2 Filter by secondary tag (empty = all tags)
     */
    function getSummary(
        uint256 agentId,
        address[] calldata clientAddresses,
        string calldata tag1,
        string calldata tag2
    ) external view returns (uint64 count, int128 summaryValue, uint8 summaryValueDecimals) {
        address[] memory clients;
        if (clientAddresses.length > 0) {
            clients = clientAddresses;
        } else {
            clients = _clients[agentId];
        }

        for (uint256 i = 0; i < clients.length; i++) {
            Feedback[] storage fbs = _feedbacks[agentId][clients[i]];
            for (uint256 j = 0; j < fbs.length; j++) {
                if (!fbs[j].isRevoked) {
                    bool tagMatch = (bytes(tag1).length == 0 ||
                        keccak256(bytes(fbs[j].tag1)) == keccak256(bytes(tag1))) &&
                        (bytes(tag2).length == 0 ||
                        keccak256(bytes(fbs[j].tag2)) == keccak256(bytes(tag2)));
                    if (tagMatch) {
                        count++;
                        summaryValue += fbs[j].value;
                    }
                }
            }
        }
    }

    /**
     * @notice Read a specific feedback entry.
     */
    function readFeedback(
        uint256 agentId,
        address clientAddress,
        uint64 feedbackIndex
    ) external view returns (
        int128 value,
        uint8 valueDecimals,
        string memory tag1,
        string memory tag2,
        bool isRevoked
    ) {
        Feedback storage fb = _feedbacks[agentId][clientAddress][feedbackIndex];
        return (fb.value, fb.valueDecimals, fb.tag1, fb.tag2, fb.isRevoked);
    }

    /**
     * @notice Get all client addresses that have given feedback to an agent.
     */
    function getClients(uint256 agentId) external view returns (address[] memory) {
        return _clients[agentId];
    }

    /**
     * @notice Get the last feedback index for a client on an agent.
     */
    function getLastIndex(uint256 agentId, address clientAddress) external view returns (uint64) {
        uint256 len = _feedbacks[agentId][clientAddress].length;
        return len > 0 ? uint64(len - 1) : 0;
    }

    /**
     * @notice Get the linked Identity Registry address.
     */
    function getIdentityRegistry() external view returns (address) {
        return identityRegistry;
    }
}
