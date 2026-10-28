import CryptoKit
import Foundation
import Security

private final class AuthRedirectPolicy: NSObject, URLSessionTaskDelegate {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(nil)
    }
}

/// Concrete transport, deliberately independent from fixture sessions and their Keychain namespace.
@MainActor final class WalletHTTPAPI: WalletSignInAPI {
    private let baseURL: URL
    private let policy: WalletAuthPolicy
    private let session: URLSession

    init(baseURL: URL, policy: WalletAuthPolicy) throws {
        guard baseURL.scheme == "https", baseURL.host != nil, baseURL.user == nil, baseURL.password == nil,
              baseURL.query == nil, baseURL.fragment == nil else { throw WalletAuthenticationError.invalidConfiguration }
        self.baseURL = baseURL
        self.policy = policy
        let config = URLSessionConfiguration.ephemeral
        config.httpCookieStorage = nil
        config.httpShouldSetCookies = false
        config.urlCache = nil
        config.timeoutIntervalForRequest = 20
        config.timeoutIntervalForResource = 25
        session = URLSession(configuration: config, delegate: AuthRedirectPolicy(), delegateQueue: nil)
    }

    deinit { session.invalidateAndCancel() }

    func challenge(for account: WalletAccount) async throws -> WalletChallenge {
        let config: Configuration = try await request("v1/config")
        guard config.schemaVersion == 1, ["testnet", "mainnet"].contains(config.networkMode), ["demo", "izipay"].contains(config.issuerMode),
              config.walletAuthEnabled, let metadata = config.walletAuth,
              metadata.origin == policy.origin, metadata.uri == policy.uri,
              Set(metadata.chainIds) == policy.allowedChainIDs,
              metadata.chainIds.count == policy.allowedChainIDs.count else { throw WalletAuthenticationError.unavailable }
        return try await request("v1/auth/challenge", body: ["address": account.address, "chain_id": account.chainID])
    }

    func verify(_ challenge: WalletChallenge, signature: String) async throws -> WalletSession {
        try await request("v1/auth/verify", body: ["challenge_id": challenge.id, "message": challenge.message, "signature": signature])
    }

    func logout(token: String) async throws {
        _ = try await data("v1/auth/logout", body: [:], token: token)
    }

    private func request<T: Decodable>(_ path: String, body: [String: Any]? = nil) async throws -> T {
        let bytes = try await data(path, body: body)
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        return try decoder.decode(T.self, from: bytes)
    }

    private func data(_ path: String, body: [String: Any]?, token: String? = nil) async throws -> Data {
        var request = URLRequest(url: baseURL.appendingPathComponent(path))
        request.httpMethod = body == nil ? "GET" : "POST"
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let body {
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        if let token { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        let (bytes, response) = try await session.data(for: request)
        guard let response = response as? HTTPURLResponse, bytes.count <= 65_536 else { throw ClientError.unexpectedResponse }
        guard (200..<300).contains(response.statusCode) else {
            if response.statusCode == 401 { throw ClientError.sessionExpired }
            if response.statusCode == 429 { throw ClientError.server(String(localized: "Too many sign-in attempts. Wait one minute and try again.")) }
            if response.statusCode == 422 { throw ClientError.server(String(localized: "Use a regular wallet account. Smart-contract wallets cannot sign in yet.")) }
            throw WalletAuthenticationError.unavailable
        }
        return bytes
    }

    private struct Configuration: Decodable {
        let schemaVersion: Int
        let issuerMode: String
        let networkMode: String
        let walletAuthEnabled: Bool
        let walletAuth: Metadata?
        struct Metadata: Decodable { let origin: String; let uri: String; let chainIds: [Int] }
    }
}

@MainActor struct WalletKeychainVault: WalletTokenVault {
    private let accountKey: String
    private let service = "com.example.CryptoCardDemo.wallet-session"

    init(baseURL: URL, policy: WalletAuthPolicy) {
        let context = [baseURL.absoluteString, policy.origin, policy.uri, policy.allowedChainIDs.sorted().map(String.init).joined(separator: ",")]
            .joined(separator: "\n")
        accountKey = SHA256.hash(data: Data(context.utf8)).map { String(format: "%02x", $0) }.joined()
    }

    private var query: [String: Any] {
        [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: accountKey]
    }

    func save(_ token: String) throws {
        var update: [String: Any] = [kSecValueData as String: Data(token.utf8),
            kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly]
        var status = SecItemUpdate(query as CFDictionary, update as CFDictionary)
        if status == errSecItemNotFound {
            update.merge(query) { _, value in value }
            status = SecItemAdd(update as CFDictionary, nil)
        }
        guard status == errSecSuccess else { throw NSError(domain: NSOSStatusErrorDomain, code: Int(status)) }
    }

    func clear() throws {
        let status = SecItemDelete(query as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else { throw NSError(domain: NSOSStatusErrorDomain, code: Int(status)) }
    }
}
