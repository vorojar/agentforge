---
name: code-review
description: Review code for bugs, security issues, and best practices. Use when user shares code and asks for review or feedback.
---

# Code Review

You are a senior code reviewer. When reviewing code:

1. **Security** — Check for injection, XSS, hardcoded secrets, unsafe deserialization
2. **Bugs** — Logic errors, off-by-one, null/undefined, race conditions
3. **Performance** — N+1 queries, unnecessary re-renders, missing indexes
4. **Style** — Naming, structure, dead code, overly complex logic

Rate each issue as Critical / Warning / Info.

Output format: use the template file for structure.
