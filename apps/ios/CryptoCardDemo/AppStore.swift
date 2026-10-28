import Foundation
import Observation

/// Which source of truth the interface shows. Fixture data never claims a network operation;
/// the wallet mode reads the testnet + DemoIssuer server through a verified wallet session.
enum DataMode: Equatable { case preview, serverFixture, wallet }

@MainActor @Observable
final class AppStore {
    private(set) var card: Card?
    private(set) var activities: [Activity] = []
    private(set) var limits: LimitsInfo?
    /// The latest unexpired payment code for an IZIPAY card, if the server receives cardholder mail.
    private(set) var paymentCode: PaymentCodeInfo.Code?
    private(set) var networks: [NetworkConfig] = []
    /// The server credits transfers to a personal deposit address.
    private(set) var depositsEnabled = false
    private(set) var isLoading = false
    private(set) var isMutating = false
    private(set) var connected = false
    private(set) var mode: DataMode = .preview
    private(set) var walletAddress: String?
    private(set) var walletChainID: Int?
    var errorMessage: String?
    let options: LaunchOptions
    /// Called when the server rejects the wallet session, so the wallet flow can sign out too.
    @ObservationIgnored var onWalletSessionExpired: (@MainActor () -> Void)?
    @ObservationIgnored private var cache: HistoryCache?
    @ObservationIgnored private var ownerID = "local-fixture"
    @ObservationIgnored private var mutationKey: String?
    @ObservationIgnored private var mutationAction: String?
    @ObservationIgnored private var sessionGeneration = UUID()
    @ObservationIgnored private var stateRevision = UUID()
    @ObservationIgnored private var walletBaseURL: URL?
    @ObservationIgnored private var walletToken: String?
    @ObservationIgnored private var lastEventSeq: String?

    var serverFixture: Bool { mode == .serverFixture }
    var isWallet: Bool { mode == .wallet }
    var isServer: Bool { mode != .preview }
    var localFixture: Bool { mode == .preview }
    var canUnfreeze: Bool { card?.status.isUserReversibleFreeze ?? false }
    var topUpAvailable: Bool { localFixture || (isWallet && !networks.isEmpty) }

    init(options: LaunchOptions) {
        self.options = options
        cache = try? HistoryCache(inMemory: options.apiBaseURL == nil)
        if options.fixture && options.apiBaseURL == nil && !["welcome", "wallet"].contains(options.screen) {
            enterLocalFixture()
        }
        // Fixture for the "session expired" state: the app returns to the start with an explanation.
        if options.fixture && options.screen == "welcome" && options.scenario == "expired" {
            errorMessage = ClientError.sessionExpired.localizedDescription
        }
    }

    // MARK: Session modes

    func enterLocalFixture() {
        sessionGeneration = UUID()
        mode = .preview
        connected = true
        card = Fixtures.card(scenario: options.scenario)
        activities = Fixtures.history(scenario: options.scenario)
        limits = nil
        paymentCode = nil
        errorMessage = options.scenario == "offline" ? String(localized: "You're offline. These are preview data. Try again when connected.") : nil
    }

    func connectFixture() async {
        guard !isLoading else { return }
        guard let url = options.apiBaseURL else { enterLocalFixture(); return }
        sessionGeneration = UUID()
        let generation = sessionGeneration
        isLoading = true
        defer { if generation == sessionGeneration { isLoading = false } }
        do {
            let api = APIClient(baseURL: url)
            let config: APIConfiguration = try await api.request("v1/config")
            guard generation == sessionGeneration else { return }
            guard options.fixture, config.schemaVersion == 1, config.networkMode == "fixture",
                  config.issuerMode == "demo" else { throw ClientError.fixtureUnavailable }
            try cache?.clear()
            try SessionKeychain.clear()
            let profile = ["empty", "risk"].contains(options.scenario) ? options.scenario : "standard"
            let body = try JSONSerialization.data(withJSONObject: ["profile": profile])
            let session: SessionResponse = try await api.request("v1/fixture/sessions", method: "POST", body: body)
            guard generation == sessionGeneration else { return }
            guard session.user.authentication == "fixture" else { throw ClientError.fixtureUnavailable }
            try SessionKeychain.save(session.accessToken)
            ownerID = session.user.id
            mode = .serverFixture
            connected = true
            await refresh()
        } catch { if generation == sessionGeneration { handle(error) } }
    }

    /// The wallet flow verified a SIWE session. Card data now comes from that wallet's own account.
    func enterWallet(baseURL: URL, user: AuthenticatedWallet, token: String) async {
        if isWallet, ownerID == user.id, walletToken == token { return }
        clearSession()
        let generation = sessionGeneration
        walletBaseURL = baseURL
        walletToken = token
        walletAddress = user.walletAddress
        walletChainID = user.chainId
        ownerID = user.id
        mode = .wallet
        connected = true
        do {
            let config: APIConfiguration = try await APIClient(baseURL: baseURL).request("v1/config")
            guard generation == sessionGeneration else { return }
            networks = config.topUpEnabled ? (config.networks ?? []) : []
            depositsEnabled = config.depositsEnabled ?? false
        } catch { if generation == sessionGeneration { networks = []; depositsEnabled = false } }
        await refresh()
    }

    /// The wallet session ended elsewhere (sign-out, expiry, account change).
    func leaveWallet() {
        guard isWallet else { return }
        clearSession()
    }

    private var serverURL: URL? { isWallet ? walletBaseURL : options.apiBaseURL }
    private func token() -> String? { isWallet ? walletToken : SessionKeychain.read() }

    /// Authenticated request against the current server session.
    func api<T: Decodable>(_ path: String, method: String = "GET", query: [String: String] = [:], json: [String: Any]? = nil,
                           idempotencyKey: String? = nil) async throws -> T {
        guard isServer, let url = serverURL, let token = token() else { throw ClientError.sessionExpired }
        let body = try json.map { try JSONSerialization.data(withJSONObject: $0) } ?? (method == "POST" ? Data("{}".utf8) : nil)
        do {
            return try await APIClient(baseURL: url).request(path, method: method, query: query, body: body, token: token, idempotencyKey: idempotencyKey)
        } catch ClientError.sessionExpired {
            if isWallet { onWalletSessionExpired?() }
            throw ClientError.sessionExpired
        }
    }

    // MARK: Card state

    func refresh() async {
        guard !isMutating else { return }
        guard isServer else {
            // Retrying a fixture error is a visible preview action, with no network claim.
            errorMessage = nil
            return
        }
        guard token() != nil else { handle(ClientError.sessionExpired); return }
        let generation = sessionGeneration
        let requestOwner = ownerID
        stateRevision = UUID()
        let revision = stateRevision
        isLoading = true
        defer { if generation == sessionGeneration && revision == stateRevision { isLoading = false } }
        do {
            async let cardResult: CardResponse = api("v1/card")
            async let historyResult: HistoryResponse = api("v1/history")
            let results = try await (cardResult, historyResult)
            var limitResult: LimitsInfo?
            if isWallet { limitResult = try? await api("v1/limits") as LimitsInfo }
            var codeResult: PaymentCodeInfo.Code?
            if isWallet, let issued = results.0.card, issued.issuerMode == "izipay" {
                // Absent on servers without cardholder mail (404): no code is shown then.
                codeResult = (try? await api("v1/cards/\(issued.id)/payment-code") as PaymentCodeInfo)?.paymentCode
            }
            guard generation == sessionGeneration, requestOwner == ownerID, revision == stateRevision else { return }
            card = results.0.card
            activities = results.1.items
            limits = limitResult
            paymentCode = codeResult
            // Pagination is implemented in API; the interface displays the latest page.
            try cache?.replace(activities, ownerID: requestOwner)
            errorMessage = nil
        } catch {
            guard generation == sessionGeneration && revision == stateRevision else { return }
            // Offline: keep showing this owner's cached history, clearly marked by the error notice.
            if activities.isEmpty, let cached = try? cache?.read(ownerID: requestOwner), !cached.isEmpty { activities = cached }
            handle(error)
        }
    }

    /// Change signals since the last poll; refetches REST state only when something changed.
    func pollEvents() async {
        guard isWallet, !isMutating else { return }
        let after = lastEventSeq ?? "0"
        let page: EventsPage
        do { page = try await api("v1/events", query: ["after": after]) } catch { return }
        let changed = lastEventSeq != nil && !page.items.isEmpty
        lastEventSeq = page.latestSeq
        if changed { await refresh() }
    }

    func toggleFreeze() async {
        guard let current = card, current.status == .active || current.status.isUserReversibleFreeze, !isMutating else { return }
        let action = current.status == .active ? "freeze" : "unfreeze"
        if localFixture {
            card?.status = current.status == .active ? .frozenByUser : .active // Preview.
            return
        }
        let generation = sessionGeneration
        stateRevision = UUID()
        isLoading = false
        isMutating = true
        defer { if generation == sessionGeneration { isMutating = false } }
        // Retain the same key after transport failure; a retry cannot perform a new mutation.
        if mutationAction != action { mutationKey = UUID().uuidString; mutationAction = action }
        do {
            let response: CardResponse = try await api("v1/cards/\(current.id)/\(action)", method: "POST", idempotencyKey: mutationKey)
            guard generation == sessionGeneration else { return }
            card = response.card
            mutationKey = nil
            mutationAction = nil
            errorMessage = nil
        } catch { if generation == sessionGeneration { handle(error) } }
    }

    func createCard() async {
        guard !isMutating, card == nil else { return }
        if localFixture {
            card = Card(id: "fixture-new-card", status: .active, currency: "USD", lastFour: "0428",
                    availableCents: "0", heldCents: "0", issuerMode: "demo")
            return
        }
        let generation = sessionGeneration
        stateRevision = UUID()
        isLoading = false
        isMutating = true
        defer { if generation == sessionGeneration { isMutating = false } }
        if mutationAction != "create" { mutationAction = "create"; mutationKey = UUID().uuidString }
        do {
            let response: CardResponse = try await api("v1/cards", method: "POST", idempotencyKey: mutationKey)
            guard generation == sessionGeneration else { return }
            card = response.card
            mutationKey = nil
            mutationAction = nil
            errorMessage = nil
        } catch { if generation == sessionGeneration { handle(error) } }
    }

    /// Short-lived card details from the server's issuer (wallet mode only), after device authentication.
    func revealCredentials() async throws -> TestCredentials {
        guard isWallet, let card else { throw ClientError.unexpectedResponse }
        return try await api("v1/cards/\(card.id)/credentials", method: "POST")
    }

    /// WebSocket request for change signals (wallet mode); nil when there is no server session.
    func eventStreamRequest() -> URLRequest? {
        guard isWallet, let base = walletBaseURL, let token = walletToken,
              var components = URLComponents(url: base.appendingPathComponent("v1/events/stream"), resolvingAgainstBaseURL: false),
              components.scheme == "https" else { return nil }
        components.scheme = "wss"
        guard let url = components.url else { return nil }
        var request = URLRequest(url: url)
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.timeoutInterval = 20
        return request
    }

    // MARK: Top-ups (wallet mode)

    func depositAddress() async throws -> DepositAddress { try await api("v1/deposit-address") }

    func walletBalances() async -> WalletBalances? {
        guard isWallet else { return nil }
        let balances: WalletBalances? = try? await api("v1/wallet/balances")
        return balances
    }

    func quoteTopUp(cents: Int64, network: NetworkConfig, asset: NetworkAsset, key: String) async throws -> TopUp {
        let envelope: TopUpEnvelope = try await api("v1/top-ups", method: "POST",
            json: ["chain_id": network.chainId, "asset": asset.symbol, "amount_cents": String(cents)], idempotencyKey: key)
        return envelope.topUp
    }

    func acceptTopUp(_ id: String) async throws -> TopUpAcceptance { try await api("v1/top-ups/\(id)/accept", method: "POST") }

    func submitTopUpHash(_ id: String, hash: String) async throws -> TopUp {
        let envelope: TopUpEnvelope = try await api("v1/top-ups/\(id)/transaction", method: "POST", json: ["transaction_hash": hash])
        return envelope.topUp
    }

    func checkTopUp(_ id: String) async throws -> TopUp {
        let envelope: TopUpEnvelope = try await api("v1/top-ups/\(id)/check", method: "POST")
        if envelope.topUp.status == .credited { await refresh() }
        return envelope.topUp
    }

    func cancelTopUp(_ id: String) async throws -> TopUp {
        let envelope: TopUpEnvelope = try await api("v1/top-ups/\(id)/cancel", method: "POST")
        return envelope.topUp
    }

    func recentTopUps() async -> [TopUp] {
        let list: TopUpList? = try? await api("v1/top-ups")
        return list?.items ?? []
    }

    // MARK: Test card events (restricted DemoIssuer tool)

    func testCardEvent(type: String, cents: String, merchant: String? = nil, authorizationID: String? = nil) async throws -> CardEventResult {
        var body: [String: Any] = ["type": type, "amount_cents": cents]
        if let merchant { body["merchant"] = merchant }
        if let authorizationID { body["authorization_id"] = authorizationID }
        let result: CardEventResult = try await api("v1/demo/card-events", method: "POST", json: body)
        await refresh()
        return result
    }

    // MARK: Preview

    func applyPreviewTopUp(cents: Int64, id: String) -> Bool {
        guard localFixture, card?.status == .active, cents > 0, cents <= 50_000,
              !activities.contains(where: { $0.id == id }), let existing = Int64(card?.availableCents ?? "") else { return false }
        let updated = existing.addingReportingOverflow(cents)
        guard !updated.overflow else { return false }
        card?.availableCents = String(updated.partialValue)
        activities.insert(Activity(id: id, kind: "top_up", status: "credited", amountCents: String(cents), currency: "USD",
            title: "Refill", occurredAt: ISO8601DateFormatter().string(from: Date()), network: nil,
            transactionHash: nil, demonstration: true), at: 0)
        return true
    }

    func signOut() async {
        let wasFixtureServer = serverFixture
        let token = wasFixtureServer ? SessionKeychain.read() : nil
        let url = options.apiBaseURL
        clearSession()
        let generation = sessionGeneration
        if let token, let url {
            do {
                _ = try await APIClient(baseURL: url).requestData("v1/auth/logout", method: "POST", body: Data("{}".utf8), token: token)
            } catch {
                guard generation == sessionGeneration else { return }
                errorMessage = String(localized: "Signed out on this device. If the server did not get the sign-out, the old session ends within an hour.")
            }
        }
    }

    private func clearSession() {
        sessionGeneration = UUID()
        stateRevision = UUID()
        connected = false
        mode = .preview
        card = nil
        activities = []
        limits = nil
        paymentCode = nil
        networks = []
        depositsEnabled = false
        walletAddress = nil
        walletChainID = nil
        walletBaseURL = nil
        walletToken = nil
        lastEventSeq = nil
        ownerID = "local-fixture"
        mutationKey = nil
        mutationAction = nil
        isLoading = false
        isMutating = false
        errorMessage = nil
        var cleanupFailed = false
        do { try SessionKeychain.clear() } catch { cleanupFailed = true }
        do { try cache?.clear() } catch { cleanupFailed = true }
        if cleanupFailed { errorMessage = String(localized: "Local session cleanup failed. Please try again.") }
    }

    private func handle(_ error: Error) {
        if case ClientError.sessionExpired = error {
            clearSession()
        }
        errorMessage = (error as? URLError).map { _ in String(localized: "You're offline or the server can't be reached. Try again when connected.") }
            ?? error.localizedDescription
    }
}
