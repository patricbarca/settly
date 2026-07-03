#!/usr/bin/env python3
"""
Generates the Apple "Secret Key (for OAuth)" JWT that Supabase's Apple
provider needs (Supabase's UI only asks for Client ID + Secret Key, not
raw Team ID/Key ID/private key — this script combines them into the JWT).

Usage:
    pip install pyjwt cryptography
    python3 generate_apple_secret.py \
        --team-id YOUR_TEAM_ID \
        --client-id app.settlia.web \
        --key-id YOUR_KEY_ID \
        --key-file /path/to/AuthKey_YOURKEYID.p8

Apple's token max lifetime is 6 months (15777000s) — re-run this before
it expires and update the Supabase field again.
"""
import argparse
import time

import jwt

parser = argparse.ArgumentParser()
parser.add_argument("--team-id", required=True, help="Apple Team ID")
parser.add_argument("--client-id", required=True, help="Services ID (e.g. app.settlia.web)")
parser.add_argument("--key-id", required=True, help="Key ID from the .p8 key")
parser.add_argument("--key-file", required=True, help="Path to the downloaded AuthKey_*.p8 file")
args = parser.parse_args()

with open(args.key_file) as f:
    private_key = f.read()

now = int(time.time())
payload = {
    "iss": args.team_id,
    "iat": now,
    "exp": now + 15777000,  # ~6 months, Apple's max
    "aud": "https://appleid.apple.com",
    "sub": args.client_id,
}

token = jwt.encode(
    payload,
    private_key,
    algorithm="ES256",
    headers={"kid": args.key_id},
)

print("\nPaste this into Supabase -> Authentication -> Providers -> Apple -> Secret Key (for OAuth):\n")
print(token)
print()
