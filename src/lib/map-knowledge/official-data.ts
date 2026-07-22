import type {
  MapLifecycleStatus,
  MapPlaylist,
  MapPlaylistAvailability,
} from "@prisma/client";

export const OFFICIAL_MAP_DATA_VERSION = "r6-y11s2.2-2026-07-22";
export const OFFICIAL_MAP_RETRIEVED_AT = "2026-07-22T00:00:00.000Z";
export const OFFICIAL_MAP_INDEX_URL =
  "https://www.ubisoft.com/en-us/game/rainbow-six/siege/game-info/maps";
export const SYSTEM_OVERRIDE_URL =
  "https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/seasons/systemoverride";
export const SYSTEM_OVERRIDE_MIDSEASON_URL =
  "https://news.ubisoft.com/en-us/article/6Cs9lXypzDo1pQSE43KDH4/rainbow-six-siege-operation-system-override-midseason-update-everything-you-need-to-know";
export const DAYBREAK_URL =
  "https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/seasons/daybreak";

export const CURRENT_GAME_DATA_VERSION = {
  stableId: OFFICIAL_MAP_DATA_VERSION,
  year: 11,
  seasonName: "Operation System Override",
  seasonNumber: 2,
  releaseDate: "2026-06-02T00:00:00.000Z",
  verificationDate: OFFICIAL_MAP_RETRIEVED_AT,
  notes:
    "Current catalog after the July 16, 2026 Y11S2 mid-season Ranked rotation. Map-page facts and newer seasonal overrides are stored with separate citations.",
  sourceUrl: SYSTEM_OVERRIDE_URL,
  sourceTitle: "Operation System Override | Rainbow Six Siege | Ubisoft",
} as const;

type OfficialPlaylistRecord = {
  playlist: MapPlaylist;
  availability: MapPlaylistAvailability;
  sourceUrl?: string;
  sourceTitle?: string;
  notes?: string;
};

export type OfficialMapRecord = {
  stableId: string;
  slug: string;
  name: string;
  location: string;
  description: string;
  releaseLabel: string;
  releaseDate: string;
  modernizationLabel?: string;
  modernizationDate?: string;
  lifecycleStatus?: MapLifecycleStatus;
  sourceUrl: string;
  sourceTitle: string;
  blueprintAvailable: boolean;
  versionKey: string;
  versionName: string;
  playlists: OfficialPlaylistRecord[];
  aliases?: string[];
};

const mapUrl = (slug: string) =>
  `https://www.ubisoft.com/en-us/game/rainbow-six/siege/game-info/maps/${slug}`;
const mapTitle = (name: string) =>
  `${name} | Maps | Tom Clancy's Rainbow Six Siege | Ubisoft`;
const active = (...playlists: MapPlaylist[]): OfficialPlaylistRecord[] =>
  playlists.map((playlist) => ({
    playlist,
    availability: "ACTIVE",
  }));
const rankedOutside = (name: string): OfficialPlaylistRecord => ({
  playlist: "RANKED",
  availability: "TEMPORARILY_OUTSIDE",
  sourceUrl: SYSTEM_OVERRIDE_MIDSEASON_URL,
  sourceTitle:
    "Rainbow Six Siege Operation System Override Mid-Season Update: Everything You Need to Know",
  notes: `${name} was listed as removed from Ranked in the July 16, 2026 mid-season rotation. The map still exists and may remain available in other playlists.`,
});

export const OFFICIAL_MAPS: OfficialMapRecord[] = [
  {
    stableId: "calypso-casino",
    slug: "calypso-casino",
    name: "Calypso Casino",
    location: "Las Vegas, Nevada",
    description:
      "Located in the heart of Las Vegas, Calypso Casino pays tribute to the Rainbow Six Vegas legacy. Built for competitive play, it includes vertical drone vents, a rooftop crane, and a basement Vault.",
    releaseLabel: "Operation System Override (June 2026)",
    releaseDate: "2026-06-02T00:00:00.000Z",
    modernizationLabel: "Operation System Override (June 2026)",
    modernizationDate: "2026-06-02T00:00:00.000Z",
    sourceUrl: mapUrl("calypso-casino"),
    sourceTitle: mapTitle("Calypso Casino"),
    blueprintAvailable: true,
    versionKey: "system-override-2026",
    versionName: "Operation System Override layout",
    playlists: active("RANKED", "UNRANKED", "QUICK_MATCH", "TEAM_DEATHMATCH"),
    aliases: ["Calypso"],
  },
  {
    stableId: "chalet",
    slug: "chalet",
    name: "Chalet",
    location: "Courchevel, France",
    description:
      "A shootout in an après-ski chalet in the French Alps, contrasting warm interiors with cold exterior sightlines.",
    releaseLabel: "Base game (December 2015)",
    releaseDate: "2015-12-01T00:00:00.000Z",
    modernizationLabel: "Siege X (June 2025)",
    modernizationDate: "2025-06-10T00:00:00.000Z",
    sourceUrl: mapUrl("chalet"),
    sourceTitle: mapTitle("Chalet"),
    blueprintAvailable: true,
    versionKey: "siege-x-2025",
    versionName: "Siege X modernization",
    playlists: active("QUICK_MATCH", "RANKED", "UNRANKED", "TEAM_DEATHMATCH"),
  },
  {
    stableId: "clubhouse",
    slug: "clubhouse",
    name: "Clubhouse",
    location: "Hanover, Germany",
    description:
      "A biker gang clubhouse with mixed interior and exterior play, including a bar, gaming tables, and varied tactical entry options.",
    releaseLabel: "Base game (December 2015)",
    releaseDate: "2015-12-01T00:00:00.000Z",
    modernizationLabel: "Siege X (June 2025)",
    modernizationDate: "2025-06-10T00:00:00.000Z",
    sourceUrl: mapUrl("clubhouse"),
    sourceTitle: mapTitle("Clubhouse"),
    blueprintAvailable: true,
    versionKey: "siege-x-2025",
    versionName: "Siege X modernization",
    playlists: active("QUICK_MATCH", "RANKED", "TEAM_DEATHMATCH", "UNRANKED"),
    aliases: ["Club"],
  },
  {
    stableId: "border",
    slug: "border",
    name: "Border",
    location: "Middle East",
    description:
      "A border-control complex combining old and new buildings with open-air pathways and extensive destructibility.",
    releaseLabel: "Dust Line (May 2016)",
    releaseDate: "2016-05-01T00:00:00.000Z",
    modernizationLabel: "Siege X (June 2025)",
    modernizationDate: "2025-06-10T00:00:00.000Z",
    sourceUrl: mapUrl("border"),
    sourceTitle: mapTitle("Border"),
    blueprintAvailable: true,
    versionKey: "siege-x-2025",
    versionName: "Siege X modernization",
    playlists: active("QUICK_MATCH", "RANKED", "TEAM_DEATHMATCH", "UNRANKED"),
  },
  {
    stableId: "bank",
    slug: "bank",
    name: "Bank",
    location: "Los Angeles, California",
    description:
      "A fortified bank designed around attacker progression through increasingly secure areas.",
    releaseLabel: "Base game (December 2015)",
    releaseDate: "2015-12-01T00:00:00.000Z",
    modernizationLabel: "Siege X (June 2025)",
    modernizationDate: "2025-06-10T00:00:00.000Z",
    sourceUrl: mapUrl("bank"),
    sourceTitle: mapTitle("Bank"),
    blueprintAvailable: true,
    versionKey: "siege-x-2025",
    versionName: "Siege X modernization",
    playlists: active("QUICK_MATCH", "RANKED", "UNRANKED", "TEAM_DEATHMATCH"),
  },
  {
    stableId: "kafe-dostoyevsky",
    slug: "kafe-dostoyevsky",
    name: "Kafe Dostoyevsky",
    location: "Moscow, Russia",
    description:
      "A high-class central Moscow café whose rich classic interior makes destruction a defining part of play.",
    releaseLabel: "Base game (December 2015)",
    releaseDate: "2015-12-01T00:00:00.000Z",
    modernizationLabel: "Siege X (June 2025)",
    modernizationDate: "2025-06-10T00:00:00.000Z",
    sourceUrl: mapUrl("kafe-dostoyevsky"),
    sourceTitle: mapTitle("Kafe Dostoyevsky"),
    blueprintAvailable: true,
    versionKey: "siege-x-2025",
    versionName: "Siege X modernization",
    playlists: active("QUICK_MATCH", "RANKED", "UNRANKED", "TEAM_DEATHMATCH"),
    aliases: ["Kafe"],
  },
  {
    stableId: "stadium-alpha",
    slug: "stadium-alpha",
    name: "Stadium Alpha",
    location: "Greece",
    description:
      "A competitive Stadium layout updated in June 2024 with removed bulletproof glass and changed destructibility.",
    releaseLabel: "Operation Brutal Swarm (September 2022)",
    releaseDate: "2022-09-01T00:00:00.000Z",
    modernizationLabel: "June 2024",
    modernizationDate: "2024-06-01T00:00:00.000Z",
    sourceUrl: mapUrl("stadium-alpha"),
    sourceTitle: mapTitle("Stadium Alpha"),
    blueprintAvailable: true,
    versionKey: "june-2024",
    versionName: "June 2024 layout",
    playlists: active("UNRANKED", "QUICK_MATCH"),
  },
  {
    stableId: "stadium-bravo",
    slug: "stadium-bravo",
    name: "Stadium Bravo",
    location: "Greece",
    description:
      "A Stadium layout combining recognizable competitive spaces with June 2024 navigation and destructibility updates.",
    releaseLabel: "Operation Brutal Swarm (September 2022)",
    releaseDate: "2022-09-01T00:00:00.000Z",
    modernizationLabel: "June 2024",
    modernizationDate: "2024-06-01T00:00:00.000Z",
    sourceUrl: mapUrl("stadium-bravo"),
    sourceTitle: mapTitle("Stadium Bravo"),
    blueprintAvailable: true,
    versionKey: "june-2024",
    versionName: "June 2024 layout",
    playlists: active("UNRANKED", "QUICK_MATCH"),
  },
  {
    stableId: "lair",
    slug: "lair",
    name: "Lair",
    location: "Portugal",
    description:
      "A competitive three-floor map with numerous entry and breach points, emphasizing flanks and vertical play.",
    releaseLabel: "Operation Deep Freeze (November 2023)",
    releaseDate: "2023-11-01T00:00:00.000Z",
    modernizationLabel: "September 2025",
    modernizationDate: "2025-09-01T00:00:00.000Z",
    sourceUrl: mapUrl("lair"),
    sourceTitle: mapTitle("Lair"),
    blueprintAvailable: true,
    versionKey: "september-2025",
    versionName: "September 2025 modernization",
    playlists: active("UNRANKED", "QUICK_MATCH", "RANKED", "TEAM_DEATHMATCH"),
  },
  {
    stableId: "nighthaven-labs",
    slug: "nighthaven-labs",
    name: "Nighthaven Labs",
    location: "Offshore",
    description:
      "A competitive research facility with many entry and breach points that make fixed positions vulnerable to flanks.",
    releaseLabel: "Operation Solar Raid (December 2022)",
    releaseDate: "2022-12-01T00:00:00.000Z",
    modernizationLabel: "September 2025",
    modernizationDate: "2025-09-01T00:00:00.000Z",
    sourceUrl: mapUrl("nighthaven-labs"),
    sourceTitle: mapTitle("Nighthaven Labs"),
    blueprintAvailable: true,
    versionKey: "september-2025",
    versionName: "September 2025 modernization",
    playlists: active("UNRANKED", "RANKED", "QUICK_MATCH", "TEAM_DEATHMATCH"),
    aliases: ["Nighthaven", "Labs"],
  },
  {
    stableId: "close-quarter",
    slug: "close-quarter",
    name: "Close Quarter",
    location: "Greece",
    description:
      "Siege's first dedicated Team Deathmatch map, designed around movement, circular flow, and varied sightlines rather than defensive setup.",
    releaseLabel: "Operation Vector Glare (June 2022)",
    releaseDate: "2022-06-01T00:00:00.000Z",
    sourceUrl: mapUrl("close-quarter"),
    sourceTitle: mapTitle("Close Quarter"),
    blueprintAvailable: true,
    versionKey: "vector-glare-2022",
    versionName: "Operation Vector Glare layout",
    playlists: active("TEAM_DEATHMATCH"),
    aliases: ["Close Quarters"],
  },
  {
    stableId: "emerald-plains",
    slug: "emerald-plains",
    name: "Emerald Plains",
    location: "Ireland",
    description:
      "A Northern Ireland country club and ranch with visually distinct modern and classic floors for clearer orientation.",
    releaseLabel: "Demon Veil (April 2022)",
    releaseDate: "2022-04-01T00:00:00.000Z",
    modernizationLabel: "June 2026",
    modernizationDate: "2026-06-02T00:00:00.000Z",
    sourceUrl: mapUrl("emerald-plains"),
    sourceTitle: mapTitle("Emerald Plains"),
    blueprintAvailable: true,
    versionKey: "system-override-modernization-2026",
    versionName: "Operation System Override modernization",
    playlists: [
      ...active("QUICK_MATCH", "UNRANKED", "TEAM_DEATHMATCH"),
      rankedOutside("Emerald Plains"),
    ],
  },
  {
    stableId: "coastline",
    slug: "coastline",
    name: "Coastline",
    location: "Ibiza, Spain",
    description:
      "A rocky Ibiza resort combining ruins, bars, surrounding combat flow, and fast chaotic pushes.",
    releaseLabel: "Velvet Shell (February 2017)",
    releaseDate: "2017-02-01T00:00:00.000Z",
    modernizationLabel: "March 2026",
    modernizationDate: "2026-03-01T00:00:00.000Z",
    sourceUrl: mapUrl("coastline"),
    sourceTitle: mapTitle("Coastline"),
    blueprintAvailable: true,
    versionKey: "march-2026",
    versionName: "March 2026 modernization",
    playlists: [
      ...active("QUICK_MATCH", "UNRANKED", "TEAM_DEATHMATCH"),
      rankedOutside("Coastline"),
    ],
  },
  {
    stableId: "consulate",
    slug: "consulate",
    name: "Consulate",
    location: "Abidjan, Ivory Coast",
    description:
      "A high-risk assault on a fortified French consulate in Ivory Coast.",
    releaseLabel: "Base game (December 2015)",
    releaseDate: "2015-12-01T00:00:00.000Z",
    modernizationLabel: "September 2025",
    modernizationDate: "2025-09-01T00:00:00.000Z",
    sourceUrl: mapUrl("consulate"),
    sourceTitle: mapTitle("Consulate"),
    blueprintAvailable: true,
    versionKey: "september-2025",
    versionName: "September 2025 modernization",
    playlists: active("QUICK_MATCH", "RANKED", "TEAM_DEATHMATCH", "UNRANKED"),
  },
  {
    stableId: "favela",
    slug: "favela",
    name: "Favela",
    location: "Brazil",
    description:
      "A dense Brazilian neighborhood mixing narrow streets, high vantage points, and substantial exterior destruction.",
    releaseLabel: "Skull Rain (August 2016)",
    releaseDate: "2016-08-01T00:00:00.000Z",
    modernizationLabel: "June 2021",
    modernizationDate: "2021-06-01T00:00:00.000Z",
    sourceUrl: mapUrl("favela"),
    sourceTitle: mapTitle("Favela"),
    blueprintAvailable: true,
    versionKey: "north-star-rework-2021",
    versionName: "North Star rework",
    playlists: active("QUICK_MATCH", "UNRANKED"),
  },
  {
    stableId: "fortress",
    slug: "fortress",
    name: "Fortress",
    location: "Morocco",
    description:
      "A large daytime mudbrick kasbah with architecture drawn from southern Morocco.",
    releaseLabel: "Wind Bastion (December 2018)",
    releaseDate: "2018-12-01T00:00:00.000Z",
    modernizationLabel: "December 2025",
    modernizationDate: "2025-12-01T00:00:00.000Z",
    sourceUrl: mapUrl("fortress"),
    sourceTitle: mapTitle("Fortress"),
    blueprintAvailable: true,
    versionKey: "december-2025",
    versionName: "December 2025 modernization",
    playlists: active("QUICK_MATCH", "UNRANKED", "RANKED"),
  },
  {
    stableId: "hereford-base",
    slug: "hereford-base",
    name: "Hereford Base",
    location: "United Kingdom",
    description:
      "An SAS training base built from plywood targets, sandbags, barbed wire, and other archetypal Siege obstacles.",
    releaseLabel: "Base game (December 2015)",
    releaseDate: "2015-12-01T00:00:00.000Z",
    modernizationLabel: "September 2018",
    modernizationDate: "2018-09-01T00:00:00.000Z",
    sourceUrl: mapUrl("hereford-base"),
    sourceTitle: mapTitle("Hereford Base"),
    blueprintAvailable: true,
    versionKey: "grim-sky-rework-2018",
    versionName: "Grim Sky rework",
    playlists: [],
  },
  {
    stableId: "house",
    slug: "house",
    name: "House",
    location: "Los Angeles, California",
    description:
      "A suburban home emphasizing familiarity, vulnerability, destructive depth, and replayability.",
    releaseLabel: "Base game (December 2015)",
    releaseDate: "2015-12-01T00:00:00.000Z",
    modernizationLabel: "June 2020",
    modernizationDate: "2020-06-01T00:00:00.000Z",
    sourceUrl: mapUrl("house"),
    sourceTitle: mapTitle("House"),
    blueprintAvailable: true,
    versionKey: "steel-wave-rework-2020",
    versionName: "Steel Wave rework",
    playlists: active("QUICK_MATCH", "UNRANKED"),
  },
  {
    stableId: "kanal",
    slug: "kanal",
    name: "Kanal",
    location: "Hamburg, Germany",
    description:
      "An industrial Hamburg complex spanning multiple buildings, canals, bridges, and strategic connecting points.",
    releaseLabel: "Launch (December 2015)",
    releaseDate: "2015-12-01T00:00:00.000Z",
    modernizationLabel: "June 2026",
    modernizationDate: "2026-06-02T00:00:00.000Z",
    sourceUrl: mapUrl("kanal"),
    sourceTitle: mapTitle("Kanal"),
    blueprintAvailable: true,
    versionKey: "system-override-modernization-2026",
    versionName: "Operation System Override modernization",
    playlists: active("QUICK_MATCH", "RANKED", "UNRANKED", "TEAM_DEATHMATCH"),
  },
  {
    stableId: "oregon",
    slug: "oregon",
    name: "Oregon",
    location: "Redmond, Oregon",
    description:
      "A fortified survivalist compound with a rustic, spread-out layout that rewards adapted clearing and holding tactics.",
    releaseLabel: "Base game (December 2015)",
    releaseDate: "2015-12-01T00:00:00.000Z",
    modernizationLabel: "March 2026",
    modernizationDate: "2026-03-01T00:00:00.000Z",
    sourceUrl: mapUrl("oregon"),
    sourceTitle: mapTitle("Oregon"),
    blueprintAvailable: true,
    versionKey: "march-2026",
    versionName: "March 2026 modernization",
    playlists: active("RANKED", "QUICK_MATCH", "UNRANKED", "TEAM_DEATHMATCH"),
  },
  {
    stableId: "outback",
    slug: "outback",
    name: "Outback",
    location: "Australia",
    description:
      "An Australian desert service station and motel inspired by remote highways and their distinctive local spaces.",
    releaseLabel: "Burnt Horizon (March 2019)",
    releaseDate: "2019-03-01T00:00:00.000Z",
    modernizationLabel: "June 2026",
    modernizationDate: "2026-06-02T00:00:00.000Z",
    sourceUrl: mapUrl("outback"),
    sourceTitle: mapTitle("Outback"),
    blueprintAvailable: true,
    versionKey: "system-override-modernization-2026",
    versionName: "Operation System Override modernization",
    playlists: [
      ...active("QUICK_MATCH", "UNRANKED", "TEAM_DEATHMATCH"),
      rankedOutside("Outback"),
    ],
  },
  {
    stableId: "presidential-plane",
    slug: "presidential-plane",
    name: "Presidential Plane",
    location: "London, United Kingdom",
    description:
      "A claustrophobic presidential aircraft with constrained sightlines and limited breaching opportunities.",
    releaseLabel: "Base game (December 2015)",
    releaseDate: "2015-12-01T00:00:00.000Z",
    sourceUrl: mapUrl("presidential-plane"),
    sourceTitle: mapTitle("Presidential Plane"),
    blueprintAvailable: true,
    versionKey: "base-2015",
    versionName: "Base-game layout",
    playlists: active("QUICK_MATCH", "UNRANKED"),
    aliases: ["Plane"],
  },
  {
    stableId: "skyscraper",
    slug: "skyscraper",
    name: "Skyscraper",
    location: "Nagoya, Japan",
    description:
      "A Japanese mansion high above Nagoya where modern and traditional architecture meet exterior rappels.",
    releaseLabel: "Red Crow (November 2016)",
    releaseDate: "2016-11-01T00:00:00.000Z",
    modernizationLabel: "December 2025",
    modernizationDate: "2025-12-01T00:00:00.000Z",
    sourceUrl: mapUrl("skyscraper"),
    sourceTitle: mapTitle("Skyscraper"),
    blueprintAvailable: true,
    versionKey: "december-2025",
    versionName: "December 2025 modernization",
    playlists: active("RANKED", "TEAM_DEATHMATCH", "QUICK_MATCH", "UNRANKED"),
  },
  {
    stableId: "theme-park",
    slug: "theme-park",
    name: "Theme Park",
    location: "Hong Kong",
    description:
      "An abandoned Hong Kong theme park built for colorful, dynamic, fast-paced confrontations.",
    releaseLabel: "Blood Orchid (August 2017)",
    releaseDate: "2017-08-01T00:00:00.000Z",
    modernizationLabel: "December 2025",
    modernizationDate: "2025-12-01T00:00:00.000Z",
    sourceUrl: mapUrl("theme-park"),
    sourceTitle: mapTitle("Theme Park"),
    blueprintAvailable: true,
    versionKey: "december-2025",
    versionName: "December 2025 modernization",
    playlists: active("RANKED", "TEAM_DEATHMATCH", "QUICK_MATCH", "UNRANKED"),
  },
  {
    stableId: "tower",
    slug: "tower",
    name: "Tower",
    location: "Seoul, South Korea",
    description:
      "A multilevel communications and observation tower with vertical vantage points over Seoul.",
    releaseLabel: "White Noise (November 2017)",
    releaseDate: "2017-11-01T00:00:00.000Z",
    sourceUrl: mapUrl("tower"),
    sourceTitle: mapTitle("Tower"),
    blueprintAvailable: true,
    versionKey: "white-noise-2017",
    versionName: "White Noise layout",
    playlists: active("QUICK_MATCH", "UNRANKED"),
  },
  {
    stableId: "villa",
    slug: "villa",
    name: "Villa",
    location: "Tuscany, Italy",
    description:
      "A Tuscan crime-family retreat left in disarray during an evacuation before Team Rainbow's raid.",
    releaseLabel: "Para Bellum (June 2018)",
    releaseDate: "2018-06-01T00:00:00.000Z",
    modernizationLabel: "March 2026",
    modernizationDate: "2026-03-01T00:00:00.000Z",
    sourceUrl: mapUrl("villa"),
    sourceTitle: mapTitle("Villa"),
    blueprintAvailable: true,
    versionKey: "march-2026",
    versionName: "March 2026 modernization",
    playlists: active("RANKED", "TEAM_DEATHMATCH", "QUICK_MATCH", "UNRANKED"),
  },
  {
    stableId: "yacht",
    slug: "yacht",
    name: "Yacht",
    location: "Baffin Bay",
    description:
      "A luxury yacht stranded against an iceberg after its hull was breached, with a submarine docked nearby.",
    releaseLabel: "Black Ice (February 2016)",
    releaseDate: "2016-02-01T00:00:00.000Z",
    sourceUrl: mapUrl("yacht"),
    sourceTitle: mapTitle("Yacht"),
    blueprintAvailable: true,
    versionKey: "black-ice-2016",
    versionName: "Black Ice layout",
    playlists: active("QUICK_MATCH", "UNRANKED"),
  },
  {
    stableId: "district",
    slug: "district",
    name: "District",
    location: "Urban cityscape",
    description:
      "The exclusive Dual Front setting: a large mirrored urban map with derelict and modern sectors, playable exteriors, and a central Neutral Sector.",
    releaseLabel: "Operation Daybreak / Siege X (June 2025)",
    releaseDate: "2025-06-10T00:00:00.000Z",
    lifecycleStatus: "DUAL_FRONT_ONLY",
    sourceUrl: DAYBREAK_URL,
    sourceTitle: "Operation Daybreak | Rainbow Six Siege | Ubisoft",
    blueprintAvailable: false,
    versionKey: "daybreak-2025",
    versionName: "Siege X Dual Front launch layout",
    playlists: active("DUAL_FRONT"),
  },
];

export const REQUIRED_BROWSER_MAPS = [
  "oregon",
  "clubhouse",
  "chalet",
  "border",
  "lair",
  "fortress",
  "villa",
  "calypso-casino",
] as const;
