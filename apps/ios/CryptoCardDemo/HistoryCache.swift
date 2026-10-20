import Foundation
import SwiftData

@Model
final class CachedHistory {
    @Attribute(.unique) var id: String
    var ownerID: String
    var payload: Data
    init(id: String, ownerID: String, payload: Data) {
        self.id = id
        self.ownerID = ownerID
        self.payload = payload
    }
}

@MainActor
final class HistoryCache {
    private let container: ModelContainer
    init(inMemory: Bool) throws {
        container = try ModelContainer(for: CachedHistory.self,
            configurations: ModelConfiguration(isStoredInMemoryOnly: inMemory))
    }
    func replace(_ activities: [Activity], ownerID: String) throws {
        try clear()
        for activity in activities {
            container.mainContext.insert(CachedHistory(id: activity.id, ownerID: ownerID,
                payload: try JSONEncoder().encode(activity)))
        }
        try container.mainContext.save()
    }
    func read(ownerID: String) throws -> [Activity] {
        try container.mainContext.fetch(FetchDescriptor<CachedHistory>())
            .filter { $0.ownerID == ownerID }
            .map { try JSONDecoder().decode(Activity.self, from: $0.payload) }
            .sorted { $0.occurredAt > $1.occurredAt }
    }
    func clear() throws {
        try container.mainContext.delete(model: CachedHistory.self)
        try container.mainContext.save()
    }
}
