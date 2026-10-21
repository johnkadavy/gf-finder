// Shared Next.js cache tags, so the code that writes data and the cached
// readers agree on the tag names used for on-demand revalidation.

/** Latest verified visit shown on a restaurant page (keyed by Google place id). */
export const verifiedVisitsTag = (googlePlaceId: string) => `verified-visits:${googlePlaceId}`;
