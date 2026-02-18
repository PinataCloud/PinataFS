// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC721OwnerOf {
    /// @notice Returns the owner for `tokenId`.
    function ownerOf(uint256 tokenId) external view returns (address);
}

/// @title PinataFS
/// @notice On-chain path->CID mapping gated by NFT ownership and prefix permissions.
contract PinataFS {
    error NotOwner();
    error InvalidNftContract();
    error InvalidPath();
    error UnauthorizedPath();
    error NotTokenOwner();
    error TokenWritesRevoked(address nftContract, uint256 tokenId);
    error EmptyCid();
    error FileNotFound();

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event TokenPrefixesReplaced(address indexed nftContract, uint256 indexed tokenId);
    event TokenWriteRevocationUpdated(address indexed nftContract, uint256 indexed tokenId, bool revoked);
    event FileUpserted(
        bytes32 indexed pathHash,
        address indexed nftContract,
        uint256 indexed tokenId,
        string path,
        string cid,
        address writer
    );

    address public owner;

    mapping(address nftContract => mapping(uint256 tokenId => bool)) public tokenWriteRevoked;

    mapping(address nftContract => mapping(uint256 tokenId => string[])) private _tokenPrefixes;

    mapping(bytes32 pathHash => string) private _files;

    modifier onlyOwner() {
        _onlyOwner();
        _;
    }

    /// @notice Creates the filesystem contract with deployer as admin owner.
    constructor() {
        owner = msg.sender;
        emit OwnershipTransferred(address(0), msg.sender);
    }

    /// @notice Owner-only full replacement of the allowed prefix set for an NFT token.
    function replaceTokenPrefixes(address nftContract, uint256 tokenId, string[] calldata prefixes)
        external
        onlyOwner
    {
        _requireNftContract(nftContract);
        _replaceTokenPrefixes(nftContract, tokenId, prefixes);
    }

    /// @notice Owner-only switch that blocks or unblocks writes for an NFT token.
    function setTokenWriteRevoked(address nftContract, uint256 tokenId, bool revoked) external onlyOwner {
        _requireNftContract(nftContract);

        if (tokenWriteRevoked[nftContract][tokenId] == revoked) return;

        tokenWriteRevoked[nftContract][tokenId] = revoked;
        emit TokenWriteRevocationUpdated(nftContract, tokenId, revoked);
    }

    /// @notice Transfers admin ownership to `newOwner` (including `address(0)` to disable admin actions).
    function transferOwnership(address newOwner) external onlyOwner {
        address previousOwner = owner;
        owner = newOwner;
        emit OwnershipTransferred(previousOwner, newOwner);
    }

    /// @dev Reverts unless caller is current contract owner.
    function _onlyOwner() internal view {
        if (msg.sender != owner) revert NotOwner();
    }

    /// @notice Upserts CID at `path` if caller owns `(nftContract, tokenId)` and has matching prefix permission.
    function writeFile(address nftContract, uint256 tokenId, string calldata path, string calldata cid) external {
        if (bytes(cid).length == 0) revert EmptyCid();
        _requireNftContract(nftContract);

        address tokenOwner = _ownerOfNftTokenNoRevert(nftContract, tokenId);
        if (tokenOwner != msg.sender) revert NotTokenOwner();

        if (tokenWriteRevoked[nftContract][tokenId]) {
            revert TokenWritesRevoked(nftContract, tokenId);
        }

        string memory validatedPath = _normalizeFilePath(path);
        if (!_hasPathPermission(nftContract, tokenId, validatedPath)) revert UnauthorizedPath();

        bytes32 pathHash = _hashString(validatedPath);
        _files[pathHash] = cid;

        emit FileUpserted(pathHash, nftContract, tokenId, validatedPath, cid, msg.sender);
    }

    /// @notice Returns latest CID for `path` or reverts when no file is stored there.
    function getFile(string calldata path) external view returns (string memory) {
        string memory validatedPath = _normalizeFilePath(path);
        string memory cid = _files[_hashString(validatedPath)];
        if (bytes(cid).length == 0) revert FileNotFound();

        return cid;
    }

    /// @notice Returns whether a file record exists at `path`.
    function fileExists(string calldata path) external view returns (bool) {
        string memory validatedPath = _normalizeFilePath(path);
        return bytes(_files[_hashString(validatedPath)]).length > 0;
    }

    /// @notice Returns whether `account` can currently write to `path` with `(nftContract, tokenId)`.
    function canWritePath(address nftContract, uint256 tokenId, address account, string calldata path)
        external
        view
        returns (bool)
    {
        if (!_isContract(nftContract)) return false;
        if (tokenWriteRevoked[nftContract][tokenId]) return false;

        address tokenOwner = _ownerOfNftTokenNoRevert(nftContract, tokenId);
        if (tokenOwner != account) return false;

        string memory validatedPath = _normalizeFilePath(path);
        return _hasPathPermission(nftContract, tokenId, validatedPath);
    }

    /// @notice Returns all currently allowed stored prefixes for `(nftContract, tokenId)`.
    function getTokenPrefixes(address nftContract, uint256 tokenId) external view returns (string[] memory) {
        return _tokenPrefixes[nftContract][tokenId];
    }

    /// @notice Returns whether `(nftContract, tokenId)` currently has the provided prefix permission.
    function tokenHasPrefix(address nftContract, uint256 tokenId, string calldata prefix) external view returns (bool) {
        string memory validatedPrefix = _normalizePrefixPath(prefix);
        return _containsPrefix(_tokenPrefixes[nftContract][tokenId], _hashString(validatedPrefix));
    }

    /// @notice Normalizes and validates a prefix path using contract rules.
    function normalizePrefixPath(string calldata prefix) external pure returns (string memory) {
        return _normalizePrefixPath(prefix);
    }

    /// @notice Normalizes and validates a file path using contract rules.
    function normalizeFilePath(string calldata path) external pure returns (string memory) {
        return _normalizeFilePath(path);
    }

    /// @dev Replaces stored prefixes for `(nftContract, tokenId)` with deduped validated values.
    function _replaceTokenPrefixes(address nftContract, uint256 tokenId, string[] calldata prefixes) internal {
        delete _tokenPrefixes[nftContract][tokenId];
        string[] storage storedPrefixes = _tokenPrefixes[nftContract][tokenId];

        uint256 count = prefixes.length;
        for (uint256 i = 0; i < count; i++) {
            string memory validatedPrefix = _normalizePrefixPath(prefixes[i]);
            bytes32 prefixHash = _hashString(validatedPrefix);
            if (_containsPrefix(storedPrefixes, prefixHash)) continue;
            storedPrefixes.push(validatedPrefix);
        }

        emit TokenPrefixesReplaced(nftContract, tokenId);
    }

    /// @dev Returns true when `path` matches any allowed prefix for `(nftContract, tokenId)`.
    function _hasPathPermission(address nftContract, uint256 tokenId, string memory path) internal view returns (bool) {
        string[] storage prefixes = _tokenPrefixes[nftContract][tokenId];

        uint256 count = prefixes.length;
        for (uint256 i = 0; i < count; i++) {
            if (_isPathInPrefix(path, prefixes[i])) {
                return true;
            }
        }

        return false;
    }

    /// @dev Returns true when `prefixes` contains `prefixHash`.
    function _containsPrefix(string[] storage prefixes, bytes32 prefixHash) internal view returns (bool) {
        uint256 count = prefixes.length;
        for (uint256 i = 0; i < count; i++) {
            if (_hashString(prefixes[i]) == prefixHash) return true;
        }
        return false;
    }

    /// @dev Performs strict subtree matching for paths and prefixes.
    function _isPathInPrefix(string memory path, string memory prefix) internal pure returns (bool) {
        bytes memory pathBytes = bytes(path);
        bytes memory prefixBytes = bytes(prefix);

        if (prefixBytes.length == 1) {
            return pathBytes.length >= 1 && pathBytes[0] == "/";
        }

        if (pathBytes.length < prefixBytes.length) return false;

        for (uint256 i = 0; i < prefixBytes.length; i++) {
            if (pathBytes[i] != prefixBytes[i]) return false;
        }

        if (pathBytes.length == prefixBytes.length) return true;
        return pathBytes[prefixBytes.length] == "/";
    }

    /// @dev Normalizes a prefix path.
    function _normalizePrefixPath(string memory prefix) internal pure returns (string memory) {
        return _normalizePath(prefix, false, true);
    }

    /// @dev Normalizes a file path.
    function _normalizeFilePath(string memory path) internal pure returns (string memory) {
        return _normalizePath(path, true, false);
    }

    /// @dev Validates and copies a slash-delimited path in a single pass while preserving original case.
    function _normalizePath(string memory rawPath, bool allowDotInFinalSegment, bool allowRootOnly)
        internal
        pure
        returns (string memory)
    {
        bytes memory input = bytes(rawPath);
        uint256 length = input.length;

        if (length == 0 || input[0] != "/") revert InvalidPath();

        if (length == 1) {
            if (!allowRootOnly) revert InvalidPath();
            return "/";
        }

        bytes memory normalized = new bytes(length);
        normalized[0] = "/";

        uint256 normalizedLength = 1;
        bool previousWasSlash = true;
        uint256 segmentLength;
        uint256 segmentDotCount;
        bool segmentEndsWithDot;

        for (uint256 i = 1; i < length; i++) {
            bytes1 current = input[i];

            if (current == "/") {
                if (previousWasSlash) revert InvalidPath();
                if (segmentDotCount > 0) revert InvalidPath();

                normalized[normalizedLength] = "/";
                normalizedLength += 1;
                previousWasSlash = true;
                segmentLength = 0;
                segmentDotCount = 0;
                segmentEndsWithDot = false;
                continue;
            }

            if (
                (current >= "A" && current <= "Z") || (current >= "a" && current <= "z")
                    || (current >= "0" && current <= "9") || current == "-" || current == "_"
            ) {
                segmentEndsWithDot = false;
            } else if (current == ".") {
                if (!allowDotInFinalSegment) revert InvalidPath();
                if (segmentLength == 0) revert InvalidPath();
                segmentDotCount += 1;
                if (segmentDotCount > 1) revert InvalidPath();
                segmentEndsWithDot = true;
            } else {
                revert InvalidPath();
            }

            normalized[normalizedLength] = current;
            normalizedLength += 1;
            segmentLength += 1;
            previousWasSlash = false;
        }

        if (previousWasSlash) revert InvalidPath();
        if (segmentLength == 0) revert InvalidPath();
        if (segmentEndsWithDot) revert InvalidPath();
        if (!allowDotInFinalSegment && segmentDotCount > 0) revert InvalidPath();

        assembly {
            mstore(normalized, normalizedLength)
        }

        return string(normalized);
    }

    /// @dev Returns owner for `(nftContract, tokenId)` or zero when lookup fails.
    function _ownerOfNftTokenNoRevert(address nftContract, uint256 tokenId) internal view returns (address tokenOwner) {
        try IERC721OwnerOf(nftContract).ownerOf(tokenId) returns (address resolvedOwner) {
            tokenOwner = resolvedOwner;
        } catch {
            tokenOwner = address(0);
        }
    }

    /// @dev Reverts when `nftContract` is not a deployed contract.
    function _requireNftContract(address nftContract) internal view {
        if (!_isContract(nftContract)) revert InvalidNftContract();
    }

    /// @dev Returns true when `account` has runtime bytecode.
    function _isContract(address account) internal view returns (bool) {
        return account.code.length > 0;
    }

    /// @dev Equivalent to `keccak256(bytes(value))` but hashes string memory directly for lower overhead.
    function _hashString(string memory value) internal pure returns (bytes32 hashValue) {
        assembly {
            // Solidity strings in memory are `[length (32 bytes) | data ...]`.
            // So we hash from `value + 0x20` for `mload(value)` bytes.
            hashValue := keccak256(add(value, 0x20), mload(value))
        }
    }
}
