/* =========================================================================
   CANDIDATE PATHWAYS - SHARED PROSPECT PROFILE DATA MODEL

   Single source of truth for the prospect profile, used by the coach view
   (prospect-profile.html) today and by the future prospect-facing profile.

   Every field carries two attributes:
     owner       'prospect' | 'coach'   - who can edit it
     visibility  'shared' | 'coach_only' | 'prospect_private'

   The rules the views enforce:
     - A view renders a field only if visibleTo(field, role) says so.
     - A view lets you edit a field only if editableBy(field, role) says so.
       Coaches NEVER edit prospect-owned fields (incl. all demographics).
     - Coach-only data (notes, election statuses) lives in distinct
       components the prospect view simply never renders.

   District values are stored ONCE (civic footprint) and eligible offices
   are DERIVED from them - see OFFICE_RULES / deriveEligibleOffices.
   ========================================================================= */
(function () {
  'use strict';

  var OWNER = { PROSPECT: 'prospect', COACH: 'coach' };
  var VIS = { SHARED: 'shared', COACH_ONLY: 'coach_only', PROSPECT_PRIVATE: 'prospect_private' };

  /* ------------------------------ config --------------------------------- */
  var config = {
    /* Whether self-identified demographics appear in the PDF export.
       Default false: the export leaves them out unless deliberately enabled. */
    includeDemographicsInExport: false,
  };

  /* ------------------------- field constructor --------------------------- */
  function field(id, label, value, owner, visibility, extra) {
    var f = { id: id, label: label, value: value, owner: owner, visibility: visibility };
    if (extra) for (var k in extra) f[k] = extra[k];
    return f;
  }

  /* Who sees what. The coach view shows everything (demographics render
     quietly + collapsed); the prospect view will hide coach_only fields. */
  function visibleTo(f, role) {
    if (role === 'coach') return true;
    return f.visibility !== VIS.COACH_ONLY;
  }
  function editableBy(f, role) { return f.owner === role; }

  /* -------------------- election status state machine -------------------- */
  /* First-class, ordered states. Chips reference these by id so the same
     object can drive filters on the prospect list later. */
  var ELECTION_STATUSES = [
    { id: 'not_asked',   label: 'Not yet asked', chip: 'bg-concrete text-boulder',        dot: '#BDBDBD' },
    { id: 'asked',       label: 'Asked',         chip: 'bg-azure/10 text-azure',          dot: '#3A5FAD' },
    { id: 'considering', label: 'Considering',   chip: 'bg-warning/[0.12] text-warning',  dot: '#DC6803' },
    { id: 'committed',   label: 'Committed',     chip: 'bg-apple/10 text-appledark',      dot: '#30BC36' },
    { id: 'declined',    label: 'Declined',      chip: 'bg-concrete text-dusty',          dot: '#9B9B9B' },
  ];
  function electionStatus(id) {
    for (var i = 0; i < ELECTION_STATUSES.length; i++) {
      if (ELECTION_STATUSES[i].id === id) return ELECTION_STATUSES[i];
    }
    return ELECTION_STATUSES[0];
  }

  /* --------------------------- seed record ------------------------------- */
  var PROFILE = {
    id: 'sarah-mitchell',
    name: 'Sarah Mitchell',

    /* Prospect-authored bio: a short, first-person intro in her own voice.
       Prospect-owned, shared (read-only for coaches). Optional and empty-safe:
       an empty value renders as a gentle "no bio yet" state, never a blank
       demand. This is the warmest, least-structured field, so the view leads
       the About card with it before the structured professional data. */
    bio: field('bio', 'Bio',
          "I'm a public health director and a mom, born and raised in south Austin, and I still ride the bus most days. For twelve years I've built programs that meet people where they are, from mobile clinics to a 40-person volunteer corps. I'm looking at running because the people writing our budgets stopped riding the routes they cut, and I'd rather help fix that than talk about it.",
          OWNER.PROSPECT, VIS.SHARED),

    /* a. Professional / qualifications - prospect-owned, shared */
    professional: [
      field('experience',   'Professional experience',
            '12 years leading public health programs across Central Texas; built a 40-person volunteer corps for mobile clinics.',
            OWNER.PROSPECT, VIS.SHARED),
      field('workCategory', 'Work category', 'Healthcare / Public health', OWNER.PROSPECT, VIS.SHARED),
      field('businessName', 'Organization',  'Central Texas Health Collaborative', OWNER.PROSPECT, VIS.SHARED),
      field('occupation',   'Occupation',    'Program Director', OWNER.PROSPECT, VIS.SHARED),
      field('endorsements', 'Endorsements',  ['Austin Nurses Alliance', 'Travis County Young Democrats'], OWNER.PROSPECT, VIS.SHARED),
      field('languages',    'Languages spoken', ['English', 'Spanish'], OWNER.PROSPECT, VIS.SHARED),
    ],

    /* b. Civic footprint - prospect-owned, shared.
       THE single store for districts; Elections derives from these. */
    civic: [
      field('congressionalDistrict', 'Congressional district', 'TX-37',         OWNER.PROSPECT, VIS.SHARED),
      field('stateSenateDistrict',   'State senate district',  'SD-14',         OWNER.PROSPECT, VIS.SHARED),
      field('stateHouseDistrict',    'State house district',   'HD-49',         OWNER.PROSPECT, VIS.SHARED),
      field('county',                'County',                 'Travis County', OWNER.PROSPECT, VIS.SHARED),
      field('schoolDistrict',        'School district',        'Austin ISD',    OWNER.PROSPECT, VIS.SHARED),
      field('localEngagement',       'Local engagement',       'High (4 of 5)', OWNER.PROSPECT, VIS.SHARED),
    ],

    /* c. Self-identified demographics - prospect-owned, PRIVATE.
       Read-only for coaches, collapsed by default, quiet styling.
       null value renders as "Prefer not to say". */
    demographics: [
      field('age',      'Age',      '38',    OWNER.PROSPECT, VIS.PROSPECT_PRIVATE,
            { why: 'Some offices carry minimum-age requirements.' }),
      field('race',     'Race',     'White', OWNER.PROSPECT, VIS.PROSPECT_PRIVATE,
            { why: 'Helps the program build a bench that reflects the community.' }),
      field('gender',   'Gender',   'Woman', OWNER.PROSPECT, VIS.PROSPECT_PRIVATE,
            { why: 'Used only in aggregate program reporting.' }),
      field('religion', 'Religion', null,    OWNER.PROSPECT, VIS.PROSPECT_PRIVATE,
            { why: 'Optional context for community outreach; never required.' }),
      field('identityNotes', 'Additional identity notes', 'First-generation college graduate', OWNER.PROSPECT, VIS.PROSPECT_PRIVATE,
            { why: 'Anything else she wants the program to know about who she is.' }),
    ],

    /* Coach-owned data. Seed values only: the coach view overlays its own
       saved edits (localStorage) on top of these. */
    coach: {
      /* Reverse-chronological session log. Newest first. Each entry is one
         coaching touch; the view leads with the latest and collapses the rest.
         Coach-owned, coach-only. */
      notesLog: [
        { id: 'note-3', ts: '2026-07-02', text: 'Sharp on policy, deflects on fundraising. Family fully on board as of June. Next session: bring up the Austin ISD board seat directly and name the ask.' },
        { id: 'note-2', ts: '2026-06-15', text: 'Walked through the school board seat in detail. She lit up talking about after-school transit, then went quiet on the time commitment with two kids at home.' },
        { id: 'note-1', ts: '2026-05-28', text: 'Intro session. Twelve years in public health, deep community roots. Nervous about fundraising and has not told her sister she is considering a run.' },
      ],
      electionStatus: field('electionStatus', 'Election status by office', {
        'office-schoolDistrict':        'considering',
        'office-county':                'not_asked',
        'office-stateHouseDistrict':    'asked',
        'office-stateSenateDistrict':   'not_asked',
        'office-congressionalDistrict': 'not_asked',
      }, OWNER.COACH, VIS.COACH_ONLY),
    },
  };

  /* ------------------------ office derivation ---------------------------- */
  /* Each rule maps one stored district field to one eligible office.
     Office/eligibility is derived data; only the coach's STATUS on each
     office is stored (coach-owned, coach-only). */
  var OFFICE_RULES = [
    { districtField: 'schoolDistrict',        office: 'School Board Trustee',   nextElection: 'Nov 3, 2026',  filing: 'Filing closes Aug 17, 2026' },
    { districtField: 'county',                office: 'County Commissioner',    nextElection: 'Nov 7, 2028',  filing: 'Filing opens Nov 13, 2027' },
    { districtField: 'stateHouseDistrict',    office: 'State Representative',   nextElection: 'Nov 7, 2028',  filing: 'Filing opens Nov 13, 2027' },
    { districtField: 'stateSenateDistrict',   office: 'State Senator',          nextElection: 'Nov 7, 2028',  filing: 'Filing opens Nov 13, 2027' },
    { districtField: 'congressionalDistrict', office: 'U.S. Representative',    nextElection: 'Nov 7, 2028',  filing: 'Filing opens Nov 13, 2027' },
  ];

  function civicValue(profile, fieldId) {
    for (var i = 0; i < profile.civic.length; i++) {
      if (profile.civic[i].id === fieldId) return profile.civic[i].value;
    }
    return null;
  }

  function deriveEligibleOffices(profile) {
    var out = [];
    for (var i = 0; i < OFFICE_RULES.length; i++) {
      var r = OFFICE_RULES[i];
      var district = civicValue(profile, r.districtField);
      if (!district) continue;               // no district on file -> not eligible
      out.push({
        id: 'office-' + r.districtField,     // stable key the status map points at
        office: r.office,
        district: district,
        nextElection: r.nextElection,
        filing: r.filing,
      });
    }
    return out;
  }

  /* ------------------------------ export --------------------------------- */
  window.CP_PROFILE = {
    OWNER: OWNER,
    VIS: VIS,
    config: config,
    field: field,
    visibleTo: visibleTo,
    editableBy: editableBy,
    ELECTION_STATUSES: ELECTION_STATUSES,
    electionStatus: electionStatus,
    PROFILE: PROFILE,
    deriveEligibleOffices: deriveEligibleOffices,
  };
})();
