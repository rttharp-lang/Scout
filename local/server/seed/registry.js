// Verified, updateable team registry. Every entry carries its verification
// state so the directory can show what has been checked and when. Colors are
// approximate brand hexes for UI treatment only (not product specifications).
// `history` records renames/relocations so searches can use historical names.
export const VERIFIED_ON = "2026-09-12";
const V = (method, note) => ({ status: "verified", method, on: VERIFIED_ON, note });
const NV = (note) => ({ status: "needs_verification", note });

export const LEAGUES = [
  { id: "nba", name: "National Basketball Association", short: "NBA",
    calendar: { competition: { label: "2026-27", opening_night: "2026-10-20", regular_season_end_estimate: "2027-04", playoffs_estimate: "2027-04/2027-06" },
      notes: "Opening night 2026-10-20 (verified via league/press summaries 2026-09-12). Later dates are estimates until the league publishes them." } },
  { id: "wnba", name: "Women's National Basketball Association", short: "WNBA",
    calendar: { competition: { label: "2026", regular_season_start: "2026-05-08", regular_season_end: "2026-09-24", playoffs_start: "2026-09-27", games: 44, world_cup_break: "2026-09-04/2026-09-13" },
      notes: "2026 is the 30th season; 15 teams; playoffs top-8 regardless of conference. Verified via league summaries 2026-09-12." } },
];

const nba = (id, name, nickname, city, market, conference, arena, tz, colors, first, history = [], extra = {}) =>
  ({ id, league_id: "nba", name, nickname, city, market, region: extra.region || null, conference, arena, tz, colors, first_season: first, status: "active", history,
     registry: { verification: extra.verification || V("league-summary-web-search", "Active NBA franchise; arena name as known 2026-09-12"), colors_note: "UI approximation", ...extra.registry },
     search_terms: [name, nickname, ...(extra.terms || []), ...history.map((h) => h.name).filter(Boolean)] });
const wnba = (id, name, nickname, city, market, conference, arena, tz, colors, first, history = [], extra = {}) =>
  ({ id, league_id: "wnba", name, nickname, city, market, region: extra.region || null, conference, arena, tz, colors, first_season: first, status: extra.status || "active", history,
     registry: { verification: extra.verification || V("league-summary-web-search", "Active WNBA franchise for the 2026 season"), colors_note: "UI approximation", ...extra.registry },
     search_terms: [name, nickname, ...(extra.terms || []), ...history.map((h) => h.name).filter(Boolean)] });

export const TEAMS = [
  // NBA — East
  nba("nba-atl", "Atlanta Hawks", "Hawks", "Atlanta", "Atlanta, GA", "East", "State Farm Arena", "America/New_York", ["#C8102E", "#FDB927"], 1949,
    [{ name: "Tri-Cities Blackhawks", from: 1949, to: 1951 }, { name: "Milwaukee Hawks", from: 1951, to: 1955 }, { name: "St. Louis Hawks", from: 1955, to: 1968 }]),
  nba("nba-bos", "Boston Celtics", "Celtics", "Boston", "Boston, MA", "East", "TD Garden", "America/New_York", ["#007A33", "#BA9653"], 1946),
  nba("nba-bkn", "Brooklyn Nets", "Nets", "Brooklyn", "New York, NY (Brooklyn)", "East", "Barclays Center", "America/New_York", ["#000000", "#FFFFFF"], 1967,
    [{ name: "New Jersey Americans", from: 1967, to: 1968 }, { name: "New York Nets", from: 1968, to: 1977 }, { name: "New Jersey Nets", from: 1977, to: 2012 }], { terms: ["Brooklyn"], registry: { shared_market: ["nba-nyk", "wnba-nyl"] } }),
  nba("nba-cha", "Charlotte Hornets", "Hornets", "Charlotte", "Charlotte, NC", "East", "Spectrum Center", "America/New_York", ["#1D1160", "#00788C"], 1988,
    [{ name: "Charlotte Hornets (original)", from: 1988, to: 2002, note: "Original franchise relocated to New Orleans" }, { name: "Charlotte Bobcats", from: 2004, to: 2014 }], { registry: { note: "Hornets name and pre-2002 history reclaimed in 2014" } }),
  nba("nba-chi", "Chicago Bulls", "Bulls", "Chicago", "Chicago, IL", "East", "United Center", "America/Chicago", ["#CE1141", "#000000"], 1966, [], { terms: ["Madhouse on Madison", "United Center", "West Side"], registry: { shared_market: ["wnba-chi"] } }),
  nba("nba-cle", "Cleveland Cavaliers", "Cavaliers", "Cleveland", "Cleveland, OH", "East", "Rocket Arena", "America/New_York", ["#860038", "#FDBB30"], 1970, [], { terms: ["Cavs"], verification: NV("Arena renamed from Rocket Mortgage FieldHouse; confirm current name") }),
  nba("nba-det", "Detroit Pistons", "Pistons", "Detroit", "Detroit, MI", "East", "Little Caesars Arena", "America/Detroit", ["#C8102E", "#1D42BA"], 1941, [{ name: "Fort Wayne Pistons", from: 1941, to: 1957 }]),
  nba("nba-ind", "Indiana Pacers", "Pacers", "Indianapolis", "Indianapolis, IN", "East", "Gainbridge Fieldhouse", "America/Indiana/Indianapolis", ["#002D62", "#FDBB30"], 1967, [], { registry: { shared_market: ["wnba-ind"], note: "ABA 1967–76, NBA from 1976" } }),
  nba("nba-mia", "Miami Heat", "Heat", "Miami", "Miami, FL", "East", "Kaseya Center", "America/New_York", ["#98002E", "#F9A01B"], 1988),
  nba("nba-mil", "Milwaukee Bucks", "Bucks", "Milwaukee", "Milwaukee, WI", "East", "Fiserv Forum", "America/Chicago", ["#00471B", "#EEE1C6"], 1968),
  nba("nba-nyk", "New York Knicks", "Knicks", "New York", "New York, NY", "East", "Madison Square Garden", "America/New_York", ["#006BB6", "#F58426"], 1946, [], { registry: { shared_market: ["nba-bkn", "wnba-nyl"], note: "2025-26 NBA champions per 2026-27 schedule coverage" } }),
  nba("nba-orl", "Orlando Magic", "Magic", "Orlando", "Orlando, FL", "East", "Kia Center", "America/New_York", ["#0077C0", "#C4CED4"], 1989),
  nba("nba-phi", "Philadelphia 76ers", "76ers", "Philadelphia", "Philadelphia, PA", "East", "Xfinity Mobile Arena", "America/New_York", ["#006BB6", "#ED174C"], 1946, [{ name: "Syracuse Nationals", from: 1946, to: 1963 }], { terms: ["Sixers"], verification: V("web-search", "Arena renamed Xfinity Mobile Arena effective 2025-09-01") }),
  nba("nba-tor", "Toronto Raptors", "Raptors", "Toronto", "Toronto, ON", "East", "Scotiabank Arena", "America/Toronto", ["#CE1141", "#000000"], 1995, [], { registry: { shared_market: ["wnba-tor"] } }),
  nba("nba-was", "Washington Wizards", "Wizards", "Washington", "Washington, DC", "East", "Capital One Arena", "America/New_York", ["#002B5C", "#E31837"], 1961,
    [{ name: "Chicago Packers", from: 1961, to: 1962 }, { name: "Chicago Zephyrs", from: 1962, to: 1963 }, { name: "Baltimore Bullets", from: 1963, to: 1973 }, { name: "Capital Bullets", from: 1973, to: 1974 }, { name: "Washington Bullets", from: 1974, to: 1997 }], { registry: { shared_market: ["wnba-was"] } }),
  // NBA — West
  nba("nba-dal", "Dallas Mavericks", "Mavericks", "Dallas", "Dallas, TX", "West", "American Airlines Center", "America/Chicago", ["#00538C", "#002B5E"], 1980, [], { terms: ["Mavs"], registry: { shared_market: ["wnba-dal"] } }),
  nba("nba-den", "Denver Nuggets", "Nuggets", "Denver", "Denver, CO", "West", "Ball Arena", "America/Denver", ["#0E2240", "#FEC524"], 1967, [{ name: "Denver Rockets", from: 1967, to: 1974 }]),
  nba("nba-gsw", "Golden State Warriors", "Warriors", "San Francisco", "San Francisco Bay Area, CA", "West", "Chase Center", "America/Los_Angeles", ["#1D428A", "#FFC72C"], 1946,
    [{ name: "Philadelphia Warriors", from: 1946, to: 1962 }, { name: "San Francisco Warriors", from: 1962, to: 1971 }], { terms: ["Dubs", "Oakland"], registry: { shared_market: ["wnba-gsv"] } }),
  nba("nba-hou", "Houston Rockets", "Rockets", "Houston", "Houston, TX", "West", "Toyota Center", "America/Chicago", ["#CE1141", "#000000"], 1967, [{ name: "San Diego Rockets", from: 1967, to: 1971 }]),
  nba("nba-lac", "LA Clippers", "Clippers", "Inglewood", "Los Angeles, CA (Inglewood)", "West", "Intuit Dome", "America/Los_Angeles", ["#C8102E", "#1D428A"], 1970,
    [{ name: "Buffalo Braves", from: 1970, to: 1978 }, { name: "San Diego Clippers", from: 1978, to: 1984 }], { registry: { shared_market: ["nba-lal", "wnba-las"] } }),
  nba("nba-lal", "Los Angeles Lakers", "Lakers", "Los Angeles", "Los Angeles, CA", "West", "Crypto.com Arena", "America/Los_Angeles", ["#552583", "#FDB927"], 1947, [{ name: "Minneapolis Lakers", from: 1947, to: 1960 }], { registry: { shared_market: ["nba-lac", "wnba-las"] } }),
  nba("nba-mem", "Memphis Grizzlies", "Grizzlies", "Memphis", "Memphis, TN", "West", "FedExForum", "America/Chicago", ["#5D76A9", "#12173F"], 1995, [{ name: "Vancouver Grizzlies", from: 1995, to: 2001 }], { terms: ["Grit and Grind"] }),
  nba("nba-min", "Minnesota Timberwolves", "Timberwolves", "Minneapolis", "Minneapolis–St. Paul, MN", "West", "Target Center", "America/Chicago", ["#0C2340", "#236192"], 1989, [], { terms: ["Wolves"], registry: { shared_market: ["wnba-min"] } }),
  nba("nba-nop", "New Orleans Pelicans", "Pelicans", "New Orleans", "New Orleans, LA", "West", "Smoothie King Center", "America/Chicago", ["#0C2340", "#C8102E"], 2002, [{ name: "New Orleans Hornets", from: 2002, to: 2013 }, { name: "New Orleans/Oklahoma City Hornets", from: 2005, to: 2007 }]),
  nba("nba-okc", "Oklahoma City Thunder", "Thunder", "Oklahoma City", "Oklahoma City, OK", "West", "Paycom Center", "America/Chicago", ["#007AC1", "#EF6024"], 1967, [{ name: "Seattle SuperSonics", from: 1967, to: 2008 }], { verification: NV("New arena with announced naming deal is in development; confirm venue for the target season") }),
  nba("nba-phx", "Phoenix Suns", "Suns", "Phoenix", "Phoenix, AZ", "West", "Mortgage Matchup Center", "America/Phoenix", ["#1D1160", "#E56020"], 1968, [], { verification: V("web-search", "Arena naming deal announced October 2025"), registry: { shared_market: ["wnba-phx"] } }),
  nba("nba-por", "Portland Trail Blazers", "Trail Blazers", "Portland", "Portland, OR", "West", "Moda Center", "America/Los_Angeles", ["#E03A3E", "#000000"], 1970, [], { terms: ["Blazers", "Rip City"], registry: { shared_market: ["wnba-por"] } }),
  nba("nba-sac", "Sacramento Kings", "Kings", "Sacramento", "Sacramento, CA", "West", "Golden 1 Center", "America/Los_Angeles", ["#5A2D81", "#63727A"], 1948,
    [{ name: "Rochester Royals", from: 1948, to: 1957 }, { name: "Cincinnati Royals", from: 1957, to: 1972 }, { name: "Kansas City-Omaha Kings", from: 1972, to: 1975 }, { name: "Kansas City Kings", from: 1975, to: 1985 }]),
  nba("nba-sas", "San Antonio Spurs", "Spurs", "San Antonio", "San Antonio, TX", "West", "Frost Bank Center", "America/Chicago", ["#C4CED4", "#000000"], 1967, [{ name: "Dallas Chaparrals", from: 1967, to: 1973 }]),
  nba("nba-uta", "Utah Jazz", "Jazz", "Salt Lake City", "Salt Lake City, UT", "West", "Delta Center", "America/Denver", ["#2B1A4C", "#F9A01B"], 1974, [{ name: "New Orleans Jazz", from: 1974, to: 1979 }], { verification: NV("Brand colors changed several times since 2022; confirm current palette") }),
  // WNBA — 2026 (15 teams)
  wnba("wnba-atl", "Atlanta Dream", "Dream", "Atlanta", "Atlanta, GA (College Park)", "East", "Gateway Center Arena", "America/New_York", ["#E31837", "#418FDE"], 2008),
  wnba("wnba-chi", "Chicago Sky", "Sky", "Chicago", "Chicago, IL", "East", "Wintrust Arena", "America/Chicago", ["#5091CD", "#FFD520"], 2006, [], { terms: ["South Loop"], registry: { shared_market: ["nba-chi"] } }),
  wnba("wnba-con", "Connecticut Sun", "Sun", "Uncasville", "Connecticut (Uncasville)", "East", "Mohegan Sun Arena", "America/New_York", ["#F05023", "#0A2240"], 1999, [{ name: "Orlando Miracle", from: 1999, to: 2003 }], { verification: NV("Ownership and venue plans beyond 2026 reported in flux; confirm before targeting a product season") }),
  wnba("wnba-dal", "Dallas Wings", "Wings", "Dallas", "Dallas–Fort Worth, TX", "West", "College Park Center (Arlington)", "America/Chicago", ["#C4D600", "#002B5C"], 1998,
    [{ name: "Detroit Shock", from: 1998, to: 2010 }, { name: "Tulsa Shock", from: 2010, to: 2016 }], { verification: NV("Announced move to a Dallas venue; confirm current home arena"), registry: { shared_market: ["nba-dal"] } }),
  wnba("wnba-gsv", "Golden State Valkyries", "Valkyries", "San Francisco", "San Francisco Bay Area, CA", "West", "Chase Center", "America/Los_Angeles", ["#AD96DC", "#000000"], 2025, [], { verification: V("web-search", "Joined 2025"), registry: { shared_market: ["nba-gsw"], expansion: true } }),
  wnba("wnba-ind", "Indiana Fever", "Fever", "Indianapolis", "Indianapolis, IN", "East", "Gainbridge Fieldhouse", "America/Indiana/Indianapolis", ["#002D62", "#E03A3E", "#FDBB30"], 2000, [], { registry: { shared_market: ["nba-ind"] } }),
  wnba("wnba-lva", "Las Vegas Aces", "Aces", "Las Vegas", "Las Vegas, NV", "West", "Michelob ULTRA Arena", "America/Los_Angeles", ["#000000", "#BA0C2F", "#A7A8AA"], 1997,
    [{ name: "Utah Starzz", from: 1997, to: 2003 }, { name: "San Antonio Silver Stars", from: 2003, to: 2014 }, { name: "San Antonio Stars", from: 2014, to: 2018 }]),
  wnba("wnba-las", "Los Angeles Sparks", "Sparks", "Los Angeles", "Los Angeles, CA", "West", "Crypto.com Arena", "America/Los_Angeles", ["#552583", "#FDB927"], 1997, [], { registry: { shared_market: ["nba-lal", "nba-lac"] } }),
  wnba("wnba-min", "Minnesota Lynx", "Lynx", "Minneapolis", "Minneapolis–St. Paul, MN", "West", "Target Center", "America/Chicago", ["#0C2340", "#236192", "#78BE20"], 1999, [], { registry: { shared_market: ["nba-min"] } }),
  wnba("wnba-nyl", "New York Liberty", "Liberty", "Brooklyn", "New York, NY (Brooklyn)", "East", "Barclays Center", "America/New_York", ["#6ECEB2", "#000000"], 1997, [], { terms: ["Ellie the Elephant"], registry: { shared_market: ["nba-nyk", "nba-bkn"] } }),
  wnba("wnba-phx", "Phoenix Mercury", "Mercury", "Phoenix", "Phoenix, AZ", "West", "Mortgage Matchup Center", "America/Phoenix", ["#201747", "#E56020"], 1997, [], { registry: { shared_market: ["nba-phx"] } }),
  wnba("wnba-por", "Portland Fire", "Fire", "Portland", "Portland, OR", "West", "Moda Center", "America/Los_Angeles", ["#C8102E", "#B76E79"], 2026,
    [{ name: "Portland Fire (original)", from: 2000, to: 2002, note: "Original franchise folded in 2002; 2026 team is a new expansion franchise reviving the name" }],
    { verification: V("web-search", "Expansion team; regular-season debut 2026-05-09 at Moda Center. Brand colors need verification"), registry: { shared_market: ["nba-por"], expansion: true } }),
  wnba("wnba-sea", "Seattle Storm", "Storm", "Seattle", "Seattle, WA", "West", "Climate Pledge Arena", "America/Los_Angeles", ["#2C5234", "#FBE122"], 2000),
  wnba("wnba-tor", "Toronto Tempo", "Tempo", "Toronto", "Toronto, ON (with games in Montreal and Vancouver)", "East", "Coca-Cola Coliseum", "America/Toronto", ["#D22630", "#000000"], 2026, [],
    { verification: V("web-search", "Expansion team; first Canadian WNBA franchise; debut 2026-05-08. Majority of home games at Coca-Cola Coliseum, some at Scotiabank Arena, Bell Centre and Rogers Arena. Brand colors need verification"), registry: { shared_market: ["nba-tor"], expansion: true } }),
  wnba("wnba-was", "Washington Mystics", "Mystics", "Washington", "Washington, DC", "East", "CareFirst Arena", "America/New_York", ["#002B5C", "#E03A3E"], 1998, [], { verification: NV("Arena naming (formerly Entertainment and Sports Arena) to confirm"), registry: { shared_market: ["nba-was"] } }),
  // Announced WNBA expansion (not yet active) — listed so product planning can see them, never researched as active fandoms.
  wnba("wnba-cle", "Cleveland (WNBA expansion)", "TBD", "Cleveland", "Cleveland, OH", null, "TBD", "America/New_York", ["#444444"], 2028, [], { status: "announced", verification: V("web-search", "Approved expansion; first season 2028") }),
  wnba("wnba-det", "Detroit (WNBA expansion)", "TBD", "Detroit", "Detroit, MI", null, "TBD", "America/Detroit", ["#444444"], 2029, [], { status: "announced", verification: V("web-search", "Approved expansion; first season 2029") }),
  wnba("wnba-phi", "Philadelphia (WNBA expansion)", "TBD", "Philadelphia", "Philadelphia, PA", null, "TBD", "America/New_York", ["#444444"], 2030, [], { status: "announced", verification: V("web-search", "Approved expansion; first season 2030") }),
];

export const SEASONS = [
  { id: "nba-2025-26", league_id: "nba", label: "2025-26", kind: "competition", starts_on: "2025-10-21", ends_on: "2026-06-30", milestones: [], notes: "Completed season (historical comparison window)." },
  { id: "nba-2026-27", league_id: "nba", label: "2026-27", kind: "competition", starts_on: "2026-10-20", ends_on: "2027-06-30",
    milestones: [{ label: "Opening night", on: "2026-10-20", status: "confirmed" }, { label: "Regular season end", on: "2027-04-12", status: "estimated" }, { label: "Playoffs begin", on: "2027-04-17", status: "estimated" }], notes: "Opening night confirmed; later milestones are estimates." },
  { id: "wnba-2025", league_id: "wnba", label: "2025", kind: "competition", starts_on: "2025-05-16", ends_on: "2025-10-31", milestones: [], notes: "Completed season (historical comparison window)." },
  { id: "wnba-2026", league_id: "wnba", label: "2026", kind: "competition", starts_on: "2026-05-08", ends_on: "2026-10-31",
    milestones: [{ label: "Regular season start", on: "2026-05-08", status: "confirmed" }, { label: "FIBA World Cup break", on: "2026-09-04", until: "2026-09-13", status: "confirmed" }, { label: "Regular season end", on: "2026-09-24", status: "confirmed" }, { label: "Playoffs begin", on: "2026-09-27", status: "confirmed" }], notes: "44-game season; 15 teams." },
  { id: "wnba-2027", league_id: "wnba", label: "2027", kind: "competition", starts_on: "2027-05-14", ends_on: "2027-10-31", milestones: [{ label: "Regular season start", on: "2027-05-14", status: "predicted" }], notes: "Predicted window from historical May starts; not yet published." },
  { id: "product-2027", league_id: "nba", label: "2027-28 product season", kind: "product", starts_on: "2027-10-01", ends_on: "2028-06-30", milestones: [], notes: "Configure design/brief/approval/production/launch gates per workspace. No lead times are assumed." },
  { id: "product-wnba-2027", league_id: "wnba", label: "2027 product season", kind: "product", starts_on: "2027-05-01", ends_on: "2027-10-31", milestones: [], notes: "Configure gates per workspace." },
];
