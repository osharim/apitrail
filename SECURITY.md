# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in apitrail, please **do not** open a public GitHub issue.

Instead, email the maintainers privately at `security@apitrail.io` (or use GitHub's private vulnerability reporting feature).

Please include:

- A description of the vulnerability
- Steps to reproduce
- Affected versions
- Any suggested fix

We will acknowledge receipt within 48 hours and work with you on a coordinated disclosure timeline.

## Supported Versions

Until v1.0, only the latest published version receives security patches.

## Scope

Vulnerabilities of interest include (but are not limited to):

- Sensitive data leakage (inadequate masking of secrets, tokens, PII)
- Injection vulnerabilities in storage adapters
- Authentication bypasses in the dashboard
- Remote code execution paths in configuration parsing
