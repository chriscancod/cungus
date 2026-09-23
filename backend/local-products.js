// Products fulfilled through TapStitch that do NOT exist as Printify records.
//
// TapStitch has no order-placement API for a custom site (see
// sendTapstitchOwnerEmail in server.js): every TapStitch order is emailed to the
// owner and placed by hand, so a Printify product would only ever be a stand-in
// carrying an ID, variants and a price. These are defined here instead, in the
// same shape as a Printify product (id, title, description, tags, images,
// variants with prices in cents), and merged in at the one place every route gets
// its catalog from — fetchAllPrintifyProducts(). Everything downstream (shapeProduct,
// priceItems' server-side pricing, the stock check, shipping tiers, the catalog)
// therefore treats them like any other product with no special cases.
//
// Every spec below is TapStitch's own published figure for that item (RT0061,
// RU0076), read 2026-09-19. Nothing here is a claim TapStitch does not make.

const SUPPORT_EMAIL = 'chrisclm713@gmail.com';
const IMG = 'https://2amcases.online/assets/products';

// Neither product is orderable before this. The long sleeve's launch date is
// Sep 23 (00:00 US Eastern); the zip-up had no date of its own, so it holds to
// the same day rather than appearing before the owner is ready to fill orders.
// Set launchAt to null to make a product live immediately.
const LAUNCH_AT = '2026-09-23T00:00:00-04:00';

const SIZES = ['S', 'M', 'L', 'XL', '2XL'];
const CARE = [
  'Machine wash at 30°C (86°F), gentle cycle',
  'Do not bleach',
  'Tumble dry low',
  'Iron at low temperature; do not iron on the print',
  'Do not dry clean',
];
// TapStitch's own stated production time is 1–3 business days; the transit
// figure is its Standard Shipping 95th percentile (30 days). Change the wording
// here if a faster shipping method is chosen for these orders.
const SHIP_RETURNS =
  'Made to order. Each piece is printed after you order it. Production takes 1–3 business days, then it ships. ' +
  'Allow up to 5 weeks from order to delivery. ' +
  "Returns: because each piece is printed for your order, we don't accept returns for size or preference. " +
  `If your order arrives damaged, defective or misprinted, email ${SUPPORT_EMAIL} within 30 days of delivery ` +
  'with your order number and a photo. You choose a free replacement or a full refund.';

function slug(s) { return s.toLowerCase().replace(/[^a-z0-9]+/g, '-'); }

// Variant titles are "Size / Color" — the same order shapeProduct and the
// storefront read them in.
function variants(prefix, colors, priceCents) {
  return colors.flatMap(color => SIZES.map(size => ({
    id: `${prefix}-${size.toLowerCase()}-${slug(color)}`,
    title: `${size} / ${color}`,
    price: priceCents,
    is_enabled: true,
    is_available: true,
  })));
}

function chartRows(rows) {
  return rows.map(([size, chest, length, shoulder, sleeve]) => [size, chest, length, shoulder, sleeve]);
}

const THE_STANDARD = {
  id: '2am-the-standard',
  title: 'The Standard Long Sleeve Tee',
  // The storefront shows only the first 200 characters of this (shortDesc), and
  // uses it for the meta description — so it is the standalone summary. The rest
  // of the copy lives in content.paragraphs and renders in the details section.
  description:
    'The Standard: crewneck long sleeve tee, 85% cotton / 15% polyester, 280 gsm, small 2AM mark on the left chest. Black, white or heather gray. S–2XL.',
  tags: ['tapstitch', 'showfloor'],
  blueprint_id: null,
  launchAt: LAUNCH_AT,
  created_at: '2026-09-23T04:00:00.000Z',
  images: [
    { src: `${IMG}/the-standard/the-standard-black-front.jpg`, position: 'front' },
    { src: `${IMG}/the-standard/the-standard-black-back.jpg`, position: 'back' },
    { src: `${IMG}/the-standard/the-standard-white-front.jpg`, position: 'front' },
    { src: `${IMG}/the-standard/the-standard-white-back.jpg`, position: 'back' },
    { src: `${IMG}/the-standard/the-standard-heather-gray-front.jpg`, position: 'front' },
    { src: `${IMG}/the-standard/the-standard-heather-gray-back.jpg`, position: 'back' },
  ],
  variants: variants('std', ['Black', 'White', 'Heather Gray'], 5000),
  // Owner-email ticket only (tapstitch-ticket.js): what to open and click when placing the order at TapStitch.
  tapstitch: {
    item: 'RT0061',
    url: 'https://www.tapstitch.com/custom/rt0061-essential-crewneck-long-sleeve-t-shirt',
    print: 'DTG · front · left upper chest · small red script "2am" (design size given as 31 × 21, units not confirmed)',
    colors: { 'Heather Gray': 'Gray' },
  },
  content: {
    paragraphs: [
      'The fabric weighs 8.3 oz/yd². The shoulder seam sits below the natural shoulder line, and the body is cut roomy: ' +
      'a size S measures 21.65 in (55 cm) across the chest, flat, which is 43.3 in around. The collar and cuffs are ribbed. ' +
      'The mark is printed with direct-to-garment (DTG) printing, using water-based inks. Each shirt is printed after you order. ' +
      'Compare the measurements below with a shirt you already own before choosing a size. ' +
      'Small color differences between production batches are normal.',
    ],
    specs: [
      ['Materials', '85% cotton, 15% polyester. 280 gsm (8.3 oz/yd²).'],
      ['Fit', 'Crewneck, drop shoulder, roomy cut. Garment chest is 21.65–24.80 in across, flat, from S to 2XL.'],
      ['Construction', 'Long sleeves. Ribbed crewneck collar and ribbed cuffs.'],
      ['Print', 'Direct-to-garment (DTG), water-based inks. Small 2AM mark on the left upper chest.'],
      ['Care', 'Machine wash 30°C gentle. No bleach. Tumble dry low. Low iron, not on the print. Do not dry clean.'],
    ],
    care: CARE,
    shipReturns: SHIP_RETURNS,
    sizeChart: {
      note:
        'Measurements are of the garment laid flat, not of your body. Chest is measured straight across from armpit seam to armpit seam, ' +
        'so double it for the distance around. The supplier rates this cut “regular”, but the numbers are roomy: compare them with a tee you already own.',
      columns: ['Size', 'Chest, flat', 'Length', 'Shoulder', 'Sleeve'],
      rows: chartRows([
        ['S',   '21.65 in / 55 cm', '26.77 in / 68 cm', '20.08 in / 51 cm', '22.05 in / 56 cm'],
        ['M',   '22.44 in / 57 cm', '27.56 in / 70 cm', '20.87 in / 53 cm', '22.44 in / 57 cm'],
        ['L',   '23.23 in / 59 cm', '28.35 in / 72 cm', '21.65 in / 55 cm', '22.83 in / 58 cm'],
        ['XL',  '24.02 in / 61 cm', '29.13 in / 74 cm', '22.44 in / 57 cm', '23.23 in / 59 cm'],
        ['2XL', '24.80 in / 63 cm', '29.92 in / 76 cm', '23.23 in / 59 cm', '23.62 in / 60 cm'],
      ]),
    },
    imageAlts: [
      'The Standard Long Sleeve Tee in black, front view, laid flat, with a small red 2AM script mark on the left chest',
      'The Standard Long Sleeve Tee in black, back view, laid flat, plain back',
      'The Standard Long Sleeve Tee in white, front view, laid flat, with a small red 2AM script mark on the left chest',
      'The Standard Long Sleeve Tee in white, back view, laid flat, plain back',
      'The Standard Long Sleeve Tee in heather gray, front view, laid flat, with a small red 2AM script mark on the left chest',
      'The Standard Long Sleeve Tee in heather gray, back view, laid flat, plain back',
    ],
  },
};

const THE_VIRGIL = {
  id: '2am-the-virgil',
  title: 'The Virgil Zip-Up Hoodie',
  description:
    'The Virgil: boxy full-zip fleece hoodie, 355 gsm, two-way zipper, small 2AM mark. Black, light gray, haze blue or dark green. S–2XL.',
  tags: ['tapstitch', 'showfloor'],
  blueprint_id: null,
  launchAt: LAUNCH_AT,
  created_at: '2026-09-23T04:00:00.000Z',
  images: [
    { src: `${IMG}/the-virgil/the-virgil-black-front.jpg`, position: 'front' },
    { src: `${IMG}/the-virgil/the-virgil-black-back.jpg`, position: 'back' },
    { src: `${IMG}/the-virgil/the-virgil-haze-blue-front.jpg`, position: 'front' },
    { src: `${IMG}/the-virgil/the-virgil-dark-green-front.jpg`, position: 'front' },
    { src: `${IMG}/the-virgil/the-virgil-light-gray-front.jpg`, position: 'front' },
    { src: `${IMG}/the-virgil/the-virgil-model-front.jpg`, position: 'other' },
    { src: `${IMG}/the-virgil/the-virgil-model-side.jpg`, position: 'other' },
    { src: `${IMG}/the-virgil/the-virgil-model-open-zip.jpg`, position: 'other' },
    { src: `${IMG}/the-virgil/the-virgil-model-back.jpg`, position: 'other' },
    { src: `${IMG}/the-virgil/the-virgil-detail-hood-zipper.jpg`, position: 'other' },
    { src: `${IMG}/the-virgil/the-virgil-detail-cuff.jpg`, position: 'other' },
    { src: `${IMG}/the-virgil/the-virgil-detail-pocket.jpg`, position: 'other' },
    { src: `${IMG}/the-virgil/the-virgil-detail-fabric.jpg`, position: 'other' },
  ],
  variants: variants('vrg', ['Black', 'Light Gray', 'Haze Blue', 'Dark Green'], 7000),
  tapstitch: {
    item: 'RU0076',
    url: 'https://www.tapstitch.com/custom/ru0076-sunfade-two-way-zipper-boxy-fleece-hoodie',
    print: 'DTF · front · left upper chest · small white script "2am" with a sparkle (design size given as 31 × 21, units not confirmed)',
    colors: {},
  },
  content: {
    paragraphs: [
      'The fleece is 42% cotton, 53% polyester and 5% other fibers, 10.5 oz/yd². The shoulder is dropped, the pocket is on the front, ' +
      'and the cuffs and hem are ribbed. The mark is printed on the left chest with direct-to-film (DTF) printing. ' +
      'The sun-faded finish is applied to each piece, so the fade pattern varies from hoodie to hoodie and from the photos. ' +
      'Each hoodie is printed after you order. A size S measures 24.41 in (62 cm) across the chest, flat, which is 48.8 in around; ' +
      'check the size chart before choosing.',
    ],
    specs: [
      ['Materials', 'Fleece: 42% cotton, 53% polyester, 5% other fibers. 355 gsm (10.5 oz/yd²).'],
      ['Fit', 'Boxy cut, drop shoulder. Garment chest is 24.41–27.56 in across, flat; body length 24.80–27.17 in, S to 2XL.'],
      ['Construction', 'Full-length two-way zipper, hood, front pocket, ribbed cuffs and hem.'],
      ['Print', 'Direct-to-film (DTF), 2AM mark on the left upper chest. Sun-faded finish; the pattern varies by piece.'],
      ['Care', 'Machine wash 30°C gentle. No bleach. Tumble dry low. Low iron, not on the print. Do not dry clean.'],
    ],
    care: CARE,
    shipReturns: SHIP_RETURNS,
    sizeChart: {
      note:
        'Measurements are of the garment laid flat, not of your body. Chest is measured straight across from armpit seam to armpit seam, ' +
        'so double it for the distance around. This is a boxy cut: size S is 48.8 in around the chest, much roomier than a standard hoodie. ' +
        'Compare the numbers with a hoodie you already own.',
      columns: ['Size', 'Chest, flat', 'Length', 'Shoulder', 'Sleeve'],
      rows: chartRows([
        ['S',   '24.41 in / 62 cm', '24.80 in / 63 cm',   '22.44 in / 57 cm', '22.44 in / 57 cm'],
        ['M',   '25.20 in / 64 cm', '25.39 in / 64.5 cm', '23.23 in / 59 cm', '22.83 in / 58 cm'],
        ['L',   '25.98 in / 66 cm', '25.98 in / 66 cm',   '24.02 in / 61 cm', '23.23 in / 59 cm'],
        ['XL',  '26.77 in / 68 cm', '26.57 in / 67.5 cm', '24.80 in / 63 cm', '23.62 in / 60 cm'],
        ['2XL', '27.56 in / 70 cm', '27.17 in / 69 cm',   '25.59 in / 65 cm', '24.02 in / 61 cm'],
      ]),
    },
    imageAlts: [
      'The Virgil Zip-Up Hoodie in black, front view, laid flat, with a small white 2AM script mark on the left chest',
      'The Virgil Zip-Up Hoodie in black, back view, laid flat, with a sun-faded pattern across the upper back',
      'The Virgil Zip-Up Hoodie in haze blue, front view, laid flat, with a small white 2AM script mark on the left chest',
      'The Virgil Zip-Up Hoodie in dark green, front view, laid flat, with a small white 2AM script mark on the left chest',
      'The Virgil Zip-Up Hoodie in light gray, front view, laid flat, with a small white 2AM script mark on the left chest',
      'Model wearing The Virgil Zip-Up Hoodie in black, zipped, front view. Photo shows the blank garment without the 2AM print',
      'Model wearing The Virgil Zip-Up Hoodie in black, side view. Photo shows the blank garment without the 2AM print',
      'Model wearing The Virgil Zip-Up Hoodie in black, unzipped over a t-shirt, hands in the front pocket. Photo shows the blank garment',
      'Model wearing The Virgil Zip-Up Hoodie in black, back three-quarter view, showing the hood and the sun-faded upper back',
      'Close-up of the hood and two-way zipper on The Virgil Zip-Up Hoodie in light gray',
      'Close-up of the ribbed cuff on The Virgil Zip-Up Hoodie in light gray',
      'Close-up of the front pocket on The Virgil Zip-Up Hoodie in light gray',
      'Close-up of the fleece fabric on The Virgil Zip-Up Hoodie in light gray',
    ],
  },
};

// ── Bottoms (added 2026-09-19) ───────────────────────────────────────────────
// Specs: TapStitch UB0029 (jeans) and UB0051 (sweatpants), read from TapStitch's own
// pages. Published live 2026-09-23 on Chris's direct instruction ("publish the jeans
// and sweat pants"). Flagged to him first that the standing pre-publish gate — order
// and check a sample against the size chart before going live — had not been cleared
// as of that instruction; he chose to publish anyway. Fit, hand-feel and print quality
// remain unverified by an actual sample, which is why the copy still only gives
// measurements and asks the customer to compare, with no fit or quality claim made.
const AROUND = 'Around = twice the flat measurement.';

const THE_MAINSTAY = {
  id: '2am-the-mainstay',
  title: 'The Mainstay Jeans',
  description:
    'The Mainstay: straight-leg jeans, 85% cotton / 15% polyester, 365 gsm, small 2AM mark on the back pocket. Washed black, blue or gray. S–2XL.',
  tags: ['tapstitch', 'showfloor'],
  blueprint_id: null,
  published: true, // 2026-09-23: published on Chris's direct instruction — sample not yet verified, see note above
  launchAt: null,
  created_at: '2026-09-23T18:00:00.000Z',
  images: [
    { src: `${IMG}/the-mainstay/the-mainstay-black-front.jpg`, position: 'front' },
    { src: `${IMG}/the-mainstay/the-mainstay-black-back.jpg`, position: 'back' },
    { src: `${IMG}/the-mainstay/the-mainstay-blue-front.jpg`, position: 'front' },
    { src: `${IMG}/the-mainstay/the-mainstay-blue-back.jpg`, position: 'back' },
    { src: `${IMG}/the-mainstay/the-mainstay-gray-back.jpg`, position: 'back' },
    { src: `${IMG}/the-mainstay/the-mainstay-model-blue-front.jpg`, position: 'other' },
    { src: `${IMG}/the-mainstay/the-mainstay-model-blue-side.jpg`, position: 'other' },
    { src: `${IMG}/the-mainstay/the-mainstay-model-blue-back.jpg`, position: 'other' },
    { src: `${IMG}/the-mainstay/the-mainstay-model-gray-front.jpg`, position: 'other' },
    { src: `${IMG}/the-mainstay/the-mainstay-model-gray-back.jpg`, position: 'other' },
    { src: `${IMG}/the-mainstay/the-mainstay-detail-waistband.jpg`, position: 'other' },
    { src: `${IMG}/the-mainstay/the-mainstay-detail-pocket-rivets.jpg`, position: 'other' },
    { src: `${IMG}/the-mainstay/the-mainstay-detail-back-pocket.jpg`, position: 'other' },
    { src: `${IMG}/the-mainstay/the-mainstay-detail-fabric.jpg`, position: 'other' },
  ],
  variants: variants('msy', ['Washed Black', 'Washed Blue', 'Washed Gray'], 8000),
  // Storefront color names describe the wash; TapStitch calls them Black / Blue / Light Gray.
  tapstitch: {
    item: 'UB0029',
    url: 'https://www.tapstitch.com/custom/ub0029-unisex-vintage-wash-straight-leg-jeans',
    print: 'DTG · back · back pocket · small red script "2am"',
    colors: { 'Washed Black': 'Black', 'Washed Blue': 'Blue', 'Washed Gray': 'Light Gray' },
  },
  content: {
    paragraphs: [
      'The denim weighs 10.8 oz/yd². The cut is loose with a mid rise and a straight leg that ends at the ankle. ' +
      'It has a zip fly and button closure, five pockets, metal rivets and topstitching. ' +
      'The mark is printed with direct-to-garment (DTG) printing. ' +
      'Sizes are S to 2XL, not waist numbers: a size L measures 32.3 in around the waist and 43.3 in around the hip. ' +
      'The fiber content lists no elastane. Compare the size chart with a pair that fits you before choosing.',
    ],
    specs: [
      ['Materials', 'Denim: 85% cotton, 15% polyester. 365 gsm (10.8 oz/yd²). No elastane listed.'],
      ['Fit', 'Loose cut, mid rise, straight leg to ankle length. Garment waist 29.1–35.4 in around, hip 40.2–46.5 in around, S to 2XL.'],
      ['Construction', 'Zip fly and button closure, five pockets, metal rivets, topstitching.'],
      ['Print', 'Direct-to-garment (DTG), water-based inks. Small 2AM mark on the back pocket. Washed finish; shade varies slightly by batch.'],
      ['Care', 'Machine wash 30°C gentle. No bleach. Tumble dry low. Low iron, not on the print. Do not dry clean.'],
    ],
    care: CARE,
    shipReturns: SHIP_RETURNS,
    sizeChart: {
      note:
        'Sizes are S to 2XL, not waist and inseam, and there is one length per size. Measure a pair of jeans that fit you: lay them flat, ' +
        'measure across the waistband from edge to edge (double it for around) and from the waistband to the hem, then compare with this table. ' +
        'The fiber content lists no elastane, so do not count on stretch. If your numbers fall between two sizes, choose by the waist and hip ' +
        'measurements, not the letter. The model in the photos is 6\'1" (185 cm), 154 lb, and wears size L (TapStitch\'s figures). ' +
        'Each pair is made to order, so we cannot take size returns: check the numbers before you buy. ' + AROUND,
      columns: ['Size', 'Waist, flat', 'Waist, around', 'Hip, flat', 'Hip, around', 'Length, waistband to hem'],
      rows: [
        ['S',   '14.57 in / 37 cm', '29.1 in', '20.08 in / 51 cm', '40.2 in', '38.19 in / 97 cm'],
        ['M',   '15.35 in / 39 cm', '30.7 in', '20.87 in / 53 cm', '41.7 in', '38.58 in / 98 cm'],
        ['L',   '16.14 in / 41 cm', '32.3 in', '21.65 in / 55 cm', '43.3 in', '38.98 in / 99 cm'],
        ['XL',  '16.93 in / 43 cm', '33.9 in', '22.44 in / 57 cm', '44.9 in', '39.37 in / 100 cm'],
        ['2XL', '17.72 in / 45 cm', '35.4 in', '23.23 in / 59 cm', '46.5 in', '39.76 in / 101 cm'],
      ],
    },
    imageAlts: [
      'The Mainstay Jeans in washed black, front view, laid flat, with zip fly and button',
      'The Mainstay Jeans in washed black, back view, laid flat, with a small red 2AM script mark on the back pocket',
      'The Mainstay Jeans in washed blue, front view, laid flat, with zip fly and button',
      'The Mainstay Jeans in washed blue, back view, laid flat, with a small red 2AM script mark on the back pocket',
      'The Mainstay Jeans in washed gray, back view, laid flat, with a small red 2AM script mark on the back pocket',
      'Model wearing The Mainstay Jeans in washed blue, front view. Photo shows the blank garment without the 2AM print',
      'Model wearing The Mainstay Jeans in washed blue, side view. Photo shows the blank garment without the 2AM print',
      'Model wearing The Mainstay Jeans in washed blue, back view. Photo shows the blank garment without the 2AM print',
      'Model wearing The Mainstay Jeans in washed gray, front view. Photo shows the blank garment without the 2AM print',
      'Model wearing The Mainstay Jeans in washed gray, back view. Photo shows the blank garment without the 2AM print',
      'Close-up of the waistband, button and zip fly on The Mainstay Jeans in washed blue',
      'Close-up of the front pocket with metal rivets on The Mainstay Jeans in washed blue',
      'Close-up of the back pocket and topstitching on The Mainstay Jeans in washed blue',
      'Close-up of the denim fabric on The Mainstay Jeans in washed blue',
    ],
  },
};

const THE_REST = {
  id: '2am-the-rest',
  title: 'The Rest Sweatpants',
  description:
    'The Rest: loose sweatpants, 345 gsm knit, elastic waist, small 2AM mark on the left front. Black, slate blue or heather gray. S–2XL.',
  tags: ['tapstitch', 'showfloor'],
  blueprint_id: null,
  published: true, // 2026-09-23: published on Chris's direct instruction — sample not yet verified, see note above
  launchAt: null,
  created_at: '2026-09-23T18:00:00.000Z',
  images: [
    { src: `${IMG}/the-rest/the-rest-black-front.jpg`, position: 'front' },
    { src: `${IMG}/the-rest/the-rest-black-back.jpg`, position: 'back' },
    { src: `${IMG}/the-rest/the-rest-slate-blue-front.jpg`, position: 'front' },
    { src: `${IMG}/the-rest/the-rest-slate-blue-back.jpg`, position: 'back' },
    { src: `${IMG}/the-rest/the-rest-heather-gray-front.jpg`, position: 'front' },
    { src: `${IMG}/the-rest/the-rest-heather-gray-back.jpg`, position: 'back' },
    { src: `${IMG}/the-rest/the-rest-model-front.jpg`, position: 'other' },
    { src: `${IMG}/the-rest/the-rest-model-side.jpg`, position: 'other' },
    { src: `${IMG}/the-rest/the-rest-model-back.jpg`, position: 'other' },
    { src: `${IMG}/the-rest/the-rest-model-walking.jpg`, position: 'other' },
  ],
  variants: variants('rst', ['Black', 'Slate Blue', 'Heather Gray'], 7000),
  // TapStitch calls these Black / Haze Blue / Flower Gray. "Slate Blue" because TapStitch's
  // Haze Blue here is a much darker color than the hoodie's Haze Blue.
  tapstitch: {
    item: 'UB0051',
    url: 'https://www.tapstitch.com/custom/ub0051-unisex-barrel-leg-sweatpants',
    print: 'DTF · front · left front · small red script "2am"',
    colors: { 'Slate Blue': 'Haze Blue', 'Heather Gray': 'Flower Gray' },
  },
  content: {
    paragraphs: [
      'The fabric is 53% polyester, 42% cotton and 5% other fibers, 10.2 oz/yd². The waistband is elastic, the hem is straight and ends at the ankle, ' +
      'and there are slash pockets at the sides and two pockets at the back. The mark is printed with direct-to-film (DTF) printing, which sits on ' +
      'the surface of the fabric as a thin film. Each pair is printed after you order. A size S measures 42.5 in around the hip, laid flat and doubled. ' +
      'Compare the size chart with a pair you already own before choosing a size.',
    ],
    specs: [
      ['Materials', 'Knit: 53% polyester, 42% cotton, 5% other fibers. 345 gsm (10.2 oz/yd²).'],
      ['Fit', 'Loose cut, elastic waistband, ankle length. Garment hip 21.26–24.41 in across, flat (42.5–48.8 in around); length 40.55–43.70 in, S to 2XL.'],
      ['Construction', 'Elastic waistband, slash side pockets, two back pockets, straight hem.'],
      ['Print', 'Direct-to-film (DTF). Small 2AM mark on the left front. The print sits on the surface of the fabric as a thin film.'],
      ['Care', 'Machine wash 30°C gentle. No bleach. Tumble dry low. Low iron, not on the print. Do not dry clean.'],
    ],
    care: CARE,
    shipReturns: SHIP_RETURNS,
    sizeChart: {
      note:
        'Measurements are of the garment laid flat, not of your body. Hip is measured straight across the widest hip line, so double it for around. ' +
        'The waistband is elastic and the waist figures are flat garment measurements. This is a loose cut: size S is 42.5 in around the hip. ' +
        'Compare the numbers with a pair of sweatpants you already own. The model in the photos is 6\'1" (185 cm), 154 lb, and wears size L (TapStitch\'s figures). ' +
        'Each pair is made to order, so we cannot take size returns. ' + AROUND,
      columns: ['Size', 'Waist, flat', 'Waist, around', 'Hip, flat', 'Hip, around', 'Length, waistband to hem'],
      rows: [
        ['S',   '12.60 in / 32 cm', '25.2 in', '21.26 in / 54 cm', '42.5 in', '40.55 in / 103 cm'],
        ['M',   '13.39 in / 34 cm', '26.8 in', '22.05 in / 56 cm', '44.1 in', '41.34 in / 105 cm'],
        ['L',   '14.17 in / 36 cm', '28.3 in', '22.83 in / 58 cm', '45.7 in', '42.13 in / 107 cm'],
        ['XL',  '14.96 in / 38 cm', '29.9 in', '23.62 in / 60 cm', '47.2 in', '42.91 in / 109 cm'],
        ['2XL', '15.75 in / 40 cm', '31.5 in', '24.41 in / 62 cm', '48.8 in', '43.70 in / 111 cm'],
      ],
    },
    imageAlts: [
      'The Rest Sweatpants in black, front view, laid flat, with a small dark-red 2AM script mark on the left front',
      'The Rest Sweatpants in black, back view, laid flat, with two back pockets',
      'The Rest Sweatpants in slate blue, front view, laid flat, with a small red 2AM script mark on the left front',
      'The Rest Sweatpants in slate blue, back view, laid flat, with two back pockets',
      'The Rest Sweatpants in heather gray, front view, laid flat, with a small red 2AM script mark on the left front',
      'The Rest Sweatpants in heather gray, back view, laid flat, with two back pockets',
      'Model wearing The Rest Sweatpants in slate blue, front view. Photo shows the blank garment without the 2AM print',
      'Model wearing The Rest Sweatpants in slate blue, side view. Photo shows the blank garment without the 2AM print',
      'Model wearing The Rest Sweatpants in slate blue, back view. Photo shows the blank garment without the 2AM print',
      'Model wearing The Rest Sweatpants in slate blue, walking, side view. Photo shows the blank garment without the 2AM print',
    ],
  },
};

const LOCAL_PRODUCTS = [THE_STANDARD, THE_VIRGIL, THE_MAINSTAY, THE_REST];

// Appends every local product that is visible: published (a `published: false` product
// is staged and never shown) and past its launch time. SHOW_UNLAUNCHED_LOCAL_PRODUCTS=1
// shows every product regardless (for previewing a deploy before launch day).
function withLocalProducts(printifyProducts, { now = Date.now(), env = process.env } = {}) {
  const showAll = env.SHOW_UNLAUNCHED_LOCAL_PRODUCTS === '1';
  const live = LOCAL_PRODUCTS.filter(p => showAll || (p.published !== false && (!p.launchAt || now >= Date.parse(p.launchAt))));
  return [...printifyProducts, ...live];
}

module.exports = { LOCAL_PRODUCTS, withLocalProducts, SUPPORT_EMAIL };
