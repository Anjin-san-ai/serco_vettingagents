/* ==========================================================================
   agents.js — the fleet definition. Pure data. No THREE, no DOM.
   Single source of truth for agents.html (the boxes) and the 3D simulation.

   Every `evidence` string is traceable to the supplied source documents:
     [WS pN]  Vetting Cognizant Workshop Sept 2026.pdf, page N
     [VP pN]  Vetting Processes Sept 26.pdf, page N
   ========================================================================== */
(function (X) {
  'use strict';

  /* Systems landscape referenced by the agents. */
  var SYSTEMS = {
    snow:      'ServiceNow',
    appian:    'PeopleFirst (Appian)',
    sap:       'SAP',
    as:        'Access Screening',
    docusign:  'DocuSign',
    outlook:   'Outlook',
    sscl:      'SSCL Portal',
    pega:      'PEGA (AFRS)',
    myhr:      'MyHR Online',
    efiles:    'Vetting drive (e-files)',
    ho:        'Home Office'
  };

  /* The orchestrator — centre of the scene, centre of the fleet grid. */
  var ORCHESTRATOR = {
    id: 'orchestrator', code: 'A0',
    name: 'Vetting Orchestrator',
    job: 'Owns the case end to end: determines which clearance is required, builds the route, runs the SLA clocks, and decides when a human must be involved.',
    systems: [SYSTEMS.snow, SYSTEMS.appian, SYSTEMS.sap, SYSTEMS.as],
    evidence: 'SIPOC flags "variance in request (standard/specialist)", and clearance type required is an *input* to Instruct Vetting. [WS p2]',
    saving: null,
    wave: 0,
    human: false,
    detail: {
      inputs: 'Vetting instruction from ServiceNow, PeopleFirst, MyHR Online or PEGA; role, contract and site; existing SAP record.',
      processing: 'Classifies the request (standard / specialist / BS7858 / renewal / mover-upgrade). Resolves the required clearance from BPSS, DBS, Enhanced DBS, BS7858, NSV, SC-OSA, PECS, HAAS or EMS. Builds the agent route for the case and holds the SLA clock (RTW 2 hours, audit 3 days).',
      outputs: 'A routed case with a clearance type, an SLA deadline, and an audit-logged decision trail.',
      guardrails: 'Cannot itself approve, refuse or issue a clearance. Any case it cannot classify with confidence is routed to a human rather than guessed.',
      human: 'A vetting officer confirms clearance type where the contract rules are ambiguous.'
    }
  };

  /* The ten satellites, in ring order. */
  var RING = [
    {
      id: 'manager-copilot', code: 'A1',
      name: 'Manager Copilot',
      job: 'Sits with the line manager in PeopleFirst and guides them to the correct ID and RTW document set before they can submit.',
      systems: [SYSTEMS.appian],
      evidence: 'Brainstorm refs 3 and 5 (in-system decision tree, mandatory document-type dropdown); V&O ongoing work is literally "defining ‘document decision tree’ in PeopleFirst". Attacks the 6% "not enough ID" and 3% "incorrect document types". [WS p1, p7]',
      saving: '≈6.6 hrs/mo',
      wave: 1, human: true,
      detail: {
        inputs: 'Role, contract, site, and the individual’s circumstances (nationality, visa status, existing Serco record).',
        processing: 'Walks a decision tree over the real vetting rule set to produce the exact required document combination for this person and this clearance. Validates completeness at upload time and refuses to let an incomplete set through.',
        outputs: 'A complete, correctly-typed document set, plus a manager-facing explanation of why each document is needed.',
        guardrails: 'Advisory text is never a substitute for the rule: submission is blocked, not merely warned. Serco’s own noted risk — that an acknowledgement becomes a click-through — is why this is a gate, not a checkbox.',
        human: 'Holds the case when the circumstances fall outside the modelled rule set, rather than guessing a document list.'
      }
    },
    {
      id: 'doc-intelligence', code: 'A2',
      name: 'Document Intelligence',
      job: 'Classifies every uploaded file, splits combined PDFs, rejects out-of-scope documents, and extracts the fields.',
      systems: [SYSTEMS.appian, SYSTEMS.sap, SYSTEMS.efiles],
      evidence: 'Brainstorm ref 4; V&O opportunity "automate document review and auto reject/feedback". Directly retires the audit business case’s stated risks 1 and 2 (invalid documents; multiple documents in one combined PDF). Attacks the 14% inadequate-verification share. [WS p1, p7, p11]',
      saving: '≈10 hrs/mo',
      wave: 0, human: false,
      detail: {
        inputs: 'Raw uploads from PeopleFirst — passports, birth certificates, NI documentation, visas, and whatever else was attached.',
        processing: 'Classifies document type; splits a combined PDF into discrete documents; filters out documents that are not required (the team currently strips out e.g. bank statements by hand); scores legibility and completeness; extracts passport number and expiry, NI number, date of birth, name and address.',
        outputs: 'A structured, split, classified document set with extracted fields and a per-document quality score.',
        guardrails: 'Serco’s own caution that OCR accuracy varies with document quality is met by emitting a confidence score per field — anything below threshold goes to a human rather than into SAP.',
        human: 'Low-confidence extractions and unrecognised document types are escalated, never silently accepted.'
      }
    },
    {
      id: 'id-verify', code: 'A3',
      name: 'Identity Verification',
      job: 'Performs digital identity verification and attaches a tamper-evident electronic verification stamp to the ticket.',
      systems: [SYSTEMS.appian, SYSTEMS.snow],
      evidence: 'Brainstorm ref 1 — "digital ID verification … including an electronic verification stamp for audit purposes". Addresses the largest single defect: 14% missing or incorrect ID verification. [WS p7]',
      saving: 'part of ≈10 hrs/mo',
      wave: 1, human: false,
      detail: {
        inputs: 'The classified ID documents from A2, plus the candidate’s submitted identity details.',
        processing: 'Runs the checks the document supports — MRZ parse, chip read, security-feature inspection — and records what was and was not verifiable.',
        outputs: 'An electronic verification stamp with an assurance level and an immutable audit record on the ServiceNow ticket.',
        guardrails: 'Deliberately emits an *assurance level*, not a binary pass. This answers Serco’s own stated risk that digital verification "may create a perception that physical document validation is no longer required".',
        human: 'Anything below the required assurance level routes to manual verification.'
      }
    },
    {
      id: 'reconciliation', code: 'A4',
      name: 'Data Reconciliation',
      job: 'Diffs the extracted document data against what the manager typed into Appian and against SAP, then proposes the correction.',
      systems: [SYSTEMS.appian, SYSTEMS.sap],
      evidence: 'RTW map records "Defect: 13% of sample mismatch between ID and Appian details"; brainstorm ref 4 is "automatically extract key information from ID documents and populate system fields" (≈9.5 hrs/mo). [VP p4, WS p7]',
      saving: '≈9.5 hrs/mo',
      wave: 0, human: false,
      detail: {
        inputs: 'A2’s extracted fields; the Appian-entered values; the current SAP record.',
        processing: 'Field-level comparison of name, date of birth, address, document number and expiry. Where they disagree, identifies which source is authoritative (the document) and proposes the specific correction.',
        outputs: 'A field-level diff and a proposed correction — rather than a bounced ticket and a three-day wait.',
        guardrails: 'Proposes; does not silently overwrite a system of record. Writes are applied by A9 under the assurance plane’s audit log.',
        human: 'A mismatch it cannot resolve becomes a single specific question to the manager, not a whole-ticket rejection.'
      }
    },
    {
      id: 'screening-setup', code: 'A5',
      name: 'Screening Setup',
      job: 'Creates the Access Screening record, issues the candidate link, triggers occupational health, and sets up the required clearance.',
      systems: [SYSTEMS.as, SYSTEMS.snow, SYSTEMS.myhr, SYSTEMS.sscl, SYSTEMS.pega],
      evidence: 'SIPOC calls Setup Vetting Check the "biggest automation opportunity"; onboarding map steps 1.6–1.8; Direct Vetting’s own opportunity list includes "automated set up from MYHR Online or S-NOW … into Access Screening". Retires the ITC-tracker and ServiceNow write-backs. [WS p1, p2, VP p2, p3]',
      saving: 'enables 56.2 hrs/mo',
      wave: 3, human: false,
      detail: {
        inputs: 'A routed case from A0 with a confirmed clearance type and a verified document set.',
        processing: 'Creates the AS record, generates and issues the candidate AS link, sends the welcome-email template, triggers the occupational health check, and initiates BS7858 / DBS / NSV / SSCL-IRC as the route requires. Writes the AS reference and date back to the source record.',
        outputs: 'A live screening case, a candidate with a link, and the AS reference recorded in ServiceNow and SAP — not in an Excel tracker.',
        guardrails: 'Only runs once the input-quality gates (A2–A4) have passed, honouring Serco’s "inputs need to be fixed first" rule.',
        human: 'None in the happy path; setup failures escalate.'
      }
    },
    {
      id: 'progress-chase', code: 'A6',
      name: 'Progress & Chase',
      job: 'Watches Access Screening for completion and chases candidates and referees on trigger rather than on a schedule.',
      systems: [SYSTEMS.as, SYSTEMS.outlook, SYSTEMS.snow],
      evidence: 'The Specialist Vetting map states plainly: "Not notified of completion — must manually check for completions", worked around by a daily report. SIPOC notes chasers are automated "apart from certain triggers for escalation". [VP p3, WS p2]',
      saving: 'removes the daily report',
      wave: 4, human: false,
      detail: {
        inputs: 'Live AS cases; reference requests; the 3-year reference-history requirement (6 months for PECS).',
        processing: 'Polls AS for link completion — replacing the daily manual report — and chases candidates and referees. Escalates when a trigger fires, not when a calendar says so.',
        outputs: 'Completion events pushed to the orchestrator; a chase and escalation trail.',
        guardrails: 'Chase cadence is bounded so a candidate is never spammed; escalation to a human after a defined number of attempts.',
        human: 'Persistent non-response escalates to the vetting officer and the line manager.'
      }
    },
    {
      id: 'inbox', code: 'A7',
      name: 'Inbox & Query',
      job: 'Triages the vetting inbox, actions the corresponding Access task, updates the Access file, and answers routine queries.',
      systems: [SYSTEMS.outlook, SYSTEMS.as, SYSTEMS.efiles],
      evidence: 'On the teams’ own wish-lists: Direct Vetting asks for a "FAQ agent" and an "inbox agent"; Specialist Vetting asks for "automated inbox management/agent — email read and Access task actioned and Access file updated". [WS p1]',
      saving: 'not yet quantified',
      wave: 4, human: false,
      detail: {
        inputs: 'Inbound email — Home Office clearance outcomes, candidate queries, line-manager queries, referee replies.',
        processing: 'Classifies and triages each message, actions the matching Access task, updates the Access file, files evidence to the vetting drive, and answers FAQs from the documented rule set.',
        outputs: 'An actioned inbox, updated AS records, and filed evidence.',
        guardrails: 'Never composes a clearance decision or a refusal. Anything touching an outcome is drafted for human release.',
        human: 'Clearance outcomes and anything contentious are read and released by a person.'
      }
    },
    {
      id: 'adjudication', code: 'A8',
      name: 'Adjudication Support',
      job: 'Assembles the Check & Progress evidence pack and hands the vetting officer a reasoned recommendation — and the gaps.',
      systems: [SYSTEMS.as, SYSTEMS.sap, SYSTEMS.ho],
      evidence: 'SIPOC describes Check & Progress as "value adding for vetting — reviewing inputs to determine outputs. Difficult to automate but not impossible." Modelled as decision *support* for exactly that reason. [WS p2]',
      saving: 'decision support only',
      wave: 5, human: true,
      detail: {
        inputs: 'References, DBS result, credit checks, residency and 5-year address history, screening-question answers, occupational health decision.',
        processing: 'Assembles the evidence pack, applies the documented policy rules, and produces a recommendation with citations to the underlying evidence — and an explicit list of what is missing or inconsistent.',
        outputs: 'An evidence pack, a reasoned recommendation, and a gap list for the vetting officer.',
        guardrails: 'Issues no clearance, ever. Higher Level Checks, acceptance of risk, and ER escalations remain human-authority steps.',
        human: 'The vetting officer makes every clearance decision. This agent only prepares it.'
      }
    },
    {
      id: 'records', code: 'A9',
      name: 'Records & Compliance',
      job: 'Files the contract and RTW documents to SAP, writes passport and visa details, and holds the visa register in SAP instead of Excel.',
      systems: [SYSTEMS.sap, SYSTEMS.docusign],
      evidence: 'Business cases 1 and 2, raised 8 July 2026: automate document uploads to SAP (54 hrs/mo) and automate adding document details to SAP (43 hrs/mo). The audit map records visa tracking as "currently managed via Excel". [WS p9, p11, p12, VP p5]',
      saving: '97 hrs/mo',
      wave: 2, human: false,
      detail: {
        inputs: 'Signed contract from DocuSign; the split, classified document set from A2; reconciled fields from A4.',
        processing: 'Uploads contract and RTW documents to the SAP record (SAP OT filing); writes personal details including passport number and expiry and visa details; maintains the visa register in SAP with expiry-driven notifications.',
        outputs: 'A complete SAP record, a controlled visa register, and a full audit trail. 54 + 43 = 97 hrs/month of documented saving.',
        guardrails: 'Only writes fields that A4 reconciled and A2 scored above threshold. Non-standard documents follow the escalation path Serco’s business case requires.',
        human: 'Non-standard documents are escalated rather than force-filed.'
      }
    },
    {
      id: 'follow-on', code: 'A10',
      name: 'Follow-on Action',
      job: 'Reads what the candidate declared on the signed contract and raises exactly the right ServiceNow tickets — respecting the ER confidentiality rule.',
      systems: [SYSTEMS.snow, SYSTEMS.sap],
      evidence: 'Business case 3: 326 manually-raised tickets per month (P45 193, disabilities 86, convictions 43, veteran 4) at ~5 min each = 27 hrs/mo. [WS p13, p14, VP p5]',
      saving: '27 hrs/mo',
      wave: 2, human: true,
      detail: {
        inputs: 'Declarations from the signed contract: P45 attached, disabilities declared, criminal convictions declared, veteran status.',
        processing: 'Raises the correct ServiceNow ticket per declaration — P45 to Payroll (193/mo), disabilities to the line manager (86/mo), convictions to Employment Relations (43/mo), veteran to Payroll or a document request to the manager (4/mo).',
        outputs: '326 correctly-routed tickets a month with no manual keying, and a closed audit ticket.',
        guardrails: 'Hard routing guard, taken verbatim from the business case: if the role sits *within* Employment Relations, the conviction ticket MUST NOT be sent to the ER queue — it would be visible to the entire ER team. The VIVO condition is flagged as unresolved rather than assumed.',
        human: 'A declared conviction halts here for a human decision before anything is routed.'
      }
    }
  ];

  /* The governance substrate. Not a peer pod: in the 3D scene this is the
     floor the whole fleet stands on, and on the fleet page it is the band
     beneath the grid. */
  var ASSURANCE = {
    id: 'assurance', code: '—',
    name: 'Assurance & Audit plane',
    job: 'The control layer every agent runs inside — human-in-the-loop gates, decision logs, data protection, and the telemetry the business case is measured on.',
    responsibilities: [
      'Human-in-the-loop gates and confidence thresholds — below threshold escalates, never guesses',
      'Decision logs with rationale and evidence citations for every automated action',
      'UK GDPR / DPIA handling of special-category data — disability and criminal-conviction declarations',
      'The ER confidentiality routing guard, enforced centrally rather than per-agent',
      'Retention and deletion schedules for vetting evidence',
      'Fairness monitoring on document and identity decisions, by document type and nationality',
      'Agent and model versioning, with the ability to replay any past decision',
      'SLA and KPI telemetry — the numbers on the business case page come from here'
    ],
    note: 'Live from Wave 0, not a later bolt-on. The data classes in play (Article 9 special-category and Article 10 criminal-offence data) make this a precondition, not a nice-to-have.'
  };

  var WAVES = [
    { n: 0, name: 'Prove',                 gate: 'Measured per-document-type accuracy against the human outcome' },
    { n: 1, name: 'Prevent',               gate: 'Pushback sustained at or below 10% — Serco’s own goal' },
    { n: 2, name: 'Automate the audit',    gate: 'Straight-through rate, and zero ER-confidentiality breaches' },
    { n: 3, name: 'Automate RTW & setup',  gate: '2-hour SLA held with no accuracy regression' },
    { n: 4, name: 'Scale out',             gate: 'Direct Vetting input failure down from 14%' },
    { n: 5, name: 'Adjudication support',  gate: 'Officer agreement rate; zero autonomous clearances' }
  ];

  X.Agents = {
    SYSTEMS: SYSTEMS,
    ORCHESTRATOR: ORCHESTRATOR,
    RING: RING,
    ASSURANCE: ASSURANCE,
    WAVES: WAVES,
    all: function () { return [ORCHESTRATOR].concat(RING); },
    byId: function (id) {
      var a = this.all();
      for (var i = 0; i < a.length; i++) if (a[i].id === id) return a[i];
      return null;
    }
  };
})(typeof module !== 'undefined' ? module.exports : (window.SVS = window.SVS || {}));
