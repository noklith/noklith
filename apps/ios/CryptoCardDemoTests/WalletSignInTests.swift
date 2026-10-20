import XCTest
@testable import CryptoCardDemo

@MainActor final class WalletSignInTests: XCTestCase {
    private let time = ISO8601DateFormatter().date(from: "2026-10-08T01:00:00Z")!
    private func setup() throws -> (WalletSignInStore, TestWallet, TestSignInAPI, TestTokenVault) {
        let wallet = TestWallet()
        let api = TestSignInAPI()
        let vault = TestTokenVault()
        let policy = try WalletAuthPolicy(origin: "https://demo.example", uri: "https://demo.example/sign-in", allowedChainIDs: [84532])
        return (WalletSignInStore(policy: policy, connector: wallet, api: api, vault: vault, now: { self.time }), wallet, api, vault)
    }

    func testConnectionDoesNotAuthenticateAndReviewDoesNotAutomaticallySign() async throws {
        let (store, wallet, api, vault) = try setup()
        XCTAssertNotNil(store.account)
        XCTAssertNil(store.authenticatedUser)
        await store.prepareMessage()
        XCTAssertNotNil(store.challenge)
        XCTAssertEqual(wallet.signatures, 0)
        XCTAssertNil(vault.token)
        await store.signReviewedMessage()
        XCTAssertEqual(store.authenticatedUser?.walletAddress, wallet.account?.address)
        XCTAssertEqual(vault.token, api.session.accessToken)
        XCTAssertEqual(api.verifications, 1)
        await store.signReviewedMessage()
        XCTAssertEqual(api.verifications, 1)
        await store.disconnect()
        XCTAssertNil(store.authenticatedUser)
        XCTAssertNil(vault.token)
    }

    func testChangedAccountWhileSigningNeverReachesVerification() async throws {
        let (store, wallet, api, vault) = try setup()
        await store.prepareMessage()
        wallet.beforeSigningReturn = { wallet.changeTopic() }
        await store.signReviewedMessage()
        XCTAssertEqual(api.verifications, 0)
        XCTAssertNil(store.authenticatedUser)
        XCTAssertNil(vault.token)
    }

    func testLateSessionAfterWalletChangeIsRevokedAndNeverStored() async throws {
        let (store, wallet, api, vault) = try setup()
        await store.prepareMessage()
        api.beforeVerificationReturn = { wallet.changeTopic() }
        await store.signReviewedMessage()
        XCTAssertEqual(api.revoked, [api.session.accessToken])
        XCTAssertNil(store.authenticatedUser)
        XCTAssertNil(vault.token)
    }

    func testTransactionsRequireSignInMatchingNetworkSenderAndAWellFormedHash() async throws {
        let (store, wallet, _, _) = try setup()
        let request = WalletTransactionRequest(chainId: 84532, from: "0x1111111111111111111111111111111111111111",
                                               to: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", value: "0x0", data: "0xa9059cbb")
        // Connected but not signed in: nothing reaches the wallet.
        await assertThrowsAsync(WalletTransactionError.wrongAccount) { try await store.sendTransaction(request) }
        await store.prepareMessage()
        await store.signReviewedMessage()
        XCTAssertNotNil(store.sessionToken)
        let wrongNetwork = WalletTransactionRequest(chainId: 11155111, from: request.from, to: request.to, value: "0x0", data: request.data)
        await assertThrowsAsync(WalletTransactionError.wrongNetwork) { try await store.sendTransaction(wrongNetwork) }
        let otherSender = WalletTransactionRequest(chainId: 84532, from: "0x2222222222222222222222222222222222222222",
                                                   to: request.to, value: "0x0", data: request.data)
        await assertThrowsAsync(WalletTransactionError.wrongAccount) { try await store.sendTransaction(otherSender) }
        XCTAssertEqual(wallet.transactions, 0)
        wallet.transactionHash = "0xNOTAHASH"
        await assertThrowsAsync(WalletTransactionError.invalidHash) { try await store.sendTransaction(request) }
        wallet.transactionHash = "0x" + String(repeating: "CD", count: 32)
        let hash = try await store.sendTransaction(request)
        XCTAssertEqual(hash, "0x" + String(repeating: "cd", count: 32))
        XCTAssertEqual(wallet.transactions, 2)
        store.expireSession()
        XCTAssertNil(store.sessionToken)
        XCTAssertNil(store.authenticatedUser)
    }

    private func assertThrowsAsync<E: Error & Equatable>(_ expected: E, file: StaticString = #filePath, line: UInt = #line,
                                                          _ work: () async throws -> String) async {
        do {
            _ = try await work()
            XCTFail("Expected an error", file: file, line: line)
        } catch {
            XCTAssertEqual(error as? E, expected, file: file, line: line)
        }
    }

    func testKeychainFailureRevokesNewSession() async throws {
        let (store, _, api, vault) = try setup()
        await store.prepareMessage()
        vault.failSaving = true
        await store.signReviewedMessage()
        XCTAssertEqual(api.revoked, [api.session.accessToken])
        XCTAssertNil(store.authenticatedUser)
        XCTAssertNil(vault.token)
        XCTAssertNotNil(store.errorMessage)
    }
}

@MainActor private final class TestWallet: WalletConnector {
    var account: WalletAccount? = WalletAccount(address: "0x1111111111111111111111111111111111111111", chainID: 84532, topic: "session")
    var onAccountChange: ((WalletAccount?) -> Void)?
    var beforeSigningReturn: (() -> Void)?
    var signatures = 0
    var transactions = 0
    var transactionHash = "0x" + String(repeating: "ab", count: 32)
    func connect() throws {}
    func sendTransaction(_ request: WalletTransactionRequest, for account: WalletAccount) async throws -> String {
        transactions += 1
        return transactionHash
    }
    func sign(message: String, for account: WalletAccount) async throws -> String {
        signatures += 1
        beforeSigningReturn?()
        return "0x" + String(repeating: "ab", count: 65)
    }
    func disconnect() async { account = nil; onAccountChange?(nil) }
    func handle(url: URL) {}
    func changeTopic() {
        account = WalletAccount(address: account!.address, chainID: 84532, topic: "replacement")
        onAccountChange?(account)
    }
}

@MainActor private final class TestTokenVault: WalletTokenVault {
    var token: String?
    var failSaving = false
    func save(_ token: String) throws {
        if failSaving { throw WalletAuthenticationError.unavailable }
        self.token = token
    }
    func clear() throws { token = nil }
}

@MainActor private final class TestSignInAPI: WalletSignInAPI {
    var verifications = 0
    var revoked: [String] = []
    var beforeVerificationReturn: (() -> Void)?
    let session = WalletSession(accessToken: String(repeating: "a", count: 43), expiresAt: "2026-10-08T02:00:00.000Z",
        user: AuthenticatedWallet(id: "12345678-1234-4123-8123-123456789abc", walletAddress: "0x1111111111111111111111111111111111111111", authentication: "siwe", chainId: 84532))
    func challenge(for account: WalletAccount) async throws -> WalletChallenge {
        WalletChallenge(id: "12345678-1234-4123-8123-123456789abc", message: """
        https://demo.example wants you to sign in with your Ethereum account:
        \(account.address)

        Sign in to Card. This does not authorize a transfer.

        URI: https://demo.example/sign-in
        Version: 1
        Chain ID: 84532
        Nonce: \(String(repeating: "a", count: 64))
        Issued At: 2026-10-08T01:00:00.000Z
        Expiration Time: 2026-10-08T01:05:00.000Z
        Request ID: 12345678-1234-4123-8123-123456789abc
        """, expiresAt: "2026-10-08T01:05:00.000Z")
    }
    func verify(_ challenge: WalletChallenge, signature: String) async throws -> WalletSession {
        verifications += 1
        beforeVerificationReturn?()
        return session
    }
    func logout(token: String) async throws { revoked.append(token) }
}
