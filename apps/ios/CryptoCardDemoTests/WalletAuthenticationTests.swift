import XCTest
@testable import CryptoCardDemo

final class WalletAuthenticationTests: XCTestCase {
    private let address = "0x1111111111111111111111111111111111111111"
    private let requestID = "12345678-1234-4123-8123-123456789abc"
    private let now = ISO8601DateFormatter().date(from: "2026-10-08T01:00:00Z")!
    private var account: WalletAccount { WalletAccount(address: address, chainID: 84532, topic: "approved-session") }
    private var policy: WalletAuthPolicy { try! WalletAuthPolicy(origin: "https://demo.example", uri: "https://demo.example/sign-in", allowedChainIDs: [84532]) }
    private var challenge: WalletChallenge {
        WalletChallenge(id: requestID, message: """
        https://demo.example wants you to sign in with your Ethereum account:
        \(address)

        Sign in to Card. This does not authorize a transfer.

        URI: https://demo.example/sign-in
        Version: 1
        Chain ID: 84532
        Nonce: \(String(repeating: "a", count: 64))
        Issued At: 2026-10-08T01:00:00.000Z
        Expiration Time: 2026-10-08T01:05:00.000Z
        Request ID: \(requestID)
        """, expiresAt: "2026-10-08T01:05:00.000Z")
    }

    func testServerChallengeIsPreservedAndExpiryIsExact() throws {
        try challenge.validate(policy: policy, account: account, now: now)
        try challenge.validate(policy: policy, account: account, now: now.addingTimeInterval(299.999))
        XCTAssertThrowsError(try challenge.validate(policy: policy, account: account, now: now.addingTimeInterval(300))) {
            XCTAssertEqual($0 as? WalletAuthenticationError, .expiredChallenge)
        }
        XCTAssertThrowsError(try challenge.validate(policy: policy, account: account, now: now.addingTimeInterval(-31)))
    }

    func testDifferentAudienceAccountNetworkAndExtraFieldsAreNeverSigned() {
        for (before, after) in [
            ("https://demo.example wants", "https://attacker.example wants"),
            ("URI: https://demo.example/sign-in", "URI: https://demo.example/other"),
            (address, "0x2222222222222222222222222222222222222222"),
            ("Chain ID: 84532", "Chain ID: 1"), ("Version: 1", "Version: 2"),
            ("Request ID: \(requestID)", "Request ID: 12345678-1234-4123-8123-123456789abd"),
            ("does not authorize a transfer", "authorizes a transfer"),
            ("Issued At: 2026-10-08T01:00:00.000Z", "Issued At: 2026-10-08T00:00:00.000Z"),
        ] {
            let changed = WalletChallenge(id: requestID, message: challenge.message.replacingOccurrences(of: before, with: after), expiresAt: challenge.expiresAt)
            XCTAssertThrowsError(try changed.validate(policy: policy, account: account, now: now))
        }
        for suffix in ["\n", "\nResources:\n- https://attacker.example"] {
            XCTAssertThrowsError(try WalletChallenge(id: requestID, message: challenge.message + suffix, expiresAt: challenge.expiresAt)
                .validate(policy: policy, account: account, now: now))
        }
        XCTAssertThrowsError(try challenge.validate(policy: policy, account: WalletAccount(address: address, chainID: 1, topic: "approved-session"), now: now))
        XCTAssertThrowsError(try challenge.validate(policy: policy, account: WalletAccount(address: address, chainID: 84532, topic: ""), now: now))
    }

    func testPoliciesAndSignatureShapeFailClosed() throws {
        for chains in [[], [1], [10], [84532, 84532]] {
            XCTAssertThrowsError(try WalletAuthPolicy(origin: "https://demo.example", uri: "https://demo.example/sign-in", allowedChainIDs: chains))
        }
        // Base mainnet is a listed network; the server's mode decides whether it is offered.
        XCTAssertNoThrow(try WalletAuthPolicy(origin: "https://demo.example", uri: "https://demo.example/sign-in", allowedChainIDs: [8453]))
        for origin in ["http://demo.example", "https://demo.example/", "https://user:password@demo.example", "https://demo.example:443"] {
            XCTAssertThrowsError(try WalletAuthPolicy(origin: origin, uri: "https://demo.example/sign-in", allowedChainIDs: [84532]))
        }
        XCTAssertThrowsError(try WalletAuthPolicy(origin: "https://demo.example", uri: "https://other.example/sign-in", allowedChainIDs: [84532]))
        for port in [0, 65536] {
            let origin = "https://demo.example:\(port)"
            XCTAssertThrowsError(try WalletAuthPolicy(origin: origin, uri: origin + "/sign-in", allowedChainIDs: [84532]))
        }
        let signature = "0x" + String(repeating: "ab", count: 65)
        try WalletChallenge.validateSignature(signature)
        for malformed in [signature + "\n", signature + "00", "0x", "0x" + String(repeating: "zz", count: 65)] {
            XCTAssertThrowsError(try WalletChallenge.validateSignature(malformed))
        }
        XCTAssertFalse(account.representsSameConnection(as: WalletAccount(address: address, chainID: 84532, topic: "new-session")))
        XCTAssertNil(WalletChallenge.date("2026-10-08T01:00:00.000Z\n"))
    }
}
