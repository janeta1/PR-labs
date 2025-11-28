import random
import threading
import time
import requests
from concurrent.futures import ThreadPoolExecutor, as_completed
import logging
from flask import Flask, request, jsonify
import os

app = Flask(__name__)
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
executor = ThreadPoolExecutor(max_workers=100)

store = {}
store_lock = threading.Lock()

current_version = 0
current_version_lock = threading.Lock()

ROLE = os.getenv("ROLE", "follower")
PORT = int(os.getenv("PORT", "5000"))
FOLLOWERS = os.getenv("FOLLOWERS", "").split(",") if ROLE == "leader" else []


WRITE_QUORUM = int(os.getenv("WRITE_QUORUM", 1))
quorum_lock = threading.Lock()

MIN_DELAY = float(os.getenv("MIN_DELAY", 0))
MAX_DELAY = float(os.getenv("MAX_DELAY", 1000))

if ROLE == "leader":
    logger.info(f"Leader starting on port {PORT} with WRITE_QUORUM={WRITE_QUORUM}, MIN_DELAY={MIN_DELAY}, MAX_DELAY={MAX_DELAY}")
else:
    logger.info(f"Follower starting on port {PORT}")


# helpers
def get_next_version():
    global current_version

    with current_version_lock:
        current_version += 1
        return current_version


def apply_local(key, value, version):
    with store_lock:
        old = store.get(key)
        if old is None or version >= old["version"]:
            store[key] = {"value": value, "version": version}


@app.route("/ping")
def ping():
    return jsonify({"role": ROLE, "status": "ok"})


# follower only endpoint
if ROLE == "follower":
    @app.route("/replicate", methods=["POST"])
    def replicate():
        data = request.get_json()
        if not data or "key" not in data or "value" not in data:
            return jsonify({"error": "Invalid request"}), 400

        key = data["key"]
        value = data["value"]
        version = data.get("version", 0)

        apply_local(key, value, version)
        return jsonify({"status": "replicated"}), 200


# leader only
if ROLE == "leader":
    def replicate_to_one_follower(url, key, value, version):
        delay = random.uniform(MIN_DELAY, MAX_DELAY) / 1000
        time.sleep(delay)

        try:
            response = requests.post(
                f"{url}/replicate",
                json={"key": key, "value": value, "version": version},
                timeout=5
            )
            # if response.status_code == 200:
            #     with results_lock:
            #         results.append(True)
            return response.status_code == 200
        except Exception as e:
            logger.error(f"Replicate to {url} EXCEPTION: {e}")
            return False


    def replicate_to_followers(key, value, version):
        if not FOLLOWERS:
            return True, 0

        futures = []
        for fol in FOLLOWERS:
            future = executor.submit(replicate_to_one_follower, fol, key, value, version)
            futures.append(future)

        ack_count = 0

        for f in as_completed(futures):
            if f.result():
                ack_count += 1
                if ack_count >= WRITE_QUORUM:
                    return True, ack_count

        return False, ack_count


    @app.route("/write", methods=["POST"])
    def write():
        data = request.get_json()
        if not data or "key" not in data or "value" not in data:
            return jsonify({"error": "Invalid request"}), 400

        key = data["key"]
        value = data["value"]

        version = get_next_version()
        apply_local(key, value, version)
        success, acks = replicate_to_followers(key, value, version)
        if success:
            return jsonify({
                "status": "write committed",
                "acks": acks,
                "version": version,
                "required_quorum": WRITE_QUORUM
            }), 200

        return jsonify({
            "status": "write failed",
            "acks": acks,
            "version": version,
            "required_quorum": WRITE_QUORUM
        }), 503
        # results = []
        # threads = []
        #
        # for follower in FOLLOWERS:
        #     t = threading.Thread(
        #         target=replicate_to_follower,
        #         args=(follower, key, value, version, results)
        #     )
        #     t.start()
        #     threads.append(t)
        #
        # start_time = time.time()
        # timeout = 2
        #
        # # while True:
        # #     success = sum(1 for r in results if r)
        # #     if success >= int(quorum):
        # #         print("Quorum reached", flush=True)
        # #         break
        # #     if time.time() - start_time > timeout:
        # #         return jsonify({"status": "failed"}), 500
        # while len(results) < quorum and time.time() - start_time < timeout:
        #     time.sleep(0.01)
        #
        # return jsonify({
        #     "status": "write committed",
        #     "acks": len(results),
        #     "required_quorum": quorum
        # }), 200
    # @app.route("/write_local", methods=["POST"])
    # def write_local():
    #     data = request.get_json()
    #     if not data or "key" not in data or "value" not in data:
    #         return jsonify({"error": "Invalid request"}), 400
    #
    #     key = data["key"]
    #     value = data["value"]
    #
    #     with lock:
    #         store[key] = value
    #
    #     return jsonify({"status": "leader write success"}), 200


@app.route("/read", methods=["GET"])
def read():
    key = request.args.get("key")
    with store_lock:
        if key in store:
            return jsonify({"value": store[key]})
        else:
            return jsonify({"error": "Key not found"}), 404


@app.route("/dump")
def dump():
    with store_lock:
        return jsonify(store)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=PORT, threaded=True)
