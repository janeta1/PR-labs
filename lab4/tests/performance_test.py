import os
import subprocess
import time
import statistics
import requests
import matplotlib.pyplot as plt
import random
from concurrent.futures import ThreadPoolExecutor, as_completed

LEADER_URL = "http://localhost:5000"
FOLLOWERS = [
    "http://localhost:5001",
    "http://localhost:5002",
    "http://localhost:5003",
    "http://localhost:5004",
    "http://localhost:5005"
]

NUM_WRITES = 100
NUM_THREADS = 10
KEY_SPACE = 10


def run_compose(quorum):
    print(f"\nRestarting cluster with quorum={quorum}...")
    os.environ["WRITE_QUORUM"] = str(quorum)
    # ensure old containers are removed first to avoid leftover state
    subprocess.run(["docker", "compose", "down"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    subprocess.run(["docker", "compose", "up", "-d"])

    # wait for services to become available
    deadline = time.time() + 30
    leader_ready = False
    while time.time() < deadline:
        try:
            r = requests.get(f"{LEADER_URL}/ping", timeout=1)
            if r.status_code == 200:
                leader_ready = True
                break
        except Exception:
            pass
        time.sleep(0.5)

    if not leader_ready:
        raise RuntimeError("Leader failed to start within 30s")

    # also check followers briefly
    for f in FOLLOWERS:
        deadline_f = time.time() + 10
        ready = False
        while time.time() < deadline_f:
            try:
                r = requests.get(f"{f}/ping", timeout=1)
                if r.status_code == 200:
                    ready = True
                    break
            except Exception:
                pass
            time.sleep(0.5)
        if not ready:
            raise RuntimeError(f"Follower {f} failed to start within 10s")


def load_test():
    latencies = []
    successes = 0
    failures = 0

    def write_once():
        key = f"k{random.randint(0, KEY_SPACE - 1)}"
        value = str(random.randint(0, 1_000_000))
        start = time.time()

        try:
            r = requests.post(
                f"{LEADER_URL}/write",
                json={"key": key, "value": value},
                timeout=5
            )
            latency = (time.time() - start) * 1000

            if r.status_code == 200:
                # body = r.json()
                # print(
                #     f"✔ WRITE OK | key={key} | quorum={quorum} | acks={body['acks']} | version={body['version']} | {latency:.2f}ms")
                return latency, True

            else:
                # Leader error info
                # try:
                #     body = r.json()
                #     print(f"❌ WRITE FAILED | key={key} | status={r.status_code} | body={body}")
                # except:
                #     print(f"❌ WRITE FAILED | key={key} | status={r.status_code} | no json body")
                return latency, False

        except Exception as e:
            # Network failure (leader overloaded)
            elapsed = (time.time() - start) * 1000
            print(f"💥 EXCEPTION | key={key} | after {elapsed:.2f}ms | ERROR={e}")
            return None, False

    print("Load testing...")
    with ThreadPoolExecutor(max_workers=NUM_THREADS) as executor:
        futures = [executor.submit(write_once) for _ in range(NUM_WRITES)]
        for f in as_completed(futures):
            latency, ok = f.result()
            if ok:
                latencies.append(latency)
                successes += 1
            else:
                failures += 1

    # print(f"🧾 Debug Summary for quorum={quorum}")
    # print(f"   ✔ Success: {successes}")
    # print(f"   ✘ Failures: {failures}")
    # if failures > 0:
    #     print("   ⚠ Failures likely due to leader overload / quorum failure")

    if latencies:
        avg = statistics.mean(latencies)
        median = statistics.median(latencies)
        lat_sorted = sorted(latencies)
        p95 = lat_sorted[int(0.95 * len(lat_sorted))]
        p99 = lat_sorted[int(0.99 * len(lat_sorted))]
    else:
        avg = median = p95 = p99 = float('nan')

    total = successes + failures
    success_rate = (successes / total) if total > 0 else 0.0

    # print(
    #     f"Writes: attempts={total}, successes={successes}, failures={failures}, success_rate={success_rate:.3f}")
    # print(f"Latency stats (ms): avg={avg:.2f}, median={median:.2f}, p95={p95:.2f}, p99={p99:.2f}")

    return avg, median, p95, p99, success_rate


def plot_results(results):
    quorums = sorted(results.keys())

    avgs = [results[q]["avg"] for q in quorums]
    medians = [results[q]["median"] for q in quorums]
    p95s = [results[q]["p95"] for q in quorums]
    p99s = [results[q]["p99"] for q in quorums]

    plt.figure(figsize=(10, 6))

    plt.plot(quorums, avgs, marker="o", label="Average")
    plt.plot(quorums, medians, marker="o", label="Median")
    plt.plot(quorums, p95s, marker="o",  label="p95")
    plt.plot(quorums, p99s, marker="o", label="p99")

    plt.xlabel("Write Quorum", fontsize=12)
    plt.ylabel("Latency (ms)", fontsize=12)
    plt.title("Write Latency vs. Quorum Size", fontsize=14, weight="bold")

    plt.grid(True, linestyle="--", alpha=0.6)
    plt.xticks(quorums, fontsize=10)
    plt.yticks(fontsize=10)
    plt.legend(fontsize=10, loc="best")

    plt.tight_layout()
    plt.savefig("performance_test.png", dpi=200)
    plt.show()

    print("Plot saved to performance_test.png")


def verify_replication():
    leader_data = requests.get(f"{LEADER_URL}/dump").json()

    for i, follower in enumerate(FOLLOWERS, start=1):
        fd = requests.get(f"{follower}/dump").json()

        if fd != leader_data:
            print(f"\n⚠ Inconsistency detected in follower{i} ({follower})")

            missing_keys = set(leader_data.keys()) - set(fd.keys())
            extra_keys = set(fd.keys()) - set(leader_data.keys())
            diff_values = {
                k: (leader_data[k], fd[k])
                for k in leader_data.keys() & fd.keys()
                if leader_data[k] != fd[k]
            }

            if missing_keys:
                print(f" → Missing keys: {missing_keys}")
            if extra_keys:
                print(f" → Extra keys: {extra_keys}")
            if diff_values:
                print(f" → Different values: {diff_values}")
        else:
            print(f"✔ follower{i} matches leader")


def main():
    results = {}

    for quorum in [1, 2, 3, 4, 5]:
        run_compose(quorum)
        time.sleep(2)
        avg, median, p95, p99, success_rate = load_test()
        results[quorum] = {
            "avg": avg,
            "median": median,
            "p95": p95,
            "p99": p99,
            "success_rate": success_rate,
        }
        print(f"Quorum {quorum}: avg={avg:.2f} ms | median={median: .2f} ms | p95={p95: .2f} ms | p99={p99: .2f} ms "
              f"| success={success_rate: .3f}")
        time.sleep(1)
        verify_replication()
    plot_results(results)
    subprocess.run(["docker", "compose", "down"])

    print("\nFinal Benchmark Summary")
    print("-" * 75)
    print(
        f"{'Quorum':>6} | {'Avg (ms)':>10} | {'Median (ms)':>12} | {'p95 (ms)':>10} | {'p99 (ms)':>10} | {'Success %':>10}")
    print("-" * 75)

    for q in sorted(results.keys()):
        avg = results[q]["avg"]
        med = results[q]["median"]
        p95 = results[q]["p95"]
        p99 = results[q]["p99"]
        sr = results[q]["success_rate"] * 100

        print(f"{q:>6} | {avg:10.2f} | {med:12.2f} | {p95:10.2f} | {p99:10.2f} | {sr:10.1f}")


if __name__ == "__main__":
    main()
