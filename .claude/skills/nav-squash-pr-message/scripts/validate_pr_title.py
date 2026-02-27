#!/usr/bin/env python3
"""
Validate PR title for squash merge commits.

Rules:
- Must start with Jira number (e.g., MEL-1234) or NOJIRA
- Max 72 characters total (git recommendation)
"""

import re
import sys

MAX_TITLE_LENGTH = 72
# Valid prefixes (explicit list):
# - \d+ : Jira number (e.g., 1234, 7553)
# - NOJIRA : No Jira ticket
# - TOGGLE : Feature toggle related
# - D[A-Z]+ : Dependabot (DWEB, DAPI, etc.)
# - G4P : Specific code
VALID_PREFIXES = r'(\d+|NOJIRA|TOGGLE|D[A-Z]+|G4P)'
PREFIX_PATTERN = rf'^({VALID_PREFIXES}\s+)+'


def validate_pr_title(title: str, pr_number: int | None = None) -> tuple[bool, list[str]]:
    """
    Validate a PR title.

    Args:
        title: The PR title to validate
        pr_number: Optional PR number (will be appended as " (#123)")

    Returns:
        Tuple of (is_valid, list of error/warning messages)
    """
    errors = []
    warnings = []

    # Check for valid prefix(es)
    if not re.match(PREFIX_PATTERN, title):
        errors.append(
            f"Tittel må starte med en eller flere koder:\n"
            f"  - Jira-nummer (f.eks. 1234)\n"
            f"  - NOJIRA, TOGGLE, DWEB, DAPI, G4P, etc.\n"
            f"  Eksempler: '1234 Beskrivelse', '1234 TOGGLE Beskrivelse'\n"
            f"  Nåværende: {title}"
        )

    # Calculate full title length (including PR number suffix)
    full_title = title
    if pr_number:
        full_title = f"{title} (#{pr_number})"

    if len(full_title) > MAX_TITLE_LENGTH:
        over_by = len(full_title) - MAX_TITLE_LENGTH
        errors.append(
            f"Tittel er {len(full_title)} tegn, maks er {MAX_TITLE_LENGTH} (over med {over_by}).\n"
            f"  Nåværende: {full_title}\n"
            f"  Tips: Forkort til maks {MAX_TITLE_LENGTH - (len(f' (#{pr_number})') if pr_number else 0)} tegn"
        )
    elif len(full_title) > MAX_TITLE_LENGTH - 10:
        warnings.append(
            f"Tittel er {len(full_title)} tegn, nær grensen på {MAX_TITLE_LENGTH}."
        )

    messages = []
    if errors:
        messages.extend([f"❌ {e}" for e in errors])
    if warnings:
        messages.extend([f"⚠️  {w}" for w in warnings])
    if not errors and not warnings:
        messages.append(f"✅ Tittel OK ({len(full_title)} tegn)")

    return len(errors) == 0, messages


def main():
    """CLI interface for validation."""
    if len(sys.argv) < 2:
        print("Usage: python validate_pr_title.py <title> [pr_number]")
        print()
        print("Examples:")
        print('  python validate_pr_title.py "MEL-1234 Add user validation"')
        print('  python validate_pr_title.py "MEL-1234 Add user validation" 456')
        sys.exit(1)

    title = sys.argv[1]
    pr_number = int(sys.argv[2]) if len(sys.argv) > 2 else None

    is_valid, messages = validate_pr_title(title, pr_number)

    for msg in messages:
        print(msg)

    sys.exit(0 if is_valid else 1)


if __name__ == "__main__":
    main()
