#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${GITHUB_RUNNER_TOKEN:-}" || -z "${GITHUB_REPOSITORY_URL:-}" || -z "${RUNNER_NAME:-}" || -z "${RUNNER_LABELS:-}" ]]; then
  echo "Missing GITHUB_RUNNER_TOKEN, GITHUB_REPOSITORY_URL, RUNNER_NAME, or RUNNER_LABELS"
  exit 1
fi

RUNNER_VERSION="${GITHUB_RUNNER_VERSION:-2.327.1}"
RUNNER_ROOT="${RUNNER_ROOT:-/opt/github-runner}"

sudo mkdir -p "${RUNNER_ROOT}"
sudo chown -R "$USER":"$USER" "${RUNNER_ROOT}"
cd "${RUNNER_ROOT}"

if [[ ! -f "./config.sh" ]]; then
  curl -L -o actions-runner.tar.gz "https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/actions-runner-linux-x64-${RUNNER_VERSION}.tar.gz"
  tar xzf actions-runner.tar.gz
fi

if [[ -f ".runner" ]]; then
  ./config.sh remove --token "${GITHUB_RUNNER_TOKEN}" || true
fi

./config.sh \
  --url "${GITHUB_REPOSITORY_URL}" \
  --token "${GITHUB_RUNNER_TOKEN}" \
  --name "${RUNNER_NAME}" \
  --labels "${RUNNER_LABELS}" \
  --unattended \
  --replace

sudo ./svc.sh install
sudo ./svc.sh start

echo "Runner ${RUNNER_NAME} registered with labels ${RUNNER_LABELS}"
