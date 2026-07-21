# Secure affiliate connector v1 (issue #25)

This framework defines how WearWyzer can connect approved affiliate networks
without placing credentials, publisher identifiers, signed feed URLs, or tokens
in source control, issues, chat, logs, generated assets, or the public dashboard.
It does not connect a real account.

## Security boundary

- Provider definitions contain only a name, authentication mode, least-privilege
  scopes, credential field names, and adapter version.
- Runtime secrets use deterministic names such as
  `AFFILIATE_<PROVIDER>_<SANDBOX|PRODUCTION>_<FIELD>` and are entered directly in
  repository or hosting secret settings by the CEO.
- Sandbox and production have distinct names and are never allowed to fall back
  to one another.
- Provider transports receive secret values only inside the connection call.
  Returned states and audit events are sanitized closed shapes.
- Payout, banking, tax, ownership, billing, deletion, and administration scopes
  are rejected by policy.

## CEO onboarding runbook

1. Register with the affiliate network and wait for approval.
2. Review the provider's exact required scopes. Approve only product-feed read,
   tracked-link creation, and reporting read permissions.
3. Add sandbox credentials directly to the secret store using the names emitted
   by `buildCredentialRegistryEntry()`. Do not paste their values into chat.
4. Run the sanitized connection test. It may report `connected`,
   `pending-approval`, `degraded`, `expired`, or `disconnected`.
5. Verify sandbox product-feed and link generation behavior before adding the
   separately named production secrets.
6. Stop for security review before enabling a real provider transport.

## Rotation and revocation

Replace a stored secret value under the same name; no code change is required.
An invalid, revoked, expired, or insufficiently scoped credential disables only
that provider adapter and emits one dashboard-ready `needsHuman` state. Audit
events record provider, environment, operation, outcome, reason code, and time—
never a credential or raw provider response.

