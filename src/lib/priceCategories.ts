export const UNCATEGORIZED_PRICE_CATEGORY = 'Uncategorized';
export const UNKNOWN_PRICE_VENDOR = 'Unknown vendor';
export type PriceGroupBy = 'category' | 'vendor';

export type PriceCategoryItem = {
  categoryName?: string | null;
  primaryCategory?: string | null;
  vendorName?: string | null;
  name?: string | null;
};

export function mainPriceCategory(categoryName: string | null | undefined) {
  const trimmed = String(categoryName || '').trim();
  if (!trimmed) return UNCATEGORIZED_PRICE_CATEGORY;
  return trimmed.split('/')[0]?.trim() || UNCATEGORIZED_PRICE_CATEGORY;
}

export function priceCategoryLabel(item: PriceCategoryItem) {
  const primary = String(item.primaryCategory || '').trim();
  if (primary) return primary;
  return mainPriceCategory(item.categoryName);
}

export function priceVendorLabel(item: PriceCategoryItem) {
  return String(item.vendorName || '').trim() || UNKNOWN_PRICE_VENDOR;
}

export function priceGroupLabel(item: PriceCategoryItem, groupBy: PriceGroupBy) {
  return groupBy === 'vendor' ? priceVendorLabel(item) : priceCategoryLabel(item);
}

export function groupPriceItems<T extends PriceCategoryItem>(items: T[], groupBy: PriceGroupBy) {
  const groups = new Map<string, T[]>();

  for (const item of items) {
    const group = priceGroupLabel(item, groupBy);
    groups.set(group, [...(groups.get(group) || []), item]);
  }

  return [...groups.entries()]
    .map(([label, rows]) => ({
      label,
      items: rows.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''))),
    }))
    .sort((a, b) => {
      const fallback = groupBy === 'vendor' ? UNKNOWN_PRICE_VENDOR : UNCATEGORIZED_PRICE_CATEGORY;
      if (a.label === fallback) return 1;
      if (b.label === fallback) return -1;
      return a.label.localeCompare(b.label);
    });
}

export function groupPriceItemsByCategory<T extends PriceCategoryItem>(items: T[]) {
  return groupPriceItems(items, 'category').map(group => ({
    category: group.label,
    items: group.items,
  }));
}
