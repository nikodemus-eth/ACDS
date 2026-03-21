import Foundation
import NIOHTTP1

/// POST /execute — Accepts a prompt request and returns generated text via Foundation Models.
enum ExecuteEndpoint {
    struct Request: Codable {
        let model: String
        let prompt: String
        let system: String?
        let maxTokens: Int?
        let temperature: Double?
        let responseFormat: String?
        /// Subsystem method to invoke (e.g. "image_creator.generate", "tts.speak").
        /// When nil or starting with "foundation_models.", routes to FoundationModelsWrapper.
        let method: String?
    }

    struct Response: Codable {
        let model: String
        let content: String
        let done: Bool
        let inputTokens: Int?
        let outputTokens: Int?
        let durationMs: Int
        let capabilities: [String]
    }

    static func handle(body: Data?) -> (NIOHTTP1.HTTPResponseStatus, Data) {
        guard let body = body else {
            let error = #"{"error":"Request body is required"}"#.data(using: .utf8)!
            return (.badRequest, error)
        }

        guard let request = try? JSONDecoder().decode(Request.self, from: body) else {
            let error = #"{"error":"Invalid request format"}"#.data(using: .utf8)!
            return (.badRequest, error)
        }

        // Route based on method: nil or foundation_models.* → text generation,
        // writing_tools.* → text generation with writing prompt, all others → 501
        let methodStr = request.method ?? "foundation_models.generate"
        let isTextCapable = methodStr.hasPrefix("foundation_models.") || methodStr.hasPrefix("writing_tools.")

        if !isTextCapable {
            let errorJson = #"{"error":"Subsystem not yet implemented: \#(methodStr)","method":"\#(methodStr)","hint":"Only foundation_models and writing_tools subsystems are currently supported by the bridge."}"#
            return (.notImplemented, errorJson.data(using: .utf8)!)
        }

        let start = Date()
        let result = FoundationModelsWrapper.execute(
            prompt: request.prompt,
            model: request.model,
            systemPrompt: request.system,
            maxTokens: request.maxTokens,
            temperature: request.temperature
        )
        let durationMs = Int(Date().timeIntervalSince(start) * 1000)

        switch result {
        case .success(let output):
            let response = Response(
                model: request.model,
                content: output.text,
                done: true,
                inputTokens: output.inputTokens,
                outputTokens: output.outputTokens,
                durationMs: durationMs,
                capabilities: ["text-generation"]
            )
            let data = try! JSONEncoder().encode(response)
            return (.ok, data)

        case .failure(let error):
            let errorResponse = #"{"error":"\#(error.localizedDescription)"}"#.data(using: .utf8)!
            return (.internalServerError, errorResponse)
        }
    }
}
