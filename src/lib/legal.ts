// Legal documents for the hosted tier (tracker#10).
//
// Absolute, and deliberately not derived from the current origin: these pages
// are published by the marketing site (homeaccounting/site) at the apex domain,
// while this app is served from /app — and from demo.homeaccounting.com in the
// published sandbox. A relative href would 404 in both places.
//
// They describe the hosted service only. A self-hoster running their own
// instance is not a party to either document, but the links still resolve for
// them, which is better than a dead one.
const SITE_ORIGIN = 'https://www.homeaccounting.com';

export const TERMS_URL = `${SITE_ORIGIN}/terms`;
export const PRIVACY_URL = `${SITE_ORIGIN}/privacy`;
