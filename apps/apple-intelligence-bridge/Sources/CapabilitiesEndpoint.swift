import Foundation
import NIOHTTP1

/// GET /capabilities — Returns available models and supported subsystems.
enum CapabilitiesEndpoint {
    static func handle() -> (NIOHTTP1.HTTPResponseStatus, Data) {
        let capabilities = FoundationModelsWrapper.queryCapabilities()
        let response: [String: Any] = [
            "models": capabilities.models,
            "supportedTaskTypes": capabilities.taskTypes,
            "maxTokens": capabilities.maxTokens,
            "platform": "macOS",
            "subsystems": [
                ["name": "foundation_models", "status": "active", "methods": ["generate", "summarize", "extract"]],
                ["name": "writing_tools", "status": "active", "methods": ["rewrite", "proofread", "summarize"]],
                ["name": "speech", "status": "active", "methods": ["transcribe_file", "transcribe_longform", "transcribe_live", "dictation_fallback"]],
                ["name": "tts", "status": "active", "methods": ["speak", "render_audio"]],
                ["name": "vision", "status": "active", "methods": ["ocr", "document_extract"]],
                ["name": "image_creator", "status": "active", "methods": ["generate"]],
                ["name": "translation", "status": "active", "methods": ["translate"]],
                ["name": "sound", "status": "active", "methods": ["classify"]],
            ],
        ]
        let data = try! JSONSerialization.data(withJSONObject: response)
        return (.ok, data)
    }
}
