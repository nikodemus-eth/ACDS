from __future__ import annotations


def merge_configuration(class_defaults: dict, extracted_params: dict) -> dict:
    """Merge class defaults with extracted parameters.

    Rules:
    - Scalar: extracted wins if non-None
    - List: extracted wins if non-empty
    - Null/empty: don't override default
    """
    merged: dict = {}

    all_keys = set(class_defaults.keys()) | set(extracted_params.keys())

    for key in all_keys:
        default_val = class_defaults.get(key)
        extracted_val = extracted_params.get(key)

        if isinstance(extracted_val, list):
            if extracted_val:
                merged[key] = extracted_val
            elif default_val is not None:
                merged[key] = default_val
            else:
                merged[key] = []
        elif extracted_val is not None:
            merged[key] = extracted_val
        elif default_val is not None:
            merged[key] = default_val
        else:
            merged[key] = None

    return merged
