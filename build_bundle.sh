#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
BUNDLE_DIR="$ROOT_DIR/deploy_bundle"
ZIP_PATH="$ROOT_DIR/tonermanager_bundle.zip"
IMAGE_NAME="tonermanager:latest"

if ! command -v docker >/dev/null 2>&1; then
  echo "Error: docker is not installed or not in PATH." >&2
  exit 1
fi

if ! command -v zip >/dev/null 2>&1; then
  echo "Error: zip is not installed. Install it and retry." >&2
  exit 1
fi

echo "==> Building Docker image: $IMAGE_NAME"
docker build -t "$IMAGE_NAME" "$ROOT_DIR"

echo "==> Exporting image to $BUNDLE_DIR/tonermanager_image.tar.gz"
docker save "$IMAGE_NAME" | gzip > "$BUNDLE_DIR/tonermanager_image.tar.gz"

echo "==> Creating bundle zip: $ZIP_PATH"
(cd "$BUNDLE_DIR" && zip -r "$ZIP_PATH" .)

echo "==> Bundle ready: $ZIP_PATH"
