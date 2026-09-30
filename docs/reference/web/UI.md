# UI: design system hub

This index covers how the interface is built. Product IA is in [`../../explanation/ux.md`](../../explanation/ux.md); the design brief the rules trace back to is [`../../explanation/design.md`](../../explanation/design.md).

The code source of truth is `apps/web/src/styles.css` + `shared/ui/`. The style guide is **/ui**.

| Leaf | Owns |
| --- | --- |
| [`ui/README.md`](ui/README.md) | Delivery gates, chrome lexicon, PR checklist |
| [`ui/tokens.md`](ui/tokens.md) | Design system, colors, type roles, refuse list |
| [`ui/rules.md`](ui/rules.md) | Rules inventory: reason, kind, verdict, enforcer |
| [`ui/page-shell.md`](ui/page-shell.md) | Page / trail / toolbar |
| [`ui/forms.md`](ui/forms.md) | Form library |
| [`ui/tables.md`](ui/tables.md) | Table columns + DataTable pending |
| [`ui/loading.md`](ui/loading.md) | Skeletons + loading & hydration rules |
| [`ui/atoms.md`](ui/atoms.md) | Hand-owned atom highlights + facade wrappers |
| [`ui/vendor.md`](ui/vendor.md) | Vendored primitives: layers, lock, sync |
| [`ui/motion.md`](ui/motion.md) | Operate motion |
| [`ui/multi-mode.md`](ui/multi-mode.md) | Detail / composers |

Links that point to `UI.md#tables` should use [`ui/tables.md`](ui/tables.md). Loading rules are in [`ui/loading.md`](ui/loading.md).
