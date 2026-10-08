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
        address: "বাড়ি ১, রোড ৩, সেক্টর ৫৭, উত্তরা, ঢাকা",
        officeHours: "শনি থেকে বৃহস্পতিবার, সকাল ১০টা থেকে সন্ধ্যা ৬টা",
        phone: "01711-000057",
        email: "office@sector57society.org",
      },
      en: {
        address: "House 1, Road 3, Sector 57, Uttara, Dhaka",
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
          label: "উত্তরা সেক্টর ৫৭ কল্যাণ সমিতি",
          title: "নিরাপদ, পরিচ্ছন্ন ও সুশৃঙ্খল সেক্টর, প্রতিটি বাসিন্দার জন্য",
          lead: "খবর, নোটিশ, কমিটি, উন্নয়ন কাজ আর সদস্য সেবা, সেক্টর ৫৭-এর মানুষের জন্য এক জায়গায়।",
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
          label: "Uttara Sector 57 Welfare Society",
          title: "A safe, clean and well-run sector for every resident",
          lead: "News, notices, committee, development work and member services for the people of Sector 57, in one place.",
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
