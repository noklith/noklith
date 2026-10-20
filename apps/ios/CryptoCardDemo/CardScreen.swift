import SwiftUI

struct CardScreen: View {
    let store: AppStore
    @Binding var sheet: AppSheet?
    @AppStorage("balanceHidden") private var balanceHidden = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        ScrollView {
            VStack(spacing: Design.large) {
                if let error = store.errorMessage {
                    ErrorNotice(message: error) { Task { await store.refresh() } }
                }
                if let card = store.card {
                    balance(card)
                    actions(card)
                    InteractiveCard(card: card, previewAngle: store.options.fixture && store.options.scenario == "tilted" ? 24 : nil)
                    statusNotice(card)
                    if let code = store.paymentCode { PaymentCodeNotice(code: code) }
                    if store.isWallet, store.networks.isEmpty {
                        Text("Refills are not enabled on this server yet.").font(.footnote).foregroundStyle(Design.textSecondary)
                    }
                    // IZIPAY authorizes purchases itself, so our spend limits would only mislead there.
                    if let limits = store.limits, limits.spendLimitsEnforced != false, card.issuerMode != "izipay" {
                        MonthlySpendBar(limits: limits)
                    }
                    recentActivity
                } else {
                    ContentUnavailableView {
                        Label("No card yet", systemImage: "creditcard.fill")
                    } description: {
                        Text("Create your card to get started.")
                    } actions: {
                        Button("Create card") { Task { await store.createCard() } }
                            .primaryActionStyle().foregroundStyle(Design.onAccent).disabled(store.isMutating)
                    }
                    .padding(.top, Design.extraLarge)
                }
            }
            .padding(.horizontal, Design.medium)
            .padding(.top, Design.small)
        }
        .themedScreen()
        .refreshable { await store.refresh() }
        .overlay { if store.isLoading { ProgressView("Refreshing…").padding().controlSurface() } }
        .toolbar(.hidden, for: .navigationBar)
        .accessibilityIdentifier("screen-card")
    }

    // MARK: Balance

    private func balance(_ card: Card) -> some View {
        VStack(spacing: Design.small) {
            Eyebrow("On your card")
            HStack(spacing: Design.xs) {
                Text(balanceHidden ? "••••••" : Money.formatted(card.availableCents))
                    .font(Design.display(44)).monospacedDigit()
                    .lineLimit(1).minimumScaleFactor(0.5)
                    .contentTransition(.numericText())
                    .accessibilityLabel(balanceHidden ? String(localized: "Available balance hidden")
                                        : String(localized: "Available balance: \(Money.formatted(card.availableCents))"))
                Button {
                    withAnimation(Design.spring(reduceMotion: reduceMotion)) { balanceHidden.toggle() }
                } label: {
                    Image(systemName: balanceHidden ? "eye.slash.fill" : "eye.fill")
                        .font(.system(size: 17, weight: Design.symbolWeight))
                        .foregroundStyle(Design.textSecondary)
                        .frame(width: Design.minTouch, height: Design.minTouch)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(balanceHidden ? "Show balance" : "Hide balance")
                .accessibilityIdentifier("button-toggle-balance")
            }
            Text("Available balance").font(.subheadline).foregroundStyle(Design.textSecondary)
                .accessibilityHidden(true) // Part of the amount's label.
            Label(balanceHidden ? String(localized: "On hold ••••") : String(localized: "On hold \(Money.formatted(card.heldCents))"),
                  systemImage: "clock.fill")
                .font(.footnote.weight(.semibold)).foregroundStyle(Design.textSecondary)
                .padding(.horizontal, Design.medium).padding(.vertical, Design.xs + 2)
                .background(Design.surface, in: Capsule())
            if card.availableCents == "0" && card.heldCents == "0" {
                Text("Your balance is empty. Refill with USDC to start using the card.")
                    .font(.footnote).foregroundStyle(Design.textSecondary).multilineTextAlignment(.center)
                    .accessibilityIdentifier("zero-balance-hint")
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.top, Design.medium)
    }

    // MARK: Actions

    /// A frozen card can still receive funds; a risk block, closure or replacement cannot.
    private func canTopUp(_ card: Card) -> Bool {
        guard store.topUpAvailable else { return false }
        return store.isWallet ? [.active, .frozenByUser, .frozenByRiskRule].contains(card.status) : card.status == .active
    }

    private func actions(_ card: Card) -> some View {
        let topUp = canTopUp(card)
        let detailsAvailable = !store.serverFixture && (card.status == .active || card.status.isUserReversibleFreeze)
        // For an IZIPAY card the server pauses it at IZIPAY first, so the state shown here is the issuer's.
        let freezeChangeable = card.status == .active || card.status.isUserReversibleFreeze
        let frozen = card.status.isUserReversibleFreeze
        return HStack(alignment: .top, spacing: Design.large) {
            CircleActionButton(title: "Refill", symbol: "plus", glyph: "GlyphReceive", mode: topUp ? .normal : .unavailable,
                               hint: topUp ? nil : "Unavailable for this card right now") { sheet = .topup }
                .disabled(!topUp)
                .accessibilityIdentifier("button-topup")
            CircleActionButton(title: "Details", symbol: "creditcard.viewfinder", glyph: "GlyphCard", mode: detailsAvailable ? .normal : .unavailable,
                               hint: "Shows card details after Face ID or your passcode") { sheet = .credentials }
                .disabled(!detailsAvailable)
                .accessibilityIdentifier("button-card-details")
            CircleActionButton(title: card.status == .frozenByRiskRule ? "Resume" : frozen ? "Resume" : "Pause",
                               symbol: frozen ? "play.fill" : "pause.fill", glyph: frozen ? "GlyphSun" : "GlyphHourglass",
                               mode: !freezeChangeable ? .unavailable : frozen ? .toggled : .normal,
                               hint: frozen ? "New purchases are paused. Double-tap to allow them again." : nil) {
                Task { await store.toggleFreeze() }
            }
            .disabled(!freezeChangeable || store.isMutating)
            .accessibilityIdentifier(frozen ? "button-unfreeze" : "button-freeze")
        }
        .frame(maxWidth: .infinity)
        .animation(Design.spring(reduceMotion: reduceMotion), value: card.status)
    }

    // MARK: Status

    @ViewBuilder private func statusNotice(_ card: Card) -> some View {
        switch card.status {
        case .blockedByRisk:
            notice(symbol: "exclamationmark.shield.fill", color: Design.negative,
                   text: "This card is blocked for review. It cannot be unlocked here.")
        case .frozenByUser:
            notice(symbol: "snowflake", color: Design.accent, text: "Frozen by you. New purchases are paused; refills still work.")
        case .frozenByRiskRule:
            notice(symbol: "exclamationmark.shield.fill", color: Design.warning,
                   text: "New purchases were paused after unusual activity. Review your recent activity, then resume the card if everything looks right.")
                .accessibilityIdentifier("rule-pause-notice")
        default:
            EmptyView()
        }
    }

    private func notice(symbol: String, color: Color, text: LocalizedStringKey) -> some View {
        HStack(alignment: .top, spacing: Design.medium) {
            IconBadge(symbol: symbol, color: color, size: 32)
            Text(text).font(.subheadline).fixedSize(horizontal: false, vertical: true)
        }
        .surfaceCard()
        .accessibilityElement(children: .combine)
    }

    // MARK: Activity

    private var recentActivity: some View {
        VStack(alignment: .leading, spacing: Design.small) {
            Eyebrow("Recent activity")
            HStack {
                Text("The latest movements.").font(Design.display(22, relativeTo: .title3))
                Spacer()
                NavigationLink { HistoryScreen(store: store) } label: {
                    Text("See all")
                        .font(.subheadline.weight(.semibold)).foregroundStyle(Design.accent)
                        .frame(minWidth: Design.minTouch, minHeight: Design.minTouch)
                        .contentShape(Rectangle())
                }
            }
            if store.activities.isEmpty {
                Text("No activity yet. Your refills will appear here.")
                    .font(.subheadline).foregroundStyle(Design.textSecondary)
                    .surfaceCard()
            } else {
                VStack(spacing: 0) {
                    ForEach(Array(store.activities.prefix(5).enumerated()), id: \.element.id) { index, activity in
                        if index > 0 { Divider().overlay(Design.separator).padding(.leading, Design.rowIcon + Design.medium * 2) }
                        NavigationLink { ActivityDetail(activity: activity, store: store) } label: {
                            ActivityRow(activity: activity, balanceHidden: balanceHidden)
                                .padding(.horizontal, Design.medium).padding(.vertical, Design.small + 2)
                                .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                    }
                }
                .stoneFramed()
            }
        }
    }
}

/// Card face: the Noklith sandstone cave painting (from the website), wordmark, last four digits
/// and status. Content, so never glass.
struct CardFace: View {
    let card: Card
    @Environment(\.dynamicTypeSize) private var textSize
    @AppStorage(CardFinish.storageKey) private var finishName = CardFinish.sandstone.rawValue
    private var finish: CardFinish { CardFinish(rawValue: finishName) ?? .sandstone }

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: Design.cardRadius, style: .continuous)
        let face = VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .center) {
                Text("NOKLITH").font(Design.displayMedium(15, relativeTo: .headline)).tracking(3)
                Spacer()
                AppLogo().frame(width: 26, height: 26)
            }
            Spacer(minLength: Design.medium)
            HStack(alignment: .firstTextBaseline) {
                Text("••••  \(card.lastFour)")
                    .font(Design.displayMedium(20, relativeTo: .title2)).monospacedDigit()
                Spacer()
                if card.status != .active {
                    Label(card.status.label, systemImage: card.status.isUserReversibleFreeze ? "pause.fill" : "lock.fill")
                        .font(.footnote.weight(.semibold))
                        .padding(.horizontal, Design.small).padding(.vertical, 3)
                        .background(Design.cardPatternDark.opacity(0.18), in: Capsule())
                }
            }
        }
        .padding(Design.large - 4)
        .foregroundStyle(finish.ink)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background {
            Image(finish.imageName)
                .resizable()
                .scaledToFill()
                .clipShape(shape)
            // Clipping hides the offset shapes but does not stop them taking touches over nearby buttons.
            .allowsHitTesting(false)
            .accessibilityHidden(true)
        }
        .clipShape(shape)
        .contentShape(shape)
        .accessibilityElement(children: .combine)
        // ID-1 proportions; at accessibility text sizes the content decides the height instead.
        if textSize.isAccessibilitySize { face } else { face.aspectRatio(Design.cardAspect, contentMode: .fit) }
    }
}

/// The card as a thick, solid object. It turns only left and right while held and always
/// springs back flat on release, so it can never be left at an angle. No gradients.
struct InteractiveCard: View {
    let card: Card
    /// Fixture-only fixed turn for review screenshots, in degrees around the vertical axis.
    var previewAngle: Double?
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.dynamicTypeSize) private var textSize
    @State private var angle: Double = 0
    @State private var mode: DragMode = .undecided

    private enum DragMode { case undecided, turning, scrolling }
    private static let maxAngle: Double = 35
    private static let depth: Double = 12
    /// Close to a real card in the hand on a phone screen.
    static let maxWidth: CGFloat = 320

    var body: some View {
        let y = previewAngle ?? angle
        // Projected offset of the back face: the edge peeks out on the side turning toward the viewer.
        let dx = -sin(y * Double.pi / 180) * Self.depth
        CardFace(card: card)
            .background {
                ZStack {
                    ForEach(1...8, id: \.self) { step in
                        RoundedRectangle(cornerRadius: Design.cardRadius, style: .continuous)
                            .fill(Design.cardEdge)
                            .offset(x: dx * Double(step) / 8)
                    }
                }
                .allowsHitTesting(false)
                .accessibilityHidden(true)
            }
            .rotation3DEffect(.degrees(y), axis: (x: 0, y: 1, z: 0), perspective: 0.55)
            // Accessibility text sizes need the full width for the card's labels.
            .frame(maxWidth: textSize.isAccessibilitySize ? .infinity : Self.maxWidth)
            .frame(maxWidth: .infinity)
            // Reduce Motion (and the fixed fixture angle) keeps the card still: the drag is masked off.
            .simultaneousGesture(drag, including: reduceMotion || previewAngle != nil ? .subviews : .all)
            .accessibilityIdentifier("card-face")
    }

    private var drag: some Gesture {
        DragGesture(minimumDistance: 6)
            .onChanged { value in
                if mode == .undecided {
                    // Vertical drags belong to the scroll view; only horizontal ones turn the card.
                    mode = abs(value.translation.width) > abs(value.translation.height) ? .turning : .scrolling
                }
                guard mode == .turning else { return }
                let target = min(max(Double(value.translation.width) * 0.3, -Self.maxAngle), Self.maxAngle)
                withAnimation(.interactiveSpring(response: 0.25, dampingFraction: 0.85)) { angle = target }
            }
            .onEnded { _ in
                let wasTurning = mode == .turning
                mode = .undecided
                guard wasTurning else { return }
                withAnimation(.spring(response: 0.45, dampingFraction: 0.65)) { angle = 0 }
            }
    }
}

/// Basic monthly spending indicator (detailed category analytics are a later phase).
struct MonthlySpendBar: View {
    let limits: LimitsInfo
    private var spent: Double { Double(limits.usage.monthlySpendCents) ?? 0 }
    private var total: Double { max(Double(limits.limits.monthlySpendCents) ?? 1, 1) }
    var body: some View {
        VStack(alignment: .leading, spacing: Design.small) {
            Text("Spent this month").font(.subheadline.weight(.semibold))
            ProgressView(value: min(spent, total), total: total).tint(Design.accent)
            Text("\(Money.formatted(limits.usage.monthlySpendCents)) of \(Money.formatted(limits.limits.monthlySpendCents))")
                .font(.footnote).foregroundStyle(Design.textSecondary)
        }
        .surfaceCard()
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("monthly-spend")
    }
}

/// The one-time code IZIPAY e-mailed for a payment in progress (3-D Secure). Shown until it expires.
struct PaymentCodeNotice: View {
    let code: PaymentCodeInfo.Code
    @State private var copied = false

    private var expiry: Date? {
        let parser = ISO8601DateFormatter()
        parser.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return parser.date(from: code.expiresAt)
    }

    var body: some View {
        TimelineView(.periodic(from: .now, by: 15)) { context in
            if let expiry, expiry > context.date {
                HStack(alignment: .top, spacing: Design.medium) {
                    IconBadge(symbol: "lock.shield.fill", color: Design.accent, size: 32)
                    VStack(alignment: .leading, spacing: Design.xs) {
                        Text("Payment code").font(.headline)
                        Text(code.code)
                            .font(Design.display(30, relativeTo: .title)).monospacedDigit().tracking(4)
                            .textSelection(.enabled)
                            .accessibilityLabel(String(localized: "Payment code \(code.code.map(String.init).joined(separator: " "))"))
                        Text("Enter it on the payment page. Valid until \(expiry.formatted(date: .omitted, time: .shortened)).")
                            .font(.subheadline).foregroundStyle(Design.textSecondary).fixedSize(horizontal: false, vertical: true)
                        Button(copied ? "Copied" : "Copy code") {
                            UIPasteboard.general.setItems([[UIPasteboard.typeAutomatic: code.code]],
                                                          options: [.expirationDate: expiry, .localOnly: true])
                            copied = true
                        }
                        .font(.subheadline.weight(.semibold)).foregroundStyle(Design.accent)
                        .frame(minHeight: Design.minTouch)
                    }
                }
                .surfaceCard()
                .accessibilityIdentifier("payment-code-notice")
            }
        }
    }
}
