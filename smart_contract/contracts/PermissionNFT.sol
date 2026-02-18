// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC165 {
    /// @notice Returns true when `interfaceId` is supported by this contract.
    function supportsInterface(bytes4 interfaceId) external view returns (bool);
}

interface IERC721 is IERC165 {
    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId);
    event ApprovalForAll(address indexed owner, address indexed operator, bool approved);

    /// @notice Returns how many tokens are owned by `owner`.
    function balanceOf(address owner) external view returns (uint256);

    /// @notice Returns the current owner of `tokenId`.
    function ownerOf(uint256 tokenId) external view returns (address);

    /// @notice Safely transfers `tokenId` from `from` to `to`.
    function safeTransferFrom(address from, address to, uint256 tokenId) external;

    /// @notice Transfers `tokenId` from `from` to `to`.
    function transferFrom(address from, address to, uint256 tokenId) external;

    /// @notice Approves `to` to transfer `tokenId`.
    function approve(address to, uint256 tokenId) external;

    /// @notice Returns the approved address for `tokenId`.
    function getApproved(uint256 tokenId) external view returns (address);

    /// @notice Sets blanket operator approval for caller-owned tokens.
    function setApprovalForAll(address operator, bool approved) external;

    /// @notice Returns whether `operator` is approved for all of `owner` tokens.
    function isApprovedForAll(address owner, address operator) external view returns (bool);

    /// @notice Safely transfers `tokenId` with extra `data`.
    function safeTransferFrom(address from, address to, uint256 tokenId, bytes calldata data) external;
}

interface IERC721Metadata is IERC721 {
    /// @notice Returns token collection name.
    function name() external view returns (string memory);

    /// @notice Returns token collection symbol.
    function symbol() external view returns (string memory);

    /// @notice Returns metadata URI for `tokenId`.
    function tokenURI(uint256 tokenId) external view returns (string memory);
}

interface IERC721Receiver {
    /// @notice Handles safe-transfer receipt callback.
    function onERC721Received(address operator, address from, uint256 tokenId, bytes calldata data)
        external
        returns (bytes4);
}

/// @title PermissionNFT
/// @notice Owner-minted ERC-721 collection used for filesystem write permissions.
contract PermissionNFT is IERC721Metadata {
    error NotOwner();
    error ZeroAddress();
    error TokenDoesNotExist(uint256 tokenId);
    error TokenAlreadyMinted(uint256 tokenId);
    error NotAuthorized();
    error InvalidOperator();
    error IncorrectOwner();
    error UnsafeRecipient();
    error TokenSoulbound(uint256 tokenId);

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event AccessTokenMinted(uint256 indexed tokenId, address indexed to, bool transferable);

    string private _tokenName;
    string private _tokenSymbol;

    address public owner;
    uint256 public totalSupply;
    uint256 private _nextTokenId = 1;

    mapping(uint256 tokenId => address) private _ownerOf;
    mapping(address ownerAddress => uint256) private _balanceOf;
    mapping(uint256 tokenId => address) private _tokenApprovals;
    mapping(address ownerAddress => mapping(address operator => bool)) private _operatorApprovals;

    mapping(uint256 tokenId => bool) public tokenTransferable;

    modifier onlyOwner() {
        _onlyOwner();
        _;
    }

    /// @notice Creates the permission NFT collection.
    constructor(string memory tokenName_, string memory tokenSymbol_) {
        owner = msg.sender;
        _tokenName = tokenName_;
        _tokenSymbol = tokenSymbol_;

        emit OwnershipTransferred(address(0), msg.sender);
    }

    /// @notice Returns true for ERC-165, ERC-721, and ERC-721 metadata interface ids.
    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == type(IERC165).interfaceId || interfaceId == type(IERC721).interfaceId
            || interfaceId == type(IERC721Metadata).interfaceId;
    }

    /// @notice Returns the collection name.
    function name() external view returns (string memory) {
        return _tokenName;
    }

    /// @notice Returns the collection symbol.
    function symbol() external view returns (string memory) {
        return _tokenSymbol;
    }

    /// @notice Returns metadata URI for a minted token (empty string in this implementation).
    function tokenURI(uint256 tokenId) external view returns (string memory) {
        _requireMinted(tokenId);
        return "";
    }

    /// @notice Returns number of tokens owned by `ownerAddress`.
    function balanceOf(address ownerAddress) external view returns (uint256) {
        if (ownerAddress == address(0)) revert ZeroAddress();
        return _balanceOf[ownerAddress];
    }

    /// @notice Returns current owner of `tokenId`.
    function ownerOf(uint256 tokenId) public view returns (address) {
        address tokenOwner = _ownerOf[tokenId];
        if (tokenOwner == address(0)) revert TokenDoesNotExist(tokenId);
        return tokenOwner;
    }

    /// @notice Sets a per-token transfer approval for `tokenId`.
    function approve(address to, uint256 tokenId) external {
        address tokenOwner = ownerOf(tokenId);
        if (msg.sender != tokenOwner && !_operatorApprovals[tokenOwner][msg.sender]) revert NotAuthorized();

        _tokenApprovals[tokenId] = to;
        emit Approval(tokenOwner, to, tokenId);
    }

    /// @notice Returns approved address for minted `tokenId`.
    function getApproved(uint256 tokenId) external view returns (address) {
        _requireMinted(tokenId);
        return _tokenApprovals[tokenId];
    }

    /// @notice Sets or clears blanket operator approval for caller-owned tokens.
    function setApprovalForAll(address operator, bool approved) external {
        if (operator == msg.sender) revert InvalidOperator();

        _operatorApprovals[msg.sender][operator] = approved;
        emit ApprovalForAll(msg.sender, operator, approved);
    }

    /// @notice Returns whether `operator` is approved for all tokens of `ownerAddress`.
    function isApprovedForAll(address ownerAddress, address operator) external view returns (bool) {
        return _operatorApprovals[ownerAddress][operator];
    }

    /// @notice Transfers `tokenId` if transferable and caller is owner or approved.
    function transferFrom(address from, address to, uint256 tokenId) public {
        if (to == address(0)) revert ZeroAddress();

        address tokenOwner = ownerOf(tokenId);
        if (!tokenTransferable[tokenId]) revert TokenSoulbound(tokenId);
        if (tokenOwner != from) revert IncorrectOwner();
        if (!_isApprovedOrOwner(msg.sender, tokenId, tokenOwner)) revert NotAuthorized();

        _tokenApprovals[tokenId] = address(0);
        unchecked {
            _balanceOf[from] -= 1;
            _balanceOf[to] += 1;
        }
        _ownerOf[tokenId] = to;

        emit Approval(from, address(0), tokenId);
        emit Transfer(from, to, tokenId);
    }

    /// @notice Safely transfers `tokenId` with empty call data.
    function safeTransferFrom(address from, address to, uint256 tokenId) external {
        safeTransferFrom(from, to, tokenId, "");
    }

    /// @notice Safely transfers `tokenId` and checks receiver callback for contracts.
    function safeTransferFrom(address from, address to, uint256 tokenId, bytes memory data) public {
        transferFrom(from, to, tokenId);

        if (to.code.length == 0) return;

        bytes4 returnValue = IERC721Receiver(to).onERC721Received(msg.sender, from, tokenId, data);
        if (returnValue != IERC721Receiver.onERC721Received.selector) revert UnsafeRecipient();
    }

    /// @notice Owner-only mint for a permission token with transferability flag.
    function mintAccessToken(address to, bool transferable) external onlyOwner returns (uint256 tokenId) {
        if (to == address(0)) revert ZeroAddress();

        tokenId = _nextTokenId;
        _nextTokenId = tokenId + 1;

        _mint(to, tokenId);
        tokenTransferable[tokenId] = transferable;

        emit AccessTokenMinted(tokenId, to, transferable);
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

    /// @dev Mints an ERC-721 token id to `to`.
    function _mint(address to, uint256 tokenId) internal {
        if (to == address(0)) revert ZeroAddress();
        if (_ownerOf[tokenId] != address(0)) revert TokenAlreadyMinted(tokenId);

        _ownerOf[tokenId] = to;
        unchecked {
            _balanceOf[to] += 1;
            totalSupply += 1;
        }

        emit Transfer(address(0), to, tokenId);
    }

    /// @dev Returns whether `spender` can transfer `tokenId`.
    function _isApprovedOrOwner(address spender, uint256 tokenId, address tokenOwner) internal view returns (bool) {
        return spender == tokenOwner || _tokenApprovals[tokenId] == spender || _operatorApprovals[tokenOwner][spender];
    }

    /// @dev Reverts when `tokenId` has not been minted.
    function _requireMinted(uint256 tokenId) internal view {
        if (_ownerOf[tokenId] == address(0)) revert TokenDoesNotExist(tokenId);
    }
}
