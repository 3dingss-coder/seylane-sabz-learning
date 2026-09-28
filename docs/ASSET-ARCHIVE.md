# Large source asset archive

To keep GitHub-based importers (including Google AI Studio) from cloning a very large working tree, the following original inputs have been moved out of the source checkout and preserved in a local archive:

- Product and brand images: `لوگو برندها و تصاویر محصولات/`
- The supplied helper UI kit: `کامپوننت های کمکی برای تکمیل UI UX اپلیکیشن/`
- Sample training media: root-level `*.mp4` and `*.m4a`

The archive is **not tracked by Git**. In this workspace it is at:

```text
.asset-backup/large-assets.tar.gz
```

The archive contains the original paths. To restore them after downloading/copying the archive into the repository root:

```bash
mkdir -p .asset-backup
tar -xzf .asset-backup/large-assets.tar.gz -C .
```

Do not commit the archive or extracted binary folders back into the lightweight import branch. Keep the archive in a separate backup/storage location. The catalog CSV/XLSX files remain tracked. Local asset synchronization safely generates an empty image manifest when image sources are absent; production images are served from Firebase Storage. Sample training media are optional for seeding.

The four small PWA brand images required for builds remain tracked under `apps/web/public/icons/`.
