import SwiftUI

@main
struct CryptoCardDemoApp: App {
    @State private var store = AppStore(options: LaunchOptions())

    init() {
        // Navigation titles in Inter Display, like the website's headings; system font if it failed to load.
        let bar = UINavigationBar.appearance()
        if let large = UIFont(name: "InterDisplay-Bold", size: 34) {
            bar.largeTitleTextAttributes = [.font: UIFontMetrics(forTextStyle: .largeTitle).scaledFont(for: large)]
        }
        if let inline = UIFont(name: "InterDisplay-Medium", size: 17) {
            bar.titleTextAttributes = [.font: UIFontMetrics(forTextStyle: .headline).scaledFont(for: inline)]
        }
    }

    var body: some Scene {
        WindowGroup {
            RootView(store: store)
                .tint(Design.accent)
        }
    }
}

struct RootView: View {
    let store: AppStore
    @Environment(\.scenePhase) private var scenePhase
    @State private var tab = "card"
    @State private var sheet: AppSheet?
    @State private var walletFlow = WalletSignInFlow()
    @State private var eventStream = EventStream()

    var body: some View {
        ZStack {
            Group {
                if store.options.fixture && store.options.screen == "topup-status" {
                    TopUpStatusPreview(scenario: store.options.scenario)
                } else if store.connected {
                    TabView(selection: $tab) {
                        NavigationStack { CardScreen(store: store, sheet: $sheet) }
                            .tabItem { Label("Card", image: "GlyphCard") }.tag("card")
                        NavigationStack { HistoryScreen(store: store) }
                            .tabItem { Label("Activity", image: "GlyphActivity") }.tag("history")
                        NavigationStack { SettingsScreen(store: store, walletFlow: walletFlow, sheet: $sheet) }
                            .tabItem { Label("Settings", image: "GlyphCarving") }.tag("settings")
                    }
                } else {
                    NavigationStack {
                        if store.options.fixture && store.options.screen == "wallet" {
                            WalletSignInScreen(flow: walletFlow, fixture: true) {
                                Task { await store.connectFixture() }
                            }
                        } else {
                            WelcomeScreen(store: store, walletFlow: walletFlow)
                        }
                    }
                }
            }
            if scenePhase != .active {
                Rectangle().fill(Design.background).ignoresSafeArea()
                    .overlay { Label("Card", systemImage: "lock.fill").font(.title2) }
                    .accessibilityLabel("Content hidden")
                    .zIndex(10)
            }
        }
        .sheet(item: $sheet) { item in
            switch item {
            case .topup: TopUpScreen(store: store, wallet: walletFlow.store)
            case .credentials: CredentialsScreen(store: store)
            case .testPurchase: TestPurchaseSheet(store: store)
            }
        }
        .onChange(of: scenePhase) {
            if scenePhase == .background, sheet != .topup { sheet = nil }
            if scenePhase == .active { walletFlow.checkExpiry() }
            if scenePhase == .active && store.connected && store.isServer { Task { await store.refresh() } }
        }
        .onChange(of: walletFlow.store?.authenticatedUser) { _, user in
            // A verified wallet session opens that wallet's own card; losing it closes the card view.
            if let user, let url = walletFlow.apiBaseURL, let token = walletFlow.store?.sessionToken {
                Task { await store.enterWallet(baseURL: url, user: user, token: token) }
            } else {
                store.leaveWallet()
            }
        }
        .task(id: store.isWallet && scenePhase == .active) {
            store.onWalletSessionExpired = { [walletFlow] in walletFlow.store?.expireSession() }
            // Foreground + wallet session: WebSocket signals, with 20 s polling only while it is down.
            // Leaving the foreground cancels this task, which closes the socket (defer below).
            guard store.isWallet && scenePhase == .active else { eventStream.stop(); return }
            if let request = store.eventStreamRequest() {
                eventStream.start(request: request) { await store.pollEvents() }
            }
            defer { eventStream.stop() }
            while store.isWallet && !Task.isCancelled {
                if !eventStream.isConnected { await store.pollEvents() }
                do { try await Task.sleep(for: .seconds(20)) } catch { return }
            }
        }
        .onOpenURL { walletFlow.handle(url: $0) }
        .task {
            if store.options.fixture && store.options.apiBaseURL != nil && !["welcome", "wallet"].contains(store.options.screen) {
                await store.connectFixture()
            }
            if ["history", "settings"].contains(store.options.screen) { tab = store.options.screen }
            if store.options.screen == "topup" && store.connected { sheet = .topup }
            if store.options.screen == "details" && store.connected { sheet = .credentials }
        }
    }
}

enum AppSheet: String, Identifiable {
    case topup, credentials, testPurchase
    var id: String { rawValue }
}

struct WelcomeScreen: View {
    let store: AppStore
    let walletFlow: WalletSignInFlow

    var body: some View {
        ScrollView {
            VStack(spacing: Design.large) {
                AppLogo()
                    .foregroundStyle(Design.accent)
                    .frame(width: 120, height: 120)
                    .padding(.top, Design.extraLarge)
                VStack(spacing: Design.small) {
                    Text("Your wallet.\nA simpler card.")
                        .font(Design.display(36))
                        .multilineTextAlignment(.center)
                        .accessibilityIdentifier("screen-welcome")
                    Text("Your card, balance and activity, in one place.")
                        .font(.body).foregroundStyle(Design.textSecondary).multilineTextAlignment(.center)
                }
                VStack(spacing: Design.medium) {
                    PrimaryButton(title: "Get started", symbol: "arrow.right") {
                        Task { await store.connectFixture() }
                    }
                    .accessibilityIdentifier("button-enter-fixture")
                    .disabled(store.isLoading)
                    NavigationLink(value: "wallet") {
                        Label { Text("Wallet sign-in") } icon: { Image("GlyphPasskey").renderingMode(.template) }
                            .font(Design.displayMedium(17, relativeTo: .headline))
                            .frame(maxWidth: .infinity, minHeight: 50)
                    }
                    .secondaryActionStyle()
                    .controlSize(.large)
                    .accessibilityIdentifier("button-open-wallet")
                }
                .padding(.top, Design.medium)
                if store.isLoading { ProgressView("Loading…") }
                if let message = store.errorMessage {
                    Label { Text(message) } icon: { Image(systemName: "exclamationmark.circle.fill").fontWeight(Design.symbolWeight) }
                        .font(.subheadline)
                        .foregroundStyle(Design.negative)
                        .surfaceCard()
                        .accessibilityIdentifier("welcome-error")
                }
            }
            .padding(.horizontal, Design.large)
        }
        .themedScreen()
        .navigationBarTitleDisplayMode(.inline)
        .navigationDestination(for: String.self) { destination in
            if destination == "wallet" {
                WalletSignInScreen(flow: walletFlow, fixture: store.options.fixture) {
                    Task { await store.connectFixture() }
                }
            }
        }
    }
}

struct ErrorNotice: View {
    let message: String
    let retry: () -> Void
    var body: some View {
        HStack(alignment: .top, spacing: Design.medium) {
            IconBadge(symbol: "wifi.exclamationmark", color: Design.warning, size: 32)
            VStack(alignment: .leading, spacing: Design.xs) {
                Text("Couldn't refresh").font(.headline)
                Text(message).font(.subheadline).foregroundStyle(Design.textSecondary).fixedSize(horizontal: false, vertical: true)
                Button("Try again", action: retry)
                    .font(.subheadline.weight(.semibold)).foregroundStyle(Design.accent)
                    .frame(minHeight: Design.minTouch)
            }
        }
        .surfaceCard()
        .accessibilityIdentifier("error-notice")
    }
}
