/** Shape of /catalog/manifest.json produced by scripts/sync-assets.mjs (local mirror of real assets). */
export interface ManifestBrand {
  id: string;
  name: string;
  nameLatin: string;
  sortOrder: number;
  logoUrl: string;
}
export interface ManifestProduct {
  id: string;
  brandId: string;
  name: string;
  imageUrl: string;
}
export interface CatalogManifest {
  brands: ManifestBrand[];
  products: ManifestProduct[];
}

export async function fetchCatalogManifest(signal?: AbortSignal): Promise<CatalogManifest> {
  const res = await fetch('/catalog/manifest.json', { signal });
  if (!res.ok) throw new Error(`manifest ${res.status}`);
  return (await res.json()) as CatalogManifest;
}
