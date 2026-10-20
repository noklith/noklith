import SwiftUI

/// Design tokens: every color, spacing, radius and size used by the interface. Colors live in the
/// asset catalog with light and dark values from the Noklith website palette (sandstone and dark stone).
enum Design {
    // MARK: Colors
    static let accent = Color("AccentColor")
    static let onAccent = Color("OnAccent")
    static let background = Color("Background")
    static let surface = Color("Surface")
    static let surfaceRaised = Color("SurfaceRaised")
    static let separator = Color("Separator")
    static let textSecondary = Color("TextSecondary")
    static let positive = Color("Positive")
    static let negative = Color("Negative")
    static let warning = Color("Warning")
    static let card = Color("CardFace")
    static let cardPatternLight = Color("CardPatternLight")
    static let cardPatternDark = Color("CardPatternDark")
    static let cardEdge = Color("CardEdge")
    /// Text on the sandstone card art: the website's ink.
    static let cardInk = Color(red: 0.173, green: 0.129, blue: 0.094)

    // MARK: Type
    /// Inter Display, the website's typeface (bundled, SIL OFL). Scales with Dynamic Type from `style`.
    static func display(_ size: CGFloat, relativeTo style: Font.TextStyle = .largeTitle) -> Font {
        .custom("InterDisplay-Bold", size: size, relativeTo: style)
    }
    static func displayMedium(_ size: CGFloat, relativeTo style: Font.TextStyle = .body) -> Font {
        .custom("InterDisplay-Medium", size: size, relativeTo: style)
    }

    // MARK: Spacing
    static let xs: CGFloat = 4
    static let small: CGFloat = 8
    static let medium: CGFloat = 16
    static let large: CGFloat = 24
    static let extraLarge: CGFloat = 32

    // MARK: Radii
    static let radiusSmall: CGFloat = 8
    static let radius: CGFloat = 16          // cells and grouped surfaces
    static let cardRadius: CGFloat = 26
    /// Width of the carved stone border around framed blocks.
    static let stoneFrameInset: CGFloat = 16
    /// ISO/IEC 7810 ID-1: 85.60 × 53.98 mm.
    static let cardAspect: CGFloat = 85.60 / 53.98

    // MARK: Sizes
    static let minTouch: CGFloat = 44
    static let actionCircle: CGFloat = 56
    static let rowIcon: CGFloat = 40
    static let settingsIcon: CGFloat = 30
    /// One weight for standalone SF Symbols; symbols inside labels follow their text, as HIG recommends.
    static let symbolWeight: Font.Weight = .semibold

    // MARK: Motion
    /// Short spring for state changes; nil under Reduce Motion so changes apply without movement.
    static func spring(reduceMotion: Bool) -> Animation? {
        reduceMotion ? nil : .spring(response: 0.32, dampingFraction: 0.82)
    }
}

// MARK: - Shared components

/// The one primary action on a screen: solid accent, label in the on-accent color.
struct PrimaryButton: View {
    let title: LocalizedStringKey
    let symbol: String
    let action: () -> Void
    @Environment(\.isEnabled) private var isEnabled
    var body: some View {
        Button(action: action) {
            Label(title, systemImage: symbol)
                .font(Design.displayMedium(15, relativeTo: .headline)).textCase(.uppercase).tracking(1.2)
                .foregroundStyle(isEnabled ? Design.onAccent : Design.textSecondary)
                .frame(maxWidth: .infinity, minHeight: 50)
        }
        .primaryActionStyle()
        .controlSize(.large)
    }
}

extension View {
    /// Solid accent capsule (iOS 17 and 26). Navigation bars, the tab bar and toolbars keep system Liquid Glass.
    func primaryActionStyle() -> some View {
        self.buttonStyle(.borderedProminent).buttonBorderShape(.roundedRectangle(radius: Design.radiusSmall)).tint(Design.accent)
    }

    /// Secondary actions: accent text on a tinted capsule, never competing with the primary one.
    func secondaryActionStyle() -> some View {
        self.buttonStyle(.bordered).buttonBorderShape(.roundedRectangle(radius: Design.radiusSmall)).tint(Design.accent)
    }

    /// Floating status surface (e.g. a progress overlay). Not for content.
    @ViewBuilder func controlSurface() -> some View {
        if #available(iOS 26, *) {
            self.glassEffect(.regular, in: RoundedRectangle(cornerRadius: Design.radius, style: .continuous))
        } else {
            self.background(.regularMaterial, in: RoundedRectangle(cornerRadius: Design.radius, style: .continuous))
        }
    }

    /// Grouped content block: paper inside the website's carved stone frame.
    func surfaceCard(padding: CGFloat = Design.medium) -> some View {
        self.padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .stoneFramed()
    }

    /// The website's stone frame (border-image, 28 pt slices) around a paper surface.
    func stoneFramed() -> some View {
        self.background(Design.surface)
            .padding(Design.stoneFrameInset)
            .background {
                Image("StoneFrame")
                    .resizable(capInsets: EdgeInsets(top: 28, leading: 28, bottom: 28, trailing: 28), resizingMode: .stretch)
                    .allowsHitTesting(false)
                    .accessibilityHidden(true)
            }
            .shadow(color: Design.cardEdge.opacity(0.14), radius: 10, y: 8)
    }

    /// Forms and lists on the themed background, with room above the tab bar.
    func themedList() -> some View {
        self.font(Design.displayMedium(17, relativeTo: .body))
            .listRowBackground(Design.surface)
            .scrollContentBackground(.hidden)
            .background(Design.background.ignoresSafeArea())
            .contentMargins(.bottom, Design.large, for: .scrollContent)
    }

    /// Scroll screens on the themed background, with room above the tab bar.
    func themedScreen() -> some View {
        self.font(Design.displayMedium(17, relativeTo: .body))
            .background(Design.background.ignoresSafeArea())
            .contentMargins(.bottom, Design.large, for: .scrollContent)
    }
}

/// The three cave paintings of the website's card collection. Stored per device (appearance only).
enum CardFinish: String, CaseIterable, Identifiable {
    case sandstone, basalt, obsidian
    var id: String { rawValue }
    static let storageKey = "cardFinish"
    var imageName: String {
        switch self { case .sandstone: "CardArtSandstone"; case .basalt: "CardArtBasalt"; case .obsidian: "CardArtObsidian" }
    }
    var title: LocalizedStringKey {
        switch self { case .sandstone: "The bison"; case .basalt: "The mammoth"; case .obsidian: "The ibex" }
    }
    /// Ink on the light sandstone, bone on the dark basalt and obsidian.
    var ink: Color {
        self == .sandstone ? Design.cardInk : Color(red: 0.953, green: 0.937, blue: 0.898)
    }
}

/// The brand mark. A template image, so it takes the current foreground style.
struct AppLogo: View {
    var body: some View {
        Image("AppLogo")
            .resizable()
            .renderingMode(.template)
            .scaledToFit()
            .accessibilityHidden(true)
    }
}

/// A colored circular or rounded-square well with a white SF Symbol (history rows, settings cells).
struct IconBadge: View {
    enum Shape { case circle, roundedSquare }
    let symbol: String
    let color: Color
    var size: CGFloat = Design.rowIcon
    var shape: Shape = .circle
    var body: some View {
        Image(systemName: symbol)
            .font(.system(size: size * 0.42, weight: Design.symbolWeight))
            .foregroundStyle(.white)
            .frame(width: size, height: size)
            .background(color, in: shape == .circle ? AnyShape(Circle()) : AnyShape(RoundedRectangle(cornerRadius: size * 0.24, style: .continuous)))
            .accessibilityHidden(true)
    }
}

/// Small uppercase label over a section, as on the website ("IN YOUR ACCOUNT").
struct Eyebrow: View {
    let text: LocalizedStringKey
    init(_ text: LocalizedStringKey) { self.text = text }
    var body: some View {
        Text(text)
            .font(Design.displayMedium(12, relativeTo: .caption)).textCase(.uppercase).tracking(1.8)
            .foregroundStyle(Design.textSecondary)
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityAddTraits(.isHeader)
    }
}

/// Round card action with its caption underneath (Refill, Details, Pause), drawn with the website's glyphs.
/// `.toggled` shows an engaged state (a frozen card offers Unfreeze);
/// `.unavailable` explains itself with a lock badge instead of looking broken.
struct CircleActionButton: View {
    enum Mode: Equatable { case normal, toggled, unavailable }
    let title: LocalizedStringKey
    let symbol: String
    /// Website petroglyph asset ("GlyphReceive"); the SF Symbol is used when nil.
    var glyph: String?
    var mode: Mode = .normal
    var hint: LocalizedStringKey?
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: Design.small) {
                ZStack(alignment: .bottomTrailing) {
                    Group {
                        if let glyph {
                            Image(glyph).renderingMode(.template).resizable().scaledToFit().frame(width: 28, height: 28)
                        } else {
                            Image(systemName: symbol).font(.system(size: 22, weight: Design.symbolWeight))
                        }
                    }
                    .foregroundStyle(mode == .normal ? Design.onAccent : mode == .toggled ? Design.accent : Design.textSecondary)
                    .frame(width: Design.actionCircle, height: Design.actionCircle)
                    .accessibilityHidden(true) // The caption is the label; the hint explains an unavailable state.
                    .background {
                        Circle().fill(mode == .normal ? Design.accent : Design.surfaceRaised)
                        if mode == .toggled { Circle().strokeBorder(Design.accent, lineWidth: 2) }
                    }
                    if mode == .unavailable {
                        Image(systemName: "lock.fill")
                            .font(.system(size: 11, weight: .bold))
                            .foregroundStyle(Design.textSecondary)
                            .frame(width: 22, height: 22)
                            .background(Design.background, in: Circle())
                            .offset(x: 2, y: 2)
                            .accessibilityHidden(true)
                    }
                }
                Text(title)
                    .font(Design.displayMedium(13, relativeTo: .footnote)).textCase(.uppercase).tracking(1)
                    .foregroundStyle(mode == .unavailable ? Design.textSecondary : Color.primary)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(minWidth: 72, minHeight: Design.minTouch)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityHint(hint.map { Text($0) } ?? Text(""))
    }
}

struct AdaptiveDetailRow: View {
    let title: LocalizedStringKey
    let value: String
    @Environment(\.dynamicTypeSize) private var textSize

    var body: some View {
        if textSize.isAccessibilitySize {
            VStack(alignment: .leading, spacing: Design.small) {
                Text(title).font(.headline)
                Text(value).foregroundStyle(Design.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .accessibilityElement(children: .combine)
        } else {
            LabeledContent {
                Text(value).foregroundStyle(Design.textSecondary)
            } label: {
                Text(title)
            }
            .accessibilityElement(children: .combine) // One element reads "Card credit, $25.50", not a bare amount.
        }
    }
}
