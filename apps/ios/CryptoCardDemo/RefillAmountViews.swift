import SwiftUI

/// The amount step of a refill: a large amount with the coin's symbol, quick amounts, the limit and a
/// validation line. Shared by the wallet flow and the local preview.
struct RefillAmountHeader: View {
    @Binding var amount: String
    let unit: String
    let limitText: String
    let invalidText: String?
    var focus: FocusState<Bool>.Binding
    private static let presets = ["25", "50", "100"]

    var body: some View {
        VStack(spacing: Design.medium) {
            Text("Amount").font(.title3).foregroundStyle(Design.textSecondary)
            HStack(alignment: .firstTextBaseline, spacing: Design.small) {
                TextField("0", text: $amount)
                    .keyboardType(.decimalPad)
                    .font(Design.display(72, relativeTo: .largeTitle)).monospacedDigit()
                    .multilineTextAlignment(.trailing)
                    .fixedSize()
                    .focused(focus)
                    .accessibilityLabel("Amount in USD")
                    .accessibilityIdentifier("amount-input")
                Text(unit).font(Design.displayMedium(32, relativeTo: .title)).foregroundStyle(Design.textSecondary)
            }
            .frame(maxWidth: .infinity)
            HStack(spacing: 12) {
                ForEach(Self.presets, id: \.self) { preset in
                    let selected = amount == preset
                    Button { amount = preset; focus.wrappedValue = false } label: {
                        Text(preset)
                            .font(Design.displayMedium(20, relativeTo: .headline))
                            .foregroundStyle(selected ? Design.onAccent : Design.accent)
                            .frame(maxWidth: .infinity, minHeight: 52)
                            .background {
                                let shape = RoundedRectangle(cornerRadius: 14, style: .continuous)
                                if selected { shape.fill(Design.accent) } else { shape.strokeBorder(Design.accent, lineWidth: 1.5) }
                            }
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(selected ? .isSelected : [])
                    .accessibilityIdentifier("amount-preset-\(preset)")
                }
            }
            .padding(.horizontal, Design.large)
            Text(limitText).font(.subheadline).foregroundStyle(Design.textSecondary)
            if let invalidText {
                Label(invalidText, systemImage: "exclamationmark.circle")
                    .font(.footnote).foregroundStyle(Design.negative).multilineTextAlignment(.center)
                    .accessibilityIdentifier("amount-invalid")
            }
        }
    }
}

/// Rows on a plain rounded paper card (no stone frame).
struct RefillDetailsCard<Content: View>: View {
    @ViewBuilder let content: Content
    var body: some View {
        VStack(spacing: 0) { content }
            .padding(.horizontal, Design.medium + Design.xs)
            .background(Design.surface, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
    }
}

/// One label/value row of a details card, divided from the next by a hairline.
struct RefillDetailRow: View {
    let title: LocalizedStringKey
    let value: String
    var last = false
    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text(title).font(Design.displayMedium(19, relativeTo: .body))
                Spacer(minLength: Design.medium)
                Text(value).font(Design.displayMedium(19, relativeTo: .body)).foregroundStyle(Design.textSecondary)
                    .multilineTextAlignment(.trailing)
            }
            .frame(minHeight: 64)
            .accessibilityElement(children: .combine)
            if !last { Divider().overlay(Design.separator) }
        }
    }
}

/// A short notice in the carved stone frame with a round accent badge.
struct StoneNotice: View {
    let symbol: String
    let text: LocalizedStringKey
    var body: some View {
        HStack(spacing: Design.medium) {
            Image(systemName: symbol)
                .font(.system(size: 22, weight: .regular))
                .foregroundStyle(Design.onAccent)
                .frame(width: 52, height: 52)
                .background(Design.accent, in: Circle())
                .accessibilityHidden(true)
            Text(text).font(Design.displayMedium(19, relativeTo: .body))
        }
        .surfaceCard(padding: Design.medium + Design.xs)
        .accessibilityElement(children: .combine)
    }
}

/// The outlined "Review refill →" action pinned above the home indicator.
struct RefillReviewButton: View {
    let working: Bool
    let action: () -> Void
    var body: some View {
        Button(action: action) {
            if working {
                ProgressView().frame(maxWidth: .infinity)
            } else {
                HStack(spacing: Design.small) {
                    Text("Review refill")
                    Image(systemName: "arrow.right").font(.system(size: 22, weight: .regular)).accessibilityHidden(true)
                }
                .frame(maxWidth: .infinity)
            }
        }
        .buttonStyle(WelcomeButtonStyle(prominent: false, height: 64))
        .accessibilityIdentifier("button-preview")
    }
}

/// Round Close control.
struct RefillCloseButton: View {
    let action: () -> Void
    var body: some View {
        Button(action: action) {
            Image(systemName: "xmark").font(.system(size: 17, weight: .semibold))
        }
        .accessibilityLabel("Close")
    }
}
