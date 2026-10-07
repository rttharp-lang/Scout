// The 30 NBA markets Home Court covers. Static identity only (who/where/colors);
// everything interpretive lives in the agent research under research/nba/<id>/
// and the assembled market files in src/nba/data/markets/. `focus` scopes the
// research agents: shared metros (LA, New York) are split by each team's real
// footprint so the Lakers/Clippers and Knicks/Nets dossiers don't duplicate.
// Colors are the team palette used for UI accents; the Uniform agent's dossier
// carries the researched official palette.

export const TEAMS = [
  // ── Eastern Conference ─────────────────────────────────────────
  { id: "atl", abbr: "ATL", name: "Hawks", city: "Atlanta", state: "GA", conference: "East", division: "Southeast", arena: "State Farm Arena", colors: ["#C8102E", "#C1D32F", "#26282A"],
    focus: "Atlanta and metro ATL — the city's Black cultural capital status, hip-hop, and the suburbs (Decatur, East Point, College Park, Gwinnett)." },
  { id: "bos", abbr: "BOS", name: "Celtics", city: "Boston", state: "MA", conference: "East", division: "Atlantic", arena: "TD Garden", colors: ["#007A33", "#BA9653", "#000000"],
    focus: "Boston and greater New England — Dorchester, Roxbury, Southie, Cambridge, the suburbs, plus the region-wide New England fan base." },
  { id: "bkn", abbr: "BKN", name: "Nets", city: "Brooklyn", state: "NY", conference: "East", division: "Atlantic", arena: "Barclays Center", colors: ["#000000", "#FFFFFF", "#707271"],
    focus: "Brooklyn specifically — Bed-Stuy, Crown Heights, Flatbush, Bushwick, Williamsburg, Downtown/Atlantic Terminal, Coney Island — and Brooklyn's identity as distinct from Manhattan." },
  { id: "cha", abbr: "CHA", name: "Hornets", city: "Charlotte", state: "NC", conference: "East", division: "Southeast", arena: "Spectrum Center", colors: ["#00788C", "#1D1160", "#A1A1A4"],
    focus: "Charlotte and the Carolinas — NoDa, Plaza Midwood, South End, West End/Beatties Ford, plus the wider NC/SC fan base and the 1990s Hornets nostalgia." },
  { id: "chi", abbr: "CHI", name: "Bulls", city: "Chicago", state: "IL", conference: "East", division: "Central", arena: "United Center", colors: ["#CE1141", "#000000", "#FFFFFF"],
    focus: "Chicago — South Side, West Side, North Side and the suburbs — and the city's global Bulls/Jordan-era legacy." },
  { id: "cle", abbr: "CLE", name: "Cavaliers", city: "Cleveland", state: "OH", conference: "East", division: "Central", arena: "Rocket Arena", colors: ["#860038", "#FDBB30", "#041E42"],
    focus: "Cleveland and Northeast Ohio — Ohio City, Tremont, Gordon Square, Slavic Village, East Cleveland, Akron (LeBron's hometown) and the wider 'The Land' identity." },
  { id: "det", abbr: "DET", name: "Pistons", city: "Detroit", state: "MI", conference: "East", division: "Central", arena: "Little Caesars Arena", colors: ["#C8102E", "#1D42BA", "#BEC0C2"],
    focus: "Detroit and metro Detroit — Midtown, Corktown, Eastern Market, the West Side and East Side, Southwest Detroit, plus suburbs (Oakland County, Dearborn)." },
  { id: "ind", abbr: "IND", name: "Pacers", city: "Indianapolis", state: "IN", conference: "East", division: "Central", arena: "Gainbridge Fieldhouse", colors: ["#002D62", "#FDBB30", "#BEC0C2"],
    focus: "Indianapolis and the state of Indiana — 'Hoosier Hysteria', small-town gyms, Fountain Square, Mass Ave, Broad Ripple, and the statewide basketball religion." },
  { id: "mia", abbr: "MIA", name: "Heat", city: "Miami", state: "FL", conference: "East", division: "Southeast", arena: "Kaseya Center", colors: ["#98002E", "#F9A01B", "#000000"],
    focus: "Miami-Dade and South Florida — Little Havana, Little Haiti, Wynwood, Overtown, Liberty City, Hialeah, Miami Beach, plus Broward — Latin America's capital in the US." },
  { id: "mil", abbr: "MIL", name: "Bucks", city: "Milwaukee", state: "WI", conference: "East", division: "Central", arena: "Fiserv Forum", colors: ["#00471B", "#EEE1C6", "#0077C0"],
    focus: "Milwaukee and Wisconsin — Bronzeville, Walker's Point, Bay View, the Third Ward, the North Side, plus statewide Wisconsin fans." },
  { id: "nyk", abbr: "NYK", name: "Knicks", city: "New York", state: "NY", conference: "East", division: "Atlantic", arena: "Madison Square Garden", colors: ["#006BB6", "#F58426", "#BEC0C2"],
    focus: "New York City as the Knicks' footprint — Manhattan (Harlem, Washington Heights, LES), the Bronx, Queens, Staten Island, plus the tri-state suburbs — and the Garden as a global stage." },
  { id: "orl", abbr: "ORL", name: "Magic", city: "Orlando", state: "FL", conference: "East", division: "Southeast", arena: "Kia Center", colors: ["#0077C0", "#C4CED4", "#000000"],
    focus: "Orlando and Central Florida — Parramore, Mills 50, Thornton Park, the large Puerto Rican and Caribbean communities, and the tourism economy beyond the theme parks." },
  { id: "phi", abbr: "PHI", name: "76ers", city: "Philadelphia", state: "PA", conference: "East", division: "Atlantic", arena: "Xfinity Mobile Arena", colors: ["#006BB6", "#ED174C", "#002B5C"],
    focus: "Philadelphia and the Delaware Valley — North Philly, West Philly, South Philly, Germantown, Fishtown, plus South Jersey and the suburbs." },
  { id: "tor", abbr: "TOR", name: "Raptors", city: "Toronto", state: "ON", conference: "East", division: "Atlantic", arena: "Scotiabank Arena", colors: ["#CE1141", "#000000", "#A1A1A4"],
    focus: "Toronto, the GTA and all of Canada — Scarborough, Brampton, Mississauga, Jane & Finch, Regent Park, the Caribbean, South Asian and East African diasporas — as Canada's only NBA team." },
  { id: "was", abbr: "WAS", name: "Wizards", city: "Washington", state: "DC", conference: "East", division: "Southeast", arena: "Capital One Arena", colors: ["#002B5C", "#E31837", "#C4CED4"],
    focus: "Washington DC and the DMV — Chocolate City heritage, go-go, U Street, Shaw, Anacostia/Southeast, Prince George's County and Northern Virginia." },

  // ── Western Conference ─────────────────────────────────────────
  { id: "dal", abbr: "DAL", name: "Mavericks", city: "Dallas", state: "TX", conference: "West", division: "Southwest", arena: "American Airlines Center", colors: ["#00538C", "#002B5E", "#B8C4CA"],
    focus: "Dallas and DFW — Deep Ellum, Oak Cliff, South Dallas, Bishop Arts, the large Mexican-American community, plus the sprawling DFW suburbs." },
  { id: "den", abbr: "DEN", name: "Nuggets", city: "Denver", state: "CO", conference: "West", division: "Northwest", arena: "Ball Arena", colors: ["#0E2240", "#FEC524", "#8B2131"],
    focus: "Denver and Colorado/the Mountain West — RiNo, Five Points, the Westside, Colfax, plus mountain-town and outdoor culture across the region." },
  { id: "gsw", abbr: "GSW", name: "Warriors", city: "San Francisco", state: "CA", conference: "West", division: "Pacific", arena: "Chase Center", colors: ["#1D428A", "#FFC72C", "#FFFFFF"],
    focus: "The Bay Area — San Francisco (Mission, Bayview, Fillmore), Oakland (the team's 47-year home and its enduring fan base), San Jose and Silicon Valley." },
  { id: "hou", abbr: "HOU", name: "Rockets", city: "Houston", state: "TX", conference: "West", division: "Southwest", arena: "Toyota Center", colors: ["#CE1141", "#000000", "#C4CED4"],
    focus: "Houston — Third Ward, Fifth Ward, Southwest (Alief, Sharpstown), the Heights, East End/Second Ward — slab and screw culture, and one of America's most diverse metros." },
  { id: "lac", abbr: "LAC", name: "Clippers", city: "Los Angeles", state: "CA", conference: "West", division: "Pacific", arena: "Intuit Dome", colors: ["#C8102E", "#1D428A", "#BEC0C2"],
    focus: "The Clippers' footprint — Inglewood and the Intuit Dome era, South LA, the South Bay, Long Beach, the San Gabriel Valley and Orange County — and their fight for identity next to the Lakers." },
  { id: "lal", abbr: "LAL", name: "Lakers", city: "Los Angeles", state: "CA", conference: "West", division: "Pacific", arena: "Crypto.com Arena", colors: ["#552583", "#FDB927", "#000000"],
    focus: "Los Angeles as the Lakers' footprint — Downtown, East LA and Boyle Heights, Koreatown, Hollywood, the Valley, the Westside — Showtime-to-now celebrity and Latino fan culture." },
  { id: "mem", abbr: "MEM", name: "Grizzlies", city: "Memphis", state: "TN", conference: "West", division: "Southwest", arena: "FedExForum", colors: ["#5D76A9", "#12173F", "#F5B112"],
    focus: "Memphis and the Mid-South — Beale Street, Orange Mound, North Memphis, Whitehaven, Cooper-Young, Soulsville — 'Grit and Grind', jookin, and Memphis rap." },
  { id: "min", abbr: "MIN", name: "Timberwolves", city: "Minneapolis", state: "MN", conference: "West", division: "Northwest", arena: "Target Center", colors: ["#0C2340", "#236192", "#78BE20"],
    focus: "Minneapolis–St. Paul and Minnesota — North Minneapolis, Uptown, Lake Street, Cedar-Riverside's Somali community, St. Paul's Hmong community, and statewide Minnesotans." },
  { id: "nop", abbr: "NOP", name: "Pelicans", city: "New Orleans", state: "LA", conference: "West", division: "Southwest", arena: "Smoothie King Center", colors: ["#0C2340", "#C8102E", "#85714D"],
    focus: "New Orleans and the Gulf South — the Seventh Ward, Tremé, Central City, the Ninth Ward, the West Bank, Mardi Gras Indian and second-line culture, bounce music." },
  { id: "okc", abbr: "OKC", name: "Thunder", city: "Oklahoma City", state: "OK", conference: "West", division: "Northwest", arena: "Paycom Center", colors: ["#007AC1", "#EF3B24", "#002D62"],
    focus: "Oklahoma City and Oklahoma — Deep Deuce, Plaza District, Paseo, the Asian District, Northeast OKC, Tulsa, and the state's Native nations." },
  { id: "phx", abbr: "PHX", name: "Suns", city: "Phoenix", state: "AZ", conference: "West", division: "Pacific", arena: "Mortgage Matchup Center", colors: ["#1D1160", "#E56020", "#000000"],
    focus: "Phoenix and the Valley of the Sun — South Phoenix, Maryvale, Roosevelt Row, Tempe, Mesa, Scottsdale — desert life, Chicano and Indigenous culture, and the Valley identity." },
  { id: "por", abbr: "POR", name: "Trail Blazers", city: "Portland", state: "OR", conference: "West", division: "Northwest", arena: "Moda Center", colors: ["#E03A3E", "#000000", "#FFFFFF"],
    focus: "Portland and Oregon — Northeast/Albina (the city's historic Black community), Alberta, Mississippi, Southeast, Downtown/Old Town — Rip City, the Pacific Northwest outdoors, and home of Nike." },
  { id: "sac", abbr: "SAC", name: "Kings", city: "Sacramento", state: "CA", conference: "West", division: "Pacific", arena: "Golden 1 Center", colors: ["#5A2D81", "#63727A", "#000000"],
    focus: "Sacramento and the Central Valley — Oak Park, Del Paso Heights, Midtown, South Sac, Elk Grove — 'Sactown', farm-to-fork, and a fan base that fought to keep its team." },
  { id: "sas", abbr: "SAS", name: "Spurs", city: "San Antonio", state: "TX", conference: "West", division: "Southwest", arena: "Frost Bank Center", colors: ["#C4CED4", "#000000", "#8A8D8F"],
    focus: "San Antonio and South Texas — the West Side, East Side, Southtown, the Pearl, Fiesta, Tejano and Chicano culture, the military community, and fans across South Texas and Mexico." },
  { id: "uta", abbr: "UTA", name: "Jazz", city: "Salt Lake City", state: "UT", conference: "West", division: "Northwest", arena: "Delta Center", colors: ["#4E008E", "#000000", "#FFFFFF"],
    focus: "Salt Lake City and Utah — Sugar House, Central 9th, the West Side (Rose Park, Glendale), Ogden, Provo — Mountain West outdoor life, the Pacific Islander and Latino communities." },
];

export const TEAM_BY_ID = Object.fromEntries(TEAMS.map((t) => [t.id, t]));

export const DIVISIONS = ["Atlantic", "Central", "Southeast", "Northwest", "Pacific", "Southwest"];

export const teamLabel = (t) => `${t.city} ${t.name}`;
