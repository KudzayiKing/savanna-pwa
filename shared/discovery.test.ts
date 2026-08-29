import { describe, expect, it } from "vitest";
import { createDiscoveryBadge } from "./discovery";

describe("Savanna serendipity rules", () => {
  it("prioritizes broad-area relevance over generic discovery", () => {
    const badge = createDiscoveryBadge({
      surface: "shops",
      viewerUserId: 1,
      ownerUserId: 2,
      viewerCity: "Harare",
      viewerCountryCode: "ZW",
      itemCity: "Harare",
      itemCountryCode: "ZW",
      title: "Wedding photographer",
    });

    expect(badge.slot).toBe("around_you");
    expect(badge.label).toBe("Around Harare");
    expect(badge.reason).toContain("area");
  });

  it("keeps saved business story ads in the product-memory lane", () => {
    const badge = createDiscoveryBadge({
      surface: "stories",
      viewerCountryCode: "ZW",
      itemCountryCode: "ZW",
      isProductMemory: true,
      title: "Handmade basket",
      description: "A short product story",
    });

    expect(badge.slot).toBe("product_memory");
    expect(badge.label).toBe("Product memory");
    expect(badge.score).toBeGreaterThan(70);
  });

  it("uses For you for search-matched marketplace activity without exact local context", () => {
    const badge = createDiscoveryBadge({
      surface: "shops",
      viewerCountryCode: "ZW",
      itemCountryCode: "ZW",
      query: "phones",
      title: "Phone repair",
      category: "Repairs",
    });

    expect(badge.slot).toBe("for_you");
    expect(badge.label).toBe("For you");
    expect(badge.reason).toBe("Relevant marketplace activity");
  });
});
