import Combine
import Foundation
import ReownAppKit
import Security
import WalletConnectNetworking

enum WalletConnectionError: LocalizedError {
    case unsupportedSession, rejected, timedOut, unavailable, storageUnavailable

    var errorDescription: String? {
        switch self {
        case .unsupportedSession: String(localized: "Connect one account on a supported network and allow message signing.")
        case .rejected: String(localized: "The wallet declined the request. You can try again.")
        case .timedOut: String(localized: "The wallet request timed out. Please try again.")
        case .unavailable: String(localized: "The wallet connection is unavailable. Please reconnect.")
        case .storageUnavailable: String(localized: "Wallet storage is not enabled for this build. You can still explore the preview.")
        }
    }
}

/// Testable authorization boundary, independent of the SDK's choice of first account.
struct WalletApprovedAccount {
    let namespace: String
    let reference: String
    let address: String
    let canSign: Bool
    let hasChangeEvents: Bool
}

enum WalletSessionApproval {
    static func account(topic: String, expiry: Date, accounts: [WalletApprovedAccount],
                        allowedChains: Set<Int>, now: Date = Date()) throws -> WalletAccount {
        guard !topic.isEmpty, expiry > now, !accounts.isEmpty else { throw WalletConnectionError.unsupportedSession }
        var choices = [WalletAccount]()
        for entry in accounts {
            guard entry.namespace == "eip155", let chain = Int(entry.reference), String(chain) == entry.reference,
                  allowedChains.contains(chain), entry.canSign, entry.hasChangeEvents,
                  entry.address.utf8.count == 42, entry.address.hasPrefix("0x"),
                  entry.address.dropFirst(2).utf8.allSatisfy({ (48...57).contains($0) || (65...70).contains($0) || (97...102).contains($0) }),
                  entry.address.lowercased() != "0x" + String(repeating: "0", count: 40) else {
                throw WalletConnectionError.unsupportedSession
            }
            let candidate = WalletAccount(address: entry.address, chainID: chain, topic: topic)
            if !choices.contains(where: { $0.representsSameConnection(as: candidate) }) { choices.append(candidate) }
        }
        guard choices.count == 1, let account = choices.first else { throw WalletConnectionError.unsupportedSession }
        return account
    }
}

// JSON-RPC distinguishes numeric IDs from string IDs, even when their display text matches.
typealias ReownRPCID = RPCID

struct WalletResponseMatch {
    let id: ReownRPCID
    let account: WalletAccount
    func accepts(id: ReownRPCID?, topic: String?, chain: String?, current: WalletAccount?) -> Bool {
        id == self.id && topic == account.topic && chain == "eip155:\(account.chainID)"
            && current?.representsSameConnection(as: account) == true
    }
}

@MainActor final class ReownWalletConnector: WalletConnector {
    private(set) var account: WalletAccount?
    var onAccountChange: ((WalletAccount?) -> Void)?
    var onError: ((Error) -> Void)?
    private let configuration: WalletIntegrationConfiguration
    private let client: AppKitClient
    private var subscriptions = Set<AnyCancellable>()
    private var connectionDeadline: Date?
    private var connectionTimeout: Task<Void, Never>?
    private var signingTimeout: Task<Void, Never>?
    private var sendTask: Task<Void, Never>?
    private var sendID: ReownRPCID?
    private var pending: PendingSignature?
    private var cleanupRequired = false
    private var cleanupTask: Task<Void, Never>?
    private var cleanupTimeout: Task<Void, Never>?
    private static var configured: WalletIntegrationConfiguration?

    private struct PendingSignature {
        let match: WalletResponseMatch
        let continuation: CheckedContinuation<String, Error>
        /// Shape check for the wallet's string result (signature or transaction hash).
        let validate: (String) throws -> Void
    }

    init(configuration: WalletIntegrationConfiguration) throws {
        // The SDK uses this group as a Keychain access group with no private fallback.
        // Refuse before initializing its singletons if the signed build lacks access.
        try Self.checkStorage(group: configuration.groupIdentifier)
        if let existing = Self.configured {
            guard existing == configuration else { throw WalletAuthenticationError.invalidConfiguration }
        } else {
            let chains = configuration.chainIDs.compactMap { Blockchain("eip155:\($0)") }
            let metadata = AppMetadata(name: "Noklith", description: "Wallet sign-in for your Noklith card. Signing moves no money.",
                                       url: configuration.policy.origin, icons: [configuration.policy.origin + "/assets/noklith-icon-256.png"],
                                       redirect: try .init(native: WalletIntegrationConfiguration.redirectURL.absoluteString,
                                                           universal: nil, linkMode: false))
            Networking.configure(groupIdentifier: configuration.groupIdentifier, projectId: configuration.projectID,
                                 socketFactory: ReownWebSocketFactory(origin: configuration.policy.origin))
            Relay.instance.setLogging(level: .off)
            AppKit.configure(projectId: configuration.projectID, metadata: metadata, crypto: ReownCryptoProvider(),
                             sessionParams: SessionParams(namespaces: ["eip155": ProposalNamespace(
                                chains: chains, methods: ["personal_sign", "eth_sendTransaction"], events: ["accountsChanged", "chainChanged"])]),
                             authRequestParams: nil, includeWebWallets: false, coinbaseEnabled: false)
            Self.configured = configuration
        }
        self.configuration = configuration
        self.client = AppKit.instance
        client.disableAnalytics()
        subscribe()
    }

    func connect() throws {
        guard !cleanupRequired, pending == nil, sendTask == nil, connectionDeadline == nil else {
            throw WalletConnectionError.unavailable
        }
        let sessions = client.getSessions()
        if !sessions.isEmpty {
            do {
                guard sessions.count == 1, let session = sessions.first else { throw WalletConnectionError.unsupportedSession }
                setAccount(try approved(session))
            } catch {
                beginCleanup()
                throw error
            }
            return
        }
        connectionTimeout?.cancel()
        connectionDeadline = Date().addingTimeInterval(120)
        connectionTimeout = Task { [weak self] in
            do { try await Task.sleep(for: .seconds(120)) } catch { return }
            guard let self, connectionDeadline != nil else { return }
            beginCleanup()
            onError?(WalletConnectionError.timedOut)
        }
        AppKit.present()
    }

    func sign(message: String, for expected: WalletAccount) async throws -> String {
        guard message.utf8.count <= 2048 else { throw WalletAuthenticationError.changedAccount }
        // personal_sign receives precisely the reviewed UTF-8 bytes, encoded as Ethereum hex.
        let encoded = "0x" + message.utf8.map { String(format: "%02x", $0) }.joined()
        return try await perform(method: "personal_sign", params: AnyCodable([encoded, expected.address]), for: expected,
                                 validate: WalletChallenge.validateSignature)
    }

    func sendTransaction(_ transaction: WalletTransactionRequest, for expected: WalletAccount) async throws -> String {
        checkSession()
        guard transaction.chainId == expected.chainID else { throw WalletTransactionError.wrongNetwork }
        guard transaction.from.lowercased() == expected.address.lowercased() else { throw WalletTransactionError.wrongAccount }
        guard let session = client.getSessions().first(where: { $0.topic == expected.topic }),
              session.namespaces["eip155"]?.methods.contains("eth_sendTransaction") == true else {
            throw WalletTransactionError.unsupported
        }
        let params = [["from": transaction.from, "to": transaction.to, "data": transaction.data, "value": transaction.value]]
        return try await perform(method: "eth_sendTransaction", params: AnyCodable(params), for: expected,
                                 validate: WalletTransactionError.validateHash)
    }

    private func perform(method: String, params: AnyCodable, for expected: WalletAccount,
                         validate: @escaping (String) throws -> Void) async throws -> String {
        checkSession()
        guard !cleanupRequired, pending == nil, sendTask == nil, account?.representsSameConnection(as: expected) == true,
              let chain = Blockchain("eip155:\(expected.chainID)") else {
            throw WalletAuthenticationError.changedAccount
        }
        let request = try Request(topic: expected.topic, method: method, params: params, chainId: chain, ttl: 300)
        let requestID = request.id
        return try await withTaskCancellationHandler {
            try Task.checkCancellation()
            return try await withCheckedThrowingContinuation { continuation in
                pending = PendingSignature(match: WalletResponseMatch(id: requestID, account: expected), continuation: continuation, validate: validate)
                signingTimeout = Task { [weak self] in
                    do { try await Task.sleep(for: .seconds(120)) } catch { return }
                    self?.finish(id: requestID, result: .failure(WalletConnectionError.timedOut))
                }
                sendID = requestID
                let client = client
                sendTask = Task { [weak self] in
                    do {
                        try await client.request(params: request)
                        guard let self else { return }
                        completedSend(id: requestID)
                        guard !cleanupRequired, pending?.match.id == requestID,
                              account?.representsSameConnection(as: expected) == true else { return }
                        client.launchCurrentWallet()
                    } catch {
                        self?.completedSend(id: requestID)
                        self?.finish(id: requestID, result: .failure(WalletConnectionError.unavailable))
                    }
                }
            }
        } onCancel: {
            Task { @MainActor [weak self] in self?.finish(id: requestID, result: .failure(CancellationError())) }
        }
    }

    func disconnect() async {
        // Clear the app identity immediately. SDK cleanup can wait for the relay;
        // it must not keep the sign-out button or an awaiting signature alive.
        beginCleanup()
    }

    func handle(url: URL) {
        guard url.absoluteString.utf8.count <= 16384,
              let parts = URLComponents(url: url, resolvingAgainstBaseURL: false),
              parts.scheme == "cryptocarddemo", parts.host == "wallet-return",
              parts.user == nil, parts.password == nil, parts.port == nil, parts.fragment == nil,
              parts.path.isEmpty || parts.path == "/" else { return }
        _ = client.handleDeeplink(url)
    }

    func checkSession() {
        guard !cleanupRequired else { return }
        guard let account else { return }
        let sessions = client.getSessions()
        guard sessions.count == 1, let session = sessions.first,
              let current = try? approved(session), current.representsSameConnection(as: account) else {
            beginCleanup()
            return
        }
    }

    private func approved(_ session: Session) throws -> WalletAccount {
        let entries = session.namespaces.values.flatMap { namespace in
            namespace.accounts.map { entry in
                WalletApprovedAccount(namespace: entry.namespace, reference: entry.reference, address: entry.address,
                    canSign: namespace.methods.contains("personal_sign"),
                    hasChangeEvents: namespace.events.contains("accountsChanged") && namespace.events.contains("chainChanged"))
            }
        }
        return try WalletSessionApproval.account(topic: session.topic, expiry: session.expiryDate,
                                                  accounts: entries, allowedChains: configuration.policy.allowedChainIDs)
    }

    private func subscribe() {
        client.sessionSettlePublisher.receive(on: DispatchQueue.main).sink { [weak self] session in
            guard let self else { return }
            guard !cleanupRequired, let deadline = connectionDeadline, deadline > Date() else {
                beginCleanup()
                return
            }
            connectionTimeout?.cancel()
            connectionDeadline = nil
            do {
                guard client.getSessions().count == 1 else { throw WalletConnectionError.unsupportedSession }
                setAccount(try approved(session))
            } catch {
                beginCleanup()
                onError?(WalletConnectionError.unsupportedSession)
            }
        }.store(in: &subscriptions)
        client.sessionsPublisher.receive(on: DispatchQueue.main).sink { [weak self] _ in
            self?.checkSession()
        }.store(in: &subscriptions)
        client.sessionDeletePublisher.receive(on: DispatchQueue.main).sink { [weak self] payload in
            guard let self, account?.topic == payload.0 else { return }
            beginCleanup()
        }.store(in: &subscriptions)
        client.sessionRejectionPublisher.receive(on: DispatchQueue.main).sink { [weak self] _ in
            guard let self, connectionDeadline != nil else { return }
            beginCleanup()
            onError?(WalletConnectionError.rejected)
        }.store(in: &subscriptions)
        client.sessionEventPublisher.receive(on: DispatchQueue.main).sink { [weak self] payload in
            guard let self, account?.topic == payload.sessionTopic,
                  ["accountsChanged", "chainChanged"].contains(payload.event.name) else { return }
            // Even if the SDK namespace is unchanged, a wallet selection change invalidates sign-in.
            beginCleanup()
            onError?(WalletAuthenticationError.changedAccount)
        }.store(in: &subscriptions)
        client.sessionResponsePublisher.receive(on: DispatchQueue.main).sink { [weak self] response in
            guard let self, let pending,
                  !cleanupRequired,
                  pending.match.accepts(id: response.id, topic: response.topic, chain: response.chainId, current: account) else { return }
            checkSession()
            guard self.pending != nil else { return }
            switch response.result {
            case .response(let value):
                do {
                    let result = try value.get(String.self)
                    try pending.validate(result)
                    finish(id: pending.match.id, result: .success(result))
                } catch { finish(id: pending.match.id, result: .failure(error is WalletTransactionError ? error : WalletAuthenticationError.invalidSignature as Error)) }
            case .error:
                finish(id: pending.match.id, result: .failure(WalletConnectionError.rejected))
            }
        }.store(in: &subscriptions)
    }

    private func setAccount(_ next: WalletAccount?) {
        if let previous = account, let next, previous.representsSameConnection(as: next) { return }
        if let pending { finish(id: pending.match.id, result: .failure(WalletAuthenticationError.changedAccount)) }
        account = next
        onAccountChange?(next)
    }

    private func finish(id: ReownRPCID, result: Result<String, Error>) {
        guard let pending, pending.match.id == id else { return }
        self.pending = nil
        signingTimeout?.cancel()
        signingTimeout = nil
        sendTask?.cancel()
        pending.continuation.resume(with: result)
    }

    private func completedSend(id: ReownRPCID) {
        guard sendID == id else { return }
        sendID = nil
        sendTask = nil
    }

    private func beginCleanup() {
        cleanupRequired = true
        connectionTimeout?.cancel()
        connectionTimeout = nil
        connectionDeadline = nil
        setAccount(nil)
        guard cleanupTask == nil else { return }
        // Do not turn timeout into permission to reuse restored sessions. If the
        // SDK ignores cancellation, exactly one cleanup remains in flight and
        // connect/sign stay closed until it actually finishes successfully.
        cleanupTimeout?.cancel()
        cleanupTimeout = Task { [weak self] in
            do { try await Task.sleep(for: .seconds(20)) } catch { return }
            guard let self, cleanupTask != nil else { return }
            onError?(WalletConnectionError.unavailable)
        }
        let client = client
        cleanupTask = Task { [weak self] in
            do {
                try await client.cleanup()
                guard let self else { return }
                cleanupTimeout?.cancel()
                cleanupTimeout = nil
                cleanupTask = nil
                guard client.getSessions().isEmpty, client.getPairings().isEmpty else {
                    onError?(WalletConnectionError.unavailable)
                    return
                }
                cleanupRequired = false
            } catch {
                guard let self else { return }
                cleanupTimeout?.cancel()
                cleanupTimeout = nil
                cleanupTask = nil
                onError?(WalletConnectionError.unavailable)
            }
        }
    }

    private static func checkStorage(group: String) throws {
        guard FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group) != nil else {
            throw WalletConnectionError.storageUnavailable
        }
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: "com.example.CryptoCardDemo.wallet-preflight",
            kSecAttrAccount as String: UUID().uuidString, kSecAttrAccessGroup as String: group]
        var item = query
        item[kSecValueData as String] = Data([1])
        item[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        guard SecItemAdd(item as CFDictionary, nil) == errSecSuccess else { throw WalletConnectionError.storageUnavailable }
        guard SecItemDelete(query as CFDictionary) == errSecSuccess else { throw WalletConnectionError.storageUnavailable }
    }
}
