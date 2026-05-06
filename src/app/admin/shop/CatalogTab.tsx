"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { cn, formatGBP } from "@/lib/utils";
import {
  upsertProduct,
  uploadCoverImage,
  uploadProductAsset,
} from "./actions";
import { Toggle } from "@/components/ui/toggle";

interface ProductRow {
  id: string;
  slug: string;
  name: string;
  short_pitch: string;
  long_description_md: string | null;
  cover_url: string | null;
  price_pence: number;
  kind: "pdf" | "video" | "external_link";
  asset_url: string | null;
  preview_url: string | null;
  member_discount_pct: number | null;
  free_for_tier: "insider" | "studio_insider" | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

export function CatalogTab({ products }: { products: ProductRow[] }) {
  const [editing, setEditing] = useState<ProductRow | "new" | null>(null);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] tracking-snug text-olive-soft">
          {products.length} product{products.length === 1 ? "" : "s"} in
          this catalogue.
        </p>
        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={() => setEditing("new")}
        >
          + New product
        </Button>
      </div>

      {products.length === 0 ? (
        <Card className="p-5">
          <p className="text-[13px] tracking-snug text-olive-soft">
            No products yet.
          </p>
        </Card>
      ) : (
        <ul className="flex flex-col gap-2">
          {products.map((p) => (
            <li key={p.id}>
              <Card
                interactive
                role="button"
                tabIndex={0}
                onClick={() => setEditing(p)}
                className="flex items-center gap-4 p-4"
              >
                <div className="relative h-14 w-24 flex-shrink-0 overflow-hidden rounded-[10px] bg-cream-deep">
                  {p.cover_url && (
                    <Image
                      src={p.cover_url}
                      alt={p.name}
                      fill
                      sizes="96px"
                      className="object-cover"
                    />
                  )}
                </div>
                <div className="flex-1">
                  <p className="text-[14px] font-medium tracking-snug text-olive">
                    {p.name}
                  </p>
                  <p className="mt-0.5 text-[12px] tracking-snug text-olive-soft">
                    {formatGBP(p.price_pence)} &middot; {p.kind}
                    {p.member_discount_pct ? ` · ${p.member_discount_pct}% off Insider` : ""}
                    {p.free_for_tier ? ` · free for ${p.free_for_tier}` : ""}
                  </p>
                </div>
                {!p.is_active && (
                  <span
                    className="rounded-full px-2.5 py-1 text-[11px] font-medium uppercase tracking-label-caps"
                    style={{
                      background: "rgba(62,62,49,0.06)",
                      color: "rgba(62,62,49,0.62)",
                    }}
                  >
                    paused
                  </span>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Sheet
        open={!!editing}
        onOpenChange={(o) => {
          if (!o) setEditing(null);
        }}
      >
        <SheetContent>
          {editing && (
            <ProductEditor
              key={editing === "new" ? "new" : editing.id}
              product={editing === "new" ? null : editing}
              onClose={() => setEditing(null)}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function ProductEditor({
  product,
  onClose,
}: {
  product: ProductRow | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [slug, setSlug] = useState(product?.slug ?? "");
  const [name, setName] = useState(product?.name ?? "");
  const [pitch, setPitch] = useState(product?.short_pitch ?? "");
  const [longMd, setLongMd] = useState(product?.long_description_md ?? "");
  const [pricePounds, setPricePounds] = useState(
    product ? (product.price_pence / 100).toFixed(2) : ""
  );
  const [kind, setKind] = useState<"pdf" | "video" | "external_link">(
    product?.kind ?? "pdf"
  );
  const [memberPct, setMemberPct] = useState(product?.member_discount_pct ?? 0);
  const [freeForTier, setFreeForTier] = useState<
    "insider" | "studio_insider" | ""
  >(product?.free_for_tier ?? "");
  const [isActive, setIsActive] = useState(product?.is_active ?? true);
  const [sortOrder, setSortOrder] = useState(String(product?.sort_order ?? 100));
  const [coverUrl, setCoverUrl] = useState<string | null>(product?.cover_url ?? null);
  const [assetPath, setAssetPath] = useState<string | null>(product?.asset_url ?? null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const coverRef = useRef<HTMLInputElement>(null);
  const assetRef = useRef<HTMLInputElement>(null);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [uploadingAsset, setUploadingAsset] = useState(false);

  function handleSave() {
    setError(null);
    const priceN = Number(pricePounds);
    if (!Number.isFinite(priceN) || priceN < 0) {
      setError("Price must be a non-negative number.");
      return;
    }
    startTransition(async () => {
      const r = await upsertProduct({
        id: product?.id,
        slug,
        name,
        shortPitch: pitch,
        longDescriptionMd: longMd || null,
        pricePence: Math.round(priceN * 100),
        kind,
        memberDiscountPct: memberPct,
        freeForTier: freeForTier || null,
        isActive,
        sortOrder: Number(sortOrder) || 100,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setSavedAt(Date.now());
      router.refresh();
      onClose();
    });
  }

  async function handleCoverFile(file: File) {
    setError(null);
    if (!product?.id) {
      setError("Save the product once first, then upload a cover.");
      return;
    }
    setUploadingCover(true);
    try {
      const buf = await file.arrayBuffer();
      const base64 = Buffer.from(buf).toString("base64");
      const r = await uploadCoverImage({
        productId: product.id,
        filename: file.name,
        base64,
        contentType: file.type,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setCoverUrl(r.coverUrl);
      router.refresh();
    } finally {
      setUploadingCover(false);
    }
  }

  async function handleAssetFile(file: File) {
    setError(null);
    if (!product?.id) {
      setError("Save the product once first, then upload the asset.");
      return;
    }
    setUploadingAsset(true);
    try {
      const buf = await file.arrayBuffer();
      const base64 = Buffer.from(buf).toString("base64");
      const r = await uploadProductAsset({
        productId: product.id,
        filename: file.name,
        base64,
        contentType: file.type,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setAssetPath(r.assetPath);
      router.refresh();
    } finally {
      setUploadingAsset(false);
    }
  }

  return (
    <>
      <SheetHeader>
        <SheetTitle>{product ? "Edit product" : "New product"}</SheetTitle>
        <SheetDescription>
          {product
            ? "Save metadata then upload cover + asset below."
            : "Save once to enable cover + asset uploads."}
        </SheetDescription>
      </SheetHeader>

      <div className="flex flex-col gap-4">
        <Field label="Slug (URL)">
          <input
            type="text"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="nutrition-blueprint"
            className="h-11 rounded-[12px] border-[0.5px] border-hairline-strong bg-white px-3 font-mono text-[13px] text-olive shadow-1 placeholder:text-olive-faint"
          />
        </Field>
        <Field label="Name">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-11 rounded-[12px] border-[0.5px] border-hairline-strong bg-white px-3 text-[14px] text-olive shadow-1"
          />
        </Field>
        <Field label="Short pitch">
          <input
            type="text"
            value={pitch}
            onChange={(e) => setPitch(e.target.value)}
            placeholder="One sentence shown on the card"
            className="h-11 rounded-[12px] border-[0.5px] border-hairline-strong bg-white px-3 text-[14px] text-olive shadow-1 placeholder:text-olive-faint"
          />
        </Field>
        <Field label="Long description (markdown)">
          <textarea
            value={longMd}
            onChange={(e) => setLongMd(e.target.value)}
            rows={8}
            className="rounded-[12px] border-[0.5px] border-hairline-strong bg-white px-3 py-2 font-mono text-[13px] leading-relaxed text-olive shadow-1"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Price (GBP)">
            <input
              type="number"
              min={0}
              step={0.01}
              value={pricePounds}
              onChange={(e) => setPricePounds(e.target.value)}
              className="h-11 rounded-[12px] border-[0.5px] border-hairline-strong bg-white px-3 text-[14px] tabular-nums text-olive shadow-1"
            />
          </Field>
          <Field label="Kind">
            <select
              value={kind}
              onChange={(e) =>
                setKind(e.target.value as "pdf" | "video" | "external_link")
              }
              className="h-11 rounded-[12px] border-[0.5px] border-hairline-strong bg-white px-3 text-[14px] text-olive shadow-1"
            >
              <option value="pdf">PDF</option>
              <option value="video">Video</option>
              <option value="external_link">External link</option>
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Insider discount (%)">
            <input
              type="number"
              min={0}
              max={100}
              value={memberPct}
              onChange={(e) =>
                setMemberPct(
                  Math.max(0, Math.min(100, Number(e.target.value) || 0))
                )
              }
              className="h-11 rounded-[12px] border-[0.5px] border-hairline-strong bg-white px-3 text-[14px] tabular-nums text-olive shadow-1"
            />
          </Field>
          <Field label="Free for tier">
            <select
              value={freeForTier}
              onChange={(e) =>
                setFreeForTier(
                  e.target.value as "" | "insider" | "studio_insider"
                )
              }
              className="h-11 rounded-[12px] border-[0.5px] border-hairline-strong bg-white px-3 text-[14px] text-olive shadow-1"
            >
              <option value="">None</option>
              <option value="insider">Insider</option>
              <option value="studio_insider">Studio Insider</option>
            </select>
          </Field>
        </div>

        <Field label="Sort order">
          <input
            type="number"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
            className="h-11 w-32 rounded-[12px] border-[0.5px] border-hairline-strong bg-white px-3 text-[14px] tabular-nums text-olive shadow-1"
          />
        </Field>

        <label className="flex items-center justify-between gap-3">
          <span className="text-[13px] tracking-snug text-olive">
            Visible in /portal/shop
          </span>
          <Toggle
            checked={isActive}
            onChange={() => setIsActive((v) => !v)}
            label="Visible"
          />
        </label>

        {/* Cover */}
        <div className="rounded-[12px] border-[0.5px] border-hairline bg-cream-deep/30 p-3">
          <p className="text-[11px] font-medium uppercase tracking-label-caps text-olive-soft">
            Cover image
          </p>
          {coverUrl && (
            <div className="relative mt-2 aspect-[16/9] w-full overflow-hidden rounded-[10px]">
              <Image
                src={coverUrl}
                alt="Cover"
                fill
                sizes="100vw"
                className="object-cover"
              />
            </div>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => coverRef.current?.click()}
              disabled={uploadingCover || !product?.id}
            >
              {uploadingCover
                ? "Uploading"
                : coverUrl
                  ? "Replace cover"
                  : "Upload cover"}
            </Button>
            <input
              ref={coverRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleCoverFile(f);
                e.target.value = "";
              }}
            />
            <span className="text-[11px] tracking-snug text-olive-faint">
              JPEG/PNG/WebP, 1 MB max. Auto-resized to 1280×720.
            </span>
          </div>
        </div>

        {/* Asset */}
        <div className="rounded-[12px] border-[0.5px] border-hairline bg-cream-deep/30 p-3">
          <p className="text-[11px] font-medium uppercase tracking-label-caps text-olive-soft">
            Product asset (private)
          </p>
          <p className="mt-2 text-[12px] tracking-snug text-olive-soft">
            {assetPath ? `Uploaded: ${assetPath}` : "No asset uploaded yet."}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => assetRef.current?.click()}
              disabled={uploadingAsset || !product?.id}
            >
              {uploadingAsset
                ? "Uploading"
                : assetPath
                  ? "Replace asset"
                  : "Upload asset"}
            </Button>
            <input
              ref={assetRef}
              type="file"
              accept={kind === "video" ? "video/*" : "application/pdf,*"}
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleAssetFile(f);
                e.target.value = "";
              }}
            />
            <span className="text-[11px] tracking-snug text-olive-faint">
              50 MB max. Stored privately, served via signed URLs.
            </span>
          </div>
        </div>

        {error && <p className="text-[12px] text-destructive">{error}</p>}
      </div>

      <SheetFooter>
        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={handleSave}
          disabled={pending || !slug || !name || !pitch}
        >
          {pending ? "Saving" : product ? "Save changes" : "Create product"}
        </Button>
        {savedAt && !pending && (
          <span className="text-[12px] tracking-snug text-sage-deep">
            Saved ✓
          </span>
        )}
      </SheetFooter>
    </>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-[11px] font-medium uppercase tracking-label-caps text-olive-soft">
        {label}
      </span>
      {children}
    </label>
  );
}
