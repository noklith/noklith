import Foundation
import Observation

struct AuthenticatedWallet: Decodable, Equatable, Sendable {
    let id: String
    let walletAddress: String
    let authentication: String
    let chainId: Int
}

struct WalletSession: Decodable, Sendable {
    let accessToken: String
    let expiresAt: String
    let user: AuthenticatedWallet
}

@MainActor protocol WalletSignInAPI {
    func challenge(for account: WalletAccount) async throws -> WalletChallenge
    func verify(_ challenge: WalletChallenge, signature: String) async throws -> WalletSession
    func logout(token: String) async throws
}

@MainActor protocol WalletTokenVault {
    func save(_ token: String) throws
    func clear() throws
}

/// Connection, message review and authenticated API identity remain different states.
/// The SDK adapter supplies approved account changes; this object never imports a private key.
@MainActor @Observable final class WalletSignInStore {
    private(set) var account: WalletAccount?
    private(set) var challenge: WalletChallenge?
    private(set) var authenticatedUser: AuthenticatedWallet?
    private(set) var isWorking = false
    private(set) var errorMessage: String?
    @ObservationIgnored private let policy: WalletAuthPolicy
    @ObservationIgnored private let connector: any WalletConnector
    @ObservationIgnored private let api: any WalletSignInAPI
    @ObservationIgnored private let vault: any WalletTokenVault
    @ObservationIgnored private let now: () -> Date
    @ObservationIgnored private var generation = UUID()
    @ObservationIgnored private var token: String?
    @ObservationIgnored private var expiresAt: Date?

    init(policy: WalletAuthPolicy, connector: any WalletConnector, api: any WalletSignInAPI,
         vault: any WalletTokenVault, now: @escaping () -> Date = Date.init) {
        self.policy = policy
        self.connector = connector
        self.api = api
        self.vault = vault
        self.now = now
        connector.onAccountChange = { [weak self] account in self?.accountChanged(account) }
        connector.onError = { [weak self] error in self?.errorMessage = error.localizedDescription }
        accountChanged(connector.account)
    }

    func connect() {
        errorMessage = nil
        do { try connector.connect() }
        catch { errorMessage = error.localizedDescription }
    }

    func prepareMessage() async {
        guard !isWorking, let account, authenticatedUser == nil else { return }
        let operation = generation
        challenge = nil
        errorMessage = nil
        isWorking = true
        defer { if operation == generation { isWorking = false } }
        do {
            let received = try await api.challenge(for: account)
            guard current(operation, account) else { return }
            try received.validate(policy: policy, account: account, now: now())
            challenge = received
        } catch { if operation == generation { errorMessage = error.localizedDescription } }
    }

    // Called only after the user has been shown the server message and explicitly chooses to sign.
    func signReviewedMessage() async {
        guard !isWorking, let account, let challenge, authenticatedUser == nil else { return }
        let operation = generation
        isWorking = true
        errorMessage = nil
        defer { if operation == generation { isWorking = false } }
        do {
            try challenge.validate(policy: policy, account: account, now: now())
            let signature = try await connector.sign(message: challenge.message, for: account)
            guard current(operation, account) else { return }
            try challenge.validate(policy: policy, account: account, now: now())
            try WalletChallenge.validateSignature(signature)
            let session = try await api.verify(challenge, signature: signature)
            guard current(operation, account) else {
                try? await api.logout(token: session.accessToken)
                return
            }
            guard session.user.authentication == "siwe", session.user.chainId == account.chainID,
                  session.user.walletAddress.lowercased() == account.address.lowercased(),
                  UUID(uuidString: session.user.id) != nil,
                  session.accessToken.utf8.count == 43,
                  session.accessToken.utf8.allSatisfy({ (65...90).contains($0) || (97...122).contains($0) || (48...57).contains($0) || $0 == 45 || $0 == 95 }),
                  let expiry = WalletChallenge.date(session.expiresAt), expiry > now(), expiry <= now().addingTimeInterval(3630) else {
                try? await api.logout(token: session.accessToken)
                throw WalletAuthenticationError.invalidChallenge
            }
            do { try vault.save(session.accessToken) }
            catch {
                try? await api.logout(token: session.accessToken)
                throw error
            }
            token = session.accessToken
            expiresAt = expiry
            authenticatedUser = session.user
            self.challenge = nil
        } catch {
            if operation == generation {
                self.challenge = nil // Retry obtains a new nonce; never silently resubmit a consumed request.
                errorMessage = error.localizedDescription
            }
        }
    }

    /// Bearer token for card/top-up requests while signed in. Kept in memory and the wallet Keychain item only.
    var sessionToken: String? { authenticatedUser == nil ? nil : token }

    /// Sends the server-prepared transfer through the connected wallet after checking network and sender.
    func sendTransaction(_ request: WalletTransactionRequest) async throws -> String {
        guard let account, authenticatedUser != nil else { throw WalletTransactionError.wrongAccount }
        guard request.chainId == account.chainID else { throw WalletTransactionError.wrongNetwork }
        guard request.from.lowercased() == account.address.lowercased() else { throw WalletTransactionError.wrongAccount }
        let hash = try await connector.sendTransaction(request, for: account)
        try WalletTransactionError.validateHash(hash)
        // Returned even if the session changed meanwhile: the wallet already broadcast it, and the
        // server only credits a transfer from this sender to the agreed recipient.
        return hash.lowercased()
    }

    /// The server rejected the session token.
    func expireSession() { invalidate(message: String(localized: "Your session expired. Sign in again.")) }

    func checkExpiry() {
        connector.checkSession()
        if let expiresAt, expiresAt <= now() { invalidate(message: String(localized: "Your session expired. Sign in again.")) }
    }

    func disconnect() async {
        invalidate(message: nil)
        account = nil
        await connector.disconnect()
    }

    private func current(_ operation: UUID, _ expected: WalletAccount) -> Bool {
        operation == generation && account?.representsSameConnection(as: expected) == true
            && connector.account?.representsSameConnection(as: expected) == true
    }

    private func accountChanged(_ next: WalletAccount?) {
        if let account, let next, account.representsSameConnection(as: next) { return }
        invalidate(message: account == nil ? nil : WalletAuthenticationError.changedAccount.localizedDescription)
        account = next
    }

    private func invalidate(message: String?) {
        generation = UUID()
        let previous = token
        token = nil
        expiresAt = nil
        authenticatedUser = nil
        challenge = nil
        isWorking = false
        errorMessage = message
        do { try vault.clear() }
        catch { errorMessage = String(localized: "The saved session could not be cleared. Please try signing out again.") }
        if let previous { Task { try? await api.logout(token: previous) } }
    }
}
