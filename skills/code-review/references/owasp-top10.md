# OWASP Top 10 (2021) Quick Reference

| # | Category | Key Checks |
|---|----------|------------|
| A01 | Broken Access Control | Missing auth checks, IDOR, CORS misconfiguration |
| A02 | Cryptographic Failures | Plaintext secrets, weak hashing, missing TLS |
| A03 | Injection | SQL injection, XSS, command injection, LDAP injection |
| A04 | Insecure Design | Missing rate limiting, no input validation |
| A05 | Security Misconfiguration | Default credentials, verbose errors, unnecessary features |
| A06 | Vulnerable Components | Outdated dependencies with known CVEs |
| A07 | Auth Failures | Weak passwords, missing MFA, session fixation |
| A08 | Data Integrity Failures | Insecure deserialization, missing integrity checks |
| A09 | Logging Failures | Missing audit logs, logging sensitive data |
| A10 | SSRF | Unvalidated URL fetching, internal network access |
