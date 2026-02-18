// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {PermissionNFT} from "../contracts/PermissionNFT.sol";
import {PinataFS} from "../contracts/PinataFS.sol";

/// @dev Minimal subset of Foundry cheatcodes used by this test contract.
interface Vm {
    /// @notice Executes exactly the next external call as `caller`.
    function prank(address caller) external;

    /// @notice Executes all subsequent external calls as `caller` until stopped.
    function startPrank(address caller) external;

    /// @notice Stops a previously started persistent prank context.
    function stopPrank() external;

    /// @notice Asserts the next external call reverts with the provided selector.
    function expectRevert(bytes4 revertData) external;

    /// @notice Asserts the next external call reverts with exactly encoded revert bytes.
    function expectRevert(bytes calldata revertData) external;
}

// Foundry exposes cheatcodes through this sentinel address derived from a fixed preimage.
address constant VM_ADDRESS = address(uint160(uint256(keccak256("hevm cheat code"))));
// Cast the sentinel address into our local `Vm` interface for typed cheatcode calls.
Vm constant vm = Vm(VM_ADDRESS);

/// @dev End-to-end tests for external-NFT permissioning and filesystem writes.
contract PinataFSTest {
    // Primary user used across tests for happy-path ownership flows.
    address private constant ALICE = address(0xA11CE);
    // Secondary user used across tests for unauthorized and transfer scenarios.
    address private constant BOB = address(0xB0B);

    // Filesystem contract instance reset per test by `setUp`.
    PinataFS private fs;
    // First permission NFT collection used for default tests.
    PermissionNFT private permissionNft;
    // Second NFT collection to verify external contract support.
    PermissionNFT private externalPermissionNft;

    /// @notice Deploys clean contract instances before each test case.
    /// @dev This guarantees each test runs with isolated state and no cross-test coupling.
    function setUp() public {
        // Deploy filesystem permissions/storage contract.
        fs = new PinataFS();
        // Deploy primary permission NFT collection.
        permissionNft = new PermissionNFT("PinataFS Access", "PFSA");
        // Deploy secondary permission NFT collection to test external collection usage.
        externalPermissionNft = new PermissionNFT("External Access", "EXT");
    }

    /// @notice Verifies happy-path flow for minting, prefix assignment, writing, and reading.
    /// @dev Test flow:
    /// 1. Mint a permission NFT for ALICE.
    /// 2. Grant two mixed-case prefixes on filesystem contract.
    /// 3. Confirm prefixes are stored exactly as provided.
    /// 4. Write and read a mixed-case file path.
    function testMintWriteReadAndCasePreservation() public {
        // Mint a non-transferable permission NFT to ALICE.
        uint256 tokenId = permissionNft.mintAccessToken(ALICE, false);

        // Replace this token's permission set with two mixed-case prefixes.
        string[] memory prefixes = new string[](2);
        prefixes[0] = "/Agent1";
        prefixes[1] = "/Shared/Data";
        fs.replaceTokenPrefixes(address(permissionNft), tokenId, prefixes);

        // Load current allowed prefixes from filesystem contract.
        string[] memory storedPrefixes = fs.getTokenPrefixes(address(permissionNft), tokenId);
        // Assert exactly two prefixes were stored.
        require(storedPrefixes.length == 2, "prefix count mismatch");
        // Assert first prefix preserved original case.
        require(_eq(storedPrefixes[0], "/Agent1"), "first prefix should preserve case");
        // Assert second prefix preserved original case.
        require(_eq(storedPrefixes[1], "/Shared/Data"), "second prefix should preserve case");

        // Make only the next call execute as ALICE.
        vm.prank(ALICE);
        // Write a CID to a mixed-case path under ALICE's allowed prefix.
        fs.writeFile(address(permissionNft), tokenId, "/Agent1/files/Manifest.JSON", "bafybeigdyrzt");

        // Read the file from the same mixed-case path.
        string memory cid = fs.getFile("/Agent1/files/Manifest.JSON");
        // Assert the stored CID matches what was written.
        require(_eq(cid, "bafybeigdyrzt"), "cid mismatch");
    }

    /// @notice Ensures strict subtree matching blocks sibling namespace collisions.
    /// @dev Test flow:
    /// 1. Mint token with permission prefix `/agent1`.
    /// 2. Attempt write to `/agent10/...`.
    /// 3. Expect unauthorized-path revert.
    function testStrictSubtreeCheckBlocksSiblingPrefixes() public {
        // Mint token with a single `/agent1` prefix.
        uint256 tokenId = _mintWithPrefix(permissionNft, ALICE, false, "/agent1");

        // Make only the next call execute as ALICE.
        vm.prank(ALICE);
        // Require the next call to revert with `UnauthorizedPath`.
        vm.expectRevert(PinataFS.UnauthorizedPath.selector);
        // Attempt write under sibling-like prefix `/agent10` which is not authorized.
        fs.writeFile(address(permissionNft), tokenId, "/agent10/files/manifest.json", "bafyforbidden");
    }

    /// @notice Confirms write auth uses strict owner-of-token checks and ignores ERC-721 approvals.
    /// @dev Test flow:
    /// 1. Mint transferable token to ALICE.
    /// 2. ALICE approves BOB for transfer rights.
    /// 3. BOB attempts to write and must fail with `NotTokenOwner`.
    function testWriteUsesOwnerOfOnlyNotApproval() public {
        // Mint transferable token for ALICE under `/agent1`.
        uint256 tokenId = _mintWithPrefix(permissionNft, ALICE, true, "/agent1");

        // Make next call execute as ALICE.
        vm.prank(ALICE);
        // Grant BOB ERC-721 transfer approval for this token.
        permissionNft.approve(BOB, tokenId);

        // Make next call execute as BOB.
        vm.prank(BOB);
        // Require next call to fail because write auth is owner-only.
        vm.expectRevert(PinataFS.NotTokenOwner.selector);
        // Attempt write as approved operator (should fail).
        fs.writeFile(address(permissionNft), tokenId, "/agent1/files/manifest.json", "bafydenied");
    }

    /// @notice Validates soulbound vs transferable behavior and ownership transfer effect on writes.
    /// @dev Test flow:
    /// 1. Mint soulbound token and assert transfer reverts.
    /// 2. Mint transferable token and assert transfer succeeds.
    /// 3. Assert old owner cannot write and new owner can write.
    function testSoulboundAndTransferableFlags() public {
        // Mint soulbound token that cannot be transferred.
        uint256 soulboundTokenId = permissionNft.mintAccessToken(ALICE, false);

        // Make next call execute as ALICE.
        vm.prank(ALICE);
        // Expect explicit soulbound custom error for this token id.
        vm.expectRevert(abi.encodeWithSelector(PermissionNFT.TokenSoulbound.selector, soulboundTokenId));
        // Attempt forbidden transfer for soulbound token.
        permissionNft.transferFrom(ALICE, BOB, soulboundTokenId);

        // Mint transferable token and grant `/agent2` permission.
        uint256 transferableTokenId = _mintWithPrefix(permissionNft, ALICE, true, "/agent2");

        // Make next call execute as ALICE.
        vm.prank(ALICE);
        // Transfer token ownership from ALICE to BOB.
        permissionNft.transferFrom(ALICE, BOB, transferableTokenId);
        // Assert ownership moved to BOB.
        require(permissionNft.ownerOf(transferableTokenId) == BOB, "transferable token should transfer");

        // Make next call execute as ALICE (former owner).
        vm.prank(ALICE);
        // Expect old owner write attempt to fail.
        vm.expectRevert(PinataFS.NotTokenOwner.selector);
        // Attempt write from former owner should revert.
        fs.writeFile(address(permissionNft), transferableTokenId, "/agent2/files/a.json", "bafyold");

        // Make next call execute as BOB (new owner).
        vm.prank(BOB);
        // New owner writes successfully to authorized prefix.
        fs.writeFile(address(permissionNft), transferableTokenId, "/agent2/files/a.json", "bafynew");
        // Read back latest CID for that path.
        string memory cid = fs.getFile("/agent2/files/a.json");
        // Assert write by new owner persisted.
        require(_eq(cid, "bafynew"), "new owner should write");
    }

    /// @notice Validates owner-side prefix revoke and re-enable (upsert) behavior.
    /// @dev Test flow:
    /// 1. Mint token with `/agent1` access.
    /// 2. Revoke `/agent1` and assert write fails.
    /// 3. Re-enable `/agent1` and assert write succeeds.
    function testPermissionUpsertAndRevoke() public {
        // Mint token for ALICE with initial `/agent1` prefix.
        uint256 tokenId = _mintWithPrefix(permissionNft, ALICE, false, "/agent1");

        // Revoke all permissions by replacing with an empty set.
        fs.replaceTokenPrefixes(address(permissionNft), tokenId, new string[](0));

        // Make next call execute as ALICE.
        vm.prank(ALICE);
        // Expect write to fail because prefix was revoked.
        vm.expectRevert(PinataFS.UnauthorizedPath.selector);
        // Attempt write under revoked prefix should revert.
        fs.writeFile(address(permissionNft), tokenId, "/agent1/files/manifest.json", "bafyblocked");

        // Re-enable `/agent1` permission for this token.
        fs.replaceTokenPrefixes(address(permissionNft), tokenId, _singlePrefixList("/agent1"));

        // Make next call execute as ALICE.
        vm.prank(ALICE);
        // Write now succeeds because prefix permission was restored.
        fs.writeFile(address(permissionNft), tokenId, "/agent1/files/manifest.json", "bafyallowed");

        // Read back CID at the written path.
        string memory cid = fs.getFile("/agent1/files/manifest.json");
        // Assert restored permission allows successful persistence.
        require(_eq(cid, "bafyallowed"), "prefix upsert should restore access");
    }

    /// @notice Validates token-level write-revocation toggle independent of prefix grants.
    /// @dev Test flow:
    /// 1. Mint token with valid prefix.
    /// 2. Toggle token write-revoked on and assert write fails.
    /// 3. Toggle write-revoked off and assert write succeeds.
    function testTokenLevelWriteRevocation() public {
        // Mint token for ALICE with `/agent1` prefix.
        uint256 tokenId = _mintWithPrefix(permissionNft, ALICE, false, "/agent1");

        // Revoke all writes for this token.
        fs.setTokenWriteRevoked(address(permissionNft), tokenId, true);

        // Make next call execute as ALICE.
        vm.prank(ALICE);
        // Expect token-specific revocation error including collection + token id.
        vm.expectRevert(
            abi.encodeWithSelector(PinataFS.TokenWritesRevoked.selector, address(permissionNft), tokenId)
        );
        // Attempt write while revoked should fail.
        fs.writeFile(address(permissionNft), tokenId, "/agent1/files/manifest.json", "bafyblocked");

        // Re-enable writes for this token.
        fs.setTokenWriteRevoked(address(permissionNft), tokenId, false);

        // Make next call execute as ALICE.
        vm.prank(ALICE);
        // Write succeeds once revocation is removed.
        fs.writeFile(address(permissionNft), tokenId, "/agent1/files/manifest.json", "bafyallowed");

        // Read back latest CID.
        string memory cid = fs.getFile("/agent1/files/manifest.json");
        // Assert toggle-off restored write capability.
        require(_eq(cid, "bafyallowed"), "revocation toggle should restore access");
    }

    /// @notice Verifies path parser rejects invalid path forms.
    /// @dev Test flow covers duplicate slash, dot-dot, multiple dots in filename, and unsupported symbols.
    function testPathValidationRejectsInvalidShapes() public {
        // Mint token for ALICE with `/agent1` prefix.
        uint256 tokenId = _mintWithPrefix(permissionNft, ALICE, false, "/agent1");

        // Make next call execute as ALICE.
        vm.prank(ALICE);
        // Expect invalid-path revert for duplicate slash.
        vm.expectRevert(PinataFS.InvalidPath.selector);
        // Duplicate slash should fail parser validation.
        fs.writeFile(address(permissionNft), tokenId, "/agent1//files/manifest.json", "bafya");

        // Make next call execute as ALICE.
        vm.prank(ALICE);
        // Expect invalid-path revert for dot-dot segment.
        vm.expectRevert(PinataFS.InvalidPath.selector);
        // Dot-dot segment is disallowed.
        fs.writeFile(address(permissionNft), tokenId, "/agent1/files/../manifest.json", "bafyb");

        // Make next call execute as ALICE.
        vm.prank(ALICE);
        // Expect invalid-path revert for multiple dots in final segment.
        vm.expectRevert(PinataFS.InvalidPath.selector);
        // Final segment with `..` should fail parser validation.
        fs.writeFile(address(permissionNft), tokenId, "/agent1/files/manifest..json", "bafyc");

        // Make next call execute as ALICE.
        vm.prank(ALICE);
        // Expect invalid-path revert for unsupported symbol character.
        vm.expectRevert(PinataFS.InvalidPath.selector);
        // `@` is not in allowed charset.
        fs.writeFile(address(permissionNft), tokenId, "/agent1/files/mani@fest.json", "bafyd");
    }

    /// @notice Verifies prefix and file paths allow hyphen and underscore characters.
    /// @dev Test flow:
    /// 1. Mint token and grant prefixes containing both `-` and `_`.
    /// 2. Confirm prefix lookups succeed.
    /// 3. Write and read a file path containing both `-` and `_`.
    function testPathValidationAllowsHyphenAndUnderscore() public {
        // Mint non-transferable token for ALICE.
        uint256 tokenId = permissionNft.mintAccessToken(ALICE, false);

        // Replace this token's permission set with underscore and hyphen prefixes.
        string[] memory prefixes = new string[](2);
        prefixes[0] = "/community/testing_env";
        prefixes[1] = "/agent3/shared-files";
        fs.replaceTokenPrefixes(address(permissionNft), tokenId, prefixes);

        // Assert underscore prefix is recorded as allowed.
        require(
            fs.tokenHasPrefix(address(permissionNft), tokenId, "/community/testing_env"),
            "underscore prefix should be allowed"
        );
        // Assert hyphen prefix is recorded as allowed.
        require(
            fs.tokenHasPrefix(address(permissionNft), tokenId, "/agent3/shared-files"),
            "hyphen prefix should be allowed"
        );

        // Make next call execute as ALICE.
        vm.prank(ALICE);
        // Write a path containing both `-` and `_` characters.
        fs.writeFile(
            address(permissionNft), tokenId, "/agent3/shared-files/sub_dir/manifest_v1.json", "bafyhyphenunderscore"
        );

        // Read back CID at path with hyphen + underscore.
        string memory cid = fs.getFile("/agent3/shared-files/sub_dir/manifest_v1.json");
        // Assert write persisted successfully.
        require(_eq(cid, "bafyhyphenunderscore"), "hyphen/underscore path should be valid");
    }

    /// @notice Confirms last successful write overwrites CID at the same path.
    /// @dev Test flow: write v1, write v2 to same path, then assert read returns v2.
    function testLastWriteWinsByCid() public {
        // Mint token for ALICE with `/agent1` prefix.
        uint256 tokenId = _mintWithPrefix(permissionNft, ALICE, false, "/agent1");

        // Start a persistent prank so both writes are sent by ALICE.
        vm.startPrank(ALICE);
        // First write sets initial CID value.
        fs.writeFile(address(permissionNft), tokenId, "/agent1/files/manifest.json", "bafy-v1");
        // Second write to same path overwrites previous CID.
        fs.writeFile(address(permissionNft), tokenId, "/agent1/files/manifest.json", "bafy-v2");
        // End persistent prank context.
        vm.stopPrank();

        // Read latest CID at the path.
        string memory cid = fs.getFile("/agent1/files/manifest.json");
        // Assert second write is the value currently stored.
        require(_eq(cid, "bafy-v2"), "latest cid should win");
    }

    /// @notice Ensures very long paths are accepted when otherwise valid.
    /// @dev Test flow: mint, write to long valid path, and read it back.
    function testLongPathWritesRemainValid() public {
        // Mint token for ALICE with `/a` prefix.
        uint256 tokenId = _mintWithPrefix(permissionNft, ALICE, false, "/a");

        // Make next call execute as ALICE.
        vm.prank(ALICE);
        // Write to a long but syntactically valid path.
        fs.writeFile(
            address(permissionNft), tokenId, "/a/1234567890123456789012345678901234567890/manifest.json", "bafylong"
        );

        // Read back CID at long path.
        string memory cid = fs.getFile("/a/1234567890123456789012345678901234567890/manifest.json");
        // Assert long-path write persisted correctly.
        require(_eq(cid, "bafylong"), "long path should write successfully");
    }

    /// @notice Verifies external NFT collections are supported without any allowlist.
    /// @dev Test flow:
    /// 1. Mint token in secondary NFT contract.
    /// 2. Grant filesystem prefix to `(secondaryContract, tokenId)`.
    /// 3. Write and read successfully through that external collection key.
    function testExternalNftContractTokenCanWriteWhenPermitted() public {
        // Mint token in external permission NFT collection.
        uint256 tokenId = externalPermissionNft.mintAccessToken(ALICE, true);

        // Grant prefix permission for the external contract token.
        fs.replaceTokenPrefixes(address(externalPermissionNft), tokenId, _singlePrefixList("/shared/data"));

        // Make next call execute as ALICE.
        vm.prank(ALICE);
        // Write with external contract + token tuple.
        fs.writeFile(address(externalPermissionNft), tokenId, "/shared/data/sub/file1", "bafyexternal");

        // Read the stored CID back from filesystem.
        string memory cid = fs.getFile("/shared/data/sub/file1");
        // Assert write succeeded.
        require(_eq(cid, "bafyexternal"), "external nft token should be valid permission key");
    }

    /// @notice Verifies admin can permanently disable privileged operations via zero-address ownership.
    /// @dev Test flow: transfer ownership to zero then assert owner-only functions revert.
    function testZeroOwnershipPermanentlyDisablesAdminActions() public {
        // Disable admin actions by setting owner to zero address.
        fs.transferOwnership(address(0));
        // Assert ownership was cleared.
        require(fs.owner() == address(0), "owner should be zero address");

        // Expect owner-only check to block prefix updates.
        vm.expectRevert(PinataFS.NotOwner.selector);
        // Attempt owner-only prefix upsert should fail after ownership burn.
        fs.replaceTokenPrefixes(address(permissionNft), 1, _singlePrefixList("/agent1"));

        // Expect owner-only check to block future ownership transfers too.
        vm.expectRevert(PinataFS.NotOwner.selector);
        // Attempt owner-only transferOwnership should fail once owner is zero.
        fs.transferOwnership(ALICE);
    }

    /// @notice Verifies invalid NFT contract addresses are rejected in admin and write paths.
    function testInvalidNftContractRejected() public {
        // Expect invalid NFT contract error for zero address in admin prefix update.
        vm.expectRevert(PinataFS.InvalidNftContract.selector);
        // Attempt prefix update with zero address should fail.
        fs.replaceTokenPrefixes(address(0), 1, _singlePrefixList("/agent1"));

        // Mint token in primary permission contract.
        uint256 tokenId = _mintWithPrefix(permissionNft, ALICE, false, "/agent1");

        // Make next call execute as ALICE.
        vm.prank(ALICE);
        // Expect invalid NFT contract error for EOA address in write call.
        vm.expectRevert(PinataFS.InvalidNftContract.selector);
        // Attempt write with non-contract address should fail.
        fs.writeFile(ALICE, tokenId, "/agent1/files/manifest.json", "bafybad");
    }

    /// @dev Helper to mint a token and add one prefix for concise test setup.
    function _mintWithPrefix(PermissionNFT collection, address to, bool transferable, string memory prefix)
        internal
        returns (uint256)
    {
        // Mint the permission token in the provided NFT collection.
        uint256 tokenId = collection.mintAccessToken(to, transferable);
        // Grant exactly one allowed prefix on filesystem for that token.
        fs.replaceTokenPrefixes(address(collection), tokenId, _singlePrefixList(prefix));
        // Return token id for caller test logic.
        return tokenId;
    }

    /// @dev Helper for creating a one-item prefix list for replacement calls.
    function _singlePrefixList(string memory prefix) internal pure returns (string[] memory) {
        string[] memory prefixes = new string[](1);
        prefixes[0] = prefix;
        return prefixes;
    }

    /// @dev Helper for deterministic string equality using keccak256 byte-hash comparison.
    function _eq(string memory a, string memory b) internal pure returns (bool) {
        // Return true when both strings have identical bytes.
        return keccak256(bytes(a)) == keccak256(bytes(b));
    }
}
