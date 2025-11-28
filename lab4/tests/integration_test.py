import os
import time
import requests
from concurrent.futures import ThreadPoolExecutor, as_completed
import subprocess

LEADER = "http://localhost:5000"
FOLLOWERS = [
    "http://localhost:5001",
    "http://localhost:5002",
    "http://localhost:5003",
    "http://localhost:5004",
    "http://localhost:5005",
]


def wait_cluster_ready(timeout=20):
    dead = time.time() + timeout
    while time.time() < dead:
        try:
            r = requests.get(f"{LEADER}/ping", timeout=0.5)
            if r.status_code == 200:
                return
        except:
            pass
        time.sleep(0.2)
    raise RuntimeError("Cluster not ready!")


def restart_with_quorum(q):
    print(f"\nRestarting cluster (WRITE_QUORUM={q}) ...")
    os.environ["WRITE_QUORUM"] = str(q)

    subprocess.run(["docker", "compose", "down"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    subprocess.run(["docker", "compose", "up", "-d"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    wait_cluster_ready()


def wait_replication(key, version, timeout=5):
    start = time.time()
    while time.time() - start < timeout:
        all_ok = True
        for fol in FOLLOWERS:
            r = requests.get(f"{fol}/read?key={key}")
            if r.status_code != 200:
                all_ok = False
                break
            if r.json()["value"]["version"] != version:
                all_ok = False
                break
        if all_ok:
            return True
        time.sleep(0.1)
    return False


def dump(url):
    r = requests.get(f"{url}/dump")
    return r.json() if r.status_code == 200 else {}


def test_basic_write_read():
    print("\n=== Test 1: Basic write/read ===")

    key = "demo"
    val = "hello"

    w = requests.post(f"{LEADER}/write", json={"key": key, "value": val})
    assert w.status_code == 200
    version = w.json()["version"]

    # Leader read
    r = requests.get(f"{LEADER}/read?key={key}")
    assert r.json()["value"]["value"] == val
    assert r.json()["value"]["version"] == version

    # Followers replicate
    assert wait_replication(key, version), "Followers failed replication!"

    print("✔ Passed basic write/read")


def test_last_write_wins():
    print("\n=== Test 2: Last write wins ===")

    key = "overwrite"

    requests.post(f"{LEADER}/write", json={"key": key, "value": "A"})
    r2 = requests.post(f"{LEADER}/write", json={"key": key, "value": "B"})
    latest_version = r2.json()["version"]
    time.sleep(1)

    r = requests.get(f"{LEADER}/read?key={key}")
    assert r.json()["value"]["value"] == "B"
    assert r.json()["value"]["version"] == latest_version

    assert wait_replication(key, latest_version), "Followers did not propagate latest write!"

    print("✔ Passed last-write-wins guarantee")


def test_concurrent_updates():
    print("\n=== Test 4: Concurrent version race test ===")

    key = "race"
    N = 100

    def writer(i):
        try:
            req = requests.post(f"{LEADER}/write", json={"key": key, "value": i})
            return req.json().get("version", -1)
        except:
            return -1

    versions = []
    with ThreadPoolExecutor(max_workers=20) as pool:
        futures = [pool.submit(writer, i) for i in range(N)]
        for f in as_completed(futures):
            versions.append(f.result())

    # Version correctness checks
    versions = sorted(v for v in versions if v > 0)
    assert len(versions) == N, "Some writes dropped!"
    for i in range(1, len(versions)):
        assert versions[i] == versions[i - 1] + 1, "Version mismatch (lost update detected!)"

    print("✔ No lost updates in concurrency")


def test_no_write_to_followers():
    print("\n=== Test 3: Followers must reject writes ===")

    key = "illegal"
    value = "nope"

    for fol in FOLLOWERS:
        print(f"→ Trying to write to follower {fol}...")
        r = requests.post(f"{fol}/write", json={"key": key, "value": value})

        # Followers should not allow writes (405, 404 or 500 are fine)
        assert r.status_code != 200, f"{fol} incorrectly accepted a write!"

        # It must not appear in follower storage
        d = requests.get(f"{fol}/read?key={key}")
        assert d.status_code == 404, f"{fol} stored illegal value!"

    print("✔ Followers correctly reject direct writes")


def test_final_cluster_consistency():
    print("\n=== Test 5: Full cluster consistency ===")
    time.sleep(1)
    leader_data = dump(LEADER)

    for fol in FOLLOWERS:
        fol_data = dump(fol)

        if fol_data != leader_data:
            print(f"❌ Mismatch on {fol}")
            print("\nLeader state:")
            print(leader_data)
            print("\nFollower state:")
            print(fol_data)
            raise AssertionError(f"{fol} is out of sync!")

    print("✔ All replicas in sync")


if __name__ == "__main__":
    restart_with_quorum(3)
    test_basic_write_read()
    test_last_write_wins()
    test_no_write_to_followers()
    test_concurrent_updates()
    test_final_cluster_consistency()

    print("\nAll correctness tests passed successfully!")
