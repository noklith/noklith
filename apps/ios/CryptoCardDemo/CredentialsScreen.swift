import SwiftUI
import LocalAuthentication

struct CredentialsScreen: View {
    let store: AppStore
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var scenePhase
    @State private var details: TestCredentials?
    @State private var authenticating = false
    @State private var message: String?
    @State private var context: LAContext?
    @State private var hideTask: Task<Void, Never>?

    var body: some View {
        NavigationStack {
            Form {
                Group {
                Section {
                    Label("Card details", systemImage: "creditcard")
                    if let details {
                        LabeledContent("Number") { Text(details.groupedNumber).monospaced().textSelection(.enabled) }
                        LabeledContent("Expiry") { Text(details.expiry).monospaced() }
                        LabeledContent("Security code") { Text(details.cvv).monospaced() }
                        Group {
                            if details.isDemonstration {
                                Text("Hidden automatically after 30 seconds. These details can't be used for payments.")
                            } else {
                                Text("Hidden automatically after 30 seconds. Never share these details with anyone.")
                            }
                        }
                        .font(.footnote).foregroundStyle(Design.textSecondary)
                    } else {
                        Text("Use Face ID, Touch ID or your device passcode to reveal the card details.")
                        Button("Reveal card details") { Task { await authenticate() } }
                            .frame(minHeight: 44).disabled(authenticating)
                            .accessibilityIdentifier("button-reveal-details")
                    }
                    if let message { Text(message).foregroundStyle(Design.textSecondary) }
                }
                }
                .listRowBackground(Design.surface)
            }
            .themedList()
            .navigationTitle("Card details")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Done") { dismiss() } } }
        }
        .onChange(of: scenePhase) {
            if scenePhase != .active { hide() }
            if scenePhase == .background { context?.invalidate() }
        }
        .onDisappear { hide(); context?.invalidate() }
    }

    private func hide() {
        details = nil
        hideTask?.cancel()
    }

    @MainActor
    private func authenticate() async {
        authenticating = true
        defer { authenticating = false }
        let auth = LAContext()
        context = auth
        var authError: NSError?
        // Biometrics with the device passcode as the defined fallback.
        guard auth.canEvaluatePolicy(.deviceOwnerAuthentication, error: &authError) else {
            message = String(localized: "Face ID and a passcode are not set up on this device. Set a device passcode to see card details.")
            return
        }
        do {
            let success = try await auth.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: String(localized: "Reveal card details"))
            guard success, scenePhase == .active, !Task.isCancelled else { return }
            let revealed: TestCredentials
            if store.isWallet {
                revealed = try await store.revealCredentials()
            } else {
                // Preview: a fixed sample that is visibly not a card number.
                revealed = TestCredentials(pan: "0000000000000428", expiryMonth: 0, expiryYear: 0, cvv: "000",
                                           expiresAt: ISO8601DateFormatter().string(from: .now.addingTimeInterval(30)))
            }
            guard scenePhase == .active else { return }
            details = revealed
            message = nil
            hideTask?.cancel()
            let serverExpiry = ServerDate.parse(revealed.expiresAt).map { max(1, $0.timeIntervalSinceNow) } ?? 30
            hideTask = Task { @MainActor in
                try? await Task.sleep(for: .seconds(min(30, serverExpiry)))
                guard !Task.isCancelled else { return }
                details = nil
            }
        } catch {
            message = (error as? ClientError)?.errorDescription ?? String(localized: "Details remain hidden. Authentication was not completed.")
        }
    }
}
