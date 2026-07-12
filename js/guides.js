// ============================================================
// WEARWYZER — style guide data (one object per Instagram carousel)
//
// To add a new guide:
// 1. Copy the first object below and update every field.
// 2. Drop slide images into assets/images/guides/<id>/
// 3. Duplicate guide-on-cloud-x4.dc.html, rename it to match `slug`,
//    and change the GUIDE_ID constant at the top of its logic.
// 4. Add the page to sitemap.xml.
// ============================================================
export const guides = [
  {
    id: "on-cloud-x4",
    title: "How to Style the On Cloud X 4 Ivory / Black",
    slug: "guide-on-cloud-x4.dc.html",
    productName: "On Cloud X 4",
    brand: "On",
    colorway: "Ivory / Black",
    category: "Sneakers",
    verdict:
      "A versatile athletic lifestyle trainer. Ivory keeps it clean, black details keep it sharp — one shoe that covers the office, the weekend, and the airport.",
    description:
      "5 wearable outfits for one versatile trainer — business casual, everyday casual, date night, and travel.",
    coverImage: "assets/images/guides/on-cloud-x4-cover.png",
    slideImages: [
      { src: "assets/images/guides/on-cloud-x4/slide-01.png", label: "Cover" },
      { src: "assets/images/guides/on-cloud-x4/slide-02.png", label: "Business Casual" },
      { src: "assets/images/guides/on-cloud-x4/slide-03.png", label: "Everyday Casual" },
      { src: "assets/images/guides/on-cloud-x4/slide-04.png", label: "Date Night" },
      { src: "assets/images/guides/on-cloud-x4/slide-05.png", label: "Travel Day" },
      { src: "assets/images/guides/on-cloud-x4/slide-06.png", label: "One Shoe. Any Plan." },
      { src: "assets/images/guides/on-cloud-x4/slide-07.png", label: "Shop the Look" },
    ],
    outfitCount: 5,
    bestFor: "Business casual · Everyday · Date night · Travel",
    outfits: [
      {
        name: "Business Casual",
        when: "Office days, smart-casual dress codes, meetings that aren't suit-level formal.",
        items: [
          { name: "Light blue Oxford shirt", productId: "oxford-shirt" },
          { name: "Beige chinos", productId: "beige-chinos" },
          { name: "Minimal watch", productId: "minimal-watch" },
          { name: "On Cloud X 4 Ivory / Black", productId: "on-cloud-x4" },
        ],
        why: "The ivory upper reads clean against beige chinos, and the black details keep it sharp enough for the office without looking like gym gear.",
      },
      {
        name: "Everyday Casual",
        when: "Errands, campus, weekends — the default outfit that never looks lazy.",
        items: [
          { name: "Oversized cream tee", productId: "cream-tee" },
          { name: "Light wash jeans", productId: "light-jeans" },
          { name: "Cap", productId: "cap" },
          { name: "On Cloud X 4 Ivory / Black", productId: "on-cloud-x4" },
        ],
        why: "Cream-on-cream ties the tee to the shoe, light denim keeps it relaxed, and the cap finishes it without trying too hard.",
      },
      {
        name: "Date Night",
        when: "Dinner, drinks, low-key evenings where sneakers are fine but sloppy isn't.",
        items: [
          { name: "Black knit polo", productId: "knit-polo" },
          { name: "Black tailored trousers", productId: "black-trousers" },
          { name: "Minimal watch", productId: "minimal-watch" },
          { name: "On Cloud X 4 Ivory / Black", productId: "on-cloud-x4" },
        ],
        why: "All black up top makes the ivory shoe the one light element — it looks intentional, not accidental.",
      },
      {
        name: "Travel Day",
        when: "Airports, trains, long walking days.",
        items: [
          { name: "Gray hoodie", productId: "gray-hoodie" },
          { name: "Black tech pants", productId: "tech-pants" },
          { name: "Backpack", productId: "backpack" },
          { name: "On Cloud X 4 Ivory / Black", productId: "on-cloud-x4" },
        ],
        why: "Comfort-first pieces in gray and black; the trainer handles miles of walking without wrecking the look.",
      },
      {
        name: "One Shoe. Any Plan.",
        when: "When you don't know what the day holds.",
        items: [
          { name: "Light blue Oxford shirt", productId: "oxford-shirt" },
          { name: "Light wash jeans", productId: "light-jeans" },
          { name: "Minimal watch", productId: "minimal-watch" },
          { name: "On Cloud X 4 Ivory / Black", productId: "on-cloud-x4" },
        ],
        why: "Smart top half, casual bottom half — the X 4 bridges both, so the outfit works wherever the day goes.",
      },
    ],
    styleNotes: [
      "Keep the palette neutral — cream, beige, gray, black, light blue.",
      "Use black details (watch strap, belt, trousers) to connect with the black laces.",
      "Avoid overly formal suits with this shoe.",
      "Works best in smart casual, travel, and casual outfits.",
    ],
    relatedProducts: [
      "on-cloud-x4",
      "oxford-shirt",
      "beige-chinos",
      "knit-polo",
      "light-jeans",
      "gray-hoodie",
      "minimal-watch",
      "backpack",
    ],
    instagramUrl: "", // TODO: paste the Instagram post URL when published
    publishedDate: "2026-07-01",
    tags: ["Sneakers", "Business casual", "Everyday", "Date night", "Travel", "Work", "College"],
    comingSoon: false,
  },

  {
    id: "nb9060-zara-polo",
    title: "How to Style the Zara Hemp Cotton Knit Polo x New Balance 9060",
    slug: "guide-nb9060.dc.html",
    productName: "New Balance 9060 'Breakfast Tea with Angora'",
    brand: "New Balance",
    colorway: "Breakfast Tea",
    category: "Sneakers",
    verdict:
      "A brown knit polo and the 9060 'Breakfast Tea' share the same warm palette, so almost anything neutral works underneath. Five outfits, two hero pieces, zero guesswork.",
    description:
      "5 outfits built around two hero pieces — the Zara brown knit polo and the New Balance 9060 'Breakfast Tea'.",
    coverImage: "assets/images/guides/nb9060-zara-polo-cover.png",
    slideImages: [
      { src: "assets/images/guides/nb9060-zara-polo/slide-01.png", label: "Cover" },
      { src: "assets/images/guides/nb9060-zara-polo/slide-02.png", label: "Summer Coastal" },
      { src: "assets/images/guides/nb9060-zara-polo/slide-03.png", label: "Artist Off-Duty" },
      { src: "assets/images/guides/nb9060-zara-polo/slide-04.png", label: "Campus Classic" },
      { src: "assets/images/guides/nb9060-zara-polo/slide-05.png", label: "Dinner Terrace" },
      { src: "assets/images/guides/nb9060-zara-polo/slide-06.png", label: "Weekend Market" },
      { src: "assets/images/guides/nb9060-zara-polo/slide-07.png", label: "Shop the Look" },
    ],
    outfitCount: 5,
    bestFor: "Summer · Date night · College · Travel · Everyday",
    outfits: [
      {
        name: "Summer Coastal",
        when: "Beach days, resort travel, seaside lunch.",
        items: [
          { name: "Brown Knit Polo (Zara)", productId: "zara-knit-polo-brown" },
          { name: "Linen Blend Shorts (H&M)", productId: "hm-linen-shorts" },
          { name: "Round Sunglasses (Mango Man)", productId: "mango-sunglasses" },
          { name: "Canvas Tote Bag (COS)", productId: "cos-tote-bag" },
          { name: "9060 'Breakfast Tea'", productId: "nb-9060-breakfast-tea" },
        ],
        why: "Linen and knit share the same relaxed texture, and the tote keeps the warm palette going from head to bag.",
      },
      {
        name: "Artist Off-Duty",
        when: "Gallery visits, coffee runs, creative days.",
        items: [
          { name: "Brown Knit Polo (Zara)", productId: "zara-knit-polo-brown" },
          { name: "Wide Leg Pants (COS)", productId: "cos-wide-leg-pants" },
          { name: "Crossbody Bag (Uniqlo)", productId: "uniqlo-crossbody-black" },
          { name: "Silver Bracelet (Mango Man)", productId: "mango-sunglasses" },
          { name: "9060 'Breakfast Tea'", productId: "nb-9060-breakfast-tea" },
        ],
        why: "Off-white wide-leg pants lengthen the silhouette; the crossbody is the one black detail that grounds it.",
      },
      {
        name: "Campus Classic",
        when: "Campus days, study sessions, weekend activities.",
        items: [
          { name: "Brown Knit Polo (Zara)", productId: "zara-knit-polo-brown" },
          { name: "Pleated Shorts (Abercrombie & Fitch)", productId: "af-pleated-shorts" },
          { name: "Crew Socks (Gap)", productId: "gap-crew-socks" },
          { name: "Baseball Cap (Uniqlo)", productId: "uniqlo-crossbody-black" },
          { name: "9060 'Breakfast Tea'", productId: "nb-9060-breakfast-tea" },
        ],
        why: "Navy shorts break up the brown-and-cream palette without clashing, and crew socks keep it looking intentional, not gym-only.",
      },
      {
        name: "Dinner Terrace",
        when: "Dinner dates, evening drinks, rooftop evenings.",
        items: [
          { name: "Brown Knit Polo (Zara)", productId: "zara-knit-polo-brown" },
          { name: "Tailored Trousers, Black (Massimo Dutti)", productId: "md-black-trousers" },
          { name: "Leather Belt, Brown (Mango Man)", productId: "mango-belt-brown" },
          { name: "Minimal Watch (Mango Man)", productId: "minimal-watch" },
          { name: "9060 'Breakfast Tea'", productId: "nb-9060-breakfast-tea" },
        ],
        why: "Black trousers dress the polo up; the brown belt ties back to the shirt and shoe so the black doesn't feel disconnected.",
      },
      {
        name: "Weekend Market",
        when: "Weekend markets, city exploring, easy errands.",
        items: [
          { name: "Brown Knit Polo (Zara)", productId: "zara-knit-polo-brown" },
          { name: "Relaxed Jeans, Light Wash (Levi's)", productId: "levis-568-jeans" },
          { name: "Lightweight Overshirt, Beige (Gap)", productId: "gap-overshirt-beige" },
          { name: "Shopper Tote Bag (COS)", productId: "cos-tote-bag" },
          { name: "9060 'Breakfast Tea'", productId: "nb-9060-breakfast-tea" },
        ],
        why: "The beige overshirt layers over the polo for cooler days, and light denim keeps the whole outfit easygoing.",
      },
    ],
    styleNotes: [
      "Keep the palette warm — brown, cream, off-white, beige, and navy or black as the only cool notes.",
      "Use one brown accessory (belt, sunglasses) to tie the shoe back into darker outfits.",
      "The knit texture reads dressier than a plain tee — it can go from beach to dinner with the same top.",
      "Works best in summer, date night, travel, and campus outfits.",
    ],
    relatedProducts: [
      "nb-9060-breakfast-tea",
      "zara-knit-polo-brown",
      "hm-linen-shorts",
      "af-pleated-shorts",
      "cos-wide-leg-pants",
      "md-black-trousers",
      "levis-568-jeans",
      "gap-overshirt-beige",
      "uniqlo-crossbody-black",
      "cos-tote-bag",
      "mango-sunglasses",
      "mango-belt-brown",
      "gap-crew-socks",
      "minimal-watch",
    ],
    instagramUrl: "", // TODO: paste the Instagram post URL when published
    publishedDate: "2026-07-09",
    tags: ["Sneakers", "Summer", "Date night", "College", "Travel", "Everyday"],
    comingSoon: false,
  },

  {
    id: "barrel-pants-nb530",
    title: "How to Style Barrel Pants x New Balance 530 'Turtledove'",
    slug: "guide-barrel-pants-nb530.dc.html",
    productName: "New Balance 530 'Turtledove'",
    brand: "New Balance",
    colorway: "Turtledove",
    category: "Sneakers",
    verdict:
      "A quiet, neutral-toned staple that pairs with almost anything — barrel pants give it the volume to feel current without losing the shoe's easy, everyday character. Five outfits, one shoe, no repeats.",
    description:
      "5 outfits for Uniqlo Barrel Pants and the New Balance 530 'Turtledove': coastal, city minimal, prep, weekend, and coffee date.",
    coverImage: "assets/images/guides/barrel-pants-nb530-cover.png",
    slideImages: [
      { src: "assets/images/guides/barrel-pants-nb530/slide-01.png", label: "Cover" },
      { src: "assets/images/guides/barrel-pants-nb530/slide-02.png", label: "Coastal" },
      { src: "assets/images/guides/barrel-pants-nb530/slide-03.png", label: "City Minimal" },
      { src: "assets/images/guides/barrel-pants-nb530/slide-04.png", label: "Prep" },
      { src: "assets/images/guides/barrel-pants-nb530/slide-05.png", label: "Weekend" },
      { src: "assets/images/guides/barrel-pants-nb530/slide-06.png", label: "Coffee Date" },
      { src: "assets/images/guides/barrel-pants-nb530/slide-07.png", label: "Shop the Look" },
    ],
    outfitCount: 5,
    bestFor: "Everyday · Summer · College · Date night",
    outfits: [
      {
        name: "Coastal",
        when: "Beach days, boardwalk walks, warm-weather travel.",
        items: [
          { name: "AIRism Oversized T-Shirt, Gray (Uniqlo)", productId: "uniqlo-airism-tee-gray" },
          { name: "Barrel Pants, Cream (Uniqlo)", productId: "uniqlo-barrel-pants-cream" },
          { name: "Round Sunglasses", productId: "sunglasses-round" },
          { name: "New Balance 530 'Turtledove'", productId: "nb-530-turtledove" },
        ],
        why: "A relaxed, airy tee and cream barrel pants keep the whole outfit light and beach-ready; the sunglasses finish the coastal mood.",
      },
      {
        name: "City Minimal",
        when: "Everyday city errands, coffee runs, casual weekdays.",
        items: [
          { name: "Ivory Knit Polo", productId: "ivory-knit-polo" },
          { name: "Barrel Pants, Brown (Uniqlo)", productId: "uniqlo-barrel-pants-brown" },
          { name: "Leather Belt, Black", productId: "black-leather-belt" },
          { name: "New Balance 530 'Turtledove'", productId: "nb-530-turtledove" },
        ],
        why: "Ivory and brown share the same warm neutral palette as the shoe's Turtledove upper, so nothing fights for attention.",
      },
      {
        name: "Prep",
        when: "Campus days, casual Fridays, smart-casual hangouts.",
        items: [
          { name: "Light Blue Oxford Shirt", productId: "oxford-shirt" },
          { name: "Barrel Pants, Cream (Uniqlo)", productId: "uniqlo-barrel-pants-cream" },
          { name: "Neutral Cap", productId: "cap" },
          { name: "New Balance 530 'Turtledove'", productId: "nb-530-turtledove" },
        ],
        why: "An oxford dresses the barrel pants up just enough for campus or a casual office day without losing the sneaker-first feel.",
      },
      {
        name: "Weekend",
        when: "Weekend errands, brunch, easy hangouts.",
        items: [
          { name: "Lightweight Henley", productId: "lightweight-henley" },
          { name: "Barrel Pants, Brown (Uniqlo)", productId: "uniqlo-barrel-pants-brown" },
          { name: "Minimal Watch", productId: "minimal-watch" },
          { name: "New Balance 530 'Turtledove'", productId: "nb-530-turtledove" },
        ],
        why: "A henley is easy and unstructured, brown pants stay grounded, and the watch is the one considered detail that keeps it from looking sloppy.",
      },
      {
        name: "Coffee Date",
        when: "Coffee dates, casual dinners, low-key evenings.",
        items: [
          { name: "Hemp Cotton Blend Knit Polo, Brown (Zara)", productId: "zara-knit-polo-brown" },
          { name: "Barrel Pants, Cream (Uniqlo)", productId: "uniqlo-barrel-pants-cream" },
          { name: "Leather Belt, Brown (Mango Man)", productId: "mango-belt-brown" },
          { name: "New Balance 530 'Turtledove'", productId: "nb-530-turtledove" },
        ],
        why: "The knit texture reads a step dressier than a tee, and the brown belt ties back into both the polo and the shoe's warm tones.",
      },
    ],
    styleNotes: [
      "Keep the palette neutral — cream, brown, ivory, and gray work best with the Turtledove upper.",
      "Barrel pants add volume on the bottom — balance with a slim or regular top, not another oversized piece.",
      "A belt is doing real work here — brown or black both read fine against Turtledove, just match your other leather.",
      "Works best in everyday, summer, campus, and casual date outfits — skip anything suit-level formal.",
    ],
    relatedProducts: [
      "nb-530-turtledove",
      "uniqlo-barrel-pants-cream",
      "uniqlo-barrel-pants-brown",
      "uniqlo-airism-tee-gray",
      "ivory-knit-polo",
      "lightweight-henley",
      "black-leather-belt",
      "sunglasses-round",
      "oxford-shirt",
      "cap",
      "minimal-watch",
      "zara-knit-polo-brown",
      "mango-belt-brown",
    ],
    instagramUrl: "", // TODO: paste the Instagram post URL when published
    publishedDate: "2026-07-11",
    tags: ["Sneakers", "Everyday", "Summer", "College", "Date night"],
    comingSoon: false,
  },

  // ---- Upcoming guides (shown as "next up" cards; excluded from search) ----
  {
    id: "coming-soon-1",
    title: "Next guide in production",
    slug: "",
    productName: "TBD",
    brand: "",
    colorway: "",
    category: "Sneakers",
    description: "Follow on Instagram to see it first.",
    coverImage: "assets/images/guides/coming-soon-1.png",
    outfitCount: 0,
    bestFor: "",
    publishedDate: "",
    tags: [],
    comingSoon: true,
  },
];
