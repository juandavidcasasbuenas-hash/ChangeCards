// Shared catalogue: keep stable IDs so old notes and curated routes retain their meaning.
export const CARDS = [
  { id: 1, category: 'multidisciplinary', label: 'Being multidisciplinary', title: 'Borrow a Brain', provocation: 'How would someone from a completely different field solve this?' },
  { id: 2, category: 'multidisciplinary', label: 'Being multidisciplinary', title: 'The Wrong Expert', provocation: 'Who has absolutely no business solving this — and what might they notice?' },
  { id: 3, category: 'multidisciplinary', label: 'Being multidisciplinary', title: 'Build the Dream Team', provocation: 'If you could put any three kinds of people in the room, who would they be?' },
  { id: 4, category: 'multidisciplinary', label: 'Being multidisciplinary', title: 'Hand Over the Pen', provocation: 'What if the people affected by this idea designed it themselves?' },
  { id: 5, category: 'ingenious', label: 'Being ingenious', title: 'Do the Opposite', provocation: 'What if you deliberately did the exact opposite?' },
  { id: 6, category: 'ingenious', label: 'Being ingenious', title: 'Kill the Obvious', provocation: 'Remove the most obvious part of your solution. What becomes possible?' },
  { id: 7, category: 'ingenious', label: 'Being ingenious', title: 'Make It Ridiculously Small', provocation: 'You have one day, one person and £100. What do you build?' },
  { id: 8, category: 'ingenious', label: 'Being ingenious', title: 'Turn the Flaw into the Feature', provocation: 'What if the biggest weakness of this idea became its defining strength?' },
  { id: 9, category: 'optimistic', label: 'Being optimistic', title: '10× It', provocation: 'What would the ambitious version of this idea look like?' },
  { id: 10, category: 'optimistic', label: 'Being optimistic', title: 'Assume It Works', provocation: 'Imagine this succeeds beyond expectations. What did you do differently?' },
  { id: 11, category: 'optimistic', label: 'Being optimistic', title: 'Make the Headline', provocation: 'Three years from now this makes the news. What happened?' },
  { id: 12, category: 'optimistic', label: 'Being optimistic', title: 'Design for Everyone', provocation: 'What changes if this has to work for 10 million people?' },
  { id: 13, category: 'flexible', label: 'Being flexible', title: 'Your Assumption Is Wrong', provocation: "The thing you're most confident about turns out to be false. Now what?" },
  { id: 14, category: 'flexible', label: 'Being flexible', title: 'Prototype It Tomorrow', provocation: 'What could you make tomorrow that would teach you something?' },
  { id: 15, category: 'flexible', label: 'Being flexible', title: 'The Evidence Changes', provocation: 'New evidence contradicts your current approach. How do you pivot?' },
  { id: 16, category: 'flexible', label: 'Being flexible', title: 'Let the Intruder In', provocation: 'A completely unexpected idea appears. How could it change yours?' },
  { id: 17, category: 'multidisciplinary', label: 'Being multidisciplinary', title: 'Learn from Nature', provocation: 'What living system already handles a problem like this — and what principle could you borrow?', sparkBrief: 'Suggest relevant organisms, ecosystems or natural processes paired with the specific mechanism worth borrowing.' },
  { id: 18, category: 'multidisciplinary', label: 'Being multidisciplinary', title: 'Put It on Trial', provocation: 'Who would prosecute this idea, who would defend it, and what would each expose?', sparkBrief: 'Suggest specific prosecutors, defenders or witnesses and the concrete strength, risk or tension each would expose.' },
  { id: 19, category: 'multidisciplinary', label: 'Being multidisciplinary', title: 'Follow the Whole System', provocation: 'Who is affected upstream or downstream but currently missing from the room?', sparkBrief: 'Name specific upstream or downstream people, organisations, communities or non-human actors missing from the current view.' },
  { id: 20, category: 'multidisciplinary', label: 'Being multidisciplinary', title: 'Translate It Twice', provocation: 'How would an artist describe this problem? An engineer? What appears between the two?', sparkBrief: 'Every spark must answer all three parts in the compact form “Artist: [lens]; engineer: [lens]; between: [specific synthesis]”, with no more than three words after each label.' },
  { id: 21, category: 'multidisciplinary', label: 'Being multidisciplinary', title: 'Invite the Dissenter', provocation: 'Who would fundamentally disagree with this approach — and what might they be right about?', sparkBrief: 'Name plausible dissenters and concise, context-specific objections they may be right about.' },
  { id: 22, category: 'multidisciplinary', label: 'Being multidisciplinary', title: 'Swap the Setting', provocation: 'Where does this same human problem appear in a completely different context?', sparkBrief: 'Suggest surprising but genuinely analogous settings, with enough specificity for the shared human problem to be apparent.' },
  { id: 23, category: 'ingenious', label: 'Being ingenious', title: 'Use Only What Exists', provocation: 'No new people, money, tools or platforms. What could you rearrange?', sparkBrief: 'Point to existing assets, relationships, routines, spaces or materials that could be recombined without adding resources.' },
  { id: 24, category: 'ingenious', label: 'Being ingenious', title: 'Make It Reversible', provocation: 'How could someone try this fully — and undo it without penalty?', sparkBrief: 'Suggest concrete opt-outs, rollback mechanisms, reversible trials or ways to restore the prior state.' },
  { id: 25, category: 'ingenious', label: 'Being ingenious', title: 'Turn the Backstage Front', provocation: 'What hidden process could become the visible experience?', sparkBrief: 'Identify specific hidden labour, decisions or processes that could become visible, participatory or valuable.' },
  { id: 26, category: 'ingenious', label: 'Being ingenious', title: 'Remove the Interface', provocation: 'If there were no app, website, form or meeting, how would this work?', sparkBrief: 'Suggest direct, physical, ambient or person-to-person ways the idea could work without its expected interface.' },
  { id: 27, category: 'ingenious', label: 'Being ingenious', title: 'Make It Self-Destruct', provocation: 'What should disappear once it has done its job?', sparkBrief: 'Name temporary structures, permissions, steps or artefacts that should deliberately expire after creating value.' },
  { id: 28, category: 'ingenious', label: 'Being ingenious', title: 'Change the Currency', provocation: 'If nobody could pay with money, what else could they exchange?', sparkBrief: 'Suggest context-relevant non-monetary exchanges such as time, knowledge, access, care, effort or unused capacity.' },
  { id: 29, category: 'optimistic', label: 'Being optimistic', title: 'Start with Trust', provocation: 'What becomes possible if you design for people to be trusted rather than controlled?', sparkBrief: 'Suggest freedoms, responsibilities or peer mechanisms that become possible when a specific control is removed.' },
  { id: 30, category: 'optimistic', label: 'Being optimistic', title: 'Find the Joy', provocation: 'What could make this unexpectedly pleasurable to take part in?', sparkBrief: 'Suggest small, context-specific social, sensory or emotional moments that create genuine pleasure rather than superficial gamification.' },
  { id: 31, category: 'optimistic', label: 'Being optimistic', title: 'Design the Ripple', provocation: 'Who benefits next when the first person succeeds?', sparkBrief: 'Name concrete second-order beneficiaries and the mechanism through which the first person’s success reaches them.' },
  { id: 32, category: 'optimistic', label: 'Being optimistic', title: 'Make It Spread Itself', provocation: 'Why would one person naturally pass this on to another?', sparkBrief: 'Suggest intrinsic reasons, useful objects, rituals or moments that would make a person naturally share the idea.' },
  { id: 33, category: 'optimistic', label: 'Being optimistic', title: 'Raise the Floor', provocation: 'How could even the least successful version leave people better off?', sparkBrief: 'Suggest concrete minimum benefits, safeguards or reusable assets that survive even when the main ambition falls short.' },
  { id: 34, category: 'optimistic', label: 'Being optimistic', title: 'Leave Something Behind', provocation: 'What skill, relationship or confidence remains after the service is gone?', sparkBrief: 'Name durable capabilities, relationships, confidence, knowledge or infrastructure the idea could intentionally leave behind.' },
  { id: 35, category: 'flexible', label: 'Being flexible', title: 'Keep Two Doors Open', provocation: 'Which decision could you postpone so that two futures remain possible?', sparkBrief: 'Identify specific commitments that can be delayed, staged or made conditional while preserving two credible paths.' },
  { id: 36, category: 'flexible', label: 'Being flexible', title: 'Make It Modular', provocation: 'What could be separated so one part can change without breaking everything else?', sparkBrief: 'Suggest concrete components, roles, channels or decisions that could become independent modules with clear joins.' },
  { id: 37, category: 'flexible', label: 'Being flexible', title: 'Rehearse the Failure', provocation: 'Where is this most likely to break — and what should happen next?', sparkBrief: 'Pair plausible, context-specific failure points with concise recovery, fallback or learning responses.' },
  { id: 38, category: 'flexible', label: 'Being flexible', title: 'Plan the Exit', provocation: 'How could this stop gracefully if it no longer works?', sparkBrief: 'Suggest humane shutdown, handover, migration or transition mechanisms that preserve value and protect affected people.' },
  { id: 39, category: 'flexible', label: 'Being flexible', title: 'Design for Misuse', provocation: 'How might people use this in a way you never intended — and what could that teach you?', sparkBrief: 'Suggest plausible unintended uses rooted in the idea and the concrete need, behaviour or opportunity each reveals.' },
  { id: 40, category: 'flexible', label: 'Being flexible', title: 'Move the Boundary', provocation: 'What changes if something currently inside the idea moves outside it — or vice versa?', sparkBrief: 'Identify specific responsibilities, steps, audiences or resources that could move across the idea’s current boundary.' },
]

export const CURATED_ROUTES = [
  {
    id: 'assumption-to-evidence',
    name: 'From assumption to evidence',
    purpose: 'Turn uncertainty into evidence.',
    cardIds: [13, 7, 14, 15],
  },
  {
    id: 'designed-with-people',
    name: 'Designed with people, not for them',
    purpose: 'Give affected people real authorship.',
    cardIds: [19, 4, 29, 31],
  },
  {
    id: 'creative-breakthrough',
    name: 'The creative breakthrough',
    purpose: 'Escape the predictable answer.',
    cardIds: [6, 22, 20, 8],
  },
  {
    id: 'make-it-catch-on',
    name: 'Make it catch on',
    purpose: 'Grow something people carry forward.',
    cardIds: [23, 30, 32, 34],
  },
  {
    id: 'build-for-uncertainty',
    name: 'Build for uncertainty',
    purpose: 'Make the idea resilient and adaptable.',
    cardIds: [40, 36, 24, 37],
  },
]

export const CARD_ICON_FILES = [
  '01-borrow-a-brain.png',
  '02-the-wrong-expert.png',
  '03-build-the-dream-team.png',
  '04-hand-over-the-pen.png',
  '05-do-the-opposite.png',
  '06-kill-the-obvious.png',
  '07-make-it-ridiculously-small.png',
  '08-turn-the-flaw-into-the-feature.png',
  '09-10x-it.png',
  '10-assume-it-works.png',
  '11-make-the-headline.png',
  '12-design-for-everyone.png',
  '13-your-assumption-is-wrong.png',
  '14-prototype-it-tomorrow.png',
  '15-the-evidence-changes.png',
  '16-let-the-intruder-in.png',
]

export const IDEA_EXAMPLES = [
  'A calmer handover for nurses finishing a night shift.',
  'A neighbourhood tool library run by retired engineers.',
  'A podcast that helps teenagers understand local politics.',
  'A low-waste menu for a busy family-owned restaurant.',
  'A museum trail designed with people who rarely visit museums.',
  'A better first week for children starting secondary school.',
  'A repair service for outdoor clothing that people love using.',
  'A climate workshop that farmers would genuinely recommend.',
  'A rehearsal process that gives every performer a real voice.',
  'A simple way for renters to improve their shared street.',
  'A safer late-night journey home for hospitality workers.',
  'A library service for people who never think to enter a library.',
  'A research conference where the public shapes the questions.',
  'A return-to-work programme for parents after extended leave.',
  'A football club that makes new supporters feel they belong.',
  'A financial app that works for people with unpredictable income.',
  'A community garden that stays lively through the winter.',
  'A science lesson built around the mysteries in a local park.',
  'A more humane way to wait for an outpatient appointment.',
  'A market stall that makes unfamiliar vegetables irresistible.',
  'A local news service designed for people short on time.',
  'An apprenticeship shaped jointly by students and small businesses.',
  'A music venue that neighbours are glad to live beside.',
  'A welcoming fitness class for people who dislike exercise.',
  'A digital archive that families can explore together.',
  'A staff meeting that gives quiet thinkers room to contribute.',
  'A circular packaging system for independent coffee shops.',
  'A housing consultation that young renters choose to attend.',
  'A playful way to help adults learn a new language.',
  'A public square that still feels inviting in bad weather.',
  'A mentoring network for first-generation university students.',
  'A better way for neighbours to share care during a heatwave.',
]

export const NEW_CARD_ICON_SPRITE = '/icons/change-cards/17-40-doodles.png'

export const CATEGORIES = [
  { id: 'multidisciplinary', label: 'Being multidisciplinary', shortLabel: 'Multidisciplinary', color: '#88abc3' },
  { id: 'ingenious', label: 'Being ingenious', shortLabel: 'Ingenious', color: '#e0604f' },
  { id: 'optimistic', label: 'Being optimistic', shortLabel: 'Optimistic', color: '#e8bd42' },
  { id: 'flexible', label: 'Being flexible', shortLabel: 'Flexible', color: '#78a878' },
]

// A sprite has six columns and four rows. Apply a 600% 400% background size;
// position is column * 20% / row * (100/3)% (the final cell is 100% / 100%).
export function cardArtwork(card) {
  const id = Number(typeof card === 'object' ? card?.id : card)
  const filename = CARD_ICON_FILES[id - 1]
  if (filename) return { src: `/icons/change-cards/${filename}` }
  if (!Number.isInteger(id) || id < 17 || id > 40) return null
  return { src: NEW_CARD_ICON_SPRITE, spriteIndex: id - 17 }
}
