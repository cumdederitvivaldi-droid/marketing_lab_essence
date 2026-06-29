import os
from pathlib import Path


APP_ROOT = Path(__file__).resolve().parents[1]


def _load_env_file() -> None:
    """Load shared and app-local env files without printing secrets."""
    for env_path in (Path(os.environ.get("ENV_FILE", "/shared/.env")), APP_ROOT / ".env"):
        try:
            lines = env_path.read_text(encoding="utf-8").splitlines()
        except (FileNotFoundError, OSError):
            continue

        for line in lines:
            stripped = line.strip()
            if not stripped or stripped.startswith("#") or "=" not in stripped:
                continue
            key, value = stripped.split("=", 1)
            key = key.strip()
            value = value.strip().strip("\"'")
            if key and key not in os.environ:
                os.environ[key] = value
