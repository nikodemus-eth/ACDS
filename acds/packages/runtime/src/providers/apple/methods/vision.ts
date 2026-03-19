/**
 * Vision method handler.
 *
 * Dispatches apple.vision.ocr, apple.vision.document_extract
 * to the AppleVisionPlatform.
 */
import type { AppleVisionPlatform } from "../apple-interfaces.js";
import { MethodNotAvailableError, ValidationFailedError } from "../../../domain/errors.js";

export async function handleVision(
  method_id: string,
  input: unknown,
  platform: AppleVisionPlatform,
): Promise<unknown> {
  const data = input as Record<string, unknown>;

  switch (method_id) {
    case "apple.vision.ocr": {
      const imagePath = data?.image_path;
      if (typeof imagePath !== "string") {
        throw new ValidationFailedError("apple.vision.ocr requires a string 'image_path'");
      }
      return platform.ocr(imagePath);
    }
    case "apple.vision.document_extract": {
      const imagePath = data?.image_path;
      if (typeof imagePath !== "string") {
        throw new ValidationFailedError("apple.vision.document_extract requires a string 'image_path'");
      }
      return platform.documentExtract(imagePath);
    }
    default:
      throw new MethodNotAvailableError(method_id);
  }
}
