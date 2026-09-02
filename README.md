# QuickEasy Website

A complete static copy of **quickeasysoftware.com**. This file is the map of the
repo, organised to mirror the site's menu so you can find any page quickly.

> **Important — folder = URL.** This is a static site, so each folder's path is
> its live web address (`about-us/` → `/about-us/`). **Do not rename or move a
> page folder without setting up a 301 redirect**, or its search ranking is lost.
> See the [consolidation plan](#related) before restructuring.

---

## Site menu → folders

### Home
| Page | Folder |
|------|--------|
| Home | [`index.html`](index.html) |

### Products
| Page | Folder |
|------|--------|
| BOS ERP Overview | [`bos-overview/`](bos-overview/) |
| BOS ERP | [`bos-erp/`](bos-erp/) |
| Business Operating System (BOS) | [`business-operating-system/`](business-operating-system/) |
| Manufacturing ERP | [`manufacturing-erp/`](manufacturing-erp/) |
| Cloud Hosting | [`cloud-hosting/`](cloud-hosting/) |
| BOS Tech Specs | [`tech-specs/`](tech-specs/) |
| _BOS Information Pack_ | _(external Google Drive link — not a page)_ |

**Feature / module deep-dives** (linked as "Discover…" from the product pages):

| Module | Folder |
|--------|--------|
| Accounting | [`accounting-features-benefits/`](accounting-features-benefits/) |
| Costing | [`costing-features-benefits/`](costing-features-benefits/) |
| Estimating & Quoting | [`estimating-and-quoting-features-benefits/`](estimating-and-quoting-features-benefits/) |
| Inventory & Materials | [`inventory-management-features-benefits/`](inventory-management-features-benefits/) |
| Management | [`management-features-benefits/`](management-features-benefits/) |
| Procurement | [`procurement-features-benefits/`](procurement-features-benefits/) |
| Production | [`production-features-benefits/`](production-features-benefits/) |
| Project Management | [`project-management-features-benefits/`](project-management-features-benefits/) |
| Service Manager & Sales | [`service-manager-benefits/`](service-manager-benefits/) |
| Tracking | [`tracking-features-benefits/`](tracking-features-benefits/) |

### Industries
| Page | Folder |
|------|--------|
| Printing, Signage & Packaging | [`printing-signage-packaging/`](printing-signage-packaging/) |
| ERP for Printing, Signage, Packaging | [`erp-for-printing-signage-packaging/`](erp-for-printing-signage-packaging/) |

### Pricing
| Page | Folder |
|------|--------|
| Pricing | [`pricing/`](pricing/) |

**Regional pricing / distribution** (under the Contact menu on the live site):

| Region | Folder |
|--------|--------|
| South Africa | [`south-africa/`](south-africa/) |
| Thailand | [`thailand/`](thailand/) |
| Middle East | [`middle-east/`](middle-east/) |
| Eastern Europe | [`eastern-europe/`](eastern-europe/) |

### Resources
| Page | Folder |
|------|--------|
| Our Implementation Methodology | [`implementation-methodology/`](implementation-methodology/) |
| Articles (blog hub) | [`articles/`](articles/) |
| Why BOS | [`why-bos/`](why-bos/) |
| FAQs | [`faq/`](faq/) |
| Accounting Tutorials | [`accounting-tutorials/`](accounting-tutorials/) |
| VAT Types | [`vat-types/`](vat-types/) |
| SQL Tutorials | [`sql-tutorials/`](sql-tutorials/) |
| Templates and Design | [`templates-and-design/`](templates-and-design/) |

### About
| Page | Folder |
|------|--------|
| About QuickEasy BOS (Our Story) | [`about-us/`](about-us/) |
| Support | [`support/`](support/) |
| Become a Referral Partner | [`become-a-referral-partner/`](become-a-referral-partner/) |

### Contact
| Page | Folder |
|------|--------|
| Contact Us | [`contact-us/`](contact-us/) |

### Legal
| Page | Folder |
|------|--------|
| Application Privacy Policy | [`application-privacy-policy/`](application-privacy-policy/) |
| Application Terms of Use | [`application-terms-of-use/`](application-terms-of-use/) |
| POPIA Policy | [`popia-policy/`](popia-policy/) |
| Terms of Engagement | [`terms-of-engagement/`](terms-of-engagement/) |
| Website Cookie Policy | [`website-cookie-policy/`](website-cookie-policy/) |
| Website Privacy Policy | [`website-privacy-policy/`](website-privacy-policy/) |
| Website Terms of Use | [`website-terms-of-use/`](website-terms-of-use/) |

---

## Blog & articles

Dated posts live under year folders; the hub is [`articles/`](articles/).

| Year | Folder |
|------|--------|
| 2022 | [`2022/`](2022/) |
| 2023 | [`2023/`](2023/) |
| 2024 | [`2024/`](2024/) |
| 2025 | [`2025/`](2025/) |
| 2026 | [`2026/`](2026/) |

A handful of older posts use flat (non-dated) URLs and sit at the repo root —
e.g. `head-in-the-cloud/`, `3-ways-erp-helps-manufacturers-do-more-with-less/`,
`why-local-erp-is-still-better-for-local-businesses/`, and other `why-…` /
`how-erp-…` / `understanding-…` posts. These are blog content, kept at their
existing URLs.

---

## Assets & system files

These are **not pages** — leave them in place; the pages reference them.

| Folder | What it holds |
|--------|---------------|
| `wp-content/` | Images/uploads, theme & plugin CSS/JS |
| `wp-includes/` | Core CSS/JS the pages load |
| `assets/ext/` | Mirrored third-party assets (fonts, external images/PDFs) |
| `wp-admin/`, `wp-json/`, `wp-login.php` | WordPress machinery from the mirror (inert in a static copy) |
| `feed/`, `comments/`, `author/`, `category/`, `tag/` | WordPress archives/RSS from the mirror (not marketing pages) |

---

## Running it locally

Any static file server pointed at the repo root works, e.g.:

```bash
npx serve .
```

Then open `http://localhost:3000`. Internal links are relative, so the copy is
fully self-contained and browsable offline.

---

## Related

- **Consolidation & SEO plan** — the page-by-page plan to merge duplicates and
  strengthen this site (Home ← BOS ERP Overview + Why BOS, Pricing ← FAQ, etc.).

## Notes

- **Aliases kept (canonicalised on the live site):** `bos-er/` → `bos-erp/`,
  `contact/` → `contact-us/`. Left in place so no URLs break; safe to retire
  later with redirects.
- **Recent cleanup:** removed three duplicate/legacy stub folders
  (`bos-erp-copy-2/`, `pricing-other-countires/`, `new-website-2017/`) and
  repointed 63 inbound links to their canonical pages, so nothing links to a
  dead page.
