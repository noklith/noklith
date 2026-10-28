import Observation
import SwiftUI

/// Testnet top-up through the external wallet. Server state decides every step; the app never
/// shows success before the server credited the card, and retrying never sends a second transfer.
@MainActor @Observable final class TopUpFlowModel {
    enum Stage: Equatable { case amount, terms(TopUp), wallet(TopUp), tracking(TopUp) }

    var stage: Stage = .amount
    var amount = "25"
    /// Index into `options(store)`: which network and stablecoin pay for the refill.
    var choice = 0 { didSet { quoteKey = UUID().uuidString } }
    private(set) var working = false
    var errorMessage: String?
    private(set) var balances: WalletBalances?
    @ObservationIgnored private var quoteKey = UUID().uuidString
    @ObservationIgnored private var transaction: WalletTransactionRequest?
    @ObservationIgnored private var walletAttempted = false
    /// Hash the wallet returned. Once set, the transfer exists: retries only resubmit it, never re-send.
    private(set) var pendingHash: String?
    @ObservationIgnored private let authenticator: any DeviceAuthenticating

    init(authenticator: (any DeviceAuthenticating)? = nil) { self.authenticator = authenticator ?? DeviceAuthenticator() }

    var cents: Int64? { Money.cents(from: amount) }

    /// Every network and stablecoin the server accepts, in the server's order.
    func options(_ store: AppStore) -> [(network: NetworkConfig, asset: NetworkAsset)] {
        store.networks.flatMap { network in network.assets.map { (network: network, asset: $0) } }
    }
    func selected(_ store: AppStore) -> (network: NetworkConfig, asset: NetworkAsset)? {
        let all = options(store)
        return all.indices.contains(choice) ? all[choice] : all.first
    }
    func limitCents(_ store: AppStore) -> Int64 { Int64(store.limits?.limits.singleTopUpCents ?? "50000") ?? 50_000 }
    func amountValid(_ store: AppStore) -> Bool { cents.map { $0 > 0 && $0 <= limitCents(store) } ?? false }
    var walletWasOpened: Bool { walletAttempted }

    func amountChanged() { quoteKey = UUID().uuidString }

    func loadBalances(_ store: AppStore) async { balances = await store.walletBalances() }

    func review(_ store: AppStore) async {
        guard !working, let cents, let pick = selected(store) else { return }
        let network = pick.network, asset = pick.asset
        working = true
        defer { working = false }
        errorMessage = nil
        do { stage = .terms(try await store.quoteTopUp(cents: cents, network: network, asset: asset, key: quoteKey)) }
        catch { errorMessage = error.localizedDescription }
    }

    func editAmount(_ store: AppStore) async {
        if case .terms(let topUp) = stage, topUp.status == .quoted { _ = try? await store.cancelTopUp(topUp.id) }
        quoteKey = UUID().uuidString
        stage = .amount
    }

    /// Accept the terms and ask the external wallet to send exactly the server-prepared transfer.
    func confirm(_ store: AppStore, wallet: WalletSignInStore?) async {
        guard !working else { return }
        let current: TopUp
        switch stage {
        case .terms(let topUp), .wallet(let topUp): current = topUp
        default: return
        }
        working = true
        defer { working = false }
        errorMessage = nil
        // Device owner check before anything is accepted or sent to the wallet, like card details.
        do {
            try await authenticator.authenticate(reason: String(localized: "Confirm refill of \(Money.formatted(current.cardAmountCents))"))
        } catch {
            errorMessage = String(localized: "Refill not started. Confirm with Face ID, Touch ID or your device passcode to continue.")
            return
        }
        guard let wallet else { errorMessage = WalletTransactionError.wrongAccount.localizedDescription; return }
        do {
            if transaction == nil {
                let accepted = try await store.acceptTopUp(current.id)
                transaction = accepted.transaction
                stage = .wallet(accepted.topUp)
            }
            if let pendingHash {
                stage = .tracking(try await submit(store, id: current.id, hash: pendingHash))
                return
            }
            guard let transaction else { return }
            walletAttempted = true
            let hash = try await wallet.sendTransaction(transaction)
            // From here on the transfer exists: only the status can be refreshed, never re-sent.
            pendingHash = hash
            stage = .tracking(try await submit(store, id: current.id, hash: hash))
        } catch {
            errorMessage = error.localizedDescription
            if case .terms = stage, let code = (error as? ClientError)?.code, code == "top_up_state_conflict" {
                stage = .amount
            }
        }
    }

    private func submit(_ store: AppStore, id: String, hash: String) async throws -> TopUp {
        var lastError: Error?
        // The hash submission is idempotent; retry briefly so a dropped response doesn't strand the transfer.
        for attempt in 0..<3 {
            do { return try await store.submitTopUpHash(id, hash: hash) }
            catch { lastError = error; try? await Task.sleep(for: .seconds(Double(attempt + 1) * 2)) }
        }
        throw lastError ?? ClientError.unexpectedResponse
    }

    func cancel(_ store: AppStore) async {
        let current: TopUp
        switch stage {
        case .terms(let topUp), .wallet(let topUp): current = topUp
        default: return
        }
        working = true
        defer { working = false }
        do { stage = .tracking(try await store.cancelTopUp(current.id)) }
        catch { errorMessage = error.localizedDescription }
    }

    /// Polls the server while the transfer is pending. Ends at a final status or when the view goes away.
    func track(_ store: AppStore) async {
        while !Task.isCancelled, case .tracking(let topUp) = stage, !topUp.status.isFinal {
            do { try await Task.sleep(for: .seconds(4)) } catch { return }
            do {
                stage = .tracking(try await store.checkTopUp(topUp.id))
                errorMessage = nil
            } catch { errorMessage = error.localizedDescription }
        }
    }

    func startOver() {
        quoteKey = UUID().uuidString
        transaction = nil
        walletAttempted = false
        pendingHash = nil
        errorMessage = nil
        stage = .amount
    }
}

struct WalletTopUpView: View {
    let store: AppStore
    let wallet: WalletSignInStore?
    @Environment(\.dismiss) private var dismiss
    @State private var model = TopUpFlowModel()
    @FocusState private var amountFocused: Bool

    private var network: NetworkConfig? { model.selected(store)?.network }

    var body: some View {
        NavigationStack {
            Group {
                if case .amount = model.stage { amountStage } else { stepForm }
            }
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            // A container keeps the children's own identifiers (the bottom button sits outside the scroll view).
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier("screen-topup")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { RefillCloseButton { dismiss() } }
                ToolbarItemGroup(placement: .keyboard) { Spacer(); Button("Done") { amountFocused = false } }
            }
            .task { await model.loadBalances(store) }
            .task(id: trackingID) { await model.track(store) }
        }
    }

    private var title: LocalizedStringKey {
        switch model.stage {
        case .amount: "Refill"
        case .terms: "Review refill"
        case .wallet: "Confirm in wallet"
        case .tracking: "Refill status"
        }
    }

    private var trackingID: String? { if case .tracking(let topUp) = model.stage { topUp.id } else { nil } }

    /// Terms, wallet confirmation and tracking.
    private var stepForm: some View {
        Form {
            Group {
                switch model.stage {
                case .amount: EmptyView()
                case .terms(let topUp): termsSection(topUp)
                case .wallet(let topUp): walletSection(topUp)
                case .tracking(let topUp): TopUpStatusSection(topUp: topUp, onRefresh: { Task { await model.track(store) } })
                }
                if let error = model.errorMessage {
                    Section {
                        Label(error, systemImage: "exclamationmark.triangle").foregroundStyle(Design.negative)
                            .accessibilityIdentifier("topup-error")
                    }
                }
                if case .tracking(let topUp) = model.stage, topUp.status.isFinal { finalActions(topUp) }
            }
            .listRowBackground(Design.surface)
        }
        .themedList()
    }

    @ViewBuilder private var amountStage: some View {
        if let pick = model.selected(store) {
            let network = pick.network, asset = pick.asset, limit = Money.formatted(String(model.limitCents(store)))
            ScrollView {
                VStack(spacing: Design.large) {
                    RefillAmountHeader(amount: $model.amount, unit: asset.symbol,
                                       limitText: String(localized: "Maximum per refill: \(limit)"),
                                       invalidText: model.amountValid(store) ? nil
                                           : String(localized: "Enter more than $0 and no more than \(limit), with up to two decimal places."),
                                       focus: $amountFocused)
                        .onChange(of: model.amount) { model.amountChanged() }
                        .padding(.top, Design.large)
                    if let error = model.errorMessage {
                        Label(error, systemImage: "exclamationmark.triangle")
                            .foregroundStyle(Design.negative).multilineTextAlignment(.center)
                            .accessibilityIdentifier("topup-error")
                    }
                    let options = model.options(store)
                    if options.count > 1 {
                        Picker("Pay with", selection: $model.choice) {
                            ForEach(options.indices, id: \.self) { index in
                                Text("\(options[index].asset.symbol) on \(options[index].network.name)").tag(index)
                            }
                        }
                        .pickerStyle(.menu).tint(Design.accent)
                        .accessibilityIdentifier("refill-asset-picker")
                    }
                    RefillDetailsCard {
                        RefillDetailRow(title: "Token", value: asset.name)
                        RefillDetailRow(title: "Network", value: network.name)
                        RefillDetailRow(title: "Wallet balance", value: balanceText(asset: asset))
                        RefillDetailRow(title: "For network fees", value: gasText, last: true)
                    }
                    if store.depositsEnabled {
                        // From an exchange or another wallet: a personal address, no signature in this app.
                        NavigationLink {
                            DepositAddressView(store: store)
                        } label: {
                            HStack(spacing: Design.medium) {
                                Image(systemName: "qrcode")
                                    .font(.system(size: 22, weight: .regular))
                                    .foregroundStyle(Design.onAccent)
                                    .frame(width: 52, height: 52)
                                    .background(Design.accent, in: Circle())
                                    .accessibilityHidden(true)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text("Send from any wallet or exchange").font(Design.displayMedium(19, relativeTo: .body))
                                    Text("Your personal top-up address").font(.subheadline).foregroundStyle(Design.textSecondary)
                                }
                                Spacer(minLength: 0)
                                Image(systemName: "chevron.right").foregroundStyle(Design.textSecondary).accessibilityHidden(true)
                            }
                            .surfaceCard(padding: Design.medium + Design.xs)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("button-deposit-address")
                    }
                }
                .padding(.horizontal, Design.large)
            }
            .scrollDismissesKeyboard(.interactively)
            .safeAreaInset(edge: .bottom) {
                RefillReviewButton(working: model.working) { amountFocused = false; Task { await model.review(store) } }
                    .disabled(!model.amountValid(store) || model.working || store.card?.status == .blockedByRisk)
                    .padding(.horizontal, Design.large)
                    .padding(.bottom, Design.small)
                    .background(Design.background)
            }
            .themedScreen()
        } else {
            Label("Refills are not available on this server.", systemImage: "network.slash")
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .themedScreen()
        }
    }

    private func termsSection(_ topUp: TopUp) -> some View {
        Group {
            Section(header: Eyebrow("Review refill")) {
                AdaptiveDetailRow(title: "Card credit", value: Money.formatted(topUp.cardAmountCents))
                AdaptiveDetailRow(title: "You send", value: "\(TokenAmount.formatted(topUp.tokenUnits, decimals: topUp.tokenDecimals)) \(topUp.asset)")
                AdaptiveDetailRow(title: "Network", value: topUp.networkName)
                AdaptiveDetailRow(title: "Service fee", value: Money.formatted(topUp.serviceFeeCents))
                AdaptiveDetailRow(title: "Minimum credit", value: Money.formatted(topUp.minimumCardAmountCents))
                Text(topUp.networkFeeNote).font(.footnote).foregroundStyle(Design.textSecondary)
                if let expiry = topUp.quoteExpiry {
                    TimelineView(.periodic(from: .now, by: 1)) { context in
                        let remaining = max(0, Int(expiry.timeIntervalSince(context.date)))
                        Label(remaining > 0 ? "Terms valid for \(remaining / 60) min \(remaining % 60) s" : "These terms expired",
                              systemImage: "timer")
                            .font(.footnote).foregroundStyle(remaining > 0 ? Design.textSecondary : Design.negative)
                            .monospacedDigit()
                    }
                }
            }
            Section {
                PrimaryButton(title: "Confirm in wallet", symbol: "arrow.up.forward.app") { Task { await model.confirm(store, wallet: wallet) } }
                    .disabled(model.working || (topUp.quoteExpiry.map { $0 <= .now } ?? true))
                    .accessibilityIdentifier("button-confirm-wallet")
                Button("Edit amount") { Task { await model.editAmount(store) } }.frame(minHeight: 44).disabled(model.working)
            } footer: {
                Text("Your wallet will ask you to send \(topUp.asset) to the refill address. This app never sees your private key.")
            }
        }
    }

    private func walletSection(_ topUp: TopUp) -> some View {
        Group {
            Section {
                Label(model.working ? "Waiting for your wallet…" : "Approve the transfer in your wallet", systemImage: "arrow.up.forward.app")
                    .font(.headline)
                AdaptiveDetailRow(title: "Amount", value: "\(TokenAmount.formatted(topUp.tokenUnits, decimals: topUp.tokenDecimals)) \(topUp.asset)")
                AdaptiveDetailRow(title: "To", value: topUp.recipientAddress)
                if model.working { ProgressView() }
            }
            if !model.working {
                Section {
                    if model.pendingHash != nil {
                        // The wallet already sent the transfer; only the server confirmation is missing.
                        Text("Your wallet sent the transfer. Send its confirmation to Noklith again; nothing is sent twice.")
                            .font(.footnote).foregroundStyle(Design.textSecondary)
                        Button("Retry confirmation") { Task { await model.confirm(store, wallet: wallet) } }
                            .frame(minHeight: 44).accessibilityIdentifier("button-retry-submit")
                    } else {
                        if model.walletWasOpened {
                            Text("If you already approved the transfer in your wallet, don't send it again. Check your wallet's activity first.")
                                .font(.footnote).foregroundStyle(Design.textSecondary)
                        }
                        Button("Open wallet again") { Task { await model.confirm(store, wallet: wallet) } }
                            .frame(minHeight: 44).accessibilityIdentifier("button-retry-wallet")
                        Button("Cancel refill", role: .destructive) { Task { await model.cancel(store) } }.frame(minHeight: 44)
                    }
                }
            }
        }
    }

    private func finalActions(_ topUp: TopUp) -> some View {
        Section {
            if topUp.status == .credited {
                Button("Back to card") { dismiss() }.frame(maxWidth: .infinity, minHeight: 44)
            } else {
                Button("Start a new refill") { model.startOver() }.frame(maxWidth: .infinity, minHeight: 44)
                    .accessibilityIdentifier("button-new-topup")
            }
        }
    }

    private func balanceText(asset: NetworkAsset) -> String {
        guard let network, let info = model.balances?.networks.first(where: { $0.chainId == network.chainId }) else { return String(localized: "Loading…") }
        guard info.available, let units = info.assets.first(where: { $0.symbol == asset.symbol })?.units else { return String(localized: "Unavailable") }
        return "\(TokenAmount.formatted(units, decimals: asset.decimals)) \(asset.symbol)"
    }

    private var gasText: String {
        guard let network, let info = model.balances?.networks.first(where: { $0.chainId == network.chainId }) else { return String(localized: "Loading…") }
        guard info.available, let units = info.nativeUnits else { return String(localized: "Unavailable") }
        return "\(TokenAmount.formatted(units, decimals: 18, maxFraction: 5)) \(info.nativeSymbol ?? "ETH")"
    }
}

/// Status of a submitted top-up. Used by the live flow and by fixture screenshots of each state.
struct TopUpStatusSection: View {
    let topUp: TopUp
    var onRefresh: (() -> Void)?

    var body: some View {
        Section {
            VStack(spacing: Design.medium) {
                if let clip = statusClip {
                    // Terracotta status icon: turns right, left and back once (2.4 s), then rests.
                    FrameSequence(clip: clip, size: 112, loop: false, still: clip.order.count - 1, animated: animateIcon)
                        .id(topUp.status)
                } else {
                    IconBadge(symbol: symbol, size: 64)
                }
                Text(topUp.status.label)
                    .font(.title3.weight(.bold)).multilineTextAlignment(.center)
                    .foregroundStyle(topUp.status == .failed ? Design.negative : Color.primary)
                    .accessibilityIdentifier("topup-status-\(topUp.status.rawValue)")
                    .accessibilityValue(topUp.status.isFinal ? Text("") : Text(progress, format: .percent.precision(.fractionLength(0))))
                Text(explanation).font(.subheadline).foregroundStyle(Design.textSecondary)
                    .multilineTextAlignment(.center).fixedSize(horizontal: false, vertical: true)
                if !topUp.status.isFinal { ProgressView(value: progress).tint(Design.accent).accessibilityHidden(true) } // Read as the title's value.
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, Design.small)
        }
        Section(header: Eyebrow("Details")) {
            AdaptiveDetailRow(title: "Card credit", value: Money.formatted(topUp.cardAmountCents))
            AdaptiveDetailRow(title: "Network", value: topUp.networkName)
            if topUp.status == .confirming || topUp.status == .submitted {
                AdaptiveDetailRow(title: "Confirmations", value: "\(min(topUp.confirmations, topUp.requiredConfirmations)) of \(topUp.requiredConfirmations)")
            }
            if let hash = topUp.transactionHash {
                LabeledContent("Transaction") { Text(hash).font(.footnote.monospaced()).textSelection(.enabled).lineLimit(2).truncationMode(.middle) }
                if let link = topUp.explorerUrl.flatMap(URL.init(string:)) { Link("View on block explorer", destination: link).frame(minHeight: 44) }
            }
        }
        if !topUp.status.isFinal, let onRefresh {
            Section { Button("Refresh status", action: onRefresh).frame(minHeight: 44).accessibilityIdentifier("button-refresh-topup") }
        }
    }

    /// Played on screen; review screenshots show the resting frame.
    var animateIcon = true

    private var statusClip: FrameClip? {
        switch topUp.status {
        case .credited: AnimationClips.statusSuccess
        case .failed: AnimationClips.statusError
        case .cancelled, .expired: AnimationClips.statusExpired
        case .fundingPending: AnimationClips.statusCrediting
        default: nil
        }
    }

    private var statusColor: Color {
        switch topUp.status {
        case .credited: Design.positive
        case .failed: Design.negative
        case .cancelled, .expired: Design.textSecondary
        case .fundingPending: Design.warning
        default: Design.accent
        }
    }

    private var symbol: String {
        switch topUp.status {
        case .credited: "checkmark"
        case .failed: "xmark"
        case .cancelled, .expired: "clock.badge.xmark"
        case .fundingPending: "creditcard.and.123"
        default: "hourglass"
        }
    }

    private var progress: Double {
        switch topUp.status {
        case .submitted: 0.25
        case .confirming: 0.25 + 0.5 * Double(min(topUp.confirmations, topUp.requiredConfirmations)) / Double(max(topUp.requiredConfirmations, 1))
        case .fundingPending: 0.85
        default: 0.1
        }
    }

    private var explanation: String {
        switch topUp.status {
        case .submitted: String(localized: "Your wallet sent the transfer. We're waiting for it to appear on the network. You don't need to send it again.")
        case .confirming: String(localized: "The transfer is on the network. The card is credited after enough confirmations.")
        case .fundingPending: String(localized: "The transfer is confirmed. The card credit is in progress and will be retried automatically — nothing needs to be sent again.")
        case .credited: String(localized: "\(Money.formatted(topUp.cardAmountCents)) was added to your card.")
        case .failed: topUp.failureText ?? String(localized: "The refill could not be completed.")
        case .cancelled: String(localized: "This refill was cancelled. No transfer was requested.")
        case .expired: topUp.failureText ?? String(localized: "These terms expired.")
        case .quoted, .awaitingSignature: String(localized: "Waiting for your confirmation.")
        }
    }
}

/// Fixture-only rendering of each top-up state for review screenshots. Sample data, no transfer.
struct TopUpStatusPreview: View {
    let scenario: String
    var body: some View {
        NavigationStack {
            Form {
                Group {
                Section {
                    Label("Sample status screen. No transfer was made.", systemImage: "flask")
                        .font(.subheadline).foregroundStyle(Design.textSecondary)
                }
                if ["wrong_network", "rejected"].contains(scenario), let topUp = Fixtures.topUp(status: "awaiting_signature") {
                    // The wallet step after an error: nothing was sent; retry or cancel are both safe here.
                    Section {
                        Label("Approve the transfer in your wallet", systemImage: "arrow.up.forward.app").font(.headline)
                        AdaptiveDetailRow(title: "Amount", value: "\(TokenAmount.formatted(topUp.tokenUnits, decimals: topUp.tokenDecimals)) \(topUp.asset)")
                        AdaptiveDetailRow(title: "To", value: topUp.recipientAddress)
                    }
                    Section {
                        Label(scenario == "wrong_network" ? WalletTransactionError.wrongNetwork.localizedDescription
                              : WalletConnectionError.rejected.localizedDescription, systemImage: "exclamationmark.triangle")
                            .foregroundStyle(Design.negative).accessibilityIdentifier("topup-error")
                    }
                    Section {
                        Button("Open wallet again") {}.frame(minHeight: 44)
                        Button("Cancel refill", role: .destructive) {}.frame(minHeight: 44)
                    }
                } else if let topUp = Fixtures.topUp(status: scenario) {
                    if topUp.status == .quoted {
                        Section(header: Eyebrow("Review refill")) {
                            AdaptiveDetailRow(title: "Card credit", value: Money.formatted(topUp.cardAmountCents))
                            AdaptiveDetailRow(title: "You send", value: "\(TokenAmount.formatted(topUp.tokenUnits, decimals: topUp.tokenDecimals)) \(topUp.asset)")
                            AdaptiveDetailRow(title: "Network", value: topUp.networkName)
                            AdaptiveDetailRow(title: "Service fee", value: Money.formatted(topUp.serviceFeeCents))
                            Text(topUp.networkFeeNote).font(.footnote).foregroundStyle(Design.textSecondary)
                            Label("Terms valid for 9 min 41 s", systemImage: "timer").font(.footnote).foregroundStyle(Design.textSecondary)
                        }
                        Section { PrimaryButton(title: "Confirm in wallet", symbol: "arrow.up.forward.app") {}.disabled(true) }
                    } else {
                        TopUpStatusSection(topUp: topUp, onRefresh: topUp.status.isFinal ? nil : {}, animateIcon: false)
                    }
                }
                }
                .listRowBackground(Design.surface)
            }
            .themedList()
            .navigationTitle(scenario == "quoted" ? "Review refill" : "Refill status")
            .navigationBarTitleDisplayMode(.inline)
            .accessibilityIdentifier("screen-topup-status")
        }
    }
}
