import { parseAbi } from "viem";

export const permissionNftAbi = parseAbi([
  "constructor(string tokenName_, string tokenSymbol_)",
  "error NotOwner()",
  "error ZeroAddress()",
  "error TokenDoesNotExist(uint256 tokenId)",
  "error TokenAlreadyMinted(uint256 tokenId)",
  "error NotAuthorized()",
  "error InvalidOperator()",
  "error IncorrectOwner()",
  "error UnsafeRecipient()",
  "error TokenSoulbound(uint256 tokenId)",
  "function owner() view returns (address)",
  "function balanceOf(address owner) view returns (uint256)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function tokenTransferable(uint256 tokenId) view returns (bool)",
  "function mintAccessToken(address to, bool transferable) returns (uint256 tokenId)",
  "function transferOwnership(address newOwner)",
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
  "event AccessTokenMinted(uint256 indexed tokenId, address indexed to, bool transferable)"
]);

export const pinataFsAbi = parseAbi([
  "constructor()",
  "error NotOwner()",
  "error InvalidNftContract()",
  "error InvalidPath()",
  "error UnauthorizedPath()",
  "error NotTokenOwner()",
  "error TokenWritesRevoked(address nftContract, uint256 tokenId)",
  "error EmptyCid()",
  "error FileNotFound()",
  "function owner() view returns (address)",
  "function replaceTokenPrefixes(address nftContract, uint256 tokenId, string[] prefixes)",
  "function setTokenWriteRevoked(address nftContract, uint256 tokenId, bool revoked)",
  "function transferOwnership(address newOwner)",
  "function writeFile(address nftContract, uint256 tokenId, string path, string cid)",
  "function getFile(string path) view returns (string)",
  "function fileExists(string path) view returns (bool)",
  "function canWritePath(address nftContract, uint256 tokenId, address account, string path) view returns (bool)",
  "function tokenWriteRevoked(address nftContract, uint256 tokenId) view returns (bool)",
  "function getTokenPrefixes(address nftContract, uint256 tokenId) view returns (string[])",
  "function tokenHasPrefix(address nftContract, uint256 tokenId, string prefix) view returns (bool)",
  "function normalizePrefixPath(string prefix) pure returns (string)",
  "function normalizeFilePath(string path) pure returns (string)",
  "event TokenPrefixesReplaced(address indexed nftContract, uint256 indexed tokenId)",
  "event FileUpserted(bytes32 indexed pathHash, address indexed nftContract, uint256 indexed tokenId, string path, string cid, address writer)"
]);

export type PermissionNftAbi = typeof permissionNftAbi;
export type PinataFSAbi = typeof pinataFsAbi;
