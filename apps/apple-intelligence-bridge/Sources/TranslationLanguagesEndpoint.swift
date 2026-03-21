import Foundation
import NIOHTTP1
import Translation

/// GET /translation/languages — Returns installed and available translation languages.
/// Each call queries the real Translation framework for current installation status.
enum TranslationLanguagesEndpoint {
    struct LanguageInfo: Codable {
        let code: String
        let name: String
        let installed: Bool
    }

    static func handle() -> (NIOHTTP1.HTTPResponseStatus, Data) {
        let semaphore = DispatchSemaphore(value: 0)
        let box = ResultBox<Data>("[]".data(using: .utf8)!)

        Task { @Sendable in
            if #available(macOS 26.0, *) {
                let availability = LanguageAvailability()
                let supported = await availability.supportedLanguages

                var languages: [LanguageInfo] = []
                for lang in supported {
                    let code = lang.minimalIdentifier
                    let name = Locale.current.localizedString(forLanguageCode: code) ?? code

                    // Try to determine if installed by attempting session creation
                    var installed = false
                    do {
                        let session = TranslationSession(
                            installedSource: Locale.Language(identifier: "en"),
                            target: lang
                        )
                        _ = try await session.translate("test")
                        installed = true
                    } catch {
                        let errorStr = "\(error)"
                        installed = !errorStr.contains("notInstalled")
                    }

                    languages.append(LanguageInfo(code: code, name: name, installed: installed))
                }

                // Sort: installed first, then alphabetical
                languages.sort { a, b in
                    if a.installed != b.installed { return a.installed }
                    return a.name < b.name
                }

                box.value = (try? JSONEncoder().encode(languages)) ?? "[]".data(using: .utf8)!
            }
            semaphore.signal()
        }

        _ = semaphore.wait(timeout: .now() + 60)
        return (.ok, box.value)
    }
}
