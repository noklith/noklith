import Foundation

enum CardStatus: String, Codable {
    case provisioning, active, frozenByUser = "frozen_by_user", frozenByRiskRule = "frozen_by_risk_rule"
    case blockedByRisk = "blocked_by_risk", closed, replaced
    /// States the cardholder may lift: their own freeze and an automatic safety pause.
    var isUserReversibleFreeze: Bool { self == .frozenByUser || self == .frozenByRiskRule }
    var label: String {
        switch self {
        case .provisioning: String(localized: "Preparing")
        case .active: String(localized: "Active")
        case .frozenByUser: String(localized: "Frozen by you")
        case .frozenByRiskRule: String(localized: "Paused by a safety check")
        case .blockedByRisk: String(localized: "Blocked for review")
        case .closed: String(localized: "Closed")
        case .replaced: String(localized: "Replaced")
        }
    }
}

struct Card: Codable, Equatable, Identifiable {
    let id: String
    var status: CardStatus
    let currency: String
    let lastFour: String
    var availableCents: String
    var heldCents: String
    let issuerMode: String
}

struct Activity: Codable, Equatable, Identifiable {
    let id: String
    let kind: String
    let status: String
    let amountCents: String
    let currency: String
    let title: String
    let occurredAt: String
    let network: String?
    let transactionHash: String?
    let demonstration: Bool
    // Server mode: purchases link to their authorization; authorizations report their current state.
    var merchant: String?
    var parentId: String?
    var currentStatus: String?

    var effectiveStatus: String { currentStatus ?? status }
    var isOpenHold: Bool { kind == "authorization" && effectiveStatus == "held" }
    var statusLabel: String {
        if kind == "refund" { return String(localized: "Refunded to card") }
        if kind == "card_status" { return effectiveStatus == "paused" ? String(localized: "Purchases paused") : String(localized: "Card resumed") }
        return switch effectiveStatus {
        case "credited": String(localized: "Credited")
        case "held", "authorized": String(localized: "Held · not spent")
        case "completed", "captured", "cleared": String(localized: "Completed")
        case "refunded": String(localized: "Refunded")
        case "reversed": String(localized: "Hold released")
        case "funding_pending": String(localized: "Awaiting card credit")
        default: String(localized: "Pending")
        }
    }
    var date: Date? {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.date(from: occurredAt) ?? ISO8601DateFormatter().date(from: occurredAt)
    }
}

enum Money {
    static func formatted(_ cents: String, currency: String = "USD") -> String {
        guard let value = Decimal(string: cents, locale: Locale(identifier: "en_US_POSIX")) else { return "—" }
        return (value / 100).formatted(.currency(code: currency))
    }

    // Input is parsed as digits, never binary floating point. More than two decimals are rejected.
    static func cents(from text: String, locale: Locale = .current) -> Int64? {
        let separator = locale.decimalSeparator ?? "."
        let normalized = text.trimmingCharacters(in: .whitespaces).replacingOccurrences(of: separator, with: ".")
        let parts = normalized.split(separator: ".", omittingEmptySubsequences: false)
        guard parts.count <= 2, let whole = parts.first, !whole.isEmpty,
              whole.allSatisfy({ $0.isASCII && $0.isNumber }),
              let integer = Int64(whole), integer <= Int64.max / 100 else { return nil }
        let fraction = parts.count == 2 ? String(parts[1]) : ""
        guard fraction.count <= 2, fraction.allSatisfy({ $0.isASCII && $0.isNumber }) else { return nil }
        let fractional = Int64(fraction.padding(toLength: 2, withPad: "0", startingAt: 0)) ?? 0
        let result = integer.multipliedReportingOverflow(by: 100)
        let sum = result.partialValue.addingReportingOverflow(fractional)
        guard !result.overflow, !sum.overflow, sum.partialValue > 0 else { return nil }
        return sum.partialValue
    }
}

struct LaunchOptions {
    let screen: String
    let scenario: String
    let fixture: Bool
    let apiBaseURL: URL?
    init(arguments: [String] = ProcessInfo.processInfo.arguments) {
        func value(_ key: String) -> String? {
            guard let index = arguments.firstIndex(of: key), arguments.indices.contains(index + 1) else { return nil }
            return arguments[index + 1]
        }
        screen = value("--screen") ?? "welcome"
        scenario = value("--scenario") ?? "standard"
        fixture = arguments.contains("--fixture")
        apiBaseURL = value("--api-base-url").flatMap(URL.init(string:))
    }
}

enum Fixtures {
    /// Relative sample times so history shows Today / Yesterday / earlier groups.
    private static func ago(minutes: Int) -> String {
        ISO8601DateFormatter().string(from: Date().addingTimeInterval(TimeInterval(-minutes * 60)))
    }

    /// Sample top-up in the requested state, for status screenshots only.
    static func topUp(status: String) -> TopUp? {
        guard let state = TopUpStatus(rawValue: status) else { return nil }
        let hash: String? = [.quoted, .awaitingSignature, .cancelled, .expired].contains(state) ? nil : "0x" + String(repeating: "5a", count: 32)
        let reason: String? = state == .failed ? "amount_mismatch" : state == .expired ? "quote_expired" : state == .cancelled ? "user_cancelled" : nil
        return TopUp(id: "fixture-top-up", status: state, failureReason: reason, chainId: 84532, networkName: "Base Sepolia",
                     asset: "USDC", assetName: "USDC (Base Sepolia test token)", tokenAddress: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
                     tokenDecimals: 6, senderAddress: "0x1111111111111111111111111111111111111111",
                     recipientAddress: "0x2222222222222222222222222222222222222222", amountCents: "2550", tokenUnits: "25500000",
                     cardAmountCents: "2550", minimumCardAmountCents: "2550", serviceFeeCents: "0",
                     networkFeeNote: "The network fee is paid in test ETH by your wallet and is shown there before you approve.",
                     transactionHash: hash, confirmations: state == .confirming ? 2 : 0, requiredConfirmations: 5,
                     quoteExpiresAt: "2026-10-09T12:10:00.000Z", submitDeadline: "2026-10-09T13:10:00.000Z",
                     explorerUrl: hash.map { "https://sepolia.basescan.org/tx/" + $0 })
    }

    static func card(scenario: String) -> Card? {
        guard scenario != "empty" else { return nil }
        return Card(id: "fixture-card", status: scenario == "risk" ? .blockedByRisk : scenario == "frozen" ? .frozenByUser : scenario == "paused" ? .frozenByRiskRule : .active,
                    currency: "USD", lastFour: "0428", availableCents: scenario == "long" ? "123456789" : scenario == "zero" ? "0" : "24850",
                    heldCents: scenario == "zero" ? "0" : "1200", issuerMode: "demo")
    }
    static func history(scenario: String) -> [Activity] {
        guard scenario != "empty", scenario != "zero" else { return [] }
        var items: [Activity] = scenario != "paused" ? [] : [
            Activity(id: "fixture-pause", kind: "card_status", status: "paused", amountCents: "0", currency: "USD",
                     title: "Card paused: almost the whole balance spent right after a refill", occurredAt: ago(minutes: 5),
                     network: nil, transactionHash: nil, demonstration: true, currentStatus: "paused")
        ]
        items += [
            Activity(id: "fixture-hold", kind: "authorization", status: "held", amountCents: "1200", currency: "USD", title: scenario == "long" ? "Merchant with a deliberately long international trading name" : "Corner coffee", occurredAt: ago(minutes: 25), network: nil, transactionHash: nil, demonstration: true),
            Activity(id: "fixture-topup", kind: "top_up", status: "credited", amountCents: "30000", currency: "USD", title: "Refill", occurredAt: ago(minutes: 60 * 50), network: nil, transactionHash: nil, demonstration: true),
            Activity(id: "fixture-capture", kind: "capture", status: "completed", amountCents: "3950", currency: "USD", title: "Market", occurredAt: ago(minutes: 60 * 26), network: nil, transactionHash: nil, demonstration: true),
            Activity(id: "fixture-refund", kind: "refund", status: "credited", amountCents: "500", currency: "USD", title: "Market · Refund", occurredAt: ago(minutes: 60 * 25), network: nil, transactionHash: nil, demonstration: true),
            Activity(id: "fixture-released", kind: "authorization", status: "held", amountCents: "780", currency: "USD", title: "Bakery", occurredAt: ago(minutes: 60 * 27), network: nil, transactionHash: nil, demonstration: true, currentStatus: "reversed")
        ]
        return items.sorted { $0.occurredAt > $1.occurredAt }
    }
}

extension Activity {
    var displayTitle: String {
        guard demonstration else { return title }
        let prefix = "Demo · "
        return title.hasPrefix(prefix) ? String(title.dropFirst(prefix.count)) : title
    }
}
