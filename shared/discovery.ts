export type DiscoverySurface = "stories" | "shops";
export type DiscoverySlot = "around_you" | "product_memory" | "for_you";

export type DiscoveryBadge = {
  slot: DiscoverySlot;
  label: string;
  reason: string;
  score: number;
};

type DiscoveryInput = {
  surface: DiscoverySurface;
  viewerUserId?: number | string | null;
  ownerUserId?: number | string | null;
  viewerCity?: string | null;
  viewerCountryCode?: string | null;
  itemCity?: string | null;
  itemCountryCode?: string | null;
  isProductMemory?: boolean | null;
  title?: string | null;
  description?: string | null;
  category?: string | null;
  query?: string | null;
};

function clean(value?: string | null) {
  return value?.trim() || "";
}

function sameText(left?: string | null, right?: string | null) {
  const a = clean(left).toLowerCase();
  const b = clean(right).toLowerCase();
  return Boolean(a && b && a === b);
}

function queryMatches(input: DiscoveryInput) {
  const query = clean(input.query).toLowerCase();
  if (!query) return false;
  return [input.title, input.description, input.category].some(value => clean(value).toLowerCase().includes(query));
}

export function createDiscoveryBadge(input: DiscoveryInput): DiscoveryBadge {
  const isOwnItem = Boolean(input.viewerUserId && input.ownerUserId && input.viewerUserId === input.ownerUserId);
  const city = clean(input.itemCity);
  const countryMatch = sameText(input.viewerCountryCode, input.itemCountryCode);
  const cityMatch = sameText(input.viewerCity, input.itemCity);

  if (!isOwnItem && cityMatch) {
    return {
      slot: "around_you",
      label: city ? `Around ${city}` : "Around you",
      reason: input.surface === "stories" ? "A public moment from your area" : "Local activity from your area",
      score: input.isProductMemory ? 94 : 90,
    };
  }

  if (input.isProductMemory) {
    return {
      slot: "product_memory",
      label: "Product memory",
      reason: "A saved product story from Savanna Shops",
      score: countryMatch ? 82 : 76,
    };
  }

  if (!isOwnItem && countryMatch) {
    return {
      slot: "for_you",
      label: "For you",
      reason: input.surface === "stories" ? "A nearby public update" : "Relevant marketplace activity",
      score: queryMatches(input) ? 78 : 70,
    };
  }

  return {
    slot: "for_you",
    label: isOwnItem ? "Yours" : "For you",
    reason: queryMatches(input) ? "Matches what you searched for" : "Fresh activity on Savanna",
    score: queryMatches(input) ? 68 : 55,
  };
}
