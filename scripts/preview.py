#!/usr/bin/env python3
"""Open the static demo locally without using or stopping an existing server."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import threading
import webbrowser


def main():
    site = Path(__file__).resolve().parents[1] / "site"
    server = ThreadingHTTPServer(("127.0.0.1", 0), partial(SimpleHTTPRequestHandler, directory=str(site)))
    address = f"http://127.0.0.1:{server.server_port}/"
    print("AI4Theology demo: " + address, flush=True)
    print("Keep this window open. Control+C stops this preview only.", flush=True)
    opener = threading.Timer(0.5, webbrowser.open, args=(address,))
    opener.daemon = True
    opener.start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
