import Foundation

/// POST /execute — Accepts a prompt request and returns generated text via Foundation Models.
enum ExecuteEndpoint {
    struct Request: Codable {
        let model: String
        let prompt: String
        let system: String?
        let maxTokens: Int?
        let temperature: Double?
        let responseFormat: String?
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
