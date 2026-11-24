"""Lokaler Webserver zum Testen (wie `python -m http.server`), aber ohne Zwischenspeichern im Browser.

So sieht man nach jeder Änderung sofort den neuen Stand, ohne Strg+F5.
Aufruf: python lokal-server.py [port]   (Standard: 8000)
"""
import http.server
import sys


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        super().end_headers()

    def send_head(self):
        # Keine "304 Not Modified"-Antworten: immer die aktuelle Datei schicken
        for h in ("If-Modified-Since", "If-None-Match"):
            if h in self.headers:
                del self.headers[h]
        return super().send_head()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    print(f"Weihnachtsbingo lokal: http://localhost:{port}/index.html?lokal  (Beenden: Strg+C)")
    http.server.ThreadingHTTPServer(("", port), NoCacheHandler).serve_forever()
