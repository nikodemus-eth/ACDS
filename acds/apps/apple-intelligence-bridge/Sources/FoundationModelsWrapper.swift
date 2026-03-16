import Foundation

#if canImport(FoundationModels)
import FoundationModels
#endif

/// Thread-safe box for passing results between Task and synchronous caller.
private final class ResultBox<T: Sendable>: @unchecked Sendable {
    private let lock = NSLock()
    private var _value: T

    init(_ value: T) { _value = value }

    var value: T {
        get { lock.lock(); defer { lock.unlock() }; return _value }
        set { lock.lock(); defer { lock.unlock() }; _value = newValue }
    }
}

/// Wraps Apple's Foundation Models framework for on-device inference.
/// Uses @available checks to gracefully degrade on unsupported macOS versions.
enum FoundationModelsWrapper {
    struct ModelOutput: Sendable {
        let text: String
        let inputTokens: Int?
        let outputTokens: Int?
    }

    struct Capabilities: Sendable {
        let models: [String]
        let taskTypes: [String]
        let maxTokens: Int
    }

    enum BridgeError: Error, LocalizedError, Sendable {
        case unsupportedPlatform
        case modelNotAvailable(String)
        case executionFailed(String)

        var errorDescription: String? {
            switch self {
            case .unsupportedPlatform:
                return "Foundation Models requires macOS 26.0 or later"
            case .modelNotAvailable(let model):
                return "Model '\(model)' is not available on this device"
            case .executionFailed(let reason):
                return "Execution failed: \(reason)"
            }
        }
    }

    /// Query available models and capabilities.
    static func queryCapabilities() -> Capabilities {
        return Capabilities(
            models: ["apple-fm-on-device"],
            taskTypes: ["classification", "extraction", "summarization", "generation", "decision_support"],
            maxTokens: 4096
        )
    }

    /// Execute a prompt against Foundation Models.
    static func execute(
        prompt: String,
        model: String,
        systemPrompt: String?,
        maxTokens: Int?,
        temperature: Double?
    ) -> Result<ModelOutput, BridgeError> {
        #if canImport(FoundationModels)
        if #available(macOS 26.0, *) {
            let semaphore = DispatchSemaphore(value: 0)
            let box = ResultBox<Result<ModelOutput, BridgeError>>(.failure(.executionFailed("Timeout")))

            let capturedPrompt = prompt
            let capturedSystemPrompt = systemPrompt

            Task {
                do {
                    let session: LanguageModelSession
                    if let sys = capturedSystemPrompt, !sys.isEmpty {
                        session = LanguageModelSession(instructions: sys)
                    } else {
                        session = LanguageModelSession()
                    }
                    let response = try await session.respond(to: capturedPrompt)
                    let text = response.content
                    box.value = .success(ModelOutput(
                        text: text,
                        inputTokens: capturedPrompt.count / 4,
                        outputTokens: text.count / 4
                    ))
                } catch {
                    box.value = .failure(.executionFailed(error.localizedDescription))
                }
                semaphore.signal()
            }

            semaphore.wait()
            return box.value
        }
        #endif

        return .failure(.unsupportedPlatform)
    }
}
