export type ProviderId = "tcgdex" | "pricecharting";

export type Currency = "USD" | "EUR";

/** One price a provider offers for a product, e.g. "TCGplayer · Holofoil · market". */
export type PriceField = {
  key: string;
  label: string;
  currency: Currency;
  /** Amount in the provider's currency, in cents. null = the provider has no price right now. */
  nativeCents: number | null;
};

/** A product found at a provider (a card printing, or a card + grade family at PriceCharting). */
export type ProviderProduct = {
  provider: ProviderId;
  externalId: string;
  name: string;
  setName: string | null;
  number: string | null;
  language: "EN" | "JP";
  rarity: string | null;
  imageUrl: string | null;
  url: string | null;
  fields: PriceField[];
};

export type ConditionLike = {
  conditionType: "raw" | "graded";
  grader: string | null;
  grade: string | null;
  variants?: string[];
  language?: "EN" | "JP";
};

export interface PriceProvider {
  id: ProviderId;
  name: string;
  /** Search by free text (name, set, number). */
  search(query: string, opts: { language: "EN" | "JP" }): Promise<ProviderProduct[]>;
  /** Fetch current prices for one product. */
  fetch(externalId: string, opts?: { asOf?: string }): Promise<ProviderProduct | null>;
  /** Best default price field for a card in this condition. */
  suggestField(product: ProviderProduct, condition: ConditionLike): string | null;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}
