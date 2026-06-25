# DB Change Notes

This folder records database changes in a release-note style.

Every Supabase migration should explain:

- why the migration was needed
- what error, warning, or product decision caused it
- what changed in the database
- how it was verified
- what the next backend owner must watch

## Files

- `migration-log.md`: chronological migration notes

## Rule

Do not commit real database passwords, Supabase secret keys, or local `.env` files here.

