from __future__ import annotations

import argparse

from proof_ui.server import start_server


def main() -> None:
    parser = argparse.ArgumentParser(description="Process Swarm ProofUI")
    parser.add_argument("--port", type=int, default=18790)
    parser.add_argument("--root", default=".")
    args = parser.parse_args()
    start_server(args.root, args.port)


if __name__ == "__main__":
    main()
