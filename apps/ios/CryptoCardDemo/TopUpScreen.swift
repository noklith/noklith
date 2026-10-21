import SwiftUI

/// Wallet mode uses the verifiable testnet flow; preview mode keeps the clearly local sample.
struct TopUpScreen: View {
    let store: AppStore
    let wallet: WalletSignInStore?
    var body: some View {
        if store.isWallet { WalletTopUpView(store: store, wallet: wallet) } else { PreviewTopUpView(store: store) }
    }
}

struct PreviewTopUpView: View {
    let store: AppStore
    @Environment(\.dismiss) private var dismiss
    @State private var amount = "25"
    @State private var stage: PreviewStage = .amount
    @State private var credited = false
    @State private var previewID = UUID().uuidString
    @FocusState private var amountFocused: Bool
    private var cents: Int64? { Money.cents(from: amount) }
    private var valid: Bool { cents.map { $0 <= 50_000 } ?? false }

    var body: some View {
        NavigationStack {
            Group {
                if stage == .amount { amountStage } else {
                    Form {
                        Group {
                        Section {
                            Label("No funds will move", systemImage: "flask")
                                .font(.subheadline).foregroundStyle(Design.textSecondary)
                                .accessibilityIdentifier("app-ready")
                        }
                        switch stage {
                        case .amount: EmptyView()
                        case .terms: termsSection
                        case .status: statusSection
                        }
                        }
                        .listRowBackground(Design.surface)
                    }
                    .themedList()
                }
            }
            .navigationTitle(stage == .amount ? "Refill" : stage == .terms ? "Review refill" : "Refill result")
            .navigationBarTitleDisplayMode(.inline)
            // A container keeps the children's own identifiers (the bottom button sits outside the scroll view).
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier("screen-topup")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { RefillCloseButton { dismiss() } }
                ToolbarItemGroup(placement: .keyboard) { Spacer(); Button("Done") { amountFocused = false } }
            }
        }
    }

    private var amountStage: some View {
        ScrollView {
            VStack(spacing: Design.large) {
                RefillAmountHeader(amount: $amount, unit: String(localized: "USDC"),
                                   limitText: String(localized: "Maximum per refill: \(Money.formatted("50000"))"),
                                   invalidText: valid ? nil : String(localized: "Enter more than $0 and no more than $500, with up to two decimal places."),
                                   focus: $amountFocused)
                    .padding(.top, Design.large)
                RefillDetailsCard {
                    RefillDetailRow(title: "Token", value: String(localized: "USDC"))
                    RefillDetailRow(title: "Network", value: String(localized: "Not connected"), last: true)
                }
                StoneNotice(symbol: "flask", text: "No funds will move")
                    .accessibilityIdentifier("app-ready")
            }
            .padding(.horizontal, Design.large)
        }
        .scrollDismissesKeyboard(.interactively)
        .safeAreaInset(edge: .bottom) {
            RefillReviewButton(working: false) { amountFocused = false; stage = .terms }
                .disabled(!valid || store.serverFixture || store.card?.status != .active)
                .padding(.horizontal, Design.large)
                .padding(.bottom, Design.small)
                .background(Design.background)
        }
        .themedScreen()
    }

    private var termsSection: some View {
        Group {
            Section(header: Eyebrow("Review refill")) {
                AdaptiveDetailRow(title: "Card credit", value: Money.formatted(String(cents ?? 0)))
                AdaptiveDetailRow(title: "Network fee", value: String(localized: "Not applicable"))
                AdaptiveDetailRow(title: "Exchange", value: String(localized: "None"))
                Text("No wallet signature or transfer is requested.")
                    .foregroundStyle(Design.textSecondary)
            }
            Section {
                Button("Add to balance") {
                    guard let cents, valid, !credited else { return }
                    guard store.applyPreviewTopUp(cents: cents, id: previewID) else { return }
                    credited = true
                    stage = .status
                }
                .frame(maxWidth: .infinity, minHeight: 44)
                .disabled(store.card?.status != .active)
                Button("Edit amount") { stage = .amount }.frame(minHeight: 44)
            }
        }
    }

    private var statusSection: some View {
        Group {
            Section {
                VStack(spacing: Design.small) {
                    FrameSequence(clip: AnimationClips.statusSuccess, size: 112, loop: false,
                                  still: AnimationClips.statusSuccess.order.count - 1, animated: !store.options.fixture)
                    Text("Balance updated").font(.title2.weight(.bold))
                }
                .frame(maxWidth: .infinity)
                Text("Added \(Money.formatted(String(cents ?? 0))) to the balance.")
                Text("Updated locally. No funds were transferred.")
                    .foregroundStyle(Design.textSecondary)
            }
            Section { Button("Back to card") { dismiss() }.frame(maxWidth: .infinity, minHeight: 44) }
        }
    }
    private enum PreviewStage { case amount, terms, status }
}
