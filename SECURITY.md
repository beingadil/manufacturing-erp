
# Security Policy

## Supported versions

Security fixes are applied to the latest release only. Older versions do not receive patches.

| Version | Supported |
| --- | --- |
| Latest release on the [Releases page](https://github.com/beingadil/manufacturing-erp/releases) | Yes |
| Anything older | No |

Please update to the latest release before reporting an issue against an older version.

## Reporting a vulnerability

**Do not open a public issue** for a security problem. A public issue tells everyone about the
problem before it is fixed.

Report it privately through GitHub's security advisory form:

> **Security Advisories** &rarr; **Report a vulnerability**
> at `https://github.com/beingadil/manufacturing-erp/security/advisories/new`

If that form is unavailable to you, open a regular issue containing only the words
`security contact needed` and nothing else &mdash; that is enough for the maintainer to reach
out privately.

Please include:

- The version you tested.
- What you did, step by step.
- What you expected, and what happened instead.
- The impact you believe it has (data loss, privilege escalation, information disclosure,
  anything else).

## What to expect

- Acknowledgement within a few days.
- An assessment of severity and impact, and whether a fix is warranted.
- A fix released as a new version, and a credit in the release notes unless you prefer
  otherwise.

There is no formal SLA. This is a small, independently maintained project, so set your
expectations accordingly.

## Threat model

Manufacturing ERP is an offline single-machine desktop application. Understanding what is and
is not in scope will get you a faster, more useful answer.

**In scope**

- Authentication and authorisation bypass, including the role-based access control.
- Data loss or corruption of the local SQLite database.
- Backup and restore defects, especially any case where importing a backup destroys data that
  the import was not supposed to touch.
- Information disclosure between users or roles.
- Vulnerabilities in Electron configuration &mdash; disabled context isolation, disabled
  sandboxing, or an overly permissive preload bridge.

**Out of scope**

- A local user with physical access to the machine running the app. Anyone who can open the
  process can read the database file; that is inherent to a local desktop app with no server.
- Reports that require an attacker who already has administrator rights on the machine.
- Social engineering of end users, such as convincing someone to import a hostile `.merpbak`
  file.
- Denial of service against the developer's GitHub account.

## A note on backups

Your data lives in a single local SQLite file, and backing it up is the operator's
responsibility. The app makes that straightforward &mdash; Settings &rarr; Maintenance &rarr;
Backup &amp; Restore writes a portable `.merpbak` file anywhere you choose &mdash; but nothing
is uploaded anywhere, and nothing is backed up for you. Keep your own copies somewhere safe
and keep more than one.

Do not import a `.merpbak` file from a source you cannot verify. Import replaces the live
database outright.
