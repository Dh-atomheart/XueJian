---
title: 设计文档
---

# Design Docs

This directory holds the durable UI and interaction rules for XueJian. Product requirements still come from `docs/product-specs/*`; these files explain how the product should look and behave.

## Read Order

1. [foundation.md](./foundation.md)
2. [tokens.md](./tokens.md)
3. [components.md](./components.md)
4. [pages.md](./pages.md)
5. [interactions.md](./interactions.md)

## Additional Current References

- [reader-annotation.md](./reader-annotation.md)

Use `reader-annotation.md` together with `pages.md` and `interactions.md` when touching the PDF reader, sticky notes, highlights, or card-source jumps.

## Rules

- Keep this directory focused on stable interaction and visual truth.
- If a screen or interaction changes materially, update the matching design doc in the same change.
