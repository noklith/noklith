#!/usr/bin/env python3
"""Real xcodebuild/simctl evidence pipeline. Requires an Apple Silicon Mac.

Each phase writes its success marker only after the command actually succeeds.
The scripts never manufacture a .app, screenshot or passed-test record.
"""

import argparse
import hashlib
import json
import os
from pathlib import Path
import platform
import plistlib
import re
import shutil
import struct
import subprocess
import sys
import time
from datetime import datetime, timezone
import zipfile

ROOT = Path(__file__).resolve().parents[2]
BUILD = ROOT / "build"
EVIDENCE = BUILD / "evidence"
DERIVED = BUILD / "DerivedData"
APP = DERIVED / "Build/Products/Debug-iphonesimulator/CryptoCardDemo.app"
PROJECT = ROOT / "apps/ios/CryptoCardDemo.xcodeproj"
PACKAGE_PINS = ROOT / "apps/ios/swift-package-pins.json"
RESOLVED = PROJECT / "project.xcworkspace/xcshareddata/swiftpm/Package.resolved"
SOURCE_PACKAGES = BUILD / "SourcePackages"
NOTICES = ROOT / "apps/ios/CryptoCardDemo/ThirdPartyNotices"
BUNDLE = "com.noklith.app"
SCHEME = "CryptoCardDemo"
RUNTIME = os.environ.get("IOS_SIMULATOR_RUNTIME", "com.apple.CoreSimulator.SimRuntime.iOS-26-5")
MAIN_DEVICE = os.environ.get("IOS_SIMULATOR_DEVICE", "com.apple.CoreSimulator.SimDeviceType.iPhone-17")
MAIN_LABEL = os.environ.get("IOS_SIMULATOR_LABEL", "iphone17-ios26")
# Optional fallback set: the same build on the iOS 17 runtime (no Liquid Glass).
FALLBACK_RUNTIME = os.environ.get("IOS_FALLBACK_RUNTIME", "com.apple.CoreSimulator.SimRuntime.iOS-17-5")
FALLBACK_DEVICE = os.environ.get("IOS_FALLBACK_DEVICE", "com.apple.CoreSimulator.SimDeviceType.iPhone-15")
ARCHIVE = EVIDENCE / "CryptoCardDemo-simulator-arm64.zip"


def command(args, *, capture=False, log=None, check=True):
    print("+ " + " ".join(map(str, args)), flush=True)
    if log:
        log.parent.mkdir(parents=True, exist_ok=True)
        with log.open("w", encoding="utf-8") as output:
            process = subprocess.Popen(list(map(str, args)), cwd=ROOT, stdout=subprocess.PIPE,
                                       stderr=subprocess.STDOUT, text=True)
            for line in process.stdout:
                print(line, end="", flush=True)
                output.write(line)
            result = process.wait()
        if check and result:
            raise subprocess.CalledProcessError(result, args)
        return ""
    result = subprocess.run(list(map(str, args)), cwd=ROOT, check=check, text=True,
                            stdout=subprocess.PIPE if capture else None,
                            stderr=subprocess.PIPE if capture else None)
    return result.stdout.strip() if capture else ""


def write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")


def now():
    return datetime.now(timezone.utc).isoformat()


def record(phase, **extra):
    write_json(EVIDENCE / f"{phase}.json", {"status": "passed", "completed_at": now(), **extra})


def require_mac():
    if platform.system() != "Darwin" or platform.machine() != "arm64":
        raise RuntimeError("Requires standard Apple Silicon macOS runner; no fallback to paid runners.")


def xcode_arguments():
    return ["xcodebuild", "-project", PROJECT, "-scheme", SCHEME, "-configuration", "Debug",
            "-sdk", "iphonesimulator", "-derivedDataPath", DERIVED,
            "-clonedSourcePackagesDirPath", SOURCE_PACKAGES,
            "-disableAutomaticPackageResolution", "-onlyUsePackageVersionsFromResolvedFile",
            "CODE_SIGNING_ALLOWED=NO", "ARCHS=arm64", "ONLY_ACTIVE_ARCH=NO"]


def normalized_repository(url):
    return url.removesuffix("/").removesuffix(".git").lower()


def resolved_packages(path):
    """Read Xcode's lockfile without manufacturing or guessing its transitive pins."""
    data = json.loads(path.read_text(encoding="utf-8"))
    if data.get("version") in (2, 3):
        pins = data["pins"]
        packages = [{"identity": pin["identity"].lower(), "url": pin["location"],
                     "revision": pin["state"]["revision"]} for pin in pins]
    elif data.get("version") == 1:
        pins = data["object"]["pins"]
        packages = [{"identity": pin["repositoryURL"].rstrip("/").split("/")[-1].removesuffix(".git").lower(),
                     "url": pin["repositoryURL"], "revision": pin["state"]["revision"]} for pin in pins]
    else:
        raise RuntimeError("Unsupported Package.resolved schema")
    if not packages or len(packages) > 128:
        raise RuntimeError("Unexpected resolved dependency count")
    identities = set()
    repositories = set()
    for package in packages:
        repository = normalized_repository(package["url"])
        if (not re.fullmatch(r"[a-z0-9._-]+", package["identity"])
                or not re.fullmatch(r"[0-9a-f]{40}", package["revision"])
                or not package["url"].startswith("https://")
                or package["identity"] in identities or repository in repositories):
            raise RuntimeError("Invalid or duplicate resolved package pin")
        identities.add(package["identity"])
        repositories.add(repository)
    return sorted(packages, key=lambda package: package["identity"])


def collect_package_notices(packages):
    """Bundle upstream legal files, including nested and transitive package notices."""
    checkouts = SOURCE_PACKAGES / "checkouts"
    if not checkouts.is_dir():
        raise RuntimeError("Resolved source package checkouts are missing")
    destination = NOTICES / "ResolvedPackages"
    # CI uses a fresh checkout. Never delete a previously generated/legal notice tree.
    destination.mkdir(parents=True, exist_ok=False)
    packages_by_identity = {package["identity"]: package for package in packages}
    found, files, total_bytes, scanned_entries = set(), [], 0, 0
    legal_name = re.compile(r"^(?:licen[cs]e|copying|notice|copyright)(?:$|[._-])", re.IGNORECASE)
    for checkout in sorted(checkouts.iterdir()):
        if not checkout.is_dir() or checkout.is_symlink():
            raise RuntimeError("Unexpected entry in source package checkouts")
        # SwiftPM can clone working copies from its local bare repository cache;
        # their origin URL is therefore not a reliable upstream identity source.
        package = packages_by_identity.get(checkout.name.lower())
        if package is None or package["identity"] in found:
            raise RuntimeError("Source checkout does not match exactly one resolved package")
        revision = command(["git", "-C", checkout, "rev-parse", "HEAD"], capture=True)
        if revision != package["revision"]:
            raise RuntimeError(f"Source checkout revision differs from lock: {package['identity']}")
        package_files = []
        for directory, children, names in os.walk(checkout, followlinks=False):
            scanned_entries += len(children) + len(names)
            if scanned_entries > 100000:
                raise RuntimeError("Source-package legal notice scan exceeds its entry limit")
            children[:] = sorted(child for child in children
                                 if child not in (".git", ".build", "node_modules")
                                 and not (Path(directory) / child).is_symlink())
            for name in sorted(names):
                if not legal_name.match(name):
                    continue
                link = Path(directory) / name
                source = link
                if source.is_symlink():
                    # Some packages link a nested LICENSE to the root one. Follow only links that
                    # stay inside the same checkout and end at a regular file.
                    resolved = source.resolve(strict=True)
                    if not resolved.is_relative_to(checkout.resolve()) or not resolved.is_file():
                        raise RuntimeError(f"Refusing a legal notice link outside its package: {package['identity']}")
                    source = resolved
                elif not source.is_file():
                    raise RuntimeError("Refusing a non-file legal notice")
                size = source.stat().st_size
                total_bytes += size
                if size > 2 * 1024 * 1024 or total_bytes > 32 * 1024 * 1024 or len(files) >= 2048:
                    raise RuntimeError("Package legal notices exceed bounded collection limits")
                relative = link.relative_to(checkout)
                target = destination / package["identity"] / relative
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(source, target)
                item = {"package": package["identity"], "revision": revision,
                        "source": relative.as_posix(), "file": target.relative_to(NOTICES).as_posix(),
                        "sha256": digest(target), "bytes": size}
                files.append(item)
                package_files.append(item["source"])
        if not package_files:
            raise RuntimeError(f"No upstream license/notice file found for {package['identity']}; inspect before distribution")
        found.add(package["identity"])
    if found != {package["identity"] for package in packages}:
        raise RuntimeError("Not every resolved package has a verified source checkout and legal notices")
    index = {"schema_version": 1, "packages": packages, "files": files, "total_bytes": total_bytes,
             "scope": "License, copying, notice and copyright files recursively collected from resolved source checkouts"}
    write_json(destination / "index.json", index)
    shutil.copyfile(destination / "index.json", EVIDENCE / "package-notices.json")
    return index


def resolve():
    require_mac()
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    if (EVIDENCE / "resolve.json").exists():
        raise RuntimeError("Use a fresh build directory for package resolution evidence")
    previous = resolved_packages(RESOLVED) if RESOLVED.is_file() else None
    arguments = ["xcodebuild", "-resolvePackageDependencies", "-project", PROJECT,
                 "-scheme", SCHEME, "-clonedSourcePackagesDirPath", SOURCE_PACKAGES]
    try:
        command(arguments + (["-onlyUsePackageVersionsFromResolvedFile"] if previous is not None else []),
                log=EVIDENCE / "package-resolution.log")
    except subprocess.CalledProcessError:
        if previous is None:
            raise
        # A newer Xcode can reject the lock's origin hash although no pin changed. Re-resolve,
        # then accept only an identical set of package revisions (checked below).
        command(arguments, log=EVIDENCE / "package-resolution-relock.log")
    packages = resolved_packages(RESOLVED)
    if previous is not None and packages != previous:
        shutil.copyfile(RESOLVED, EVIDENCE / "Package.resolved.rejected")
        old = {(p["identity"], normalized_repository(p["url"]), p["revision"]) for p in previous}
        new = {(p["identity"], normalized_repository(p["url"]), p["revision"]) for p in packages}
        print("Only in committed lock:", sorted(old - new))
        print("Only in new resolution:", sorted(new - old))
        raise RuntimeError("Package resolution changed the committed dependency graph")
    direct = json.loads(PACKAGE_PINS.read_text(encoding="utf-8"))["packages"]
    by_identity = {package["identity"]: package for package in packages}
    for pin in direct:
        package = by_identity.get(pin["identity"])
        if (package is None or package["revision"] != pin["revision"]
                or normalized_repository(package["url"]) != normalized_repository(pin["url"])):
            raise RuntimeError(f"Resolved direct dependency does not match source pin: {pin['identity']}")
    # Preserve the authentic Xcode output even if legal collection or compilation fails.
    shutil.copyfile(RESOLVED, EVIDENCE / "Package.resolved")
    notices = collect_package_notices(packages)
    record("resolve", packages=packages, lock_file="Package.resolved", lock_sha256=digest(RESOLVED),
           lock_origin="committed" if previous is not None else "bootstrap; commit the emitted lock before release",
           legal_notice_files=len(notices["files"]), legal_notice_index_sha256=digest(EVIDENCE / "package-notices.json"))


def require_resolved_packages():
    evidence = json.loads((EVIDENCE / "resolve.json").read_text(encoding="utf-8"))
    if evidence.get("status") != "passed" or digest(RESOLVED) != evidence.get("lock_sha256"):
        raise RuntimeError("Successful package resolution and its unchanged lockfile are required")


def build():
    require_mac()
    require_resolved_packages()
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    if (EVIDENCE / "build.json").exists():
        raise RuntimeError("Use a fresh checkout/build directory so evidence cannot come from a previous run.")
    toolchain = {
        "xcode": command(["xcodebuild", "-version"], capture=True),
        "swift": command(["xcrun", "swift", "--version"], capture=True),
        "macos": command(["sw_vers"], capture=True),
        "architecture": platform.machine(),
        "runner_image": os.environ.get("ImageVersion"),
        "developer_dir": os.environ.get("DEVELOPER_DIR"),
    }
    write_json(EVIDENCE / "toolchain.json", toolchain)
    command(xcode_arguments() + ["-destination", "generic/platform=iOS Simulator", "build"],
            log=EVIDENCE / "build.log")
    require_resolved_packages()
    with (APP / "Info.plist").open("rb") as stream:
        info = plistlib.load(stream)
    if info.get("CFBundleIdentifier") != BUNDLE:
        raise RuntimeError("Unexpected bundle identifier")
    if info.get("MinimumOSVersion") != "17.0":
        raise RuntimeError(f"Expected deployment target iOS 17.0, got {info.get('MinimumOSVersion')}")
    if info.get("CFBundleSupportedPlatforms") != ["iPhoneSimulator"]:
        raise RuntimeError("Build is not an iOS simulator app")
    executable = APP / info["CFBundleExecutable"]
    architectures = command(["lipo", "-archs", executable], capture=True)
    if architectures != "arm64":
        raise RuntimeError(f"Expected ARM-only simulator binary, got {architectures}")
    binary_info = command(["xcrun", "vtool", "-show-build", executable], capture=True)
    if "IOSSIMULATOR" not in binary_info:
        raise RuntimeError("Mach-O platform must be IOSSIMULATOR")
    # Resource copying must preserve every collected license and its original bytes.
    for source in NOTICES.rglob("*"):
        if source.is_file():
            bundled = APP / "ThirdPartyNotices" / source.relative_to(NOTICES)
            if not bundled.is_file() or digest(bundled) != digest(source):
                raise RuntimeError(f"Third-party notice missing or changed in app bundle: {source.relative_to(NOTICES)}")
    (EVIDENCE / "binary-platform.txt").write_text(binary_info + "\n", encoding="utf-8")
    record("build", bundle_id=BUNDLE, architecture=architectures, minimum_ios="17.0",
           sdk=info.get("DTSDKName"), application=str(APP.relative_to(ROOT)))


def package():
    if not (EVIDENCE / "build.json").exists():
        raise RuntimeError("Successful build evidence required before packaging")
    command(["ditto", "-c", "-k", "--sequesterRsrc", "--keepParent", APP, ARCHIVE])
    with zipfile.ZipFile(ARCHIVE) as archive:
        if archive.testzip() is not None:
            raise RuntimeError("Corrupt simulator ZIP")
        if "CryptoCardDemo.app/Info.plist" not in archive.namelist():
            raise RuntimeError("ZIP must contain the .app bundle at its root")
    record("package", file=ARCHIVE.name, sha256=digest(ARCHIVE), bytes=ARCHIVE.stat().st_size,
           format="iOS Simulator .app ZIP; not a device IPA")


def create_simulator(name, device_type, runtime_id=None):
    runtime_id = runtime_id or RUNTIME
    runtimes = json.loads(command(["xcrun", "simctl", "list", "runtimes", "--json"], capture=True))
    if not any(runtime["identifier"] == runtime_id and runtime.get("isAvailable")
               for runtime in runtimes["runtimes"]):
        raise RuntimeError(f"Pinned runtime {runtime_id} missing; update pin deliberately, do not silently substitute")
    udid = command(["xcrun", "simctl", "create", name, device_type, runtime_id], capture=True)
    if not re.fullmatch(r"[0-9A-Fa-f-]{36}", udid):
        raise RuntimeError("Unexpected simulator identifier")
    # Write before boot so cleanup can remove only the simulator created by this job.
    write_json(EVIDENCE / f"simulator-{name}.json", {
        "udid": udid, "name": name, "device_type": device_type, "runtime": runtime_id,
    })
    command(["xcrun", "simctl", "boot", udid])
    command(["xcrun", "simctl", "bootstatus", udid, "-b"])
    command(["xcrun", "simctl", "status_bar", udid, "override", "--time", "9:41",
             "--dataNetwork", "wifi", "--wifiMode", "active", "--wifiBars", "3",
             "--batteryState", "charged", "--batteryLevel", "100"])
    command(["xcrun", "simctl", "install", udid, APP])
    return udid


def prepare():
    create_simulator("CryptoCard-CI", MAIN_DEVICE)


def main_simulator():
    return json.loads((EVIDENCE / "simulator-CryptoCard-CI.json").read_text())["udid"]


def test():
    require_resolved_packages()
    udid = main_simulator()
    command(xcode_arguments() + ["-destination", f"platform=iOS Simulator,id={udid}",
            "-parallel-testing-enabled", "NO", "-maximum-concurrent-test-simulator-destinations", "1",
            "-resultBundlePath", EVIDENCE / "SmokeTests.xcresult", "test"],
            log=EVIDENCE / "ui-tests.log")
    require_resolved_packages()
    record("ui-tests", runtime=RUNTIME, simulator_udid=udid, test_mode="fixture")


def png_dimensions(path):
    with path.open("rb") as stream:
        header = stream.read(24)
    if header[:8] != b"\x89PNG\r\n\x1a\n" or header[12:16] != b"IHDR":
        raise RuntimeError(f"Invalid screenshot PNG: {path}")
    width, height = struct.unpack(">II", header[16:24])
    if width < 300 or height < 500:
        raise RuntimeError(f"Unexpected screenshot size: {width}x{height}")
    return width, height


def capture_screen(udid, device, screen, scenario="standard", appearance="light", large=False, runtime_id=None):
    content_size = "accessibility-extra-extra-extra-large" if large else "large"
    name = f"{device}-{screen}-{scenario}-{appearance}" + ("-large-text" if large else "")
    path = EVIDENCE / "screenshots" / f"{name}.png"
    path.parent.mkdir(parents=True, exist_ok=True)
    command(["xcrun", "simctl", "terminate", udid, BUNDLE], check=False)
    command(["xcrun", "simctl", "ui", udid, "appearance", appearance])
    command(["xcrun", "simctl", "ui", udid, "content_size", content_size])
    launch_arguments = ["--fixture", "--screen", screen, "--scenario", scenario,
                        "-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
    launched = command(["xcrun", "simctl", "launch", udid, BUNDLE, *launch_arguments], capture=True)
    if not re.search(r": \d+$", launched):
        raise RuntimeError(f"No app PID returned by simctl launch: {launched}")
    # Native UI smoke tests already establish launch/readiness for these routes.
    # This is a render settling interval; PNGs still need human visual review.
    time.sleep(3)
    command(["xcrun", "simctl", "io", udid, "screenshot", "--type=png", path])
    width, height = png_dimensions(path)
    return {"file": str(path.relative_to(EVIDENCE)), "sha256": digest(path), "width": width,
            "height": height, "screen": screen, "scenario": scenario, "appearance": appearance,
            "content_size": content_size, "device": device, "runtime": runtime_id or RUNTIME,
            "launch_arguments": launch_arguments, "captured_at": now(), "source": "simctl io screenshot"}


def screenshots():
    if not (EVIDENCE / "ui-tests.json").exists():
        raise RuntimeError("UI smoke tests must pass before capturing the evidence matrix")
    udid = main_simulator()
    results = []
    matrix = [(screen, "standard", appearance, False)
              for screen in ["welcome", "wallet", "card", "topup", "history", "settings"]
              for appearance in ["light", "dark"]]
    matrix += [("card", scenario, "light", False) for scenario in ["frozen", "risk", "offline", "tilted"]]
    matrix += [("card", "tilted", "dark", False)]
    matrix += [("history", scenario, "light", False) for scenario in ["empty", "long", "paused"]]
    matrix += [("card", "paused", "light", False), ("card", "paused", "dark", False), ("card", "zero", "light", False),
               ("welcome", "expired", "light", False), ("topup-status", "wrong_network", "light", False),
               ("topup-status", "rejected", "light", False), ("details", "standard", "light", False),
               ("details", "standard", "dark", False), ("topup-status", "credited", "dark", False), ("history", "empty", "dark", False)]
    matrix += [(screen, "long", "light", True) for screen in ["card", "topup", "history"]]
    # Every top-up state the user can see, rendered from sample data (no transfer).
    matrix += [("topup-status", state, "light", False)
               for state in ["quoted", "submitted", "confirming", "funding_pending", "credited", "failed", "expired"]]
    matrix += [("topup-status", "confirming", "dark", False), ("topup-status", "funding_pending", "light", True)]
    for screen, scenario, appearance, large in matrix:
        results.append(capture_screen(udid, MAIN_LABEL, screen, scenario, appearance, large))
        write_json(EVIDENCE / "screenshots-index.json", results)
    # Stop main device before compact coverage to stay within standard runner RAM.
    command(["xcrun", "simctl", "shutdown", udid])
    compact = create_simulator("CryptoCard-Compact-CI", "com.apple.CoreSimulator.SimDeviceType.iPhone-SE-3rd-generation")
    for screen in ["wallet", "card", "topup", "history"]:
        results.append(capture_screen(compact, "iphonese3-ios26", screen, "long", "light", True))
        write_json(EVIDENCE / "screenshots-index.json", results)
    command(["xcrun", "simctl", "shutdown", compact])
    record("screenshots", count=len(results), visual_review="required; screenshots do not prove layout quality")


def fallback_screenshots():
    """Same app on the iOS 17 runtime: material fallbacks instead of Liquid Glass."""
    if not (EVIDENCE / "screenshots.json").exists():
        raise RuntimeError("Main screenshot set must pass before the fallback set")
    results = json.loads((EVIDENCE / "screenshots-index.json").read_text())
    udid = create_simulator("CryptoCard-iOS17-CI", FALLBACK_DEVICE, FALLBACK_RUNTIME)
    matrix = [(screen, "standard", appearance, False)
              for screen in ["welcome", "card", "topup", "history", "settings"] for appearance in ["light", "dark"]]
    matrix += [("card", "frozen", "light", False), ("topup-status", "confirming", "light", False), ("card", "long", "light", True)]
    added = 0
    for screen, scenario, appearance, large in matrix:
        results.append(capture_screen(udid, "iphone15-ios17", screen, scenario, appearance, large, FALLBACK_RUNTIME))
        added += 1
        write_json(EVIDENCE / "screenshots-index.json", results)
    command(["xcrun", "simctl", "shutdown", udid])
    record("fallback-screenshots", count=added, runtime=FALLBACK_RUNTIME, purpose="iOS 17 material fallback without Liquid Glass")


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def manifest():
    phases = {}
    for phase in ["resolve", "build", "package", "ui-tests", "screenshots"]:
        phases[phase] = json.loads((EVIDENCE / f"{phase}.json").read_text())
        if phases[phase]["status"] != "passed":
            raise RuntimeError(f"Required phase {phase} incomplete")
    if (EVIDENCE / "fallback-screenshots.json").exists():
        phases["fallback-screenshots"] = json.loads((EVIDENCE / "fallback-screenshots.json").read_text())
    repository = os.environ.get("GITHUB_REPOSITORY") or os.environ.get("CM_REPO_SLUG")
    run_id = os.environ.get("GITHUB_RUN_ID")
    if run_id and repository:
        ci, run_url = "github-actions", f"https://github.com/{repository}/actions/runs/{run_id}"
    elif os.environ.get("CM_BUILD_ID"):
        run_id = os.environ["CM_BUILD_ID"]
        project = os.environ.get("CM_PROJECT_ID")
        ci, run_url = "codemagic", f"https://codemagic.io/app/{project}/build/{run_id}" if project else None
    elif os.environ.get("CIRCLE_WORKFLOW_ID"):
        run_id = os.environ.get("CIRCLE_BUILD_NUM")
        ci, run_url = "circleci", os.environ.get("CIRCLE_BUILD_URL")
    elif os.environ.get("BITRISE_BUILD_SLUG"):
        run_id = os.environ["BITRISE_BUILD_SLUG"]
        ci, run_url = "bitrise", os.environ.get("BITRISE_BUILD_URL")
    else:
        ci, run_url = "local", None
    data = {
        "schema_version": 1, "created_at": now(), "ci": ci,
        "commit": os.environ.get("GITHUB_SHA") or os.environ.get("CM_COMMIT") or os.environ.get("BITRISE_GIT_COMMIT") or os.environ.get("CIRCLE_SHA1"), "repository": repository,
        "run_id": run_id, "run_attempt": os.environ.get("GITHUB_RUN_ATTEMPT"),
        "run_url": run_url,
        "mode": {"network_mode": "fixture", "issuer_mode": "demo"},
        "phases": phases,
        "screenshots": json.loads((EVIDENCE / "screenshots-index.json").read_text()),
        "limitations": ["No server or wallet validation", "No physical device or biometric validation",
                        "No signed device build or TestFlight upload", "No Appetize upload",
                        f"Deployment target iOS 17.0; main runtime {RUNTIME}" + ("; iOS 17 fallback set captured" if (EVIDENCE / "fallback-screenshots.json").exists() else "; iOS 17 runtime not exercised in this run"),
                        "Human screenshot review and VoiceOver/Reduce Motion checks remain required"],
    }
    write_json(EVIDENCE / "manifest.json", data)


def cleanup():
    for path in EVIDENCE.glob("simulator-*.json"):
        simulator = json.loads(path.read_text())
        udid = simulator["udid"]
        if not simulator["name"].startswith("CryptoCard-") or not re.fullmatch(r"[0-9A-Fa-f-]{36}", udid):
            raise RuntimeError("Refusing cleanup of an unrecognized simulator")
        command(["xcrun", "simctl", "shutdown", udid], check=False)
        command(["xcrun", "simctl", "delete", udid], check=False)


def summary():
    lines = ["## Native iOS evidence", "", "| Check | Result |", "|---|---|"]
    for phase in ["resolve", "build", "package", "ui-tests", "screenshots", "fallback-screenshots"]:
        lines.append(f"| {phase} | {'Passed' if (EVIDENCE / (phase + '.json')).exists() else 'Not completed'} |")
    lines += ["", "Artifact: `.app` ZIP, native screenshots, Package.resolved, license index, logs, toolchain details and phase markers.",
              "`manifest.json` exists only if every required phase passed. Retention: 3 days.",
              "Fixture evidence does not validate the API, wallet, testnet, device biometrics or TestFlight.",
              "Screenshot quality requires visual review; these images are captured from the compiled app."]
    message = "\n".join(lines) + "\n"
    print(message)
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        with Path(os.environ["GITHUB_STEP_SUMMARY"]).open("a", encoding="utf-8") as stream:
            stream.write(message)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("phase", choices=["resolve", "build", "package", "prepare", "test", "screenshots", "fallback_screenshots", "manifest", "cleanup", "summary"])
    phase = parser.parse_args().phase
    try:
        globals()[phase]()
    except (RuntimeError, OSError, subprocess.CalledProcessError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        sys.exit(1)
