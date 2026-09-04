import type { SeasonConfig, MediaAsset } from "./types";

/**
 * ─────────────────────────────────────────────────────────────────────────
 *  SEASON CONFIG — ANTAGONIST / RAGE BAIT
 *
 *  This is the only file you should need to touch to re-skin the platform
 *  for a new season. Every act reads from here. Placeholder copy is original
 *  and written for the prototype; replace freely.
 *
 *  Media: leave `src` undefined and the slot renders a labelled procedural
 *  placeholder. Drop a file in /public/assets and set `src: "/assets/…"`.
 * ─────────────────────────────────────────────────────────────────────────
 */

const slot = (
  id: string,
  label: string,
  opts: Partial<MediaAsset> = {}
): MediaAsset => ({
  id,
  label,
  kind: "image",
  ratio: "3 / 4",
  treatment: "grain",
  ...opts,
});

export const season: SeasonConfig = {
  meta: {
    brand: "Nike",
    division: "Nike Basketball Apparel",
    season: "SU27",
    platform: "ANTAGONIST",
    chapter: "RAGE BAIT",
    attitude: "MAKE 'EM MAD.",
    subtitle: "Seasonal Creative Direction",
  },

  palette: {
    ink: "#070707",
    paper: "#F2EFE9",
    accent: "#FF2E00",
    clash: "#2B4CFF",
    mute: "#6B6B66",
  },

  chapters: [
    { id: "entry", index: "00", title: "The Tunnel" },
    { id: "reaction", index: "01", title: "The Reaction" },
    { id: "antagonist", index: "02", title: "The Antagonist" },
    { id: "ragebait", index: "03", title: "Rage Bait" },
    { id: "codes", index: "04", title: "The Creative Codes" },
    { id: "product", index: "05", title: "Product Translation" },
    { id: "worlds", index: "06", title: "Four Worlds" },
    { id: "exit", index: "07", title: "Exit" },
  ],

  entry: {
    noise: [
      { text: "BOO", x: 0.12, y: 0.22, size: 1.6 },
      { text: "OVERRATED", x: 0.68, y: 0.18, size: 1 },
      { text: "TOO MUCH", x: 0.25, y: 0.7, size: 1.2 },
      { text: "WHO DOES HE THINK HE IS?", x: 0.5, y: 0.42, size: 0.8 },
      { text: "SIT DOWN", x: 0.78, y: 0.62, size: 1.4 },
      { text: "ROLE MODEL?", x: 0.15, y: 0.48, size: 0.9 },
      { text: "VILLAIN", x: 0.6, y: 0.8, size: 2 },
      { text: "TRASH TALKER", x: 0.4, y: 0.12, size: 1 },
      { text: "BOO", x: 0.85, y: 0.35, size: 1.1 },
      { text: "BOOOOO", x: 0.3, y: 0.88, size: 0.9 },
    ],
    statement: ["THE GAME", "NEEDS SOMEONE", "TO HATE."],
    reveal: "ANTAGONIST",
    scrollHint: "Scroll to enter",
  },

  reaction: {
    headline: ["Great players", "don't just create fans.", "They create reactions."],
    axis: {
      left: "LOVE",
      right: "HATE",
      center: "CAN'T IGNORE.",
      neutral: "NEUTRAL. NOBODY'S WATCHING.",
    },
    reveal: "Both sides feed the same place.",
    lines: [
      "Attention can be positive or negative.",
      "Emotional neutrality is death.",
      "The only unforgivable response is none.",
    ],
  },

  archetypes: [
    {
      id: "instigator",
      name: "THE INSTIGATOR",
      headline: "STARTS IT. NEVER FINISHES IT QUIETLY.",
      quote: "I didn't say anything. I just looked at him.",
      behaviors: ["Talks first", "Finds the nerve", "Turns a possession into a plot"],
      tone: "hot",
      portrait: slot("archetype-instigator-portrait", "Instigator — portrait crop"),
      archive: [
        slot("archetype-instigator-archive-01", "Archive — mid-word, pressroom", { ratio: "4 / 3", treatment: "scan" }),
        slot("archetype-instigator-archive-02", "Archive — technical foul", { ratio: "1 / 1", treatment: "halftone" }),
      ],
    },
    {
      id: "disruptor",
      name: "THE DISRUPTOR",
      headline: "THE SCHEME WAS FINE UNTIL HE SHOWED UP.",
      quote: "Comfortable is a bad word in my house.",
      behaviors: ["Breaks rhythm", "Picks up full court", "Makes stars think"],
      tone: "cold",
      portrait: slot("archetype-disruptor-portrait", "Disruptor — portrait crop"),
      archive: [
        slot("archetype-disruptor-archive-01", "Archive — deflection, low angle", { ratio: "16 / 9", treatment: "scan" }),
        slot("archetype-disruptor-archive-02", "Archive — floor burn", { ratio: "1 / 1", treatment: "grain" }),
      ],
    },
    {
      id: "showman",
      name: "THE SHOWMAN",
      headline: "THE ARENA IS A STAGE. HE KNOWS WHERE THE CAMERAS ARE.",
      quote: "If you're going to watch, I'm going to give you something to watch.",
      behaviors: ["Celebrates too early", "Dresses for the tunnel", "Performs the moment"],
      tone: "flash",
      portrait: slot("archetype-showman-portrait", "Showman — tunnel walk"),
      archive: [
        slot("archetype-showman-archive-01", "Archive — celebration, blown out", { ratio: "4 / 5", treatment: "blur" }),
        slot("archetype-showman-archive-02", "Archive — tunnel fit", { ratio: "3 / 4", treatment: "grain" }),
      ],
    },
    {
      id: "outsider",
      name: "THE OUTSIDER",
      headline: "NEVER ASKED TO FIT. NEVER WILL.",
      quote: "They wanted a type. I brought a person.",
      behaviors: ["Refuses the template", "Owns the difference", "Turns odd into iconic"],
      tone: "dirt",
      portrait: slot("archetype-outsider-portrait", "Outsider — editorial full length"),
      archive: [
        slot("archetype-outsider-archive-01", "Archive — hair, paint, detail", { ratio: "1 / 1", treatment: "halftone" }),
        slot("archetype-outsider-archive-02", "Archive — bench, alone", { ratio: "16 / 9", treatment: "grain" }),
      ],
    },
    {
      id: "target",
      name: "THE TARGET",
      headline: "EVERY BUILDING BOOS HIM. HE HEARS FUEL.",
      quote: "Boo louder. I can't hear you over the win.",
      behaviors: ["Absorbs the noise", "Plays better away", "Wears the crosshair"],
      tone: "void",
      portrait: slot("archetype-target-portrait", "Target — hostile crowd behind"),
      archive: [
        slot("archetype-target-archive-01", "Archive — crowd sign", { ratio: "4 / 3", treatment: "scan" }),
        slot("archetype-target-archive-02", "Archive — free throw, silence", { ratio: "3 / 4", treatment: "flat" }),
      ],
    },
    {
      id: "antihero",
      name: "THE ANTI-HERO",
      headline: "NOT THE ROLE MODEL. THE ONE YOU CAN'T STOP WATCHING.",
      quote: "I'm not here to be liked. I'm here to be remembered.",
      behaviors: ["Wins the wrong way", "Refuses the script", "Makes the story"],
      tone: "clean",
      portrait: slot("archetype-antihero-portrait", "Anti-hero — studio portrait"),
      archive: [
        slot("archetype-antihero-archive-01", "Archive — trophy, no smile", { ratio: "3 / 4", treatment: "grain" }),
        slot("archetype-antihero-archive-02", "Archive — headline scan", { ratio: "16 / 9", treatment: "scan" }),
      ],
    },
  ],

  ragebait: {
    insight: [
      "People live inside attention economies.",
      "Reaction has value.",
      "Basketball has always understood this instinctively.",
    ],
    words: ["Rivalries.", "Trash talk.", "Crowds.", "Celebrations.", "Fashion.", "Swagger.", "Villains.", "Heroes."],
    comments: [
      "he's not even top 20 and he knows it",
      "why is everyone talking about him",
      "the fit was a crime and I can't stop looking",
      "SIT DOWN",
      "ok the celebration was actually hard",
      "this man lives in my head rent free",
      "ban him. then sign him.",
      "worst player in the league (I watched all 82)",
      "I hate that I love this",
      "he did the thing again",
      "somebody guard him. anybody.",
      "you're all still talking about him though",
      "mute this account. wait no.",
      "he's a villain and the league is better for it",
      "boo. louder. BOO.",
      "the tunnel walk was more important than the game",
      "can't stand him. front row tomorrow.",
      "PLEASE stop giving him attention",
      "ratings: up",
      "he is exhausting. I am seated.",
    ],
    peak: "THE INTERNET CALLS IT RAGE BAIT.",
    silence: "Basketball has been doing it forever.",
    counterLabel: "REACTIONS",
  },

  principles: [
    {
      id: "interrupt",
      index: "01",
      title: "INTERRUPT THE FIELD",
      statement: "Product should break the visual expectation around it.",
      explanation:
        "Uniformity is invisible. The eye goes to the thing that doesn't belong. Design the break: one colour out of key, one proportion out of scale, one element that refuses the grid.",
      prompt: "Move through the field.",
      interaction: "interrupt",
    },
    {
      id: "target",
      index: "02",
      title: "WEAR THE TARGET",
      statement: "Make attention something the athlete chooses rather than avoids.",
      explanation:
        "The crosshair is a graphic, not a threat. Chest-centred marks, hi-vis placement, sightline colour. Put the athlete where the eyes already are and let them own it.",
      prompt: "Press and hold.",
      interaction: "target",
    },
    {
      id: "friction",
      index: "03",
      title: "CREATE FRICTION",
      statement: "Unexpected combinations are more memorable than perfect harmony.",
      explanation:
        "Clash textures. Mix eras. Put a fashion proportion on a performance body. Harmony is forgotten by halftime; friction gets talked about for a week.",
      prompt: "Drag them together.",
      interaction: "friction",
    },
    {
      id: "secondlook",
      index: "04",
      title: "REWARD THE SECOND LOOK",
      statement: "Details should reveal themselves progressively.",
      explanation:
        "The first look sells the attitude. The second look sells the object: tonal graphics, hidden messages in seams, trims you only notice courtside. Layer the story at three distances.",
      prompt: "Look closer.",
      interaction: "secondlook",
    },
    {
      id: "neutral",
      index: "05",
      title: "NEVER NEUTRAL",
      statement: "Every meaningful product should create a point of view.",
      explanation:
        "Safe is the one thing an antagonist can't wear. If a product cannot start an argument, it will not start a conversation either. Pick a side, every time.",
      prompt: "Pick a side.",
      interaction: "neutral",
    },
  ],

  product: {
    intro: ["The idea has to", "end up on a body."],
    lenses: [
      {
        id: "silhouette",
        title: "SILHOUETTE",
        provocation: "The shape should be read from the upper deck.",
        possibilities: ["Exaggerated shoulder line", "Drop hems that move late", "Cropped over long, long over cropped"],
        media: slot("product-silhouette", "Silhouette study — full length", { ratio: "3 / 4" }),
        object: { proportion: 1, graphic: 0, hue: 0, grain: 0.1, trim: 0, mark: 0, layer: 0, tilt: 0 , zoom: 0, orbit: 0, look: 0 },
      },
      {
        id: "graphics",
        title: "GRAPHICS",
        provocation: "Graphics should talk before the athlete does.",
        possibilities: ["Broadcast-scale numerals", "Crowd-sign typography", "Headline crops as print"],
        media: slot("product-graphics", "Graphic study — chest placement", { ratio: "1 / 1", treatment: "halftone" }),
        object: { proportion: 0.5, graphic: 1, hue: 0.1, grain: 0.1, trim: 0, mark: 0, layer: 0, tilt: 0.1 , zoom: 0.35, orbit: 0.15, look: 0.2 },
      },
      {
        id: "color",
        title: "COLOR",
        provocation: "Colour that the opposing arena can see coming.",
        possibilities: ["One hostile hue per franchise", "Clash pairings, never tonal", "Away colour as a statement"],
        media: slot("product-color", "Colour study — clash pairing", { ratio: "4 / 5", treatment: "flat" }),
        object: { proportion: 0.5, graphic: 0.3, hue: 1, grain: 0.1, trim: 0, mark: 0, layer: 0, tilt: -0.1 , zoom: 0.2, orbit: -0.45, look: 0 },
      },
      {
        id: "material",
        title: "MATERIAL",
        provocation: "Surfaces with a temper.",
        possibilities: ["Crushed and coated", "Warm-up knit with a raw edge", "Sheen that flashes under arena light"],
        media: slot("product-material", "Material study — macro", { ratio: "1 / 1", treatment: "grain" }),
        object: { proportion: 0.4, graphic: 0.2, hue: 0.5, grain: 1, trim: 0.2, mark: 0, layer: 0, tilt: 0.2 , zoom: 0.9, orbit: 0.3, look: 0.1 },
      },
      {
        id: "trim",
        title: "TRIM",
        provocation: "The edge is where the argument lives.",
        possibilities: ["Contrast binding as a line drawing", "Exposed seams as graphics", "Hardware that clicks"],
        media: slot("product-trim", "Trim study — binding detail", { ratio: "1 / 1", treatment: "scan" }),
        object: { proportion: 0.4, graphic: 0.1, hue: 0.4, grain: 0.4, trim: 1, mark: 0, layer: 0, tilt: 0 , zoom: 0.8, orbit: 0, look: -0.9 },
      },
      {
        id: "branding",
        title: "BRANDING",
        provocation: "Placement that provokes.",
        possibilities: ["Oversized and off-centre", "Hidden until the second look", "Marks that read as a taunt"],
        media: slot("product-branding", "Branding study — placement", { ratio: "4 / 5", treatment: "flat" }),
        object: { proportion: 0.4, graphic: 0.1, hue: 0.4, grain: 0.3, trim: 0.3, mark: 1, layer: 0, tilt: -0.15 , zoom: 0.6, orbit: -0.2, look: 0.45 },
      },
      {
        id: "layering",
        title: "LAYERING",
        provocation: "The tunnel walk is a layering problem.",
        possibilities: ["Shell over shell", "Warm-up worn as outerwear", "Undershirts that are the story"],
        media: slot("product-layering", "Layering study — tunnel", { ratio: "3 / 4", treatment: "blur" }),
        object: { proportion: 0.6, graphic: 0.2, hue: 0.3, grain: 0.4, trim: 0.5, mark: 0.4, layer: 1, tilt: 0.15 , zoom: 0.3, orbit: 0.6, look: 0 },
      },
      {
        id: "proportion",
        title: "PROPORTION",
        provocation: "Wrong on purpose.",
        possibilities: ["Extra-long over extra-short", "Shoulder wider than the frame", "Collar as a crown"],
        media: slot("product-proportion", "Proportion study — profile", { ratio: "3 / 4", treatment: "grain" }),
        object: { proportion: 1, graphic: 0.3, hue: 0.3, grain: 0.3, trim: 0.3, mark: 0.3, layer: 0.5, tilt: 0.3 , zoom: 0.05, orbit: -0.1, look: 0 },
      },
      {
        id: "customization",
        title: "CUSTOMIZATION",
        provocation: "Let the athlete finish the sentence.",
        possibilities: ["Number, name, insult", "Swappable panels", "Court-side personalisation"],
        media: slot("product-customization", "Customisation study — panels", { ratio: "1 / 1", treatment: "halftone" }),
        object: { proportion: 0.6, graphic: 0.8, hue: 0.6, grain: 0.3, trim: 0.5, mark: 0.6, layer: 0.5, tilt: 0 , zoom: 0.5, orbit: 0.9, look: 0.3 },
      },
      {
        id: "styling",
        title: "STYLING",
        provocation: "The full look is the product.",
        possibilities: ["Tunnel to tip-off as one story", "Off-court codes on court", "Editorial first, catalogue never"],
        media: slot("product-styling", "Styling study — editorial", { ratio: "3 / 4", treatment: "blur" }),
        object: { proportion: 0.7, graphic: 0.6, hue: 0.8, grain: 0.5, trim: 0.7, mark: 0.7, layer: 0.8, tilt: -0.4 , zoom: 0.15, orbit: -0.7, look: -0.1 },
      },
    ],
  },

  worlds: [
    {
      id: "franchises",
      index: "01",
      title: "FRANCHISES",
      question: "How could franchise product become more distinctive and provocative?",
      provocations: [
        "Give every franchise an enemy, not just a hero.",
        "Franchise colour that the other team's fans hate on sight.",
        "Signature product with a signature attitude line.",
      ],
      palette: { bg: "#0B0B0B", fg: "#F2EFE9", accent: "#FF2E00" },
      media: [
        slot("world-franchise-01", "Franchise product — hero", { ratio: "3 / 4" }),
        slot("world-franchise-02", "Franchise product — detail", { ratio: "1 / 1", treatment: "scan" }),
        slot("world-franchise-03", "Franchise product — on body", { ratio: "4 / 5", treatment: "grain" }),
      ],
    },
    {
      id: "athletes",
      index: "02",
      title: "ATHLETES",
      question: "How does each athlete create their own version of antagonism?",
      provocations: [
        "One idea, many temperaments.",
        "Build the system so the athlete can misuse it.",
        "Not a uniform of villainy. A vocabulary.",
      ],
      palette: { bg: "#F2EFE9", fg: "#0B0B0B", accent: "#2B4CFF" },
      media: [slot("world-athlete-hero", "Athlete — editorial full length", { ratio: "3 / 4" })],
    },
    {
      id: "nba",
      index: "03",
      title: "NBA",
      question: "How could rivalries, cities, fan identity, uniforms and history create tension?",
      provocations: [
        "Rivalry as a colourway.",
        "City pride as a provocation.",
        "History you can pick a fight with.",
      ],
      palette: { bg: "#141210", fg: "#F2EFE9", accent: "#FFB800" },
      media: [
        slot("world-nba-01", "NBA — arena, hostile", { ratio: "16 / 9", treatment: "scan" }),
        slot("world-nba-02", "NBA — uniform detail", { ratio: "3 / 4", treatment: "grain" }),
      ],
    },
    {
      id: "wnba",
      index: "04",
      title: "WNBA",
      question: "Equal ambition. A different manifestation.",
      provocations: [
        "Confidence as the provocation.",
        "Fashion leadership that arrives before tip-off.",
        "Rivalries built in public, on purpose.",
      ],
      palette: { bg: "#1A0A14", fg: "#F2EFE9", accent: "#FF4FA3" },
      media: [
        slot("world-wnba-01", "WNBA — tunnel, editorial", { ratio: "3 / 4", treatment: "blur" }),
        slot("world-wnba-02", "WNBA — courtside, crowd", { ratio: "16 / 9", treatment: "scan" }),
        slot("world-wnba-03", "WNBA — product on body", { ratio: "4 / 5", treatment: "grain" }),
      ],
    },
  ],

  athletes: [
    {
      id: "athlete-01",
      name: "ATHLETE 01",
      attitude: "Says it to your face, then to the camera.",
      palette: { bg: "#0B0B0B", fg: "#F2EFE9", accent: "#FF2E00" },
      portrait: slot("athlete-01-portrait", "Athlete 01 — portrait"),
    },
    {
      id: "athlete-02",
      name: "ATHLETE 02",
      attitude: "Never says a word. Dresses like the argument.",
      palette: { bg: "#F2EFE9", fg: "#0B0B0B", accent: "#2B4CFF" },
      portrait: slot("athlete-02-portrait", "Athlete 02 — portrait"),
    },
    {
      id: "athlete-03",
      name: "ATHLETE 03",
      attitude: "Celebrates before the ball is through the net.",
      palette: { bg: "#FFB800", fg: "#0B0B0B", accent: "#0B0B0B" },
      portrait: slot("athlete-03-portrait", "Athlete 03 — portrait"),
    },
    {
      id: "athlete-04",
      name: "ATHLETE 04",
      attitude: "Plays best in the building that hates her most.",
      palette: { bg: "#1A0A14", fg: "#F2EFE9", accent: "#FF4FA3" },
      portrait: slot("athlete-04-portrait", "Athlete 04 — portrait"),
    },
  ],

  rivalries: [
    { a: "CITY A", b: "CITY B", line: "Two zip codes. One trophy. Forty years of receipts." },
    { a: "EAST", b: "WEST", line: "Geography is a grudge." },
    { a: "HOME", b: "AWAY", line: "The away colour should feel like an invasion." },
    { a: "THEN", b: "NOW", line: "History is a rival too." },
  ],

  exit: {
    lines: [
      ["DON'T ASK", "TO BE LIKED."],
      ["ASK", "TO BE REMEMBERED."],
    ],
    attitude: "MAKE 'EM MAD.",
    credit: ["Nike Basketball Apparel", "Seasonal Creative Direction"],
  },
};

export default season;
