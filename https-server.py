import http.server
import ssl
import socketserver
import os

PORT = 8443
DIR = os.path.dirname(os.path.abspath(__file__))

handler = http.server.SimpleHTTPRequestHandler
handler.directory = DIR

with socketserver.TCPServer(("0.0.0.0", PORT), handler) as httpd:
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.load_cert_chain(os.path.join(DIR, "server.crt"), os.path.join(DIR, "server.key"))
    httpd.socket = context.wrap_socket(httpd.socket, server_side=True)
    print(f"\n  HTTPS Server running at: https://192.168.31.139:{PORT}")
    print(f"  Open this on your phone: https://192.168.31.139:{PORT}")
    print(f"  Browser will show a warning - click 'Advanced' then 'Proceed'\n")
    httpd.serve_forever()
