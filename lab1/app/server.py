import os
import sys
import socket
import time

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
        request = conn.recv(1024).decode('utf-8')
        if not request:
            return

        request_line = request.splitlines()[0]
        method, path, _ = request_line.split()

        if method != "GET":
            response = (
                "HTTP/1.1 404 Not Found\r\n"  # changed to 404
                "\r\n"
            )
            conn.sendall(response.encode('utf-8'))
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
            conn.sendall(header.encode('utf-8') + body)

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
                conn.sendall(header.encode('utf-8') + content)
            except:
                conn.sendall(b"HTTP/1.1 404 Not Found\r\n\r\n")  # changed to 404

        else:
            body = b"<html><h1>404 Not Found</h1></html>"
            header = (
                "HTTP/1.1 404 Not Found\r\n"
                "Content-Type: text/html\r\n"
                f"Content-Length: {len(body)}\r\n"
                "\r\n"
            )
            conn.sendall(header.encode('utf-8') + body)
    except Exception as e:
        print(f"Error handling client: {e}")
        body = b"<html><h1>404 Not Found</h1></html>"
        header = (
            "HTTP/1.1 404 Not Found\r\n"
            "Content-Type: text/html\r\n"
            f"Content-Length: {len(body)}\r\n"
            "\r\n"
        )
        conn.sendall(header.encode('utf-8') + body)


def run_server(base_dir, host='0.0.0.0', port=8000):
    print(f"Now listening on http://localhost:{port} directory: {base_dir}")

    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind((host, port))
        s.listen(5)
        while True:
            conn, addr = s.accept()
            print(f"Connection from {addr}")
            handle_client(conn, base_dir)
            conn.close()


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python server.py <directory_to_serve>")
        sys.exit(1)

    base_dir = os.path.abspath(sys.argv[1])
    run_server(base_dir)
