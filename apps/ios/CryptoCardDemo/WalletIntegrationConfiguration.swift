import Foundation

/// Public build configuration. No wallet secrets belong in this file or the app bundle.
/// A missing configuration keeps the wallet flow unavailable; no network is selected implicitly.
struct WalletIntegrationConfiguration: Equatable, Sendable {
    let projectID: String
    let groupIdentifier: String
    let apiBaseURL: URL
    let policy: WalletAuthPolicy
    let chainIDs: [Int]
    static let redirectURL = URL(string: "cryptocarddemo://wallet-return")!

    init(projectID: String, groupIdentifier: String, apiBaseURL: String, origin: String, uri: String, chainIDs: [Int]) throws {
        guard projectID.utf8.count == 32,
              projectID.utf8.allSatisfy({ (48...57).contains($0) || (65...70).contains($0) || (97...102).contains($0) }),
              projectID != String(repeating: "0", count: 32),
              groupIdentifier.hasPrefix("group."), groupIdentifier.utf8.count <= 255,
              groupIdentifier.split(separator: ".", omittingEmptySubsequences: false).allSatisfy({
                  !$0.isEmpty && $0.utf8.allSatisfy { (48...57).contains($0) || (65...90).contains($0) || (97...122).contains($0) || $0 == 45 }
              }),
              apiBaseURL.utf8.count <= 2048,
              apiBaseURL.unicodeScalars.allSatisfy({ (33...126).contains($0.value) }),
              !apiBaseURL.contains("\\"), !apiBaseURL.contains("%"),
              let components = URLComponents(string: apiBaseURL), components.scheme == "https",
              let host = components.host, !host.isEmpty, host == host.lowercased(),
              components.user == nil, components.password == nil,
              components.query == nil, components.fragment == nil,
              components.port == nil || ((1...65535).contains(components.port!) && components.port != 443),
              !components.path.split(separator: "/").contains(where: { $0 == "." || $0 == ".." }),
              let url = components.url, url.absoluteString == apiBaseURL else {
            throw WalletAuthenticationError.invalidConfiguration
        }
        self.projectID = projectID
        self.groupIdentifier = groupIdentifier
        self.apiBaseURL = url
        self.policy = try WalletAuthPolicy(origin: origin, uri: uri, allowedChainIDs: chainIDs)
        self.chainIDs = chainIDs.sorted()
    }

    static func load(bundle: Bundle = .main, fixture: Bool) throws -> Self? {
        try load(fixture: fixture) {
            guard let url = bundle.url(forResource: "WalletIntegration", withExtension: "plist") else { return nil }
            return try Data(contentsOf: url)
        }
    }

    static func load(fixture: Bool, readData: () throws -> Data?) throws -> Self? {
        // Gate the resource lookup as well as decoding: fixture launches must not read
        // deployment configuration or create a route to initialise the wallet SDK.
        guard !fixture else { return nil }
        return try load(data: readData(), fixture: false)
    }

    static func load(data: Data?, fixture: Bool) throws -> Self? {
        guard !fixture, let data else { return nil }
        guard data.count <= 8192,
              let fields = try PropertyListSerialization.propertyList(from: data, format: nil) as? [String: Any],
              Set(fields.keys) == Set(["projectID", "groupIdentifier", "apiBaseURL", "origin", "uri", "chainIDs"]) else {
            throw WalletAuthenticationError.invalidConfiguration
        }
        let payload = try PropertyListDecoder().decode(Payload.self, from: data)
        return try Self(projectID: payload.projectID, groupIdentifier: payload.groupIdentifier, apiBaseURL: payload.apiBaseURL,
                        origin: payload.origin, uri: payload.uri, chainIDs: payload.chainIDs)
    }

    private struct Payload: Decodable {
        let projectID: String
        let groupIdentifier: String
        let apiBaseURL: String
        let origin: String
        let uri: String
        let chainIDs: [Int]
    }
}
