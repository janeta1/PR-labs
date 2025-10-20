import socket
import threading
import time
paths = [
    "/cute.png",
    "/index.html",
    "/books/PBLReports/ChartLab.pdf"
]

HOST = "localhost"
PORT = 8000
NUM_REQUESTS = 10

results = []  # to store status codes
lock = threading.Lock()
MODE = "paced"   # "spam" or "paced"
DELAY = 0.25     # (4 req/sec)

def make_request(path):
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.connect((HOST, PORT))
            request = f"GET {path} HTTP/1.1\r\nHost: {HOST}\r\n\r\n"
            s.sendall(request.encode())

            response = b""
            while True:
                chunk = s.recv(4096)
                if not chunk:
                    break
                response += chunk
            first_line = response.decode(errors='ignore').splitlines()[0]
            with lock:
                results.append(first_line)
                print(f"{first_line} for {path} ({len(response)} bytes)")

    except Exception as e:
        with lock:
            results.append("ERROR")
            print(f"Error requesting {path}: {e}")

threads = []
start_time = time.time()

for i in range(NUM_REQUESTS):
    path = paths[i % len(paths)]  # rotating through files
    t = threading.Thread(target=make_request, args=(path,))
    threads.append(t)
    t.start()
    if MODE == "paced":
        time.sleep(DELAY)

for t in threads:
    t.join()

end_time = time.time()
duration = end_time - start_time

successful = sum(1 for r in results if r.startswith("HTTP/1.1 200"))
rate_limited = sum(1 for r in results if r.startswith("HTTP/1.1 429"))
errors = sum(1 for r in results if r == "ERROR")

print("\n--- Summary ---")
print(f"Total requests: {NUM_REQUESTS}")
print(f"200 OK: {successful}")
print(f"429 Too Many Requests: {rate_limited}")
print(f"Errors: {errors}")
print(f"Total time: {duration:.2f} seconds")
print(f"Throughput: {successful / duration:.2f} successful requests/sec")
