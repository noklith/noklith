import Foundation
import Security

struct APIConfiguration: Decodable {
    let schemaVersion: Int
    let issuerMode: String
    let networkMode: String
    let walletAuthEnabled: Bool
    let topUpEnabled: Bool
    let networks: [NetworkConfig]?
}
struct CardResponse: Decodable { let card: Card? }
struct HistoryResponse: Decodable { let items: [Activity]; let nextCursor: String? }
struct SessionResponse: Decodable {
    let accessToken: String
    let expiresAt: String
    let user: User
    struct User: Decodable { let id: String; let authentication: String }
}
struct APIProblem: Decodable {
    let error: Detail
    struct Detail: Decodable { let code: String; let message: String }
}

enum ClientError: LocalizedError {
    case insecureURL, unexpectedResponse, server(String), sessionExpired, fixtureUnavailable
    /// Server problem with a stable machine-readable code (e.g. limit_single_top_up).
    case api(code: String, message: String)
    var code: String? { if case .api(let code, _) = self { code } else { nil } }
    var errorDescription: String? {
        switch self {
        case .api(_, let message): message
        case .insecureURL: String(localized: "Use an HTTPS server address.")
        case .unexpectedResponse: String(localized: "The server returned an unexpected response. Try refreshing.")
        case .server(let message): message
        case .sessionExpired: String(localized: "Your session expired. Please connect again.")
        case .fixtureUnavailable: String(localized: "This server does not allow fixture sessions.")
        }
    }
}

struct APIClient {
    let baseURL: URL
    func request<T: Decodable>(_ path: String, method: String = "GET", query: [String: String] = [:], body: Data? = nil,
                               token: String? = nil, idempotencyKey: String? = nil) async throws -> T {
        let data = try await requestData(path, method: method, query: query, body: body, token: token, idempotencyKey: idempotencyKey)
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        return try decoder.decode(T.self, from: data)
    }

    func requestData(_ path: String, method: String = "GET", query: [String: String] = [:], body: Data? = nil,
                     token: String? = nil, idempotencyKey: String? = nil) async throws -> Data {
        guard baseURL.scheme == "https" else { throw ClientError.insecureURL }
        var components = URLComponents(url: baseURL.appendingPathComponent(path), resolvingAgainstBaseURL: false)
        if !query.isEmpty { components?.queryItems = query.sorted { $0.key < $1.key }.map { URLQueryItem(name: $0.key, value: $0.value) } }
        guard let url = components?.url else { throw ClientError.unexpectedResponse }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.timeoutInterval = 20
        request.httpBody = body
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if body != nil { request.setValue("application/json", forHTTPHeaderField: "Content-Type") }
        if let token { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        if let idempotencyKey { request.setValue(idempotencyKey, forHTTPHeaderField: "Idempotency-Key") }
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let response = response as? HTTPURLResponse else { throw ClientError.unexpectedResponse }
        if response.statusCode == 401 { throw ClientError.sessionExpired }
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        guard (200..<300).contains(response.statusCode) else {
            let problem = try? decoder.decode(APIProblem.self, from: data)
            throw ClientError.api(code: problem?.error.code ?? "http_\(response.statusCode)",
                                  message: problem?.error.message ?? String(localized: "The request could not be completed."))
        }
        return data
    }
}

// Tokens never enter SwiftData, logs, UserDefaults or sources. Device-only, unlocked access.
enum SessionKeychain {
    private static let service = "com.example.CryptoCardDemo.session"
    static func save(_ token: String) throws {
        try clear()
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service, kSecAttrAccount as String: "access-token",
            kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
            kSecValueData as String: Data(token.utf8)]
        let status = SecItemAdd(query as CFDictionary, nil)
        guard status == errSecSuccess else { throw NSError(domain: NSOSStatusErrorDomain, code: Int(status)) }
    }
    static func read() -> String? {
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service, kSecAttrAccount as String: "access-token",
            kSecReturnData as String: true, kSecMatchLimit as String: kSecMatchLimitOne]
        var result: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }
    static func clear() throws {
        let status = SecItemDelete([kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service] as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw NSError(domain: NSOSStatusErrorDomain, code: Int(status))
        }
    }
}
