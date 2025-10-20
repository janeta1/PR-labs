import sys
import socket
import os


def download_my_file(host, port, file, save_dir):
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.connect((host, port))

            request_line = f"GET /{file} HTTP/1.1\r\nHost: {host}\r\n\r\n"
            s.sendall(request_line.encode())
            response = b""
            while True:
                data = s.recv(4096)
                if not data:
                    break
                response += data

        header_data, _, body = response.partition(b"\r\n\r\n")
        headers = header_data.decode()
        status_line = headers.splitlines()[0]
        if "200 OK" not in status_line:
            print("Error: File not found or server error")
            return False

        if "Content-Type: text/html" in headers:
            print(body.decode('UTF-8'))
        else:
            save_path = os.path.join(save_dir, os.path.basename(file))
            with open(save_path, 'wb') as f:
                f.write(body)
            print(f"Saved {file} to {save_dir}")
        return True
    except Exception as e:
        print(f"Failed to download {file}: {e}")
        return False


def run_client(host, port, file, save_dir):
    if not os.path.exists(save_dir):
        os.makedirs(save_dir)
    download_my_file(host, port, file, save_dir)


if __name__ == "__main__":
    if len(sys.argv) != 5:
        print("Usage: python client.py server_host server_port filename save_directory")
        sys.exit(1)

    server_host = sys.argv[1]
    server_port = int(sys.argv[2])
    file_name = sys.argv[3]
    save_directory = sys.argv[4]

    run_client(server_host, server_port, file_name, save_directory)
