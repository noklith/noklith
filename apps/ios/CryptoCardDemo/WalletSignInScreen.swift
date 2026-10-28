import Observation
import SwiftUI

/// Owned by the root so returning from an external wallet keeps the same pending request.
/// Merely opening the app or the unavailable screen never configures the SDK.
@MainActor @Observable final class WalletSignInFlow {
    private(set) var isAvailable = false
    private(set) var store: WalletSignInStore?
    private(set) var setupError: String?
    @ObservationIgnored private var configuration: WalletIntegrationConfiguration?
    @ObservationIgnored private var connector: (any WalletConnector)?
    @ObservationIgnored private var didLoad = false

    func prepare(fixture: Bool) {
        guard !didLoad else { return }
        didLoad = true
        configuration = try? WalletIntegrationConfiguration.load(fixture: fixture)
        isAvailable = configuration != nil
    }

    func connect() {
        guard let configuration else { return }
        setupError = nil
        do {
            if store == nil {
                let api = try WalletHTTPAPI(baseURL: configuration.apiBaseURL, policy: configuration.policy)
                let vault = WalletKeychainVault(baseURL: configuration.apiBaseURL, policy: configuration.policy)
                let adapter = try ReownWalletConnector(configuration: configuration)
                connector = adapter
                store = WalletSignInStore(policy: configuration.policy, connector: adapter, api: api, vault: vault)
            }
            store?.connect()
        } catch {
            setupError = (error as? WalletConnectionError)?.localizedDescription
                ?? String(localized: "Couldn't open wallet sign-in. Please try again.")
        }
    }

    func handle(url: URL) {
        // A deep link cannot initialize an unconfigured flow or trigger a signature.
        guard url.scheme == WalletIntegrationConfiguration.redirectURL.scheme,
              url.host == WalletIntegrationConfiguration.redirectURL.host else { return }
        connector?.handle(url: url)
    }

    func checkExpiry() { store?.checkExpiry() }

    /// Server for card and top-up requests once the wallet is signed in.
    var apiBaseURL: URL? { configuration?.apiBaseURL }

    func leaveForPreview() async { await store?.disconnect() }
}

struct WalletSignInScreen: View {
    let flow: WalletSignInFlow
    let fixture: Bool
    let explorePreview: () -> Void
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Design.large) {
                VStack(spacing: Design.medium) {
                    // The terracotta key turning slowly: 240 frames, one turn in 4 s, looped seamlessly.
                    FrameSequence(clip: AnimationClips.keySpin, size: 192, animated: !fixture)
                    Text("Your wallet\nstays yours.")
                        .font(Design.display(40))
                        .multilineTextAlignment(.center)
                        .accessibilityIdentifier("screen-wallet")
                }
                .frame(maxWidth: .infinity)
                if flow.isAvailable {
                    if let store = flow.store, let account = store.account {
                        WalletAccountDetails(account: account)
                        WalletSignInProgress(store: store)
                    } else {
                        Text("Choose an external wallet. You'll review a sign-in message before approving it in your wallet.")
                            .font(.title3).foregroundStyle(Design.textSecondary)
                        Text("Signing in does not authorize a transfer. This app never asks for your recovery phrase or private key.")
                            .foregroundStyle(Design.textSecondary)
                        PrimaryButton(title: "Connect wallet", symbol: "link", action: flow.connect)
                            .accessibilityIdentifier("button-connect-wallet")
                    }
                    if let error = flow.setupError ?? flow.store?.errorMessage {
                        Label(error, systemImage: "exclamationmark.circle.fill").foregroundStyle(Design.negative)
                            .accessibilityIdentifier("wallet-error")
                    }
                } else {
                    VStack(alignment: .leading, spacing: Design.small) {
                        Text("Wallet sign-in is\ncoming soon.")
                            .font(Design.display(24, relativeTo: .title2))
                            .accessibilityIdentifier("wallet-unavailable")
                        Text("Explore your card, activity and settings in the meantime.")
                            .font(.title3).foregroundStyle(Design.textSecondary)
                    }
                    .surfaceCard(padding: Design.large)
                }
            }
            .padding(.horizontal, Design.large)
            .padding(.top, Design.small)
        }
        .safeAreaInset(edge: .bottom) {
            VStack(spacing: Design.small) {
                Button {
                    Task {
                        await flow.leaveForPreview()
                        explorePreview()
                    }
                } label: {
                    Text("Explore the app")
                        .frame(maxWidth: .infinity)
                        .overlay(alignment: .trailing) {
                            Image(systemName: "arrow.right").font(.system(size: 20, weight: .regular)).accessibilityHidden(true)
                        }
                }
                .buttonStyle(WelcomeButtonStyle(prominent: true))
                .accessibilityIdentifier("button-wallet-preview")
                Text("No wallet connection needed")
                    .font(.footnote).foregroundStyle(Design.textSecondary)
            }
            .padding(.horizontal, Design.large)
            .padding(.bottom, Design.small)
            .background(Design.background)
        }
        .themedScreen()
        .navigationTitle("Wallet sign-in")
        .navigationBarTitleDisplayMode(.inline)
        .task { flow.prepare(fixture: fixture) }
        .task(id: scenePhase) {
            guard scenePhase == .active else { return }
            // Also expires an idle foreground session without waiting for another action.
            while !Task.isCancelled {
                flow.checkExpiry()
                do { try await Task.sleep(for: .seconds(15)) }
                catch { return }
            }
        }
    }
}

private struct WalletAccountDetails: View {
    let account: WalletAccount
    private var network: String {
        KnownNetwork.names[account.chainID] ?? "Unsupported network"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: Design.small) {
            Label(network, systemImage: "network").font(.headline)
            Text(account.address)
                .font(.callout.monospaced())
                .textSelection(.enabled)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityLabel("Wallet address: \(account.address)")
        }
    }
}

private struct WalletSignInProgress: View {
    let store: WalletSignInStore

    var body: some View {
        VStack(alignment: .leading, spacing: Design.medium) {
            if store.authenticatedUser != nil {
                Label("Signed in", systemImage: "checkmark.circle.fill")
                    .font(.title2.bold()).foregroundStyle(Design.accent)
                    .accessibilityIdentifier("wallet-authenticated")
                Text("Your wallet signature was verified. Your session is saved securely on this device.")
                    .foregroundStyle(Design.textSecondary)
            } else if let challenge = store.challenge {
                Text("Review your sign-in message").font(.title2.bold())
                Text("Read the complete message below. Continue only if the address and network match your wallet.")
                    .foregroundStyle(Design.textSecondary)
                Text(challenge.message)
                    .font(.footnote.monospaced())
                    .textSelection(.enabled)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(Design.medium)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Design.surface, in: RoundedRectangle(cornerRadius: Design.radius, style: .continuous))
                    .accessibilityIdentifier("wallet-sign-in-message")
                PrimaryButton(title: "Sign in with wallet", symbol: "signature") {
                    Task { await store.signReviewedMessage() }
                }
                .disabled(store.isWorking)
                .accessibilityIdentifier("button-sign-wallet-message")
            } else {
                Text("Connected. Review a message to sign in.").font(.title2.bold())
                Text("Connecting your wallet does not sign you in. Your signature proves you control this address.")
                    .foregroundStyle(Design.textSecondary)
                PrimaryButton(title: "Review sign-in message", symbol: "doc.text") {
                    Task { await store.prepareMessage() }
                }
                .disabled(store.isWorking)
                .accessibilityIdentifier("button-review-wallet-message")
            }
            if store.isWorking {
                ProgressView(store.challenge == nil ? "Preparing sign-in…" : "Waiting for your wallet…")
            }
            Button(store.authenticatedUser == nil ? "Disconnect wallet" : "Sign out and disconnect", role: .destructive) {
                Task { await store.disconnect() }
            }
            .frame(minHeight: 44)
            .accessibilityIdentifier("button-disconnect-wallet")
        }
    }
}
