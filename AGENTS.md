# UNIVERSAL AGENT INSTRUCTIONS

## STRICT RULE: MANDATORY API SPECIFICATION COMPLIANCE
Before writing, planning, or modifying any feature:
1. You MUST examine `docs/API_SPECIFICATION.md` (or run schema checks) to retrieve official routes, query params, schemas, and response formats.
2. DO NOT invent endpoints, field names, or mock structures that differ from the specification.
3. If an endpoint or property is missing in `API_SPECIFICATION.md`, STOP and ask the user for confirmation instead of hallucinating.
4. Always import types/interfaces generated from the spec rather than creating ad-hoc inline types.