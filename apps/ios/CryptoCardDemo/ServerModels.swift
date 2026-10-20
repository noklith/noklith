import Foundation

/// Wire models for the wallet-backed (testnet + DemoIssuer) server mode.
/// Money stays in integer strings: cents for USD, minimal units for tokens.

enum TopUpStatus: String, Decodable, Equatable {
    case quoted, awaitingSignature = "awaiting_signature", submitted, confirming
    case fundingPending = "funding_pending", credited, failed, cancelled, expired

    var isActive: Bool { [.submitted, .confirming, .fundingPending].contains(self) }
    var isFinal: Bool { [.credited, .failed, .cancelled, .expired].contains(self) }
    var label: String {
        switch self {
        case .quoted: String(localized: "Terms ready")
        case .awaitingSignature: String(localized: "Waiting for your wallet")
        case .submitted: String(localized: "Waiting for the network")
        case .confirming: String(localized: "Confirming on the network")
        case .fundingPending: String(localized: "Transfer confirmed · crediting card")
        case .credited: String(localized: "Added to your card")
        case .failed: String(localized: "Refill failed")
        case .cancelled: String(localized: "Cancelled")
        case .expired: String(localized: "Expired")
        }
    }
}

struct TopUp: Decodable, Equatable, Identifiable {
    let id: String
    let status: TopUpStatus
    let failureReason: String?
    let chainId: Int
    let networkName: String
    let asset: String
    let assetName: String
    let tokenAddress: String
    let tokenDecimals: Int
    let senderAddress: String
    let recipientAddress: String
    let amountCents: String
    let tokenUnits: String
    let cardAmountCents: String
    let minimumCardAmountCents: String
    let serviceFeeCents: String
    let networkFeeNote: String
    let transactionHash: String?
    let confirmations: Int
    let requiredConfirmations: Int
    let quoteExpiresAt: String
    let submitDeadline: String
    let explorerUrl: String?

    var quoteExpiry: Date? { ServerDate.parse(quoteExpiresAt) }

    var failureText: String? {
        guard let failureReason else { return nil }
        switch failureReason {
        case "transaction_reverted": return String(localized: "The network rejected the transaction. No funds were credited.")
        case "no_matching_transfer": return String(localized: "This transaction does not send the agreed token from your wallet to the refill address.")
        case "amount_mismatch": return String(localized: "The transferred amount differs from the agreed amount. Nothing was credited.")
        case "transaction_not_found": return String(localized: "The transaction did not appear on the network in time.")
        case "transfer_already_used": return String(localized: "This transfer was already credited.")
        case "quote_expired", "submit_deadline_passed": return String(localized: "The terms expired before a transaction was received.")
        case "user_cancelled": return String(localized: "You cancelled this refill.")
        default: return String(localized: "The refill could not be completed.")
        }
    }
}

struct TopUpEnvelope: Decodable { let topUp: TopUp }
struct TopUpList: Decodable { let items: [TopUp] }

/// The exact ERC-20 transfer the server asks the external wallet to send.
struct WalletTransactionRequest: Decodable, Equatable, Sendable {
    let chainId: Int
    let from: String
    let to: String
    let value: String
    let data: String
}
struct TopUpAcceptance: Decodable { let topUp: TopUp; let transaction: WalletTransactionRequest }

struct NetworkAsset: Decodable, Equatable { let symbol: String; let name: String; let tokenAddress: String; let decimals: Int }
struct NetworkConfig: Decodable, Equatable {
    let chainId: Int
    let name: String
    let confirmations: Int
    let recipientAddress: String
    let assets: [NetworkAsset]
}

struct WalletBalances: Decodable {
    let address: String
    let networks: [Network]
    struct Network: Decodable { let chainId: Int; let available: Bool; let nativeSymbol: String?; let nativeUnits: String?; let assets: [Asset] }
    struct Asset: Decodable { let symbol: String; let decimals: Int; let units: String? }
}

/// One-time payment code (3-D Secure) that IZIPAY e-mailed to the card's cardholder address.
struct PaymentCodeInfo: Decodable, Equatable {
    let paymentCode: Code?
    struct Code: Decodable, Equatable { let code: String; let receivedAt: String; let expiresAt: String }
}

struct LimitsInfo: Decodable, Equatable {
    let limits: Values
    /// False for an IZIPAY card, whose purchases IZIPAY authorizes; absent in older server answers.
    let spendLimitsEnforced: Bool?
    let usage: Usage
    struct Values: Decodable, Equatable {
        let singleTopUpCents: String; let monthlyTopUpCents: String; let dailySpendCents: String; let monthlySpendCents: String
    }
    struct Usage: Decodable, Equatable { let monthlyTopUpCents: String; let dailySpendCents: String; let monthlySpendCents: String }
}

struct TestCredentials: Decodable, Equatable {
    let pan: String
    let expiryMonth: Int
    let expiryYear: Int
    let cvv: String
    let expiresAt: String
    /// False for a card issued by a real card program; absent in older server answers.
    var demonstration: Bool?
    var isDemonstration: Bool { demonstration ?? true }
    var groupedNumber: String { stride(from: 0, to: pan.count, by: 4).map { offset -> String in
        let start = pan.index(pan.startIndex, offsetBy: offset)
        return String(pan[start..<pan.index(start, offsetBy: min(4, pan.count - offset))])
    }.joined(separator: " ") }
    var expiry: String { String(format: "%02d/%02d", expiryMonth, expiryYear % 100) }
}

struct EventsPage: Decodable { let items: [Event]; let latestSeq: String; struct Event: Decodable { let seq: String; let type: String } }

struct CardEventResult: Decodable { let decision: String; let reason: String?; let ledgerEntryId: String? }

enum ServerDate {
    static func parse(_ value: String) -> Date? {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.date(from: value) ?? ISO8601DateFormatter().date(from: value)
    }
}

enum TokenAmount {
    /// Integer minimal units to a display string without floating point (e.g. 25500000 @6 → "25.50").
    static func formatted(_ units: String, decimals: Int, maxFraction: Int = 2) -> String {
        guard decimals > 0, !units.isEmpty, units.allSatisfy({ $0.isASCII && $0.isNumber }) else { return "—" }
        let padded = String(repeating: "0", count: max(0, decimals + 1 - units.count)) + units
        let whole = padded.dropLast(decimals)
        let fraction = padded.suffix(decimals).prefix(maxFraction)
        let grouped = Decimal(string: String(whole)).map { $0.formatted(.number.grouping(.automatic)) } ?? String(whole)
        return fraction.isEmpty ? grouped : "\(grouped)\(Locale.current.decimalSeparator ?? ".")\(fraction)"
    }
}
