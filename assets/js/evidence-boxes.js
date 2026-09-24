/* ==========================================================================
   evidence-boxes.js - GENERATED. DO NOT EDIT.

   Highlight geometry for the specimen evidence documents, plus asset paths and
   raster dimensions. Every box is [left, top, width, height] as a fraction of
   the PNG, top-left origin, ready for CSS position:absolute percentages.

   The field VALUES, the narrative and the confidences are hand-authored in
   assets/js/evidence.js. This file is geometry only, and carries a digest of
   the values it was built from so test/run.js can prove the two agree.

   Regenerate after ANY change to assets/js/evidence.js:
     python3 tools/build-evidence.py
   ========================================================================== */
(function (X) {
  'use strict';

  var B = {
    "schema": 1,
    "builtFrom": "9ab3f99376cac26c",
    "docs": {
      "upload-combined": {
        "pdf": "assets/evidence/upload-combined.pdf",
        "png": "assets/evidence/upload-combined.png",
        "px": [990, 1400],
        "zoom": 1.66293,
        "boxes": {
          "filename": [0.21668, 0.09057, 0.15866, 0.0127],
          "pageCount": [0.6131, 0.09057, 0.01214, 0.0127],
          "uploaded": [0.21668, 0.10958, 0.15776, 0.0127]
        },
        "regions": {
          "region-passport": [0.06551, 0.30888, 0.40649, 0.20307],
          "region-licence": [0.51903, 0.3298, 0.40649, 0.18214],
          "region-ni-letter": [0.06551, 0.55946, 0.35966, 0.35872],
          "region-bank-statement": [0.51903, 0.55946, 0.35966, 0.35872]
        },
        "derived": {}
      },
      "passport": {
        "pdf": "assets/evidence/passport.pdf",
        "png": "assets/evidence/passport.png",
        "px": [1400, 986],
        "zoom": 3.95111,
        "boxes": {
          "type": [0.2794, 0.1399, 0.02108, 0.03841],
          "code": [0.37536, 0.1399, 0.05707, 0.03841],
          "passportNo": [0.55033, 0.1399, 0.12145, 0.03841],
          "surname": [0.2794, 0.20161, 0.07248, 0.03841],
          "givenNames": [0.2794, 0.26332, 0.12649, 0.03841],
          "nationality": [0.2794, 0.32503, 0.19465, 0.03841],
          "dob": [0.2794, 0.38675, 0.14841, 0.03841],
          "sex": [0.59549, 0.38675, 0.01978, 0.03841],
          "birthplace": [0.2794, 0.44846, 0.13552, 0.03841],
          "issued": [0.2794, 0.51017, 0.142, 0.03841],
          "expiry": [0.59549, 0.51017, 0.142, 0.03841],
          "authority": [0.2794, 0.57188, 0.26667, 0.03841],
          "photo": [0.03669, 0.13625, 0.21449, 0.44079],
          "signature": [0.2794, 0.64997, 0.29351, 0.09217],
          "mrz1": [0.03104, 0.83726, 0.78051, 0.04002],
          "mrz2": [0.03104, 0.88935, 0.78051, 0.04002]
        },
        "regions": {},
        "derived": {
          "mrz1": "P\u003cGBRKAUR\u003c\u003cDAVINDER\u003c\u003c\u003c\u003c\u003c\u003c\u003c\u003c\u003c\u003c\u003c\u003c\u003c\u003c\u003c\u003c\u003c\u003c\u003c\u003c\u003c\u003c\u003c\u003c\u003c",
          "mrz2": "5000000072GBR9403143F3202023\u003c\u003c\u003c\u003c\u003c\u003c\u003c\u003c\u003c\u003c\u003c\u003c\u003c\u003c02"
        }
      },
      "licence": {
        "pdf": "assets/evidence/licence.pdf",
        "png": "assets/evidence/licence.png",
        "px": [1400, 883],
        "zoom": 5.76973,
        "boxes": {
          "surname": [0.30909, 0.1408, 0.08204, 0.05054],
          "givenNames": [0.30909, 0.19961, 0.14167, 0.05054],
          "dob": [0.30909, 0.25842, 0.1361, 0.05054],
          "issued": [0.30909, 0.31723, 0.1361, 0.05054],
          "expiry": [0.30909, 0.37603, 0.1361, 0.05054],
          "authority": [0.30909, 0.43484, 0.07779, 0.05054],
          "licenceNumber": [0.30909, 0.49365, 0.26524, 0.05054],
          "address": [0.30909, 0.56368, 0.22615, 0.13284],
          "categories": [0.26788, 0.82341, 0.54666, 0.09148],
          "photo": [0.03297, 0.15029, 0.2143, 0.43126],
          "signature": [0.04121, 0.79074, 0.20606, 0.10455]
        },
        "regions": {},
        "derived": {
          "licenceNumber": "KAUR9953144D99AB"
        }
      },
      "ni-letter": {
        "pdf": "assets/evidence/ni-letter.pdf",
        "png": "assets/evidence/ni-letter.png",
        "px": [990, 1400],
        "zoom": 1.66293,
        "boxes": {
          "recipient": [0.41825, 0.14029, 0.09655, 0.01292],
          "niNumber": [0.41825, 0.16464, 0.11182, 0.01292],
          "issued": [0.41825, 0.18899, 0.11899, 0.01292],
          "address": [0.41825, 0.21385, 0.12605, 0.04006],
          "reference": [0.41825, 0.26679, 0.15126, 0.01292]
        },
        "regions": {},
        "derived": {}
      },
      "bank-statement": {
        "pdf": "assets/evidence/bank-statement.pdf",
        "png": "assets/evidence/bank-statement.png",
        "px": [990, 1400],
        "zoom": 1.66293,
        "boxes": {
          "accountName": [0.41825, 0.14029, 0.10996, 0.01292],
          "sortCode": [0.41825, 0.16464, 0.06789, 0.01292],
          "accountNo": [0.41825, 0.18899, 0.07508, 0.01292],
          "period": [0.41825, 0.21334, 0.13064, 0.01292],
          "balance": [0.41825, 0.23769, 0.06612, 0.01292]
        },
        "regions": {},
        "derived": {}
      },
      "mgr-declaration": {
        "pdf": "assets/evidence/mgr-declaration.pdf",
        "png": "assets/evidence/mgr-declaration.png",
        "px": [990, 1400],
        "zoom": 1.66293,
        "boxes": {
          "manager": [0.41825, 0.14029, 0.09832, 0.01292],
          "role": [0.41825, 0.16464, 0.15389, 0.01292],
          "candidate": [0.41825, 0.18899, 0.11358, 0.01292],
          "ticket": [0.41825, 0.21334, 0.10284, 0.01292],
          "docsListed": [0.41825, 0.23769, 0.26503, 0.01292],
          "statement": [0.41825, 0.26255, 0.36382, 0.04006],
          "signature": [0.41825, 0.31299, 0.23852, 0.03088],
          "signedDate": [0.41825, 0.35587, 0.10195, 0.01292]
        },
        "regions": {},
        "derived": {}
      },
      "appian-record": {
        "pdf": "assets/evidence/appian-record.pdf",
        "png": "assets/evidence/appian-record.png",
        "px": [990, 1400],
        "zoom": 1.66293,
        "boxes": {
          "ticket": [0.41825, 0.14029, 0.10284, 0.01292],
          "surname": [0.41825, 0.16464, 0.04993, 0.01292],
          "givenNames": [0.41825, 0.18899, 0.08757, 0.01292],
          "dob": [0.41825, 0.21334, 0.10195, 0.01292],
          "passportNo": [0.41825, 0.23769, 0.08405, 0.01292],
          "expiry": [0.41825, 0.26204, 0.09837, 0.01292],
          "niNumber": [0.41825, 0.28639, 0.11182, 0.01292],
          "role": [0.41825, 0.31074, 0.20315, 0.01292],
          "site": [0.41825, 0.33509, 0.18258, 0.01292],
          "submitted": [0.41825, 0.35944, 0.14767, 0.01292]
        },
        "regions": {},
        "derived": {}
      },
      "id-stamp": {
        "pdf": "assets/evidence/id-stamp.pdf",
        "png": "assets/evidence/id-stamp.png",
        "px": [990, 1400],
        "zoom": 1.66293,
        "boxes": {
          "subject": [0.41825, 0.14029, 0.11358, 0.01292],
          "document": [0.41825, 0.16464, 0.1844, 0.01292],
          "assurance": [0.41825, 0.18899, 0.06875, 0.01292],
          "mrzCheck": [0.41825, 0.21334, 0.05174, 0.01292],
          "mrzAgrees": [0.41825, 0.23769, 0.07146, 0.01292],
          "chipRead": [0.41825, 0.26204, 0.22915, 0.01292],
          "features": [0.41825, 0.28639, 0.256, 0.01292],
          "stampedAt": [0.41825, 0.31074, 0.14767, 0.01292],
          "stampRef": [0.41825, 0.33509, 0.12435, 0.01292]
        },
        "regions": {},
        "derived": {}
      },
      "contract": {
        "pdf": "assets/evidence/contract.pdf",
        "png": "assets/evidence/contract.png",
        "px": [990, 1400],
        "zoom": 1.66293,
        "boxes": {
          "employee": [0.41825, 0.14029, 0.11358, 0.01292],
          "role": [0.41825, 0.16464, 0.20315, 0.01292],
          "startDate": [0.41825, 0.18899, 0.09839, 0.01292],
          "salary": [0.41825, 0.21334, 0.0921, 0.01292],
          "bankSort": [0.41825, 0.23769, 0.06789, 0.01292],
          "bankAccount": [0.41825, 0.26204, 0.07508, 0.01292],
          "p45": [0.41825, 0.28639, 0.03563, 0.01292],
          "disability": [0.41825, 0.31074, 0.02755, 0.01292],
          "convictions": [0.41825, 0.33509, 0.03563, 0.01292],
          "veteran": [0.41825, 0.35944, 0.02755, 0.01292],
          "signedBy": [0.41825, 0.38379, 0.11358, 0.01292],
          "signature": [0.41825, 0.40564, 0.23852, 0.03088],
          "signedDate": [0.41825, 0.44852, 0.14767, 0.01292],
          "envelope": [0.41825, 0.47287, 0.15302, 0.01292]
        },
        "regions": {},
        "derived": {}
      },
      "p45": {
        "pdf": "assets/evidence/p45.pdf",
        "png": "assets/evidence/p45.png",
        "px": [990, 1400],
        "zoom": 1.66293,
        "boxes": {
          "employee": [0.41825, 0.14029, 0.09655, 0.01292],
          "niNumber": [0.41825, 0.16464, 0.11182, 0.01292],
          "leaving": [0.41825, 0.18899, 0.10195, 0.01292],
          "taxCode": [0.41825, 0.21334, 0.04907, 0.01292],
          "payToDate": [0.41825, 0.23769, 0.07508, 0.01292],
          "taxToDate": [0.41825, 0.26204, 0.06612, 0.01292],
          "payrollRef": [0.41825, 0.28639, 0.10108, 0.01292]
        },
        "regions": {},
        "derived": {}
      },
      "sap-record": {
        "pdf": "assets/evidence/sap-record.pdf",
        "png": "assets/evidence/sap-record.png",
        "px": [990, 1400],
        "zoom": 1.66293,
        "boxes": {
          "personnelNo": [0.41825, 0.14029, 0.07508, 0.01292],
          "name": [0.41825, 0.16464, 0.11358, 0.01292],
          "dob": [0.41825, 0.18899, 0.10284, 0.01292],
          "passportNo": [0.41825, 0.21334, 0.08405, 0.01292],
          "expiry": [0.41825, 0.23769, 0.09837, 0.01292],
          "visaRequired": [0.41825, 0.26204, 0.24706, 0.01292],
          "docsFiled": [0.41825, 0.28639, 0.21749, 0.01292],
          "bankSort": [0.41825, 0.31074, 0.06789, 0.01292],
          "bankAccount": [0.41825, 0.33509, 0.07508, 0.01292],
          "auditTicket": [0.41825, 0.35944, 0.10105, 0.01292]
        },
        "regions": {},
        "derived": {}
      },
      "as-record": {
        "pdf": "assets/evidence/as-record.pdf",
        "png": "assets/evidence/as-record.png",
        "px": [990, 1400],
        "zoom": 1.66293,
        "boxes": {
          "asRef": [0.41825, 0.14029, 0.12615, 0.01292],
          "candidate": [0.41825, 0.16464, 0.11358, 0.01292],
          "linkIssued": [0.41825, 0.18899, 0.10195, 0.01292],
          "linkComplete": [0.41825, 0.21334, 0.10195, 0.01292],
          "references": [0.41825, 0.23769, 0.14049, 0.01292],
          "addressHist": [0.41825, 0.26204, 0.14407, 0.01292],
          "residency": [0.41825, 0.28639, 0.07683, 0.01292],
          "screening": [0.41825, 0.31074, 0.07683, 0.01292],
          "clearance": [0.41825, 0.33509, 0.19559, 0.01292]
        },
        "regions": {},
        "derived": {}
      },
      "ohp-outcome": {
        "pdf": "assets/evidence/ohp-outcome.pdf",
        "png": "assets/evidence/ohp-outcome.png",
        "px": [990, 1400],
        "zoom": 1.66293,
        "boxes": {
          "candidate": [0.41825, 0.14029, 0.11358, 0.01292],
          "referred": [0.41825, 0.16464, 0.10195, 0.01292],
          "completed": [0.41825, 0.18899, 0.10195, 0.01292],
          "outcome": [0.41825, 0.21334, 0.11535, 0.01292],
          "adjustments": [0.41825, 0.23769, 0.04995, 0.01292],
          "ref": [0.41825, 0.26204, 0.12973, 0.01292]
        },
        "regions": {},
        "derived": {}
      },
      "dbs-certificate": {
        "pdf": "assets/evidence/dbs-certificate.pdf",
        "png": "assets/evidence/dbs-certificate.png",
        "px": [990, 1400],
        "zoom": 1.66293,
        "boxes": {
          "applicant": [0.41825, 0.14029, 0.11358, 0.01292],
          "certNumber": [0.41825, 0.16464, 0.11095, 0.01292],
          "level": [0.41825, 0.18899, 0.09473, 0.01292],
          "issued": [0.41825, 0.21334, 0.09839, 0.01292],
          "convictions": [0.41825, 0.23769, 0.16373, 0.01292],
          "barredList": [0.41825, 0.26204, 0.16911, 0.01292],
          "position": [0.41825, 0.28639, 0.20315, 0.01292]
        },
        "regions": {},
        "derived": {}
      },
      "reference-reply": {
        "pdf": "assets/evidence/reference-reply.pdf",
        "png": "assets/evidence/reference-reply.png",
        "px": [990, 1400],
        "zoom": 1.66293,
        "boxes": {
          "subject": [0.41825, 0.14029, 0.11358, 0.01292],
          "employer": [0.41825, 0.16464, 0.21038, 0.01292],
          "jobTitle": [0.41825, 0.18899, 0.1252, 0.01292],
          "from": [0.41825, 0.21334, 0.09837, 0.01292],
          "to": [0.41825, 0.23769, 0.10195, 0.01292],
          "reason": [0.41825, 0.26204, 0.1557, 0.01292],
          "reemploy": [0.41825, 0.28639, 0.03563, 0.01292],
          "respondedBy": [0.41825, 0.31074, 0.1754, 0.01292],
          "signature": [0.41825, 0.33259, 0.23852, 0.03088],
          "chased": [0.41825, 0.37547, 0.19333, 0.01292]
        },
        "regions": {},
        "derived": {}
      },
      "evidence-pack": {
        "pdf": "assets/evidence/evidence-pack.pdf",
        "png": "assets/evidence/evidence-pack.png",
        "px": [990, 1400],
        "zoom": 1.66293,
        "boxes": {
          "candidate": [0.41825, 0.14029, 0.11358, 0.01292],
          "asRef": [0.41825, 0.16464, 0.12615, 0.01292],
          "clearance": [0.41825, 0.18899, 0.19559, 0.01292],
          "itemCount": [0.41825, 0.21334, 0.02129, 0.01292],
          "complete": [0.41825, 0.23769, 0.30892, 0.01292],
          "gaps": [0.41825, 0.26204, 0.35999, 0.01292],
          "recommend": [0.41825, 0.28639, 0.3035, 0.01292],
          "decidedBy": [0.41825, 0.31074, 0.24079, 0.01292],
          "assembled": [0.41825, 0.33509, 0.1441, 0.01292]
        },
        "regions": {},
        "derived": {}
      }
    }
  };

  X.EvidenceBoxes = B;
})(typeof module !== 'undefined' ? module.exports : (window.SVS = window.SVS || {}));
