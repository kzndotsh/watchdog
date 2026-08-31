# Ingress contract

**What this is:** the only legal path from collection into the Case Graph.  
**What this is not:** Cap SPI details ([`../platform/caps-boundary.md`](../platform/caps-boundary.md)), Accept tier rules ([`custody.md`](custody.md)).

## Path

```
Collect (dump / Cap run)
  → Evidence (artifacts on Case)
  → Cap interpret → Proposal (pending)
  → Triage Accept → Graph
```

Also:

- **Dossier** = human Graph edit (direct, not via Proposal).
- **Export** = projection of Graph — never a second SoT.

## Rules

| Do | Don’t |
| --- | --- |
| Caps `interpret` → Proposal only | Caps/machines write Graph or set `confirmed` |
| Triage Accept applies patch under human custody | Silent machine Graph writes |
| Postgres Case Graph is SoT | Hand-edit Export markdown as SoT |

See product loop: [`../../explanation/product.md`](../../explanation/product.md). Agent escape hatch: [`agent-ingress.md`](agent-ingress.md).
