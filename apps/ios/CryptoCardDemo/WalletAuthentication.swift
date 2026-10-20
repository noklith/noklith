import Foundation

struct WalletAccount: Equatable, Sendable {
    let address: String
    let chainID: Int
    let topic: String

    func representsSameConnection(as other: WalletAccount) -> Bool {
        address.lowercased() == other.address.lowercased() && chainID == other.chainID && topic == other.topic
    }
}

enum WalletAuthenticationError: LocalizedError, Equatable {
    case invalidConfiguration, invalidChallenge, expiredChallenge, changedAccount, invalidSignature, unavailable

    var errorDescription: String? {
        switch self {
        case .invalidConfiguration: String(localized: "Wallet sign-in has not been configured for this server.")
        case .invalidChallenge: String(localized: "The sign-in message does not match this app and wallet. Nothing was signed.")
        case .expiredChallenge: String(localized: "The sign-in request expired. Request a new message.")
        case .changedAccount: String(localized: "Your wallet account or network changed. Sign in again.")
        case .invalidSignature: String(localized: "This wallet returned an unsupported signature.")
        case .unavailable: String(localized: "Wallet sign-in is not available from this server.")
        }
    }
}

struct WalletAuthPolicy: Equatable, Sendable {
    let origin: String
    let uri: String
    let domain: String
    let allowedChainIDs: Set<Int>

    init(origin: String, uri: String, allowedChainIDs: [Int]) throws {
        guard !allowedChainIDs.isEmpty, Set(allowedChainIDs).count == allowedChainIDs.count,
              Set(allowedChainIDs).isSubset(of: Set(TestNetwork.names.keys)),
              let root = URLComponents(string: origin), let target = URLComponents(string: uri),
              root.scheme == "https", let host = root.host, !host.isEmpty,
              root.user == nil, root.password == nil, root.path.isEmpty, root.query == nil, root.fragment == nil,
              target.scheme == root.scheme, target.host == root.host, target.port == root.port,
              target.user == nil, target.password == nil, target.fragment == nil,
              uri.hasPrefix(origin + "/"),
              origin.unicodeScalars.allSatisfy({ (33...126).contains($0.value) }),
              uri.unicodeScalars.allSatisfy({ (33...126).contains($0.value) }),
              !origin.contains("\\"), !uri.contains("\\"),
              root.port == nil || ((1...65535).contains(root.port!) && root.port != 443) else {
            throw WalletAuthenticationError.invalidConfiguration
        }
        let domain = host.lowercased() + (root.port.map { ":\($0)" } ?? "")
        guard origin == "https://" + domain else { throw WalletAuthenticationError.invalidConfiguration }
        self.origin = origin
        self.uri = uri
        self.domain = domain
        self.allowedChainIDs = Set(allowedChainIDs)
    }
}

struct WalletChallenge: Decodable, Equatable, Sendable {
    let id: String
    let message: String
    let expiresAt: String

    // The current server emits precisely this SIWE subset. Reject new/ambiguous fields until
    // deliberately supported; never rebuild or alter the bytes that the wallet is asked to sign.
    func validate(policy: WalletAuthPolicy, account: WalletAccount, now: Date = Date()) throws {
        let lines = message.components(separatedBy: "\n")
        guard message.utf8.count <= 2048, lines.count == 12, !message.contains("\r"),
              Self.matches(id, "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"),
              Self.matches(account.address, "^0x[0-9a-fA-F]{40}$"),
              account.address.lowercased() != "0x" + String(repeating: "0", count: 40), !account.topic.isEmpty,
              policy.allowedChainIDs.contains(account.chainID),
              lines[0] == "https://\(policy.domain) wants you to sign in with your Ethereum account:",
              lines[1].lowercased() == account.address.lowercased(), lines[2].isEmpty,
              lines[3] == "Sign in to Card. This does not authorize a transfer.", lines[4].isEmpty,
              lines[5] == "URI: \(policy.uri)", lines[6] == "Version: 1", lines[7] == "Chain ID: \(account.chainID)",
              lines[8].hasPrefix("Nonce: "), Self.matches(String(lines[8].dropFirst(7)), "^[0-9a-f]{64}$"),
              lines[9].hasPrefix("Issued At: "), lines[10] == "Expiration Time: \(expiresAt)",
              lines[11] == "Request ID: \(id)",
              let issued = Self.date(String(lines[9].dropFirst(11))), let expires = Self.date(expiresAt),
              expires.timeIntervalSince(issued) == 300, issued <= now.addingTimeInterval(30) else {
            throw WalletAuthenticationError.invalidChallenge
        }
        guard expires > now else { throw WalletAuthenticationError.expiredChallenge }
    }

    static func validateSignature(_ signature: String) throws {
        guard matches(signature, "^0x[0-9a-fA-F]{130}$") else { throw WalletAuthenticationError.invalidSignature }
    }

    static func date(_ value: String) -> Date? {
        guard matches(value, "^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\\.[0-9]{3}Z$") else { return nil }
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        guard let parsed = formatter.date(from: value), formatter.string(from: parsed) == value else { return nil }
        return parsed
    }

    private static func matches(_ value: String, _ pattern: String) -> Bool {
        // NSRegularExpression's dollar anchor can accept a final newline; full-range equality cannot.
        let range = NSRange(value.startIndex..<value.endIndex, in: value)
        guard let regex = try? NSRegularExpression(pattern: pattern), let result = regex.firstMatch(in: value, range: range) else { return false }
        return result.range == range
    }
}

@MainActor protocol WalletConnector: AnyObject {
    var account: WalletAccount? { get }
    var onAccountChange: ((WalletAccount?) -> Void)? { get set }
    var onError: ((Error) -> Void)? { get set }
    func connect() throws
    func sign(message: String, for account: WalletAccount) async throws -> String
    /// Asks the external wallet to send exactly this transaction; returns its hash. The key never enters the app.
    func sendTransaction(_ request: WalletTransactionRequest, for account: WalletAccount) async throws -> String
    func disconnect() async
    func handle(url: URL)
    func checkSession()
}

extension WalletConnector {
    var onError: ((Error) -> Void)? { get { nil } set {} }
    func checkSession() {}
    func sendTransaction(_ request: WalletTransactionRequest, for account: WalletAccount) async throws -> String {
        throw WalletTransactionError.unsupported
    }
}

/// Networks this build may use. Which ones are active is decided by the server's configuration
/// (test networks on a test server, Polygon and BNB Smart Chain only when the server runs on real networks).
enum TestNetwork {
    static let names: [Int: String] = [84532: "Base Sepolia", 11155111: "Ethereum Sepolia", 46630: "Robinhood Chain Testnet",
                                       137: "Polygon", 56: "BNB Smart Chain"]
    static let testnets: Set<Int> = [84532, 11155111, 46630]
    static func isTest(_ chainID: Int) -> Bool { testnets.contains(chainID) }
    /// Name for a CAIP-2 reference such as eip155:84532.
    static func name(caip2: String) -> String? {
        guard caip2.hasPrefix("eip155:"), let id = Int(caip2.dropFirst(7)) else { return nil }
        return names[id]
    }
}

enum WalletTransactionError: LocalizedError, Equatable {
    case unsupported, wrongNetwork, wrongAccount, invalidHash

    var errorDescription: String? {
        switch self {
        case .unsupported: String(localized: "This wallet connection can't send transactions. Reconnect and allow transactions.")
        case .wrongNetwork: String(localized: "Switch your wallet to the network shown in the app and try again.")
        case .wrongAccount: String(localized: "The wallet account changed. Sign in again before topping up.")
        case .invalidHash: String(localized: "The wallet returned an unexpected transaction reference.")
        }
    }

    static func validateHash(_ hash: String) throws {
        guard hash.utf8.count == 66, hash.hasPrefix("0x"),
              hash.dropFirst(2).utf8.allSatisfy({ (48...57).contains($0) || (65...70).contains($0) || (97...102).contains($0) }) else {
            throw WalletTransactionError.invalidHash
        }
    }
}
