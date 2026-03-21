import Foundation
import NaturalLanguage
import Translation

/// Wraps Apple's Translation framework for text translation.
/// Uses the real TranslationSession API (macOS 26+) when language packs are installed.
/// Falls back to Foundation Models when language packs are not installed.
/// Methods: translation.translate
enum TranslationWrapper {
    struct Output: Sendable {
        let content: String
        let durationMs: Int
    }

    enum BridgeError: Error, LocalizedError, Sendable {
        case translationFailed(String)

        var errorDescription: String? {
            switch self {
            case .translationFailed(let reason):
                return "Translation failed: \(reason)"
            }
        }
    }

    static func execute(text: String, targetLanguage: String, sourceLanguage: String?) -> Result<Output, BridgeError> {
        // Detect source language using NLLanguageRecognizer
        let recognizer = NLLanguageRecognizer()
        recognizer.processString(text)
        let detectedLanguage = sourceLanguage ?? (recognizer.dominantLanguage?.rawValue ?? "en")

        // Try real Translation framework first
        let realResult = translateWithFramework(
            text: text,
            source: detectedLanguage,
            target: targetLanguage
        )

        switch realResult {
        case .success(let output):
            return .success(output)
        case .failure(let error):
            // Fall back to Foundation Models only when Translation framework can't do it
            // (e.g., language packs not installed)
            let fmResult = translateWithFoundationModels(
                text: text,
                source: detectedLanguage,
                target: targetLanguage,
                frameworkError: error.localizedDescription
            )
            return fmResult
        }
    }

    /// Attempt translation using the real Translation framework (macOS 26+)
    private static func translateWithFramework(text: String, source: String, target: String) -> Result<Output, BridgeError> {
        let semaphore = DispatchSemaphore(value: 0)
        let box = ResultBox<Result<Output, BridgeError>>(.failure(.translationFailed("Timeout")))

        let capturedSource = source
        let capturedTarget = target
        let capturedText = text

        Task { @Sendable in
            if #available(macOS 26.0, *) {
                do {
                    let session = TranslationSession(
                        installedSource: Locale.Language(identifier: capturedSource),
                        target: Locale.Language(identifier: capturedTarget)
                    )
                    let result = try await session.translate(capturedText)

                    let json = """
                    {"translatedText":"\(result.targetText.replacingOccurrences(of: "\"", with: "\\\"").replacingOccurrences(of: "\n", with: "\\n"))","detectedLanguage":"\(capturedSource)","targetLanguage":"\(capturedTarget)","engine":"apple-translation"}
                    """
                    box.value = .success(Output(content: json, durationMs: 0))
                } catch {
                    box.value = .failure(.translationFailed(error.localizedDescription))
                }
            } else {
                box.value = .failure(.translationFailed("Translation framework requires macOS 26.0+"))
            }
            semaphore.signal()
        }

        let timeout = DispatchTime.now() + .seconds(30)
        _ = semaphore.wait(timeout: timeout)
        return box.value
    }

    /// Fallback: use Foundation Models with a translation system prompt
    private static func translateWithFoundationModels(text: String, source: String, target: String, frameworkError: String) -> Result<Output, BridgeError> {
        let systemPrompt = """
        You are a professional translator. Translate the following text from \(languageName(source)) to \(languageName(target)). \
        Output ONLY the translated text with no explanation, no commentary, and no quotation marks.
        """

        let fmResult = FoundationModelsWrapper.execute(
            prompt: text,
            model: "apple-fm-on-device",
            systemPrompt: systemPrompt,
            maxTokens: nil,
            temperature: 0.3
        )

        switch fmResult {
        case .success(let output):
            let translatedText = output.text.trimmingCharacters(in: .whitespacesAndNewlines)
                .trimmingCharacters(in: CharacterSet(charactersIn: "\""))
            let json = """
            {"translatedText":"\(translatedText.replacingOccurrences(of: "\"", with: "\\\"").replacingOccurrences(of: "\n", with: "\\n"))","detectedLanguage":"\(source)","targetLanguage":"\(target)","engine":"foundation-models","note":"Translation framework unavailable (\(frameworkError.replacingOccurrences(of: "\"", with: "\\\""))). Using Foundation Models."}
            """
            return .success(Output(content: json, durationMs: 0))
        case .failure(let error):
            return .failure(.translationFailed(error.localizedDescription))
        }
    }

    private static func languageName(_ code: String) -> String {
        let mapping: [String: String] = [
            "en": "English", "es": "Spanish", "fr": "French", "de": "German",
            "it": "Italian", "pt": "Portuguese", "ja": "Japanese", "ko": "Korean",
            "zh": "Chinese", "ar": "Arabic", "ru": "Russian", "hi": "Hindi",
            "nl": "Dutch", "sv": "Swedish", "da": "Danish", "no": "Norwegian",
            "fi": "Finnish", "pl": "Polish", "tr": "Turkish", "th": "Thai",
            "vi": "Vietnamese", "id": "Indonesian", "ms": "Malay", "uk": "Ukrainian",
            "cs": "Czech", "ro": "Romanian", "hu": "Hungarian", "el": "Greek",
            "he": "Hebrew", "bg": "Bulgarian", "hr": "Croatian", "sk": "Slovak",
        ]
        return mapping[code.prefix(2).lowercased()] ?? code
    }
}
