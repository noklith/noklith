import XCTest
@testable import CryptoCardDemo

final class WalletIntegrationConfigurationTests: XCTestCase {
    // Deliberately synthetic configuration; these tests never initialise an SDK or make requests.
    private var fields: [String: Any] {
        ["projectID": "0123456789abcdef0123456789abcdef",
         "groupIdentifier": "group.com.example.wallet-tests",
         "apiBaseURL": "https://api.example/wallet",
         "origin": "https://card.example",
         "uri": "https://card.example/sign-in",
         "chainIDs": [84532]]
    }

    private func plist(_ fields: [String: Any], format: PropertyListSerialization.PropertyListFormat = .binary) throws -> Data {
        try PropertyListSerialization.data(fromPropertyList: fields, format: format, options: 0)
    }

    private struct MissingConfiguration: Error {}

    // Plain throwing helper: XCTUnwrap would record a failure for the expected rejections.
    private func load(_ fields: [String: Any]) throws -> WalletIntegrationConfiguration {
        guard let value = try WalletIntegrationConfiguration.load(data: plist(fields), fixture: false) else {
            throw MissingConfiguration()
        }
        return value
    }

    func testFixtureLaunchDoesNotReadEvenMalformedDeploymentConfiguration() throws {
        enum UnexpectedRead: Error { case attempted }
        var reads = 0
        let configuration = try WalletIntegrationConfiguration.load(fixture: true) {
            reads += 1
            throw UnexpectedRead.attempted
        }
        XCTAssertNil(configuration)
        XCTAssertEqual(reads, 0)
        XCTAssertNil(try WalletIntegrationConfiguration.load(data: Data("malformed".utf8), fixture: true))
        XCTAssertNil(try WalletIntegrationConfiguration.load(data: plist(fields), fixture: true))

        XCTAssertNil(try WalletIntegrationConfiguration.load(fixture: false) {
            reads += 1
            return nil
        })
        XCTAssertEqual(reads, 1)
        XCTAssertNil(try WalletIntegrationConfiguration.load(data: nil, fixture: false))
    }

    func testCompleteConfigurationPreservesAudienceAndOnlyExplicitNetworks() throws {
        for chains in [[84532], [11155111], [11155111, 84532]] {
            var configured = fields
            configured["chainIDs"] = chains
            for format in [PropertyListSerialization.PropertyListFormat.xml, .binary] {
                let value = try XCTUnwrap(WalletIntegrationConfiguration.load(data: plist(configured, format: format), fixture: false))
                XCTAssertEqual(value.chainIDs, chains.sorted())
                XCTAssertEqual(value.policy.allowedChainIDs, Set(chains))
                XCTAssertEqual(value.policy.origin, "https://card.example")
                XCTAssertEqual(value.policy.uri, "https://card.example/sign-in")
                XCTAssertEqual(value.apiBaseURL.absoluteString, "https://api.example/wallet")
                XCTAssertEqual(value.groupIdentifier, "group.com.example.wallet-tests")
            }
        }
    }

    func testMissingUnknownAndMistypedFieldsNeverProducePartialConfiguration() throws {
        for key in fields.keys {
            var incomplete = fields
            incomplete.removeValue(forKey: key)
            XCTAssertThrowsError(try load(incomplete), "Missing field: \(key)")
        }
        var unknown = fields
        unknown["walletPrivateKey"] = "unsupported-field"
        XCTAssertThrowsError(try load(unknown))

        let invalidTypes: [(String, Any)] = [
            ("projectID", 1234), ("groupIdentifier", ["group.com.example.wallet-tests"]),
            ("apiBaseURL", true), ("origin", ["https://card.example"]),
            ("uri", 1234), ("chainIDs", "84532"), ("chainIDs", [true]),
            ("chainIDs", ["84532"]), ("chainIDs", [84532.5]),
        ]
        for (key, value) in invalidTypes {
            var malformed = fields
            malformed[key] = value
            XCTAssertThrowsError(try load(malformed), "Mistyped field: \(key)")
        }
    }

    func testEmptyDuplicateAndMainnetNetworkListsFailClosed() {
        for chains in [[], [0], [-1], [1], [10], [84532, 84532], [84532, 1], [11155111, 10]] {
            var configured = fields
            configured["chainIDs"] = chains
            XCTAssertThrowsError(try load(configured), "Rejected networks: \(chains)")
        }
    }

    func testProjectAndAppGroupMustBeExplicitWellFormedIdentifiers() {
        for projectID in ["", "REOWN_PROJECT_ID", String(repeating: "0", count: 32),
                          String(repeating: "g", count: 32), String(repeating: "a", count: 31),
                          String(repeating: "a", count: 33), " " + String(repeating: "a", count: 32),
                          String(repeating: "a", count: 32) + "\n"] {
            var configured = fields
            configured["projectID"] = projectID
            XCTAssertThrowsError(try load(configured))
        }
        for group in ["", "com.example.wallet", "group.", "group..wallet", "group.wallet.",
                      "Group.com.example.wallet", "group.com.example/wallet", "group.com.example_wallet",
                      "group.com.example wallet", "group.com.example.wallet\n",
                      "group." + String(repeating: "a", count: 250)] {
            var configured = fields
            configured["groupIdentifier"] = group
            XCTAssertThrowsError(try load(configured), "Rejected App Group: \(group)")
        }
    }

    func testAPIEndpointRejectsCredentialsAmbiguousEncodingAndNoncanonicalURLs() throws {
        for endpoint in ["", "/wallet", "http://api.example", "HTTPS://api.example", "https://API.example",
                         "https://user:password@api.example", "https://@api.example", "https://api.example?",
                         "https://api.example?token=private", "https://api.example#", "https://api.example/#wallet",
                         "https://api.example:443", "https://api.example:0", "https://api.example:65536",
                         "https://api.example/a/../wallet", "https://api.example/./wallet",
                         "https://api.example/%2e%2e/wallet", "https://api.example/%77allet",
                         "https://api.example\\wallet", "https://api.example/with space", "https://api.example\n"] {
            var configured = fields
            configured["apiBaseURL"] = endpoint
            XCTAssertThrowsError(try load(configured), "Rejected endpoint: \(endpoint)")
        }
        var configured = fields
        configured["apiBaseURL"] = "https://api.example:8443/wallet"
        XCTAssertEqual(try load(configured).apiBaseURL.absoluteString, "https://api.example:8443/wallet")
    }

    func testConfiguredSignInAudienceCannotSwitchToAnotherOrigin() {
        for uri in ["https://other.example/sign-in", "http://card.example/sign-in",
                    "https://card.example:8443/sign-in", "https://user@card.example/sign-in",
                    "https://card.example/sign-in#fragment"] {
            var configured = fields
            configured["uri"] = uri
            XCTAssertThrowsError(try load(configured), "Rejected sign-in URI: \(uri)")
        }
    }

    func testMalformedOrOversizedPlistsAreRejectedBeforeConfigurationExists() throws {
        XCTAssertThrowsError(try WalletIntegrationConfiguration.load(data: Data(), fixture: false))
        XCTAssertThrowsError(try WalletIntegrationConfiguration.load(data: Data("{\"chainIDs\":[84532]}".utf8), fixture: false))
        let array = try PropertyListSerialization.data(fromPropertyList: ["not", "a", "dictionary"], format: .binary, options: 0)
        XCTAssertThrowsError(try WalletIntegrationConfiguration.load(data: array, fixture: false))
        var oversized = fields
        oversized["apiBaseURL"] = "https://api.example/" + String(repeating: "x", count: 8192)
        let bytes = try plist(oversized)
        XCTAssertGreaterThan(bytes.count, 8192)
        XCTAssertThrowsError(try WalletIntegrationConfiguration.load(data: bytes, fixture: false))
    }
}
