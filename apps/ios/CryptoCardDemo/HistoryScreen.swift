import SwiftUI

struct HistoryScreen: View {
    let store: AppStore

    /// Newest first, grouped by calendar day of the device.
    private var groups: [(day: Date, items: [Activity])] {
        let calendar = Calendar.current
        let grouped = Dictionary(grouping: store.activities) { calendar.startOfDay(for: $0.date ?? .distantPast) }
        return grouped.keys.sorted(by: >).map { day in (day, grouped[day]!.sorted { $0.occurredAt > $1.occurredAt }) }
    }

    var body: some View {
        Group {
            if store.activities.isEmpty {
                VStack(spacing: Design.medium) {
                    Image(systemName: "list.bullet.rectangle.portrait.fill")
                        .font(.system(size: 34, weight: Design.symbolWeight))
                        .foregroundStyle(Design.accent)
                        .frame(width: 80, height: 80)
                        .background(Design.surface, in: Circle())
                        .accessibilityHidden(true)
                    Text("No activity yet. Refills and purchases will appear here.")
                        .font(.subheadline).foregroundStyle(Design.textSecondary).multilineTextAlignment(.center)
                }
                .padding(Design.extraLarge)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(Design.background.ignoresSafeArea())
            } else {
                List {
                    ForEach(groups, id: \.day) { group in
                        Section {
                            ForEach(group.items) { activity in
                                NavigationLink { ActivityDetail(activity: activity, store: store) } label: { ActivityRow(activity: activity) }
                                    .listRowBackground(Design.surface)
                                    .listRowSeparatorTint(Design.separator)
                            }
                        } header: {
                            Text(Self.dayTitle(group.day)).font(.subheadline.weight(.semibold)).foregroundStyle(Design.textSecondary)
                                .textCase(nil)
                        }
                    }
                }
                .listStyle(.insetGrouped)
                .themedList()
            }
        }
        .refreshable { await store.refresh() }
        .navigationTitle("Activity")
        .accessibilityIdentifier("screen-history")
    }

    static func dayTitle(_ day: Date) -> String {
        let calendar = Calendar.current
        if calendar.isDateInToday(day) { return String(localized: "Today") }
        if calendar.isDateInYesterday(day) { return String(localized: "Yesterday") }
        if day == .distantPast { return String(localized: "Earlier") }
        let sameYear = calendar.isDate(day, equalTo: .now, toGranularity: .year)
        let style: Date.FormatStyle = sameYear ? .dateTime.day().month(.wide) : .dateTime.day().month(.wide).year()
        return day.formatted(style)
    }
}

extension Activity {
    /// Icon and well color by operation type.
    var badge: (symbol: String, color: Color) {
        switch kind {
        case "top_up": ("arrow.down", Design.positive)
        case "refund": ("arrow.uturn.backward", Design.positive)
        case "reversal": ("arrow.uturn.left", Design.textSecondary)
        case "card_status": (effectiveStatus == "paused" ? "exclamationmark.shield.fill" : "checkmark.shield.fill",
                             effectiveStatus == "paused" ? Design.warning : Design.positive)
        case "authorization":
            switch effectiveStatus {
            case "held": ("clock.fill", Design.warning)
            case "reversed": ("xmark", Design.textSecondary)
            default: ("bag.fill", Design.accent)
            }
        default: ("bag.fill", Design.accent)
        }
    }

    /// Money in shows a plus, money out a minus; a hold is marked rather than shown as spent.
    var signedAmount: String {
        if kind == "card_status" { return "" } // No money moved.
        let value = Money.formatted(amountCents)
        switch kind {
        case "top_up", "refund", "reversal": return "+" + value
        case "capture": return "−" + value
        default: return effectiveStatus == "reversed" ? value : "−" + value
        }
    }

    var isIncome: Bool { ["top_up", "refund", "reversal"].contains(kind) }

    var amountColor: Color {
        if isIncome { return Design.positive }
        if isOpenHold || (kind == "authorization" && effectiveStatus == "reversed") { return Design.textSecondary }
        return .primary
    }
}

struct ActivityRow: View {
    let activity: Activity
    var balanceHidden = false
    @Environment(\.dynamicTypeSize) private var textSize

    var body: some View {
        HStack(alignment: textSize.isAccessibilitySize ? .top : .center, spacing: Design.medium) {
            if !textSize.isAccessibilitySize {
                IconBadge(symbol: activity.badge.symbol, color: activity.badge.color)
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(activity.displayTitle).font(.body.weight(.semibold)).fixedSize(horizontal: false, vertical: true)
                HStack(spacing: Design.xs) {
                    if activity.isOpenHold {
                        Text("On hold").font(.caption2.weight(.bold)).foregroundStyle(Design.warning)
                            .padding(.horizontal, 6).padding(.vertical, 1)
                            .background(Design.warning.opacity(0.15), in: Capsule())
                    }
                    Text(activity.statusLabel).font(.caption).foregroundStyle(Design.textSecondary)
                }
                if textSize.isAccessibilitySize { amount }
            }
            if !textSize.isAccessibilitySize {
                Spacer(minLength: Design.small)
                amount
            }
        }
        .frame(minHeight: Design.minTouch)
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder private var amount: some View {
        if !activity.signedAmount.isEmpty {
            Text(balanceHidden ? "••••" : activity.signedAmount)
                .font(.body.weight(.semibold)).monospacedDigit()
                .foregroundStyle(activity.amountColor)
                .strikethrough(activity.kind == "authorization" && activity.effectiveStatus == "reversed")
                .lineLimit(1).minimumScaleFactor(0.6)
        }
    }
}

struct ActivityDetail: View {
    let activity: Activity
    let store: AppStore
    @State private var working = false
    @State private var message: String?

    var body: some View {
        Form {
            Section {
                VStack(spacing: Design.small) {
                    IconBadge(symbol: activity.badge.symbol, color: activity.badge.color, size: 56)
                    if !activity.signedAmount.isEmpty {
                        Text(activity.signedAmount)
                            .font(.system(.largeTitle, design: .rounded, weight: .bold)).monospacedDigit()
                            .foregroundStyle(activity.amountColor)
                    }
                    Text(activity.displayTitle).font(.headline).multilineTextAlignment(.center)
                    Text(activity.statusLabel).font(.subheadline).foregroundStyle(Design.textSecondary)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, Design.small)
                .accessibilityElement(children: .combine)
            }
            .listRowBackground(Color.clear)
            Group {
            Section(header: Eyebrow("Details")) {
                if let date = activity.date { LabeledContent("Date") { Text(date, format: .dateTime.month().day().hour().minute()) } }
                LabeledContent("Type", value: typeLabel)
                if let merchant = activity.merchant { LabeledContent("Test merchant", value: merchant) }
                if let network = activity.network { LabeledContent("Network", value: TestNetwork.name(caip2: network) ?? network) }
                if activity.kind == "card_status" {
                    Text(activity.effectiveStatus == "paused"
                         ? "New purchases were paused automatically after unusual activity. No money moved. You can resume the card on the Card tab."
                         : "You resumed the card after an automatic pause. No money moved.")
                        .foregroundStyle(Design.textSecondary)
                } else if let hash = activity.transactionHash {
                    LabeledContent("Verified transaction") { Text(hash).font(.footnote.monospaced()).textSelection(.enabled) }
                } else if activity.kind == "top_up" {
                    Text("Sample entry. No funds were transferred.").foregroundStyle(Design.textSecondary)
                }
            }
            if store.isWallet, store.card?.issuerMode == "demo" { testActions }
            if let message { Section { Text(message).foregroundStyle(Design.textSecondary) } }
            }
            .listRowBackground(Design.surface)
        }
        .themedList()
        .navigationTitle("Activity details")
        .navigationBarTitleDisplayMode(.inline)
    }

    private var typeLabel: String {
        switch activity.kind {
        case "top_up": String(localized: "Refill")
        case "authorization": String(localized: "Purchase hold")
        case "capture": String(localized: "Purchase completed")
        case "reversal": String(localized: "Hold released")
        case "refund": String(localized: "Refund")
        case "card_status": String(localized: "Safety check")
        default: activity.kind
        }
    }

    /// Restricted DemoIssuer tool: settles test holds on this account only.
    @ViewBuilder private var testActions: some View {
        if activity.isOpenHold {
            Section {
                Button("Complete test purchase") { run("capture", parent: activity.id) }.disabled(working).frame(minHeight: 44)
                Button("Release test hold") { run("reversal", parent: activity.id) }.disabled(working).frame(minHeight: 44)
            } header: { Text("Test card events") } footer: { Text("Simulates the merchant's next step. No real payment is made.") }
        } else if activity.kind == "capture", let parent = activity.parentId {
            Section {
                Button("Refund test purchase") { run("refund", parent: parent) }.disabled(working).frame(minHeight: 44)
            } header: { Text("Test card events") } footer: { Text("Simulates a merchant refund. No real payment is made.") }
        }
    }

    private func run(_ type: String, parent: String) {
        working = true
        Task {
            defer { working = false }
            do {
                let result = try await store.testCardEvent(type: type, cents: activity.amountCents, authorizationID: parent)
                message = result.decision == "approved" ? String(localized: "Done. Your activity was updated.") : String(localized: "Declined: \(result.reason ?? "unknown")")
            } catch { message = error.localizedDescription }
        }
    }
}

/// Creates a test authorization (hold) on the signed-in wallet's demo card.
struct TestPurchaseSheet: View {
    let store: AppStore
    @Environment(\.dismiss) private var dismiss
    @State private var merchant = "Corner Bookstore"
    @State private var amount = "12.50"
    @State private var working = false
    @State private var message: String?

    var body: some View {
        NavigationStack {
            Form {
                Group {
                Section {
                    Label("Simulates a card authorization from DemoIssuer. No real payment is made.", systemImage: "flask")
                        .font(.subheadline).foregroundStyle(Design.textSecondary)
                }
                Section(header: Eyebrow("Test purchase")) {
                    TextField("Merchant", text: $merchant).accessibilityIdentifier("test-merchant")
                    TextField("Amount in USD", text: $amount).keyboardType(.decimalPad).monospacedDigit().accessibilityIdentifier("test-amount")
                }
                Section {
                    Button("Send test authorization") { submit() }
                        .disabled(working || Money.cents(from: amount) == nil || merchant.trimmingCharacters(in: .whitespaces).isEmpty)
                        .frame(maxWidth: .infinity, minHeight: 44)
                }
                if let message { Section { Text(message).accessibilityIdentifier("test-purchase-result") } }
                }
                .listRowBackground(Design.surface)
            }
            .themedList()
            .navigationTitle("Test purchase")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() } } }
        }
    }

    private func submit() {
        guard let cents = Money.cents(from: amount) else { return }
        working = true
        Task {
            defer { working = false }
            do {
                let result = try await store.testCardEvent(type: "authorization", cents: String(cents), merchant: merchant.trimmingCharacters(in: .whitespaces))
                message = result.decision == "approved" ? String(localized: "Approved. The amount is on hold until the purchase completes.")
                    : declineText(result.reason)
            } catch { message = error.localizedDescription }
        }
    }

    private func declineText(_ reason: String?) -> String {
        switch reason ?? "" {
        case "card_frozen": String(localized: "Declined: the card is frozen.")
        case "card_paused_by_rule": String(localized: "Declined: the card is paused by a safety check. You can resume it on the Card tab.")
        case "rule_drain_after_top_up": String(localized: "Declined and paused: almost the whole balance right after a refill looks unusual. You can resume the card.")
        case "limit_purchases_per_hour": String(localized: "Declined: too many purchases in the last hour.")
        case "limit_purchases_per_day": String(localized: "Declined: too many purchases in the last 24 hours.")
        case "card_blocked": String(localized: "Declined: the card is blocked for review.")
        case "insufficient_funds": String(localized: "Declined: not enough available balance.")
        case "limit_daily_spend": String(localized: "Declined: daily spending limit reached.")
        case "limit_monthly_spend": String(localized: "Declined: monthly spending limit reached.")
        default: String(localized: "Declined.")
        }
    }
}
