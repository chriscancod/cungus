# 2AM storefront

The storefront remains 2AMCases / 2AM, a Mambru Inc. brand built around discipline, individuality, faith, consistency and long-term ownership. The public tagline is “All Worth It.” Its existing domain, product IDs, printed product artwork and checkout integrations are retained.

Newest published Tapstitch pieces lead the homepage, about-page product selection and catalog default order. Price/name sorting and category filters remain available. Product dates are exposed as `createdAt`; known recent product IDs provide a fallback for the current API before backend deployment.

Application source: `shared/merchandising.vey`. The browser artifact `shared/merchandising.js` is generated; do not edit it directly.

Rebuild: `node --experimental-strip-types shared/build-merchandising.mjs`

Targeted checks: `node --experimental-strip-types --no-warnings --import ./backend/vey/register.ts --test backend/test/merchandising.test.vey`

Mambru provides the Catholic foundation; 2AM remains the consumer-facing identity for students, creators, entrepreneurs, athletes and dreamers doing quiet work. Brand styling: `shared/mambru.css`. Existing HTML pages carry static brand copy, the original crescent-and-star logo and metadata. The About page contains the owner's ten values, Catholic foundation and 2AM philosophy. Values cards are rendered from Vey source. The product photos still show their original supplied artwork; a storefront rebrand does not alter the garments.

Browser review confirmed ten rendered values cards, no script errors, and no horizontal overflow at 390px. The latest-first merchandising tests pass. Changes remain local until publication is requested.
