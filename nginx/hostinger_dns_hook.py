#!/usr/bin/env python3
"""
Certbot DNS-01 auth/cleanup hook - manual-assist mode.

This does NOT call the Hostinger API itself (no API token is configured
inside this container). Instead, on auth, it writes the exact TXT record
name+value certbot needs into /tmp/acme-challenge-request.json and then
polls public DNS every 10s (up to ~6 minutes) waiting for that record to
appear - which happens when an operator with Hostinger access adds it
(this project's deployment is managed through an assistant with direct
Hostinger DNS API access, which reads this file and creates the record).

On cleanup, it just prints what to remove; leftover _acme-challenge TXT
records are harmless and get overwritten on the next run regardless.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import time


def _root_domain(full_domain: str) -> str:
    parts = full_domain.split(".")
    return ".".join(parts[-2:])


def _record_name(full_domain: str, root: str) -> str:
    prefix = full_domain[: -(len(root) + 1)] if full_domain != root else ""
    return f"_acme-challenge.{prefix}" if prefix else "_acme-challenge"


def _resolves_publicly(name_fqdn: str, expected_value: str) -> bool:
    try:
        out = subprocess.run(
            ["nslookup", "-type=TXT", name_fqdn, "8.8.8.8"],
            capture_output=True, text=True, timeout=10,
        ).stdout
        return expected_value in out
    except Exception:
        return False


def auth_hook() -> None:
    domain = os.environ["CERTBOT_DOMAIN"]
    validation = os.environ["CERTBOT_VALIDATION"]
    root = _root_domain(domain)
    record_name = _record_name(domain, root)
    fqdn = f"{record_name}.{root}"

    request = {"domain": root, "name": record_name, "type": "TXT", "value": validation, "fqdn": fqdn}
    with open("/tmp/acme-challenge-request.json", "w") as f:
        json.dump(request, f)

    print("=" * 70, file=sys.stderr)
    print("ACME DNS-01 CHALLENGE - ACTION NEEDED", file=sys.stderr)
    print(f"  Add a TXT record:", file=sys.stderr)
    print(f"    Name:  {record_name}", file=sys.stderr)
    print(f"    Value: {validation}", file=sys.stderr)
    print(f"  (full name: {fqdn})", file=sys.stderr)
    print("=" * 70, file=sys.stderr)

    for _ in range(36):  # up to ~6 minutes
        if _resolves_publicly(fqdn, validation):
            print("Record is publicly visible - proceeding.", file=sys.stderr)
            return
        time.sleep(10)
    print("Timed out waiting for the TXT record to appear.", file=sys.stderr)


def cleanup_hook() -> None:
    print("Challenge done - the _acme-challenge TXT record can now be removed (optional).", file=sys.stderr)


if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else ""
    if mode == "auth":
        auth_hook()
    elif mode == "cleanup":
        cleanup_hook()
    else:
        print("Usage: hostinger_dns_hook.py [auth|cleanup]", file=sys.stderr)
        sys.exit(1)
