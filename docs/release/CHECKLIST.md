# ACDS Release Checklist

## Release Gate

- License present at repository root
- Root README points to `acds/README.md` as canonical docs
- MVP boundary doc reviewed
- Operator guide and environment matrix updated
- Database migrations apply cleanly on a fresh Postgres instance
- Seeds validate and apply cleanly
- API health endpoint starts successfully on fresh setup
- Provider registration path works
- GRITS DB-backed release mode completes and produces an artifact
- No blocking GRITS defects (`critical`, `high`, or red snapshot)
- Release notes match the supported MVP scope

## Tagging

- Update release notes
- Tag `v0.1.0`
- Publish GitHub release
- Confirm repo metadata remains ACDS-first
