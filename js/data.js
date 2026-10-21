'use strict';
// ---------- static game data ----------
const RES_KEYS = ['gmp', 'fuel', 'bio', 'common', 'minor', 'precious'];
const MAT_KEYS = ['fuel', 'bio', 'common', 'minor', 'precious'];
const RES_LABEL = { gmp: 'GMP', fuel: 'FUEL', bio: 'BIO', common: 'C.MET', minor: 'M.MET', precious: 'P.MET' };
const RES_NAME = { gmp: 'GMP', fuel: 'Fuel', bio: 'Biological Material', common: 'Common Metal', minor: 'Minor Metal', precious: 'Precious Metal' };

const DEPTS = {
  combat: { name: 'Combat', short: 'CMB', color: '#ff6b5a', desc: 'Operatives for deployments, FOB security and infiltrations. Combat level boosts squad tactics & training.' },
  rnd: { name: 'R&D', short: 'R&D', color: '#5ec8ff', desc: 'Develops weapons, gear, support and defenses. Level gates projects and speeds development.' },
  basedev: { name: 'Base Development', short: 'DEV', color: '#f2b33d', desc: 'Generates GMP, collects and processes materials, speeds construction.' },
  support: { name: 'Support', short: 'SUP', color: '#78dc96', desc: 'Fulton recovery, supply drops and fire support. Reduces deployment costs.' },
  intel: { name: 'Intel', short: 'INT', color: '#b58cff', desc: 'Reveals contract intel, marks enemies, scouts rival FOBs, warns of incursions, converts prisoners.' },
  medical: { name: 'Medical', short: 'MED', color: '#ff9fd0', desc: 'Treats injured and sick staff. Without it, injuries take far longer to heal.' },
};
const DEPT_KEYS = Object.keys(DEPTS);
const PLATFORM_KEYS = ['command', ...DEPT_KEYS, 'quarantine'];
const PLATFORM_NAME = { command: 'Command', quarantine: 'Quarantine', ...Object.fromEntries(DEPT_KEYS.map(k => [k, DEPTS[k].name])) };

const GRADES = [['E', 0], ['D', 10], ['C', 20], ['B', 30], ['A', 40], ['A+', 50], ['A++', 60], ['S', 70], ['S+', 80], ['S++', 90]];
const GRADE_CLASS = { 'E': 'g-E', 'D': 'g-D', 'C': 'g-C', 'B': 'g-B', 'A': 'g-A', 'A+': 'g-Ap', 'A++': 'g-App', 'S': 'g-S', 'S+': 'g-Sp', 'S++': 'g-Spp' };

const SKILLS = {
  sharpshooter: { name: 'Sharpshooter', icon: '◎', dept: 'combat', w: 3, desc: '+20% accuracy in battle.' },
  cqc: { name: 'Close Quarters', icon: '✊', dept: 'combat', w: 3, desc: '+50% accuracy within 12m.' },
  ghost: { name: 'Ghost', icon: '◌', dept: 'combat', w: 2, desc: 'Enemies notice this operative 35% slower.' },
  leader: { name: 'Squad Leader', icon: '★', dept: 'combat', w: 2, desc: 'Allies within 25m gain +10% accuracy. Sharper delegated AI.' },
  ironwill: { name: 'Iron Will', icon: '⛨', dept: 'combat', w: 2, desc: '+30 max HP. Resists tranquilizers.' },
  demo: { name: 'Demolitions', icon: '✸', dept: 'combat', w: 2, desc: 'Plants charges twice as fast.' },
  nightowl: { name: 'Night Owl', icon: '☾', dept: 'combat', w: 2, desc: 'Ignores night-time vision penalties.' },
  medic: { name: 'Combat Medic', icon: '✚', dept: 'medical', w: 3, desc: 'Revives downed allies 2x faster and patches up nearby squadmates.' },
  surgeon: { name: 'Surgeon', icon: '✂', dept: 'medical', w: 2, desc: '+10 effective Medical. Injured staff recover faster.' },
  recon: { name: 'Recon', icon: '◉', dept: 'intel', w: 3, desc: '+25% vision radius. Spots mines within 10m.' },
  hacker: { name: 'Hacker', icon: '⌨', dept: 'intel', w: 2, desc: 'Hacks & downloads 2x faster. Cameras notice them 50% slower.' },
  analyst: { name: 'Analyst', icon: '⌖', dept: 'intel', w: 2, desc: '+10 effective Intel.' },
  interrogator: { name: 'Interrogator', icon: '⚖', dept: 'intel', w: 2, desc: 'In Intel: prisoners in the brig turn faster.' },
  linguist: { name: 'Linguist', icon: '✉', dept: 'intel', w: 2, desc: 'In Intel: prisoners turn faster; better contract intel.' },
  fulton: { name: 'Fulton Specialist', icon: '⇡', dept: 'support', w: 3, desc: 'Fulton actions 2x faster, +10% success.' },
  pilot: { name: 'Pilot', icon: '✈', dept: 'support', w: 2, desc: 'Squads with a pilot travel 25% faster.' },
  quartermaster: { name: 'Quartermaster', icon: '▤', dept: 'support', w: 2, desc: '+10 effective Support. Fire support 15% cheaper.' },
  scientist: { name: 'Scientist', icon: '⚗', dept: 'rnd', w: 3, desc: '+10 effective R&D. Projects 10% faster.' },
  engineer: { name: 'Engineer', icon: '⚙', dept: 'basedev', w: 3, desc: '+10 effective Base Dev. Construction 10% faster.' },
  metallurgist: { name: 'Metallurgist', icon: '⛏', dept: 'basedev', w: 2, desc: 'In Base Dev: +15% metal processing.' },
  biochemist: { name: 'Biochemist', icon: '☘', dept: 'basedev', w: 2, desc: 'In Base Dev: +15% fuel & bio processing.' },
  negotiator: { name: 'Negotiator', icon: '¤', dept: null, w: 2, desc: '+5% contract payouts each (max +25%).' },
  diplomat: { name: 'Diplomat', icon: '☮', dept: null, w: 2, desc: 'Calms troublemakers in the same department.' },
  cook: { name: 'Field Cook', icon: '♨', dept: null, w: 2, desc: '+3 base-wide morale (max +15).' },
  hardy: { name: 'Hardy', icon: '♥', dept: null, w: 2, desc: 'Recovers from injuries 2x faster. Immune to disease.' },
  troublemaker: { name: 'Troublemaker', icon: '⚡', dept: null, w: 0, neg: true, desc: 'Starts fights in their department, injuring staff and lowering morale.' },
};

// ---------- weapons ----------
const WEAPONS = {
  tranq_pistol: { name: 'Tranq Pistol', lethal: false, stun: 60, range: 28, rof: 1.0, acc: 1.1, noise: 0 },
  ar1: { name: 'Assault Rifle Mk1', lethal: true, dmg: 22, range: 60, rof: 2.5, acc: 0.85, noise: 90 },
  ar2: { name: 'Assault Rifle Mk2 (SD)', lethal: true, dmg: 26, range: 62, rof: 2.6, acc: 0.9, noise: 14 },
  ar3: { name: 'Battle Rifle Mk3 (SD)', lethal: true, dmg: 34, range: 72, rof: 2.5, acc: 0.95, noise: 18 },
  smg: { name: 'Suppressed SMG', lethal: true, dmg: 15, range: 34, rof: 5.5, acc: 0.8, noise: 10 },
  shotgun: { name: 'Riot Shotgun (NL)', lethal: false, stun: 48, range: 16, rof: 1.4, acc: 1.25, noise: 35 },
  tranq_rifle: { name: 'Tranq Rifle', lethal: false, stun: 70, range: 55, rof: 1.1, acc: 0.95, noise: 0 },
  tranq_sniper: { name: 'Tranq Sniper', lethal: false, stun: 140, range: 125, rof: 0.45, acc: 1.12, noise: 0 },
  dmr: { name: 'Marksman Rifle', lethal: true, dmg: 58, range: 115, rof: 0.8, acc: 1.05, noise: 85 },
  amr: { name: 'Anti-Materiel Rifle', lethal: true, dmg: 150, range: 155, rof: 0.35, acc: 1.1, noise: 150 },
  lmg: { name: 'Light Machine Gun', lethal: true, dmg: 20, range: 72, rof: 6.5, acc: 0.55, noise: 110, suppress: 1 },
  // hostile
  e_rifle: { name: 'Rifle', lethal: true, dmg: 14, range: 55, rof: 2.2, acc: 0.8, noise: 90 },
  e_smg: { name: 'SMG', lethal: true, dmg: 12, range: 32, rof: 5, acc: 0.75, noise: 80 },
  e_lmg: { name: 'MG', lethal: true, dmg: 16, range: 68, rof: 6, acc: 0.5, noise: 110, suppress: 1 },
  e_sniper: { name: 'Sniper Rifle', lethal: true, dmg: 55, range: 120, rof: 0.45, acc: 1.0, noise: 120 },
  e_pistol: { name: 'Sidearm', lethal: true, dmg: 14, range: 25, rof: 1.5, acc: 0.85, noise: 70 },
  sec_tranq: { name: 'Security Tranq', lethal: false, stun: 45, range: 45, rof: 1.3, acc: 0.95, noise: 0 },
  sec_rifle: { name: 'Security Rifle (SD)', lethal: true, dmg: 20, range: 58, rof: 2.4, acc: 0.85, noise: 15 },
  uav_dart: { name: 'UAV Dart', lethal: false, stun: 35, range: 22, rof: 0.7, acc: 0.9, noise: 0 },
};
const PLAYER_WEAPONS = ['tranq_pistol', 'ar1', 'ar2', 'ar3', 'smg', 'shotgun', 'tranq_rifle', 'tranq_sniper', 'dmr', 'amr', 'lmg'];

// ---------- R&D ----------
const RD_CATS = ['Weapons', 'Gear', 'Support', 'Defense', 'Intel', 'Base'];
const RD_ITEMS = [
  // start-owned
  { id: 'tranq_pistol', cat: 'Weapons', name: 'Tranq Pistol', start: true, desc: 'Non-lethal sidearm. Silent. Two darts put most guards to sleep.' },
  { id: 'ar1', cat: 'Weapons', name: 'Assault Rifle Mk1', start: true, desc: 'Reliable lethal rifle. Loud — gunfire draws attention.' },
  { id: 'fulton1', cat: 'Gear', name: 'Fulton Recovery Mk1', start: true, desc: 'Extracts sleeping enemies and hostages to Mother Base. 70% success, 5s.' },
  // weapons
  { id: 'shotgun', cat: 'Weapons', name: 'Riot Shotgun (NL)', req: { rnd: 4 }, cost: { gmp: 18000, common: 300, minor: 40 }, hours: 3, desc: 'Non-lethal beanbag shotgun. Devastating at close range.' },
  { id: 'ar2', cat: 'Weapons', name: 'Assault Rifle Mk2 (SD)', req: { rnd: 7 }, pre: 'ar1', cost: { gmp: 30000, common: 450, minor: 80 }, hours: 4, desc: 'Integrated suppressor. Shots barely draw attention.' },
  { id: 'smg', cat: 'Weapons', name: 'Suppressed SMG', req: { rnd: 10, combat: 5 }, cost: { gmp: 26000, common: 380, minor: 60 }, hours: 4, desc: 'High rate of fire, short range, near-silent.' },
  { id: 'tranq_rifle', cat: 'Weapons', name: 'Tranq Rifle', req: { rnd: 12, medical: 3 }, pre: 'tranq_pistol', cost: { gmp: 40000, common: 500, minor: 120, bio: 120 }, hours: 6, desc: 'Non-lethal rifle with double the pistol\'s reach.' },
  { id: 'dmr', cat: 'Weapons', name: 'Marksman Rifle', req: { rnd: 18, combat: 10 }, cost: { gmp: 52000, common: 600, minor: 160 }, hours: 6, desc: 'Long-range lethal precision.' },
  { id: 'lmg', cat: 'Weapons', name: 'Light Machine Gun', req: { rnd: 22, combat: 14 }, cost: { gmp: 60000, common: 900, minor: 180 }, hours: 7, desc: 'Suppressive fire: targets under fire lose accuracy.' },
  { id: 'ar3', cat: 'Weapons', name: 'Battle Rifle Mk3 (SD)', req: { rnd: 30, combat: 20 }, pre: 'ar2', cost: { gmp: 95000, common: 1200, minor: 300, precious: 40 }, hours: 9, desc: 'Heavy-hitting suppressed battle rifle.' },
  { id: 'tranq_sniper', cat: 'Weapons', name: 'Tranq Sniper', req: { rnd: 38, medical: 15 }, pre: 'tranq_rifle', cost: { gmp: 130000, common: 1300, minor: 400, bio: 400, precious: 60 }, hours: 12, desc: 'One dart, one sleeper — from 125m.' },
  { id: 'amr', cat: 'Weapons', name: 'Anti-Materiel Rifle', req: { rnd: 48, combat: 30 }, pre: 'dmr', cost: { gmp: 180000, common: 2000, minor: 600, precious: 120 }, hours: 14, desc: 'Destroys cameras and UAVs and anything else. Extremely loud.' },
  // gear
  { id: 'armor1', cat: 'Gear', name: 'Body Armor Mk1', req: { rnd: 8, basedev: 4 }, cost: { gmp: 30000, common: 700, minor: 90 }, hours: 4, desc: '-20% damage taken by all operatives.' },
  { id: 'trauma', cat: 'Gear', name: 'Field Trauma Kit', req: { rnd: 9, medical: 4 }, cost: { gmp: 24000, bio: 260 }, hours: 3, desc: 'Downed operatives bleed out slower, revives 40% faster.' },
  { id: 'fulton2', cat: 'Gear', name: 'Fulton Recovery Mk2', req: { rnd: 14, support: 9 }, pre: 'fulton1', cost: { gmp: 55000, common: 600, minor: 200, bio: 100 }, hours: 6, desc: '85% success, 3.5s. Can extract downed squadmates.' },
  { id: 'nvg', cat: 'Gear', name: 'Night Vision', req: { rnd: 17, intel: 8 }, cost: { gmp: 48000, minor: 260, precious: 40 }, hours: 5, desc: 'Removes night-time vision penalties for your squads.' },
  { id: 'armor2', cat: 'Gear', name: 'Body Armor Mk2', req: { rnd: 32, basedev: 18 }, pre: 'armor1', cost: { gmp: 110000, common: 1500, minor: 400, precious: 60 }, hours: 10, desc: '-38% damage taken.' },
  { id: 'camo', cat: 'Gear', name: 'Adaptive Camo', req: { rnd: 36, intel: 22 }, cost: { gmp: 140000, minor: 500, precious: 140, bio: 300 }, hours: 12, desc: 'Enemies detect operatives 30% slower.' },
  { id: 'fulton3', cat: 'Gear', name: 'Fulton Recovery Mk3', req: { rnd: 45, support: 32 }, pre: 'fulton2', cost: { gmp: 200000, common: 1600, minor: 600, precious: 200 }, hours: 16, desc: '100% success, 2s. Works on anything that isn\'t nailed down.' },
  // support
  { id: 'supply', cat: 'Support', name: 'Supply Drop', req: { support: 4 }, cost: { gmp: 15000, common: 200 }, hours: 2, desc: 'Battle ability: heals squad members near the drop point.' },
  { id: 'smoke', cat: 'Support', name: 'Smoke Barrage', req: { support: 7, rnd: 5 }, cost: { gmp: 22000, common: 300, bio: 80 }, hours: 3, desc: 'Battle ability: thick smoke blocks all line of sight for 30s.' },
  { id: 'sleepgas', cat: 'Support', name: 'Sleeping Gas Barrage', req: { support: 20, rnd: 18, medical: 8 }, pre: 'smoke', cost: { gmp: 70000, bio: 500, minor: 150 }, hours: 8, desc: 'Battle ability: knocks out everyone in the cloud. Everyone.' },
  { id: 'strike', cat: 'Support', name: 'Precision Strike', req: { support: 30, combat: 22 }, cost: { gmp: 120000, common: 1500, minor: 400, fuel: 300 }, hours: 10, desc: 'Battle ability: artillery strike after a short delay. Very loud.' },
  // defense
  { id: 'cam1', cat: 'Defense', name: 'Security Cameras', req: { rnd: 8, intel: 5 }, cost: { gmp: 35000, minor: 160, precious: 20 }, hours: 4, desc: 'FOB defense: cameras watch platforms and raise the alarm.' },
  { id: 'mines1', cat: 'Defense', name: 'Stun Mines', req: { rnd: 12, combat: 8 }, cost: { gmp: 40000, common: 600, bio: 150 }, hours: 5, desc: 'FOB defense: non-lethal mines on bridges and approaches.' },
  { id: 'secgear1', cat: 'Defense', name: 'Security Gear Mk1', req: { rnd: 15, combat: 12 }, cost: { gmp: 50000, common: 800, minor: 150 }, hours: 6, desc: 'FOB security uses suppressed rifles and light armor.' },
  { id: 'uav1', cat: 'Defense', name: 'Security UAV', req: { rnd: 20, support: 14 }, cost: { gmp: 75000, minor: 350, precious: 60 }, hours: 8, desc: 'FOB defense: patrol drones that dart intruders.' },
  { id: 'cam2', cat: 'Defense', name: 'Camera Network Mk2', req: { rnd: 30, intel: 20 }, pre: 'cam1', cost: { gmp: 90000, minor: 400, precious: 90 }, hours: 9, desc: 'Double camera coverage, wider view.' },
  { id: 'mines2', cat: 'Defense', name: 'Mine Field Mk2', req: { rnd: 34, combat: 24 }, pre: 'mines1', cost: { gmp: 100000, common: 1400, bio: 300 }, hours: 9, desc: 'Double mine density, harder to spot.' },
  { id: 'secgear2', cat: 'Defense', name: 'Security Gear Mk2', req: { rnd: 40, combat: 32 }, pre: 'secgear1', cost: { gmp: 160000, common: 1800, minor: 500, precious: 120 }, hours: 12, desc: 'Elite security loadouts and heavy armor.' },
  { id: 'uav2', cat: 'Defense', name: 'Security UAV Mk2', req: { rnd: 44, support: 30 }, pre: 'uav1', cost: { gmp: 170000, minor: 700, precious: 180 }, hours: 13, desc: 'More drones, tougher frames.' },
  // intel
  { id: 'sat', cat: 'Intel', name: 'Satellite Uplink', req: { intel: 8, rnd: 6 }, cost: { gmp: 45000, minor: 200, precious: 50 }, hours: 5, desc: 'Pre-marks a share of enemies at battle start (scales with Intel level).' },
  { id: 'interrog', cat: 'Intel', name: 'Interrogation Program', req: { intel: 10 }, cost: { gmp: 30000, bio: 150 }, hours: 4, desc: 'Brig prisoners turn twice as fast.' },
  { id: 'intercept', cat: 'Intel', name: 'Signal Intercept', req: { intel: 18, rnd: 14 }, cost: { gmp: 80000, minor: 300, precious: 80 }, hours: 8, desc: '+30 min warning before rival FOB incursions.' },
  { id: 'satnet', cat: 'Intel', name: 'Satellite Network', req: { intel: 35, rnd: 30 }, pre: 'sat', cost: { gmp: 160000, minor: 600, precious: 200 }, hours: 14, desc: 'Full intel on all contracts. Scouting rival FOBs is instant.' },
  // base
  { id: 'messhall', cat: 'Base', name: 'Mess Hall', req: { basedev: 6 }, cost: { gmp: 40000, common: 800, bio: 200 }, hours: 6, desc: '+10 base morale.' },
  { id: 'refinery', cat: 'Base', name: 'Automated Refinery', req: { basedev: 12, rnd: 8 }, cost: { gmp: 70000, common: 1500, minor: 300 }, hours: 8, desc: '+50% material processing.' },
  { id: 'medbay', cat: 'Base', name: 'Medical Bay', req: { medical: 10, basedev: 8 }, cost: { gmp: 60000, common: 900, bio: 400 }, hours: 8, desc: 'Injured and sick staff recover twice as fast.' },
  { id: 'training', cat: 'Base', name: 'Training Grounds', req: { combat: 14, basedev: 10 }, cost: { gmp: 65000, common: 1200, minor: 200 }, hours: 8, desc: 'Combat staff steadily improve their combat stat.' },
  { id: 'hydro', cat: 'Base', name: 'Hydroponics Bay', req: { basedev: 20, medical: 6 }, cost: { gmp: 60000, common: 900, bio: 300 }, hours: 7, desc: '+3 bio & +1 morale per Base Dev level per day.' },
  { id: 'autofab', cat: 'Base', name: 'Automated Fabrication', req: { basedev: 30, rnd: 25 }, cost: { gmp: 150000, common: 2500, minor: 800, precious: 100 }, hours: 12, desc: 'R&D and construction costs -15%.' },
];
const RD = Object.fromEntries(RD_ITEMS.map(i => [i.id, i]));

const SUPPORT_ABILITIES = {
  supply: { name: 'Supply Drop', item: 'supply', cost: 3000, cd: 40, radius: 14, key: '1' },
  smoke: { name: 'Smoke', item: 'smoke', cost: 5000, cd: 50, radius: 13, key: '2' },
  sleepgas: { name: 'Sleep Gas', item: 'sleepgas', cost: 12000, cd: 80, radius: 14, key: '3' },
  strike: { name: 'Strike', item: 'strike', cost: 25000, cd: 110, radius: 16, key: '4' },
};

// ---------- world ----------
// [name, country, lat, lng, risk 0..1]
const CITIES = [
  ['Lagos', 'Nigeria', 6.5244, 3.3792, .6], ['Kinshasa', 'DR Congo', -4.4419, 15.2663, .8], ['Luanda', 'Angola', -8.839, 13.2894, .5],
  ['Nairobi', 'Kenya', -1.2921, 36.8219, .5], ['Mogadishu', 'Somalia', 2.0469, 45.3182, .95], ['Khartoum', 'Sudan', 15.5007, 32.5599, .9],
  ['Addis Ababa', 'Ethiopia', 9.03, 38.74, .5], ['Cairo', 'Egypt', 30.0444, 31.2357, .4], ['Tripoli', 'Libya', 32.8872, 13.1913, .85],
  ['Tunis', 'Tunisia', 36.8065, 10.1815, .3], ['Algiers', 'Algeria', 36.7538, 3.0588, .35], ['Casablanca', 'Morocco', 33.5731, -7.5898, .25],
  ['Dakar', 'Senegal', 14.7167, -17.4677, .3], ['Bamako', 'Mali', 12.6392, -8.0029, .8], ['Niamey', 'Niger', 13.5116, 2.1254, .75],
  ["N'Djamena", 'Chad', 12.1348, 15.0557, .75], ['Abuja', 'Nigeria', 9.0765, 7.3986, .5], ['Accra', 'Ghana', 5.6037, -.187, .25],
  ['Abidjan', 'Ivory Coast', 5.36, -4.0083, .4], ['Freetown', 'Sierra Leone', 8.4657, -13.2317, .5], ['Monrovia', 'Liberia', 6.3156, -10.8074, .5],
  ['Kampala', 'Uganda', .3476, 32.5825, .5], ['Juba', 'South Sudan', 4.8594, 31.5713, .9], ['Kigali', 'Rwanda', -1.9441, 30.0619, .35],
  ['Goma', 'DR Congo', -1.6585, 29.2205, .9], ['Dar es Salaam', 'Tanzania', -6.7924, 39.2083, .3], ['Maputo', 'Mozambique', -25.9692, 32.5732, .4],
  ['Johannesburg', 'South Africa', -26.2041, 28.0473, .4], ['Cape Town', 'South Africa', -33.9249, 18.4241, .3], ['Harare', 'Zimbabwe', -17.8252, 31.0335, .45],
  ['Lusaka', 'Zambia', -15.3875, 28.3228, .3], ['Antananarivo', 'Madagascar', -18.8792, 47.5079, .35], ['Djibouti', 'Djibouti', 11.5721, 43.1456, .5],
  ['Bangui', 'C. African Rep.', 4.3947, 18.5582, .85], ['Port Harcourt', 'Nigeria', 4.8156, 7.0498, .7],
  ['Baghdad', 'Iraq', 33.3152, 44.3661, .85], ['Mosul', 'Iraq', 36.335, 43.1189, .85], ['Damascus', 'Syria', 33.5138, 36.2765, .85],
  ['Aleppo', 'Syria', 36.2021, 37.1343, .9], ['Beirut', 'Lebanon', 33.8938, 35.5018, .7], ['Amman', 'Jordan', 31.9454, 35.9284, .35],
  ['Riyadh', 'Saudi Arabia', 24.7136, 46.6753, .35], ["Sana'a", 'Yemen', 15.3694, 44.191, .95], ['Aden', 'Yemen', 12.7855, 45.0187, .9],
  ['Tehran', 'Iran', 35.6892, 51.389, .5], ['Kabul', 'Afghanistan', 34.5553, 69.2075, .9], ['Kandahar', 'Afghanistan', 31.6289, 65.7372, .9],
  ['Dubai', 'UAE', 25.2048, 55.2708, .2], ['Doha', 'Qatar', 25.2854, 51.531, .2], ['Muscat', 'Oman', 23.588, 58.3829, .2],
  ['Istanbul', 'Turkey', 41.0082, 28.9784, .35], ['Erbil', 'Iraq', 36.1911, 44.0092, .6],
  ['London', 'UK', 51.5074, -.1278, .15], ['Paris', 'France', 48.8566, 2.3522, .15], ['Berlin', 'Germany', 52.52, 13.405, .15],
  ['Moscow', 'Russia', 55.7558, 37.6173, .4], ['Kyiv', 'Ukraine', 50.4501, 30.5234, .75], ['Kharkiv', 'Ukraine', 49.9935, 36.2304, .85],
  ['Odesa', 'Ukraine', 46.4825, 30.7233, .7], ['Warsaw', 'Poland', 52.2297, 21.0122, .2], ['Belgrade', 'Serbia', 44.7866, 20.4489, .3],
  ['Sarajevo', 'Bosnia', 43.8563, 18.4131, .35], ['Athens', 'Greece', 37.9838, 23.7275, .2], ['Rome', 'Italy', 41.9028, 12.4964, .15],
  ['Madrid', 'Spain', 40.4168, -3.7038, .15], ['Lisbon', 'Portugal', 38.7223, -9.1393, .1], ['Marseille', 'France', 43.2965, 5.3698, .25],
  ['Naples', 'Italy', 40.8518, 14.2681, .3], ['Tbilisi', 'Georgia', 41.7151, 44.8271, .4], ['Grozny', 'Russia', 43.3178, 45.6982, .7],
  ['Minsk', 'Belarus', 53.9006, 27.559, .4], ['Murmansk', 'Russia', 68.9585, 33.0827, .3], ['Oslo', 'Norway', 59.9139, 10.7522, .1],
  ['Islamabad', 'Pakistan', 33.6844, 73.0479, .5], ['Karachi', 'Pakistan', 24.8607, 67.0011, .6], ['Peshawar', 'Pakistan', 34.0151, 71.5249, .75],
  ['Delhi', 'India', 28.6139, 77.209, .3], ['Mumbai', 'India', 19.076, 72.8777, .3], ['Dhaka', 'Bangladesh', 23.8103, 90.4125, .4],
  ['Yangon', 'Myanmar', 16.8409, 96.1735, .7], ['Mandalay', 'Myanmar', 21.9588, 96.0891, .75], ['Bangkok', 'Thailand', 13.7563, 100.5018, .3],
  ['Phnom Penh', 'Cambodia', 11.5564, 104.9282, .35], ['Hanoi', 'Vietnam', 21.0278, 105.8342, .2], ['Ho Chi Minh City', 'Vietnam', 10.8231, 106.6297, .25],
  ['Manila', 'Philippines', 14.5995, 120.9842, .45], ['Marawi', 'Philippines', 8.0034, 124.2839, .8], ['Jakarta', 'Indonesia', -6.2088, 106.8456, .35],
  ['Kuala Lumpur', 'Malaysia', 3.139, 101.6869, .2], ['Singapore', 'Singapore', 1.3521, 103.8198, .1], ['Hong Kong', 'China', 22.3193, 114.1694, .25],
  ['Shanghai', 'China', 31.2304, 121.4737, .2], ['Beijing', 'China', 39.9042, 116.4074, .2], ['Seoul', 'South Korea', 37.5665, 126.978, .2],
  ['Pyongyang', 'North Korea', 39.0392, 125.7625, .6], ['Tokyo', 'Japan', 35.6762, 139.6503, .1], ['Vladivostok', 'Russia', 43.1155, 131.8855, .3],
  ['Ulaanbaatar', 'Mongolia', 47.8864, 106.9057, .2], ['Almaty', 'Kazakhstan', 43.222, 76.8512, .3], ['Tashkent', 'Uzbekistan', 41.2995, 69.2401, .3],
  ['Dushanbe', 'Tajikistan', 38.5598, 68.787, .45], ['Kathmandu', 'Nepal', 27.7172, 85.324, .25], ['Colombo', 'Sri Lanka', 6.9271, 79.8612, .3],
  ['Taipei', 'Taiwan', 25.033, 121.5654, .2],
  ['New York', 'USA', 40.7128, -74.006, .1], ['Washington', 'USA', 38.9072, -77.0369, .1], ['Los Angeles', 'USA', 34.0522, -118.2437, .15],
  ['Chicago', 'USA', 41.8781, -87.6298, .2], ['Miami', 'USA', 25.7617, -80.1918, .25], ['Houston', 'USA', 29.7604, -95.3698, .15],
  ['Mexico City', 'Mexico', 19.4326, -99.1332, .45], ['Tijuana', 'Mexico', 32.5149, -117.0382, .6], ['Ciudad Juárez', 'Mexico', 31.6904, -106.4245, .7],
  ['Culiacán', 'Mexico', 24.8091, -107.394, .75], ['Guatemala City', 'Guatemala', 14.6349, -90.5069, .5], ['San Salvador', 'El Salvador', 13.6929, -89.2182, .5],
  ['Tegucigalpa', 'Honduras', 14.0723, -87.1921, .55], ['Managua', 'Nicaragua', 12.115, -86.2362, .45], ['Panama City', 'Panama', 8.9824, -79.5199, .3],
  ['Havana', 'Cuba', 23.1136, -82.3666, .3], ['Port-au-Prince', 'Haiti', 18.5944, -72.3074, .85], ['Kingston', 'Jamaica', 17.9714, -76.7936, .45],
  ['Bogotá', 'Colombia', 4.711, -74.0721, .5], ['Medellín', 'Colombia', 6.2442, -75.5812, .55], ['Caracas', 'Venezuela', 10.4806, -66.9036, .7],
  ['Quito', 'Ecuador', -.1807, -78.4678, .4], ['Lima', 'Peru', -12.0464, -77.0428, .35], ['La Paz', 'Bolivia', -16.4897, -68.1193, .35],
  ['Santiago', 'Chile', -33.4489, -70.6693, .2], ['Buenos Aires', 'Argentina', -34.6037, -58.3816, .25], ['Montevideo', 'Uruguay', -34.9011, -56.1645, .15],
  ['São Paulo', 'Brazil', -23.5505, -46.6333, .4], ['Rio de Janeiro', 'Brazil', -22.9068, -43.1729, .55], ['Manaus', 'Brazil', -3.119, -60.0217, .4],
  ['Asunción', 'Paraguay', -25.2637, -57.5759, .3], ['Toronto', 'Canada', 43.6532, -79.3832, .1], ['Vancouver', 'Canada', 49.2827, -123.1207, .1],
  ['Sydney', 'Australia', -33.8688, 151.2093, .1], ['Perth', 'Australia', -31.9505, 115.8605, .1], ['Port Moresby', 'Papua New Guinea', -9.4438, 147.1803, .5],
  ['Darwin', 'Australia', -12.4634, 130.8456, .1], ['Suva', 'Fiji', -18.1248, 178.4501, .2], ['Honiara', 'Solomon Islands', -9.4456, 159.9729, .35],
  ['Dili', 'Timor-Leste', -8.5569, 125.5603, .3],
];

// FOB development zones (open ocean)
const ZONES = [
  ['seychelles', 'Seychelles Bank', -5.2, 57.3, { fuel: 1, bio: 1.2, common: 1, minor: 1, precious: 1 }],
  ['arabian', 'Arabian Sea', 16.0, 63.0, { fuel: 1.6, bio: .8, common: 1, minor: .9, precious: .8 }],
  ['bengal', 'Bay of Bengal', 14.0, 88.0, { fuel: 1, bio: 1.4, common: 1, minor: .9, precious: .8 }],
  ['andaman', 'Andaman Sea', 10.0, 95.5, { fuel: 1.1, bio: 1.3, common: .9, minor: 1, precious: .9 }],
  ['scs', 'South China Sea', 13.0, 114.0, { fuel: 1.5, bio: 1, common: 1, minor: 1, precious: .9 }],
  ['philippine', 'Philippine Sea', 18.0, 130.0, { fuel: 1, bio: 1, common: 1.1, minor: 1.2, precious: 1 }],
  ['coral', 'Coral Sea', -16.0, 154.0, { fuel: .8, bio: 1.5, common: .9, minor: 1, precious: 1.1 }],
  ['tasman', 'Tasman Sea', -38.0, 160.0, { fuel: .9, bio: 1.2, common: 1, minor: 1, precious: 1.1 }],
  ['java', 'Java Sea', -5.0, 111.0, { fuel: 1.4, bio: 1.1, common: 1, minor: 1, precious: .8 }],
  ['timor', 'Timor Sea', -11.5, 127.0, { fuel: 1.5, bio: .9, common: 1, minor: 1.1, precious: .9 }],
  ['aden', 'Gulf of Aden', 12.5, 48.0, { fuel: 1.3, bio: .7, common: 1.1, minor: 1, precious: 1 }],
  ['redsea', 'Red Sea', 20.0, 38.8, { fuel: 1.3, bio: .8, common: 1.1, minor: 1.1, precious: .9 }],
  ['gulf', 'Persian Gulf', 27.0, 51.5, { fuel: 2, bio: .6, common: .9, minor: .9, precious: .8 }],
  ['mozambique', 'Mozambique Channel', -18.0, 41.0, { fuel: 1.1, bio: 1.1, common: 1, minor: 1, precious: 1.2 }],
  ['guinea', 'Gulf of Guinea', 2.0, 4.0, { fuel: 1.8, bio: 1, common: .9, minor: .9, precious: 1 }],
  ['capeverde', 'Cape Verde Basin', 15.0, -26.0, { fuel: .9, bio: 1.2, common: 1, minor: 1, precious: 1 }],
  ['canary', 'Canary Basin', 30.0, -20.0, { fuel: .9, bio: 1.1, common: 1.1, minor: 1, precious: 1 }],
  ['ionian', 'Ionian Sea', 36.0, 19.0, { fuel: 1, bio: 1, common: 1, minor: 1.1, precious: 1.1 }],
  ['tyrrhenian', 'Tyrrhenian Sea', 40.0, 12.0, { fuel: .9, bio: 1, common: 1.1, minor: 1.1, precious: 1.1 }],
  ['northsea', 'North Sea', 56.0, 3.0, { fuel: 1.7, bio: .8, common: 1, minor: 1, precious: .9 }],
  ['norwegian', 'Norwegian Sea', 67.0, 4.0, { fuel: 1.4, bio: .9, common: 1, minor: 1.1, precious: 1 }],
  ['barents', 'Barents Sea', 73.0, 38.0, { fuel: 1.5, bio: .7, common: 1.1, minor: 1.2, precious: 1 }],
  ['bering', 'Bering Sea', 58.0, -178.0, { fuel: 1, bio: 1.3, common: 1, minor: 1.2, precious: 1 }],
  ['alaska', 'Gulf of Alaska', 56.0, -145.0, { fuel: 1.2, bio: 1.2, common: 1, minor: 1, precious: 1 }],
  ['nepacific', 'NE Pacific Basin', 35.0, -130.0, { fuel: .9, bio: 1, common: 1.1, minor: 1.1, precious: 1.1 }],
  ['hawaii', 'Hawaiian Ridge', 24.0, -165.0, { fuel: .8, bio: 1.2, common: 1, minor: 1.2, precious: 1.2 }],
  ['mexico', 'Gulf of Mexico', 25.0, -90.0, { fuel: 1.9, bio: .9, common: 1, minor: .9, precious: .8 }],
  ['caribbean', 'Caribbean Sea', 15.0, -75.0, { fuel: 1.2, bio: 1.2, common: 1, minor: 1, precious: 1 }],
  ['sargasso', 'Sargasso Sea', 28.0, -60.0, { fuel: .9, bio: 1.4, common: 1, minor: 1, precious: 1 }],
  ['labrador', 'Labrador Sea', 57.0, -53.0, { fuel: 1.1, bio: 1, common: 1.1, minor: 1.1, precious: 1 }],
  ['galapagos', 'Galápagos Rise', -1.0, -95.0, { fuel: .8, bio: 1.5, common: 1, minor: 1, precious: 1.1 }],
  ['peru', 'Peru Basin', -15.0, -85.0, { fuel: .9, bio: 1.1, common: 1.1, minor: 1.2, precious: 1.1 }],
  ['argentine', 'Argentine Basin', -40.0, -50.0, { fuel: 1.1, bio: 1, common: 1, minor: 1.1, precious: 1 }],
  ['satlantic', 'Mid-Atlantic Ridge', -25.0, -15.0, { fuel: .8, bio: 1, common: 1.2, minor: 1.2, precious: 1.3 }],
  ['southern', 'Southern Ocean', -50.0, 30.0, { fuel: .8, bio: .9, common: 1.2, minor: 1.3, precious: 1.3 }],
  ['kerguelen', 'Kerguelen Plateau', -45.0, 75.0, { fuel: .9, bio: 1, common: 1.1, minor: 1.2, precious: 1.2 }],
  ['chagos', 'Chagos Trench', -10.0, 75.0, { fuel: 1, bio: 1.1, common: 1, minor: 1.1, precious: 1.1 }],
  ['japan', 'Sea of Japan', 40.0, 135.0, { fuel: 1, bio: 1.1, common: 1.1, minor: 1.1, precious: 1 }],
  ['ecs', 'East China Sea', 29.0, 125.0, { fuel: 1.3, bio: 1, common: 1, minor: 1, precious: .9 }],
  ['okhotsk', 'Sea of Okhotsk', 54.0, 148.0, { fuel: 1.3, bio: 1.1, common: 1, minor: 1.1, precious: .9 }],
  ['blacksea', 'Black Sea', 43.0, 34.0, { fuel: 1.3, bio: .9, common: 1, minor: 1, precious: .9 }],
  ['caspian', 'Caspian Sea', 42.0, 50.5, { fuel: 2, bio: .7, common: .9, minor: .9, precious: .8 }],
  ['baltic', 'Baltic Sea', 56.0, 19.0, { fuel: 1, bio: 1, common: 1.1, minor: 1, precious: .9 }],
  ['midpacific', 'Line Islands Deep', 5.0, -150.0, { fuel: .8, bio: 1.2, common: 1.1, minor: 1.2, precious: 1.3 }],
  ['polynesia', 'Polynesian Basin', -18.0, -140.0, { fuel: .8, bio: 1.3, common: 1, minor: 1.2, precious: 1.3 }],
].map(([id, name, lat, lng, bias]) => ({ id, name, lat, lng, bias }));
const ZONE = Object.fromEntries(ZONES.map(z => [z.id, z]));

// ---------- names ----------
const NAME_POOLS = {
  anglo: { f: ['James', 'John', 'Robert', 'Michael', 'David', 'William', 'Richard', 'Thomas', 'Daniel', 'Matthew', 'Sarah', 'Emily', 'Jessica', 'Laura', 'Hannah', 'Megan', 'Kate', 'Grace', 'Ethan', 'Liam', 'Owen', 'Connor', 'Riley', 'Morgan'], l: ['Smith', 'Johnson', 'Walker', 'Hughes', 'Turner', 'Price', 'Reed', 'Hayes', 'Barnes', 'Fletcher', 'Graves', 'Holt', 'Mercer', 'Doyle', 'Kane', 'Brennan', 'Shaw', 'Carver', 'Lynch', 'Archer'] },
  hispanic: { f: ['Carlos', 'Miguel', 'Javier', 'Luis', 'Diego', 'Mateo', 'Alejandro', 'Sofia', 'Valentina', 'Camila', 'Isabel', 'Lucia', 'Rafael', 'Andres', 'Elena', 'Marisol', 'Hector', 'Raul'], l: ['Garcia', 'Martinez', 'Rodriguez', 'Lopez', 'Hernandez', 'Morales', 'Ortega', 'Castillo', 'Vargas', 'Reyes', 'Navarro', 'Delgado', 'Fuentes', 'Salazar', 'Cruz', 'Ramos'] },
  slavic: { f: ['Ivan', 'Dmitri', 'Sergei', 'Alexei', 'Nikolai', 'Yuri', 'Mikhail', 'Oleg', 'Viktor', 'Pavel', 'Anya', 'Katya', 'Natalia', 'Irina', 'Olga', 'Svetlana', 'Bogdan', 'Taras'], l: ['Volkov', 'Petrov', 'Sokolov', 'Ivanov', 'Kuznetsov', 'Morozov', 'Orlov', 'Kovalenko', 'Shevchenko', 'Novak', 'Popov', 'Lebedev', 'Zaitsev', 'Gromov', 'Belov', 'Karpov'] },
  arabic: { f: ['Ahmed', 'Omar', 'Yusuf', 'Khalid', 'Tariq', 'Hassan', 'Karim', 'Samir', 'Amina', 'Layla', 'Fatima', 'Nour', 'Rania', 'Zaid', 'Faris', 'Malik'], l: ['Haddad', 'Nasser', 'Khalil', 'Mansour', 'Saleh', 'Farouk', 'Aziz', 'Rahman', 'Hamdan', 'Qasim', 'Darwish', 'Bakr', 'Sabbagh', 'Jaber'] },
  african: { f: ['Kwame', 'Kofi', 'Chidi', 'Emeka', 'Tunde', 'Amara', 'Zola', 'Thabo', 'Sipho', 'Nia', 'Ayo', 'Femi', 'Jabari', 'Imani', 'Kato', 'Baraka', 'Ngozi', 'Obi'], l: ['Okafor', 'Mensah', 'Diallo', 'Nkosi', 'Abebe', 'Kamara', 'Toure', 'Mwangi', 'Okoro', 'Banda', 'Achebe', 'Odhiambo', 'Sesay', 'Traore', 'Dlamini', 'Adeyemi'] },
  asian: { f: ['Hiro', 'Kenji', 'Takeshi', 'Yuki', 'Wei', 'Jun', 'Min', 'Li', 'Hana', 'Mei', 'Sora', 'Arjun', 'Ravi', 'Priya', 'Anh', 'Bao', 'Tuan', 'Sung', 'Jae', 'Dae'], l: ['Tanaka', 'Sato', 'Nakamura', 'Chen', 'Wang', 'Liu', 'Park', 'Kim', 'Lee', 'Nguyen', 'Tran', 'Singh', 'Patel', 'Sharma', 'Watanabe', 'Zhao', 'Kang', 'Pham'] },
  euro: { f: ['Lukas', 'Jonas', 'Felix', 'Pierre', 'Luc', 'Hugo', 'Marco', 'Luca', 'Giulia', 'Chiara', 'Anna', 'Ingrid', 'Lars', 'Sven', 'Erik', 'Mathieu', 'Klaus', 'Elsa'], l: ['Muller', 'Schmidt', 'Dubois', 'Moreau', 'Rossi', 'Bianchi', 'Ferrari', 'Larsen', 'Johansson', 'Nilsson', 'Weber', 'Fischer', 'Lefevre', 'Conti', 'Berg', 'Kowalski'] },
};
const NATIONS = [['USA', 'anglo'], ['UK', 'anglo'], ['Australia', 'anglo'], ['Canada', 'anglo'], ['Ireland', 'anglo'], ['South Africa', 'african'], ['Nigeria', 'african'], ['Kenya', 'african'], ['Ghana', 'african'], ['DR Congo', 'african'], ['Ethiopia', 'african'], ['Mexico', 'hispanic'], ['Colombia', 'hispanic'], ['Argentina', 'hispanic'], ['Spain', 'hispanic'], ['Peru', 'hispanic'], ['Cuba', 'hispanic'], ['Russia', 'slavic'], ['Ukraine', 'slavic'], ['Poland', 'slavic'], ['Serbia', 'slavic'], ['Georgia', 'slavic'], ['Egypt', 'arabic'], ['Iraq', 'arabic'], ['Syria', 'arabic'], ['Lebanon', 'arabic'], ['Morocco', 'arabic'], ['Yemen', 'arabic'], ['Japan', 'asian'], ['China', 'asian'], ['South Korea', 'asian'], ['Vietnam', 'asian'], ['India', 'asian'], ['Philippines', 'asian'], ['Germany', 'euro'], ['France', 'euro'], ['Italy', 'euro'], ['Sweden', 'euro'], ['Norway', 'euro'], ['Netherlands', 'euro']];
const CALL_ADJ = ['Silent', 'Lazy', 'Crazy', 'Brave', 'Swift', 'Iron', 'Red', 'Black', 'Burning', 'Frozen', 'Hungry', 'Lucky', 'Grim', 'Quiet', 'Rabid', 'Sly', 'Gentle', 'Rusty', 'Savage', 'Sleepy', 'Golden', 'Stone', 'Thunder', 'Wild', 'Shadow', 'Steel', 'Wandering', 'Howling', 'Bitter', 'Clever', 'Mad', 'Old', 'Young', 'Pale', 'Dusty', 'Smoky', 'Velvet', 'Broken', 'Hollow', 'Proud', 'Crimson', 'Patient', 'Nervous', 'Jolly', 'Restless'];
const CALL_NOUN = ['Wolf', 'Cobra', 'Moose', 'Hornet', 'Gazelle', 'Falcon', 'Mamba', 'Jackal', 'Badger', 'Raven', 'Shark', 'Bear', 'Owl', 'Lynx', 'Viper', 'Rhino', 'Crane', 'Coyote', 'Mantis', 'Tortoise', 'Hyena', 'Bison', 'Ferret', 'Panther', 'Hawk', 'Crow', 'Gecko', 'Ibex', 'Marlin', 'Ox', 'Puma', 'Stoat', 'Tapir', 'Weasel', 'Yak', 'Boar', 'Condor', 'Dingo', 'Eel', 'Mongoose', 'Scorpion', 'Heron', 'Walrus'];

const PF_ADJ = ['Black', 'Crimson', 'Iron', 'Sable', 'Ghost', 'Steel', 'Desert', 'Red', 'Silver', 'Night', 'Storm', 'Grey', 'Jade', 'Obsidian', 'Scarlet', 'Azure', 'Bone', 'Ashen', 'Cobalt', 'Rogue', 'Blood', 'Gold', 'Frost', 'Burnt'];
const PF_NOUN = ['Jackals', 'Lotus', 'Hounds', 'Vipers', 'Ravens', 'Wolves', 'Talons', 'Mambas', 'Hydras', 'Coyotes', 'Lynx', 'Mantis', 'Orcas', 'Rhinos', 'Falcons', 'Scorpions', 'Sharks', 'Krakens', 'Hornets', 'Stags', 'Tide', 'Anvil', 'Spear', 'Banner'];
const PF_SUFFIX = ['PMC', 'Battalion', 'Group', 'Company', 'Brigade', 'Legion', 'Syndicate', 'Corps', 'Private Forces', 'Outfit', 'Security', 'Consortium'];

const CONTRACT_TYPES = {
  eliminate: { name: 'Elimination', w: 3, desc: 'Neutralize the target. Fulton extraction pays a 50% bonus.' },
  extract: { name: 'Extraction', w: 3, desc: 'Locate the hostage and extract them by Fulton.' },
  sabotage: { name: 'Sabotage', w: 2, desc: 'Plant charges on the marked assets.' },
  intel: { name: 'Intel Recovery', w: 2, desc: 'Reach the site and download the intel.' },
  hold: { name: 'Defense', w: 1.5, desc: 'Hold the position until relief arrives. Expect waves.' },
};
const TARGET_ROLES = ['field commander', 'arms dealer', 'warlord', 'smuggler', 'colonel', 'cartel lieutenant', 'militia leader', 'defector', 'war profiteer', 'intelligence officer'];
const HOSTAGE_ROLES = ['journalist', 'engineer', 'aid worker', 'scientist', 'diplomat', 'pilot', 'informant', 'surgeon', 'geologist', 'interpreter'];
const SABOTAGE_TARGETS = ['fuel depot', 'arms cache', 'comms relay', 'radar array', 'drug lab', 'supply trucks', 'generator plant'];
const INTEL_TARGETS = ['encrypted ledgers', 'troop movement plans', 'a defector\'s hard drive', 'weapons manifests', 'a blackmail dossier', 'satellite codes'];
const CLIENTS = ['Ministry of Defense liaison', 'UN field office', 'Shipping consortium', 'Mining conglomerate', 'Rebel coalition', 'An unnamed intelligence service', 'NGO security desk', 'Oil major', 'Private investor', 'Anonymous broker', 'Exiled government', 'Insurance syndicate'];
const ENEMY_FACTIONS = ['Local militia', 'Insurgent cell', 'Cartel gunmen', 'Rogue army unit', 'Mercenary company', 'Pirate crew', 'Separatist forces', 'Paramilitary police'];
const NATO = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel', 'India', 'Juliet', 'Kilo', 'Lima', 'Mike', 'November', 'Oscar', 'Papa', 'Quebec', 'Romeo', 'Sierra', 'Tango', 'Uniform', 'Victor', 'Whiskey', 'X-ray', 'Yankee', 'Zulu'];

const LEAGUES = [[0, 'Bronze III'], [400, 'Bronze II'], [900, 'Bronze I'], [1600, 'Silver III'], [2500, 'Silver II'], [3600, 'Silver I'], [5000, 'Gold III'], [7000, 'Gold II'], [9500, 'Gold I'], [13000, 'Champion']];

const SPEEDS = [0, 1, 3, 10];       // strategic multipliers
const GAME_MIN_PER_SEC = 2;        // at 1x, one real second = 2 game minutes
