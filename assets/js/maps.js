/* ==========================================================================
   maps.js - the validated bpmn-beta process maps, EMBEDDED as strings.

   They are embedded rather than fetched because fetch() and XMLHttpRequest are
   both blocked from file:// (a file:// page has a null origin), and these pages
   must run from a USB stick with no server and no network.

   Generated from process/*.mmd. Regenerate if those change:
     python3 tools/embed-maps.py
   ========================================================================== */
(function () {
  'use strict';

  var MAPS = {
  "map-rtw": "bpmn-beta\naccTitle: Right to Work Check - Current State\naccDescr: Swimlane process model of Serco's Right to Work check, from a line manager submitting an offer in PeopleFirst through to the Vetting and Onboarding team closing the ServiceNow ticket, including the pushback loop that returns 23 percent of tickets to the manager.\npool serco \"Serco\" {\n  lane lm \"Line Manager\" {\n    start s1 \"Ready to offer\"\n    task t1 \"Populate details in PeopleFirst (Appian)\"\n    task t2 \"Upload RTW documents\"\n    task t3 \"Submit offer\"\n    task t8 \"Amend details and return to Vetting and Onboarding\"\n    s1 --> t1\n    t1 --> t2\n    t2 --> t3\n  }\n  lane vob \"Vetting and Onboarding Team\" {\n    task t4 \"RTW ticket generated on ServiceNow\"\n    task t5 \"Check details against submitted evidence\"\n    xor g1 \"Details correct?\"\n    task t6 \"Close complete RTW ticket\"\n    task t7 \"Close incomplete with notes\"\n    task t9 \"Email line manager with reasons for pushback\"\n    end e1 \"RTW check complete\"\n    t3 --> t4\n    t4 --> t5\n    t5 --> g1\n    g1 --> t6: \"yes (77%)\"\n    g1 --> t7: \"no (23% pushback)\"\n    t6 --> e1\n    t7 --> t9\n    t9 --> t8\n    t8 --> t5\n  }\n}\n",
  "map-audit": "bpmn-beta\naccTitle: Vetting and Onboarding Audit - Current State\naccDescr: Swimlane process model of Serco's post-contract onboarding audit, from DocuSign contract signature through SAP record updates, visa tracking and the four follow-on ServiceNow actions, to closing the audit ticket.\npool serco \"Serco\" {\n  lane vob \"Vetting and Onboarding Team\" {\n    start s1 \"Contract signed on DocuSign\"\n    task t1 \"Check details against signed contract\"\n    xor g0 \"Issues identified?\"\n    end e0 \"Not observed in sample\"\n    task t2 \"Upload contract and RTW documents to SAP\"\n    task t3 \"Add personal details to SAP record\"\n    xor g1 \"Visa management required?\"\n    task t4 \"Track visa details (Excel)\"\n    xor g2 \"P45 attached?\"\n    task t5 \"Generate ServiceNow ticket to Payroll\"\n    xor g3 \"Disabilities declared?\"\n    task t6 \"Inform line manager via ServiceNow\"\n    xor g4 \"Criminal convictions declared?\"\n    task t7 \"Generate ServiceNow ticket to Employment Relations\"\n    xor g5 \"Is the recruit a veteran?\"\n    xor g6 \"Veteran documents present?\"\n    task t8 \"Generate ServiceNow ticket to Payroll for veteran status\"\n    task t9 \"Raise ServiceNow ticket to line manager requesting documents\"\n    task t10 \"Close ticket on ServiceNow\"\n    end e1 \"Audit complete\"\n    s1 --> t1\n    t1 --> g0\n    g0 --> e0: \"yes\"\n    g0 --> t2: \"no\"\n    t2 --> t3\n    t3 --> g1\n    g1 --> t4: \"yes\"\n    g1 --> g2: \"no\"\n    t4 --> g2\n    g2 --> t5: \"yes (193/month)\"\n    g2 --> g3: \"no\"\n    t5 --> g3\n    g3 --> t6: \"yes (86/month)\"\n    g3 --> g4: \"no\"\n    t6 --> g4\n    g4 --> t7: \"yes (43/month)\"\n    g4 --> g5: \"no\"\n    t7 --> g5\n    g5 --> g6: \"yes (4/month)\"\n    g5 --> t10: \"no\"\n    g6 --> t8: \"yes\"\n    g6 --> t9: \"no\"\n    t8 --> t10\n    t9 --> t10\n    t10 --> e1\n  }\n}\n",
  "map-onboarding": "bpmn-beta\naccTitle: Serco Onboarding and Vetting Setup - Current State\naccDescr: End to end swimlane model of Serco onboarding from ServiceNow ticket receipt through the Right to Work check, contract approval and signature, onboarding audit, and setup of vetting and occupational health checks including BS7858 clearance.\npool serco \"Serco\" {\n  lane vob \"Vetting and Onboarding Team\" {\n    start s1 \"Vetting and Onboarding ticket received on ServiceNow\"\n    task t1 \"1.1 Conduct RTW (Right to Work) check\"\n    task t5 \"1.5 Conduct onboarding audit\"\n    xor g1 \"Direct vetting site?\"\n    end e1 \"No action required\"\n    s1 --> t1\n  }\n  lane hrd \"HRD and Budget Holder\" {\n    task t2 \"1.2 Contract approval (salary and T&Cs)\"\n    t1 --> t2\n  }\n  lane lm \"Line Manager\" {\n    task t3 \"1.3 Review and submit contract\"\n    t2 --> t3\n  }\n  lane emp \"Employee\" {\n    task t4 \"1.4 Sign contract on DocuSign\"\n    task t8 \"Employee completes occupational health check\"\n    t3 --> t4\n    t4 --> t5\n  }\n  lane dv \"Direct Vetting Team\" {\n    task t6 \"1.6 Setup vetting checks on Access Screening\"\n    task t7 \"1.7 Trigger occupational health check\"\n    xor g2 \"BS7858 vetting required?\"\n    task t9 \"1.8 Setup BS7858 clearance\"\n    end e2 \"Vetting setup complete\"\n    t5 --> g1\n    g1 --> e1: \"no\"\n    g1 --> t6: \"yes\"\n    t6 --> t7\n    t7 --> t8\n    t8 --> g2\n    g2 --> t9: \"yes\"\n    g2 --> e2: \"no\"\n    t9 --> e2\n  }\n}\n",
  "map-specialist": "bpmn-beta\naccTitle: Specialist Vetting for New Staff - DRAFT DO NOT AUTOMATE\naccDescr: Swimlane model of Serco Specialist Vetting for new staff across PECS IRC and HAAS EMS contracts, including the offline ITC tracker, the daily Access Screening completion report, contract specific clearance routing, and Home Office submission. This map is watermarked DRAFT DO NOT AUTOMATE in the source document and is not approved for automation.\npool serco \"Serco\" {\n  lane vt \"Vetting Team\" {\n    start s1 \"Onboarding instruction received\"\n    task t1 \"Add employee details to the ITC tracker (Excel)\"\n    task t2 \"Check ITC tracker for employee\"\n    task t3 \"Save documents to vetting drive\"\n    task t4 \"Setup candidate on Access Screening\"\n    task t5 \"Add AS reference and date to ITC tracker or ServiceNow ticket\"\n    task t7 \"Run daily report on AS link completion\"\n    task t8 \"Review pre-employment checks\"\n    xor g1 \"Pass pre-employment check?\"\n    task t9 \"Feedback to recruitment and place candidate on hold\"\n    xor g2 \"Which contract route?\"\n    task t10 \"Submit to Home Office for PECS vetting\"\n    task t11 \"Populate CRF in SSCL Portal (HAAS)\"\n    task t12 \"Populate VCRF (EMS)\"\n    task t13 \"Initiate standard vetting checks on AS (BPSS, DBS, Enhanced DBS)\"\n    task t14 \"Complete vetting checks\"\n    task t15 \"Conduct clearance checks\"\n    task t16 \"Receive clearance outcome\"\n    xor g3 \"Clearance granted?\"\n    task t17 \"Notify site and candidate of clearance\"\n    task t18 \"Notify site and candidate of refusal\"\n    task t19 \"Close on AS and data cleanse\"\n    end e1 \"Vetting complete\"\n    end e2 \"No further action\"\n    s1 --> t1\n    t1 --> t2\n    t2 --> t3\n    t3 --> t4\n    t4 --> t5\n    t7 --> t8\n    t8 --> g1\n    g1 --> t9: \"no\"\n    g1 --> g2: \"yes\"\n    t9 --> e2\n    g2 --> t10: \"PECS\"\n    g2 --> t11: \"HAAS\"\n    g2 --> t12: \"EMS\"\n    g2 --> t13: \"standard\"\n    t11 --> t13\n    t12 --> t13\n    t13 --> t14\n    t14 --> t15\n    t15 --> t16\n    t16 --> g3\n    g3 --> t17: \"yes\"\n    g3 --> t18: \"no\"\n    t17 --> t19\n    t18 --> t19\n    t19 --> e1\n  }\n  lane cand \"Candidate\" {\n    task t6 \"Complete Access Screening link\"\n    t5 --> t6\n    t6 --> t7\n  }\n}\npool ho \"Home Office\" {\n  lane hoc \"Clearance\" {\n    task h1 \"Process PECS vetting request\"\n    task h2 \"Issue clearance outcome\"\n    h1 --> h2\n  }\n}\nt10 ~~> h1: \"Submit to Home Office (Outlook)\"\nh2 ~~> t16: \"Clearance outcome received (Outlook)\"\n"
};

  /* Minimal tokeniser for the bpmn-beta declaration DSL that the skill's
     validator actually parses: keyword, identifier, "quoted label", flow op. */
  function highlight(src) {
    var out = '';
    src.split('\n').forEach(function (line) {
      var esc = line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

      if (/^\s*(accTitle|accDescr):/.test(line)) {
        out += '<span class="c">' + esc + '</span>\n';
        return;
      }
      esc = esc
        .replace(/&quot;([^&]*)&quot;/g, '<span class="s">"$1"</span>')
        .replace(/"([^"]*)"/g, '<span class="s">"$1"</span>')
        .replace(/^(\s*)(bpmn-beta|pool|lane|start|end|task|xor|and|or)\b/,
                 '$1<span class="k">$2</span>')
        .replace(/(--&gt;|==&gt;|~~&gt;)/g, '<span class="f">$1</span>');
      out += esc + '\n';
    });
    return out;
  }

  Object.keys(MAPS).forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.innerHTML = highlight(MAPS[id]);
  });
})();
