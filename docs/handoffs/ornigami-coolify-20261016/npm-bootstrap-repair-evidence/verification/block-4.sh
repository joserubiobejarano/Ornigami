set -Eeuo pipefail
node_archive="$RUNNER_TEMP/node-v22.23.3-linux-x64.tar.xz"
curl --fail --silent --show-error --location --output "$node_archive" https://nodejs.org/dist/v22.23.3/node-v22.23.3-linux-x64.tar.xz
printf '%s  %s\n' df450af89261115ef9f9e3830c3eeb2cc9213b63c720b1af623cb5dcbe2e02de "$node_archive" | sha256sum --check
tar -xJf "$node_archive" -C "$RUNNER_TEMP"
node_dir="$RUNNER_TEMP/node-v22.23.3-linux-x64/bin"
echo "$node_dir" >> "$GITHUB_PATH"
curl --fail --silent --show-error --location --output "$RUNNER_TEMP/cosign" https://github.com/sigstore/cosign/releases/download/v3.1.3/cosign-linux-amd64
printf '%s  %s\n' 4629c757b7618056f8ddd7e2625ae9fdd94c0372a65049520bc7d9df9efc7f71 "$RUNNER_TEMP/cosign" | sha256sum --check
chmod 700 "$RUNNER_TEMP/cosign"
"$node_dir/node" "$RUNNER_TEMP/source/scripts/framework-prototype/verify-minimal-parents.mjs" "$RUNNER_TEMP/cosign" "$ORNIGAMI_EVIDENCE_DIR/parent-admission"
"$node_dir/node" -e 'const fs=require("node:fs"),p=JSON.parse(fs.readFileSync(process.argv[1])),d=fs.readFileSync(process.argv[2],"utf8");for(const x of p.parents)if(!d.includes("@"+x.amd64Digest))throw Error("Dockerfile parent policy drift")' "$RUNNER_TEMP/source/scripts/framework-prototype/minimal-parent-policy.json" "$RUNNER_TEMP/source/Dockerfile"

