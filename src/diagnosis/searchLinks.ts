/**
 * Outbound search links (docs/DECISIONS.md ADR-024). Fixed start-page URLs:
 * no verified affiliate-free deep-link format exists, so no search
 * parameters, user data, or affiliate IDs are ever appended.
 */
export const SEARCH_LINKS = [
  { id: "flights", provider: "Google Flights", url: "https://www.google.com/travel/flights" },
  { id: "hotels", provider: "Booking.com", url: "https://www.booking.com/" },
] as const;

export type SearchLink = (typeof SEARCH_LINKS)[number];
