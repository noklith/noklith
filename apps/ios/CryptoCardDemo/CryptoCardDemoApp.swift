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
                // Fixed text size: larger sizes broke words in buttons and activity rows. VoiceOver and Bold Text still apply.
                .dynamicTypeSize(.large)
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
                } else if store.options.fixture && store.options.screen == "deposit" {
                    // Sample address for review screenshots; no server is asked and nothing is sent.
                    NavigationStack { DepositAddressView(store: store, sample: Fixtures.depositAddress) }
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
            Group {
                switch item {
                case .topup: TopUpScreen(store: store, wallet: walletFlow.store)
                case .credentials: CredentialsScreen(store: store)
                case .testPurchase: TestPurchaseSheet(store: store)
                }
            }
            // Sheets take the text size from the system again, so the standard size is set here as well.
            .dynamicTypeSize(.large)
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
    static let space = "welcome"
    @State private var buttonsBottom: CGFloat = .infinity
    @Environment(\.dynamicTypeSize) private var textSize

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
                VStack(spacing: 12) {
                    Button { Task { await store.connectFixture() } } label: {
                        Text("Get started")
                            .frame(maxWidth: .infinity)
                            .overlay(alignment: .trailing) {
                                Image(systemName: "arrow.right").font(.system(size: 20, weight: .regular)).accessibilityHidden(true)
                            }
                    }
                    .buttonStyle(WelcomeButtonStyle(prominent: true))
                    .accessibilityIdentifier("button-enter-fixture")
                    .disabled(store.isLoading)
                    NavigationLink(value: "wallet") {
                        Text("Wallet sign-in").frame(maxWidth: .infinity)
                    }
                    .buttonStyle(WelcomeButtonStyle(prominent: false))
                    .accessibilityIdentifier("button-open-wallet")
                }
                .padding(.top, Design.medium)
                .background {
                    GeometryReader { proxy in
                        Color.clear.preference(key: WelcomeButtonsBottom.self, value: proxy.frame(in: .named(WelcomeScreen.space)).maxY)
                    }
                }
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
        // The USDT coin is tossed up from below the screen, behind the content (in front of the screen
        // colour, which themedScreen adds below it) and never above the buttons.
        .background {
            if !textSize.isAccessibilitySize {
                GeometryReader { proxy in
                    CoinToss(ceiling: buttonsBottom + Design.medium, size: proxy.size, animated: !store.options.fixture)
                }
                .ignoresSafeArea(edges: .bottom)
            }
        }
        .themedScreen()
        .coordinateSpace(name: WelcomeScreen.space)
        .onPreferenceChange(WelcomeButtonsBottom.self) { buttonsBottom = $0 }
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

private struct WelcomeButtonsBottom: PreferenceKey {
    static let defaultValue: CGFloat = .infinity
    // Views that do not report keep the default (infinity); the reported bottom edge is the smallest value.
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) { value = min(value, nextValue()) }
}

/// Large actions: a filled accent capsule or an outlined one, 56 pt tall by default, sentence case.
struct WelcomeButtonStyle: ButtonStyle {
    let prominent: Bool
    var height: CGFloat = 56
    @Environment(\.isEnabled) private var isEnabled
    func makeBody(configuration: Configuration) -> some View {
        let shape = RoundedRectangle(cornerRadius: 24, style: .continuous)
        configuration.label
            .font(Design.display(18, relativeTo: .headline))
            .foregroundStyle(prominent ? Design.onAccent : Design.accent)
            .padding(.horizontal, Design.large)
            .frame(maxWidth: .infinity, minHeight: height)
            .background { if prominent { shape.fill(Design.accent) } }
            .overlay { if !prominent { shape.strokeBorder(Design.accent, lineWidth: 1.5) } }
            .contentShape(shape)
            .opacity(isEnabled ? (configuration.isPressed ? 0.75 : 1) : 0.5)
    }
}

/// A USDT coin tossed up from below the screen: 120 pre-rendered rotation frames at 60 fps, then a short pause,
/// looped. The arc peaks just below `ceiling`, so the coin never rises over the buttons. Decorative only.
struct CoinToss: View {
    let ceiling: CGFloat
    /// The area the coin flies in; it enters and leaves through the bottom edge.
    let size: CGSize
    var animated = true
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    private static let flightFrames = 120
    private static let cycleFrames = 150
    private static let fps = 60.0
    /// The sprite is 192 pt with transparent margins for the tilts; the coin itself is about 128 pt.
    private static let sprite: CGFloat = 192
    private static let coinRadius: CGFloat = 64

    var body: some View {
        TimelineView(.animation(paused: !animated || reduceMotion)) { context in
            let frame = animated && !reduceMotion
                ? Int(context.date.timeIntervalSinceReferenceDate * Self.fps) % Self.cycleFrames
                : 45
            let start = size.height + Self.sprite / 2
            let apex = ceiling + Self.coinRadius
            if frame < Self.flightFrames, ceiling.isFinite, apex < start {
                let u = Double(frame) / Double(Self.flightFrames - 1)
                let height = 4 * u * (1 - u)
                Image(String(format: "UsdtToss%03d", frame))
                    .resizable()
                    .frame(width: Self.sprite, height: Self.sprite)
                    .position(x: size.width / 2, y: start - CGFloat(height) * (start - apex))
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .clipped()
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}

struct ErrorNotice: View {
    let message: String
    let retry: () -> Void
    var body: some View {
        HStack(alignment: .top, spacing: Design.medium) {
            IconBadge(symbol: "wifi.exclamationmark", size: 32)
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
