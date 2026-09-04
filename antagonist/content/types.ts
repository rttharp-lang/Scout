/**
 * Content schema for the seasonal creative-direction platform.
 *
 * Everything the experience renders comes from a single `SeasonConfig`
 * (see ./season.ts). Next season: duplicate season.ts, change the values,
 * keep the shape.
 */

/** A replaceable media slot. Leave `src` undefined to render a procedural placeholder. */
export interface MediaAsset {
  /** Stable id, used by the Placeholder component and documented in the README. */
  id: string;
  /** Human label rendered on the placeholder so the team knows what goes here. */
  label: string;
  kind: "image" | "video";
  /** Path under /public (e.g. "/assets/athlete-01.jpg") or remote URL. */
  src?: string;
  /** Optional poster for videos. */
  poster?: string;
  alt?: string;
  /** Aspect ratio as CSS value, e.g. "3 / 4". */
  ratio?: string;
  /** Procedural treatment used while the slot is empty. */
  treatment?: "grain" | "scan" | "halftone" | "blur" | "flat";
}

export interface Palette {
  /** Near-black environment colour. */
  ink: string;
  /** Paper / flash white. */
  paper: string;
  /** Primary provocation colour. */
  accent: string;
  /** Secondary clash colour (used for friction / love side). */
  clash: string;
  /** Muted grey for broadcast chrome. */
  mute: string;
}

export interface Fragment {
  text: string;
  /** 0..1 horizontal / vertical positions on the stage. */
  x: number;
  y: number;
  /** Relative size multiplier. */
  size?: number;
}

export interface Archetype {
  id: string;
  name: string;
  /** Broadcast-style headline that sits with the name. */
  headline: string;
  /** Quote in the voice of the archetype (original placeholder copy). */
  quote: string;
  /** Behaviours the archetype exhibits. */
  behaviors: string[];
  /** Environment tone for this archetype. */
  tone: "cold" | "hot" | "flash" | "dirt" | "clean" | "void";
  portrait: MediaAsset;
  archive: MediaAsset[];
}

export interface Principle {
  id: string;
  index: string;
  title: string;
  /** One-line statement. */
  statement: string;
  /** Short explanation shown after the interaction. */
  explanation: string;
  /** Prompt shown on the interactive stage before the reveal. */
  prompt: string;
  /** Which built-in interaction demonstrates this principle. */
  interaction: "interrupt" | "target" | "friction" | "secondlook" | "neutral";
}

export interface ProductLens {
  id: string;
  title: string;
  /** Provocation: what the concept asks of this lens. */
  provocation: string;
  /** Possibility bullets (kept short, they are directions not specs). */
  possibilities: string[];
  media: MediaAsset;
  /** WebGL object state for this lens (see components/webgl/GarmentObject.tsx). */
  object: {
    proportion: number;   // 0..1  exaggeration of shoulder / hem
    graphic: number;      // 0..1  graphic pattern presence
    hue: number;          // 0..1  colour drift toward accent / clash
    grain: number;        // 0..1  material roughness / displacement
    trim: number;         // 0..1  edge highlight
    mark: number;         // 0..1  oversized branding placement
    layer: number;        // 0..1  second shell
    tilt: number;         // -1..1 camera tilt for styling
  };
}

export interface AthleteVoice {
  id: string;
  name: string;
  /** Their personal version of antagonism, one line. */
  attitude: string;
  palette: { bg: string; fg: string; accent: string };
  portrait: MediaAsset;
}

export interface Rivalry {
  a: string;
  b: string;
  line: string;
}

export interface World {
  id: "franchises" | "athletes" | "nba" | "wnba";
  index: string;
  title: string;
  question: string;
  /** 2–4 provocations for this world. */
  provocations: string[];
  palette: { bg: string; fg: string; accent: string };
  media: MediaAsset[];
}

export interface SeasonConfig {
  meta: {
    brand: string;
    division: string;
    season: string;
    platform: string;
    chapter: string;
    attitude: string;
    subtitle: string;
  };
  palette: Palette;
  chapters: { id: string; index: string; title: string }[];
  entry: {
    noise: Fragment[];
    statement: string[];
    reveal: string;
    scrollHint: string;
  };
  reaction: {
    headline: string[];
    axis: { left: string; right: string; center: string; neutral: string };
    reveal: string;
    lines: string[];
  };
  archetypes: Archetype[];
  ragebait: {
    insight: string[];
    words: string[];
    comments: string[];
    peak: string;
    silence: string;
    counterLabel: string;
  };
  principles: Principle[];
  product: {
    intro: string[];
    lenses: ProductLens[];
  };
  worlds: World[];
  athletes: AthleteVoice[];
  rivalries: Rivalry[];
  exit: {
    lines: string[][];
    attitude: string;
    credit: string[];
  };
}
