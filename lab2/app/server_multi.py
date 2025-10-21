import os
import sys
import socket
import threading
import time

CONTENT_TYPES = {
    ".html": "text/html",
    ".pdf": "application/pdf",
    ".png": "image/png"
}

request_counts_per_file = {}
counter_lock = threading.Lock()
request_times_per_ip = {}
RATE_LIMIT = 5
TIME_WINDOW = 1  # seconds


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
            <tr><th>Name</th><th>Type</th><th>Size</th><th>Hits</th></tr>
    """

    # add the "../" link only if not in root
    if request_path.strip("/") != "":
        html += f"""
            <tr>
                <td><a href="{parent_path}">../</a></td>
                <td>-</td>
                <td>-</td>
                <td>-</td>
            </tr>
        """

    # list all files and folders
    for f in files:
        full_path = os.path.join(path, f)
        hits = request_counts_per_file.get(full_path, 0)
        # print(f"FOR {full_path}")
        href = os.path.join(request_path, f).replace("\\", "/")
        file_type = "Folder" if os.path.isdir(full_path) else "File"
        size = "-" if os.path.isdir(full_path) else f"{os.path.getsize(full_path)} bytes"
        display_name = f + "/" if os.path.isdir(full_path) else f
        html += f"""
            <tr>
                <td><a href="{href}">{display_name}</a></td>
                <td>{file_type}</td>
                <td>{size}</td>
                <td>{hits}</td>
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


def generate_429_page(request_path):
    parent_path = os.path.dirname(request_path.rstrip("/")) or "/"
    html = f"""
    <html>
    <head>
        <title>429 Too Many Requests</title>
        <style>
            body {{
                background-color: #fff6fa;
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                color: #4a4a4a;
                text-align: center;
                margin: 80px;
            }}
            h1 {{
                color: #e86ca1;
                font-size: 48px;
                margin-bottom: 10px;
            }}
            h2 {{
                color: #e86ca1;
                font-size: 26px;
                margin-bottom: 30px;
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
        <h1>429</h1>
        <h2>&#128683 Too Many Requests &#128683</h2>
        <p>Whoa! Slow down! &#9995 You're sending too many requests, I can't keep up. &#128544</p>
        <footer>Served with love by Janeta's Server &#128150</footer>
    </body>
    </html>
    """
    return html.encode('utf-8')


def handle_client(conn, addr, base_dir):
    try:
        client_ip = addr[0]
        now = time.time()

        with counter_lock:
            if client_ip not in request_times_per_ip:
                request_times_per_ip[client_ip] = []

            request_times_per_ip[client_ip] = [t for t in request_times_per_ip[client_ip] if now - t < TIME_WINDOW]

            if len(request_times_per_ip[client_ip]) >= RATE_LIMIT:
                body = generate_429_page("/")
                header = (
                    "HTTP/1.1 429 Too Many Requests\r\n"
                    "Content-Type: text/html\r\n"
                    f"Content-Length: {len(body)}\r\n"
                    "\r\n"
                )
                conn.sendall(header.encode("utf-8") + body)
            request_times_per_ip[client_ip].append(now)

        request = conn.recv(1024).decode()
        time.sleep(1)
        if not request:
            return

        request_line = request.splitlines()[0]
        method, path, _ = request_line.split()

        if method != "GET":
            response = (
                "HTTP/1.1 404 Not Found\r\n"
                "\r\n"
            )
            conn.sendall(response.encode())
            return

        path = path.lstrip('/')
        full_path = os.path.join(base_dir, path)
        full_path = os.path.normpath(full_path)
        print(f"Client {client_ip} requested: {full_path}")
        # if full_path not in request_counts_per_file:
        #     request_counts_per_file[full_path] = 0
        # current = request_counts_per_file[full_path]
        # time.sleep(0.1)
        # request_counts_per_file[full_path] = current + 1  # naive increment

        with counter_lock:
            if full_path not in request_counts_per_file:
                request_counts_per_file[full_path] = 0
            # current = request_counts_per_file[full_path]
            # time.sleep(0.1)
            # request_counts_per_file[full_path] = current + 1
            request_counts_per_file[full_path] += 1
            # print(f"{full_path} incremented to {request_counts_per_file[full_path]}")
            # print(f"ALL the hits: {request_counts_per_file}")
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
                conn.sendall(header.encode("utf-8") + content)
            except:
                conn.sendall(b"HTTP/1.1 404 Not Found\r\n\r\n")

        else:
            body = b"<html><h1>404 Not Found</h1></html>"
            header = (
                "HTTP/1.1 404 Not Found\r\n"
                "Content-Type: text/html\r\n"
                f"Content-Length: {len(body)}\r\n"
                "\r\n"
            )
            conn.sendall(header.encode() + body)
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
    finally:
        conn.close()  # closing after handling the client


def run_server(base_dir, host='0.0.0.0', port=8000):
    print(f"Now listening on http://localhost:{port} directory: {base_dir}")

    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind((host, port))
        s.listen(10)
        while True:
            conn, addr = s.accept()
            print(f"Connection from {addr}")
            client_thread = threading.Thread(target=handle_client, args=(conn, addr, base_dir))
            client_thread.start()
            # handle_client(conn, base_dir)


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python server_multi.py <directory_to_serve>")
        sys.exit(1)

    base_dir = os.path.abspath(sys.argv[1])
    run_server(base_dir)
