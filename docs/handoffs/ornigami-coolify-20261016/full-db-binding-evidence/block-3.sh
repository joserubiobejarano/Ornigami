set -Eeuo pipefail
cd "$RUNNER_TEMP"
curl --fail --silent --show-error --location \
  --output trivy_0.76.0_Linux-64bit.tar.gz \
  https://github.com/aquasecurity/trivy/releases/download/v0.76.0/trivy_0.76.0_Linux-64bit.tar.gz
curl --fail --silent --show-error --location \
  --output trivy_0.76.0_checksums.txt \
  https://github.com/aquasecurity/trivy/releases/download/v0.76.0/trivy_0.76.0_checksums.txt
grep -Fx 'e24b1c51293c1b15e4ba8d45bbc7891ba053f90278ec2698f3562c993e145fe7  trivy_0.76.0_Linux-64bit.tar.gz' trivy_0.76.0_checksums.txt >/dev/null
echo 'e24b1c51293c1b15e4ba8d45bbc7891ba053f90278ec2698f3562c993e145fe7  trivy_0.76.0_Linux-64bit.tar.gz' | sha256sum --check --status
tar -xzf trivy_0.76.0_Linux-64bit.tar.gz trivy
chmod 0755 trivy
./trivy --version
{
  printf '%s\n' '### Scanner verification'
  printf '%s\n' '- Trivy 0.76.0 Linux amd64 archive checksum verified against the official release checksum file:'
  printf '%s\n' '  https://github.com/aquasecurity/trivy/releases/download/v0.76.0/trivy_0.76.0_checksums.txt'
} >> "$ORNIGAMI_JOB_SUMMARY"

