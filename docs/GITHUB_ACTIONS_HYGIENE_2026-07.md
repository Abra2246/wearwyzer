# GitHub Actions runtime hygiene — July 2026

## Decision

WearWyzer uses the current supported major releases of the relevant first-party
GitHub actions:

- `actions/checkout@v7`
- `actions/setup-node@v7`
- `actions/configure-pages@v6`
- `actions/upload-pages-artifact@v5`
- `actions/deploy-pages@v5`

Each selected major runs its JavaScript action on Node 24. GitHub-hosted runners
already satisfy the documented runner requirement. No workflow permission,
trigger, concurrency group, generated-file protection, bounded retry, or
no-force-push behavior is changed.

## Pages artifact input

`include-hidden-files` belongs to `actions/upload-pages-artifact@v5`. WearWyzer
keeps the input there so `.nojekyll` survives the archive step. The prior v3
release did not expose that input and forwarded it to its older internal
uploader, producing an invalid-input warning.

## Official evidence

- [checkout v7.0.1 release](https://github.com/actions/checkout/releases/tag/v7.0.1)
- [setup-node v7.0.0 release](https://github.com/actions/setup-node/releases/tag/v7.0.0)
- [configure-pages v6.0.0 release](https://github.com/actions/configure-pages/releases/tag/v6.0.0)
- [upload-pages-artifact v5.0.0 release](https://github.com/actions/upload-pages-artifact/releases/tag/v5.0.0)
- [deploy-pages v5.0.0 release](https://github.com/actions/deploy-pages/releases/tag/v5.0.0)

The action manifests and releases were rechecked on July 25, 2026. Future
changes require the same official-source verification and a production run;
major versions must not be advanced from memory.

## Regression boundary

The deterministic workflow contract test scans every active and staged
workflow. It fails if:

- any of the five first-party actions uses an unapproved major;
- active and staged checkout/setup-node majors diverge;
- Pages stops using `upload-pages-artifact@v5`;
- the required hidden-file input disappears; or
- the Pages workflow bypasses the Pages packaging action with a direct generic
  artifact upload.

Local validation passed 603/603 deterministic tests plus the content,
Knowledge Graph, hero-product, HTML metadata, static-site, and diff checks. The
required production proof remains CI, both serialized Ops writers, Pages
deployment, annotation inspection, and the post-deploy health check.
