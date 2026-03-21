import Foundation
import NaturalLanguage

/// Wraps NaturalLanguage + Foundation Models for text translation.
/// Uses NLLanguageRecognizer for language detection and Foundation Models for actual translation.
/// Methods: translation.translate
enum TranslationWrapper {
    struct Output: Sendable {
        let content: String
        let durationMs: Int
    }

    enum BridgeError: Error, LocalizedError, Sendable {
        case unsupportedPlatform
        case translationFailed(String)

        var errorDescription: String? {
            switch self {
            case .unsupportedPlatform:
                return "Translation requires macOS 10.15+"
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

        // Use Foundation Models for translation with a specific system prompt
        let systemPrompt = """
        You are a professional translator. Translate the following text from \(languageName(detectedLanguage)) to \(languageName(targetLanguage)). \
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
            {"translatedText":"\(translatedText.replacingOccurrences(of: "\"", with: "\\\"").replacingOccurrences(of: "\n", with: "\\n"))","detectedLanguage":"\(detectedLanguage)","targetLanguage":"\(targetLanguage)"}
            """
            return .success(Output(content: json, durationMs: 0))
        case .failure(let error):
            return .failure(.translationFailed(error.localizedDescription))
        }
    }

    /// Map language codes to human-readable names for the Foundation Models prompt.
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
