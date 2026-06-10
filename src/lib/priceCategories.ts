export const UNCATEGORIZED_PRICE_CATEGORY = 'Uncategorized';

export type PriceCategoryItem = {
  categoryName?: string | null;
  primaryCategory?: string | null;
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

export function groupPriceItemsByCategory<T extends PriceCategoryItem>(items: T[]) {
  const groups = new Map<string, T[]>();

  for (const item of items) {
    const category = priceCategoryLabel(item);
    groups.set(category, [...(groups.get(category) || []), item]);
  }

  return [...groups.entries()]
    .map(([category, rows]) => ({
      category,
      items: rows.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''))),
    }))
    .sort((a, b) => {
      if (a.category === UNCATEGORIZED_PRICE_CATEGORY) return 1;
      if (b.category === UNCATEGORIZED_PRICE_CATEGORY) return -1;
      return a.category.localeCompare(b.category);
    });
}
