import type { OperatorSide } from "@prisma/client";

export const OFFICIAL_OPERATOR_DIRECTORY_URL =
  "https://www.ubisoft.com/en-us/game/rainbow-six/siege/game-info/operators";
export const OFFICIAL_OPERATOR_DIRECTORY_TITLE =
  "Operators | Tom Clancy's Rainbow Six Siege | Ubisoft (US)";
export const OPERATOR_DATA_VERSION = "y11s2-2026-07-22";
export const OPERATOR_DATA_RETRIEVED_AT = "2026-07-22T00:00:00.000Z";

type OfficialRosterTuple = readonly [
  slug: string,
  displayName: string,
  side: "A" | "D",
  specialties: string,
];

// Extracted from Ubisoft's official operator directory on 2026-07-22. The
// directory is the roster/side/specialty source; detail pages are used for the
// representative structured records below.
const OFFICIAL_ROSTER_TUPLES = [
  ["solid-snake", "Solid Snake", "A", "intel,front-line"],
  ["denari", "Denari", "D", "anti-entry,crowd-control"],
  ["rauora", "Rauora", "A", "support,map-control"],
  ["skopos", "Skopós", "D", "intel,support"],
  ["sentry", "Sentry", "D", "support,starter-operators"],
  ["striker", "Striker", "A", "support,starter-operators"],
  ["deimos", "Deimos", "A", "intel,map-control"],
  ["tubarao", "Tubarão", "D", "anti-entry,anti-gadget"],
  ["ram", "Ram", "A", "anti-gadget,breach"],
  ["fenrir", "Fenrir", "D", "trapper,crowd-control"],
  ["brava", "Brava", "A", "intel,anti-gadget"],
  ["solis", "Solis", "D", "support,intel"],
  ["grim", "Grim", "A", "map-control,front-line"],
  ["sens", "Sens", "A", "support,map-control"],
  ["azami", "Azami", "D", "anti-entry,support"],
  ["thorn", "Thorn", "D", "anti-entry,trapper"],
  ["osa", "Osa", "A", "support,intel"],
  ["thunderbird", "Thunderbird", "D", "support"],
  ["flores", "Flores", "A", "anti-gadget,intel"],
  ["aruni", "Aruni", "D", "anti-entry,anti-gadget"],
  ["zero", "Zero", "A", "anti-gadget,intel"],
  ["ace", "Ace", "A", "breach,anti-gadget"],
  ["melusi", "Melusi", "D", "intel,crowd-control"],
  ["oryx", "Oryx", "D", "support"],
  ["iana", "Iana", "A", "front-line,intel"],
  ["wamai", "Wamai", "D", "anti-gadget,trapper"],
  ["kali", "Kali", "A", "anti-gadget,support"],
  ["amaru", "Amaru", "A", "front-line,map-control"],
  ["goyo", "Goyo", "D", "anti-entry,trapper"],
  ["nokk", "NØKK", "A", "front-line,map-control"],
  ["warden", "Warden", "D", "anti-gadget,intel"],
  ["mozzie", "Mozzie", "D", "anti-gadget,intel"],
  ["gridlock", "Gridlock", "A", "support,map-control"],
  ["nomad", "Nomad", "A", "front-line,map-control"],
  ["kaid", "Kaid", "D", "anti-entry,anti-gadget"],
  ["clash", "Clash", "D", "intel,crowd-control"],
  ["maverick", "Maverick", "A", "breach,front-line"],
  ["maestro", "Maestro", "D", "anti-gadget,intel"],
  ["alibi", "Alibi", "D", "intel,trapper"],
  ["lion", "Lion", "A", "intel,map-control"],
  ["finka", "Finka", "A", "front-line,support"],
  ["vigil", "Vigil", "D", "anti-gadget,crowd-control"],
  ["dokkaebi", "Dokkaebi", "A", "intel,map-control"],
  ["zofia", "Zofia", "A", "breach,anti-gadget"],
  ["ela", "Ela", "D", "crowd-control,trapper"],
  ["ying", "Ying", "A", "front-line,map-control"],
  ["lesion", "Lesion", "D", "anti-entry,trapper"],
  ["mira", "Mira", "D", "intel,support"],
  ["jackal", "Jackal", "A", "intel,map-control"],
  ["hibana", "Hibana", "A", "breach,front-line"],
  ["echo", "Echo", "D", "intel,crowd-control"],
  ["caveira", "Caveira", "D", "intel,crowd-control"],
  ["capitao", "CAPITÃO", "A", "front-line,map-control"],
  ["blackbeard", "Blackbeard", "A", "breach,front-line"],
  ["valkyrie", "Valkyrie", "D", "intel,support"],
  ["buck", "Buck", "A", "breach,support"],
  ["frost", "Frost", "D", "anti-entry,trapper"],
  ["mute", "Mute", "D", "anti-gadget,crowd-control,starter-operators"],
  ["sledge", "Sledge", "A", "breach,anti-gadget,starter-operators"],
  ["smoke", "Smoke", "D", "anti-entry,trapper,starter-operators"],
  ["thatcher", "Thatcher", "A", "anti-gadget,support"],
  ["ash", "Ash", "A", "breach,front-line"],
  ["castle", "Castle", "D", "anti-entry,support"],
  ["pulse", "Pulse", "D", "intel,support"],
  ["thermite", "Thermite", "A", "breach,support,starter-operators"],
  ["montagne", "Montagne", "A", "intel,support"],
  ["twitch", "Twitch", "A", "anti-gadget,intel"],
  ["doc", "Doc", "D", "support"],
  ["rook", "Rook", "D", "support"],
  ["jager", "Jäger", "D", "anti-gadget,support"],
  ["bandit", "Bandit", "D", "anti-entry,anti-gadget,starter-operators"],
  ["blitz", "Blitz", "A", "front-line,map-control"],
  ["iq", "IQ", "A", "intel,support"],
  ["fuze", "Fuze", "A", "anti-gadget"],
  ["glaz", "Glaz", "A", "intel,support,starter-operators"],
  ["tachanka", "Tachanka", "D", "anti-entry,crowd-control"],
  ["kapkan", "Kapkan", "D", "anti-entry,trapper,starter-operators"],
] as const satisfies readonly OfficialRosterTuple[];

export type OfficialOperatorRosterEntry = {
  slug: string;
  displayName: string;
  side: OperatorSide;
  specialties: string[];
};

export const OFFICIAL_OPERATOR_ROSTER: OfficialOperatorRosterEntry[] =
  OFFICIAL_ROSTER_TUPLES.map(([slug, displayName, side, specialties]) => ({
    slug,
    displayName,
    side: side === "A" ? "ATTACKER" : "DEFENDER",
    specialties: specialties.split(","),
  }));

export type OfficialOperatorDetail = {
  squad: string;
  abilityName: string;
  abilitySummary: string;
  primaryWeapons: string[];
  secondaryWeapons: string[];
  secondaryGadgets: string[];
  communityRoles: string[];
  structuredAbility: Record<string, unknown>;
};

// Representative current detail records transcribed from each official
// Ubisoft operator page on 2026-07-22. Unknown numerical properties remain
// absent rather than being guessed.
export const OFFICIAL_OPERATOR_DETAILS: Record<string, OfficialOperatorDetail> =
  {
    thermite: {
      squad: "Redhammer",
      abilityName: "Exothermic Charge",
      abilitySummary:
        "A backline hard-breach ability used to open reinforced surfaces; Ubisoft emphasizes patience, communication, and protecting Thermite until the breach is ready.",
      primaryWeapons: ["556xi", "M1014"],
      secondaryWeapons: ["5.7 USG", "M45 MEUSOC", "ITA12S"],
      secondaryGadgets: ["Smoke Grenade", "Stun Grenade"],
      communityRoles: ["hard-breach", "support", "plant-support"],
      structuredAbility: {
        abilityType: "hard-breach",
        deploymentMethod: "placed charge",
        effectsOnReinforcedSurfaces: "opens a large breach",
        officialCounterExamples: ["Bandit", "Mute", "Mira"],
      },
    },
    buck: {
      squad: "Redhammer",
      abilityName: "Skeleton Key",
      abilitySummary:
        "An under-barrel 12-gauge breaching shotgun that can be alternated with Buck's primary weapon.",
      primaryWeapons: ["C8-SFW", "CAMRS"],
      secondaryWeapons: ["Mk1 9mm"],
      secondaryGadgets: ["Stun Grenade", "Claymore"],
      communityRoles: ["soft-breach", "vertical-play", "flex"],
      structuredAbility: {
        abilityType: "soft-breach",
        deploymentMethod: "under-barrel shotgun",
        effectsOnDestructibleSurfaces: "creates openings",
      },
    },
    zero: {
      squad: "Ghosteyes",
      abilityName: "Argus Launcher",
      abilitySummary:
        "Launches cameras into breakable or reinforced surfaces to watch either side; each camera has one laser shot for a key defender setup element or distraction.",
      primaryWeapons: ["MP7", "SC3000K"],
      secondaryWeapons: ["5.7 USG", "Gonne-6"],
      secondaryGadgets: ["Hard Breach Charge", "Claymore"],
      communityRoles: ["intel", "anti-gadget", "flank-watch"],
      structuredAbility: {
        abilityType: "intel-camera",
        deploymentMethod: "launcher",
        effectsOnObservation: "two-sided camera view",
        effectsOnGadgets: "one laser shot per camera",
      },
    },
    thatcher: {
      squad: "Redhammer",
      abilityName: "E.G.S. Disruptor (Electronic Gear Scanner Disruptor)",
      abilitySummary:
        "Detects enemy electronic devices through obstructions and deactivates them with a precise EMP blast.",
      primaryWeapons: ["AR33", "L85A2", "M590A1", "PMR90A2"],
      secondaryWeapons: ["P226 Mk 25"],
      secondaryGadgets: ["Breach Charge", "Claymore"],
      communityRoles: ["anti-gadget", "breach-support", "support"],
      structuredAbility: {
        abilityType: "electronic-disruption",
        effectsOnElectronics: "detects and temporarily deactivates",
        activationMethod: "scanner-directed EMP blast",
      },
    },
    nomad: {
      squad: "Wolfguard",
      abilityName: "Airjab Launcher",
      abilitySummary:
        "Launches surface-mounted repulsion grenades that detonate when an enemy enters range, pushing and disorienting the target without being inherently lethal.",
      primaryWeapons: ["AK-74M", "ARX200"],
      secondaryWeapons: ["PRB92", ".44 MAG SEMI-AUTO"],
      secondaryGadgets: ["Breach Charge", "Stun Grenade"],
      communityRoles: ["flank-watch", "map-control", "post-plant"],
      structuredAbility: {
        abilityType: "movement-restriction",
        deploymentMethod: "launched adhesive device",
        effectsOnMovement: "repels and disorients",
      },
    },
    kapkan: {
      squad: "Viperstrike",
      abilityName: "Entry Denial Device",
      abilitySummary:
        "A motion-activated explosive trap placed on door or window frames to deny or punish entry.",
      primaryWeapons: ["9x19VSN", "SASG-12"],
      secondaryWeapons: ["PMM", "GSh-18"],
      secondaryGadgets: ["Barbed Wire", "Bulletproof Camera"],
      communityRoles: ["trap", "anti-entry", "roamer"],
      structuredAbility: {
        abilityType: "trap",
        deploymentMethod: "door or window frame",
        activationMethod: "motion trigger",
      },
    },
    wamai: {
      squad: "Nighthaven",
      abilityName: "Mag-NET System",
      abilitySummary:
        "A thrown adhesive gadget that attracts an eligible opponent projectile, then self-destructs to detonate it at the Mag-NET's position.",
      primaryWeapons: ["AUG A2", "MP5K"],
      secondaryWeapons: ["Super Shorty", "P12", "Keratos .357"],
      secondaryGadgets: ["Proximity Alarm", "Impact Grenade"],
      communityRoles: ["projectile-denial", "anchor", "site-setup"],
      structuredAbility: {
        abilityType: "projectile-redirection",
        deploymentMethod: "thrown adhesive gadget",
        effectsOnProjectiles: "attracts and relocates detonation",
      },
    },
    bandit: {
      squad: "Wolfguard",
      abilityName: "Shock Wire",
      abilitySummary:
        "The CED-1 Shock Wire electrifies supported defensive surfaces to deny key attacker entry tools.",
      primaryWeapons: ["MP7", "M870"],
      secondaryWeapons: ["P12"],
      secondaryGadgets: ["Barbed Wire", "Nitro Cell"],
      communityRoles: ["breach-denial", "roamer", "anti-gadget"],
      structuredAbility: {
        abilityType: "electronic-breach-denial",
        deploymentMethod: "placed battery",
        effectsOnGadgets: "electrifies supported surfaces",
      },
    },
    valkyrie: {
      squad: "Ghosteyes",
      abilityName: "Black Eye",
      abilitySummary:
        "A quick-deploy adhesive camera with a stabilized lens whose live video feed is available to the defending team.",
      primaryWeapons: ["MPX", "SPAS-12"],
      secondaryWeapons: ["D-50"],
      secondaryGadgets: ["Impact Grenade", "Nitro Cell"],
      communityRoles: ["intel", "roamer", "support"],
      structuredAbility: {
        abilityType: "intel-camera",
        deploymentMethod: "thrown adhesive camera",
        effectsOnObservation: "shared live video feed",
      },
    },
    doc: {
      squad: "Wolfguard",
      abilityName: "Stim Pistol",
      abilitySummary:
        "A handheld, trigger-operated pistol that delivers a documented epinephrine dose using a pressurized canister.",
      primaryWeapons: ["MP5", "P90", "SG-CQB"],
      secondaryWeapons: ["P9", "LFP586", "Bailiff 410"],
      secondaryGadgets: ["Bulletproof Camera", "Barbed Wire"],
      communityRoles: ["healer-sustain", "anchor", "support"],
      structuredAbility: {
        abilityType: "healing",
        deploymentMethod: "projectile pistol",
        effectsOnHealth: "healing or recovery",
      },
    },
    dokkaebi: {
      squad: "Viperstrike",
      abilityName: "Jegeo Payload",
      abilitySummary:
        "Uploads malware to enemy devices to block Observation Tools; targeted phones explode for documented damage and create a damaging fire area.",
      primaryWeapons: ["BOSG.12.2", "Mk 14 EBR", "XK23"],
      secondaryWeapons: ["Gonne-6", "SMG-12", "C75 Auto"],
      secondaryGadgets: ["Smoke Grenade", "Impact EMP Grenade"],
      communityRoles: ["intel", "intel-denial", "support"],
      structuredAbility: {
        abilityType: "electronic-disruption",
        activationMethod: "remote payload upload",
        effectsOnObservation: "blocks Observation Tools",
        documentedPhoneDamage: 40,
        remaster: "Operation System Override, Year 11 Season 2",
      },
    },
  };

export function officialOperatorDetailUrl(slug: string) {
  return `${OFFICIAL_OPERATOR_DIRECTORY_URL}/${slug}`;
}
