# Krishna Industries — sample intake pack (fictional)

Procure-to-pay workflow, Pune Works + Coimbatore Plant. Everything here is invented for demonstration: the company, people, vendors, GST numbers and figures are fictional.

It is intentionally messy, the way real intake material is:

| File | What it is | What is wrong with it |
| --- | --- | --- |
| `KI-PROC-004 Purchasing Policy rev C FINAL_v2 (use this one).txt` | Corporate purchasing policy | Header says DRAFT, review overdue, refers to a release-strategy spreadsheet nobody can find, margin notes, Rev D drafted but unapproved |
| `RE RE FW urgent - PO approvals stuck again.eml.txt` | Email thread | Reveals limits in practice (3L/10L/50L) differ from policy (1L/5L/25L), WhatsApp approvals, PO on wrong vendor code, personal-card emergency purchase |
| `PR-to-PO walkthrough - notes from call with Ravi 19 Aug.txt` | Consultant interview notes | Unverified, estimates, contradicts policy on quotations and rate contracts, lists systems and pain points |
| `PO_export_Q1_FY26 (1).csv` | SAP PO export | `sep=` header line, mixed date formats, blanks, duplicate PO, USD line, Coimbatore rows typed from paper, trailer rows and a pasted total, remarks column with narrative |
| `vendor master dump (partial).csv` | Vendor master extract | Missing GSTIN/PAN, duplicate vendor with same GSTIN, one-time vendor abused, stale MSME flags |
| `Approval matrix from SharePoint (OLD - do not use).txt` | 2019 DoA matrix | Marked old, comments disagree with each other |
| `Internal Audit Report FY25 - Procurement (extract).txt` | Internal audit findings | Authoritative, but management responses have no owners |
| `WhatsApp Chat - Pune Purchase Approvals.txt` | Chat export | Approvals given in chat; shows who actually decides |
| `System landscape - Neeraj whiteboard (transcribed).txt` | IT landscape | Transcribed photo, unreadable box, constraint on SAP dev work |
| `Board update Jan 2025 - slide 7 ... (photo of printout).txt` | Board slide | Cut off, unsourced numbers, deferred decisions |

`manifest.json` maps each file to a Factory evidence record (type, source class, requirement hints). Load it with the **Load Krishna Industries sample** button on the front door, or:

```bash
node scripts/ingest-pack.mjs http://localhost:3000 samples/krishna-industries
```

Expected behaviour once ingested: the deterministic engine finds the approval-threshold contradiction (policy vs email vs audit), business discovery reaches PARTIAL until it is resolved, and the Blueprint specialist (with an API key) has real documents to reconstruct the baseline from.
