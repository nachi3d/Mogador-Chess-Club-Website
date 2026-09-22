/**
 * The shop catalogue at BUILD time — the git side of the shop (0016).
 *
 * ⚠️ BUILD TIME ONLY. It imports `astro:content`, so nothing a browser runs may
 * import it; `shop.ts` is the client half. Prices here are what the PAGE shows;
 * what a student is charged is the copy an admin published into `shop_items`.
 *
 * ⚠️ `isListed` AND `isRoutable` ARE TWO RULES (src/config/fixtures.ts): the
 * fixture item gets a detail page in a test build and is never on the index,
 * never in a count and never in the catalogue an admin publishes.
 */
import { getCollection, type CollectionEntry } from 'astro:content';
import type { Locale } from '@config/site';
import { isListed, isRoutable } from '@config/fixtures';

export type ShopItem = CollectionEntry<'boutique'>['data'];

const byOrder = (a: ShopItem, b: ShopItem) => a.order - b.order || a.slug.localeCompare(b.slug);

/** Items a reader can find: on the index, in the counts, in the publish payload. */
export async function listedItems(): Promise<ShopItem[]> {
  return (await getCollection('boutique')).map((e) => e.data).filter(isListed).sort(byOrder);
}

/** Items that get a detail page — the listed ones, plus fixtures in a test build. */
export async function routableItems(): Promise<ShopItem[]> {
  return (await getCollection('boutique')).map((e) => e.data).filter(isRoutable).sort(byOrder);
}

export function itemName(item: ShopItem, locale: Locale): string {
  return locale === 'fr' ? item.name_fr : item.name_en;
}

export function itemDescription(item: ShopItem, locale: Locale): string {
  return locale === 'fr' ? item.description_fr : item.description_en;
}

/**
 * What `admin_publish_shop()` receives for one item — the enforced numbers only.
 *
 * ⚠️ THE FIELD NAMES ARE THE DATABASE'S. `/admin/boutique/` also compares this
 * against the live `shop_items` row to say "à publier", so anything added here
 * is compared there in the same commit, or a price edit reads as published.
 */
export interface PublishedShape {
  readonly slug: string;
  readonly price_jetons: number | null;
  readonly price_mad: number | null;
  readonly allow_jetons: boolean;
  readonly allow_whatsapp: boolean;
}

export function publishShape(item: ShopItem): PublishedShape {
  return {
    slug: item.slug,
    price_jetons: item.priceJetons ?? null,
    price_mad: item.priceMad ?? null,
    allow_jetons: item.paths.includes('jetons'),
    allow_whatsapp: item.paths.includes('whatsapp'),
  };
}
