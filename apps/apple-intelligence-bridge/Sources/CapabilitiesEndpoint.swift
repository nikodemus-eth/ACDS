import Foundation
import NIOHTTP1

/// GET /capabilities — Returns available models and supported task types.
enum CapabilitiesEndpoint {
    static func handle() -> (NIOHTTP1.HTTPResponseStatus, Data) {
        let capabilities = FoundationModelsWrapper.queryCapabilities()
        let response: [String: Any] = [
            "models": capabilities.models,
            "supportedTaskTypes": capabilities.taskTypes,
            "maxTokens": capabilities.maxTokens,
            "platform": "macOS",
        ]
        let data = try! JSONSerialization.data(withJSONObject: response)
        return (.ok, data)
    }
}
