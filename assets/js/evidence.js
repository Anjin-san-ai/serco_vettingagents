/* ==========================================================================
   evidence.js - the Evidence walkthrough content. HAND-AUTHORED.

   This is the single source of truth for the specimen documents: every field
   VALUE printed on a generated PDF is declared here exactly once, and the
   extraction panel on evidence.html reads the same record. The two cannot
   disagree, because there is only one copy.

   tools/build-evidence.py reads this file (via node -e require) to draw the
   PDFs, and emits the highlight GEOMETRY to assets/js/evidence-boxes.js.
   After changing any `value` below, rebuild:

     python3 tools/build-evidence.py

   test/run.js fails loudly if you forget - evidence-boxes.js carries a digest
   of the values it was built from.

   Provenance convention, matching business-case.html:
     provenance: 'serco'  - stated in the source documents, `citation` required
     provenance: 'ours'   - Cognizant solution design, no Serco source
     provenance: 'proposed' - a control the sources propose but have NOT built
   ========================================================================== */
(function (X) {
  'use strict';

  /* Page sizes in PostScript points (1/72").
     ID-3 / TD3 passport data page: 125 x 88 mm.  ID-1 card: 85.6 x 53.98 mm. */
  var MM = 72.0 / 25.4;
  var PAGE_TD3 = [125 * MM, 88 * MM];
  var PAGE_ID1 = [85.6 * MM, 53.98 * MM];
  var PAGE_A4  = [210 * MM, 297 * MM];

  /* ------------------------------------------------------------------ persona
     The candidate. The name is taken from the simulation's own pool
     (engine.js NAMES) so this walkthrough and the Live simulation read as the
     same world rather than two unrelated demos.

     `dob` is the truth, as printed on the passport. `dobTyped` is what the line
     manager keyed into PeopleFirst - the MAR/MAY slip that drives Exception 1.
     Both are printed on their respective documents, so the mismatch the page
     demonstrates is a real diff between two rendered PDFs.                   */
  var PERSONA = {
    name:        'Davinder Kaur',
    surname:     'KAUR',
    givenNames:  'DAVINDER',
    dob:         '14 MAR 1994',
    dobTyped:    '14 MAY 1994',
    nationality: 'BRITISH CITIZEN',
    sex:         'F',
    birthplace:  'LEICESTER',
    address:     ['48 SANDFORD ROAD', 'LEICESTER', 'LE2 7RH'],
    niNumber:    'QQ 12 34 56 C',
    passportNo:  '500000007',
    role:        'Custody Detention Officer',
    site:        'PECS South - Leicester',
    contract:    'Justice & Immigration',
    manager:     'Holly Wright',
    ticket:      'RTW0084213',
    auditTicket: 'AUD0061188'
  };

  /* -------------------------------------------------------------------- docs
     One entry per generated specimen. `fields` are the only things the build
     records a highlight box for - static labels and chrome are drawn directly
     and deliberately have no box, because a confidence score against the words
     "Surname / Nom" would be noise on the page and a lie in the panel.        */
  var DOCS = {

    'upload-combined': {
      label: 'Manager upload - single combined PDF, 4 pages',
      kind: 'combined',
      page: PAGE_A4,
      note: 'What actually arrives: four unrelated documents in one file. ' +
            'Serco records this as a stated problem - "multiple docs in a ' +
            'combined PDF (needs to be split prior to upload)".',
      pages: ['passport', 'licence', 'ni-letter', 'bank-statement'],
      fields: {
        filename:  { label: 'File name',   value: 'Kaur_docs_scan.pdf', conf: 1.00 },
        pageCount: { label: 'Pages',       value: '4', conf: 1.00 },
        uploaded:  { label: 'Uploaded to', value: 'PeopleFirst (Appian)', conf: 1.00 }
      }
    },

    'passport': {
      label: 'UK passport - biographical data page',
      kind: 'passport',
      page: PAGE_TD3,
      issuer: 'HM Passport Office',
      note: 'Layout and field order follow the ICAO 9303 TD3 specification. ' +
            'The artwork is schematic on purpose - see the specimen note.',
      fields: {
        type:        { label: 'Type',              value: 'P',                  conf: 1.00 },
        code:        { label: 'Code',              value: 'GBR',                conf: 1.00 },
        passportNo:  { label: 'Passport number',   value: '500000007',          conf: 0.99 },
        surname:     { label: 'Surname',           value: 'KAUR',               conf: 0.99 },
        givenNames:  { label: 'Given names',       value: 'DAVINDER',           conf: 0.98 },
        nationality: { label: 'Nationality',       value: 'BRITISH CITIZEN',    conf: 0.99 },
        dob:         { label: 'Date of birth',     value: '14 MAR 1994',        conf: 0.97 },
        sex:         { label: 'Sex',               value: 'F',                  conf: 0.99 },
        birthplace:  { label: 'Place of birth',    value: 'LEICESTER',          conf: 0.96 },
        issued:      { label: 'Date of issue',     value: '02 FEB 2022',        conf: 0.98 },
        expiry:      { label: 'Date of expiry',    value: '02 FEB 2032',        conf: 0.98 },
        authority:   { label: 'Authority',         value: 'HM PASSPORT OFFICE', conf: 0.97 },
        photo:       { label: 'Portrait',          value: null,                 conf: 0.94,
                       kind: 'block',
                       readAs: 'Present, machine-readable quality' },
        signature:   { label: "Holder's signature", value: null,                conf: 0.88,
                       kind: 'block',
                       readAs: 'Present' },
        mrz1:        { label: 'MRZ line 1',        value: null, conf: 0.99, kind: 'mrz' },
        mrz2:        { label: 'MRZ line 2',        value: null, conf: 0.99, kind: 'mrz' }
      }
    },

    'licence': {
      label: 'UK driving licence - photocard front',
      kind: 'licence',
      page: PAGE_ID1,
      issuer: 'DVLA',
      note: 'Numbered to the DVLA photocard schema. Included deliberately: it ' +
            'is an identity document, NOT evidence of right to work.',
      fields: {
        surname:       { label: '1  Surname',          value: 'KAUR',              conf: 0.98 },
        givenNames:    { label: '2  Given names',      value: 'DAVINDER',          conf: 0.97 },
        dob:           { label: '3  Date of birth',    value: '14.03.1994',        conf: 0.96 },
        issued:        { label: '4a Date of issue',    value: '11.08.2021',        conf: 0.96 },
        expiry:        { label: '4b Date of expiry',   value: '10.08.2031',        conf: 0.96 },
        authority:     { label: '4c Issuing authority', value: 'DVLA',             conf: 0.99 },
        /* Derived by tools/build-evidence.py from the surname, forenames, date
           of birth and sex printed on this same card - see dvla_number(). It is
           not declared here because a hand-typed one was wrong: the previous
           value decoded to month 43, which is not a month. */
        licenceNumber: { label: '5  Licence number',   value: null, conf: 0.95 },
        address:       { label: '8  Address',          value: null, kind: 'rows', conf: 0.93,
                         lines: ['48 SANDFORD ROAD', 'LEICESTER', 'LE2 7RH'] },
        categories:    { label: '9  Entitlement',      value: null, kind: 'block', conf: 0.91,
                         readAs: 'AM/A1/A2/A, B1/B/BE, f/k/l/n/p/q' },
        photo:         { label: 'Portrait',            value: null, kind: 'block', conf: 0.94,
                         readAs: 'Present' },
        signature:     { label: '7  Signature',        value: null, kind: 'block', conf: 0.86,
                         readAs: 'Present' }
      }
    },

    'ni-letter': {
      label: 'HMRC - National Insurance number confirmation letter',
      kind: 'form',
      page: PAGE_A4,
      issuer: 'HM Revenue & Customs',
      note: 'One of the document types Serco names explicitly: "National ' +
            'Insurance documentation".',
      fields: {
        recipient: { label: 'Addressed to', value: 'Miss D Kaur',       conf: 0.97 },
        niNumber:  { label: 'NI number',    value: 'QQ 12 34 56 C',     conf: 0.98 },
        issued:    { label: 'Date issued',  value: '9 January 2023',    conf: 0.96 },
        address:   { label: 'Address',      value: null, kind: 'rows',  conf: 0.94,
                     lines: ['48 Sandford Road', 'Leicester', 'LE2 7RH'] },
        reference: { label: 'HMRC reference', value: 'NINO/2023/0114882', conf: 0.95 }
      }
    },

    'bank-statement': {
      label: 'Bank statement - NOT a required document',
      kind: 'form',
      page: PAGE_A4,
      issuer: 'A high-street bank',
      note: 'Present only because it is in the combined upload. Serco records ' +
            'that the team currently strips these out by hand. Including it is ' +
            'the point: A2 removes it before it reaches a human.',
      fields: {
        accountName: { label: 'Account name',  value: 'MISS D KAUR',      conf: 0.96 },
        sortCode:    { label: 'Sort code',     value: '00-00-00',         conf: 0.97 },
        accountNo:   { label: 'Account number', value: '00000000',        conf: 0.97 },
        period:      { label: 'Statement period', value: '1 - 31 JULY 2026', conf: 0.95 },
        balance:     { label: 'Closing balance', value: '1,284.06',       conf: 0.93 }
      }
    },

    'mgr-declaration': {
      label: 'Line manager document declaration - PROPOSED CONTROL',
      kind: 'form',
      page: PAGE_A4,
      issuer: 'Serco - proposed',
      note: 'This control does NOT exist in the current process. It is ' +
            'brainstorm ref 6 from the workshop pack, whose implementation ' +
            'column reads "Workshop booked to discuss".',
      fields: {
        manager:     { label: 'Declared by',      value: 'Holly Wright',      conf: 0.98 },
        role:        { label: 'Position',         value: 'Recruiting Manager', conf: 0.96 },
        candidate:   { label: 'Candidate',        value: 'Davinder Kaur',     conf: 0.98 },
        ticket:      { label: 'RTW ticket',       value: 'RTW0084213',        conf: 0.99 },
        docsListed:  { label: 'Documents declared', value: 'Passport; driving licence; NI letter', conf: 0.94 },
        statement:   { label: 'Declaration',      value: null, kind: 'rows',  conf: 0.92,
                       lines: ['I confirm I have reviewed the documents listed above,',
                               'that they meet the submission requirements, and that',
                               'the details I have entered match the evidence.'] },
        signature:   { label: 'Signature',        value: null, kind: 'block', conf: 0.85,
                       readAs: 'Present' },
        signedDate:  { label: 'Date signed',      value: '04 AUG 2026',       conf: 0.97 }
      }
    },

    'appian-record': {
      label: 'PeopleFirst (Appian) - details as keyed by the line manager',
      kind: 'form',
      page: PAGE_A4,
      issuer: 'Serco - PeopleFirst',
      note: 'The system-side half of the RTW check. Serco validates that "the ' +
            'details entered in the system align with the supporting evidence" ' +
            '- this is the record being aligned against.',
      fields: {
        ticket:     { label: 'Ticket',          value: 'RTW0084213',             conf: 1.00 },
        surname:    { label: 'Surname',         value: 'KAUR',                   conf: 1.00 },
        givenNames: { label: 'Forename(s)',     value: 'DAVINDER',               conf: 1.00 },
        dob:        { label: 'Date of birth',   value: '14 MAY 1994',            conf: 1.00 },
        /* Transposed from the passport's 500000007. Deliberate: it gives the
           reconciliation step a second error of a different KIND - one the MRZ
           check digit can adjudicate, where the date mismatch can only be
           corroborated. */
        passportNo: { label: 'Passport number', value: '500000070',              conf: 1.00 },
        expiry:     { label: 'Passport expiry', value: '02 FEB 2032',            conf: 1.00 },
        niNumber:   { label: 'NI number',       value: 'QQ 12 34 56 C',          conf: 1.00 },
        role:       { label: 'Role',            value: 'Custody Detention Officer', conf: 1.00 },
        site:       { label: 'Site',            value: 'PECS South - Leicester', conf: 1.00 },
        submitted:  { label: 'Offer submitted', value: '04 AUG 2026 09:12',      conf: 1.00 }
      }
    },

    'id-stamp': {
      label: 'Electronic identity verification stamp - A3 output',
      kind: 'form',
      page: PAGE_A4,
      issuer: 'Serco Agentic Vetting - A3',
      note: 'The artefact the sources ask for: "an electronic verification ' +
            'stamp for audit purposes". It records an assurance level and what ' +
            'was and was not verifiable - never a bare pass.',
      fields: {
        subject:     { label: 'Subject',           value: 'Davinder Kaur',   conf: 1.00 },
        document:    { label: 'Document verified', value: 'UK passport 500000007', conf: 1.00 },
        assurance:   { label: 'Assurance level',   value: 'MEDIUM',          conf: 1.00 },
        mrzCheck:    { label: 'MRZ check digits',  value: 'VALID',           conf: 1.00 },
        mrzAgrees:   { label: 'MRZ vs printed zone', value: 'AGREES',        conf: 1.00 },
        chipRead:    { label: 'Chip read',         value: 'NOT ATTEMPTED - scan only', conf: 1.00 },
        features:    { label: 'Security features', value: 'NOT VERIFIABLE FROM A SCAN', conf: 1.00 },
        stampedAt:   { label: 'Stamped',           value: '04 AUG 2026 09:14', conf: 1.00 },
        stampRef:    { label: 'Audit reference',   value: 'IDV-0084213-A3',  conf: 1.00 }
      }
    },

    'contract': {
      label: 'Signed contract - declarations page and DocuSign certificate',
      kind: 'form',
      page: PAGE_A4,
      issuer: 'Serco / DocuSign',
      note: 'Signature on DocuSign is what generates the onboarding audit ' +
            'ticket. The four declarations on this page drive every follow-on ' +
            'action in the audit.',
      fields: {
        employee:    { label: 'Employee',            value: 'Davinder Kaur',     conf: 0.98 },
        role:        { label: 'Position',            value: 'Custody Detention Officer', conf: 0.97 },
        startDate:   { label: 'Start date',          value: '01 SEP 2026',       conf: 0.97 },
        salary:      { label: 'Salary',              value: 'GBP 28,400',        conf: 0.96 },
        bankSort:    { label: 'Bank sort code',      value: '00-00-00',          conf: 0.95 },
        bankAccount: { label: 'Bank account',        value: '00000000',          conf: 0.95 },
        p45:         { label: 'P45 attached',        value: 'YES',               conf: 0.96 },
        disability:  { label: 'Disability declared', value: 'NO',                conf: 0.96 },
        convictions: { label: 'Criminal convictions declared', value: 'YES',     conf: 0.95 },
        veteran:     { label: 'Veteran status',      value: 'NO',                conf: 0.96 },
        signedBy:    { label: 'Signed by',           value: 'Davinder Kaur',     conf: 0.94 },
        signature:   { label: 'Signature',           value: null, kind: 'block', conf: 0.87,
                       readAs: 'Present' },
        signedDate:  { label: 'Date signed',         value: '19 AUG 2026 18:44', conf: 0.98 },
        envelope:    { label: 'DocuSign envelope',   value: 'DS-8F2C-0000-4419', conf: 0.99 }
      }
    },

    'p45': {
      label: 'P45 Part 1A - details of employee leaving work',
      kind: 'form',
      page: PAGE_A4,
      issuer: 'Previous employer / HMRC',
      note: 'Attached to the contract. Its presence is one of the audit ' +
            'gateways: Serco raises 193 payroll tickets a month off this.',
      fields: {
        employee:   { label: 'Employee name',   value: 'Miss D Kaur',    conf: 0.96 },
        niNumber:   { label: 'NI number',       value: 'QQ 12 34 56 C',  conf: 0.97 },
        leaving:    { label: 'Leaving date',    value: '22 AUG 2026',    conf: 0.96 },
        taxCode:    { label: 'Tax code',        value: '1257L',          conf: 0.97 },
        payToDate:  { label: 'Total pay to date', value: '11,208.55',    conf: 0.94 },
        taxToDate:  { label: 'Total tax to date', value: '1,144.20',     conf: 0.94 },
        payrollRef: { label: 'Employer PAYE ref', value: '000/XX00000',  conf: 0.95 }
      }
    },

    'sap-record': {
      label: 'SAP record extract - after the audit writes',
      kind: 'form',
      page: PAGE_A4,
      issuer: 'Serco - SAP',
      note: 'SAP is the system of record for employees and vetting evidence. ' +
            'The audit writes passport details here and files the documents.',
      fields: {
        personnelNo: { label: 'Personnel number',  value: '00841327',        conf: 1.00 },
        name:        { label: 'Name',              value: 'Davinder Kaur',   conf: 1.00 },
        dob:         { label: 'Date of birth',     value: '14 MAR 1994',     conf: 1.00 },
        passportNo:  { label: 'Passport number',   value: '500000007',       conf: 1.00 },
        expiry:      { label: 'Passport expiry',   value: '02 FEB 2032',     conf: 1.00 },
        visaRequired: { label: 'Visa management',  value: 'NOT REQUIRED - British citizen', conf: 1.00 },
        docsFiled:   { label: 'Documents filed',   value: 'Contract; passport; NI letter', conf: 1.00 },
        bankSort:    { label: 'Bank sort code',    value: '00-00-00',        conf: 1.00 },
        bankAccount: { label: 'Bank account',      value: '00000000',        conf: 1.00 },
        auditTicket: { label: 'Audit ticket',      value: 'AUD0061188',      conf: 1.00 }
      }
    },

    'as-record': {
      label: 'Access Screening - pre-employment check record',
      kind: 'form',
      page: PAGE_A4,
      issuer: 'Access Screening',
      note: 'The four pre-employment checks Serco lists for Access Screening. ' +
            'Note the history requirement is FIVE YEARS OF ADDRESS history - ' +
            'not employment history, which the sources never mention.',
      fields: {
        asRef:        { label: 'AS reference',        value: 'AS-2026-441907',  conf: 1.00 },
        candidate:    { label: 'Candidate',           value: 'Davinder Kaur',   conf: 1.00 },
        linkIssued:   { label: 'Candidate link issued', value: '20 AUG 2026',   conf: 1.00 },
        linkComplete: { label: 'Link completed',      value: '23 AUG 2026',     conf: 1.00 },
        references:   { label: 'Reference checks',    value: '3 years requested', conf: 1.00 },
        addressHist:  { label: 'Address history',     value: '5 years - complete', conf: 1.00 },
        residency:    { label: 'Residency history',   value: 'Complete',        conf: 1.00 },
        screening:    { label: 'Screening questions', value: 'Complete',        conf: 1.00 },
        clearance:    { label: 'Clearance required',  value: 'BS7858 + Enhanced DBS', conf: 1.00 }
      }
    },

    'ohp-outcome': {
      label: 'Occupational health - referral outcome',
      kind: 'form',
      page: PAGE_A4,
      issuer: 'Occupational health provider',
      note: 'Step 1.7 in the onboarding map. The outcome is a fitness ' +
            'statement only - no clinical detail reaches the vetting record.',
      fields: {
        candidate:  { label: 'Candidate',        value: 'Davinder Kaur',       conf: 0.97 },
        referred:   { label: 'Referred',         value: '20 AUG 2026',         conf: 0.97 },
        completed:  { label: 'Assessment completed', value: '28 AUG 2026',     conf: 0.97 },
        outcome:    { label: 'Outcome',          value: 'FIT FOR ROLE',        conf: 0.98 },
        adjustments: { label: 'Adjustments advised', value: 'NONE',            conf: 0.96 },
        ref:        { label: 'OHP reference',    value: 'OHP-0026-11884',      conf: 0.96 }
      }
    },

    'dbs-certificate': {
      label: 'Enhanced DBS certificate',
      kind: 'form',
      page: PAGE_A4,
      issuer: 'Disclosure and Barring Service',
      note: 'Serco names "BPSS, DBS, Enhanced DBS" as the standard checks, with ' +
            'the level dependent on role. The certificate number is fictional.',
      fields: {
        applicant:   { label: 'Applicant',        value: 'Davinder Kaur',   conf: 0.97 },
        certNumber:  { label: 'Certificate number', value: '000000000000',  conf: 0.98 },
        level:       { label: 'Level of check',   value: 'ENHANCED',        conf: 0.98 },
        issued:      { label: 'Date of issue',    value: '11 SEP 2026',     conf: 0.97 },
        convictions: { label: 'Convictions recorded', value: 'SEE CONTINUATION', conf: 0.93 },
        barredList:  { label: 'Barred list check', value: 'NOT ON EITHER LIST', conf: 0.96 },
        position:    { label: 'Position applied for', value: 'Custody Detention Officer', conf: 0.96 }
      }
    },

    'reference-reply': {
      label: 'Employer reference reply',
      kind: 'form',
      page: PAGE_A4,
      issuer: 'Former employer',
      note: 'Serco requires three years of reference history for all contracts ' +
            'except PECS. This reply closes the third year.',
      fields: {
        subject:    { label: 'Subject of reference', value: 'Davinder Kaur',  conf: 0.96 },
        employer:   { label: 'Responding employer',  value: 'Meridian Care Services Ltd', conf: 0.95 },
        jobTitle:   { label: 'Job title held',       value: 'Support Worker', conf: 0.95 },
        from:       { label: 'Employed from',        value: '04 JAN 2023',    conf: 0.95 },
        to:         { label: 'Employed to',          value: '22 AUG 2026',    conf: 0.95 },
        reason:     { label: 'Reason for leaving',   value: 'Resigned - new role', conf: 0.92 },
        reemploy:   { label: 'Would re-employ',      value: 'YES',            conf: 0.94 },
        respondedBy: { label: 'Completed by',        value: 'A. Devlin, HR Manager', conf: 0.93 },
        signature:  { label: 'Signature',            value: null, kind: 'block', conf: 0.84,
                      readAs: 'Present' },
        chased:     { label: 'Chases sent',          value: '2 - replied on the second', conf: 1.00 }
      }
    },

    'evidence-pack': {
      label: 'Evidence pack index - assembled for the vetting officer',
      kind: 'form',
      page: PAGE_A4,
      issuer: 'Serco Agentic Vetting - A8',
      note: 'What A8 hands the officer: the assembled pack, a reasoned ' +
            'recommendation, AND the gaps. It issues no clearance.',
      fields: {
        candidate:   { label: 'Candidate',        value: 'Davinder Kaur',   conf: 1.00 },
        asRef:       { label: 'AS reference',     value: 'AS-2026-441907',  conf: 1.00 },
        clearance:   { label: 'Clearance sought', value: 'BS7858 + Enhanced DBS', conf: 1.00 },
        itemCount:   { label: 'Items in pack',    value: '11',              conf: 1.00 },
        complete:    { label: 'Components complete', value: 'References; DBS; address history; OHP', conf: 1.00 },
        gaps:        { label: 'Open gaps',        value: 'Declared conviction - ER decision outstanding', conf: 1.00 },
        recommend:   { label: 'Recommendation',   value: 'PROCEED SUBJECT TO ER OUTCOME', conf: 1.00 },
        decidedBy:   { label: 'Decision taken by', value: 'Vetting officer - NOT this agent', conf: 1.00 },
        assembled:   { label: 'Pack assembled',   value: '12 SEP 2026 08:30', conf: 1.00 }
      }
    }
  };


  /* ------------------------------------------------------------------- steps
     The candidate's journey down the sourced 1.1-1.8 onboarding spine.

     `agent` must resolve via SVS.Agents.byId() - test/run.js enforces it, so
     this page and the Live simulation cannot disagree about who owns what.
     `decision` must be a key of SVS.Config.state.
     `sla: null` renders as "not stated in source", which is the honest label
     for every step except RTW (2 hours) and the audit (3 days).              */
  var STEPS = [

    { id: 'declare', ref: '1.1', stage: 'Right to Work',
      title: 'Manager declares the document set before submitting',
      agent: 'manager-copilot', doc: 'mgr-declaration',
      highlight: ['manager', 'candidate', 'docsListed', 'statement', 'signature', 'signedDate'],
      sla: null, provenance: 'proposed', citation: '[WS p7]',
      narrative:
        'Nothing like this happens today. The line manager uploads whatever ' +
        'they have and submits; the first person to look properly is in the ' +
        'Vetting and Onboarding team, two hours and one queue later. This step ' +
        'is brainstorm ref 6 from the workshop pack - a mandatory declaration ' +
        'that the documents have been checked and meet the requirements - put ' +
        'in front of submission rather than after it, with A1 resolving the ' +
        'required document set from the role and site first.',
      edgeCases: [
        { name: 'The manager guesses the document list',
          detail: 'Without a decision tree the manager has to know which set of ' +
                  'documents this role and this circumstance require. Serco ' +
                  'measured the result: 6% of the sample did not contain enough ' +
                  'ID to complete the check at all.',
          provenance: 'serco', citation: '[VP p4]' },
        { name: 'The declaration becomes a click-through',
          detail: 'The source names this risk against the acknowledgement ' +
                  'control in its own words. A declaration nobody reads is a ' +
                  'worse outcome than no declaration, because it transfers ' +
                  'blame without improving inputs.',
          provenance: 'serco', citation: '[WS p7]' }
      ],
      rules: [
        { name: 'Required document set resolved', verdict: 'ok',
          detail: 'Custody Detention Officer at a PECS site, British citizen. ' +
                  'Right to work is satisfied by ONE document - a UK passport - ' +
                  'and nothing else is needed to establish it. The NI number is ' +
                  'a separate requirement, for payroll and for the BPSS identity ' +
                  'check, and asking for it must not be confused with asking ' +
                  'for right-to-work evidence. A1 asks the questions; it does ' +
                  'not ask the manager to know the answer.' },
        { name: 'Declaration signed and dated', verdict: 'ok',
          detail: 'Signed 04 AUG 2026, the same day as submission. A declaration ' +
                  'dated after the documents it covers would be rejected here.' },
        { name: 'Serco’s own stated risk, printed not hidden', verdict: 'warn',
          detail: 'The source records the risk against this control verbatim: ' +
                  '"Doesn’t prevent managers from submitting documents with ' +
                  'inadequate validation." A signature is not a check. This is ' +
                  'why the four A2/A3/A4 steps that follow still run in full.',
          citation: '[WS p7]' }
      ],
      decision: 'DONE',
      stays: 'The manager owns the declaration. A1 cannot sign on their behalf, ' +
             'and holds the case rather than guessing when the circumstances ' +
             'fall outside the modelled rule set.' },

    { id: 'split', ref: '1.1', stage: 'Right to Work',
      title: 'One combined PDF arrives and is split into four documents',
      agent: 'doc-intelligence', doc: 'upload-combined',
      highlight: ['filename', 'pageCount', 'uploaded'],
      sla: '2 hours', volume: '876 RTW checks/month', aht: '~5 min',
      provenance: 'serco', citation: '[WS p11]',
      narrative:
        'This is what actually lands: four unrelated documents scanned into a ' +
        'single file called Kaur_docs_scan.pdf. Serco records the problem in ' +
        'its own words - managers send "multiple docs in a combined PDF (needs ' +
        'to be split prior to upload)" - and lists reducing it as an explicit ' +
        'aim. Splitting is mechanical, so a human should never do it.',
      edgeCases: [
        { name: 'Pages duplicated or out of order',
          detail: 'A flatbed scan often repeats a page or interleaves two ' +
                  'documents. Classification has to work per page rather than ' +
                  'assume page order, and a duplicate must be recognised as the ' +
                  'same document rather than counted twice.',
          provenance: 'ours' },
        { name: "Another candidate's document in the file",
          detail: 'A manager onboarding several people attaches the wrong scan. ' +
                  'The names will not reconcile, but the failure has to be read ' +
                  'as a wrong-person error and not as a typing error, because ' +
                  'the correction is completely different.',
          provenance: 'ours' },
        { name: 'The scan is cropped',
          detail: 'A data page photographed at an angle loses part of the ' +
                  'machine-readable zone. That is unverifiable rather than ' +
                  'invalid, and must escalate for a re-scan rather than be ' +
                  'partially parsed.',
          provenance: 'ours' }
      ],
      rules: [
        { name: 'Combined PDF split into discrete documents', verdict: 'ok',
          detail: 'Four pages, four documents: passport data page, driving ' +
                  'licence, HMRC NI letter, bank statement. Each is filed ' +
                  'separately from here on.' },
        { name: 'Legibility and completeness scored per document', verdict: 'ok',
          detail: 'Every page is scored before anything is read from it. Serco’s ' +
                  'own caution is that OCR accuracy varies with document ' +
                  'quality; the answer is a confidence score per field, not a ' +
                  'blanket assumption that the scan was fine.' },
        { name: 'Page count reconciled against the declaration', verdict: 'ok',
          detail: 'The manager declared three documents. Four were found. The ' +
                  'extra one is handled in the next two steps rather than ' +
                  'silently dropped.' }
      ],
      decision: 'DONE',
      stays: 'Unrecognised document types escalate. A2 never guesses a ' +
             'classification it is not confident about.' },

    { id: 'ni', ref: '1.1', stage: 'Right to Work',
      title: 'NI letter classified and the number captured',
      agent: 'doc-intelligence', doc: 'ni-letter',
      highlight: ['recipient', 'niNumber', 'issued', 'address'],
      sla: null, provenance: 'serco', citation: '[WS p4]',
      narrative:
        '"National Insurance documentation" is one of the evidence types Serco ' +
        'names explicitly, and it matters what for. With a UK passport already ' +
        'in hand right to work is established, and this letter adds nothing to ' +
        'it - the NI number is needed for payroll and for the BPSS identity ' +
        'check. A2 reads the number rather than asking anyone to re-type it, ' +
        'which is the whole point: the 13% mismatch defect exists because ' +
        'values are transcribed by hand.',
      edgeCases: [
        { name: 'A birth certificate instead of a passport',
          detail: 'Then the NI letter becomes load-bearing rather than ' +
                  'incidental: a birth certificate is only acceptable evidence ' +
                  'of right to work when it is presented alongside an official ' +
                  'document showing the National Insurance number. Either ' +
                  'document alone is insufficient.',
          provenance: 'ours' },
        { name: 'The NI number is on a payslip rather than an HMRC letter',
          detail: 'Acceptable in principle, but a payslip carries salary data ' +
                  'nobody in vetting needs. The right behaviour is to extract ' +
                  'the number and discard the rest, the way the bank statement ' +
                  'is handled two steps on.',
          provenance: 'ours' }
      ],
      rules: [
        { name: 'Document type recognised', verdict: 'ok',
          detail: 'HMRC NI number confirmation letter. A named, expected type - ' +
                  'and one that WOULD have been load-bearing for right to work ' +
                  'had the candidate presented a birth certificate instead of a ' +
                  'passport, because a birth certificate is only acceptable ' +
                  'alongside an official document showing the NI number.' },
        { name: 'NI number extracted and format-checked', verdict: 'ok',
          detail: 'QQ 12 34 56 C - two prefix letters, six digits, one suffix ' +
                  'letter in A-D. Structurally valid. QQ is a prefix HMRC never ' +
                  'issues, which is deliberate for a specimen.' },
        { name: 'Name and address cross-read against the passport', verdict: 'ok',
          detail: 'Miss D Kaur, 48 Sandford Road, Leicester. Consistent with the ' +
                  'passport surname and given names.' }
      ],
      decision: 'DONE',
      stays: 'Nothing in the happy path. A low-confidence extraction goes to a ' +
             'human rather than into SAP.' },

    { id: 'licence', ref: '1.1', stage: 'Right to Work',
      title: 'Driving licence classified as identity, not right to work',
      agent: 'doc-intelligence', doc: 'licence',
      highlight: ['surname', 'givenNames', 'dob', 'expiry', 'licenceNumber', 'address', 'signature'],
      sla: null, provenance: 'serco', citation: '[VP p4]',
      narrative:
        'A UK driving licence is a perfectly good identity document and is not ' +
        'evidence of a right to work. Serco measured this exact confusion: "3% ' +
        'of sample contained incorrect document types". The useful behaviour is ' +
        'not to reject the file - it is to say precisely what the document does ' +
        'and does not establish, and to keep the part that helps.',
      edgeCases: [
        { name: 'An EXPIRED UK passport is still acceptable',
          detail: 'The most-missed rule in the set. For a British citizen, an ' +
                  'expired UK passport remains valid evidence of right to work - ' +
                  'citizenship does not lapse with the document. Rejecting one ' +
                  'is a false negative that sends a perfectly compliant ' +
                  'submission back round the pushback loop.',
          provenance: 'ours' },
        { name: 'A non-UK national is not a document check at all',
          detail: 'For most non-UK nationals the check is an online share-code ' +
                  'verification against Home Office records, not a scan. Where ' +
                  'leave to remain is time-limited it also sets a follow-up date, ' +
                  'which is a diary obligation the document set cannot express.',
          provenance: 'ours' },
        { name: 'Given and family names swapped',
          detail: 'Common where naming order differs from the Western ' +
                  'convention, and the machine-readable zone makes it ' +
                  'detectable: the surname and given-name fields are delimited, ' +
                  'so a swap is visible rather than guessable. This is a ' +
                  'fairness problem as much as a data one - the people it ' +
                  'affects are not randomly distributed.',
          provenance: 'ours' }
      ],
      rules: [
        { name: 'Classified: UK driving licence (photocard)', verdict: 'ok',
          detail: 'Read to the DVLA field schema - 1 surname, 2 given names, ' +
                  '3 date of birth, 4b expiry, 5 licence number, 8 address.' },
        { name: 'Not accepted as right-to-work evidence', verdict: 'warn',
          detail: 'The sources name passports, birth certificates and NI ' +
                  'documentation. A licence is none of these. It is retained as ' +
                  'identity and address corroboration, and the RTW requirement ' +
                  'is satisfied by the passport instead.',
          citation: '[WS p4]' },
        { name: 'Licence number decoded and cross-checked', verdict: 'ok',
          detail: 'KAUR9953144D99AB is not an opaque string. Characters 1-5 are ' +
                  'the surname padded with 9s; character 6 is the decade of ' +
                  'birth; 7-8 are the month of birth PLUS 50, because the holder ' +
                  'is female; 9-10 the day; 11 the final digit of the year. So ' +
                  '9-53-14-4 decodes to 14 March 1994. That agrees with the ' +
                  'passport and disagrees with what was keyed into PeopleFirst, ' +
                  'which gives the reconciliation step a second independent ' +
                  'reading of the date rather than one document’s word for it.' },
        { name: 'Address captured for the 5-year address history', verdict: 'ok',
          detail: 'Feeds the Access Screening address-history check later in the ' +
                  'route rather than being read once and discarded.' }
      ],
      decision: 'DONE',
      stays: 'Whether a non-standard document is acceptable for a particular ' +
             'contract is a vetting officer’s call, not A2’s.' },

    { id: 'strip', ref: '1.1', stage: 'Right to Work',
      title: 'Bank statement removed before it reaches a human',
      agent: 'doc-intelligence', doc: 'bank-statement',
      highlight: ['accountName', 'sortCode', 'accountNo', 'period', 'balance'],
      sla: null, provenance: 'serco', citation: '[WS p11]',
      narrative:
        'Serco records that the team "currently filters out unrequired ' +
        'documents, e.g. bank statements" - by hand, on every ticket where one ' +
        'turns up. It is not a judgement call and it carries real data-protection ' +
        'weight: nobody in vetting needs to see this person’s balance to ' +
        'establish their right to work.',
      edgeCases: [
        { name: 'The unrequired document is the ONLY one attached',
          detail: 'Stripping it leaves nothing. The step has to distinguish ' +
                  '"this extra document is not needed" from "nothing usable was ' +
                  'submitted", because the second is a pushback and the first ' +
                  'is not.',
          provenance: 'ours' },
        { name: 'The same manager keeps sending them',
          detail: 'A pattern, not an incident. Removing it silently every time ' +
                  'fixes the ticket and hides the cause, which is how a 23% ' +
                  'defect rate stays at 23%.',
          provenance: 'serco', citation: '[WS p11]' }
      ],
      rules: [
        { name: 'Classified: bank statement', verdict: 'ok',
          detail: 'Recognised from the sort code, account number and statement ' +
                  'period, not from the file name.' },
        { name: 'Not a required document - removed from the pack', verdict: 'warn',
          detail: 'Removed before the ticket reaches the Vetting and Onboarding ' +
                  'queue. The manager is told it was not needed, so the next ' +
                  'submission is cleaner.' },
        { name: 'Data minimisation applied', verdict: 'ok',
          detail: 'The balance and transaction detail are never extracted and ' +
                  'never written to SAP. Only the fact that an unrequired ' +
                  'document was submitted is logged, for the input-quality ' +
                  'measure Serco wants.' }
      ],
      decision: 'DONE',
      stays: 'If the same unrequired type keeps arriving from one manager, that ' +
             'is a conversation for a person to have, and A1 surfaces it.' },

    { id: 'idv', ref: '1.1', stage: 'Right to Work',
      title: 'Passport verified - MRZ parsed, assurance level recorded',
      agent: 'id-verify', doc: 'passport',
      highlight: ['passportNo', 'surname', 'givenNames', 'dob', 'expiry', 'photo', 'signature', 'mrz1', 'mrz2'],
      sla: null, provenance: 'ours', citation: null,
      narrative:
        'Serco’s largest measured defect is that 14% of sampled RTW checks ' +
        '"didn’t contain adequate ID verification". The fix the workshop ' +
        'proposed was digital identity verification with an electronic ' +
        'verification stamp. This is that step: the machine-readable zone is ' +
        'parsed and checked against the printed zone, and what could not be ' +
        'verified is recorded as plainly as what could.',
      edgeCases: [
        { name: 'A check digit FAILS',
          detail: 'Different in kind from every mismatch on this page. A failing ' +
                  'check digit means the zone itself is inconsistent - a ' +
                  'tampered or fabricated data page - and it is the one case ' +
                  'that must never be auto-corrected or reconciled away. It ' +
                  'stops, and a person is told why.',
          provenance: 'ours' },
        { name: 'The portrait does not resemble the holder',
          detail: 'Nothing on this page can detect that. A scan has no live ' +
                  'subject to compare against, which is why the assurance level ' +
                  'is MEDIUM and says what it could not verify. Claiming a ' +
                  'likeness check here would be the most dangerous ' +
                  'overstatement available.',
          provenance: 'ours' },
        { name: 'A genuine document that is not machine-readable',
          detail: 'Older passports and some non-UK documents have no usable ' +
                  'zone. The absence of an MRZ is not evidence of forgery, and ' +
                  'the route has to fall back to manual verification rather ' +
                  'than treat unverifiable as failed.',
          provenance: 'ours' }
      ],
      rules: [
        { name: 'MRZ check digits validate', verdict: 'ok',
          detail: 'Document number, date of birth and expiry each carry an ICAO ' +
                  '9303 7-3-1 weighted check digit, plus a composite. All five ' +
                  'recompute correctly, so the zone has not been altered.' },
        { name: 'MRZ agrees with the printed zone', verdict: 'ok',
          detail: 'The surname, given names, document number 500000007, date of ' +
                  'birth and expiry all reappear in the machine-readable zone - ' +
                  'the dates in YYMMDD form, each followed by its own check ' +
                  'digit. A forged data page usually fails here first, because ' +
                  'the two zones have to be edited consistently. (The digits are ' +
                  'not restated here on purpose: prose that repeats machine ' +
                  'values is how this page previously came to assert a licence ' +
                  'number that decoded to month 43. The agreement is proven ' +
                  'mechanically by the build instead.)' },
        { name: 'Portrait present and machine-readable', verdict: 'ok',
          detail: 'Present at sufficient quality to be compared. No comparison is ' +
                  'claimed - this is a scan, and there is nothing to compare it ' +
                  'against.' },
        { name: 'Security features not verifiable from a scan', verdict: 'warn',
          detail: 'No chip read, no ultraviolet, no tactile check. A2 and A3 can ' +
                  'only verify what the artefact supports, so the assurance level ' +
                  'is MEDIUM and says why. This is the honest ceiling on ' +
                  'automating a document check from an uploaded image.' }
      ],
      decision: 'DONE',
      stays: 'Anything below the required assurance level routes to manual ' +
             'verification. A3 emits a level, never a bare pass.' },

    { id: 'stamp', ref: '1.1', stage: 'Right to Work',
      title: 'Verification stamp written to the ticket as an audit record',
      agent: 'id-verify', doc: 'id-stamp',
      highlight: ['document', 'assurance', 'mrzCheck', 'mrzAgrees', 'chipRead', 'features', 'stampRef'],
      sla: null, provenance: 'proposed', citation: '[WS p7]',
      narrative:
        'The workshop asked for "an electronic verification stamp for audit ' +
        'purposes", and noted the risk that it creates a perception that ' +
        'physical validation is no longer required. The stamp is written so that ' +
        'it cannot be read that way: it states its own limits on its face.',
      rules: [
        { name: 'Immutable record on the ServiceNow ticket', verdict: 'ok',
          detail: 'IDV-0084213-A3, timestamped, attached to RTW0084213. A later ' +
                  'auditor can see what was verified, when, by which agent ' +
                  'version, and on what evidence.' },
        { name: 'Records what was NOT verifiable', verdict: 'ok',
          detail: 'Chip: not attempted. Security features: not verifiable from a ' +
                  'scan. A stamp that only recorded successes would be the ' +
                  'perception risk the source warns about.' },
        { name: 'Assurance level carried forward, not discarded', verdict: 'warn',
          detail: 'MEDIUM travels with the case. If the contract later requires ' +
                  'HIGH, the gap is already on the record rather than discovered ' +
                  'at adjudication.' }
      ],
      decision: 'DONE',
      stays: 'The stamp is evidence for a human decision, not a substitute for ' +
             'one.' },

    { id: 'reconcile', ref: '1.1', stage: 'Right to Work',
      title: 'Keyed details reconciled against the evidence - mismatch found',
      agent: 'reconciliation', doc: 'appian-record',
      highlight: ['dob', 'passportNo', 'surname', 'givenNames', 'expiry', 'niNumber', 'ticket'],
      sla: '2 hours', volume: '229 of 1,004 pushed back, May 2026',
      provenance: 'serco', citation: '[VP p4]', exception: 1,
      narrative:
        'This is the step the whole business case turns on. Serco’s job here ' +
        'is to verify "that the details entered in the system align with the ' +
        'supporting evidence", and 13% of the sample failed exactly that. Two ' +
        'fields disagree here, and they disagree in different ways. The date of ' +
        'birth was keyed as 14 MAY 1994 against a passport reading 14 MAR 1994 - ' +
        'MAR to MAY is one keystroke. The passport number was keyed as 500000070 ' +
        'against 500000007 - the last two digits transposed. Careless ' +
        'transcription rarely produces exactly one error, so both go into one ' +
        'question rather than two round trips.',
      edgeCases: [
        { name: 'A name change the documents cannot bridge',
          detail: 'Passport in a maiden name, PeopleFirst in a married one. ' +
                  'Neither is wrong and no correction is proposable - the case ' +
                  'needs a marriage or deed-poll certificate to link them, which ' +
                  'is a request for a new document rather than a data fix.',
          provenance: 'ours' },
        { name: 'The keyed value is right and the document is wrong',
          detail: 'It happens: a mis-issued document, or the wrong document for ' +
                  'the right person. This is exactly why A4 proposes rather than ' +
                  'writes, and why Reject is a real answer on the gate above ' +
                  'rather than a formality.',
          provenance: 'ours' },
        { name: 'Every field disagrees',
          detail: 'Not four corrections - almost certainly the wrong person ' +
                  'entirely. A step that cheerfully proposed a fix for each ' +
                  'field would be confidently wrong; the right response is to ' +
                  'stop and say the record and the evidence do not describe the ' +
                  'same person.',
          provenance: 'ours' }
      ],
      rules: [
        { name: 'Surname, given names, expiry, NI number', verdict: 'ok',
          detail: 'Four fields diffed character by character against the values ' +
                  'extracted from the documents. All four agree, so the ' +
                  'disagreements below are specific rather than a wholesale ' +
                  'mismatch of the wrong person’s record.' },
        { name: 'Date of birth does NOT match', verdict: 'warn',
          detail: 'PeopleFirst: 14 MAY 1994. Passport MRZ and printed zone: ' +
                  '14 MAR 1994. The driving licence independently agrees with the ' +
                  'passport, so two documents say MAR and only the keyed field ' +
                  'says MAY. The evidence is not in doubt; the typing is.',
          citation: '[VP p4]' },
        { name: 'Passport number transposed - and the check digit says which ' +
                'side is wrong', verdict: 'warn',
          detail: 'PeopleFirst: 500000070. Passport: 500000007. On its own that ' +
                  'is just a disagreement. But the machine-readable zone carries ' +
                  'the number followed by its own ICAO check digit, and ' +
                  'recomputing that digit for the keyed 500000070 gives 6 where ' +
                  'the zone reads 2. The composite digit confirms the zone is ' +
                  'intact, so the document is internally consistent and the ' +
                  'typing is not. A4 does not merely report a mismatch here; it ' +
                  'says which side to trust, and shows the arithmetic.' },
        { name: 'Correction proposed, ticket NOT bounced', verdict: 'ok',
          detail: 'Today this closes the ticket incomplete, emails the manager a ' +
                  'list of reasons, and waits - an estimated three-day delay on ' +
                  'each occurrence, whether one field is wrong or four. A4 ' +
                  'instead proposes both specific corrections in a single ' +
                  'question. Nothing else on the ticket is disturbed.',
          citation: '[VP p4]' }
      ],
      decision: 'WAITING_HUMAN',
      humanQuestion:
        'Two corrections proposed. Date of birth: PeopleFirst has 14 MAY 1994, ' +
        'the passport and the licence both read 14 MAR 1994. Passport number: ' +
        'PeopleFirst has 500000070, the passport reads 500000007 and its check ' +
        'digit confirms it. Confirm both?',
      stays: 'A4 proposes; it does not write. A human confirms the correction, ' +
             'because the one thing worse than a typo in a date of birth is an ' +
             'agent silently overwriting a correct one.',
      hitl: {
        askedOf: 'Holly Wright',
        askedOfRole: 'Recruiting Manager — the person who keyed the values',
        why: 'Asked of a named individual, not a queue. One question, and the ' +
             'rest of the ticket left exactly as it was.',
        guard: 'Two field mismatches. A4 refuses to write either value.',
        conflicts: [
          { field: 'Date of birth', keyed: '14 MAY 1994',
            keyedFrom: 'PeopleFirst (Appian)', proposed: '14 MAR 1994',
            evidence: [
              { doc: 'passport', value: '14 MAR 1994' },
              { doc: 'licence', value: '14.03.1994' }
            ],
            note: 'Two documents agree against one keyed field.' },
          { field: 'Passport number', keyed: '500000070',
            keyedFrom: 'PeopleFirst (Appian)', proposed: '500000007',
            evidence: [
              { doc: 'passport', value: '500000007' }
            ],
            note: 'The MRZ check digit confirms the document, not the keying.' }
        ],
        answers: [
          { id: 'confirm', label: 'Confirm both corrections', kind: 'resume',
            outcome: 'A4 writes the two corrected values and the case resumes. ' +
                     'The RTW ticket is never closed incomplete, so the manager ' +
                     'is not waiting three days for a round trip.',
            downstream: null,
            log: [
              { kind: 'human', text: 'H. Wright confirmed both corrections' },
              { kind: 'resume', text: 'Case resumed — corrected values carried ' +
                'forward to the SAP write' }
            ] },
          { id: 'reject', label: 'Reject — the keyed values are right',
            kind: 'reject',
            outcome: 'A4 does not write. The disagreement now needs a person to ' +
                     'resolve it against the documents, because two documents ' +
                     'and a check digit say otherwise. This is the path that ' +
                     'costs the estimated three days today.',
            downstream: 'The correction was rejected at step 8, so no verified ' +
                        'date of birth or passport number exists to write. A9 ' +
                        'will not file values that three pieces of evidence ' +
                        'contradict.',
            log: [
              { kind: 'human', text: 'H. Wright rejected the proposed corrections' },
              { kind: 'escalate', text: 'Referred back — documents and keyed ' +
                'values still disagree' }
            ] },
          { id: 'refer', label: 'Refer to the vetting officer', kind: 'escalate',
            outcome: 'Out of the manager' + '’s hands and onto the officer' + '’s. ' +
                     'Legitimate, and the right answer if the manager believes ' +
                     'the documents themselves are suspect.',
            downstream: 'Referred to the vetting officer at step 8. The audit ' +
                        'waits on that decision rather than assuming it.',
            log: [
              { kind: 'human', text: 'H. Wright referred the case to the vetting officer' },
              { kind: 'escalate', text: 'Escalated — awaiting officer decision' }
            ] }
        ]
      },
      impact:
        'This single behaviour is the mechanism behind Serco’s own target of ' +
        'reducing returned RTW tickets from 23% to 10%, and the 11.5 hours a ' +
        'month of avoidable re-work recorded on the A3.' },

    { id: 'contract', ref: '1.2-1.4', stage: 'Contract',
      title: 'Contract approved, issued and signed on DocuSign',
      agent: 'records', doc: 'contract',
      highlight: ['employee', 'role', 'startDate', 'signedBy', 'signature', 'signedDate', 'envelope'],
      sla: null, provenance: 'serco', citation: '[WS p10]',
      narrative:
        'Steps 1.2 to 1.4 run across three other lanes - HRD and budget holder ' +
        'approve salary and terms, the line manager reviews and submits, the ' +
        'candidate signs. The vetting agents do not drive any of it. What matters ' +
        'here is that signature on DocuSign is the event that generates the ' +
        'onboarding audit ticket.',
      rules: [
        { name: 'Signature event captured', verdict: 'ok',
          detail: 'Envelope DS-8F2C-0000-4419 completed 19 AUG 2026 18:44. The ' +
                  'audit ticket AUD0061188 is raised from this, not from a person ' +
                  'noticing.' },
        { name: 'Declarations captured as structured fields', verdict: 'ok',
          detail: 'P45 attached, disability, criminal convictions and veteran ' +
                  'status are read off the signed contract as four values rather ' +
                  'than as prose to be re-read later. Every follow-on action in ' +
                  'the audit branches off these four.' },
        { name: 'Approval chain intact', verdict: 'ok',
          detail: 'Salary and terms approved before issue. A9 files; it does not ' +
                  'approve.' }
      ],
      decision: 'DONE',
      stays: 'Contract approval is a budget-holder decision and stays entirely ' +
             'outside the agent fleet.' },

    { id: 'sap', ref: '1.5', stage: 'Onboarding audit',
      title: 'Documents filed to SAP and passport details written',
      agent: 'records', doc: 'sap-record',
      /* This step writes the corrected values, so it cannot run until the
         correction at step 8 has actually been confirmed by a person. Before
         that it renders blocked - which is the honest demonstration that the
         gate gates, rather than prose claiming that it does. */
      /* `affects` names the fields whose values exist ONLY because a human
         approved the correction. While the gate is unresolved those rows must
         not display the approved values as though they had been extracted. */
      dependsOn: { step: 'reconcile', answer: 'confirm',
                   affects: ['dob', 'passportNo'] },
      blocked: 'Nothing has been confirmed at step 8 yet, so there is no ' +
               'verified date of birth or passport number to write. A9 will not ' +
               'file values a human has not approved, and will not quietly fall ' +
               'back to the keyed ones.',
      highlight: ['personnelNo', 'name', 'dob', 'passportNo', 'expiry', 'visaRequired', 'docsFiled'],
      sla: '3 days', volume: '643 audits/month', lead: '7.2 days actual',
      provenance: 'serco', citation: '[WS p9]',
      narrative:
        'The audit has a three-day SLA and takes 7.2 days. Most of it is typing: ' +
        'check the contract against SAP, upload the contract and RTW documents, ' +
        'add the passport number and expiry, and keep the visa register. A9 does ' +
        'the filing and the writing, using values that were extracted once and ' +
        'confirmed once.',
      rules: [
        { name: 'Contract checked against the SAP record', verdict: 'ok',
          detail: 'Name, date of birth, address and bank details compared, which ' +
                  'is the check the source specifies. The date of birth reads ' +
                  '14 MAR 1994 and the passport number 500000007 - both because ' +
                  'a named person confirmed those corrections at step 8, not ' +
                  'because an agent decided to prefer the document. Carried ' +
                  'through rather than re-typed.',
          citation: '[WS p10]' },
        { name: 'Visa management gateway evaluated - not required', verdict: 'ok',
          detail: 'British citizen on a UK passport, so the branch is not taken. ' +
                  'Shown rather than hidden: most audit gateways are skipped for ' +
                  'any given candidate, and the visa register is the one Serco ' +
                  'currently keeps in Excel.' },
        { name: 'Evidence filed where it belongs', verdict: 'ok',
          detail: 'Contract, passport and NI letter into SAP. The bank statement ' +
                  'is not there, because it was removed five steps ago.' }
      ],
      decision: 'DONE',
      stays: 'Non-standard documents escalate rather than being force-filed.' },

    { id: 'p45', ref: '1.5', stage: 'Onboarding audit',
      title: 'P45 present - payroll ticket raised automatically',
      agent: 'follow-on', doc: 'p45',
      highlight: ['employee', 'niNumber', 'leaving', 'taxCode', 'payToDate', 'taxToDate'],
      sla: null, volume: '193 payroll tickets/month',
      provenance: 'serco', citation: '[VP p5]',
      narrative:
        'The first of the audit’s four follow-on gateways. A P45 is attached, ' +
        'so a ServiceNow ticket goes to Payroll - 193 times a month, about five ' +
        'minutes each. Across all four gateways that is 326 tickets and 27 hours ' +
        'a month of pure routing.',
      rules: [
        { name: 'P45 detected and read', verdict: 'ok',
          detail: 'Tax code 1257L, pay and tax to date, leaving date 22 AUG 2026. ' +
                  'NI number agrees with the HMRC letter read at step 3.' },
        { name: 'Payroll ticket raised with the values attached', verdict: 'ok',
          detail: 'Payroll receives the figures rather than a request to go and ' +
                  'find the P45. The routing and the transcription are the two ' +
                  'things being removed here.' },
        { name: 'Start and leaving dates consistent', verdict: 'ok',
          detail: 'Leaves 22 AUG, starts 01 SEP. No overlap to query.' }
      ],
      decision: 'DONE',
      stays: 'None in the happy path. Setup failures escalate.' },

    { id: 'conviction', ref: '1.5', stage: 'Onboarding audit',
      title: 'Conviction declared - routing blocked, decision handed to a human',
      agent: 'follow-on', doc: 'contract',
      highlight: ['convictions', 'disability', 'veteran', 'p45', 'employee', 'role'],
      sla: null, volume: '43 conviction cases/month',
      provenance: 'serco', citation: '[VP p5]', exception: 2,
      narrative:
        'The candidate declared a criminal conviction on the signed contract. ' +
        'Serco sees 43 of these a month, and the standing process is to raise a ' +
        'ServiceNow ticket to Employment Relations. Here the agent does the ' +
        'opposite of the obvious thing, twice over - and both refusals are ' +
        'correct.',
      edgeCases: [
        { name: 'Whether the role "sits within ER" is undefined',
          detail: 'The confidentiality rule depends on this test, and the source ' +
                  'states the rule without stating how the condition is ' +
                  'evaluated. Until it is defined, this step cannot route ' +
                  'automatically even in the cases where routing would be safe.',
          provenance: 'serco', citation: '[VP p5]' },
        { name: 'Declared but not disclosed, or disclosed but not declared',
          detail: 'Here the contract declaration and the DBS certificate agree. ' +
                  'When they do not, that discrepancy is itself the finding, and ' +
                  'it is a matter for a person - not something to be resolved by ' +
                  'preferring whichever source is more convenient.',
          provenance: 'ours' },
        { name: 'The declaration is ambiguous',
          detail: 'A free-text answer that neither clearly declares nor clearly ' +
                  'denies. Reading it as NO is the dangerous default, so an ' +
                  'unparseable answer has to be treated as a declaration for ' +
                  'routing purposes and clarified by a person.',
          provenance: 'ours' }
      ],
      rules: [
        { name: 'Declaration detected', verdict: 'ok',
          detail: 'Read as a structured value from the signed contract, alongside ' +
                  'the disability and veteran declarations, which are both NO and ' +
                  'raise nothing.' },
        { name: 'HALT - a declared conviction is not an agent decision', verdict: 'warn',
          detail: 'A10 stops. It does not assess the conviction, weigh it against ' +
                  'the role, or pre-judge the outcome. A declared conviction halts ' +
                  'here for a human decision before anything is routed.' },
        { name: 'ER confidentiality guard BLOCKS the default route', verdict: 'warn',
          detail: 'The obvious action is a ServiceNow ticket to Employment ' +
                  'Relations. The rule Serco records is explicit: "If the role ' +
                  'sits within ER, it MUST NOT be sent via ticket to ER team as ' +
                  'it will be visible to all ER team." The guard fires, the ' +
                  'default route is refused, and the case goes to a named ' +
                  'individual instead of a shared queue.' },
        { name: 'Article 10 data handling applied', verdict: 'ok',
          detail: 'Criminal-offence data is special category. It is not written ' +
                  'to the general vetting record, not included in the chase ' +
                  'correspondence, and not visible to the line manager.' }
      ],
      decision: 'ESCALATED',
      humanQuestion:
        'Conviction declared and the role may sit within ER. Confirm the named ' +
        'recipient before anything is routed - do not raise to the shared ER ' +
        'queue.',
      stays: 'Everything. The conviction is assessed by a person, the recipient ' +
             'is chosen by a person, and the employment decision is a person’s.',
      hitl: {
        askedOf: 'Claire Edwards',
        askedOfRole: 'VOB Operations Manager — a named recipient, deliberately ' +
                     'NOT the shared ER queue',
        why: 'The default route would make special-category data visible to a ' +
             'whole team. The guard refuses it, so the recipient has to be ' +
             'chosen by a person who can be accountable for the choice.',
        guard: 'Conviction declared. The standard ServiceNow route to ER is ' +
               'blocked by the confidentiality rule.',
        conflicts: [
          { field: 'Criminal conviction declared', keyed: 'YES',
            keyedFrom: 'Signed contract (DocuSign)', proposed: null,
            evidence: [
              { doc: 'contract', value: 'YES' },
              { doc: 'dbs-certificate', value: 'SEE CONTINUATION' }
            ],
            note: 'Declaration and disclosure agree. Nothing here is in doubt ' +
                  '— what needs deciding is who may see it.' }
        ],
        answers: [
          { id: 'named', label: 'Route to a named recipient', kind: 'resume',
            outcome: 'Goes to one accountable individual. The shared ER queue is ' +
                     'never used, and the routing decision is logged against the ' +
                     'person who made it.',
            downstream: null,
            log: [
              { kind: 'human', text: 'C. Edwards accepted the case as named recipient' },
              { kind: 'resume', text: 'Routed to one individual — shared ER queue ' +
                'not used' }
            ] },
          { id: 'officer', label: 'Escalate to the vetting officer', kind: 'escalate',
            outcome: 'Further up rather than sideways. Appropriate where the role ' +
                     'itself sits within ER and no operational manager is a safe ' +
                     'recipient.',
            downstream: null,
            log: [
              { kind: 'human', text: 'C. Edwards escalated to the vetting officer' },
              { kind: 'escalate', text: 'Escalated — no operational recipient is ' +
                'safe for this role' }
            ] }
        ],
        noAutoRelease: 'This hold has no auto-release. A timer may nudge a ' +
                       'stalled data correction; it must never release a ' +
                       'special-category decision.'
      },
      impact:
        'The most persuasive thing the fleet does here is refuse to act. An agent ' +
        'that raised the standard ER ticket would be following the documented ' +
        'process and causing a confidentiality breach.' },

    { id: 'setup', ref: '1.6 / 1.8', stage: 'Vetting setup',
      title: 'Access Screening set up and BS7858 clearance initiated',
      agent: 'screening-setup', doc: 'as-record',
      highlight: ['asRef', 'linkIssued', 'linkComplete', 'references', 'addressHist', 'residency', 'screening', 'clearance'],
      sla: null, provenance: 'serco', citation: '[VP p3]',
      narrative:
        'The Direct Vetting team creates the Access Screening record, issues the ' +
        'candidate link, and sets up the checks. Serco lists four pre-employment ' +
        'checks on Access Screening, and the history requirement is worth reading ' +
        'carefully: it is five years of ADDRESS history. Neither source mentions ' +
        'an employment-gap rule at all.',
      rules: [
        { name: 'AS record created and reference written back', verdict: 'ok',
          detail: 'AS-2026-441907 written back to the ServiceNow ticket - the ' +
                  'step that currently lives in an offline Excel tracker on the ' +
                  'specialist route.' },
        { name: 'Four pre-employment checks initiated', verdict: 'ok',
          detail: 'Reference checks, 5-year address history, residency history ' +
                  'and screening questions. The address history is already ' +
                  'partly populated from the licence and NI letter.' },
        { name: 'Clearance type resolved from role and contract', verdict: 'ok',
          detail: 'BS7858 plus Enhanced DBS. Serco’s standard set is "BPSS, ' +
                  'DBS, Enhanced DBS", with the level dependent on role, and the ' +
                  'BS7858 requirement is flagged by the HRC reference on the RTW ' +
                  'ticket.' },
        { name: 'Candidate link completed without chasing', verdict: 'ok',
          detail: 'Issued 20 AUG, completed 23 AUG. No chase needed on this one, ' +
                  'which is not the common case.' }
      ],
      decision: 'DONE',
      stays: 'A vetting officer confirms the clearance type where the contract ' +
             'rules are ambiguous.' },

    { id: 'ohp', ref: '1.7', stage: 'Vetting setup',
      title: 'Occupational health triggered and the outcome chased',
      agent: 'progress-chase', doc: 'ohp-outcome',
      highlight: ['referred', 'completed', 'outcome', 'adjustments', 'ref'],
      sla: null, provenance: 'serco', citation: '[VP p2]',
      narrative:
        'Step 1.7. The referral is triggered on setup and the candidate completes ' +
        'the assessment. The only thing that reaches the vetting record is a ' +
        'fitness statement - no clinical detail, because none of it is the ' +
        'vetting team’s business.',
      rules: [
        { name: 'Referral triggered on setup, not on a reminder', verdict: 'ok',
          detail: 'Referred the same day the AS link was issued. Serco lists ' +
                  '"trigger occupational health" as an automation opportunity on ' +
                  'its own process map.' },
        { name: 'Outcome polled, not waited on', verdict: 'ok',
          detail: 'Completed 28 AUG. The provider does not notify, so the ' +
                  'alternative is a person remembering to look.' },
        { name: 'Clinical detail excluded from the vetting record', verdict: 'ok',
          detail: 'FIT FOR ROLE, no adjustments advised. Health data is special ' +
                  'category and the outcome is the only part that belongs here.' }
      ],
      decision: 'DONE',
      stays: 'Any adjustment recommendation goes to the line manager through ' +
             'occupational health, not through the vetting ticket.' },

    { id: 'reference', ref: 'Check & Progress', stage: 'Check & progress',
      title: 'Third reference chased and returned',
      agent: 'progress-chase', doc: 'reference-reply',
      highlight: ['subject', 'employer', 'jobTitle', 'from', 'to', 'reemploy', 'signature', 'chased'],
      sla: null, provenance: 'serco', citation: '[VP p3]',
      narrative:
        'Serco requires three years of reference history for every contract ' +
        'except PECS, which needs six months. This reply closes the third year, ' +
        'and it took two chases to arrive - which is the ordinary case, and the ' +
        'reason chasing is worth automating.',
      rules: [
        { name: 'Three-year reference history satisfied', verdict: 'ok',
          detail: 'Meridian Care Services, 04 JAN 2023 to 22 AUG 2026, covers the ' +
                  'required window continuously.' },
        { name: 'Dates corroborate the P45', verdict: 'ok',
          detail: 'Leaving date 22 AUG 2026 matches the P45 read at the audit ' +
                  'step. Two independent documents agreeing is worth more than ' +
                  'either alone.' },
        { name: 'Chased twice, escalation not needed', verdict: 'ok',
          detail: 'Serco already automates chaser emails apart from certain ' +
                  'escalation triggers. Persistent non-response escalates to the ' +
                  'vetting officer and the line manager rather than looping.' }
      ],
      decision: 'DONE',
      stays: 'A reference that comes back qualified or refused is read by a ' +
             'person, not scored by an agent.' },

    { id: 'dbs', ref: 'Check & Progress', stage: 'Check & progress',
      title: 'Enhanced DBS certificate returned',
      agent: 'progress-chase', doc: 'dbs-certificate',
      highlight: ['applicant', 'certNumber', 'level', 'issued', 'convictions', 'barredList'],
      sla: null, provenance: 'serco', citation: '[VP p3]',
      narrative:
        'The Enhanced DBS comes back and it is not blank - the certificate ' +
        'refers to a continuation sheet, consistent with the conviction declared ' +
        'on the contract. The agent’s job is to notice that the two agree, ' +
        'file the certificate, and stop.',
      rules: [
        { name: 'Certificate received and matched to the case', verdict: 'ok',
          detail: 'Enhanced level, issued 11 SEP 2026, applicant and position ' +
                  'both match the case.' },
        { name: 'Consistent with the self-declaration', verdict: 'ok',
          detail: 'A conviction was declared on the contract and the certificate ' +
                  'carries content. Declaration and disclosure agreeing is itself ' +
                  'a meaningful finding - a blank certificate against a declared ' +
                  'conviction, or the reverse, would be the thing to flag.' },
        { name: 'Content NOT assessed', verdict: 'warn',
          detail: 'A6 files the certificate and records that content is present. ' +
                  'It does not read the continuation sheet, weigh the offence, or ' +
                  'form a view on suitability.' },
        { name: 'Barred list check recorded', verdict: 'ok',
          detail: 'Not on either barred list. Recorded as a discrete fact because ' +
                  'it is a discrete question.' }
      ],
      decision: 'DONE',
      stays: 'The entire assessment of disclosed content. This is exactly where ' +
             'an agent that tried to be helpful would do harm.' },

    { id: 'adjudicate', ref: 'Adjudication', stage: 'Adjudication',
      title: 'Evidence pack assembled with a recommendation and the gaps',
      agent: 'adjudication', doc: 'evidence-pack',
      highlight: ['clearance', 'itemCount', 'complete', 'gaps', 'recommend', 'decidedBy'],
      sla: null, provenance: 'ours', citation: null,
      narrative:
        'The last step, and the one with the firmest boundary. A8 assembles the ' +
        'Check and Progress evidence pack, sets out what is complete and what is ' +
        'not, and hands the vetting officer a reasoned recommendation. It issues ' +
        'no clearance. The recommendation is explicitly conditional, because the ' +
        'ER decision from step 12 has not come back.',
      rules: [
        { name: 'Pack assembled - 11 items, every one traceable', verdict: 'ok',
          detail: 'Each item links to the document it came from, the agent that ' +
                  'handled it, the confidence, and the human confirmations along ' +
                  'the way. The correction at the reconciliation step is on the ' +
                  'record, not silently applied.' },
        { name: 'Gaps stated as prominently as the completions', verdict: 'warn',
          detail: 'One open gap: the declared conviction, with the ER decision ' +
                  'outstanding. A pack that led with "all checks complete" and ' +
                  'buried this would be worse than no pack.' },
        { name: 'Recommendation is conditional and says on what', verdict: 'ok',
          detail: 'PROCEED SUBJECT TO ER OUTCOME. The officer can disagree with ' +
                  'the recommendation without having to reassemble the evidence.' },
        { name: 'No autonomous clearance - ever', verdict: 'ok',
          detail: 'The delivery sequence gates this wave on officer agreement ' +
                  'rate and zero autonomous clearances. A8 cannot grant, refuse ' +
                  'or vary a clearance, and no configuration lets it.' }
      ],
      decision: 'DONE',
      stays: 'The clearance decision, in full. A8 prepares it and nothing more.' }
  ];


  /* ------------------------------------------------- acceptability
     From Acceptable-Documents-Guide.pdf, produced by Kev Sambor on behalf of
     Serco, updated July 2026. Extracted verbatim to
     process/acceptable-documents.txt.

     Every verdict below quotes the clause it rests on, and test/run.js asserts
     each quote still appears in that extracted text - so nothing here can
     drift away from the guide.

     The distinction the whole guide turns on, and the one the walkthrough was
     previously blurring: Right to Work evidence and screening/vetting ID are
     DIFFERENT LISTS for DIFFERENT PURPOSES. A document can be perfectly
     acceptable for one and inadmissible for the other.                     */
  var ACCEPTABILITY = {
    citation: '[ADG p1-p3]',
    author: 'Produced by Kev Sambor on behalf of Serco. Updated July 2026.',
    selfCaveat: 'Review against current Home Office/DBS guidance before use.',
    keyDistinction:
      'RTW evidence is separate from additional screening/vetting ID.',
    keyDistinctionPage: 1,

    purposes: [
      { id: 'rtw', name: 'Right to Work',
        note: 'Establishes that the person may legally work. Driven by ' +
              'nationality and status, not by how many ID documents they own.' },
      { id: 'vetting', name: 'Screening / vetting ID',
        note: 'Establishes who the person is, for BPSS, DBS and BS7858. Built ' +
              'from a combination across three groups, and explicitly NOT a ' +
              'substitute for a right-to-work check.' }
    ],

    /* Section 4 - the route combinations for screening/vetting ID */
    routes: [
      { id: 'route1', name: 'Route 1 - use wherever possible',
        need: '1 document from Group 1 + 2 further documents from Group 1, 2a or 2b.',
        also: 'At least one document should confirm current address and the ' +
              'combination must confirm name and date of birth.',
        page: 2 },
      { id: 'route2', name: 'Route 2 - only if no Group 1 document',
        need: '1 document from Group 2a + 2 further documents from Group 2a or 2b.',
        also: 'At least one document should confirm current address. VOB/DBS ' +
              'may also require external ID verification.',
        page: 2 },
      { id: 'route3', name: 'Route 3 - exception only',
        need: 'Birth certificate issued more than 12 months after birth + 1 ' +
              'document from Group 2a + 3 further documents from Group 2a or 2b.',
        also: 'Escalate before using Route 3.',
        page: 2 }
    ],

    /* Section 3 (p3) - the consolidated table, summarised to the entries the
       walkthrough actually touches. The full list is in the extracted text. */
    groups: [
      { id: 'g1', name: 'Group 1 - primary identity documents',
        examples: ['Passport', 'eVisa accessed via View and Prove service',
                   'Biometric Residence Permit (BRP)',
                   'Current driving licence photocard - full or provisional - UK, Isle of Man or Channel Islands',
                   'Birth certificate issued within 12 months of birth'],
        note: 'A UK passport may be expired by up to six months, but for DBS ID ' +
              'checking only - never for right to work.',
        page: 3 },
      { id: 'g2a', name: 'Group 2a - trusted government documents',
        examples: ['Birth certificate issued more than 12 months after time of birth',
                   'Marriage or civil partnership certificate - UK or Channel Islands',
                   'Immigration document, visa or work permit',
                   'HM Forces ID card or HM Armed Forces Veteran card - UK'],
        note: 'Check for photo tampering, amendments and consistency with the ' +
              'application form.',
        page: 3 },
      { id: 'g2b', name: 'Group 2b - financial and social history documents',
        examples: ['Utility bill - UK - gas/electric/water - issued in last 3 months',
                   'Bank/building society statement - UK/Channel Islands - issued in last 3 months',
                   'Council Tax statement - UK/Channel Islands - issued in last 12 months',
                   'P45 or P60 - UK/Channel Islands - issued in last 12 months'],
        note: 'Validity windows are short and strictly applied. Several entries ' +
              'carry explicit exclusions - online print-offs, mobile phone bills.',
        page: 3 }
    ],

    /* Section 1 - quality standards that reject a document regardless of type */
    quality: [
      { name: 'Full image',
        clause: 'All four corners must be visible. Do not accept cropped images, only the photo page of a passport, or missing pages that show restrictions/endorsements.',
        page: 1 },
      { name: 'Separate evidence',
        clause: 'Each ID document must be uploaded separately and show full verification/certification details on the relevant page.',
        page: 1 },
      { name: 'Certification date',
        clause: 'Document certification should normally be within 6 months. A GOV.UK share code/eVisa check must be current; share codes expire after 90 days.',
        page: 1 },
      { name: 'Name accuracy',
        clause: 'The name spelling on the PF/offer form must match the passport or primary ID.',
        page: 1 },
      { name: 'Photo likeness',
        clause: 'The checker must confirm that the photograph on the document, IDVT report or GOV.UK result matches the person presenting for work.',
        page: 1 }
    ],

    /* Section 3 (p2) - the exact certification wording the guide mandates */
    certification: [
      { route: 'GOV.UK share code / eVisa',
        wording: 'Confirmation photo matches the candidate - [name], [date]',
        page: 2 },
      { route: 'Physical original-document check',
        wording: 'Check of ORIGINAL document performed on [date] by [full name]',
        page: 2 },
      { route: 'Video check for supporting/vetting ID',
        wording: 'Live video check of document undertaken on [date] by [full name]',
        page: 2 }
    ],

    /* ---------------------------------------------------------- probes
       "What if I send a gas bill?" - the question a hiring manager actually
       asks, and the one the walkthrough could not answer.

       Each probe is a document a manager might plausibly upload, with a
       verdict PER PURPOSE, because the honest answer to almost all of these is
       "acceptable for one thing and not the other". Every verdict quotes the
       clause it rests on; test/run.js checks those quotes against the
       extracted guide.                                                     */
    probes: [
      { id: 'gas-bill', label: 'Gas bill, paper copy, issued six weeks ago',
        asked: 'The manager has a recent gas bill and no other proof of address.',
        rtw: { verdict: 'rejected',
               why: 'Not RTW evidence in any combination. Right to work is ' +
                    'established by nationality and status, and a utility bill ' +
                    'evidences neither.',
               clause: 'RTW evidence is separate from additional screening/vetting ID.',
               page: 1 },
        vetting: { verdict: 'accepted', group: 'Group 2b',
                   why: 'Acceptable, and useful: it is one of the few documents ' +
                        'that confirms current address, which every route requires.',
                   clause: 'Utility bill - UK - gas/electric/water - issued in last 3 months',
                   page: 3 },
        consequence:
          'A2 classifies it, files it against the vetting ID route rather than ' +
          'the RTW check, and notes that it satisfies the current-address ' +
          'requirement. Nothing is pushed back.',
        remedy: null },

      { id: 'gas-bill-online', label: 'Gas bill printed from the online account',
        asked: 'Same bill, but downloaded from the energy supplier portal.',
        rtw: { verdict: 'rejected',
               why: 'Still not RTW evidence.',
               clause: 'RTW evidence is separate from additional screening/vetting ID.',
               page: 1 },
        vetting: { verdict: 'rejected',
                   why: 'Excluded explicitly. The exclusion is about provenance, ' +
                        'not legibility - a perfectly clear PDF is still refused.',
                   clause: 'Utility bills must not be mobile phone bills and should not be printed from an online account.',
                   page: 3 },
        consequence:
          'A2 rejects it before the ticket reaches the Vetting and Onboarding ' +
          'queue and tells the manager which clause it failed, so the ' +
          're-request is specific rather than "documents not acceptable".',
        remedy: 'Ask for a posted paper bill dated within the last three ' +
                'months, or substitute a Council Tax statement, which is ' +
                'accepted within twelve.' },

      { id: 'gas-bill-stale', label: 'Gas bill issued eight months ago',
        asked: 'A paper bill, but an old one.',
        rtw: { verdict: 'rejected',
               why: 'Not RTW evidence regardless of date.',
               clause: 'RTW evidence is separate from additional screening/vetting ID.',
               page: 1 },
        vetting: { verdict: 'rejected',
                   why: 'Outside the three-month window. The validity period is ' +
                        'part of the document type, not a guideline.',
                   clause: 'Do not accept documents outside the listed validity period; request replacement evidence.',
                   page: 3 },
        consequence:
          'A2 computes the age from the bill date rather than trusting a ' +
          'checkbox, and rejects with the date it read and the window it ' +
          'breached.',
        remedy: 'Request a bill from the last three months, or a Council Tax ' +
                'or benefit statement, both of which allow twelve months.' },

      { id: 'mobile-bill', label: 'Mobile phone bill',
        asked: 'The candidate offers a phone bill as proof of address.',
        rtw: { verdict: 'rejected',
               why: 'Not RTW evidence, and no combination of address documents ' +
                    'ever becomes RTW evidence. The two lists do not overlap ' +
                    'at this end.',
               clause: 'RTW evidence is separate from additional screening/vetting ID.',
               page: 1 },
        vetting: { verdict: 'rejected',
                   why: 'Named as an exclusion. A mobile bill is not a utility ' +
                        'bill for these purposes, however recent it is.',
                   clause: 'Utility bills must not be mobile phone bills and should not be printed from an online account.',
                   page: 3 },
        consequence:
          'Rejected at upload. This is the single most common well-intentioned ' +
          'wrong answer, which is why A1 offers the accepted alternatives ' +
          'rather than just refusing.',
        remedy: 'Gas, electric or water within three months; or Council Tax, ' +
                'a financial statement or a benefit statement within twelve.' },

      { id: 'licence-photocard', label: 'UK driving licence photocard',
        asked: 'The document this candidate actually submitted.',
        rtw: { verdict: 'rejected',
               why: 'A licence never establishes right to work. The RTW table ' +
                    'is built from passports, birth certificates with NI ' +
                    'evidence, and online share-code checks.',
               clause: 'RTW evidence is separate from additional screening/vetting ID.',
               page: 1 },
        vetting: { verdict: 'accepted', group: 'Group 1',
                   why: 'Not a consolation prize - a photocard licence is a ' +
                        'PRIMARY identity document, which is what makes Route 1 ' +
                        'available at all.',
                   clause: 'Current driving licence photocard - full or provisional - UK, Isle of Man or Channel Islands',
                   page: 3 },
        consequence:
          'A2 routes it to the vetting ID pack as a Group 1 document and ' +
          'records that it does not count towards RTW. The candidate is not ' +
          'asked for it twice.',
        remedy: null },

      { id: 'licence-paper', label: 'Paper counterpart to a photocard licence',
        asked: 'The manager uploads both halves of an older licence.',
        rtw: { verdict: 'rejected',
               why: 'Neither half of a driving licence establishes right to ' +
                    'work, so the counterpart adds nothing to a check it could ' +
                    'not have satisfied anyway.',
               clause: 'RTW evidence is separate from additional screening/vetting ID.',
               page: 1 },
        vetting: { verdict: 'rejected',
                   why: 'The counterpart was abolished and is not acceptable. ' +
                        'The photocard itself remains Group 1.',
                   clause: 'paper counterpart to photocard is not valid',
                   page: 3 },
        consequence:
          'A2 keeps the photocard, discards the counterpart, and does not treat ' +
          'the pair as two documents towards the route count - which is the ' +
          'error a human in a hurry makes.',
        remedy: 'No action needed: the photocard alone is the Group 1 document.' },

      { id: 'expired-passport', label: 'Expired UK passport',
        asked: 'A British citizen whose passport lapsed last year.',
        rtw: { verdict: 'conditional',
               why: 'Acceptable, but only down one specific route - the original ' +
                    'must be seen in person. The remote digital route is closed ' +
                    'for expired documents, which is the part most often missed.',
               clause: 'Check the original in the presence of the holder and certify the copy. IDVT is not available for expired passports.',
               page: 1 },
        vetting: { verdict: 'conditional', group: 'Group 1',
                   why: 'Group 1, but with a much tighter expiry tolerance than ' +
                        'the RTW route allows, and only for DBS purposes.',
                   clause: 'UK passport can be expired up to a maximum of 6 months for DBS ID checking only.',
                   page: 3 },
        consequence:
          'A2 flags two different clocks on one document: unlimited for RTW via ' +
          'a physical check, six months for DBS ID. A step that applied one ' +
          'expiry rule to the whole document would be wrong in both directions.',
        remedy: 'Arrange a physical original-document check and certify with ' +
                'the mandated wording. Do not request an IDVT.' },

      { id: 'bank-statement', label: 'UK bank statement, issued last month',
        asked: 'The fourth document in this candidate’s upload.',
        rtw: { verdict: 'rejected',
               why: 'Not RTW evidence - which is why Serco records the team ' +
                    'stripping these out of RTW submissions by hand.',
               clause: 'RTW evidence is separate from additional screening/vetting ID.',
               page: 1 },
        vetting: { verdict: 'accepted', group: 'Group 2b',
                   why: 'Acceptable within three months. So discarding it ' +
                        'outright is the wrong instinct: it is not needed NOW, ' +
                        'but it is needed two steps later.',
                   clause: 'Bank/building society statement - UK/Channel Islands - issued in last 3 months',
                   page: 3 },
        consequence:
          'A2 removes it from the RTW pack and RETAINS it for the vetting ID ' +
          'route, minimising what it extracts - the balance and transactions ' +
          'are never read.',
        remedy: null },

      { id: 'p45-online', label: 'P45 printed from an online payroll account',
        asked: 'Attached to the contract for payroll.',
        rtw: { verdict: 'rejected',
               why: 'A P45 evidences previous employment and tax position, not ' +
                    'the legal right to work. It was never submitted for that ' +
                    'purpose here.',
               clause: 'RTW evidence is separate from additional screening/vetting ID.',
               page: 1 },
        vetting: { verdict: 'rejected',
                   why: 'A P45 is Group 2b, but only as an original. The online ' +
                        'version is excluded by name.',
                   clause: 'P45/P60 must be original; not an online document or printed from an online account/PDF.',
                   page: 3 },
        consequence:
          'Still perfectly usable for PAYROLL, which is what it was attached ' +
          'for - so A10 raises the payroll ticket as normal, and only the ' +
          'vetting-ID use is refused. Two purposes, two verdicts, one document.',
        remedy: 'Request the original P45, or use a different Group 2b document ' +
                'for the ID route.' },

      { id: 'brp', label: 'Biometric Residence Permit',
        asked: 'A non-UK national presents a BRP.',
        rtw: { verdict: 'rejected',
               why: 'This changed, and it is the change most likely to catch a ' +
                    'manager out. A BRP no longer proves right to work; the ' +
                    'online share-code check replaced it.',
               clause: 'BRP can no longer prove RTW but may be acceptable for ID where it shows ILR/ILE/No Time Limit within current DBS rules.',
               page: 3 },
        vetting: { verdict: 'conditional', group: 'Group 1',
                   why: 'Still Group 1 for identity, but only where it shows ' +
                        'indefinite leave and within current DBS rules.',
                   clause: 'BRP can no longer prove RTW but may be acceptable for ID where it shows ILR/ILE/No Time Limit within current DBS rules.',
                   page: 3 },
        consequence:
          'A1 stops the submission and asks for a share code instead, before ' +
          'the offer is approved. Accepting the BRP as RTW evidence would ' +
          'create an unlawful-working exposure that looked compliant on file.',
        remedy: 'Obtain the GOV.UK share code and date of birth, and run the ' +
                'online check.' },

      { id: 'share-code-stale', label: 'Share code obtained 100 days ago',
        asked: 'The manager saved a share code earlier in the process.',
        rtw: { verdict: 'rejected',
               why: 'Expired. The check has to be current at the point it is ' +
                    'relied on, not at the point it was collected.',
               clause: 'share codes expire after 90 days',
               page: 1 },
        vetting: { verdict: 'rejected',
                   why: 'Same expiry. An expired code proves nothing about ' +
                        'today.',
                   clause: 'A GOV.UK share code/eVisa check must be current; share codes expire after 90 days.',
                   page: 1 },
        consequence:
          'A2 computes the age of the code and refuses it rather than running a ' +
          'check that would fail. A6 asks the candidate for a fresh one.',
        remedy: 'Ask the candidate to generate a new share code and re-run the ' +
                'GOV.UK check.' },

      { id: 'cropped-passport', label: 'Passport photo page, cropped at the edge',
        asked: 'A phone photo taken at an angle.',
        rtw: { verdict: 'rejected',
               why: 'Fails on quality before type is even considered. Note the ' +
                    'guide rejects "only the photo page" as well as cropping - ' +
                    'pages showing endorsements matter too.',
               clause: 'All four corners must be visible. Do not accept cropped images, only the photo page of a passport, or missing pages that show restrictions/endorsements.',
               page: 1 },
        vetting: { verdict: 'rejected',
                   why: 'Same standard applies to vetting ID.',
                   clause: 'All four corners must be visible. Do not accept cropped images, only the photo page of a passport, or missing pages that show restrictions/endorsements.',
                   page: 1 },
        consequence:
          'A2 scores legibility and completeness and escalates for a re-scan. ' +
          'It does NOT partially parse a cropped machine-readable zone, because ' +
          'unverifiable and invalid are different findings.',
        remedy: 'Re-scan the full document, all four corners visible, including ' +
                'any endorsement pages.' },

      { id: 'combined-pdf', label: 'Four IDs scanned into one PDF',
        asked: 'Exactly what arrived for this candidate.',
        rtw: { verdict: 'rejected',
               why: 'Breaches a stated standard, independently of what the ' +
                    'documents are. The certification has to be visible on the ' +
                    'relevant page of each one.',
               clause: 'Each ID document must be uploaded separately and show full verification/certification details on the relevant page.',
               page: 1 },
        vetting: { verdict: 'rejected',
                   why: 'The same standard governs vetting ID, and it bites ' +
                        'harder here: a route needs three documents counted ' +
                        'individually, which a single merged file prevents.',
                   clause: 'Each ID document must be uploaded separately and show full verification/certification details on the relevant page.',
                   page: 1 },
        consequence:
          'This is the one case where the agent should NOT simply reject. ' +
          'Splitting is mechanical, so A2 splits the file, files each document ' +
          'separately, and the standard is met without a round trip to the ' +
          'manager - which is precisely the 23% pushback this is meant to remove.',
        remedy: 'None needed once splitting is automated. Until then: upload ' +
                'each document as its own file.' },

      { id: 'birth-cert-late', label: 'Birth certificate issued years after birth',
        asked: 'A British citizen with no passport.',
        rtw: { verdict: 'conditional',
               why: 'Usable for RTW, but only in combination and only in person ' +
                    '- and this is the case where the NI letter stops being ' +
                    'incidental and becomes load-bearing.',
               clause: 'Original documents must be checked in person; IDVT/video is not available for this route.',
               page: 1 },
        vetting: { verdict: 'conditional', group: 'Group 2a',
                   why: 'Demoted from Group 1 to Group 2a by the delay, which ' +
                        'pushes the whole pack onto a longer route.',
                   clause: 'Birth certificate issued more than 12 months after time of birth',
                   page: 3 },
        consequence:
          'A0 re-plans the route rather than the document: no Group 1 document ' +
          'means Route 2 at best, and a late birth certificate as the anchor ' +
          'means Route 3, which the guide says to escalate before using.',
        remedy: 'Collect the birth certificate PLUS National Insurance evidence ' +
                'for RTW, and expect a longer ID route. Escalate to VOB first.' }
    ]
  };

  /* ----------------------------------------------------- combinations
     What SHOULD have been sent. This is the question a line manager actually
     has, and the walkthrough never answered it.

     IMPORTANT: this table is Cognizant-supplied, from Home Office employer
     guidance. The Serco documents name only "passports, birth certificates,
     National Insurance documentation, and other evidence" and contain no
     List A / List B breakdown at all, so none of this may be cited as though
     it were sourced from them. It renders with a .badge-ours.            */
  var COMBINATIONS = {
    provenance: 'ours',
    source: 'Home Office employer guidance — NOT the Serco source documents, ' +
            'which contain no accepted-document list',
    lede:
      'Right to work is established by a document set, not by a pile of ' +
      'identity documents. Four things arrived for this candidate and only one ' +
      'of them established anything.',
    rows: [
      { circumstance: 'British or Irish citizen',
        accepted: 'A UK or Irish passport, on its own — current OR expired',
        establishes: 'Right to work, permanently. No follow-up date.',
        note: 'This is the combination the candidate satisfied, with one document.',
        thisCandidate: true },
      { circumstance: 'British citizen with no passport',
        accepted: 'A full birth or adoption certificate PLUS an official ' +
                  'document showing the National Insurance number',
        establishes: 'Right to work, permanently.',
        note: 'A combination: either document alone is insufficient. This is ' +
              'the case where the NI letter would have been load-bearing.',
        thisCandidate: false },
      { circumstance: 'Non-UK national with settled or pre-settled status',
        accepted: 'An online check using a share code and date of birth',
        establishes: 'Right to work per the Home Office record.',
        note: 'Not a document at all. No scan can substitute for it.',
        thisCandidate: false },
      { circumstance: 'Non-UK national with time-limited leave',
        accepted: 'An online share-code check',
        establishes: 'Right to work UNTIL a stated date.',
        note: 'Also creates a follow-up obligation before that date — a diary ' +
              'entry, which is the part a document set cannot express and the ' +
              'visa register currently held in Excel exists to track.',
        thisCandidate: false }
    ],
    /* The four documents that actually arrived, and what each one did. */
    sent: [
      { doc: 'passport', role: 'Established right to work, on its own',
        loadBearing: true },
      { doc: 'ni-letter', role: 'Payroll and the BPSS identity check. Added ' +
        'nothing to right to work, because the passport had already settled it',
        loadBearing: false },
      { doc: 'licence', role: 'Identity and address corroboration only. Never ' +
        'evidence of right to work, in any combination',
        loadBearing: false },
      { doc: 'bank-statement', role: 'Not a required document. Stripped before ' +
        'it reached a human', loadBearing: false }
    ],
    verdict:
      'Valid, but over-supplied. One document was doing the work and three ' +
      'were not, and one of those three should never have been sent at all. ' +
      'The fix is not a stricter check at the vetting end — it is telling the ' +
      'manager which single document to ask for, before they submit.'
  };

  X.Evidence = { persona: PERSONA, docs: DOCS, steps: STEPS,
                 combinations: COMBINATIONS, acceptability: ACCEPTABILITY };

})(typeof module !== 'undefined' ? module.exports : (window.SVS = window.SVS || {}));
