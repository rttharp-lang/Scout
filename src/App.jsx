import React, { useState, useEffect, useRef, useCallback } from "react";
import { searchPlaces, lookupCoords, lookupPhotos, lookupAreaInfo, generateItinerary, searchCities, suggestNeighborhoodPlan, suggestStores, suggestMeals } from "./places";
import { supabase, authEnabled } from "./supabase";
import { listTrips, saveTrip, updateTrip, deleteTrip } from "./trips";
import { Star, Clock, MapPin, Check, CheckCircle, ArrowLeft, Calendar, Navigation, Car, Utensils, Mail, Share2, Printer, ExternalLink, Plus, Minus, Trash2, X, Search, Lock, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, GripVertical, Pencil, Menu, LogOut, LayoutGrid, List } from "lucide-react";

// ── Tokens ─────────────────────────────────────────────────────
// Design tokens mirror the CSS custom properties in theme.css (the source of
// truth). Kept as concrete values here because some inline styles append alpha
// (e.g. `${ACCENT}40`), which a raw var() can't do.
const SANS = { fontFamily: "var(--font-sans)" };
const INK = "#0A0A0A";          // --text
const MUTE = "#8E8C88";         // --text-muted
const LINE = "#DCD8D2";         // --border
const ACCENT = "#1A1AE5";       // --accent (electric blue)
const ACCENT_SOFT = "#E7E7FC";  // light electric-blue tint
const NEON = "#7FE800";         // --pop (bright lime green)
const OPEN = "#178A3C";         // readable green for open/positive text
const DANGER = "#C0392B";
const CARD_SHADOW = "0 6px 18px rgba(0,0,0,0.07)";
// Big specimen-style card title — ~48px on phone, up to ~56px on desktop.
const CARD_TITLE = "clamp(3rem, 10vw, 3.5rem)";

const TIERS = {
  aspirational: { label: "Aspirational", desc: "Luxury & designer — construction, theater, top of range", chip: ["#8A6D3B", "#F3ECDD"], grad: "linear-gradient(135deg,#3a342b,#8a7a5e)" },
  department:   { label: "Department store", desc: "Luxury & multi-brand — curation and merchandising mastery", chip: ["#6D4E8A", "#EEE8F6"], grad: "linear-gradient(135deg,#3f2f5a,#7a5fae)" },
  competitor:   { label: "Competitor", desc: "Athletic & adjacent — adidas, On, Arc'teryx, Lululemon", chip: ["#2F5D8A", "#E6EEF6"], grad: "linear-gradient(135deg,#2d4a63,#6d93ad)" },
  streetwear:   { label: "Streetwear", desc: "Hype, drops & local street labels — homegrown, not just global", chip: ["#2B2B2B", "#ECECEC"], grad: "linear-gradient(135deg,#2b2b2b,#5a5a5a)" },
  underground:  { label: "Underground", desc: "Vintage, archive & concept — the insider-only deep cuts", chip: ["#7A2E3A", "#F4E3E6"], grad: "linear-gradient(135deg,#5a2029,#a35260)" },
  culture:      { label: "Culture", desc: "Lifestyle & retail-as-culture", chip: ["#3C6E63", "#E4EFEB"], grad: "linear-gradient(135deg,#2c4a42,#6f9488)" },
  core:         { label: "Core", desc: "Commercial & value — where scale meets the high street", chip: ["#B0472F", "#FBEAE3"], grad: "linear-gradient(135deg,#a8431f,#d98a55)" },
};
const TIER_ORDER = ["aspirational", "department", "competitor", "streetwear", "underground", "culture", "core"];
// Default curation: the inspiring, insider, design-led picks — concept stores,
// underground/archive, local streetwear, designer flagships. We deliberately
// skip department stores, athletic competitors and commercial/core (the obvious
// stops every product manager already knows) unless the user opts into filters.
const CURATED_TIERS = ["aspirational", "streetwear", "underground", "culture"];
const ADDED_TIER = { label: "Your find", chip: ["#5A4FB0", "#ECEAFB"], grad: "linear-gradient(135deg,#4a4490,#8a82c8)" };
const CITIES = ["Tokyo", "New York", "Shanghai", "Paris", "London"];

const mapsUrl = (name, address) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name + ", " + address)}`;
const uberUrl = (name, address, lat, lng) => {
  // Uber only drops a destination pin from coordinates, not a text address,
  // so include lat/lng when we have them (live Google results always do).
  const base = `https://m.uber.com/ul/?action=setPickup&pickup=my_location&dropoff[formatted_address]=${encodeURIComponent(address)}&dropoff[nickname]=${encodeURIComponent(name)}`;
  return (lat != null && lng != null) ? `${base}&dropoff[latitude]=${lat}&dropoff[longitude]=${lng}` : base;
};
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
function ActionRow({ name, address, lat, lng }) {
  const pill = { ...SANS, display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12.5, fontWeight: 600, textDecoration: "none", borderRadius: 999, padding: "7px 12px", border: `1px solid ${LINE}` };
  return (
    <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
      <a href={uberUrl(name, address, lat, lng)} target="_blank" rel="noreferrer" style={{ ...pill, background: INK, color: "#fff", border: `1px solid ${INK}` }}><Car size={13} /> Uber here</a>
      <a href={mapsUrl(name, address)} target="_blank" rel="noreferrer" style={{ ...pill, background: "#fff", color: INK }}><Navigation size={13} /> Directions</a>
    </div>
  );
}
// Wraps ActionRow and, for any stop without coordinates, quietly looks them
// up so the Uber link fills in everywhere — not just on live-found stores.
function SmartActionRow({ name, address, lat, lng }) {
  const [coords, setCoords] = useState(lat != null ? { lat, lng } : null);
  useEffect(() => {
    let cancelled = false;
    if (lat == null && address) {
      lookupCoords(name, address).then((c) => { if (!cancelled && c) setCoords(c); });
    }
    return () => { cancelled = true; };
  }, [name, address, lat]);
  return <ActionRow name={name} address={address} lat={coords?.lat} lng={coords?.lng} />;
}
function AddressLine({ name, address }) {
  return (
    <a href={mapsUrl(name, address)} target="_blank" rel="noreferrer" style={{ display: "flex", alignItems: "flex-start", gap: 5, marginTop: 9, textDecoration: "none", color: MUTE }}>
      <MapPin size={13} style={{ marginTop: 1, flexShrink: 0 }} /><span style={{ fontSize: 12.5, lineHeight: 1.35, userSelect: "text" }}>{address}</span>
    </a>
  );
}
const tierColor = (s) => (s.addedByUser && !s.tier ? ADDED_TIER.chip[0] : (TIERS[s.tier] ? TIERS[s.tier].chip[0] : ADDED_TIER.chip[0]));

// Swipeable gallery of a place's Google listing photos. Falls back to the
// branded gradient + storefront illustration when there are no photos. Lazily
// fetches photos for places that don't already carry them (curated stops).
function PhotoStrip({ name, address, photos, grad, fallback, loader, srcOf, hideDots }) {
  const [pics, setPics] = useState(photos && photos.length ? photos : null);
  const [active, setActive] = useState(0);
  const [broken, setBroken] = useState(() => new Set());
  useEffect(() => {
    if (photos && photos.length) { setPics(photos); return; }
    let cancelled = false;
    // A custom loader (e.g. neighborhood street views) takes precedence;
    // otherwise look up this place's own listing photos by name + address.
    const p = loader ? loader() : (address ? lookupPhotos(name, address) : null);
    if (p) p.then((r) => { if (!cancelled) setPics(r); });
    return () => { cancelled = true; };
  }, [name, address]);

  // Items are either photo resource names (default) or ready-made image URLs.
  const toSrc = srcOf || ((nm) => `/api/photo?name=${encodeURIComponent(nm)}&w=800`);
  // Drop any image that fails to load — e.g. a street view with no imagery —
  // so the strip never shows broken or grey placeholders.
  const list = (pics || []).slice(0, 12).filter((nm) => !broken.has(nm));
  if (!list.length) {
    return <div style={{ height: "100%", background: grad, display: "flex", alignItems: "center", justifyContent: "center" }}>{fallback || <Storefront />}</div>;
  }
  const onScroll = (e) => {
    const el = e.currentTarget;
    const i = el.clientWidth ? Math.round(el.scrollLeft / el.clientWidth) : 0;
    if (i !== active) setActive(i);
  };
  return (
    <>
      <div onScroll={onScroll} style={{ display: "flex", height: "100%", overflowX: "auto", scrollSnapType: "x mandatory", WebkitOverflowScrolling: "touch", scrollbarWidth: "none" }}>
        {list.map((nm) => (
          <img key={nm} src={toSrc(nm)} alt="" loading="lazy"
            onError={() => setBroken((b) => new Set(b).add(nm))}
            style={{ minWidth: "100%", width: "100%", height: "100%", objectFit: "cover", scrollSnapAlign: "start", display: "block" }} />
        ))}
      </div>
      {list.length > 1 && !hideDots && (
        <div style={{ position: "absolute", bottom: 10, left: "50%", transform: "translateX(-50%)", pointerEvents: "none", display: "flex", gap: 5, alignItems: "center" }}>
          {list.map((_, i) => (
            <span key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: i === active ? "#fff" : "rgba(255,255,255,0.5)", transform: i === active ? "scale(1.15)" : "none", boxShadow: "0 0 2px rgba(0,0,0,0.45)", transition: "background 0.15s" }} />
          ))}
        </div>
      )}
    </>
  );
}

// Compact list-view row for a store (spec §5 list view).
function StopRow({ s, n, onConfirm, onRemove }) {
  const t = TIERS[s.tier] || ADDED_TIER;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, border: `1px solid ${s.confirmed ? OPEN : LINE}`, background: "#fff", borderRadius: "var(--radius-sm)", padding: "10px 12px" }}>
      <div style={{ width: 26, height: 26, borderRadius: 999, flexShrink: 0, border: `1.5px solid ${tierColor(s)}`, color: tierColor(s), fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{n}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.name}</div>
        <div style={{ fontSize: 12, color: MUTE, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.label}{s.eta ? ` · arrive ~${s.eta}` : ""}{s.rating ? ` · ${s.rating}★` : ""}</div>
      </div>
      <button onClick={onConfirm} aria-label="Confirm I'm going" style={{ ...SANS, cursor: "pointer", background: "none", border: "none", color: s.confirmed ? OPEN : MUTE, padding: 4, flexShrink: 0, display: "flex" }}>{s.confirmed ? <CheckCircle size={18} /> : <Check size={18} />}</button>
      <button onClick={onRemove} aria-label="Remove" style={{ ...SANS, cursor: "pointer", background: "none", border: "none", color: DANGER, padding: 4, flexShrink: 0, display: "flex" }}><Trash2 size={16} /></button>
    </div>
  );
}

// A green "going" check (top-right, like the neighborhood cards). Everything is
// going by default; tap the check to open a small Remove / Replace / Keep going
// menu over the card.
function GoingControl({ name, onRemove, onReplace }) {
  const [menu, setMenu] = useState(false);
  const stop = (fn) => (e) => { e.stopPropagation(); e.preventDefault(); fn(); };
  const mBtn = { ...SANS, cursor: "pointer", width: "100%", maxWidth: 220, borderRadius: "var(--radius-pill)", padding: "11px", fontSize: 14, fontWeight: 700 };
  return (
    <>
      <button onClick={stop(() => setMenu(true))} aria-label="Going — tap to change" title="Going" style={{ position: "absolute", top: 12, right: 12, zIndex: 6, width: 30, height: 30, borderRadius: 999, border: "none", cursor: "pointer", background: NEON, color: "#0A0A0A", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 10px rgba(0,0,0,0.4)" }}>
        <Check size={17} strokeWidth={3} />
      </button>
      {menu && (
        <div onClick={stop(() => setMenu(false))} style={{ position: "absolute", inset: 0, zIndex: 7, background: "rgba(10,10,10,0.82)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, padding: 20 }}>
          <div style={{ color: "#fff", fontSize: "var(--step-meta)", textAlign: "center", marginBottom: 6, maxWidth: 240 }}>Not going to {name}?</div>
          <button onClick={stop(onRemove)} style={{ ...mBtn, background: "#fff", color: "#0A0A0A", border: "none" }}>Remove</button>
          {onReplace && <button onClick={stop(onReplace)} style={{ ...mBtn, background: "transparent", color: "#fff", border: "1.5px solid rgba(255,255,255,0.7)" }}>Replace</button>}
          <button onClick={stop(() => setMenu(false))} style={{ ...mBtn, background: NEON, color: "#0A0A0A", border: "none" }}>Keep going</button>
        </div>
      )}
    </>
  );
}

// Full-bleed image card (Pangram Pangram style): photo fills the card, store
// name large in white over the centre, the "why" small beneath. Minimal — no
// coloured outline. Green "going" check top-right; Uber/Directions at the bottom.
function StopCard({ s, n, onRemove, onReplace }) {
  const t = TIERS[s.tier] || ADDED_TIER;
  const iconBtn = { ...SANS, cursor: "pointer", textDecoration: "none", background: "rgba(15,15,15,0.5)", border: "none", color: "#fff", width: 36, height: 36, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(3px)" };
  const meta = [s.rating != null ? `${s.rating}★` : null, s.hours ? `Open · ${s.hours}` : null, s.eta ? `Arrive ~${s.eta}` : null].filter(Boolean).join("  ·  ");
  return (
    <div style={{ position: "relative", aspectRatio: "4 / 5", borderRadius: "var(--radius-card)", overflow: "hidden", background: "#111", boxShadow: CARD_SHADOW }}>
      <div style={{ position: "absolute", inset: 0 }}>
        <PhotoStrip name={s.name} address={s.address} photos={s.photos} grad={t.grad} hideDots />
      </div>
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", background: "linear-gradient(180deg, rgba(0,0,0,0.36) 0%, rgba(0,0,0,0.06) 34%, rgba(0,0,0,0.72) 100%)" }} />
      <div style={{ position: "absolute", top: 14, left: 16, pointerEvents: "none", color: "rgba(255,255,255,0.85)", fontSize: "var(--step-caption)", fontWeight: 600, textShadow: "0 1px 6px rgba(0,0,0,0.5)" }}>{String(n).padStart(2, "0")}</div>
      <GoingControl name={s.name} onRemove={onRemove} onReplace={onReplace} />
      <div style={{ position: "absolute", left: 0, right: 0, top: "46%", transform: "translateY(-50%)", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", padding: "0 22px", pointerEvents: "none" }}>
        <div style={{ color: "#fff", fontSize: CARD_TITLE, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.06, textShadow: "0 2px 16px rgba(0,0,0,0.6)" }}>{s.name}</div>
        <div style={{ color: "rgba(255,255,255,0.92)", fontSize: "var(--step-meta)", lineHeight: 1.4, marginTop: 8, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden", textShadow: "0 1px 8px rgba(0,0,0,0.6)" }}>{s.why}</div>
      </div>
      {meta && <div style={{ position: "absolute", left: 16, right: 16, bottom: 60, pointerEvents: "none", textAlign: "center", color: "rgba(255,255,255,0.88)", fontSize: "var(--step-caption)", textShadow: "0 1px 6px rgba(0,0,0,0.55)" }}>{meta}</div>}
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 14, display: "flex", justifyContent: "center", gap: 8 }}>
        <a href={uberUrl(s.name, s.address, s.lat, s.lng)} target="_blank" rel="noreferrer" aria-label="Uber here" title="Uber here" style={iconBtn}><Car size={16} /></a>
        <a href={mapsUrl(s.name, s.address)} target="_blank" rel="noreferrer" aria-label="Directions" title="Directions" style={iconBtn}><Navigation size={16} /></a>
      </div>
    </div>
  );
}

// Shared full-image overlay frame for restaurant cards (matches the store card):
// photo fills the card, name large in white over the centre, cuisine·price + why
// beneath, rating top-right, quiet icon actions over the bottom.
function MealImageCard({ meal, actions, onClick, corner }) {
  const sub = [meal.cuisine, meal.price ? "$".repeat(meal.price) : null, meal.rating != null ? `${meal.rating}★` : null].filter(Boolean).join(" · ");
  return (
    <div onClick={onClick} style={{ position: "relative", aspectRatio: "4 / 5", borderRadius: "var(--radius-card)", overflow: "hidden", background: "#111", boxShadow: CARD_SHADOW, cursor: onClick ? "pointer" : "default" }}>
      <div style={{ position: "absolute", inset: 0 }}>
        <PhotoStrip name={meal.name} address={meal.address} photos={meal.photos} grad="linear-gradient(135deg,#5a3b22,#caa46a)" fallback={<Utensils size={42} color="#fff" style={{ opacity: 0.85 }} />} hideDots />
      </div>
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", background: "linear-gradient(180deg, rgba(0,0,0,0.36) 0%, rgba(0,0,0,0.06) 34%, rgba(0,0,0,0.72) 100%)" }} />
      {corner}
      <div style={{ position: "absolute", left: 0, right: 0, top: "46%", transform: "translateY(-50%)", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", padding: "0 22px", pointerEvents: "none" }}>
        <div style={{ color: "#fff", fontSize: CARD_TITLE, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.06, textShadow: "0 2px 16px rgba(0,0,0,0.6)" }}>{meal.name}</div>
        {sub && <div style={{ color: "rgba(255,255,255,0.92)", fontSize: "var(--step-meta)", fontWeight: 600, marginTop: 10, textShadow: "0 1px 8px rgba(0,0,0,0.6)" }}>{sub}</div>}
        {meal.why && <div style={{ color: "rgba(255,255,255,0.9)", fontSize: "var(--step-meta)", lineHeight: 1.4, marginTop: 6, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden", textShadow: "0 1px 8px rgba(0,0,0,0.6)" }}>{meal.why}</div>}
      </div>
      {actions && <div style={{ position: "absolute", left: 0, right: 0, bottom: 14, display: "flex", justifyContent: "center", gap: 8 }}>{actions}</div>}
    </div>
  );
}

const mealIconBtn = { ...SANS, cursor: "pointer", textDecoration: "none", background: "rgba(15,15,15,0.5)", border: "none", color: "#fff", height: 36, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(3px)" };

// Picker card (lunch/dinner options) — tap to choose.
function LunchCard({ l, onSelect }) {
  return (
    <MealImageCard meal={l} onClick={() => onSelect(l)}
      actions={<span style={{ ...mealIconBtn, padding: "0 18px", gap: 6, fontSize: 13.5, fontWeight: 700 }}><Check size={15} /> Select</span>} />
  );
}

// The chosen lunch/dinner on the review page — green "going" check (Remove /
// Replace / Keep) top-right, Uber + Directions at the bottom.
function MealCard({ meal, onReplace, onRemove }) {
  return (
    <MealImageCard meal={meal}
      corner={<GoingControl name={meal.name} onRemove={onRemove} onReplace={onReplace} />}
      actions={<>
        <a href={uberUrl(meal.name, meal.address, meal.lat, meal.lng)} target="_blank" rel="noreferrer" aria-label="Uber here" title="Uber here" style={{ ...mealIconBtn, width: 36 }}><Car size={16} /></a>
        <a href={mapsUrl(meal.name, meal.address)} target="_blank" rel="noreferrer" aria-label="Directions" title="Directions" style={{ ...mealIconBtn, width: 36 }}><Navigation size={16} /></a>
      </>} />
  );
}

function SearchSelect({ candidates, onPick, onClose, title, placeholder, note, cityContext, onSuggest, suggestLabel, autoSuggest }) {
  const [q, setQ] = useState("");
  const [live, setLive] = useState(null);   // null until a live search returns
  const [loading, setLoading] = useState(false);
  const [suggested, setSuggested] = useState(null); // AI-prompted picks
  const [suggesting, setSuggesting] = useState(false);
  const [picked, setPicked] = useState(() => new Set()); // added this session — hide so you can keep adding without dupes
  const query = q.trim().toLowerCase();
  const keyOf = (c) => c.placeId || c.name;
  const sampleMatches = query.length >= 2 ? candidates.filter((c) => c.name.toLowerCase().includes(query)).slice(0, 6) : [];

  const promptMore = () => {
    setSuggesting(true);
    Promise.resolve(onSuggest()).then((r) => setSuggested(r || [])).catch(() => setSuggested([])).finally(() => setSuggesting(false));
  };
  // When opened as "Prompt more here", fetch Scout's suggestions immediately.
  useEffect(() => { if (autoSuggest && onSuggest) promptMore(); }, []);
  const pick = (c) => { setPicked((p) => new Set(p).add(keyOf(c))); onPick(c); };
  // Reuse one row renderer for both search results and AI suggestions.
  const Row = (c, i, showWhy) => (
    <button key={keyOf(c) + "-" + i} onClick={() => pick(c)} style={{ ...SANS, cursor: "pointer", width: "100%", textAlign: "left", background: "#fff", border: "none", borderTop: i ? `1px solid ${LINE}` : "none", padding: "11px 12px", display: "flex", alignItems: "center", gap: 10 }}>
      <MapPin size={16} color={ACCENT} style={{ flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14.5, fontWeight: 600, color: INK }}>{c.name}</div>
        <div style={{ fontSize: 12, color: MUTE, whiteSpace: showWhy ? "normal" : "nowrap", overflow: "hidden", textOverflow: "ellipsis", lineHeight: 1.35 }}>{showWhy && c.why ? c.why : `${c.cuisine ? c.cuisine + " · " : ""}${c.address}`}</div>
      </div>
      {c.rating != null ? <span style={{ display: "inline-flex", alignItems: "center", gap: 3, flexShrink: 0 }}><Star size={12} color={INK} fill={INK} /><span style={{ fontSize: 12.5, fontWeight: 600 }}>{c.rating}</span></span> : <Plus size={16} color={ACCENT} style={{ flexShrink: 0 }} />}
    </button>
  );

  // Debounced live search against Google Places; falls back to the sample set
  // on any error or when search isn't configured.
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setLive(null); setLoading(false); return; }
    const scoped = cityContext ? `${term} ${cityContext}` : term;
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(() => {
      searchPlaces(scoped)
        .then((r) => { if (!cancelled) setLive(r); })
        .catch(() => { if (!cancelled) setLive(null); })
        .finally(() => { if (!cancelled) setLoading(false); });
    }, 350);
    return () => { cancelled = true; clearTimeout(t); };
  }, [q]);

  const matches = ((live && live.length) ? live : sampleMatches).filter((c) => !picked.has(keyOf(c))).slice(0, 8);
  const suggestedRows = (suggested || []).filter((c) => !picked.has(keyOf(c)));
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
          {matches.map((c, i) => Row(c, i, false))}
        </div>
      )}
      {loading && matches.length === 0 && <div style={{ fontSize: 12.5, color: MUTE, marginTop: 10 }}>Searching Google…</div>}
      {!loading && query.length >= 2 && matches.length === 0 && <div style={{ fontSize: 12.5, color: MUTE, marginTop: 10 }}>No matches found. Try a more specific name.</div>}

      {/* Optional: let the scout ask Scout to suggest more stores instead of typing. */}
      {onSuggest && query.length < 2 && (
        <>
          <button onClick={promptMore} disabled={suggesting} style={{ ...SANS, cursor: suggesting ? "default" : "pointer", width: "100%", marginTop: 10, border: `1.5px solid ${ACCENT}`, background: ACCENT_SOFT, color: ACCENT, borderRadius: 12, padding: "12px", fontSize: 14, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            {suggesting ? <><span style={{ width: 15, height: 15, border: `2.5px solid ${ACCENT}40`, borderTopColor: ACCENT, borderRadius: "50%", animation: "scoutspin 0.8s linear infinite" }} /> Asking Scout…</> : <>✨ {suggestLabel || "Prompt 5 more from Scout"}</>}
            <style>{"@keyframes scoutspin{to{transform:rotate(360deg)}}"}</style>
          </button>
          {suggestedRows.length > 0 && (
            <div style={{ border: `1px solid ${LINE}`, borderRadius: 12, marginTop: 8, overflow: "hidden" }}>
              {suggestedRows.map((c, i) => Row(c, i, true))}
            </div>
          )}
          {suggested && suggestedRows.length === 0 && !suggesting && <div style={{ fontSize: 12.5, color: MUTE, marginTop: 10 }}>{suggested.length ? "Added — prompt again for more." : "No more to suggest right now — try searching by name."}</div>}
        </>
      )}

      <div style={{ fontSize: 11.5, color: MUTE, marginTop: 12, lineHeight: 1.45 }}>{note}</div>
    </div>
  );
}

function DecorativeMap({ labels }) {
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

// Resolves coordinates for every stop on the day and renders a live Google
// static map of the whole route. Tapping it opens Google Maps with the full
// multi-stop route. Falls back to the decorative map while coordinates load,
// if too few resolve, or if the map image fails (e.g. Maps Static API off).
// Web-Mercator projection helpers (256-px world tile), so we can compute an
// explicit center/zoom that fits the day's stops and then place our own
// numbered pins over the static basemap at the right pixels.
const MAP_TILE = 256;
const projX = (lng) => MAP_TILE * (0.5 + lng / 360);
const projY = (lat) => {
  const s = Math.min(Math.max(Math.sin((lat * Math.PI) / 180), -0.9999), 0.9999);
  return MAP_TILE * (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI));
};
const unprojLat = (y) => {
  const n = Math.PI - (2 * Math.PI * y) / MAP_TILE;
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
};
function fitView(points, w, h, pad) {
  const xs = points.map((p) => projX(p.lng)), ys = points.map((p) => projY(p.lat));
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const dx = Math.max(maxX - minX, 1e-9), dy = Math.max(maxY - minY, 1e-9);
  let zoom = Math.floor(Math.min(Math.log2((w - 2 * pad) / dx), Math.log2((h - 2 * pad) / dy), 16));
  if (!isFinite(zoom)) zoom = 14;
  zoom = Math.max(2, Math.min(20, zoom));
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  return { zoom, cx, cy, centerLat: unprojLat(cy), centerLng: (cx / MAP_TILE) * 360 - 180 };
}

const MAP_H = 190;

function MiniMap({ stops, home }) {
  const [pts, setPts] = useState([]);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [w, setW] = useState(0);
  const roRef = useRef(null);
  const sig = stops.map((s) => s.name).join("|");

  // Measure the map's rendered width via a callback ref so it fires whenever the
  // box actually mounts — the box only appears once stops resolve, so a plain
  // mount effect would miss it. Keeps the basemap request and our pin overlay in
  // one coordinate space, and re-measures on resize / rotation.
  const setBox = useCallback((el) => {
    if (roRef.current) { roRef.current.disconnect(); roRef.current = null; }
    if (el) {
      setW(el.clientWidth);
      const ro = new ResizeObserver(() => setW(el.clientWidth));
      ro.observe(el);
      roRef.current = ro;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    (async () => {
      const resolved = [];
      for (const s of stops.slice(0, 20)) {
        if (s.lat != null && s.lng != null) { resolved.push({ lat: s.lat, lng: s.lng }); continue; }
        const c = await lookupCoords(s.name, s.address);
        if (c) resolved.push(c);
      }
      if (!cancelled) setPts(resolved);
    })();
    return () => { cancelled = true; };
  }, [sig]);

  const coords = pts.map((c) => `${c.lat},${c.lng}`);
  const homeStr = home && home.lat != null ? `${home.lat},${home.lng}` : null;
  const allPts = (home && home.lat != null ? [home] : []).concat(pts);
  const view = w >= 60 && pts.length >= 2 ? fitView(allPts, w, MAP_H, 34) : null;

  const mapSrc = view
    ? `/api/staticmap?pts=${encodeURIComponent(coords.join(";"))}` +
      (homeStr ? `&home=${encodeURIComponent(homeStr)}` : "") +
      `&center=${view.centerLat},${view.centerLng}&zoom=${view.zoom}&w=${Math.min(Math.round(w), 640)}&h=${MAP_H}`
    : "";

  // Reset load tracking whenever the image URL changes, and guard against the
  // iOS Safari quirk where a failed <img> fires neither onload nor onerror —
  // leaving a blank white box. If nothing loads in time, fall back.
  useEffect(() => {
    if (!mapSrc) return;
    setLoaded(false); setFailed(false);
    const t = setTimeout(() => setLoaded((v) => { if (!v) setFailed(true); return v; }), 8000);
    return () => clearTimeout(t);
  }, [mapSrc]);

  if (failed || pts.length < 2) return <DecorativeMap labels={stops.slice(0, 4).map((s) => s.name)} />;

  // Pixel position of a coord within the basemap, given the chosen center/zoom.
  const scale = view ? Math.pow(2, view.zoom) : 1;
  const at = (p) => ({ left: w / 2 + (projX(p.lng) - view.cx) * scale, top: MAP_H / 2 + (projY(p.lat) - view.cy) * scale });
  const dot = { position: "absolute", transform: "translate(-50%,-50%)", pointerEvents: "none", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "50%", fontWeight: 700, boxShadow: "0 1px 4px rgba(0,0,0,0.35)", border: "2px solid #fff" };

  // Use the path form with a trailing data flag (!3e2 = walking). The ?api=1
  // form silently drops travelmode when waypoints are present (opens in Drive);
  // this form forces walking and has no waypoint cap. When a hotel is set, the
  // route starts from it.
  const dirUrl = "https://www.google.com/maps/dir/" + (homeStr ? [homeStr, ...coords] : coords).join("/") + "/data=!4m2!4m1!3e2";
  return (
    <a href={dirUrl} target="_blank" rel="noreferrer" style={{ display: "block", textDecoration: "none" }}>
      <div ref={setBox} style={{ position: "relative", height: MAP_H, borderRadius: 14, overflow: "hidden", border: `1px solid ${LINE}`, boxShadow: CARD_SHADOW, background: "#E8EEEA" }}>
        {mapSrc && (
          <img src={mapSrc} alt="Route map"
            onError={() => setFailed(true)}
            onLoad={(e) => { if (e.currentTarget.naturalWidth === 0) setFailed(true); else setLoaded(true); }}
            style={{ width: "100%", height: MAP_H, objectFit: "cover", display: "block" }} />
        )}
        {/* Our own numbered pins, matching the store cards (real numbers, not
            Google's single-character A/B fallback past 9). */}
        {view && loaded && pts.map((p, i) => {
          const pos = at(p);
          return <div key={i} style={{ ...dot, ...pos, width: 22, height: 22, background: ACCENT, color: "#fff", fontSize: 11 }}>{i + 1}</div>;
        })}
        {view && loaded && home && home.lat != null && (
          <div style={{ ...dot, ...at(home), width: 24, height: 24, background: NEON, color: INK, fontSize: 12 }}>H</div>
        )}
        <div style={{ position: "absolute", bottom: 10, right: 10, background: "rgba(255,255,255,0.94)", color: INK, fontSize: 12, fontWeight: 600, borderRadius: 999, padding: "6px 12px", display: "flex", alignItems: "center", gap: 5, boxShadow: CARD_SHADOW }}>
          <Navigation size={12} color={ACCENT} /> Open route in Maps
        </div>
      </div>
    </a>
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
    if (day.dinner) out += `\nDINNER · ${day.dinner.name} (${day.dinner.cuisine})${day.dinner.rating ? ` · ${day.dinner.rating}*` : ""}\n   ${day.dinner.address || ""}\n`;
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
function InputScreen({ city, setCity, hotel, setHotel, start, end, onRange, datesLabel, dayCount, tiers, toggleTier, onBuild, session, savedTrips, onLoadTrip, onDeleteTrip }) {
  const [calOpen, setCalOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [citySug, setCitySug] = useState([]);
  const [cityFocus, setCityFocus] = useState(false);
  const [hq, setHq] = useState(hotel?.name || "");
  const [hotelSug, setHotelSug] = useState([]);
  const [hotelFocus, setHotelFocus] = useState(false);
  const field = { display: "flex", alignItems: "center", gap: 8, border: `1px solid ${LINE}`, borderRadius: 12, padding: "12px 14px", boxShadow: CARD_SHADOW };
  const inp = { ...SANS, border: "none", outline: "none", fontSize: 16, color: INK, width: "100%" };
  const ready = start && city.trim();

  useEffect(() => {
    const term = city.trim();
    if (!cityFocus || term.length < 2) { setCitySug([]); return; }
    let cancel = false;
    const t = setTimeout(() => { searchCities(term).then((r) => { if (!cancel) setCitySug(r); }); }, 250);
    return () => { cancel = true; clearTimeout(t); };
  }, [city, cityFocus]);

  useEffect(() => {
    const term = hq.trim();
    if (!hotelFocus || term.length < 2) { setHotelSug([]); return; }
    let cancel = false;
    const t = setTimeout(() => { searchPlaces(`${term} ${city}`).then((r) => { if (!cancel) setHotelSug(r.slice(0, 5)); }).catch(() => {}); }, 300);
    return () => { cancel = true; clearTimeout(t); };
  }, [hq, hotelFocus, city]);
  return (
    <div style={{ ...SANS, color: INK }}>
      <h1 style={{ fontSize: 30, fontWeight: 700, letterSpacing: -0.8, lineHeight: 1.1, margin: "8px 0 8px" }}>Where are you going?</h1>
      <p style={{ color: MUTE, fontSize: 15, margin: 0, lineHeight: 1.45 }}>City, hotel, dates — that's it. Scout curates the best independent retail, the most beautiful places to eat, and the routes between them. The if-you-know-you-know version of the city.</p>
      {session && savedTrips && savedTrips.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Your saved trips</label>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {savedTrips.map((t) => (
              <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 10, border: `1px solid ${LINE}`, borderRadius: 12, padding: "11px 13px", boxShadow: CARD_SHADOW }}>
                <button onClick={() => onLoadTrip(t)} style={{ ...SANS, cursor: "pointer", flex: 1, textAlign: "left", background: "none", border: "none", padding: 0 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 600, color: INK }}>{t.city || "Trip"}</div>
                  <div style={{ fontSize: 12, color: MUTE, marginTop: 2 }}>{t.dates || ""}{t.dates && (t.tiers || []).length ? " · " : ""}{(t.tiers || []).map((k) => TIERS[k]?.label).filter(Boolean).join(", ")}</div>
                </button>
                <button onClick={() => onDeleteTrip(t.id)} aria-label="Delete trip" style={{ ...SANS, cursor: "pointer", background: "none", border: "none", color: MUTE, padding: 4 }}><Trash2 size={15} /></button>
              </div>
            ))}
          </div>
        </div>
      )}
      <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginTop: 28, marginBottom: 8 }}>City</label>
      <div style={{ position: "relative" }}>
        <div style={field}>
          <MapPin size={18} color={MUTE} />
          <input value={city} onChange={(e) => setCity(e.target.value)} onFocus={() => setCityFocus(true)} onBlur={() => setTimeout(() => setCityFocus(false), 150)} placeholder="Type any city — Shanghai, Portland, Lagos…" style={inp} />
        </div>
        {cityFocus && citySug.length > 0 && (
          <div style={{ position: "absolute", zIndex: 5, left: 0, right: 0, marginTop: 6, background: "#fff", border: `1px solid ${LINE}`, borderRadius: 12, boxShadow: CARD_SHADOW, overflow: "hidden" }}>
            {citySug.map((c, i) => (
              <button key={c} onMouseDown={(e) => { e.preventDefault(); setCity(c); setCitySug([]); setCityFocus(false); }} style={{ ...SANS, cursor: "pointer", width: "100%", textAlign: "left", background: "#fff", border: "none", borderTop: i ? `1px solid ${LINE}` : "none", padding: "11px 14px", display: "flex", alignItems: "center", gap: 9, fontSize: 14.5, color: INK }}>
                <MapPin size={15} color={ACCENT} style={{ flexShrink: 0 }} /> {c}
              </button>
            ))}
          </div>
        )}
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>{CITIES.map((c) => <button key={c} onClick={() => setCity(c)} style={{ ...SANS, cursor: "pointer", fontSize: 13, padding: "6px 12px", borderRadius: 999, border: `1px solid ${city === c ? ACCENT : LINE}`, background: city === c ? ACCENT_SOFT : "#fff", color: city === c ? ACCENT : INK }}>{c}</button>)}</div>

      <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginTop: 22, marginBottom: 8 }}>Hotel <span style={{ color: MUTE, fontWeight: 400 }}>· your home base, sets where each day starts</span></label>
      <div style={{ position: "relative" }}>
        <div style={field}>
          <MapPin size={18} color={MUTE} />
          <input value={hq} onChange={(e) => { setHq(e.target.value); if (!e.target.value.trim()) setHotel(null); }} onFocus={() => setHotelFocus(true)} onBlur={() => setTimeout(() => setHotelFocus(false), 150)} placeholder="Search your hotel" style={inp} />
        </div>
        {hotelFocus && hotelSug.length > 0 && (
          <div style={{ position: "absolute", zIndex: 5, left: 0, right: 0, marginTop: 6, background: "#fff", border: `1px solid ${LINE}`, borderRadius: 12, boxShadow: CARD_SHADOW, overflow: "hidden" }}>
            {hotelSug.map((r, i) => (
              <button key={(r.placeId || r.name) + i} onMouseDown={(e) => { e.preventDefault(); setHotel({ name: r.name, address: r.address, lat: r.lat, lng: r.lng }); setHq(r.name); setHotelSug([]); setHotelFocus(false); }} style={{ ...SANS, cursor: "pointer", width: "100%", textAlign: "left", background: "#fff", border: "none", borderTop: i ? `1px solid ${LINE}` : "none", padding: "10px 13px", display: "flex", alignItems: "center", gap: 9 }}>
                <MapPin size={15} color={ACCENT} style={{ flexShrink: 0, marginTop: 2 }} />
                <div style={{ minWidth: 0 }}><div style={{ fontSize: 14, fontWeight: 600, color: INK }}>{r.name}</div><div style={{ fontSize: 12, color: MUTE, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.address}</div></div>
              </button>
            ))}
          </div>
        )}
        {hotel && hotel.lat != null && <div style={{ fontSize: 12, color: OPEN, fontWeight: 600, marginTop: 6, display: "flex", alignItems: "center", gap: 4 }}><CheckCircle size={13} /> Home base set — days start from here</div>}
      </div>

      <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginTop: 22, marginBottom: 8 }}>Dates</label>
      <button onClick={() => setCalOpen((v) => !v)} style={{ ...SANS, ...field, width: "100%", cursor: "pointer", background: "#fff", textAlign: "left" }}>
        <Calendar size={18} color={MUTE} />
        <span style={{ flex: 1, fontSize: 16, color: datesLabel ? INK : "#9A9A9A" }}>{datesLabel || "Select start & end dates"}</span>
        {datesLabel && <span style={{ fontSize: 12.5, color: MUTE, fontWeight: 600 }}>{dayCount} {dayCount === 1 ? "day" : "days"}</span>}
      </button>
      {calOpen && <RangeCalendar start={start} end={end} onChange={onRange} />}
      <button onClick={onBuild} disabled={!ready} style={{ ...SANS, cursor: ready ? "pointer" : "not-allowed", width: "100%", marginTop: 26, background: ready ? ACCENT : "#E5A6A9", color: "#fff", border: "none", borderRadius: 12, padding: "16px", fontSize: 16.5, fontWeight: 700 }}>Curate my trip</button>
      <div style={{ textAlign: "center", color: MUTE, fontSize: 12, marginTop: 10, lineHeight: 1.5 }}>We curate the best concept, archive and independent stores — and skip the department stores and big brands everyone already knows.</div>

      {/* Optional: take control of what's included via the existing tier filters. */}
      <div style={{ marginTop: 22, borderTop: `1px solid ${LINE}`, paddingTop: 18 }}>
        <button onClick={() => setFiltersOpen((v) => !v)} style={{ ...SANS, cursor: "pointer", width: "100%", background: "none", border: "none", padding: 0, display: "flex", alignItems: "center", justifyContent: "space-between", color: INK }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>Want to curate your own? Use filters</span>
          {filtersOpen ? <ChevronUp size={18} color={MUTE} /> : <ChevronDown size={18} color={MUTE} />}
        </button>
        {filtersOpen && (
          <>
            <p style={{ fontSize: 12.5, color: MUTE, lineHeight: 1.45, margin: "10px 0 12px" }}>By default Scout includes the design-led, insider picks. Adjust what you want — add department stores or competitor brands, or narrow to just the underground.</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {TIER_ORDER.map((k) => {
                const t = TIERS[k]; const on = tiers.includes(k);
                return (
                  <button key={k} onClick={() => toggleTier(k)} style={{ ...SANS, textAlign: "left", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, border: `1.5px solid ${on ? ACCENT : LINE}`, background: on ? ACCENT_SOFT : "#fff", borderRadius: 14, padding: "14px 14px" }}>
                    <div style={{ width: 24, height: 24, borderRadius: 7, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", border: `1.5px solid ${on ? ACCENT : "#C9C9C9"}`, background: on ? ACCENT : "#fff" }}>{on && <Check size={15} color="#fff" />}</div>
                    <div><div style={{ fontSize: 15.5, fontWeight: 600 }}>{t.label}</div><div style={{ fontSize: 12.5, color: MUTE, marginTop: 2, lineHeight: 1.35 }}>{t.desc}</div></div>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
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

// Bottom sheet to add a whole new neighborhood to the day. Suggests districts
// in the city (minus the ones already in the day); picking one generates and
// adds its stores.
function AddNeighborhoodModal({ city, tiers, existing, onClose, onAdd }) {
  const [options, setOptions] = useState(null); // null = loading
  const [busy, setBusy] = useState("");
  useEffect(() => {
    let cancelled = false;
    // Flatten a 2-day plan into a candidate list of districts to add.
    suggestNeighborhoodPlan(city, tiers, 2).then((days) => {
      if (cancelled) return;
      const opts = days.flatMap((d) => d.neighborhoods || []);
      const taken = new Set(existing.map((e) => (e || "").toLowerCase()));
      setOptions((opts || []).filter((o) => !taken.has(o.name.toLowerCase())));
    }).catch(() => { if (!cancelled) setOptions([]); });
    return () => { cancelled = true; };
  }, []);

  const pick = async (name) => {
    setBusy(name);
    try { await onAdd(name); onClose(); }
    catch { setBusy(""); }
  };

  return (
    <div onClick={busy ? undefined : onClose} style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ ...SANS, color: INK, width: "100%", maxWidth: 480, background: "#fff", borderRadius: "18px 18px 0 0", padding: "18px 18px 28px", maxHeight: "80vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: -0.4 }}>Add a neighborhood</div>
          <button onClick={onClose} disabled={!!busy} style={{ ...SANS, cursor: busy ? "default" : "pointer", background: "none", border: "none", color: MUTE, padding: 4 }}><X size={20} /></button>
        </div>
        <p style={{ color: MUTE, fontSize: 13.5, lineHeight: 1.45, margin: "4px 0 14px" }}>Pick another area to scout in {city}. Scout pulls in real stores there and adds them to this day.</p>
        {options === null ? (
          <div style={{ textAlign: "center", padding: "30px 0" }}>
            <div style={{ width: 26, height: 26, margin: "0 auto 12px", border: `3px solid ${LINE}`, borderTopColor: ACCENT, borderRadius: "50%", animation: "scoutspin 0.8s linear infinite" }} />
            <style>{"@keyframes scoutspin{to{transform:rotate(360deg)}}"}</style>
            <div style={{ color: MUTE, fontSize: 13 }}>Finding more districts…</div>
          </div>
        ) : options.length === 0 ? (
          <div style={{ color: MUTE, fontSize: 13.5, textAlign: "center", padding: "24px 0" }}>No more neighborhoods to suggest for {city} right now.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <style>{"@keyframes scoutspin{to{transform:rotate(360deg)}}"}</style>
            {options.map((o, i) => {
              const loading = busy === o.name;
              return (
                <button key={i} onClick={() => pick(o.name)} disabled={!!busy} style={{ ...SANS, textAlign: "left", cursor: busy ? "default" : "pointer", display: "flex", alignItems: "center", gap: 12, border: `1.5px solid ${loading ? ACCENT : LINE}`, background: loading ? ACCENT_SOFT : "#fff", borderRadius: 14, padding: "13px", opacity: busy && !loading ? 0.5 : 1 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: loading ? ACCENT : INK }}>{o.name}</div>
                    <div style={{ fontSize: 12.5, color: MUTE, lineHeight: 1.4, marginTop: 2 }}>{o.blurb}</div>
                  </div>
                  {loading
                    ? <div style={{ width: 18, height: 18, flexShrink: 0, border: `2.5px solid ${LINE}`, borderTopColor: ACCENT, borderRadius: "50%", animation: "scoutspin 0.8s linear infinite" }} />
                    : <Plus size={18} color={ACCENT} style={{ flexShrink: 0 }} />}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Review (per day) ───────────────────────────────────────────
function ReviewScreen({ city, dates, tiers, trip, activeDay, flash, hotel, onBack, onSwitchDay, onPickLunch, onPickDinner, onClearLunch, onClearDinner, onConfirmStop, onRemoveStop, onAddStop, onReorderHub, onOptimizeDay, onSuggestStores, onAddNeighborhood, collapsed, setCollapsed, view, onView, onConfirmDay, onGotoOverview }) {
  const [adding, setAdding] = useState(false);
  const [hoodOpen, setHoodOpen] = useState(false);
  const [addHub, setAddHub] = useState(null); // neighborhood currently adding a store to
  const [drag, setDrag] = useState(null); // { from, startY, curY, to }
  const cardEls = useRef([]);
  const day = trip[activeDay];
  const hubCount = day.itinerary.filter((h) => h.stops.length).length;
  const lastHub = day.itinerary.length - 1;

  // Estimate how much extra travel the current neighborhood order costs versus
  // Scout's optimal order — so we can warn when a manual arrangement backtracks.
  const hc = hotel && hotel.lat != null ? { lat: hotel.lat, lng: hotel.lng } : null;
  const flatStops = day.itinerary.flatMap((h) => h.stops);
  const extraWalk = hubCount > 1 ? Math.round(routeMinutes(flatStops, hc) - routeMinutes(scheduleStops(flatStops, hc, false), hc)) : 0;
  const suboptimal = extraWalk >= 8;
  const allCollapsed = hubCount > 0 && day.itinerary.every((h) => !h.stops.length || collapsed.has(h.hub));
  const toggleHub = (hub) => setCollapsed((p) => { const s = new Set(p); s.has(hub) ? s.delete(hub) : s.add(hub); return s; });
  const toggleAll = () => setCollapsed((p) => {
    const s = new Set(p);
    day.itinerary.forEach((h) => (allCollapsed ? s.delete(h.hub) : s.add(h.hub)));
    return s;
  });

  // Drag-to-reorder neighborhood blocks via the grip handle (pointer events =
  // touch + mouse). `to` is the destination index in the list-without-the-dragged
  // block — the count of OTHER cards whose midpoint is above the pointer — so it
  // drops straight into splice. We ignore the dragged card's own (moving) rect.
  const dragDown = (hi) => (e) => {
    e.preventDefault();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
    setDrag({ from: hi, startY: e.clientY, curY: e.clientY, to: hi });
  };
  const dragMove = (e) => {
    setDrag((d) => {
      if (!d) return d;
      let to = 0;
      day.itinerary.forEach((h, idx) => {
        if (idx === d.from || !h.stops.length) return;
        const el = cardEls.current[idx];
        if (!el) return;
        const r = el.getBoundingClientRect();
        if (e.clientY > r.top + r.height / 2) to += 1;
      });
      return { ...d, curY: e.clientY, to };
    });
  };
  const dragUp = () => {
    setDrag((d) => {
      if (d && d.to !== d.from) onReorderHub(d.from, d.to);
      return null;
    });
  };
  const insertionLine = <div style={{ height: 3, borderRadius: 2, background: ACCENT, margin: "6px 4px" }} />;

  // Connector shown between neighborhoods (and from the hotel): the estimated
  // drive time between the two areas, in subtle italics. (Walking is only within
  // a neighborhood; rides between specific stores happen via each store's card.)
  const Hop = (fromCoord, toStops, label) => {
    const to = centroidOf(toStops);
    if (!fromCoord || !to) return null;
    const drive = Math.round(driveMin(fromCoord, to));
    return (
      <div style={{ textAlign: "center", fontSize: 12.5, fontStyle: "italic", color: MUTE, margin: "14px 0 0" }}>
        ~{drive} min drive{label ? ` to ${label}` : ""}
      </div>
    );
  };

  let n = 0;
  const total = day.itinerary.reduce((a, h) => a + h.stops.length, 0);
  const firstHub = day.itinerary.findIndex((h) => h.stops.length > 0);
  const allConfirmed = trip.every((d) => d.confirmed);
  const isLast = activeDay === trip.length - 1;

  // Lunch sits in the route right where you'll be at ~1 PM (day.lunchAfterId).
  const lunchBlock = (
    <div>
      <div style={{ fontSize: 16, fontWeight: 700, display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <Utensils size={17} color={ACCENT} /> Lunch <span style={{ fontSize: 12.5, color: MUTE, fontWeight: 500 }}>· ~{day.lunchAt || "1:00 PM"}</span>
      </div>
      {day.lunch ? (
        <MealCard meal={day.lunch} onReplace={onPickLunch} onRemove={onClearLunch} />
      ) : (
        <button onClick={onPickLunch} style={{ ...SANS, cursor: "pointer", width: "100%", border: `1.5px dashed ${ACCENT}`, background: "#fff", color: ACCENT, borderRadius: 16, padding: "16px", fontSize: 15, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}><Utensils size={17} /> Add lunch near here</button>
      )}
    </div>
  );

  const dinnerBlock = (
    <div>
      <div style={{ fontSize: 16, fontWeight: 700, display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <Utensils size={17} color={ACCENT} /> Dinner <span style={{ fontSize: 12.5, color: MUTE, fontWeight: 500 }}>· evening</span>
      </div>
      {day.dinner ? (
        <MealCard meal={day.dinner} onReplace={onPickDinner} onRemove={onClearDinner} />
      ) : (
        <button onClick={onPickDinner} style={{ ...SANS, cursor: "pointer", width: "100%", border: `1.5px dashed ${ACCENT}`, background: "#fff", color: ACCENT, borderRadius: 16, padding: "16px", fontSize: 15, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}><Utensils size={17} /> Add dinner</button>
      )}
    </div>
  );

  return (
    <div style={{ ...SANS, color: INK, maxWidth: 980, marginInline: "auto" }}>
      <button onClick={onBack} style={{ ...SANS, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", color: INK, fontSize: "var(--step-meta)", padding: 0 }}><ArrowLeft size={16} /> Edit trip</button>
      <DayTabs trip={trip} activeDay={activeDay} onSwitch={onSwitchDay} />
      <div style={{ marginTop: 14 }}>
        <h1 style={{ fontSize: "var(--step-h1)", fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.1, margin: 0 }}>{city || "Tokyo"} · Day {day.dayNum}</h1>
        <div style={{ color: MUTE, fontSize: "var(--step-meta)", marginTop: 4 }}>{day.label} · {total} stops</div>
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>{tiers.map((k) => <span key={k} style={{ fontSize: 11.5, fontWeight: 600, color: TIERS[k].chip[0], background: TIERS[k].chip[1], borderRadius: 999, padding: "4px 10px" }}>{TIERS[k].label}</span>)}</div>

      {adding ? (
        <SearchSelect candidates={day.addCandidates} title="Add a store you found" placeholder="Search a store…" cityContext={city}
          note={<>Pick a result and Scout pulls in its live rating, hours and address from Google — then slots it in at the best point on this day's route.</>}
          onClose={() => setAdding(false)} onPick={(c) => { onAddStop(c); setAdding(false); }} />
      ) : (
        <button onClick={() => setAdding(true)} style={{ ...SANS, cursor: "pointer", width: "100%", maxWidth: 560, marginInline: "auto", marginTop: 14, border: `1.5px dashed ${ACCENT}`, background: "#fff", color: ACCENT, borderRadius: "var(--radius-pill)", padding: "14px", fontSize: 14.5, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}><Plus size={17} /> Found a store online? Add it</button>
      )}
      {flash && <div style={{ marginTop: 10, background: "#EAF6EE", border: `1px solid #BFE3CB`, color: "#1A6B3C", borderRadius: 10, padding: "10px 12px", fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}><CheckCircle size={15} /> {flash}</div>}

      <div style={{ marginTop: 16, maxWidth: 760, marginInline: "auto" }}><MiniMap stops={day.itinerary.flatMap((h) => h.stops).map((s) => ({ name: s.name, address: s.address, lat: s.lat, lng: s.lng }))} home={hotel && hotel.lat != null ? { lat: hotel.lat, lng: hotel.lng } : null} /></div>

      {suboptimal && (
        <div style={{ marginTop: 18, background: "#FFF7E6", border: "1px solid #F2D89A", borderRadius: 12, padding: "12px 14px", display: "flex", alignItems: "flex-start", gap: 10 }}>
          <span style={{ fontSize: 16, lineHeight: "20px" }}>⚠️</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13.5, color: "#7A5A12", lineHeight: 1.45 }}>This neighborhood order backtracks — about <b>~{extraWalk} min</b> of extra travel versus the best route.</div>
            <button onClick={onOptimizeDay} style={{ ...SANS, cursor: "pointer", marginTop: 8, background: "#fff", border: `1px solid #E0B860`, color: "#7A5A12", borderRadius: 9, padding: "7px 12px", fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}><Navigation size={13} /> Reorder optimally</button>
          </div>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginTop: 24, marginBottom: 4, paddingBottom: 12, borderBottom: `1px solid ${LINE}`, flexWrap: "wrap" }}>
        <div style={{ fontSize: "var(--step-meta)", fontWeight: 700, color: MUTE, letterSpacing: 0.5, textTransform: "uppercase" }}>{hubCount} neighborhood{hubCount === 1 ? "" : "s"}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {hubCount > 1 && (
            <button onClick={toggleAll} style={{ ...SANS, cursor: "pointer", background: "none", border: "none", color: ACCENT, fontSize: 13.5, fontWeight: 600, display: "flex", alignItems: "center", gap: 4, padding: 0 }}>
              {allCollapsed ? <><ChevronDown size={15} /> Expand all</> : <><ChevronUp size={15} /> Collapse all</>}
            </button>
          )}
          <ViewToggle view={view} onView={onView} />
        </div>
      </div>

      {day.itinerary.map((h, hi) => {
        if (!h.stops.length) return null;
        const isCollapsed = collapsed.has(h.hub);
        const isDragged = drag && drag.from === hi;
        const prevBlock = hi > 0 ? day.itinerary[hi - 1] : null;
        const block = (
          <React.Fragment key={hi}>
            {drag && !isDragged && (hi < drag.from ? hi : hi - 1) === drag.to && insertionLine}
            {/* How you get here: from the hotel for the first stop, or from the
                previous neighborhood — a walk, or an Uber when far apart. */}
            {!drag && (hi === firstHub
              ? (hc && Hop(hc, h.stops, h.hub))
              : (prevBlock && prevBlock.stops.length && Hop(centroidOf(prevBlock.stops), h.stops, h.hub)))}
            <div ref={(el) => (cardEls.current[hi] = el)} style={{ marginTop: 16, border: `1px solid ${isDragged ? ACCENT : LINE}`, borderRadius: 16, background: "#fff", boxShadow: isDragged ? "0 12px 28px rgba(0,0,0,0.18)" : CARD_SHADOW, padding: "12px 14px", transform: isDragged ? `translateY(${drag.curY - drag.startY}px) scale(1.01)` : "none", opacity: isDragged ? 0.95 : 1, position: "relative", zIndex: isDragged ? 20 : 1, transition: isDragged ? "none" : "box-shadow 0.15s" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button onClick={() => toggleHub(h.hub)} aria-label={isCollapsed ? "Expand" : "Collapse"} style={{ ...SANS, cursor: "pointer", background: "none", border: "none", color: MUTE, padding: 2, display: "flex" }}>
                  {isCollapsed ? <ChevronRight size={20} /> : <ChevronDown size={20} />}
                </button>
                <button onClick={() => toggleHub(h.hub)} style={{ ...SANS, cursor: "pointer", textAlign: "left", flex: 1, minWidth: 0, background: "none", border: "none", padding: 0 }}>
                  <div style={{ fontSize: "var(--step-h2)", fontWeight: 700, letterSpacing: "-0.02em", color: INK }}>{h.hub}</div>
                  <div style={{ fontSize: "var(--step-meta)", color: MUTE, marginTop: 2 }}>{h.stops.length} stops · {h.time}{isCollapsed ? "" : ` · ${h.arrive}`}</div>
                </button>
                {hubCount > 1 && (
                  <button onPointerDown={dragDown(hi)} onPointerMove={dragMove} onPointerUp={dragUp} onPointerCancel={dragUp}
                    aria-label="Drag to reorder" title="Drag to reorder"
                    style={{ ...SANS, touchAction: "none", cursor: isDragged ? "grabbing" : "grab", background: "none", border: "none", padding: "8px 6px", display: "flex", alignItems: "center", justifyContent: "center", color: "#BDBDBD", marginLeft: 2 }}>
                    <GripVertical size={19} />
                  </button>
                )}
              </div>
              {!isCollapsed && (
                <div style={{ marginTop: 16 }}>
                  {view === "list" ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {h.stops.map((s) => { n += 1; return <StopRow key={s.id} s={s} n={n} onConfirm={() => onConfirmStop(hi, s.id)} onRemove={() => onRemoveStop(hi, s.id)} />; })}
                    </div>
                  ) : (
                    <div className="scout-grid">
                      {h.stops.map((s) => { n += 1; return <StopCard key={s.id} s={s} n={n} onRemove={() => onRemoveStop(hi, s.id)} onReplace={() => { onRemoveStop(hi, s.id); setAddHub(h.hub); }} />; })}
                    </div>
                  )}
                  {addHub === h.hub ? (
                    <div style={{ marginTop: 12 }}>
                      <SearchSelect candidates={[]} title={`More stores in ${h.hub}`} placeholder={`Or search a store by name…`} cityContext={`${h.hub} ${city}`}
                        note={<>Each pick is added to {h.hub} with live rating, hours and address — confirm it with "I'm going" or remove it.</>}
                        onSuggest={() => onSuggestStores(h.hub)} suggestLabel="Prompt 5 more" autoSuggest
                        onClose={() => setAddHub(null)} onPick={(c) => onAddStop(c, h.hub)} />
                    </div>
                  ) : (
                    <button onClick={() => setAddHub(h.hub)} style={{ ...SANS, cursor: "pointer", width: "100%", marginTop: 12, border: `1.5px dashed ${ACCENT}`, background: ACCENT_SOFT, color: ACCENT, borderRadius: "var(--radius-pill)", padding: "12px", fontSize: 13.5, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>✨ Prompt more here</button>
                  )}
                </div>
              )}
            </div>
            {/* Lunch lands after the neighborhood where you'll be ~1 PM. */}
            {!drag && h.stops.some((s) => s.id === day.lunchAfterId) && <div style={{ maxWidth: 400, marginInline: "auto", marginTop: 18 }}>{lunchBlock}</div>}
            {drag && hi === lastHub && drag.to === lastHub && insertionLine}
          </React.Fragment>
        );
        if (isCollapsed) n += h.stops.length; // keep numbering aligned with the map
        return block;
      })}

      <button onClick={() => setHoodOpen(true)} style={{ ...SANS, cursor: "pointer", width: "100%", maxWidth: 560, marginInline: "auto", marginTop: 18, border: `1.5px dashed ${ACCENT}`, background: "#fff", color: ACCENT, borderRadius: "var(--radius-pill)", padding: "14px", fontSize: 14.5, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}><Plus size={17} /> Add a neighborhood</button>
      {hoodOpen && <AddNeighborhoodModal city={city} tiers={tiers} existing={day.itinerary.map((h) => h.hub)} onClose={() => setHoodOpen(false)} onAdd={onAddNeighborhood} />}

      <div style={{ marginTop: 28, maxWidth: 400, marginInline: "auto" }}>{dinnerBlock}</div>

      <div style={{ marginTop: 28, paddingTop: 20, borderTop: `1px solid ${LINE}`, maxWidth: 560, marginInline: "auto" }}>
        <button onClick={onConfirmDay} style={{ ...SANS, cursor: "pointer", width: "100%", background: day.confirmed ? "#fff" : ACCENT, color: day.confirmed ? OPEN : "var(--accent-ink)", border: `1.5px solid ${day.confirmed ? OPEN : ACCENT}`, borderRadius: "var(--radius-pill)", padding: "15px", fontSize: 15.5, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          {day.confirmed && <CheckCircle size={17} />} {day.confirmed ? `Day ${day.dayNum} confirmed` : `Confirm Day ${day.dayNum}`} — {isLast ? "review trip" : "next day"} <ChevronRight size={17} />
        </button>
        {allConfirmed && <button onClick={onGotoOverview} style={{ ...SANS, cursor: "pointer", width: "100%", marginTop: 10, background: "none", border: "none", color: ACCENT, fontSize: 14, fontWeight: 600 }}>View full trip itinerary →</button>}
      </div>
    </div>
  );
}

// ── Lunch ──────────────────────────────────────────────────────
function LunchScreen({ dayNum, picks, search, onBack, onSelect, onSuggest, city, meal = "lunch" }) {
  const [searching, setSearching] = useState(false);
  const [more, setMore] = useState([]);     // extra AI-prompted picks
  const [loadingMore, setLoadingMore] = useState(false);

  const seen = new Set();
  const all = [...picks, ...more].filter((l) => { const k = (l.name || "").toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });

  const promptMore = () => {
    setLoadingMore(true);
    Promise.resolve(onSuggest(all.map((l) => l.name))).then((r) => setMore((m) => [...m, ...(r || [])])).catch(() => {}).finally(() => setLoadingMore(false));
  };

  return (
    <div style={{ ...SANS, color: INK, maxWidth: 980, marginInline: "auto" }}>
      <button onClick={onBack} style={{ ...SANS, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", color: INK, fontSize: "var(--step-meta)", padding: 0 }}><ArrowLeft size={16} /> Back to Day {dayNum}</button>
      <h1 style={{ fontSize: "var(--step-h1)", fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.1, margin: "14px 0 2px" }}>Pick {meal} · Day {dayNum}</h1>
      <div style={{ color: MUTE, fontSize: "var(--step-body)", lineHeight: 1.4, maxWidth: 600 }}>Curated for a memorable team meal {meal === "dinner" ? "where the day wraps up" : "near your route"} — beautiful, delicious, and worth the story.</div>

      <div style={{ fontSize: "var(--step-caption)", fontWeight: 700, color: MUTE, letterSpacing: 0.6, marginTop: 24 }}>SCOUT'S PICKS</div>
      <div className="scout-grid" style={{ marginTop: 12 }}>{all.map((l, i) => <LunchCard key={(l.name || i) + "-" + i} l={l} onSelect={onSelect} />)}</div>

      <div style={{ maxWidth: 560, marginInline: "auto" }}>
        <button onClick={promptMore} disabled={loadingMore} style={{ ...SANS, cursor: loadingMore ? "default" : "pointer", width: "100%", marginTop: 18, border: `1.5px solid ${ACCENT}`, background: ACCENT_SOFT, color: ACCENT, borderRadius: "var(--radius-pill)", padding: "14px", fontSize: 15, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          {loadingMore ? <><span style={{ width: 15, height: 15, border: `2.5px solid ${ACCENT}40`, borderTopColor: ACCENT, borderRadius: "50%", animation: "scoutspin 0.8s linear infinite" }} /> Finding more…</> : <>✨ Prompt 5 more {meal} spots</>}
          <style>{"@keyframes scoutspin{to{transform:rotate(360deg)}}"}</style>
        </button>

        {searching ? (
          <div style={{ marginTop: 12 }}>
            <SearchSelect candidates={search} title={`Search a ${meal} spot`} placeholder="Search a restaurant by name…" cityContext={city}
              note={<>Scout pulls in its live rating, hours and address, then sets it as your {meal}.</>}
              onClose={() => setSearching(false)} onPick={(c) => onSelect(c)} />
          </div>
        ) : (
          <button onClick={() => setSearching(true)} style={{ ...SANS, cursor: "pointer", width: "100%", marginTop: 10, background: "none", border: "none", color: MUTE, fontSize: 13.5, fontWeight: 600, padding: "6px" }}>Have a specific place in mind? Search it</button>
        )}
      </div>
    </div>
  );
}

// ── Overview (full trip) ───────────────────────────────────────
function OverviewScreen({ city, dates, tiers, trip, locked, onBack, onEditDay, onLock, onUnlock, onSaveTrip, saving, session }) {
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

      {onSaveTrip && (
        <button onClick={onSaveTrip} disabled={saving} style={{ ...SANS, cursor: saving ? "default" : "pointer", width: "100%", marginTop: 16, background: ACCENT, color: "#fff", border: "none", borderRadius: 12, padding: "13px", fontSize: 15, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          <Check size={16} /> {saving ? "Saving…" : (session ? "Save to my trips" : "Sign in to save this trip")}
        </button>
      )}

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
              {day.dinner && (
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: `1px solid #F4F4F4` }}>
                  <div style={{ width: 22, height: 22, borderRadius: 11, flexShrink: 0, background: ACCENT_SOFT, color: ACCENT, display: "flex", alignItems: "center", justifyContent: "center" }}><Utensils size={12} /></div>
                  <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 14, fontWeight: 600 }}>{day.dinner.name}</div><div style={{ fontSize: 11.5, color: MUTE }}>Dinner · {day.dinner.cuisine}</div></div>
                  {day.dinner.rating != null && <span style={{ display: "inline-flex", alignItems: "center", gap: 2 }}><Star size={11} color={INK} fill={INK} /><span style={{ fontSize: 12, fontWeight: 600 }}>{day.dinner.rating}</span></span>}
                </div>
              )}
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

// Tokyo ships with a hand-curated route (the strongest demo); every other city
// is generated live by the AI scout and enriched with Google data.
// Every city — Tokyo included — is now generated live and run through the
// scheduler. (Kept as a hook in case we ever want a curated showcase again.)
const isCurated = () => false;

const fmtDuration = (mins) => {
  const h = Math.floor(mins / 60), m = mins % 60;
  return "~" + [h ? `${h} hr` : "", m ? `${m} min` : ""].filter(Boolean).join(" ");
};

// Enrich an AI-named place with live Google details (rating, hours, address,
// coordinates). Returns {} if Google can't find it — the card still renders.
async function enrichPlace(name, area, city) {
  // Anchor the lookup to the assigned neighborhood so an ambiguous name (a
  // store with branches in several places) resolves to the right location —
  // otherwise the route gets the wrong coordinates and zig-zags.
  const query = [name, area, city].filter(Boolean).join(" ");
  try {
    const results = await searchPlaces(query);
    const hit = results[0];
    if (!hit) return {};
    return { rating: hit.rating, reviews: hit.reviews, hours: hit.hours, openAt: hit.openAt, address: hit.address, lat: hit.lat, lng: hit.lng, price: hit.price, photos: hit.photos };
  } catch {
    return {};
  }
}

// ── Route optimization ─────────────────────────────────────────
// Reorder stops into an efficient walking path so you don't zig-zag across a
// neighborhood. Equirectangular distance is plenty accurate at city scale.
const coordOf = (s) => (s && s.lat != null && s.lng != null ? { lat: s.lat, lng: s.lng } : null);
const distLL = (a, b) => {
  const k = Math.cos(((a.lat + b.lat) / 2) * Math.PI / 180);
  const dx = (a.lng - b.lng) * k, dy = a.lat - b.lat;
  return Math.sqrt(dx * dx + dy * dy);
};

// All orderings of a small list (used to find the best neighborhood block
// order). Only called with a handful of neighborhoods, so the factorial cost is
// trivial.
function permutations(arr) {
  if (arr.length <= 1) return [arr];
  const res = [];
  arr.forEach((x, i) => {
    for (const p of permutations([...arr.slice(0, i), ...arr.slice(i + 1)])) res.push([x, ...p]);
  });
  return res;
}

const centroidOf = (stops) => {
  const cs = stops.map(coordOf).filter(Boolean);
  if (!cs.length) return null;
  return { lat: cs.reduce((a, c) => a + c.lat, 0) / cs.length, lng: cs.reduce((a, c) => a + c.lng, 0) / cs.length };
};

// ── Time-aware scheduling ──────────────────────────────────────
const HOTEL_DEPART_MIN = 9 * 60;   // leave the hotel ~9:00 AM
const WALK_MIN_PER_KM = 12;        // ~5 km/h walking pace

const travelMin = (a, b) => distLL(a, b) * 111 * WALK_MIN_PER_KM; // deg→km→min
const kmBetween = (a, b) => distLL(a, b) * 111;
// Driving estimate between neighborhoods: straight-line × a road factor at a
// ~20 km/h city average (Seoul-scale traffic). Stores within a neighborhood are
// walked (travelMin); the hop between neighborhoods is always driven.
const driveMin = (a, b) => (kmBetween(a, b) * 1.4) / 20 * 60;
const openMin = (s) => {
  if (typeof s.openAt === "number") return s.openAt; // exact, from structured hours
  const m = /(\d{1,2}):(\d{2})/.exec(s.hours || "");
  return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : 0; // unknown = no constraint
};
const fmtClock = (mins) => {
  const h = Math.floor(mins / 60) % 24, m = Math.round(mins % 60);
  const ap = h < 12 ? "AM" : "PM"; const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr}:${String(m).padStart(2, "0")} ${ap}`;
};

// Total realistic travel minutes along an ordered sequence of stops (from the
// hotel, if set): walking within a neighborhood, driving/riding between them.
// Used to estimate how much extra time a manual order adds vs the optimal route.
function routeMinutes(stops, hotelCoord) {
  let total = 0, prev = hotelCoord || null, prevHub = null;
  stops.forEach((s) => {
    const c = coordOf(s);
    if (!c) return;
    if (prev) total += (s.hub !== prevHub ? driveMin(prev, c) : travelMin(prev, c));
    prev = c; prevHub = s.hub;
  });
  return total;
}

// Neighborhood-block route: you spend the morning in one neighborhood, the
// early afternoon in another, the evening in a third — not ping-ponging between
// them. So we keep each neighborhood's stops together as a contiguous block,
// pick the block order that finishes the day earliest (least walking + waiting
// for stores to open, which naturally front-loads early-opening areas), and
// within each block run the time-aware greedy so you don't zig-zag inside it.
// Each stop gets a planned arrival time.
function scheduleStops(stops, hotelCoord, keepOrder = false) {
  const withC = stops.filter(coordOf);
  const without = stops.filter((s) => !coordOf(s));
  if (withC.length <= 1) return stops;

  // Group into neighborhood blocks, preserving first-seen order as a tiebreak.
  const blocks = [];
  const byHub = new Map();
  withC.forEach((s) => {
    const key = s.hub || "·";
    if (!byHub.has(key)) { const b = { hub: s.hub, stops: [] }; byHub.set(key, b); blocks.push(b); }
    byHub.get(key).stops.push(s);
  });

  // Order the stops within one block by walking + opening-time, starting from
  // the position/time you entered it; returns the placed stops and the clock +
  // position when you leave. Carrying time across blocks keeps the day honest.
  const placeBlock = (block, startPos, startTime) => {
    const remaining = block.stops.slice();
    const placed = []; let pos = startPos, time = startTime;
    while (remaining.length) {
      let bestK = 0, bestScore = Infinity, bestArrive = 0;
      // The first stop of a block is the leg from the hotel or the previous
      // neighborhood — always driven; within the block, walk between stores.
      const entry = placed.length === 0;
      remaining.forEach((s, k) => {
        const travel = !pos ? 0 : (entry ? driveMin(pos, coordOf(s)) : travelMin(pos, coordOf(s)));
        const arrive = time + travel;
        const wait = Math.max(0, openMin(s) - arrive);
        const score = travel + wait;
        if (score < bestScore) { bestScore = score; bestK = k; bestArrive = Math.max(arrive, openMin(s)); }
      });
      const s = remaining.splice(bestK, 1)[0];
      placed.push({ ...s, arriveMin: bestArrive, eta: fmtClock(bestArrive) });
      time = bestArrive + (s.dwell || 16); pos = coordOf(s);
    }
    return { placed, endPos: pos, endTime: time };
  };

  const runSeq = (seq) => {
    let pos = hotelCoord || null, time = HOTEL_DEPART_MIN;
    const out = [];
    for (const b of seq) {
      const r = placeBlock(b, pos, time);
      out.push(...r.placed); pos = r.endPos; time = r.endTime;
    }
    return { out, endTime: time };
  };

  // Try every block order when there are only a few neighborhoods (the usual
  // case — max three a day); fall back to first-seen order otherwise. When
  // keepOrder is set (the scout has manually arranged the neighborhoods, or
  // we're appending one), honor the given block order instead of optimizing.
  const candidates = (!keepOrder && blocks.length <= 4) ? permutations(blocks) : [blocks];
  let best = null;
  for (const seq of candidates) {
    const r = runSeq(seq);
    if (!best || r.endTime < best.endTime) best = r;
  }

  return [...best.out, ...without];
}

// Position lunch at the ~1 PM point of the route: anchor it after the last stop
// you reach by 1 PM (so it lands wherever you are mid-route), and push the
// afternoon arrival times back by the lunch break once a lunch is chosen.
const LUNCH_AT = 13 * 60;   // aim for ~1:00 PM
const LUNCH_MIN = 50;       // a ~50-minute lunch
function applyLunch(d) {
  const flat = d.itinerary.flatMap((h) => h.stops);
  if (!flat.length) return { ...d, lunchAfterId: null, lunchAt: fmtClock(LUNCH_AT) };
  let anchor = flat[0];
  for (const s of flat) if (typeof s.arriveMin === "number" && s.arriveMin <= LUNCH_AT) anchor = s;
  if (d.lunch) {
    let after = false;
    flat.forEach((s) => {
      if (s.id === anchor.id) { after = true; return; }
      if (after && typeof s.arriveMin === "number") { s.arriveMin += LUNCH_MIN; s.eta = fmtClock(s.arriveMin); }
    });
  }
  const lunchAt = fmtClock(Math.max(LUNCH_AT, (anchor.arriveMin || LUNCH_AT) + (anchor.dwell || 16)));
  return { ...d, lunchAfterId: anchor.id, lunchAnchor: coordOf(anchor), lunchAt };
}

// Re-run the scheduler on one day's stops with a given hotel coordinate, then
// regroup consecutive stops by neighborhood and relabel the flow. keepOrder
// preserves the current neighborhood-block order (for manual reordering / edits)
// instead of re-optimizing which neighborhood comes first.
function rescheduleItinerary(d, hotelCoord, keepOrder = false) {
  const ordered = scheduleStops(d.itinerary.flatMap((h) => h.stops), hotelCoord, keepOrder);
  const itinerary = [];
  ordered.forEach((s) => {
    const last = itinerary[itinerary.length - 1];
    if (last && last.hub === s.hub) last.stops.push(s);
    else itinerary.push({ hub: s.hub, stops: [s] });
  });
  itinerary.forEach((h, i) => {
    const mins = h.stops.reduce((a, s) => a + (s.dwell || 16), 0);
    h.time = fmtDuration(mins);
    h.arrive = i === 0 ? "Start here" : `From ${itinerary[i - 1].hub}`;
  });
  const label = itinerary.map((h) => h.hub).filter(Boolean).join(" → ") || d.label;
  return applyLunch({ ...d, itinerary, label });
}

// Drop stores whose resolved location is a clear geographic outlier within their
// neighborhood — usually an AI mis-tag (a shop in another area/borough). We use
// the median position of the block (robust to the outlier itself) and drop
// anything beyond a relative-or-1.5km limit. Only applied with enough stores to
// judge, and never drops more than a third of a block.
function dropHubOutliers(stores) {
  const withC = stores.filter((s) => s.lat != null && s.lng != null);
  if (withC.length < 4) return stores;
  const med = (arr) => { const a = [...arr].sort((x, y) => x - y); return a[Math.floor(a.length / 2)]; };
  const center = { lat: med(withC.map((s) => s.lat)), lng: med(withC.map((s) => s.lng)) };
  const limit = Math.max(1.5, med(withC.map((s) => kmBetween(center, { lat: s.lat, lng: s.lng }))) * 2.2);
  const kept = stores.filter((s) => s.lat == null || kmBetween(center, { lat: s.lat, lng: s.lng }) <= limit);
  return kept.length >= Math.ceil(stores.length * 0.67) ? kept : stores;
}

// Build a full trip for a non-curated city: ask the AI scout for the structure,
// then enrich every store and lunch spot with live Google data in parallel.
async function buildLiveTrip(city, tiers, dayCount, hotel, plan = null) {
  const data = await generateItinerary(city, tiers, dayCount, plan);
  const days = (data.days || []).slice(0, dayCount);
  if (!days.length) throw new Error("empty-itinerary");
  const hotelCoord = hotel && hotel.lat != null ? { lat: hotel.lat, lng: hotel.lng } : null;

  return Promise.all(days.map(async (d, di) => {
    // Enrich every store (tagged with its neighborhood), then schedule the day
    // as ordered neighborhood blocks — a chunk of the day per area — so the
    // route reads morning → afternoon → evening instead of zig-zagging.
    const enriched = await Promise.all((d.hubs || []).map((h, hi) =>
      Promise.all((h.stores || []).map(async (s) => {
        const enr = await enrichPlace(s.name, h.hub, city);
        return { id: `${slug(s.name)}-${di}-${hi}`, name: s.name, tier: s.tier, why: s.why, hub: h.hub, dwell: 16, ...enr, confirmed: true, addedByUser: false };
      }))
    ));
    // The AI sometimes tags a store to the wrong neighborhood (e.g. a Brooklyn
    // shop placed in the Lower East Side); once Google resolves its real
    // coordinates it sits far from the rest of the block and warps the route.
    // Drop those geographic outliers within each neighborhood.
    const ordered = scheduleStops(enriched.map(dropHubOutliers).flat(), hotelCoord);
    // Regroup the scheduled stops back into their neighborhood blocks for the
    // cards — now each neighborhood is one contiguous stretch of the day.
    const itinerary = [];
    ordered.forEach((s) => {
      const last = itinerary[itinerary.length - 1];
      if (last && last.hub === s.hub) last.stops.push(s);
      else itinerary.push({ hub: s.hub, stops: [s] });
    });
    itinerary.forEach((h, i) => {
      const mins = h.stops.reduce((a, s) => a + (s.dwell || 16), 0);
      h.time = fmtDuration(mins);
      h.arrive = i === 0 ? "Start here" : `From ${itinerary[i - 1].hub}`;
    });
    const enrichMeal = (list) => Promise.all((list || []).map(async (l) => {
      const enr = await enrichPlace(l.name, city);
      return { name: l.name, cuisine: l.cuisine, why: l.why, ...enr };
    }));
    const lunchPicks = await enrichMeal(d.lunch);
    const dinnerPicks = await enrichMeal(d.dinner);
    // Label the day from the actual scheduled block order, so the header matches
    // the route even when the scheduler reorders neighborhoods.
    const label = itinerary.map((h) => h.hub).filter(Boolean).join(" → ") || d.label || `${city} · Day ${di + 1}`;

    // Curate the day fully: auto-pick the best lunch near the ~1 PM point of the
    // route, and the best dinner near where the day wraps up. The scout can still
    // change either. Run applyLunch once to find the lunch anchor, then again
    // with the chosen lunch so the afternoon times shift for the break.
    const base = applyLunch({ dayNum: di + 1, label, lunch: null, dinner: null, confirmed: false, lunchPicks, lunchSearch: lunchPicks, dinnerPicks, dinnerSearch: dinnerPicks, addCandidates: [], itinerary });
    const lunchPick = nearestPick(lunchPicks, base.lunchAnchor);
    const lastBlock = itinerary[itinerary.length - 1];
    const lastStop = lastBlock && lastBlock.stops[lastBlock.stops.length - 1];
    const dinnerPick = nearestPick(dinnerPicks, coordOf(lastStop)) || dinnerPicks[0] || null;
    return applyLunch({ ...base, lunch: lunchPick ? { ...lunchPick } : null, dinner: dinnerPick ? { ...dinnerPick } : null });
  }));
}

// Pick the meal option closest to a coordinate (the lunch anchor, or where the
// day ends for dinner); falls back to the first option when there are no coords.
function nearestPick(picks, coord) {
  if (!picks || !picks.length) return null;
  if (!coord) return picks[0];
  return [...picks].sort((a, b) => {
    const da = a.lat != null ? distLL(coord, { lat: a.lat, lng: a.lng }) : Infinity;
    const db = b.lat != null ? distLL(coord, { lat: b.lat, lng: b.lng }) : Infinity;
    return da - db;
  })[0];
}

// Single-character static-map labels: 1–9 then A–Z, matching the card badges.
const AREA_LABELS = "123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

// Overview map for the neighborhood picker: the hotel (green H) plus a labelled
// pin for each neighborhood, so the scout sees where everything sits relative to
// where they're staying. The neighborhood currently scrolled into view is
// emphasised (larger accent pin) so the map tracks the list. Coordinates come
// from the same cached lookup that supplies each card's storefront photos.
function NeighborhoodMap({ options, city, hotel, activeIndex }) {
  const [coords, setCoords] = useState([]);
  const [failed, setFailed] = useState(false);
  const sig = options.map((o) => o.name).join("|");
  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    (async () => {
      const out = new Array(options.length).fill(null);
      await Promise.all(options.map(async (o, i) => {
        const info = await lookupAreaInfo(o.name, city);
        out[i] = info.coord;
      }));
      if (!cancelled) setCoords(out);
    })();
    return () => { cancelled = true; };
  }, [sig, city]);

  const resolved = options.map((o, i) => (coords[i] ? { label: AREA_LABELS[i], coord: coords[i] } : null)).filter(Boolean);
  const skel = { height: 150, borderRadius: 14, border: `1px solid ${LINE}`, display: "flex", alignItems: "center", justifyContent: "center", color: MUTE, fontSize: 13, background: `linear-gradient(135deg, ${ACCENT_SOFT}, #eef1f0)` };
  if (failed) return <div style={skel}>Map unavailable — pick by description below.</div>;
  if (resolved.length < 1) return <div style={skel}><span>Mapping {city || "the city"}…</span></div>;

  const m = resolved.map((r) => `${r.label},${r.coord.lat},${r.coord.lng}`).join("|");
  const homeStr = hotel && hotel.lat != null ? `${hotel.lat},${hotel.lng}` : "";
  const activeLabel = AREA_LABELS[activeIndex] || "";
  const src = `/api/areamap?m=${encodeURIComponent(m)}&active=${encodeURIComponent(activeLabel)}` + (homeStr ? `&home=${encodeURIComponent(homeStr)}` : "");
  return (
    <div style={{ position: "relative", borderRadius: 14, overflow: "hidden", border: `1px solid ${LINE}`, boxShadow: CARD_SHADOW }}>
      <img src={src} alt="Neighborhoods map" onError={() => setFailed(true)}
        onLoad={(e) => { if (e.currentTarget.naturalWidth === 0) setFailed(true); }}
        style={{ width: "100%", height: 150, objectFit: "cover", display: "block", background: "#eef1f0" }} />
      {homeStr && (
        <div style={{ position: "absolute", bottom: 8, left: 8, pointerEvents: "none", background: "rgba(255,255,255,0.94)", color: INK, fontSize: 11, fontWeight: 600, borderRadius: 999, padding: "4px 9px", display: "flex", alignItems: "center", gap: 5, boxShadow: CARD_SHADOW }}>
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: NEON, border: `1px solid ${INK}` }} /> Your hotel
        </div>
      )}
    </div>
  );
}

// Card view / List view toggle (spec §5). Active label + icon in --accent.
function ViewToggle({ view, onView }) {
  const btn = (v, Icon, label) => {
    const on = view === v;
    return (
      <button onClick={() => onView(v)} aria-pressed={on} style={{ ...SANS, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6, background: "none", border: "none", padding: "4px 2px", fontSize: 13.5, fontWeight: 600, color: on ? ACCENT : INK }}>
        <Icon size={16} /> {label}
      </button>
    );
  };
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 16 }}>
      {btn("card", LayoutGrid, "Card view")}
      {btn("list", List, "List view")}
    </div>
  );
}

// Compact list-view row for a neighborhood (spec §5 list view).
function HoodRow({ o, n, city, on, onToggle }) {
  return (
    <button onClick={onToggle} style={{ ...SANS, cursor: "pointer", width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: 14, border: `1px solid ${on ? ACCENT : LINE}`, background: on ? ACCENT_SOFT : "#fff", borderRadius: "var(--radius-sm)", padding: "10px 12px" }}>
      <div style={{ width: 20, height: 20, borderRadius: 6, flexShrink: 0, border: `1.5px solid ${on ? ACCENT : LINE}`, background: on ? ACCENT : "#fff", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>{on && <Check size={13} />}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-0.01em", color: on ? ACCENT : INK }}>{o.name}</div>
        <div style={{ fontSize: 12.5, color: MUTE, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{o.blurb}</div>
      </div>
      <span style={{ fontSize: "var(--step-caption)", fontWeight: 600, color: MUTE, flexShrink: 0 }}>{n}</span>
    </button>
  );
}

// Full-bleed image card (Pangram Pangram style): the photo fills the card, the
// name sits large in white over the centre, the blurb small beneath. Minimal —
// no coloured outline. Tap to add/remove from the plan.
function HoodCard({ o, n, city, on, onToggle }) {
  return (
    <div onClick={onToggle} style={{ position: "relative", aspectRatio: "4 / 5", borderRadius: "var(--radius-card)", overflow: "hidden", cursor: "pointer", background: "#111", boxShadow: CARD_SHADOW }}>
      <div style={{ position: "absolute", inset: 0 }}>
        <PhotoStrip name={o.name} loader={() => lookupAreaInfo(o.name, city).then((info) => info.photos)} grad="linear-gradient(135deg,#2b2b2b,#555)" hideDots />
      </div>
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", background: "linear-gradient(180deg, rgba(0,0,0,0.34) 0%, rgba(0,0,0,0.08) 38%, rgba(0,0,0,0.64) 100%)" }} />
      <div style={{ position: "absolute", top: 14, left: 16, pointerEvents: "none", color: "rgba(255,255,255,0.85)", fontSize: "var(--step-caption)", fontWeight: 600, textShadow: "0 1px 6px rgba(0,0,0,0.5)" }}>{String(n).padStart(2, "0")}</div>
      <div style={{ position: "absolute", top: 12, right: 12, pointerEvents: "none", width: 28, height: 28, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center", background: on ? NEON : "transparent", color: "#0A0A0A", border: on ? "none" : "1.5px solid rgba(255,255,255,0.8)", boxShadow: on ? "0 2px 10px rgba(0,0,0,0.4)" : "none" }}>{on && <Check size={16} strokeWidth={3} />}</div>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "24px 22px", pointerEvents: "none" }}>
        <div style={{ color: "#fff", fontSize: CARD_TITLE, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.06, textShadow: "0 2px 16px rgba(0,0,0,0.55)" }}>{o.name}</div>
        <div style={{ color: "rgba(255,255,255,0.92)", fontSize: "var(--step-meta)", lineHeight: 1.45, marginTop: 10, textShadow: "0 1px 8px rgba(0,0,0,0.6)" }}>{o.blurb}</div>
      </div>
    </div>
  );
}

// The pre-curated, day-by-day neighborhood plan. Each day is a geographically
// grouped set of districts in optimal order; everything is pre-selected, and the
// scout can deselect any before building the full itinerary.
function NeighborhoodsScreen({ city, hotel, planDays, loading, selected, onToggle, onBack, onBuild, view, onView }) {
  const totalSelected = planDays.reduce((a, d) => a + (d.neighborhoods || []).filter((h) => selected.has(h.name)).length, 0);

  return (
    <div style={{ ...SANS, color: INK, maxWidth: 1180, marginInline: "auto" }}>
      <button onClick={onBack} style={{ ...SANS, cursor: "pointer", background: "none", border: "none", color: MUTE, fontSize: "var(--step-meta)", padding: 0, marginBottom: 16, display: "flex", alignItems: "center", gap: 4 }}>
        <ChevronLeft size={16} /> Edit trip
      </button>
      <h1 style={{ fontSize: "var(--step-h1)", fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.1, margin: 0 }}>Your {city || "city"} plan</h1>
      <p style={{ color: MUTE, fontSize: "var(--step-body)", marginTop: 8, lineHeight: 1.5, maxWidth: 640 }}>
        Scout's curated route through {city || "the city"}'s most design-led districts — grouped by day in the optimal order so you see as much of the city as possible. Read why each matters for an apparel team, and deselect anything you'd skip.
      </p>

      {loading ? (
        <div style={{ textAlign: "center", padding: "60px 0" }}>
          <div style={{ width: 28, height: 28, margin: "0 auto 16px", border: `3px solid ${LINE}`, borderTopColor: ACCENT, borderRadius: "50%", animation: "scoutspin 0.8s linear infinite" }} />
          <style>{"@keyframes scoutspin{to{transform:rotate(360deg)}}"}</style>
          <div style={{ color: MUTE, fontSize: 14 }}>Curating your {city || "city"} plan…</div>
        </div>
      ) : planDays.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px 0" }}>
          <p style={{ color: MUTE, fontSize: 14, lineHeight: 1.5, maxWidth: 320, marginInline: "auto" }}>
            Couldn't curate a plan for {city || "this city"} just now — we'll let Scout choose the best areas as it builds.
          </p>
          <button onClick={onBuild} style={{ ...SANS, cursor: "pointer", marginTop: 20, background: ACCENT, color: "var(--accent-ink)", border: "none", borderRadius: "var(--radius-pill)", padding: "14px 28px", fontSize: 15, fontWeight: 600 }}>Build my itinerary</button>
        </div>
      ) : (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 24, paddingBottom: 12, borderBottom: `1px solid ${LINE}` }}>
            <div style={{ fontSize: "var(--step-meta)", fontWeight: 600, color: MUTE }}>{totalSelected} of {planDays.reduce((a, d) => a + (d.neighborhoods || []).length, 0)} selected</div>
            <ViewToggle view={view} onView={onView} />
          </div>

          {planDays.map((day, di) => {
            const hoods = day.neighborhoods || [];
            return (
              <div key={di} style={{ marginTop: 28 }}>
                <div style={{ fontSize: "var(--step-h3)", fontWeight: 700, letterSpacing: "-0.02em" }}>Day {di + 1}</div>
                <div style={{ fontSize: "var(--step-meta)", color: MUTE, marginTop: 2, marginBottom: 16 }}>{hoods.map((h) => h.name).join(" → ")}</div>
                {view === "list" ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {hoods.map((o, i) => <HoodRow key={o.name + i} o={o} n={i + 1} city={city} on={selected.has(o.name)} onToggle={() => onToggle(o.name)} />)}
                  </div>
                ) : (
                  <div className="scout-grid">
                    {hoods.map((o, i) => <HoodCard key={o.name + i} o={o} n={i + 1} city={city} on={selected.has(o.name)} onToggle={() => onToggle(o.name)} />)}
                  </div>
                )}
              </div>
            );
          })}
          <button onClick={onBuild} disabled={totalSelected === 0} style={{ ...SANS, cursor: totalSelected ? "pointer" : "default", marginTop: 32, width: "100%", maxWidth: 420, marginInline: "auto", display: "block", background: totalSelected ? ACCENT : LINE, color: totalSelected ? "var(--accent-ink)" : MUTE, border: "none", borderRadius: "var(--radius-pill)", padding: "16px 28px", fontSize: 16, fontWeight: 700 }}>
            {totalSelected ? `Build itinerary · ${totalSelected} neighborhood${totalSelected > 1 ? "s" : ""}` : "Select at least one neighborhood"}
          </button>
          <div style={{ textAlign: "center", color: MUTE, fontSize: "var(--step-meta)", marginTop: 12, lineHeight: 1.5 }}>Scout fills each neighborhood with the best stores, plus a curated lunch and dinner.</div>
        </>
      )}
    </div>
  );
}

function BuildingScreen({ city }) {
  return (
    <div style={{ ...SANS, color: INK, textAlign: "center", padding: "80px 0" }}>
      <div style={{ display: "inline-flex", alignItems: "center", gap: 8, justifyContent: "center" }}>
        <span style={{ fontSize: 23, fontWeight: 800, letterSpacing: -0.5, color: ACCENT, textTransform: "uppercase" }}>Scout</span>
        <svg viewBox="0 0 413.62 144.78" width="31" height="11" aria-hidden="true" style={{ display: "block" }}>
          <path fill={ACCENT} transform="translate(-49.19 -183.61)" d="M462.81,183.61,160.21,312.47Q122.57,328.39,97,328.39q-29,0-42-20.27-8.2-13-4.83-33.06T68,232.35Q80.1,214,107.61,184.09a105.53,105.53,0,0,0-13.51,31.85q-7.24,30.89,13,45.37,9.65,6.76,26.54,6.76a123.37,123.37,0,0,0,30.4-4.34Z" />
        </svg>
      </div>
      <div style={{ width: 30, height: 30, margin: "28px auto 18px", border: `3px solid ${LINE}`, borderTopColor: ACCENT, borderRadius: "50%", animation: "scoutspin 0.8s linear infinite" }} />
      <style>{"@keyframes scoutspin{to{transform:rotate(360deg)}}"}</style>
      <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: -0.4 }}>Scouting {city || "your city"}…</div>
      <p style={{ color: MUTE, fontSize: 14, marginTop: 8, lineHeight: 1.5, maxWidth: 300, marginInline: "auto" }}>Curating the stores worth your time and pulling live ratings, hours and maps. This takes a few seconds.</p>
    </div>
  );
}

function BuildErrorScreen({ city, onRetry, onBack }) {
  return (
    <div style={{ ...SANS, color: INK, textAlign: "center", padding: "70px 0" }}>
      <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: -0.4 }}>Couldn't build {city || "that city"} just now</div>
      <p style={{ color: MUTE, fontSize: 14, marginTop: 8, lineHeight: 1.5, maxWidth: 320, marginInline: "auto" }}>The scout took too long or hit a snag. This usually clears on a second try.</p>
      <button onClick={onRetry} style={{ ...SANS, cursor: "pointer", marginTop: 22, background: ACCENT, color: "#fff", border: "none", borderRadius: 12, padding: "13px 26px", fontSize: 15, fontWeight: 600 }}>Try again</button>
      <div><button onClick={onBack} style={{ ...SANS, cursor: "pointer", marginTop: 14, background: "none", border: "none", color: MUTE, fontSize: 14 }}>Edit trip</button></div>
    </div>
  );
}

function GoogleG() {
  return (
    <svg width="15" height="15" viewBox="0 0 48 48" aria-hidden="true" style={{ display: "block" }}>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.9 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.3-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 10-2 13.6-5.2l-6.3-5.2C29.2 35.5 26.7 36 24 36c-5.3 0-9.7-3.1-11.3-7.4l-6.5 5C9.6 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4 5.5l6.3 5.2C41.2 36.1 44 30.6 44 24c0-1.3-.1-2.3-.4-3.5z" />
    </svg>
  );
}

function Logo({ size = 22 }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ fontSize: size * 1.04, fontWeight: 800, letterSpacing: -0.5, color: ACCENT, textTransform: "uppercase" }}>Scout</span>
      <svg viewBox="0 0 413.62 144.78" width={size * 1.4} height={size * 0.5} aria-hidden="true" style={{ display: "block" }}>
        <path fill={ACCENT} transform="translate(-49.19 -183.61)" d="M462.81,183.61,160.21,312.47Q122.57,328.39,97,328.39q-29,0-42-20.27-8.2-13-4.83-33.06T68,232.35Q80.1,214,107.61,184.09a105.53,105.53,0,0,0-13.51,31.85q-7.24,30.89,13,45.37,9.65,6.76,26.54,6.76a123.37,123.37,0,0,0,30.4-4.34Z" />
      </svg>
    </div>
  );
}

// Persistent top bar on every screen: Scout logo on the left, menu on the right.
function AppHeader({ onMenu, showMenu }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
      <Logo />
      {showMenu && (
        <button onClick={onMenu} aria-label="Menu" style={{ ...SANS, cursor: "pointer", background: "#fff", border: `1px solid ${LINE}`, borderRadius: 11, width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center", color: INK, boxShadow: CARD_SHADOW }}>
          <Menu size={20} />
        </button>
      )}
    </div>
  );
}

// Slide-in navigation: account, jump between days, change hotel, saved trips,
// and start a new search.
function NavDrawer({ open, onClose, session, onSignIn, onSignOut, trip, activeDay, onJumpDay, savedTrips, onLoadTrip, onDeleteTrip, onNewSearch, hotel, onChangeHotel, city }) {
  const [hq, setHq] = useState("");
  const [hsug, setHsug] = useState([]);
  const [openTripId, setOpenTripId] = useState(null);
  useEffect(() => {
    if (!open) { setHq(""); setHsug([]); }
  }, [open]);
  useEffect(() => {
    const term = hq.trim();
    if (term.length < 2) { setHsug([]); return; }
    let cancel = false;
    const t = setTimeout(() => { searchPlaces(`${term} ${city || ""}`).then((r) => { if (!cancel) setHsug(r.slice(0, 4)); }).catch(() => {}); }, 300);
    return () => { cancel = true; clearTimeout(t); };
  }, [hq]);
  if (!open) return null;

  const sectionLabel = { fontSize: 11.5, fontWeight: 700, color: MUTE, letterSpacing: 0.5, textTransform: "uppercase", margin: "20px 0 8px" };
  const row = { ...SANS, cursor: "pointer", width: "100%", textAlign: "left", background: "none", border: "none", padding: "11px 0", fontSize: 15, color: INK, display: "flex", alignItems: "center", gap: 10 };
  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 40 }} />
      <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: "min(86vw, 340px)", background: "#fff", zIndex: 41, boxShadow: "-8px 0 24px rgba(0,0,0,0.14)", display: "flex", flexDirection: "column", overflowY: "auto", padding: "22px 20px 40px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Logo size={20} />
          <button onClick={onClose} aria-label="Close" style={{ ...SANS, cursor: "pointer", background: "none", border: "none", color: MUTE }}><X size={22} /></button>
        </div>

        {session ? (
          <div style={{ marginTop: 18 }}>
            <div style={{ fontSize: 13, color: MUTE, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{session.user?.email}</div>
            <button onClick={() => { onSignOut(); onClose(); }} style={{ ...row, color: DANGER, marginTop: 4 }}><LogOut size={17} /> Sign out</button>
          </div>
        ) : (
          <button onClick={() => { onSignIn(); }} style={{ ...SANS, cursor: "pointer", display: "flex", alignItems: "center", gap: 8, marginTop: 18, background: "#fff", border: `1px solid ${LINE}`, borderRadius: 999, padding: "9px 14px", fontSize: 14, fontWeight: 600, color: INK, boxShadow: CARD_SHADOW }}><GoogleG /> Sign in with Google</button>
        )}

        {trip.length > 0 && (
          <>
            <div style={sectionLabel}>This trip{city ? ` · ${city}` : ""}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {trip.map((d, i) => (
                <button key={i} onClick={() => { onJumpDay(i); onClose(); }} style={{ ...SANS, cursor: "pointer", textAlign: "left", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 14, fontWeight: 600, padding: "10px 12px", borderRadius: 10, border: `1px solid ${i === activeDay ? ACCENT : LINE}`, background: i === activeDay ? ACCENT_SOFT : "#fff", color: i === activeDay ? ACCENT : INK }}>
                  <span>Day {d.dayNum}</span>{d.date ? <span style={{ fontSize: 12.5, color: MUTE, fontWeight: 500 }}>{d.date}</span> : null}
                </button>
              ))}
            </div>

            <div style={sectionLabel}>Hotel — home base</div>
            {hotel && hotel.name && <div style={{ fontSize: 13, color: INK, marginBottom: 8 }}>{hotel.name}</div>}
            <div style={{ position: "relative" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, border: `1px solid ${LINE}`, borderRadius: 11, padding: "10px 12px" }}>
                <MapPin size={16} color={MUTE} /><input value={hq} onChange={(e) => setHq(e.target.value)} placeholder="Change hotel" style={{ ...SANS, border: "none", outline: "none", fontSize: 14.5, width: "100%", color: INK }} />
              </div>
              {hsug.length > 0 && (
                <div style={{ border: `1px solid ${LINE}`, borderRadius: 11, marginTop: 6, overflow: "hidden" }}>
                  {hsug.map((r, i) => (
                    <button key={(r.placeId || r.name) + i} onClick={() => { onChangeHotel({ name: r.name, address: r.address, lat: r.lat, lng: r.lng }); onClose(); }} style={{ ...SANS, cursor: "pointer", width: "100%", textAlign: "left", background: "#fff", border: "none", borderTop: i ? `1px solid ${LINE}` : "none", padding: "10px 12px" }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600, color: INK }}>{r.name}</div>
                      <div style={{ fontSize: 11.5, color: MUTE, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.address}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        <div style={sectionLabel}>Your trips</div>
        <button onClick={() => { onNewSearch(); onClose(); }} style={row}><Search size={17} /> New search / change city</button>
        {session ? (savedTrips.length > 0 ? savedTrips.map((t) => {
          const days = Array.isArray(t.trip) ? t.trip : [];
          const range = days.length ? `${days[0].date || ""}${days.length > 1 && days[days.length - 1].date ? ` – ${days[days.length - 1].date}` : ""}` : (t.dates || "");
          const expanded = openTripId === t.id;
          return (
            <div key={t.id} style={{ borderBottom: `1px solid #F4F4F4` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 0" }}>
                <button onClick={() => setOpenTripId(expanded ? null : t.id)} style={{ ...SANS, cursor: "pointer", flex: 1, textAlign: "left", background: "none", border: "none", padding: 0, display: "flex", alignItems: "center", gap: 9 }}>
                  <ChevronRight size={16} color={MUTE} style={{ transform: expanded ? "rotate(90deg)" : "none", transition: "transform 0.15s", flexShrink: 0 }} />
                  <span style={{ minWidth: 0 }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: INK }}>{t.city || "Trip"}</span>
                    <span style={{ display: "block", fontSize: 12, color: MUTE }}>{[range, `${days.length || ""} ${days.length === 1 ? "day" : "days"}`].filter(Boolean).join(" · ")}</span>
                  </span>
                </button>
                <button onClick={() => onDeleteTrip(t.id)} aria-label="Delete trip" style={{ ...SANS, cursor: "pointer", background: "none", border: "none", color: MUTE, padding: 4 }}><Trash2 size={15} /></button>
              </div>
              {expanded && (
                <div style={{ paddingLeft: 25, paddingBottom: 10, display: "flex", flexDirection: "column", gap: 6 }}>
                  {days.map((d, i) => (
                    <button key={i} onClick={() => { onLoadTrip(t, i); onClose(); }} style={{ ...SANS, cursor: "pointer", textAlign: "left", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#fff", border: `1px solid ${LINE}`, borderRadius: 10, padding: "9px 11px", fontSize: 13.5, color: INK }}>
                      <span style={{ fontWeight: 600 }}>Day {d.dayNum}</span>{d.date ? <span style={{ fontSize: 12, color: MUTE }}>{d.date}</span> : null}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        }) : <div style={{ fontSize: 12.5, color: MUTE, padding: "8px 0" }}>No saved trips yet — build one and it auto-saves here.</div>) : null}
      </div>
    </>
  );
}

const SESSION_KEY = "scout.session.v2";

export default function App() {
  const [screen, setScreen] = useState("input");
  const [city, setCity] = useState("Tokyo");
  const [hotel, setHotel] = useState(null);
  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);
  const [tiers, setTiers] = useState(CURATED_TIERS);
  const [trip, setTrip] = useState([]);
  const [activeDay, setActiveDay] = useState(0);
  const [locked, setLocked] = useState(false);
  const [flash, setFlash] = useState("");
  const [session, setSession] = useState(null);
  const [savedTrips, setSavedTrips] = useState([]);
  const [saving, setSaving] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [currentTripId, setCurrentTripId] = useState(null);
  const [planDays, setPlanDays] = useState([]); // pre-curated day-by-day neighborhood plan
  const [selectedHoods, setSelectedHoods] = useState(() => new Set()); // chosen neighborhood names
  const [areaLoading, setAreaLoading] = useState(false);
  const [collapsed, setCollapsed] = useState(() => new Set()); // collapsed neighborhood blocks on the review page
  const [cardView, setCardView] = useState("card"); // "card" | "list" — catalog view mode
  const hydrated = useRef(false);
  const autoTimer = useRef(null);
  const autoBusy = useRef(false);

  // Restore the in-progress trip from localStorage on load, so a refresh or
  // leaving the tab never loses your work — independent of being signed in.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (s.city) setCity(s.city);
        if (s.hotel) setHotel(s.hotel);
        if (Array.isArray(s.tiers)) setTiers(s.tiers);
        if (s.start) setStartDate(new Date(s.start));
        if (s.end) setEndDate(new Date(s.end));
        if (s.currentTripId) setCurrentTripId(s.currentTripId);
        if (Array.isArray(s.trip) && s.trip.length) {
          setTrip(s.trip);
          setActiveDay(s.activeDay || 0);
          setLocked(!!s.locked);
          setScreen(s.screen && s.screen !== "building" && s.screen !== "builderror" ? s.screen : "review");
        }
      }
    } catch {}
    hydrated.current = true;
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify({
        city, hotel, tiers, currentTripId, trip, activeDay, locked,
        start: startDate ? startDate.toISOString() : null,
        end: endDate ? endDate.toISOString() : null,
        screen: (screen === "building" || screen === "builderror" || screen === "neighborhoods") ? "input" : screen,
      }));
    } catch {}
  }, [city, hotel, tiers, startDate, endDate, trip, activeDay, locked, screen, currentTripId]);

  // Track the Supabase auth session and load this user's saved trips.
  useEffect(() => {
    if (!authEnabled) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const refreshTrips = () => { if (session) listTrips().then(setSavedTrips).catch(() => {}); };
  useEffect(() => { if (session) refreshTrips(); else setSavedTrips([]); }, [session]);

  const signIn = () => supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin, queryParams: { prompt: "select_account" } } });
  const signOut = () => supabase.auth.signOut();

  // Insert a new row or update the one this trip already maps to.
  const persistTrip = async () => {
    const payload = { city, dates, tiers, trip };
    if (currentTripId) { await updateTrip(currentTripId, payload); return currentTripId; }
    const row = await saveTrip(payload); setCurrentTripId(row.id); return row.id;
  };

  // Auto-save to the account (debounced) whenever the signed-in user's trip
  // changes, so it's always backed up without tapping Save.
  useEffect(() => {
    if (!hydrated.current || !authEnabled || !session || !trip.length) return;
    clearTimeout(autoTimer.current);
    autoTimer.current = setTimeout(async () => {
      if (autoBusy.current) return;
      autoBusy.current = true;
      try { await persistTrip(); refreshTrips(); } catch {} finally { autoBusy.current = false; }
    }, 1500);
    return () => clearTimeout(autoTimer.current);
  }, [trip, city, tiers, session, currentTripId]);

  const onSaveTrip = async () => {
    if (!session) { signIn(); return; }
    setSaving(true);
    try {
      await persistTrip();
      refreshTrips();
      setFlash("Trip saved to your account.");
      setTimeout(() => setFlash(""), 4000);
    } catch {
      setFlash("Couldn't save the trip — try again.");
      setTimeout(() => setFlash(""), 4000);
    } finally {
      setSaving(false);
    }
  };

  const onLoadTrip = (t, dayIndex = 0) => {
    setCity(t.city); setTiers(t.tiers || []); setTrip(t.trip || []); setCurrentTripId(t.id);
    setCollapsed(new Set()); // open with neighborhoods expanded
    setActiveDay(dayIndex); setLocked(false); setScreen("review"); window.scrollTo(0, 0);
  };

  const onDeleteTrip = async (id) => { try { await deleteTrip(id); if (id === currentTripId) setCurrentTripId(null); refreshTrips(); } catch {} };

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
      itinerary: src.hubs.map((h) => ({ ...h, stops: h.stops.filter((s) => tiers.includes(s.tier)).map((s) => ({ ...s, id: slug(s.name), confirmed: true, addedByUser: false })) })),
    };
  });
  // Step 1: pre-curate a day-by-day neighborhood plan for the trip — geographically
  // grouped, optimal order, the design-led districts — and show it for review.
  // Everything is pre-selected; the scout can deselect before building.
  const startNeighborhoods = async () => {
    const n = Math.max(1, dayCount);
    const useTiers = tiers.length ? tiers : CURATED_TIERS;
    setActiveDay(0); setLocked(false); setFlash(""); setCurrentTripId(null);
    setPlanDays([]); setSelectedHoods(new Set()); setAreaLoading(true);
    setScreen("neighborhoods");
    try {
      const days = await suggestNeighborhoodPlan(city, useTiers, n);
      setPlanDays(days);
      setSelectedHoods(new Set(days.flatMap((d) => (d.neighborhoods || []).map((h) => h.name))));
    } catch {
      setPlanDays([]);
    } finally {
      setAreaLoading(false);
    }
  };

  const toggleHood = (name) =>
    setSelectedHoods((p) => { const s = new Set(p); s.has(name) ? s.delete(name) : s.add(name); return s; });

  // Step 2: build the full itinerary from the chosen day-by-day neighborhood
  // plan. The AI fills the best stores into exactly those neighborhoods per day.
  const build = async () => {
    const n = Math.max(1, dayCount);
    const useTiers = tiers.length ? tiers : CURATED_TIERS;
    // Per-day list of selected neighborhood names; drop empty days.
    const plan = planDays
      .map((d) => (d.neighborhoods || []).filter((h) => selectedHoods.has(h.name)).map((h) => h.name))
      .filter((day) => day.length);
    setActiveDay(0); setLocked(false); setFlash(""); setCurrentTripId(null);
    setScreen("building");
    try {
      const live = await buildLiveTrip(city, useTiers, n, hotel, plan.length ? plan : null);
      const dated = live.map((d, i) => ({ ...d, date: startDate ? fmtShort(addDays(startDate, i)) : "" }));
      setTrip(dated); setCollapsed(new Set()); setScreen("review");
    } catch {
      // Generation didn't complete — show a retry rather than a wrong-city route.
      setScreen("builderror");
    }
  };

  const updateDay = (i, fn) => setTrip((prev) => prev.map((d, idx) => (idx === i ? fn(d) : d)));
  const hotelCoord = hotel && hotel.lat != null ? { lat: hotel.lat, lng: hotel.lng } : null;

  // Re-run the scheduler on a day's remaining stops so within-neighborhood order,
  // walking path, and arrival times recalibrate whenever a stop is added or
  // removed — but keep the neighborhood-block order (set at build or by the scout)
  // so editing one store doesn't reshuffle the whole day.
  const rescheduleDay = (d) => rescheduleItinerary(d, hotelCoord, true);

  // Change the hotel mid-trip and recalculate every day's route around it.
  const changeHotel = (h) => {
    setHotel(h);
    const hc = h && h.lat != null ? { lat: h.lat, lng: h.lng } : null;
    setTrip((prev) => prev.map((d) => rescheduleItinerary(d, hc, true)));
  };

  // Drag-and-drop a whole neighborhood block from one slot to another, then
  // recompute arrival times in that manual order (without re-optimizing it).
  const onReorderHub = (from, to) => updateDay(activeDay, (d) => {
    if (from === to || from < 0 || to < 0 || from >= d.itinerary.length || to >= d.itinerary.length) return d;
    const arr = [...d.itinerary];
    const [moved] = arr.splice(from, 1);
    arr.splice(to, 0, moved);
    return rescheduleItinerary({ ...d, itinerary: arr }, hotelCoord, true);
  });

  // Add a whole new neighborhood to the current day: generate its stores with
  // the AI scout, enrich them with live Google data, and append the block.
  const onAddNeighborhood = async (areaName) => {
    const data = await generateItinerary(city, tiers, 1, [areaName]);
    const day0 = (data.days || [])[0];
    const stores = (day0?.hubs || []).flatMap((h) => (h.stores || []));
    if (!stores.length) throw new Error("no-stores");
    const stamp = Date.now();
    const enriched = await Promise.all(stores.map(async (s, i) => {
      const enr = await enrichPlace(s.name, areaName, city);
      return { id: `${slug(s.name)}-add-${stamp}-${i}`, name: s.name, tier: s.tier, why: s.why, hub: areaName, dwell: 16, ...enr, confirmed: true, addedByUser: false };
    }));
    updateDay(activeDay, (d) => rescheduleItinerary({ ...d, itinerary: [...d.itinerary, { hub: areaName, stops: enriched }] }, hotelCoord, true));
    setFlash(`Added ${areaName} — ${enriched.length} stores. It's at the end; move it up to reorder.`);
    setTimeout(() => setFlash(""), 6000);
  };

  const onConfirmStop = (hi, id) => updateDay(activeDay, (d) => ({ ...d, itinerary: d.itinerary.map((h, i) => i !== hi ? h : { ...h, stops: h.stops.map((s) => s.id === id ? { ...s, confirmed: !s.confirmed } : s) }) }));
  const onRemoveStop = (hi, id) => updateDay(activeDay, (d) => rescheduleDay({ ...d, itinerary: d.itinerary.map((h, i) => i !== hi ? h : { ...h, stops: h.stops.filter((s) => s.id !== id) }) }));
  // Add a found store. With a targetHub (from a neighborhood card's "add a store
  // here"), it goes into that neighborhood; otherwise it's assigned to the
  // nearest existing neighborhood so it groups and reschedules sensibly.
  const onAddStop = (c, targetHub) => {
    updateDay(activeDay, (d) => {
      const all = d.itinerary.flatMap((h) => h.stops);
      let hub = targetHub;
      if (!hub) {
        hub = (d.itinerary.find((h) => h.stops.length) || {}).hub || c.area || "Your find";
        if (c.lat != null && c.lng != null) {
          let bestD = Infinity;
          all.forEach((s) => {
            if (s.lat != null && s.lng != null) {
              const dd = distLL({ lat: c.lat, lng: c.lng }, { lat: s.lat, lng: s.lng });
              if (dd < bestD) { bestD = dd; hub = s.hub; }
            }
          });
        }
      }
      const stop = { id: slug(c.name) + "-" + Date.now(), name: c.name, tier: c.tier, rating: c.rating, reviews: c.reviews, hours: c.hours, openAt: c.openAt, dwell: c.dwell || 18, address: c.address, why: c.why, lat: c.lat, lng: c.lng, photos: c.photos, hub, confirmed: true, addedByUser: true };
      return rescheduleDay({ ...d, itinerary: [{ hub, stops: [...all, stop] }] });
    });
    setFlash(`Added ${c.name}${targetHub ? ` to ${targetHub}` : ""} — route recalculated.`);
    setTimeout(() => setFlash(""), 5000);
  };

  // Re-optimize the day's neighborhood order (undo a manual arrangement) so the
  // route walks the shortest sensible path again.
  const onOptimizeDay = () => updateDay(activeDay, (d) => rescheduleItinerary(d, hotelCoord, false));

  // "Prompt more options": ask the AI scout for a few more real stores in a
  // neighborhood (excluding ones already on the day), enriched with live Google
  // data, for the scout to pick from. Returns candidate store objects.
  const onSuggestStores = async (hub) => {
    const day = trip[activeDay];
    const existing = day ? day.itinerary.flatMap((h) => h.stops).map((s) => s.name) : [];
    const picks = await suggestStores(city, tiers, hub, existing);
    const fresh = picks.filter((p) => !existing.some((e) => e.toLowerCase() === p.name.toLowerCase())).slice(0, 6);
    const enriched = await Promise.all(fresh.map(async (p) => {
      const enr = await enrichPlace(p.name, hub, city);
      return { name: p.name, tier: p.tier, why: p.why, ...enr };
    }));
    return enriched;
  };
  // "Prompt more" for meals: ask Scout for more real lunch/dinner spots near the
  // day's route (excluding ones already offered), enriched with live Google data
  // (rating, hours, price, photos). Returns candidate meal cards.
  const onSuggestMeals = async (meal, extraExclude = []) => {
    const d = trip[activeDay];
    if (!d) return [];
    let area = "";
    if (meal === "dinner") {
      const last = d.itinerary[d.itinerary.length - 1];
      area = last ? last.hub : "";
    } else {
      const anchorStop = d.itinerary.flatMap((h) => h.stops).find((s) => s.id === d.lunchAfterId);
      area = anchorStop ? anchorStop.hub : (d.itinerary[0] ? d.itinerary[0].hub : "");
    }
    const offered = (meal === "dinner" ? d.dinnerPicks : d.lunchPicks) || [];
    const exclude = [...offered.map((p) => p.name), ...extraExclude];
    const picks = await suggestMeals(city, area, meal, exclude);
    const fresh = picks.filter((p) => !exclude.some((e) => e.toLowerCase() === p.name.toLowerCase())).slice(0, 6);
    return Promise.all(fresh.map(async (p) => {
      const enr = await enrichPlace(p.name, area, city);
      return { name: p.name, cuisine: p.cuisine, why: p.why, ...enr };
    }));
  };
  const onSelectLunch = (l) => { updateDay(activeDay, (d) => rescheduleDay({ ...d, lunch: { cuisine: "Restaurant", ...l } })); setScreen("review"); };
  const onSelectDinner = (l) => { updateDay(activeDay, (d) => ({ ...d, dinner: { cuisine: "Restaurant", ...l } })); setScreen("review"); };
  const onClearLunch = () => updateDay(activeDay, (d) => rescheduleDay({ ...d, lunch: null }));
  const onClearDinner = () => updateDay(activeDay, (d) => ({ ...d, dinner: null }));
  const onConfirmDay = () => {
    updateDay(activeDay, (d) => ({ ...d, confirmed: true }));
    if (activeDay < trip.length - 1) { setActiveDay(activeDay + 1); window.scrollTo(0, 0); }
    else setScreen("overview");
  };

  return (
    <div style={{ background: "var(--bg)", minHeight: "100vh" }}>
      <NavDrawer open={menuOpen} onClose={() => setMenuOpen(false)} session={session} onSignIn={signIn} onSignOut={signOut} trip={trip} activeDay={activeDay} onJumpDay={(i) => { setActiveDay(i); setScreen("review"); window.scrollTo(0, 0); }} savedTrips={savedTrips} onLoadTrip={onLoadTrip} onDeleteTrip={onDeleteTrip} onNewSearch={() => setScreen("input")} hotel={hotel} onChangeHotel={changeHotel} city={city} />
      <div className="scout-container">
        <AppHeader onMenu={() => setMenuOpen(true)} showMenu />
        {screen === "input" && <div className="scout-measure"><InputScreen {...{ city, setCity, hotel, setHotel, start: startDate, end: endDate, onRange, datesLabel, dayCount, tiers, toggleTier }} onBuild={startNeighborhoods} session={session} savedTrips={savedTrips} onLoadTrip={onLoadTrip} onDeleteTrip={onDeleteTrip} /></div>}
        {screen === "neighborhoods" && <NeighborhoodsScreen city={city} hotel={hotel} planDays={planDays} loading={areaLoading} selected={selectedHoods} onToggle={toggleHood} onBack={() => setScreen("input")} onBuild={build} view={cardView} onView={setCardView} />}
        {screen === "building" && <BuildingScreen city={city} />}
        {screen === "builderror" && <BuildErrorScreen city={city} onRetry={build} onBack={() => setScreen("input")} />}
        {screen === "review" && <ReviewScreen {...{ city, dates, tiers, trip, activeDay, flash, hotel }} onBack={() => setScreen("input")} onSwitchDay={(i) => { setActiveDay(i); window.scrollTo(0, 0); }} onPickLunch={() => setScreen("lunch")} onPickDinner={() => setScreen("dinner")} onClearLunch={onClearLunch} onClearDinner={onClearDinner} onConfirmStop={onConfirmStop} onRemoveStop={onRemoveStop} onAddStop={onAddStop} onReorderHub={onReorderHub} onOptimizeDay={onOptimizeDay} onSuggestStores={onSuggestStores} onAddNeighborhood={onAddNeighborhood} collapsed={collapsed} setCollapsed={setCollapsed} view={cardView} onView={setCardView} onConfirmDay={onConfirmDay} onGotoOverview={() => setScreen("overview")} />}
        {screen === "lunch" && (() => {
          const d = trip[activeDay];
          const anchor = d.lunchAnchor;
          const picks = anchor ? [...(d.lunchPicks || [])].sort((a, b) => {
            const da = a.lat != null ? distLL(anchor, { lat: a.lat, lng: a.lng }) : Infinity;
            const db = b.lat != null ? distLL(anchor, { lat: b.lat, lng: b.lng }) : Infinity;
            return da - db;
          }) : (d.lunchPicks || []);
          return <LunchScreen dayNum={d.dayNum} picks={picks} search={d.lunchSearch} onBack={() => setScreen("review")} onSelect={onSelectLunch} onSuggest={(ex) => onSuggestMeals("lunch", ex)} city={city} />;
        })()}
        {screen === "dinner" && (() => {
          const d = trip[activeDay];
          return <LunchScreen meal="dinner" dayNum={d.dayNum} picks={d.dinnerPicks || []} search={d.dinnerSearch || []} onBack={() => setScreen("review")} onSelect={onSelectDinner} onSuggest={(ex) => onSuggestMeals("dinner", ex)} city={city} />;
        })()}
        {screen === "overview" && <div className="scout-col"><OverviewScreen {...{ city, dates, tiers, trip, locked }} onBack={() => setScreen("review")} onEditDay={(i) => { setActiveDay(i); setScreen("review"); window.scrollTo(0, 0); }} onLock={() => setLocked(true)} onUnlock={() => setLocked(false)} onSaveTrip={authEnabled ? onSaveTrip : null} saving={saving} session={session} /></div>}
      </div>
    </div>
  );
}
