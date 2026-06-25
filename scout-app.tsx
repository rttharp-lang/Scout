import React, { useState } from "react";
import { Star, Clock, MapPin, Check, CheckCircle, ArrowLeft, Calendar, Navigation, Car, Utensils, Mail, Share2, Printer, ExternalLink, Plus, Minus, Trash2, X, Search, Lock, ChevronLeft, ChevronRight, Pencil } from "lucide-react";

// ── Tokens ─────────────────────────────────────────────────────
const SANS = { fontFamily: "'Helvetica Neue', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif" };
const INK = "#222222";
const MUTE = "#717171";
const LINE = "#EBEBEB";
const ACCENT = "#E1565C";
const ACCENT_SOFT = "#FDEEEF";
const OPEN = "#1A8A52";
const DANGER = "#C0392B";
const CARD_SHADOW = "0 6px 18px rgba(0,0,0,0.07)";

const TIERS = {
  aspirational: { label: "Aspirational", desc: "Luxury & designer — construction, theater, top of range", chip: ["#8A6D3B", "#F3ECDD"], grad: "linear-gradient(135deg,#3a342b,#8a7a5e)" },
  competitor:   { label: "Competitor", desc: "Athletic & adjacent — adidas, On, Arc'teryx, Lululemon", chip: ["#2F5D8A", "#E6EEF6"], grad: "linear-gradient(135deg,#2d4a63,#6d93ad)" },
  core:         { label: "Core", desc: "Commercial & streetwear — value, fabric, where scale lands", chip: ["#B0472F", "#FBEAE3"], grad: "linear-gradient(135deg,#a8431f,#d98a55)" },
  culture:      { label: "Culture", desc: "Lifestyle & retail-as-culture", chip: ["#3C6E63", "#E4EFEB"], grad: "linear-gradient(135deg,#2c4a42,#6f9488)" },
};
const ADDED_TIER = { label: "Your find", chip: ["#5A4FB0", "#ECEAFB"], grad: "linear-gradient(135deg,#4a4490,#8a82c8)" };
const CITIES = ["Tokyo", "New York", "Shanghai", "Paris", "London"];

const mapsUrl = (name, address) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name + ", " + address)}`;
const uberUrl = (name, address) => `https://m.uber.com/ul/?action=setPickup&pickup=my_location&dropoff[formatted_address]=${encodeURIComponent(address)}&dropoff[nickname]=${encodeURIComponent(name)}`;
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-");

const Storefront = () => (
  <svg viewBox="0 0 64 48" width="44" height="44" style={{ opacity: 0.85 }}>
    <g fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 20 L12 12 H52 L56 20" /><path d="M8 20 H56 V42 H8 Z" /><path d="M8 20 q4 5 8 0 q4 5 8 0 q4 5 8 0 q4 5 8 0 q4 5 8 0 q4 5 8 0" /><path d="M26 42 V30 H38 V42" />
    </g>
  </svg>
);

// ── Day data ───────────────────────────────────────────────────
const DAY1_HUBS = [
  { hub: "Ginza", time: "~2 hr 40 min", arrive: "Start here", stops: [
    { name: "Dover Street Market Ginza", tier: "aspirational", rating: 4.4, reviews: 1820, hours: "11:00–20:00", dwell: 20, address: "6-9-5 Ginza, Chuo City, Tokyo", why: "How avant-garde curation stages emerging designers, floor by floor." },
    { name: "Gucci Ginza Flagship", tier: "aspirational", rating: 4.3, reviews: 940, hours: "11:00–20:00", dwell: 18, address: "7-8-3 Ginza, Chuo City, Tokyo", why: "Leather construction and price-architecture cues at the top." },
    { name: "Hermès Ginza (Maison)", tier: "aspirational", rating: 4.5, reviews: 1120, hours: "11:00–19:00", dwell: 15, address: "5-4-1 Ginza, Chuo City, Tokyo", why: "Quiet-luxury materials and finishing benchmark." },
    { name: "Loewe Ginza Six", tier: "aspirational", rating: 4.4, reviews: 610, hours: "10:30–20:30", dwell: 15, address: "6-10-1 Ginza, Chuo City, Tokyo", why: "Craft-led leather and a sharp creative-direction read." },
    { name: "Lululemon Ginza", tier: "competitor", rating: 4.2, reviews: 880, hours: "11:00–21:00", dwell: 18, address: "3-3-1 Ginza, Chuo City, Tokyo", why: "How a premium athletic brand merchandises fabric and fit." },
    { name: "UNIQLO Ginza (Global Flagship)", tier: "core", rating: 4.3, reviews: 5400, hours: "11:00–21:00", dwell: 20, address: "5-7-7 Ginza, Chuo City, Tokyo", why: "12 floors of value engineering — core quality at an accessible price." },
    { name: "GU Ginza", tier: "core", rating: 4.1, reviews: 2100, hours: "11:00–21:00", dwell: 15, address: "5-7-7 Ginza, Chuo City, Tokyo", why: "Fast-fashion sister brand — how trend lands cheaper and quicker." },
    { name: "Muji Ginza Flagship", tier: "core", rating: 4.4, reviews: 3300, hours: "11:00–21:00", dwell: 18, address: "3-3-5 Ginza, Chuo City, Tokyo", why: "Lifestyle-as-product — restraint, material honesty, system design." },
  ]},
  { hub: "Omotesando & Harajuku", time: "~2 hr 30 min", arrive: "Uber from Ginza · ~14 min", stops: [
    { name: "Comme des Garçons Aoyama", tier: "aspirational", rating: 4.5, reviews: 720, hours: "11:00–20:00", dwell: 18, address: "5-2-1 Minami-Aoyama, Minato City, Tokyo", why: "Silhouette risk and pattern-cutting — where ideas start." },
    { name: "Prada Aoyama", tier: "aspirational", rating: 4.6, reviews: 1500, hours: "11:00–20:00", dwell: 15, address: "5-2-6 Minami-Aoyama, Minato City, Tokyo", why: "Architecture as brand thesis; the building sells the clothes." },
    { name: "Celine Omotesando", tier: "aspirational", rating: 4.4, reviews: 430, hours: "11:00–20:00", dwell: 15, address: "5-6-12 Jingumae, Shibuya City, Tokyo", why: "Minimal luxury styling language at full price." },
    { name: "adidas Originals Flagship", tier: "competitor", rating: 4.3, reviews: 990, hours: "11:00–20:00", dwell: 18, address: "4-26-18 Jingumae, Shibuya City, Tokyo", why: "Direct competitor — how heritage gets restyled for street." },
    { name: "New Balance Harajuku", tier: "competitor", rating: 4.4, reviews: 760, hours: "11:00–20:00", dwell: 15, address: "6-15-5 Jingumae, Shibuya City, Tokyo", why: "Quiet-momentum competitor — premium-casual crossover read." },
    { name: "BAPE Busy Work Shop", tier: "core", rating: 4.2, reviews: 1340, hours: "11:00–19:00", dwell: 15, address: "4-21-5 Jingumae, Shibuya City, Tokyo", why: "Drop cadence and graphic language that sets street tempo." },
    { name: "Supreme Harajuku", tier: "core", rating: 4.1, reviews: 2200, hours: "11:00–20:00", dwell: 15, address: "4-32-7 Jingumae, Shibuya City, Tokyo", why: "Hype mechanics and scarcity merchandising up close." },
    { name: "Stüssy Harajuku Chapter", tier: "core", rating: 4.3, reviews: 680, hours: "11:00–20:00", dwell: 15, address: "4-28-2 Jingumae, Shibuya City, Tokyo", why: "Foundational streetwear — how the original still reads now." },
  ]},
  { hub: "Shibuya", time: "~2 hr 15 min", arrive: "Uber from Harajuku · ~9 min", stops: [
    { name: "Shibuya PARCO (GR8)", tier: "aspirational", rating: 4.4, reviews: 4100, hours: "11:00–21:00", dwell: 25, address: "15-1 Udagawacho, Shibuya City, Tokyo", why: "Multi-brand hype curation — what sharp buyers are betting on." },
    { name: "On Tokyo", tier: "competitor", rating: 4.5, reviews: 540, hours: "11:00–21:00", dwell: 18, address: "16-8 Udagawacho, Shibuya City, Tokyo", why: "Fastest-rising competitor — story-led performance retail." },
    { name: "Arc'teryx Shibuya", tier: "competitor", rating: 4.4, reviews: 470, hours: "11:00–21:00", dwell: 15, address: "11-6 Udagawacho, Shibuya City, Tokyo", why: "Technical-luxe crossover — construction at a premium price." },
    { name: "Beams Shibuya", tier: "core", rating: 4.3, reviews: 1260, hours: "11:00–20:00", dwell: 18, address: "31-2 Udagawacho, Shibuya City, Tokyo", why: "Japanese multi-brand taste-making — curation and house product." },
    { name: "United Arrows Shibuya", tier: "core", rating: 4.2, reviews: 980, hours: "11:00–20:00", dwell: 15, address: "3-28-1 Jingumae, Shibuya City, Tokyo", why: "Elevated commercial styling — bridge between core and premium." },
    { name: "UNIQLO Shibuya", tier: "core", rating: 4.3, reviews: 3900, hours: "11:00–21:00", dwell: 15, address: "21-1 Udagawacho, Shibuya City, Tokyo", why: "Scale execution — full range merchandised by the value leader." },
  ]},
];

const DAY2_HUBS = [
  { hub: "Daikanyama", time: "~2 hr", arrive: "Start here", stops: [
    { name: "A.P.C. Daikanyama", tier: "core", rating: 4.3, reviews: 320, hours: "11:00–20:00", dwell: 16, address: "11-9 Sarugakucho, Shibuya City, Tokyo", why: "French essentials benchmark — minimal design, consistent fabric quality." },
    { name: "Daikanyama T-Site (Tsutaya Books)", tier: "culture", rating: 4.5, reviews: 9200, hours: "07:00–22:00", dwell: 20, address: "17-5 Sarugakucho, Shibuya City, Tokyo", why: "Lifestyle-retail landmark — how books, music and café build a destination." },
    { name: "Okura", tier: "core", rating: 4.3, reviews: 410, hours: "11:00–20:00", dwell: 15, address: "20-11 Sarugakucho, Shibuya City, Tokyo", why: "All-indigo Japanese craft — dyeing technique and heritage storytelling." },
    { name: "Maison Kitsuné Daikanyama", tier: "aspirational", rating: 4.3, reviews: 280, hours: "11:00–20:00", dwell: 15, address: "16-8 Sarugakucho, Shibuya City, Tokyo", why: "Elevated basics and a tight lifestyle world; Paris–Tokyo crossover." },
    { name: "Bonjour Records", tier: "culture", rating: 4.2, reviews: 360, hours: "11:00–20:00", dwell: 12, address: "24-1 Sarugakucho, Shibuya City, Tokyo", why: "Music-led boutique — culture-first retail and graphic merch." },
  ]},
  { hub: "Nakameguro", time: "~1 hr 50 min", arrive: "Uber from Daikanyama · ~8 min", stops: [
    { name: "visvim F.I.L. Tokyo", tier: "aspirational", rating: 4.4, reviews: 240, hours: "12:00–20:00", dwell: 18, address: "1-7-9 Kamimeguro, Meguro City, Tokyo", why: "Craft Americana at the top of the range — a materials and construction study." },
    { name: "1LDK Nakameguro", tier: "core", rating: 4.4, reviews: 300, hours: "12:00–20:00", dwell: 15, address: "1-8-28 Kamimeguro, Meguro City, Tokyo", why: "Tight multi-brand curation — the editor's eye on contemporary menswear." },
    { name: "Vase Nakameguro", tier: "core", rating: 4.3, reviews: 180, hours: "12:00–20:00", dwell: 12, address: "3-8-3 Kamimeguro, Meguro City, Tokyo", why: "Concept boutique mixing fashion and objects — a true IYKYK read." },
    { name: "COW BOOKS Nakameguro", tier: "culture", rating: 4.4, reviews: 520, hours: "12:00–20:00", dwell: 12, address: "1-14-11 Aobadai, Meguro City, Tokyo", why: "Cult canal-side bookshop — slow retail with a strong point of view." },
  ]},
  { hub: "Shinjuku", time: "~2 hr 20 min", arrive: "Uber from Nakameguro · ~16 min", stops: [
    { name: "Isetan Shinjuku", tier: "aspirational", rating: 4.4, reviews: 12000, hours: "10:00–20:00", dwell: 25, address: "3-14-1 Shinjuku, Shinjuku City, Tokyo", why: "Japan's benchmark department store — curation, depachika and merchandising mastery." },
    { name: "Beams Japan Shinjuku", tier: "core", rating: 4.4, reviews: 1600, hours: "11:00–20:00", dwell: 18, address: "3-32-6 Shinjuku, Shinjuku City, Tokyo", why: "Beams' culture flagship — Japanese craft, collabs and local design." },
    { name: "NEWoMan Shinjuku", tier: "culture", rating: 4.3, reviews: 4200, hours: "11:00–21:00", dwell: 18, address: "4-1-6 Shinjuku, Shinjuku City, Tokyo", why: "Station retail done well — premium commercial mix for a discerning shopper." },
    { name: "UNIQLO Shinjuku", tier: "core", rating: 4.2, reviews: 3100, hours: "11:00–21:00", dwell: 15, address: "3-17-1 Shinjuku, Shinjuku City, Tokyo", why: "Another scale read — compare execution against the Ginza flagship." },
  ]},
];

const DAY1_LUNCH = [
  { name: "Maisen Aoyama", cuisine: "Tonkatsu", rating: 4.3, reviews: 8900, hours: "11:00–22:00", address: "4-8-5 Jingumae, Shibuya City, Tokyo", why: "Converted bathhouse, fast turnover. Iconic and genuinely good midday." },
  { name: "Afuri Harajuku", cuisine: "Yuzu ramen", rating: 4.1, reviews: 3400, hours: "11:00–23:00", address: "1-1-7 Jinnan, Shibuya City, Tokyo", why: "Light, citrusy, fast. Ticket machine — easy even at peak." },
  { name: "Sakura-tei", cuisine: "Okonomiyaki", rating: 4.2, reviews: 2100, hours: "11:00–22:00", address: "3-20-1 Jingumae, Shibuya City, Tokyo", why: "Cook-your-own, social, near the galleries. Fun group stop." },
  { name: "d47 Shokudo", cuisine: "Regional Japanese", rating: 4.3, reviews: 1900, hours: "11:30–20:00", address: "Shibuya Hikarie 8F, 2-21-1 Shibuya, Tokyo", why: "Design-led canteen spotlighting a different prefecture — a cultural read over lunch." },
];
const DAY1_LUNCH_SEARCH = [
  ...DAY1_LUNCH,
  { name: "Curry Up", cuisine: "Spiced curry", rating: 4.2, reviews: 900, hours: "11:00–21:00", address: "4-26-18 Jingumae, Shibuya City, Tokyo", why: "Streetwear-world curry shop — an insider spot that sparks a team conversation." },
  { name: "Koffee Mameya Kakeru", cuisine: "Coffee course", rating: 4.5, reviews: 760, hours: "10:00–18:00", address: "4-15-3 Jingumae, Shibuya City, Tokyo", why: "Omakase-style coffee experience — memorable, not just a refuel." },
  { name: "Commune Omotesando", cuisine: "Open-air market", rating: 4.2, reviews: 2600, hours: "11:00–22:00", address: "3-13 Minami-Aoyama, Minato City, Tokyo", why: "Outdoor stalls and shared tables — relaxed and social for a team." },
  { name: "Uobei Shibuya", cuisine: "Conveyor sushi", rating: 4.2, reviews: 4300, hours: "11:00–23:00", address: "2-29-11 Dogenzaka, Shibuya City, Tokyo", why: "High-speed touchscreen sushi — fun, fast, cheap. Team energy in 40 min." },
];
const DAY1_ADD = [
  { name: "Kapital Legpie", area: "Omotesando & Harajuku", tier: "core", rating: 4.4, reviews: 540, hours: "11:00–20:00", dwell: 18, address: "5-2-2 Jingumae, Shibuya City, Tokyo", why: "Boro, indigo and finishing detail — craft technique at the high end of street." },
  { name: "Human Made Harajuku", area: "Omotesando & Harajuku", tier: "core", rating: 4.3, reviews: 1100, hours: "11:00–19:00", dwell: 15, address: "2-6-6 Jingumae, Shibuya City, Tokyo", why: "Nigo's graphic-led label — heritage Americana for the hype audience." },
  { name: "Maison Kitsuné Aoyama", area: "Omotesando & Harajuku", tier: "aspirational", rating: 4.3, reviews: 460, hours: "11:00–20:00", dwell: 15, address: "3-15-2 Minami-Aoyama, Minato City, Tokyo", why: "Paris–Tokyo bridge brand — elevated basics and a strong lifestyle world." },
  { name: "Bottega Veneta Ginza", area: "Ginza", tier: "aspirational", rating: 4.5, reviews: 410, hours: "11:00–20:00", dwell: 15, address: "6-8-7 Ginza, Chuo City, Tokyo", why: "Intrecciato leatherwork and quiet-luxury direction at the top tier." },
  { name: "Onitsuka Tiger Ginza", area: "Ginza", tier: "competitor", rating: 4.4, reviews: 880, hours: "11:00–20:00", dwell: 15, address: "4-3-1 Ginza, Chuo City, Tokyo", why: "Asics' heritage line — retro athletic styling and price positioning." },
  { name: "Patagonia Shibuya", area: "Shibuya", tier: "competitor", rating: 4.4, reviews: 620, hours: "11:00–20:00", dwell: 15, address: "11-1 Udagawacho, Shibuya City, Tokyo", why: "Values-led outdoor competitor — sustainability messaging in practice." },
  { name: "Salomon Tokyo", area: "Shibuya", tier: "competitor", rating: 4.3, reviews: 210, hours: "11:00–21:00", dwell: 15, address: "13-17 Udagawacho, Shibuya City, Tokyo", why: "Trail-to-street crossover — the silhouette everyone's chasing." },
];

const DAY2_LUNCH = [
  { name: "Onibus Coffee Nakameguro", cuisine: "Specialty coffee", rating: 4.5, reviews: 1900, hours: "09:00–18:00", address: "2-14-1 Kamimeguro, Meguro City, Tokyo", why: "Tiny roaster over the train tracks — a proper coffee moment between stops." },
  { name: "Higashi-Yama Tokyo", cuisine: "Modern Japanese", rating: 4.4, reviews: 2100, hours: "11:30–14:00", address: "1-21-25 Higashiyama, Meguro City, Tokyo", why: "Design-forward Japanese set lunch — a quietly special team meal." },
  { name: "Sidewalk Stand Nakameguro", cuisine: "Café / brunch", rating: 4.3, reviews: 1200, hours: "08:00–22:00", address: "1-23-14 Aobadai, Meguro City, Tokyo", why: "Canal-side, relaxed, all-day. Easy place to regroup as a team." },
  { name: "Saigon Shinjuku", cuisine: "Vietnamese", rating: 4.2, reviews: 800, hours: "11:00–22:00", address: "3-2-4 Shinjuku, Shinjuku City, Tokyo", why: "Fresh, fast, shareable — good energy before the afternoon push." },
];
const DAY2_LUNCH_SEARCH = [
  ...DAY2_LUNCH,
  { name: "Bricolage Bread & Co.", cuisine: "Bakery / bistro", rating: 4.3, reviews: 1500, hours: "08:00–18:00", address: "6-15-1 Roppongi, Minato City, Tokyo", why: "Bakery-bistro from a Michelin team — a step up from a quick sandwich." },
  { name: "Tsukemen Gonokami Seisakusho", cuisine: "Ramen", rating: 4.4, reviews: 2600, hours: "11:00–22:00", address: "4-3-15 Shinjuku, Shinjuku City, Tokyo", why: "Prawn-broth dipping noodles — a cult bowl worth the small queue." },
  { name: "Blacows Ebisu", cuisine: "Wagyu burgers", rating: 4.3, reviews: 1700, hours: "11:30–22:00", address: "1-8-19 Ebisu-Nishi, Shibuya City, Tokyo", why: "Wagyu burgers — an easy, crowd-pleasing midday with real quality." },
];
const DAY2_ADD = [
  { name: "Fog Linen Work", area: "Daikanyama", tier: "core", rating: 4.4, reviews: 210, hours: "11:00–19:00", dwell: 12, address: "2-1-3 Aobadai, Meguro City, Tokyo", why: "Linen-focused lifestyle label — texture and everyday-luxury positioning." },
  { name: "TENOHA Daikanyama", area: "Daikanyama", tier: "culture", rating: 4.2, reviews: 600, hours: "10:00–20:00", dwell: 15, address: "20-23 Daikanyamacho, Shibuya City, Tokyo", why: "Lifestyle concept space — retail-as-experience." },
  { name: "Vendor Nakameguro", area: "Nakameguro", tier: "core", rating: 4.3, reviews: 260, hours: "12:00–20:00", dwell: 15, address: "1-10-23 Kamimeguro, Meguro City, Tokyo", why: "Refined Japanese contemporary menswear — fabric and silhouette." },
  { name: "Isetan Men's Shinjuku", area: "Shinjuku", tier: "aspirational", rating: 4.5, reviews: 3000, hours: "10:00–20:00", dwell: 22, address: "3-14-1 Shinjuku, Shinjuku City, Tokyo", why: "One of the best curated menswear floors anywhere." },
];

const DAYS = [
  { label: "Ginza → Harajuku → Shibuya", hubs: DAY1_HUBS, lunchPicks: DAY1_LUNCH, lunchSearch: DAY1_LUNCH_SEARCH, addCandidates: DAY1_ADD },
  { label: "Daikanyama → Nakameguro → Shinjuku", hubs: DAY2_HUBS, lunchPicks: DAY2_LUNCH, lunchSearch: DAY2_LUNCH_SEARCH, addCandidates: DAY2_ADD },
];

// ── Shared bits ────────────────────────────────────────────────
function Rating({ rating, reviews, href }) {
  if (rating == null) return <span style={{ fontSize: 12, fontWeight: 600, color: ADDED_TIER.chip[0] }}>New find</span>;
  const inner = (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
      <Star size={13} color={INK} fill={INK} /><span style={{ fontSize: 13.5, fontWeight: 600, color: INK }}>{rating}</span>
      {reviews != null && <span style={{ fontSize: 12.5, color: MUTE }}>({reviews.toLocaleString()})</span>}
    </span>
  );
  return href ? <a href={href} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>{inner}</a> : inner;
}
function ActionRow({ name, address }) {
  const pill = { ...SANS, display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12.5, fontWeight: 600, textDecoration: "none", borderRadius: 999, padding: "7px 12px", border: `1px solid ${LINE}` };
  return (
    <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
      <a href={uberUrl(name, address)} target="_blank" rel="noreferrer" style={{ ...pill, background: INK, color: "#fff", border: `1px solid ${INK}` }}><Car size={13} /> Uber here</a>
      <a href={mapsUrl(name, address)} target="_blank" rel="noreferrer" style={{ ...pill, background: "#fff", color: INK }}><Navigation size={13} /> Directions</a>
    </div>
  );
}
function AddressLine({ name, address }) {
  return (
    <a href={mapsUrl(name, address)} target="_blank" rel="noreferrer" style={{ display: "flex", alignItems: "flex-start", gap: 5, marginTop: 9, textDecoration: "none", color: MUTE }}>
      <MapPin size={13} style={{ marginTop: 1, flexShrink: 0 }} /><span style={{ fontSize: 12.5, lineHeight: 1.35, userSelect: "text" }}>{address}</span>
    </a>
  );
}
const tierColor = (s) => (s.addedByUser && !s.tier ? ADDED_TIER.chip[0] : (TIERS[s.tier] ? TIERS[s.tier].chip[0] : ADDED_TIER.chip[0]));

function StopCard({ s, n, onConfirm, onRemove }) {
  const t = TIERS[s.tier] || ADDED_TIER;
  const editBtn = { ...SANS, cursor: "pointer", background: "none", border: "none", fontSize: 13, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 5, padding: "2px 2px" };
  return (
    <div style={{ border: `1px solid ${s.confirmed ? OPEN : LINE}`, borderRadius: 16, overflow: "hidden", background: "#fff", boxShadow: CARD_SHADOW }}>
      <div style={{ position: "relative", height: 110, background: t.grad, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Storefront />
        <div style={{ position: "absolute", top: 10, left: 10, background: "rgba(255,255,255,0.92)", color: INK, fontSize: 11, fontWeight: 700, borderRadius: 999, width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center" }}>{n}</div>
        <div style={{ position: "absolute", top: 10, right: 10, background: t.chip[1], color: t.chip[0], fontSize: 11, fontWeight: 600, borderRadius: 999, padding: "4px 10px" }}>{t.label}</div>
        {s.addedByUser && <div style={{ position: "absolute", bottom: 10, left: 10, background: "rgba(255,255,255,0.92)", color: ADDED_TIER.chip[0], fontSize: 10.5, fontWeight: 700, borderRadius: 999, padding: "4px 9px" }}>Your find</div>}
        {s.confirmed && <div style={{ position: "absolute", bottom: 10, right: 10, background: OPEN, color: "#fff", fontSize: 11, fontWeight: 700, borderRadius: 999, padding: "4px 10px", display: "flex", alignItems: "center", gap: 4 }}><Check size={12} /> Going</div>}
      </div>
      <div style={{ padding: "12px 14px 12px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
          <div style={{ fontSize: 15.5, fontWeight: 600, lineHeight: 1.25 }}>{s.name}</div>
          <Rating rating={s.rating} reviews={s.reviews} href={mapsUrl(s.name, s.address)} />
        </div>
        <div style={{ display: "flex", gap: 14, marginTop: 8, flexWrap: "wrap", fontSize: 12.5, color: MUTE }}>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}><Clock size={12.5} /> {s.hours ? <><span style={{ color: OPEN, fontWeight: 600 }}>Open</span> · {s.hours}</> : "Hours — tap Directions"}</span>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}><MapPin size={12.5} /> ~{s.dwell} min stop</span>
        </div>
        <div style={{ fontSize: 13.5, color: "#3a3a3a", marginTop: 9, lineHeight: 1.45 }}>{s.why}</div>
        <AddressLine name={s.name} address={s.address} />
        <ActionRow name={s.name} address={s.address} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12, paddingTop: 10, borderTop: `1px solid ${LINE}` }}>
          <button onClick={onConfirm} style={{ ...editBtn, color: s.confirmed ? OPEN : MUTE }}>{s.confirmed ? <CheckCircle size={15} /> : <Check size={15} />} {s.confirmed ? "Going" : "Confirm I'm going"}</button>
          <button onClick={onRemove} style={{ ...editBtn, color: DANGER }}><Trash2 size={14} /> Remove</button>
        </div>
      </div>
    </div>
  );
}

function LunchCard({ l, onSelect }) {
  return (
    <div style={{ border: `1px solid ${LINE}`, borderRadius: 16, overflow: "hidden", background: "#fff", boxShadow: CARD_SHADOW }}>
      <div style={{ position: "relative", height: 110, background: "linear-gradient(135deg,#7a5230,#caa46a)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Utensils size={34} color="#fff" style={{ opacity: 0.9 }} />
        <div style={{ position: "absolute", top: 10, right: 10, background: "rgba(255,255,255,0.92)", color: "#7a5230", fontSize: 11, fontWeight: 600, borderRadius: 999, padding: "4px 10px" }}>{l.cuisine}</div>
      </div>
      <div style={{ padding: "12px 14px 14px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
          <div style={{ fontSize: 15.5, fontWeight: 600 }}>{l.name}</div>
          <Rating rating={l.rating} reviews={l.reviews} href={mapsUrl(l.name, l.address)} />
        </div>
        <div style={{ display: "flex", gap: 14, marginTop: 8, fontSize: 12.5, color: MUTE, flexWrap: "wrap" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}><Clock size={12.5} /> <span style={{ color: OPEN, fontWeight: 600 }}>Open</span> · {l.hours}</span>
          <a href={mapsUrl(l.name, l.address)} target="_blank" rel="noreferrer" style={{ display: "flex", alignItems: "center", gap: 4, color: ACCENT, textDecoration: "none", fontWeight: 600 }}><ExternalLink size={12.5} /> Reviews</a>
        </div>
        <div style={{ fontSize: 13.5, color: "#3a3a3a", marginTop: 9, lineHeight: 1.45 }}>{l.why}</div>
        <AddressLine name={l.name} address={l.address} />
        <button onClick={() => onSelect(l)} style={{ ...SANS, cursor: "pointer", width: "100%", marginTop: 12, background: ACCENT, color: "#fff", border: "none", borderRadius: 11, padding: "12px", fontSize: 14.5, fontWeight: 600 }}>Select this spot</button>
      </div>
    </div>
  );
}

function SearchSelect({ candidates, onPick, onClose, title, placeholder, note }) {
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();
  const matches = query.length >= 2 ? candidates.filter((c) => c.name.toLowerCase().includes(query)).slice(0, 6) : [];
  const inp = { ...SANS, width: "100%", border: "none", outline: "none", fontSize: 16, color: INK, background: "transparent" };
  return (
    <div style={{ border: `1px solid ${LINE}`, borderRadius: 16, background: "#fff", boxShadow: CARD_SHADOW, padding: 16, marginTop: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontSize: 15.5, fontWeight: 700 }}>{title}</div>
        <button onClick={onClose} style={{ ...SANS, cursor: "pointer", background: "none", border: "none", color: MUTE }}><X size={18} /></button>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, border: `1px solid ${LINE}`, borderRadius: 10, padding: "11px 12px" }}>
        <Search size={17} color={MUTE} /><input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} style={inp} />
      </div>
      {matches.length > 0 && (
        <div style={{ border: `1px solid ${LINE}`, borderRadius: 12, marginTop: 8, overflow: "hidden" }}>
          {matches.map((c, i) => (
            <button key={c.name} onClick={() => onPick(c)} style={{ ...SANS, cursor: "pointer", width: "100%", textAlign: "left", background: "#fff", border: "none", borderTop: i ? `1px solid ${LINE}` : "none", padding: "11px 12px", display: "flex", alignItems: "center", gap: 10 }}>
              <MapPin size={16} color={ACCENT} style={{ flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14.5, fontWeight: 600, color: INK }}>{c.name}</div>
                <div style={{ fontSize: 12, color: MUTE, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.cuisine ? c.cuisine + " · " : ""}{c.address}</div>
              </div>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 3, flexShrink: 0 }}><Star size={12} color={INK} fill={INK} /><span style={{ fontSize: 12.5, fontWeight: 600 }}>{c.rating}</span></span>
            </button>
          ))}
        </div>
      )}
      {query.length >= 2 && matches.length === 0 && <div style={{ fontSize: 12.5, color: MUTE, marginTop: 10 }}>No matches in this sample set. The live app searches all of Google.</div>}
      <div style={{ fontSize: 11.5, color: MUTE, marginTop: 12, lineHeight: 1.45 }}>{note}</div>
    </div>
  );
}

function MiniMap({ labels }) {
  const pos = [{ x: 24, y: 58 }, { x: 50, y: 30 }, { x: 76, y: 54 }, { x: 60, y: 74 }];
  const pts = labels.slice(0, 4).map((l, i) => ({ ...pos[i], label: l }));
  return (
    <div style={{ borderRadius: 14, overflow: "hidden", border: `1px solid ${LINE}`, boxShadow: CARD_SHADOW }}>
      <svg viewBox="0 0 100 84" style={{ width: "100%", height: 170, display: "block" }}>
        <rect width="100" height="84" fill="#E8EEEA" />
        <path d="M0 50 Q40 44 100 58" stroke="#CFE0D6" strokeWidth="6" fill="none" /><path d="M44 0 Q48 40 38 84" stroke="#CFE0D6" strokeWidth="5" fill="none" />
        {pts.map((p, i) => i > 0 && <line key={"l" + i} x1={pts[i - 1].x} y1={pts[i - 1].y} x2={p.x} y2={p.y} stroke={ACCENT} strokeWidth="1" strokeDasharray="2 2" />)}
        {pts.map((p, i) => <g key={i}><circle cx={p.x} cy={p.y} r="9" fill={ACCENT} opacity="0.14" /><circle cx={p.x} cy={p.y} r="4.2" fill={ACCENT} stroke="#fff" strokeWidth="1.2" /><text x={p.x} y={p.y - 7} fontSize="4.4" fill={INK} textAnchor="middle" style={{ fontWeight: 600 }}>{p.label}</text></g>)}
      </svg>
    </div>
  );
}

function buildTripText(city, dates, tiers, trip) {
  let out = `SCOUT — ${city || "Tokyo"} · ${dates || ""}\nReading: ${tiers.map((k) => TIERS[k].label).join(", ")}\n\n`;
  trip.forEach((day) => {
    out += `=== DAY ${day.dayNum} — ${day.label} ===\n`;
    let n = 0; const firstHub = day.itinerary.findIndex((h) => h.stops.length > 0);
    day.itinerary.forEach((h, hi) => {
      if (!h.stops.length) return;
      out += `\n— ${h.hub} (${h.arrive}) —\n`;
      h.stops.forEach((s) => { n += 1; out += `${n}. ${s.name}${s.confirmed ? " [confirmed]" : ""}${s.rating ? ` · ${s.rating}*` : ""}${s.hours ? ` · ${s.hours}` : ""}\n   ${s.address}\n`; });
      if (hi === firstHub && day.lunch) out += `\nLUNCH · ${day.lunch.name} (${day.lunch.cuisine}) · ${day.lunch.rating}*\n   ${day.lunch.address}\n`;
    });
    out += `\n`;
  });
  return out;
}

// ── Input ──────────────────────────────────────────────────────
// ── Date helpers + range calendar ──────────────────────────────
const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const addDays = (d, n) => { const x = startOfDay(d); x.setDate(x.getDate() + n); return x; };
const addMonths = (d, n) => { const x = startOfDay(d); x.setMonth(x.getMonth() + n, 1); return x; };
const sameDay = (a, b) => !!(a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate());
const daysInclusive = (a, b) => Math.round((startOfDay(b) - startOfDay(a)) / 86400000) + 1;
const fmtShort = (d) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
const navBtn = { ...SANS, cursor: "pointer", background: "none", border: "none", color: INK, padding: 6, display: "flex", alignItems: "center" };

function RangeCalendar({ start, end, onChange }) {
  const [view, setView] = useState(() => startOfDay(start || new Date()));
  const y = view.getFullYear(), m = view.getMonth();
  const offset = new Date(y, m, 1).getDay();
  const dim = new Date(y, m + 1, 0).getDate();
  const today = startOfDay(new Date());
  const cells = [];
  for (let i = 0; i < offset; i++) cells.push(null);
  for (let d = 1; d <= dim; d++) cells.push(new Date(y, m, d));
  const pick = (d) => {
    if (!start || (start && end)) onChange(d, null);
    else if (d < start) onChange(d, null);
    else onChange(start, d);
  };
  const isEnd = (d) => sameDay(d, start) || sameDay(d, end);
  const inRange = (d) => start && end && d > start && d < end;
  const dow = ["S", "M", "T", "W", "T", "F", "S"];
  return (
    <div style={{ border: `1px solid ${LINE}`, borderRadius: 14, background: "#fff", boxShadow: CARD_SHADOW, padding: 14, marginTop: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <button onClick={() => setView(addMonths(view, -1))} style={navBtn}><ChevronLeft size={18} /></button>
        <div style={{ fontSize: 15, fontWeight: 700 }}>{view.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</div>
        <button onClick={() => setView(addMonths(view, 1))} style={navBtn}><ChevronRight size={18} /></button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2 }}>
        {dow.map((w, i) => <div key={"w" + i} style={{ textAlign: "center", fontSize: 11, fontWeight: 700, color: MUTE, padding: "4px 0" }}>{w}</div>)}
        {cells.map((d, i) => {
          if (!d) return <div key={i} />;
          const past = d < today;
          const end2 = isEnd(d), mid = inRange(d);
          return (
            <button key={i} disabled={past} onClick={() => pick(d)} style={{ ...SANS, cursor: past ? "default" : "pointer", border: "none", padding: "9px 0", fontSize: 13.5, borderRadius: 9, background: end2 ? ACCENT : (mid ? ACCENT_SOFT : "transparent"), color: past ? "#CDCDCD" : (end2 ? "#fff" : INK), fontWeight: end2 ? 700 : 500 }}>{d.getDate()}</button>
          );
        })}
      </div>
      <div style={{ fontSize: 11.5, color: MUTE, marginTop: 10 }}>{!start ? "Tap your start date" : (!end ? "Now tap your end date" : "Tap a new date to start over")}</div>
    </div>
  );
}

// ── Input ──────────────────────────────────────────────────────
function InputScreen({ city, setCity, start, end, onRange, datesLabel, dayCount, tiers, toggleTier, onBuild }) {
  const [calOpen, setCalOpen] = useState(false);
  const field = { display: "flex", alignItems: "center", gap: 8, border: `1px solid ${LINE}`, borderRadius: 12, padding: "12px 14px", boxShadow: CARD_SHADOW };
  const inp = { ...SANS, border: "none", outline: "none", fontSize: 16, color: INK, width: "100%" };
  const ready = tiers.length && start;
  return (
    <div style={{ ...SANS, color: INK }}>
      <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.5, color: ACCENT }}>Scout</div>
      <h1 style={{ fontSize: 30, fontWeight: 700, letterSpacing: -0.8, lineHeight: 1.1, margin: "26px 0 8px" }}>Where are you scouting?</h1>
      <p style={{ color: MUTE, fontSize: 15, margin: 0 }}>A few inputs. We build each day's route, timing, and the stops worth your time.</p>
      <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginTop: 28, marginBottom: 8 }}>City</label>
      <div style={field}><MapPin size={18} color={MUTE} /><input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Add a city" style={inp} /></div>
      <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>{CITIES.map((c) => <button key={c} onClick={() => setCity(c)} style={{ ...SANS, cursor: "pointer", fontSize: 13, padding: "6px 12px", borderRadius: 999, border: `1px solid ${city === c ? ACCENT : LINE}`, background: city === c ? ACCENT_SOFT : "#fff", color: city === c ? ACCENT : INK }}>{c}</button>)}</div>
      <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginTop: 22, marginBottom: 8 }}>Dates</label>
      <button onClick={() => setCalOpen((v) => !v)} style={{ ...SANS, ...field, width: "100%", cursor: "pointer", background: "#fff", textAlign: "left" }}>
        <Calendar size={18} color={MUTE} />
        <span style={{ flex: 1, fontSize: 16, color: datesLabel ? INK : "#9A9A9A" }}>{datesLabel || "Select start & end dates"}</span>
        {datesLabel && <span style={{ fontSize: 12.5, color: MUTE, fontWeight: 600 }}>{dayCount} {dayCount === 1 ? "day" : "days"}</span>}
      </button>
      {calOpen && <RangeCalendar start={start} end={end} onChange={onRange} />}
      <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginTop: 22, marginBottom: 8 }}>What are you reading? <span style={{ color: MUTE, fontWeight: 400 }}>· select any</span></label>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {["aspirational", "competitor", "core"].map((k) => {
          const t = TIERS[k]; const on = tiers.includes(k);
          return (
            <button key={k} onClick={() => toggleTier(k)} style={{ ...SANS, textAlign: "left", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, border: `1.5px solid ${on ? ACCENT : LINE}`, background: on ? ACCENT_SOFT : "#fff", borderRadius: 14, padding: "14px 14px" }}>
              <div style={{ width: 24, height: 24, borderRadius: 7, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", border: `1.5px solid ${on ? ACCENT : "#C9C9C9"}`, background: on ? ACCENT : "#fff" }}>{on && <Check size={15} color="#fff" />}</div>
              <div><div style={{ fontSize: 15.5, fontWeight: 600 }}>{t.label}</div><div style={{ fontSize: 12.5, color: MUTE, marginTop: 2, lineHeight: 1.35 }}>{t.desc}</div></div>
            </button>
          );
        })}
      </div>
      <button onClick={onBuild} disabled={!ready} style={{ ...SANS, cursor: ready ? "pointer" : "not-allowed", width: "100%", marginTop: 24, background: ready ? ACCENT : "#E5A6A9", color: "#fff", border: "none", borderRadius: 12, padding: "15px", fontSize: 16, fontWeight: 600 }}>Build my route</button>
      <div style={{ textAlign: "center", color: MUTE, fontSize: 12, marginTop: 12 }}>Prototype · sample route shown for Tokyo</div>
    </div>
  );
}

// ── Day tabs ───────────────────────────────────────────────────
function DayTabs({ trip, activeDay, onSwitch }) {
  return (
    <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
      {trip.map((d, i) => {
        const on = i === activeDay;
        return (
          <button key={i} onClick={() => onSwitch(i)} style={{ ...SANS, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, padding: "8px 13px", borderRadius: 999, border: `1px solid ${on ? ACCENT : LINE}`, background: on ? ACCENT_SOFT : "#fff", color: on ? ACCENT : INK }}>
            Day {d.dayNum}{d.confirmed && <CheckCircle size={14} color={OPEN} />}
          </button>
        );
      })}
    </div>
  );
}

// ── Review (per day) ───────────────────────────────────────────
function ReviewScreen({ city, dates, tiers, trip, activeDay, flash, onBack, onSwitchDay, onPickLunch, onConfirmStop, onRemoveStop, onAddStop, onConfirmDay, onGotoOverview }) {
  const [adding, setAdding] = useState(false);
  const day = trip[activeDay];
  let n = 0;
  const total = day.itinerary.reduce((a, h) => a + h.stops.length, 0);
  const firstHub = day.itinerary.findIndex((h) => h.stops.length > 0);
  const allConfirmed = trip.every((d) => d.confirmed);
  const isLast = activeDay === trip.length - 1;

  return (
    <div style={{ ...SANS, color: INK }}>
      <button onClick={onBack} style={{ ...SANS, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", color: INK, fontSize: 14, padding: 0 }}><ArrowLeft size={16} /> Edit trip</button>
      <DayTabs trip={trip} activeDay={activeDay} onSwitch={onSwitchDay} />
      <div style={{ marginTop: 14 }}>
        <h1 style={{ fontSize: 25, fontWeight: 700, letterSpacing: -0.6, margin: 0 }}>{city || "Tokyo"} · Day {day.dayNum}</h1>
        <div style={{ color: MUTE, fontSize: 13.5, marginTop: 3 }}>{day.label} · {total} stops</div>
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>{tiers.map((k) => <span key={k} style={{ fontSize: 11.5, fontWeight: 600, color: TIERS[k].chip[0], background: TIERS[k].chip[1], borderRadius: 999, padding: "4px 10px" }}>{TIERS[k].label}</span>)}</div>

      {adding ? (
        <SearchSelect candidates={day.addCandidates} title="Add a store you found" placeholder="Search a store…"
          note={<>Pick a result and Scout pulls in its rating, hours and address — then slots it in at the best point on this day's route. <span style={{ fontStyle: "italic" }}>Prototype searches a sample set; live uses Google's full search.</span></>}
          onClose={() => setAdding(false)} onPick={(c) => { onAddStop(c); setAdding(false); }} />
      ) : (
        <button onClick={() => setAdding(true)} style={{ ...SANS, cursor: "pointer", width: "100%", marginTop: 14, border: `1.5px dashed ${ACCENT}`, background: "#fff", color: ACCENT, borderRadius: 14, padding: "14px", fontSize: 14.5, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}><Plus size={17} /> Found a store online? Add it</button>
      )}
      {flash && <div style={{ marginTop: 10, background: "#EAF6EE", border: `1px solid #BFE3CB`, color: "#1A6B3C", borderRadius: 10, padding: "10px 12px", fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}><CheckCircle size={15} /> {flash}</div>}

      <div style={{ marginTop: 16 }}><MiniMap labels={day.itinerary.map((h) => h.hub)} /></div>

      {day.itinerary.map((h, hi) => {
        if (!h.stops.length) return null;
        return (
          <div key={hi}>
            <div style={{ marginTop: 26 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <div style={{ fontSize: 19, fontWeight: 700, letterSpacing: -0.3 }}>{h.hub}</div>
                <div style={{ fontSize: 12.5, color: MUTE }}>{h.stops.length} stops · {h.time}</div>
              </div>
              <div style={{ fontSize: 12.5, color: ACCENT, marginTop: 2, marginBottom: 14, display: "flex", alignItems: "center", gap: 5 }}><Navigation size={12} /> {h.arrive}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>{h.stops.map((s) => { n += 1; return <StopCard key={s.id} s={s} n={n} onConfirm={() => onConfirmStop(hi, s.id)} onRemove={() => onRemoveStop(hi, s.id)} />; })}</div>
            </div>
            {hi === firstHub && (
              <div style={{ marginTop: 24 }}>
                <div style={{ fontSize: 19, fontWeight: 700, letterSpacing: -0.3, display: "flex", alignItems: "center", gap: 8 }}><Utensils size={18} color={ACCENT} /> Lunch</div>
                <div style={{ fontSize: 12.5, color: MUTE, marginTop: 2, marginBottom: 12 }}>Midday, between hubs</div>
                {day.lunch ? (
                  <div style={{ border: `1.5px solid ${ACCENT}`, borderRadius: 16, background: ACCENT_SOFT, padding: "14px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                      <div><div style={{ fontSize: 16, fontWeight: 700 }}>{day.lunch.name}</div><div style={{ fontSize: 12.5, color: MUTE, marginTop: 1 }}>{day.lunch.cuisine} · {day.lunch.rating}★</div></div>
                      <button onClick={onPickLunch} style={{ ...SANS, cursor: "pointer", background: "none", border: "none", color: ACCENT, fontSize: 13, fontWeight: 600 }}>Change</button>
                    </div>
                    <AddressLine name={day.lunch.name} address={day.lunch.address} /><ActionRow name={day.lunch.name} address={day.lunch.address} />
                  </div>
                ) : (
                  <button onClick={onPickLunch} style={{ ...SANS, cursor: "pointer", width: "100%", border: `1.5px dashed ${ACCENT}`, background: "#fff", color: ACCENT, borderRadius: 16, padding: "18px", fontSize: 15, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}><Utensils size={17} /> Select lunch</button>
                )}
              </div>
            )}
          </div>
        );
      })}

      <div style={{ marginTop: 28, paddingTop: 18, borderTop: `1px solid ${LINE}` }}>
        <button onClick={onConfirmDay} style={{ ...SANS, cursor: "pointer", width: "100%", background: day.confirmed ? "#fff" : ACCENT, color: day.confirmed ? OPEN : "#fff", border: `1.5px solid ${day.confirmed ? OPEN : ACCENT}`, borderRadius: 12, padding: "15px", fontSize: 15.5, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          {day.confirmed && <CheckCircle size={17} />} {day.confirmed ? `Day ${day.dayNum} confirmed` : `Confirm Day ${day.dayNum}`} — {isLast ? "review trip" : "next day"} <ChevronRight size={17} />
        </button>
        {allConfirmed && <button onClick={onGotoOverview} style={{ ...SANS, cursor: "pointer", width: "100%", marginTop: 10, background: "none", border: "none", color: ACCENT, fontSize: 14, fontWeight: 600 }}>View full trip itinerary →</button>}
      </div>
    </div>
  );
}

// ── Lunch ──────────────────────────────────────────────────────
function LunchScreen({ dayNum, picks, search, onBack, onSelect }) {
  const [searching, setSearching] = useState(false);
  return (
    <div style={{ ...SANS, color: INK }}>
      <button onClick={onBack} style={{ ...SANS, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", color: INK, fontSize: 14, padding: 0 }}><ArrowLeft size={16} /> Back to Day {dayNum}</button>
      <h1 style={{ fontSize: 26, fontWeight: 700, letterSpacing: -0.6, margin: "14px 0 2px" }}>Pick lunch · Day {dayNum}</h1>
      <div style={{ color: MUTE, fontSize: 14, lineHeight: 1.4 }}>Curated for a memorable team meal near your route — special and delicious, not tourist traps.</div>
      {searching ? (
        <SearchSelect candidates={search} title="Search a lunch spot" placeholder="Search a restaurant…"
          note={<>Pick a result and Scout pulls in its rating, hours and address, then sets it as your lunch. <span style={{ fontStyle: "italic" }}>Prototype searches a sample set; live uses Google's full search.</span></>}
          onClose={() => setSearching(false)} onPick={(c) => onSelect(c)} />
      ) : (
        <button onClick={() => setSearching(true)} style={{ ...SANS, cursor: "pointer", width: "100%", marginTop: 16, border: `1.5px dashed ${ACCENT}`, background: "#fff", color: ACCENT, borderRadius: 14, padding: "14px", fontSize: 14.5, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}><Plus size={17} /> Have a spot in mind? Search it</button>
      )}
      <div style={{ fontSize: 11.5, fontWeight: 700, color: MUTE, letterSpacing: 0.6, marginTop: 24 }}>OUR PICKS</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 12 }}>{picks.map((l, i) => <LunchCard key={i} l={l} onSelect={onSelect} />)}</div>
    </div>
  );
}

// ── Overview (full trip) ───────────────────────────────────────
function OverviewScreen({ city, dates, tiers, trip, locked, onBack, onEditDay, onLock, onUnlock }) {
  const share = async () => {
    const text = buildTripText(city, dates, tiers, trip);
    try { if (navigator.share) { await navigator.share({ title: "Scout itinerary", text }); return; } } catch (e) {}
    try { await navigator.clipboard.writeText(text); alert("Trip itinerary copied to clipboard"); } catch (e) {}
  };
  const email = `mailto:?subject=${encodeURIComponent(`Scout — ${city || "Tokyo"} trip itinerary`)}&body=${encodeURIComponent(buildTripText(city, dates, tiers, trip))}`;
  const barBtn = { ...SANS, cursor: "pointer", flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, background: "#fff", border: `1px solid ${LINE}`, borderRadius: 11, padding: "11px", fontSize: 13.5, fontWeight: 600, color: INK, textDecoration: "none" };
  const totalStops = trip.reduce((a, d) => a + d.itinerary.reduce((b, h) => b + h.stops.length, 0), 0);

  return (
    <div style={{ ...SANS, color: INK }}>
      <button onClick={onBack} style={{ ...SANS, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", color: INK, fontSize: 14, padding: 0 }}><ArrowLeft size={16} /> Back to days</button>

      {locked && (
        <div style={{ marginTop: 14, background: "#EAF6EE", border: `1px solid #BFE3CB`, color: "#1A6B3C", borderRadius: 12, padding: "12px 14px", fontSize: 13.5, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}><Lock size={15} /> Trip locked in — this is your final itinerary.</div>
      )}

      <h1 style={{ fontSize: 27, fontWeight: 700, letterSpacing: -0.7, margin: "16px 0 2px" }}>{city || "Tokyo"}</h1>
      <div style={{ color: MUTE, fontSize: 14 }}>{dates || ""} · {trip.length} days · {totalStops} stops · by Uber</div>

      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <a href={email} style={barBtn}><Mail size={15} /> Email</a>
        <button onClick={share} style={barBtn}><Share2 size={15} /> Share</button>
        <button onClick={() => window.print()} style={barBtn}><Printer size={15} /> Print</button>
      </div>

      {trip.map((day, di) => {
        let n = 0; const firstHub = day.itinerary.findIndex((h) => h.stops.length > 0);
        return (
          <div key={di} style={{ marginTop: 26, border: `1px solid ${LINE}`, borderRadius: 16, overflow: "hidden", boxShadow: CARD_SHADOW }}>
            <div style={{ background: "#FAFAFA", borderBottom: `1px solid ${LINE}`, padding: "13px 15px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 16.5, fontWeight: 700, display: "flex", alignItems: "center", gap: 7 }}>Day {day.dayNum} {day.confirmed && <CheckCircle size={15} color={OPEN} />}</div>
                <div style={{ fontSize: 12.5, color: MUTE, marginTop: 1 }}>{day.label}</div>
              </div>
              {!locked && <button onClick={() => onEditDay(di)} style={{ ...SANS, cursor: "pointer", display: "flex", alignItems: "center", gap: 5, background: "none", border: `1px solid ${LINE}`, borderRadius: 999, padding: "6px 12px", color: INK, fontSize: 12.5, fontWeight: 600 }}><Pencil size={13} /> Edit</button>}
            </div>
            <div style={{ padding: "6px 15px 14px" }}>
              {day.itinerary.map((h, hi) => {
                if (!h.stops.length) return null;
                return (
                  <div key={hi}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: MUTE, letterSpacing: 0.3, marginTop: 14, marginBottom: 4, textTransform: "uppercase" }}>{h.hub}</div>
                    {h.stops.map((s) => { n += 1; return (
                      <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: `1px solid #F4F4F4` }}>
                        <div style={{ width: 22, height: 22, borderRadius: 11, flexShrink: 0, border: `1.5px solid ${tierColor(s)}`, color: tierColor(s), fontSize: 11.5, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{n}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.name}</div>
                          <div style={{ fontSize: 11.5, color: MUTE }}>{s.hours || "Hours via Directions"}{s.confirmed && <span style={{ color: OPEN, fontWeight: 600 }}> · Going</span>}</div>
                        </div>
                        {s.rating != null && <span style={{ display: "inline-flex", alignItems: "center", gap: 2, flexShrink: 0 }}><Star size={11} color={INK} fill={INK} /><span style={{ fontSize: 12, fontWeight: 600 }}>{s.rating}</span></span>}
                      </div>
                    ); })}
                    {hi === firstHub && day.lunch && (
                      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: `1px solid #F4F4F4` }}>
                        <div style={{ width: 22, height: 22, borderRadius: 11, flexShrink: 0, background: ACCENT_SOFT, color: ACCENT, display: "flex", alignItems: "center", justifyContent: "center" }}><Utensils size={12} /></div>
                        <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 14, fontWeight: 600 }}>{day.lunch.name}</div><div style={{ fontSize: 11.5, color: MUTE }}>Lunch · {day.lunch.cuisine}</div></div>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 2 }}><Star size={11} color={INK} fill={INK} /><span style={{ fontSize: 12, fontWeight: 600 }}>{day.lunch.rating}</span></span>
                      </div>
                    )}
                  </div>
                );
              })}
              {!day.lunch && <div style={{ fontSize: 12, color: MUTE, marginTop: 10, fontStyle: "italic" }}>No lunch selected for this day</div>}
            </div>
          </div>
        );
      })}

      <div style={{ marginTop: 26, paddingTop: 18, borderTop: `1px solid ${LINE}` }}>
        {locked ? (
          <button onClick={onUnlock} style={{ ...SANS, cursor: "pointer", width: "100%", background: "none", border: `1.5px solid ${LINE}`, color: INK, borderRadius: 12, padding: "14px", fontSize: 14.5, fontWeight: 600 }}>Unlock to edit</button>
        ) : (
          <button onClick={onLock} style={{ ...SANS, cursor: "pointer", width: "100%", background: INK, color: "#fff", border: "none", borderRadius: 12, padding: "16px", fontSize: 16, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}><Lock size={17} /> Lock in trip</button>
        )}
        <div style={{ textAlign: "center", color: MUTE, fontSize: 12, marginTop: 12, lineHeight: 1.5 }}>Locking sets the final itinerary you'll carry in-market. You can unlock to make changes anytime.</div>
      </div>
    </div>
  );
}

export default function App() {
  const [screen, setScreen] = useState("input");
  const [city, setCity] = useState("Tokyo");
  const [startDate, setStartDate] = useState(() => addDays(new Date(), 7));
  const [endDate, setEndDate] = useState(() => addDays(new Date(), 8));
  const [tiers, setTiers] = useState(["aspirational", "competitor", "core"]);
  const [trip, setTrip] = useState([]);
  const [activeDay, setActiveDay] = useState(0);
  const [locked, setLocked] = useState(false);
  const [flash, setFlash] = useState("");
  const toggleTier = (k) => setTiers((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]));
  const onRange = (s, e) => { setStartDate(s); setEndDate(e); };
  const dayCount = startDate ? (endDate ? Math.max(1, Math.min(6, daysInclusive(startDate, endDate))) : 1) : 0;
  const datesLabel = startDate ? (endDate && !sameDay(startDate, endDate) ? `${fmtShort(startDate)} – ${fmtShort(endDate)}` : fmtShort(startDate)) : "";
  const dates = datesLabel;

  const generate = (count) => Array.from({ length: count }, (_, i) => {
    const src = DAYS[i % DAYS.length];
    return {
      dayNum: i + 1, label: src.label, lunch: null, confirmed: false,
      lunchPicks: src.lunchPicks, lunchSearch: src.lunchSearch, addCandidates: src.addCandidates,
      itinerary: src.hubs.map((h) => ({ ...h, stops: h.stops.filter((s) => tiers.includes(s.tier)).map((s) => ({ ...s, id: slug(s.name), confirmed: false, addedByUser: false })) })),
    };
  });
  const build = () => { setTrip(generate(Math.max(1, dayCount))); setActiveDay(0); setLocked(false); setFlash(""); setScreen("review"); };

  const updateDay = (i, fn) => setTrip((prev) => prev.map((d, idx) => (idx === i ? fn(d) : d)));
  const onConfirmStop = (hi, id) => updateDay(activeDay, (d) => ({ ...d, itinerary: d.itinerary.map((h, i) => i !== hi ? h : { ...h, stops: h.stops.map((s) => s.id === id ? { ...s, confirmed: !s.confirmed } : s) }) }));
  const onRemoveStop = (hi, id) => updateDay(activeDay, (d) => ({ ...d, itinerary: d.itinerary.map((h, i) => i !== hi ? h : { ...h, stops: h.stops.filter((s) => s.id !== id) }) }));
  const onAddStop = (c) => {
    const stop = { id: slug(c.name) + "-" + Date.now(), name: c.name, tier: c.tier, rating: c.rating, reviews: c.reviews, hours: c.hours, dwell: c.dwell || 18, address: c.address, why: c.why, confirmed: false, addedByUser: true };
    updateDay(activeDay, (d) => {
      const hasHub = d.itinerary.some((h) => h.hub === c.area);
      return { ...d, itinerary: d.itinerary.map((h, i) => (h.hub === c.area || (!hasHub && i === 0)) ? { ...h, stops: [...h.stops, stop] } : h) };
    });
    setFlash(`Added ${c.name} — slotted in at the best point on Day ${activeDay + 1}.`);
    setTimeout(() => setFlash(""), 5000);
  };
  const onSelectLunch = (l) => { updateDay(activeDay, (d) => ({ ...d, lunch: l })); setScreen("review"); };
  const onConfirmDay = () => {
    updateDay(activeDay, (d) => ({ ...d, confirmed: true }));
    if (activeDay < trip.length - 1) { setActiveDay(activeDay + 1); window.scrollTo(0, 0); }
    else setScreen("overview");
  };

  return (
    <div style={{ background: "#FFFFFF", minHeight: "100vh" }}>
      <div style={{ maxWidth: 480, margin: "0 auto", padding: "26px 18px 56px" }}>
        {screen === "input" && <InputScreen {...{ city, setCity, start: startDate, end: endDate, onRange, datesLabel, dayCount, tiers, toggleTier }} onBuild={build} />}
        {screen === "review" && <ReviewScreen {...{ city, dates, tiers, trip, activeDay, flash }} onBack={() => setScreen("input")} onSwitchDay={(i) => { setActiveDay(i); window.scrollTo(0, 0); }} onPickLunch={() => setScreen("lunch")} onConfirmStop={onConfirmStop} onRemoveStop={onRemoveStop} onAddStop={onAddStop} onConfirmDay={onConfirmDay} onGotoOverview={() => setScreen("overview")} />}
        {screen === "lunch" && <LunchScreen dayNum={trip[activeDay].dayNum} picks={trip[activeDay].lunchPicks} search={trip[activeDay].lunchSearch} onBack={() => setScreen("review")} onSelect={onSelectLunch} />}
        {screen === "overview" && <OverviewScreen {...{ city, dates, tiers, trip, locked }} onBack={() => setScreen("review")} onEditDay={(i) => { setActiveDay(i); setScreen("review"); window.scrollTo(0, 0); }} onLock={() => setLocked(true)} onUnlock={() => setLocked(false)} />}
      </div>
    </div>
  );
}
