import Foundation
import NIOHTTP1

/// POST /execute — Routes requests to the appropriate Apple Intelligence subsystem.
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
        /// Target language for translation
        let targetLanguage: String?
        /// Source language hint for translation/speech
        let sourceLanguage: String?
        /// Voice identifier for TTS
        let voice: String?
        /// Speech rate for TTS (0.0–1.0)
        let rate: Double?
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

        let methodStr = request.method ?? "foundation_models.generate"
        let subsystem = methodStr.split(separator: ".").first.map(String.init) ?? "foundation_models"

        let start = Date()

        switch subsystem {
        case "foundation_models", "writing_tools":
            return handleFoundationModels(request: request, start: start)

        case "tts":
            return handleTTS(request: request, method: methodStr, start: start)

        case "vision":
            return handleVision(request: request, method: methodStr, start: start)

        case "speech":
            return handleSpeech(request: request, method: methodStr, start: start)

        case "image_creator":
            return handleImageCreator(request: request, start: start)

        case "translation":
            return handleTranslation(request: request, start: start)

        case "sound":
            return handleSound(request: request, start: start)

        default:
            let errorJson = #"{"error":"Unknown subsystem: \#(subsystem)","method":"\#(methodStr)"}"#
            return (.notImplemented, errorJson.data(using: .utf8)!)
        }
    }

    // MARK: - Subsystem Handlers

    private static func handleFoundationModels(request: Request, start: Date) -> (NIOHTTP1.HTTPResponseStatus, Data) {
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
                model: request.model, content: output.text, done: true,
                inputTokens: output.inputTokens, outputTokens: output.outputTokens,
                durationMs: durationMs, capabilities: ["text-generation"]
            )
            return (.ok, try! JSONEncoder().encode(response))
        case .failure(let error):
            return (.internalServerError, #"{"error":"\#(error.localizedDescription)"}"#.data(using: .utf8)!)
        }
    }

    private static func handleTTS(request: Request, method: String, start: Date) -> (NIOHTTP1.HTTPResponseStatus, Data) {
        let result = TTSWrapper.execute(method: method, text: request.prompt, voice: request.voice, rate: request.rate)
        let durationMs = Int(Date().timeIntervalSince(start) * 1000)

        switch result {
        case .success(let output):
            let response = Response(
                model: "apple-tts", content: output.content, done: true,
                inputTokens: request.prompt.count / 4, outputTokens: nil,
                durationMs: durationMs, capabilities: ["text-to-speech"]
            )
            return (.ok, try! JSONEncoder().encode(response))
        case .failure(let error):
            return (.internalServerError, #"{"error":"\#(error.localizedDescription)"}"#.data(using: .utf8)!)
        }
    }

    private static func handleVision(request: Request, method: String, start: Date) -> (NIOHTTP1.HTTPResponseStatus, Data) {
        let result = VisionWrapper.execute(method: method, imageData: request.prompt)
        let durationMs = Int(Date().timeIntervalSince(start) * 1000)

        switch result {
        case .success(let output):
            let response = Response(
                model: "apple-vision", content: output.content, done: true,
                inputTokens: nil, outputTokens: nil,
                durationMs: durationMs, capabilities: ["vision"]
            )
            return (.ok, try! JSONEncoder().encode(response))
        case .failure(let error):
            return (.internalServerError, #"{"error":"\#(error.localizedDescription)"}"#.data(using: .utf8)!)
        }
    }

    private static func handleSpeech(request: Request, method: String, start: Date) -> (NIOHTTP1.HTTPResponseStatus, Data) {
        let result = SpeechWrapper.execute(method: method, audioData: request.prompt, language: request.sourceLanguage)
        let durationMs = Int(Date().timeIntervalSince(start) * 1000)

        switch result {
        case .success(let output):
            let response = Response(
                model: "apple-speech", content: output.content, done: true,
                inputTokens: nil, outputTokens: nil,
                durationMs: durationMs, capabilities: ["speech-recognition"]
            )
            return (.ok, try! JSONEncoder().encode(response))
        case .failure(let error):
            return (.internalServerError, #"{"error":"\#(error.localizedDescription)"}"#.data(using: .utf8)!)
        }
    }

    private static func handleImageCreator(request: Request, start: Date) -> (NIOHTTP1.HTTPResponseStatus, Data) {
        let result = ImageCreatorWrapper.execute(prompt: request.prompt, style: nil)
        let durationMs = Int(Date().timeIntervalSince(start) * 1000)

        switch result {
        case .success(let output):
            let response = Response(
                model: "apple-image-creator", content: output.content, done: true,
                inputTokens: request.prompt.count / 4, outputTokens: nil,
                durationMs: durationMs, capabilities: ["image-generation"]
            )
            return (.ok, try! JSONEncoder().encode(response))
        case .failure(let error):
            return (.internalServerError, #"{"error":"\#(error.localizedDescription)"}"#.data(using: .utf8)!)
        }
    }

    private static func handleTranslation(request: Request, start: Date) -> (NIOHTTP1.HTTPResponseStatus, Data) {
        let targetLang = request.targetLanguage ?? "es"
        let result = TranslationWrapper.execute(text: request.prompt, targetLanguage: targetLang, sourceLanguage: request.sourceLanguage)
        let durationMs = Int(Date().timeIntervalSince(start) * 1000)

        switch result {
        case .success(let output):
            let response = Response(
                model: "apple-translation", content: output.content, done: true,
                inputTokens: request.prompt.count / 4, outputTokens: nil,
                durationMs: durationMs, capabilities: ["translation"]
            )
            return (.ok, try! JSONEncoder().encode(response))
        case .failure(let error):
            return (.internalServerError, #"{"error":"\#(error.localizedDescription)"}"#.data(using: .utf8)!)
        }
    }

    private static func handleSound(request: Request, start: Date) -> (NIOHTTP1.HTTPResponseStatus, Data) {
        let result = SoundWrapper.execute(audioData: request.prompt)
        let durationMs = Int(Date().timeIntervalSince(start) * 1000)

        switch result {
        case .success(let output):
            let response = Response(
                model: "apple-sound", content: output.content, done: true,
                inputTokens: nil, outputTokens: nil,
                durationMs: durationMs, capabilities: ["sound-classification"]
            )
            return (.ok, try! JSONEncoder().encode(response))
        case .failure(let error):
            return (.internalServerError, #"{"error":"\#(error.localizedDescription)"}"#.data(using: .utf8)!)
        }
    }
}
