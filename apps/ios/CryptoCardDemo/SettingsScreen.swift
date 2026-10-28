import SwiftUI

struct SettingsScreen: View {
    let store: AppStore
    let walletFlow: WalletSignInFlow
    @Binding var sheet: AppSheet?
    @AppStorage(CardFinish.storageKey) private var finishName = CardFinish.sandstone.rawValue

    var body: some View {
        Form {
            Group {
                Section {
                    // The website's cave-painting collection; appearance only, kept on this device.
                    HStack(spacing: 12) {
                        ForEach(CardFinish.allCases) { finish in
                            let selected = finishName == finish.rawValue
                            let shape = RoundedRectangle(cornerRadius: 14, style: .continuous)
                            Button { finishName = finish.rawValue } label: {
                                VStack(spacing: Design.small) {
                                    Color.clear.aspectRatio(Design.cardAspect, contentMode: .fit)
                                        .overlay { Image(finish.imageName).resizable().scaledToFill() }
                                        .clipShape(shape)
                                        .overlay { shape.strokeBorder(Design.accent, lineWidth: selected ? 3 : 0) }
                                        .overlay(alignment: .topTrailing) {
                                            if selected {
                                                Image(systemName: "checkmark")
                                                    .font(.system(size: 13, weight: .bold))
                                                    .foregroundStyle(Design.onAccent)
                                                    .frame(width: 28, height: 28)
                                                    .background(Design.accent, in: Circle())
                                                    .overlay { Circle().strokeBorder(Design.background, lineWidth: 2) }
                                                    .offset(x: 6, y: -6)
                                                    .accessibilityHidden(true)
                                            }
                                        }
                                    Text(finish.title).font(Design.displayMedium(17, relativeTo: .subheadline)).foregroundStyle(Color.primary)
                                }
                                .frame(maxWidth: .infinity)
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel(Text(finish.title))
                            .accessibilityAddTraits(selected ? .isSelected : [])
                            .accessibilityIdentifier("finish-\(finish.rawValue)")
                        }
                    }
                    .padding(.vertical, Design.small)
                    .listRowBackground(Color.clear)
                    .listRowInsets(EdgeInsets(top: Design.small, leading: 0, bottom: Design.small, trailing: 0))
                } header: {
                    Eyebrow("Your cave painting")
                }

                Section {
                    if store.isWallet, let address = store.walletAddress {
                        SettingsRow(symbol: "wallet.bifold.fill", color: Design.accent, title: "Address") {
                            Text(address).font(.footnote.monospaced()).foregroundStyle(Design.textSecondary)
                                .lineLimit(1).truncationMode(.middle).textSelection(.enabled)
                        }
                        SettingsRow(symbol: "network", color: .indigo, title: "Network",
                                    value: store.walletChainID.flatMap { KnownNetwork.names[$0] } ?? "Network")
                        SettingsRow(symbol: "signature", color: Design.positive, title: "Sign-in", value: "Verified by signature")
                    } else {
                        SettingsRow(symbol: "wallet.bifold.fill", color: Design.accent, title: "Wallet", value: "Not connected")
                    }
                } header: {
                    Text("Wallet")
                } footer: {
                    Text("No private key is requested or stored.").foregroundStyle(Design.textSecondary)
                }

                Section {
                    SettingsRow(symbol: "lock.fill", color: Design.positive, title: "Card details", value: "Face ID or passcode")
                    SettingsRow(symbol: "eye.slash.fill", color: .gray, title: "In background", value: "Content hidden")
                } header: {
                    Text("Security")
                } footer: {
                    Text("Details are hidden automatically when the app leaves the foreground.").foregroundStyle(Design.textSecondary)
                }

                if store.isWallet, store.card?.issuerMode == "demo" {
                    Section {
                        Button { sheet = .testPurchase } label: {
                            SettingsRow(symbol: "bag.fill", color: Design.warning, title: "Simulate a test purchase", showsChevron: true)
                        }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("button-test-purchase")
                    } header: {
                        Text("Test tools")
                    } footer: {
                        Text("Creates a hold on your test card, like a merchant authorization.").foregroundStyle(Design.textSecondary)
                    }
                }

                Section {
                    SettingsRow(symbol: "server.rack", color: .teal, title: "Data", value: dataLabel)
                    SettingsRow(symbol: "creditcard.fill", color: Design.accent, title: "Card", value: isIssuedCard ? "Virtual Visa card" : "Non-payable test card")
                } header: {
                    Text("About this build")
                } footer: {
                    Text(!store.isWallet ? "This build cannot make real payments or transfer crypto."
                         : !isIssuedCard ? "Refills use test tokens on a test network. Purchases are simulated by the test card issuer."
                         : onTestNetwork ? "Refills use test tokens on a test network. The card comes from the card program's test mode."
                         : "Refills move stablecoins from your wallet to your card. You pay with the card wherever Visa is accepted online.")
                        .foregroundStyle(Design.textSecondary)
                }

                Section {
                    Button(role: .destructive) {
                        Task {
                            if store.isWallet { await walletFlow.leaveForPreview() }
                            await store.signOut()
                        }
                    } label: {
                        HStack(spacing: Design.medium) {
                            IconBadge(symbol: "rectangle.portrait.and.arrow.right",
                                      size: Design.settingsIcon, shape: .roundedSquare)
                            Text(store.isWallet ? "Sign out and disconnect wallet" : "Sign out")
                                .foregroundStyle(Design.negative)
                        }
                        .frame(minHeight: Design.minTouch)
                    }
                    .accessibilityIdentifier("button-sign-out")
                }
            }
            .listRowBackground(Design.surface)
        }
        .themedList()
        .navigationTitle("Settings")
        .accessibilityIdentifier("screen-settings")
    }

    /// A card from the card program (IZIPAY), not the DemoIssuer stub.
    private var isIssuedCard: Bool { store.card?.issuerMode == "izipay" }
    private var onTestNetwork: Bool { store.walletChainID.map(KnownNetwork.isTest) ?? true }

    private var dataLabel: String {
        switch store.mode {
        case .wallet: onTestNetwork ? String(localized: "Test network") : String(localized: "Live network")
        case .serverFixture: String(localized: "Server sample data")
        case .preview: String(localized: "Sample data")
        }
    }
}

/// Settings cell: colored rounded-square icon, title, then a value or custom trailing content.
struct SettingsRow<Trailing: View>: View {
    let symbol: String
    let color: Color
    let title: LocalizedStringKey
    var showsChevron = false
    @ViewBuilder var trailing: Trailing
    @Environment(\.dynamicTypeSize) private var textSize

    var body: some View {
        let layout = textSize.isAccessibilitySize ? AnyLayout(VStackLayout(alignment: .leading, spacing: Design.xs))
            : AnyLayout(HStackLayout(spacing: Design.medium))
        layout {
            HStack(spacing: Design.medium) {
                IconBadge(symbol: symbol, size: Design.settingsIcon, shape: .roundedSquare)
                Text(title).foregroundStyle(Color.primary)
            }
            if !textSize.isAccessibilitySize { Spacer(minLength: Design.small) }
            trailing
            if showsChevron {
                Image(systemName: "chevron.right").font(.footnote.weight(.semibold)).foregroundStyle(Design.textSecondary)
                    .accessibilityHidden(true)
            }
        }
        .frame(minHeight: Design.minTouch)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }
}

extension SettingsRow where Trailing == Text {
    init(symbol: String, color: Color, title: LocalizedStringKey, value: String) {
        self.init(symbol: symbol, color: color, title: title) { Text(value).foregroundStyle(Design.textSecondary) }
    }
}

extension SettingsRow where Trailing == EmptyView {
    init(symbol: String, color: Color, title: LocalizedStringKey, showsChevron: Bool) {
        self.init(symbol: symbol, color: color, title: title, showsChevron: showsChevron) { EmptyView() }
    }
}
