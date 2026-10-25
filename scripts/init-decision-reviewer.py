"""Initialize a local review-only credential without printing it or rotating an existing one."""

import hashlib
import re
import secrets
from pathlib import Path

root = Path(__file__).resolve().parents[1]
env = root / ".env"
content = env.read_text(encoding="utf-8") if env.exists() else ""
if re.search(r"^DECISION_REVIEW_TOKEN_SHA256=[a-f0-9]{64}$", content, re.M):
    print("Reviewer is already configured. Existing credential was preserved.")
else:
    token = secrets.token_urlsafe(36)
    values = {
        "DECISION_REVIEWER_ID": "local-reviewer",
        "DECISION_REVIEW_TOKEN_SHA256": hashlib.sha256(token.encode()).hexdigest(),
    }
    for key, value in values.items():
        content = re.sub(rf"^{key}=.*\n?", "", content, flags=re.M)
        content = content.rstrip() + f"\n{key}={value}\n"
    env.write_text(content, encoding="utf-8")
    target = root / "runtime" / "decision-reviewer.txt"
    target.parent.mkdir(exist_ok=True)
    target.write_text(
        "AutoMind local decision reviewer — keep private\nReviewer ID: local-reviewer\n"
        f"Review token: {token}\n\nThis credential records local decisions only. No equipment/ERP integration exists.\n",
        encoding="utf-8",
    )
    print(
        "Reviewer configured. Private credential saved in runtime/decision-reviewer.txt (excluded from Git)."
    )
