// Public website content for the seed: the `home` and `site` pages (starting
// content the CMS edits later) and demo notices (development only).
// Page content shape: homeContentSchema / siteInfoSchema in @s57/shared.

const DAY = 24 * 60 * 60 * 1000;

export const SITE_PAGES = [
  {
    slug: "site",
    title_bn: "সাইটের তথ্য",
    title_en: "Site details",
    content: {
      bn: {
        address: "বাড়ি ১, রোড ৩, সেক্টর ১৫, উত্তরা, ঢাকা",
        officeHours: "শনি থেকে বৃহস্পতিবার, সকাল ১০টা থেকে সন্ধ্যা ৬টা",
        phone: "01711-000057",
        email: "office@sector57society.org",
      },
      en: {
        address: "House 1, Road 3, Sector 15, Uttara, Dhaka",
        officeHours: "Saturday to Thursday, 10am to 6pm",
        phone: "01711-000057",
        email: "office@sector57society.org",
      },
    },
  },
  {
    slug: "home",
    title_bn: "প্রথম পাতা",
    title_en: "Home",
    content: {
      bn: {
        hero: {
          label: "উত্তরা সেক্টর ১৫ কল্যাণ সমিতি",
          title: "নিরাপদ, পরিচ্ছন্ন ও সুশৃঙ্খল সেক্টর, প্রতিটি বাসিন্দার জন্য",
          lead: "খবর, নোটিশ, কমিটি, উন্নয়ন কাজ আর সদস্য সেবা, সেক্টর ১৫-এর মানুষের জন্য এক জায়গায়।",
        },
        stats: [
          { label: "ব্লক", value: "6" },
          { label: "রোড", value: "24" },
          { label: "প্লট", value: "412" },
          { label: "ফ্ল্যাট ও ইউনিট", value: "3,286" },
        ],
        events: [
          { date: "2026-12-21", title: "বার্ষিক সাধারণ সভা", place: "কমিউনিটি হল, বিকাল ৪টা" },
          { date: "2026-12-16", title: "বিজয় দিবস ক্রীড়া প্রতিযোগিতা", place: "কেন্দ্রীয় খেলার মাঠ, সকাল ৯টা" },
          { date: "2026-12-05", title: "বিনামূল্যে স্বাস্থ্য ক্যাম্প", place: "সমিতি ক্লিনিক, সকাল ১০টা" },
        ],
        developments: [
          { title: "ব্লক সি সড়ক সংস্কার", progress: 62 },
          { title: "সিসিটিভি দ্বিতীয় ধাপ", progress: 80 },
          { title: "কেন্দ্রীয় খেলার মাঠ সংস্কার", progress: 0 },
        ],
        emergency: [
          { label: "জাতীয় জরুরি সেবা", phone: "999", icon: "siren" },
          { label: "সমিতি অফিস", phone: "01711-000057", icon: "landmark" },
          { label: "নিরাপত্তা কন্ট্রোল রুম", phone: "01711-000058", icon: "shield-check" },
          { label: "সমিতি ক্লিনিক", phone: "01711-000059", icon: "stethoscope" },
        ],
      },
      en: {
        hero: {
          label: "Uttara Sector 15 Welfare Society",
          title: "A safe, clean and well-run sector for every resident",
          lead: "News, notices, committee, development work and member services for the people of Sector 15, in one place.",
        },
        stats: [
          { label: "Blocks", value: "6" },
          { label: "Roads", value: "24" },
          { label: "Plots", value: "412" },
          { label: "Flats and units", value: "3,286" },
        ],
        events: [
          { date: "2026-12-21", title: "Annual General Meeting", place: "Community hall, 4pm" },
          { date: "2026-12-16", title: "Victory Day sports", place: "Central playground, 9am" },
          { date: "2026-12-05", title: "Free health camp", place: "Society clinic, 10am" },
        ],
        developments: [
          { title: "Block C road resurfacing", progress: 62 },
          { title: "CCTV coverage phase 2", progress: 80 },
          { title: "Central playground renovation", progress: 0 },
        ],
        emergency: [
          { label: "National emergency", phone: "999", icon: "siren" },
          { label: "Society office", phone: "01711-000057", icon: "landmark" },
          { label: "Security control room", phone: "01711-000058", icon: "shield-check" },
          { label: "Society clinic", phone: "01711-000059", icon: "stethoscope" },
        ],
      },
    },
  },
];

/** Demo notices from the mockup, published 1 to 14 days before the seed runs. */
export function demoNotices(now = Date.now()) {
  return [
    {
      category: "billing",
      daysAgo: 1,
      title_bn: "নভেম্বর মাসের সার্ভিস চার্জের বিল প্রস্তুত",
      title_en: "Monthly service charge for November is now billed",
      body_bn: "সমিতি অফিসে (রোড ৩) শনি থেকে বৃহস্পতিবার, সকাল ১০টা থেকে সন্ধ্যা ৬টার মধ্যে নগদে পরিশোধ করুন।",
      body_en: "Pay in cash at the society office, Road 3, Saturday to Thursday, 10am to 6pm.",
    },
    {
      category: "maintenance",
      daysAgo: 3,
      title_bn: "৯ নভেম্বর রোড ৭-এর ড্রেন পরিষ্কার",
      title_en: "Road 7 drain cleaning on 9 November",
      body_bn: "সকাল ৮টা থেকে দুপুর ২টা পর্যন্ত রোড ৭-এ গাড়ি রাখবেন না।",
      body_en: "Please keep cars off Road 7 between 8am and 2pm.",
    },
    {
      category: "agm",
      daysAgo: 6,
      title_bn: "২১ ডিসেম্বর বার্ষিক সাধারণ সভা",
      title_en: "Annual General Meeting on 21 December",
      body_bn: "নিবন্ধিত সকল সদস্য আমন্ত্রিত। আলোচ্যসূচি ও বার্ষিক হিসাব সংযুক্ত।",
      body_en: "All registered members are invited. Agenda and annual statement attached.",
    },
    {
      category: "security",
      daysAgo: 10,
      title_bn: "ভাড়াটিয়া নিবন্ধন কার্যক্রম",
      title_en: "Renter registration drive",
      body_bn: "৩০ নভেম্বরের মধ্যে সকল ভাড়াটিয়াকে সমিতি অফিসে নিবন্ধন করতে হবে।",
      body_en: "All renters must register with the society office by 30 November.",
    },
    {
      category: "development",
      daysAgo: 14,
      title_bn: "সব ব্লকের প্রবেশপথে নতুন সিসিটিভি ক্যামেরা",
      title_en: "New CCTV cameras at all block entrances",
      body_bn: "নিরাপত্তা প্রকল্পের আওতায় ২৪টি ক্যামেরা বসানো হয়েছে।",
      body_en: "24 cameras installed under the safety project.",
    },
  ].map(({ daysAgo, ...notice }) => ({ ...notice, is_public: true, publish_at: new Date(now - daysAgo * DAY) }));
}

/** Demo managing committee from the mockup (persons carry no phone, NID or other private data). */
export const DEMO_COMMITTEE = {
  term_start: new Date("2025-01-01T00:00:00Z"),
  term_end: new Date("2027-12-31T00:00:00Z"),
  members: [
    { full_name: "মোঃ রফিকুল ইসলাম", full_name_en: "Md. Rafiqul Islam", position: "president" },
    { full_name: "শাহানা আক্তার", full_name_en: "Shahana Akter", position: "vice_president" },
    { full_name: "কামরুল হাসান", full_name_en: "Kamrul Hasan", position: "general_secretary" },
    { full_name: "তানভীর আহমেদ", full_name_en: "Tanvir Ahmed", position: "joint_secretary" },
    { full_name: "নাসরিন সুলতানা", full_name_en: "Nasrin Sultana", position: "treasurer" },
    { full_name: "আব্দুল করিম", full_name_en: "Abdul Karim", position: "organizing_secretary" },
    { full_name: "ফারহানা রহমান", full_name_en: "Farhana Rahman", position: "cultural_secretary" },
    { full_name: "মিজানুর রহমান", full_name_en: "Mizanur Rahman", position: "executive_member" },
  ],
};

/** Demo `developments` page (shape: developmentsContentSchema). Budget figures are illustrative. */
export const DEMO_DEVELOPMENTS_PAGE = {
  slug: "developments",
  title_bn: "উন্নয়ন প্রকল্প",
  title_en: "Development projects",
  content: {
    projects: [
      {
        titleBn: "ব্লক সি সড়ক সংস্কার",
        titleEn: "Block C road resurfacing",
        descriptionBn: "রোড ৯ থেকে রোড ১২, ১.৪ কিমি",
        descriptionEn: "Road 9 to Road 12, 1.4 km",
        status: "in_progress",
        progress: 62,
        budget: "4800000",
        spent: "2970000",
        art: "road",
      },
      {
        titleBn: "সিসিটিভি দ্বিতীয় ধাপ",
        titleEn: "CCTV coverage phase 2",
        descriptionBn: "সড়ক সংযোগস্থলে আরও ১৮টি ক্যামেরা",
        descriptionEn: "18 more cameras at road junctions",
        status: "in_progress",
        progress: 80,
        budget: "1250000",
        spent: "1000000",
        art: "cctv",
      },
      {
        titleBn: "কেন্দ্রীয় খেলার মাঠ সংস্কার",
        titleEn: "Central playground renovation",
        descriptionBn: "হাঁটার পথ, বাতি ও বসার ব্যবস্থা",
        descriptionEn: "Walking track, lights and seating",
        status: "planned",
        progress: 0,
        budget: "2200000",
        spent: "0",
        art: "field",
      },
      {
        titleBn: "বৃষ্টির পানি নিষ্কাশন, ব্লক এ",
        titleEn: "Rainwater drainage, Block A",
        descriptionBn: "আগস্ট ২০২৬-এ শেষ হয়েছে",
        descriptionEn: "Finished August 2026",
        status: "completed",
        progress: 100,
        budget: "3600000",
        spent: "3480000",
        art: "drain",
      },
    ],
  },
};

/** Demo gallery albums. Photo keys are placeholders: no file exists, so the site draws illustrations. */
export const DEMO_ALBUMS = [
  { title_bn: "পহেলা বৈশাখ ১৪৩৩", title_en: "Pohela Boishakh 1433", event_date: "2026-04-14", photos: 9 },
  { title_bn: "বিজয় দিবস ক্রীড়া ২০২৫", title_en: "Victory Day sports 2025", event_date: "2025-12-16", photos: 8 },
  { title_bn: "বার্ষিক সাধারণ সভা ২০২৪", title_en: "AGM 2024", event_date: "2024-12-14", photos: 5 },
  { title_bn: "বৃক্ষরোপণ, রোড ৫", title_en: "Tree plantation, Road 5", event_date: "2025-07-05", photos: 6 },
  { title_bn: "কেন্দ্রীয় ঈদগাহে ঈদের জামাত", title_en: "Eid jamaat at the central eidgah", event_date: "2026-03-21", photos: 7 },
  { title_bn: "শিশুদের চিত্রাঙ্কন প্রতিযোগিতা", title_en: "Children's art competition", event_date: "2026-02-21", photos: 8 },
].map((album, index) => ({
  title_bn: album.title_bn,
  title_en: album.title_en,
  event_date: new Date(`${album.event_date}T00:00:00Z`),
  is_published: true,
  photos: Array.from({ length: album.photos }, (_, n) => ({
    file_url: `demo/gallery/${index + 1}-${n + 1}.jpg`,
    sort_order: n,
  })),
}));
