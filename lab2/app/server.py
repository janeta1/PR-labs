import os
import sys
import socket

CONTENT_TYPES = {
    ".html": "text/html",
    ".pdf": "application/pdf",
    ".png": "image/png"
}


def get_content_type(filename):
    _, extension = os.path.splitext(filename)
    return CONTENT_TYPES.get(extension, "application/octet-stream")


def generate_directory_listing(path, request_path):
    files = os.listdir(path)
    html = f"<html>\n<body>\n<h2>Directory listing for {request_path}</h2>\n<ul>\n"
    for f in files:
        full_path = os.path.join(path, f)
        display_name = f + "/" if os.path.isdir(full_path) else f
        href = os.path.join(request_path, f).replace("\\", "/")
        html += f'  <li><a href="{href}">{display_name}</a></li>\n'
    html += "</ul>\n</body>\n</html>\n"
    return html.encode("utf-8")


def handle_client(conn, base_dir):
    try:
        request = conn.recv(1024).decode()
        if not request:
            return

        request_line = request.splitlines()[0]
        method, path, _ = request_line.split()

        if method != "GET":
            response = (
                "HTTP/1.1 405 Method Not Allowed\r\n"
                "Allow: GET\r\n"
                "\r\n"
            )
            conn.sendall(response.encode())
            return

        path = path.lstrip('/')
        full_path = os.path.join(base_dir, path)
        print(f"Client requested: {full_path}")
        if os.path.isdir(full_path):
            body = generate_directory_listing(full_path, '/' + path)
            header = (
                "HTTP/1.1 200 OK\r\n"
                "Content-Type: text/html\r\n"
                f"Content-Length: {len(body)}\r\n"
                "\r\n"
            )
            conn.sendall(header.encode() + body)

        elif os.path.isfile(full_path):
            content_type = get_content_type(full_path)
            try:
                with open(full_path, "rb") as f:
                    content = f.read()
                header = ("HTTP/1.1 200 OK\r\n"
                          f"Content-Type: {content_type}\r\n"
                          f"Content-Length: {len(content)}\r\n"
                          "\r\n"
                          )
                conn.sendall(header.encode() + content)
            except:
                conn.sendall(b"HTTP/1.1 500 Internal Server Error\r\n\r\n")

        else:
            body = b"<html><h1>404 Not Found</h1></html>"
            header = (
                "HTTP/1.1 404 Not Found\r\n"
                "Content-Type: text/html\r\n"
                f"Content-Length: {len(body)}\r\n"
                "\r\n"
            )
            conn.sendall(header.encode() + body)

    finally:
        conn.close()  # closing after handling the client


def run_server(base_dir, host='0.0.0.0', port=8000):
    print(f"Now listening on http://localhost:{port} directory: {base_dir}")

    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind((host, port))
        s.listen(1)
        while True:
            conn, addr = s.accept()
            print(f"Connection from {addr}")
            handle_client(conn, base_dir)


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python server.py <directory_to_serve>")
        sys.exit(1)

    base_dir = os.path.abspath(sys.argv[1])
    run_server(base_dir)
