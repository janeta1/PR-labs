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
    parent_path = os.path.dirname(request_path.rstrip("/"))
    if not parent_path:
        parent_path = "/"

    html = f"""
    <html>
    <head>
        <title>Janeta's Directory</title>
        <style>
            body {{
                background-color: #fff6fa;
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                color: #4a4a4a;
                text-align: center;
                margin: 40px;
            }}
            h2 {{
                color: #e86ca1;
                margin-bottom: 30px;
                font-size: 26px;
            }}
            table {{
                margin: 0 auto;
                border-collapse: collapse;
                width: 70%;
                background-color: #fff;
                border-radius: 12px;
                overflow: hidden;
                box-shadow: 0px 2px 8px rgba(0,0,0,0.1);
            }}
            th {{
                background-color: #f9c9d4;
                color: #4a4a4a;
                padding: 12px;
                font-size: 16px;
                border-bottom: 2px solid #f2a8ba;
                text-align: left;
            }}
            td {{
                padding: 10px;
                border-bottom: 1px solid #f2f2f2;
                text-align: left;
            }}
            tr:hover {{
                background-color: #ffe6ef;
            }}
            a {{
                color: #c84c86;
                text-decoration: none;
                font-weight: 500;
            }}
            a:hover {{
                text-decoration: underline;
                color: #ff69b4;
            }}
            footer {{
                margin-top: 40px;
                font-size: 14px;
                color: #888;
            }}
        </style>
    </head>
    <body>
        <h2>Janeta's Directory Listing for {request_path}</h2>
        <table>
            <tr><th>Name</th><th>Type</th><th>Size</th></tr>
    """

    # add the "../" link only if not in root
    if request_path.strip("/") != "":
        html += f"""
            <tr>
                <td><a href="{parent_path}">../</a></td>
                <td>-</td>
                <td>-</td>
            </tr>
        """

    # list all files and folders
    for f in files:
        full_path = os.path.join(path, f)
        href = os.path.join(request_path, f).replace("\\", "/")
        file_type = "Folder" if os.path.isdir(full_path) else "File"
        size = "-" if os.path.isdir(full_path) else f"{os.path.getsize(full_path)} bytes"
        display_name = f + "/" if os.path.isdir(full_path) else f
        html += f"""
            <tr>
                <td><a href="{href}">{display_name}</a></td>
                <td>{file_type}</td>
                <td>{size}</td>
            </tr>
        """

    html += """
        </table>
        <footer>Served with love by Janeta's Server &#128150;</footer>
    </body>
    </html>
    """
    return html.encode('utf-8')


def generate_404_page(request_path):
    parent_path = os.path.dirname(request_path.rstrip("/")) or "/"
    html = f"""
    <html>
    <head>
        <title>404 Not Found</title>
        <style>
            body {{
                background-color: #fff6fa;
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                color: #4a4a4a;
                text-align: center;
                margin: 80px;
            }}
            h2 {{
                color: #e86ca1;
                font-size: 32px;
                margin-bottom: 20px;
            }}
            a {{
                color: #c84c86;
                text-decoration: none;
                font-weight: 500;
                font-size: 20px;
            }}
            a:hover {{
                text-decoration: underline;
                color: #ff69b4;
            }}
            p {{
                font-size: 18px;
                margin-top: 20px;
            }}
            footer {{
                margin-top: 40px;
                font-size: 14px;
                color: #888;
            }}
        </style>
    </head>
    <body>
        <a href="{parent_path}">&#8592 Go Back</a>
        <h2>404 Not Found &#128148</h2>
        <p>The page or file you are looking for does not exist.</p>
        <footer>Served with love by Janeta's Server &#128150</footer>
    </body>
    </html>
    """
    return html.encode('utf-8')


def handle_client(conn, base_dir):
    try:
        request = conn.recv(1024).decode('utf-8')
        if not request:
            return

        request_line = request.splitlines()[0]
        method, path, _ = request_line.split()

        if method != "GET":
            response = generate_404_page("/")
            conn.sendall(response)
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
                conn.sendall(generate_404_page(path))  # changed to 404

        else:
            body = generate_404_page(path)
            header = (
                "HTTP/1.1 404 Not Found\r\n"
                "Content-Type: text/html\r\n"
                f"Content-Length: {len(body)}\r\n"
                "\r\n"
            )
            conn.sendall(header.encode('utf-8') + body)
    except Exception as e:
        print(f"Error handling client: {e}")
        body = generate_404_page("/")
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
        s.listen(1)
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
