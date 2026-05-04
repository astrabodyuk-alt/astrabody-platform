# CLAUDE.md — Astrabody Project

> Ce fichier est lu **automatiquement** par Claude Code et toutes les sessions Claude qui travaillent sur le projet Astrabody. C'est la **source de vérité unique** pour le contexte du business. Avant toute action sur ce projet, lis-le.

---

## ⚡ RÈGLES D'OR (à respecter sur TOUS les livrables)

1. **🇬🇧 Tout livrable client-facing est en ANGLAIS UK.** Astrabody est une marque britannique basée à Chandler's Ford. Tout ce qui sera vu par un client, un employé du studio, un partenaire, ou qui finit en production = **English UK**. Bot WhatsApp, emails, landing pages, ads, scripts, system prompts, FAQ — tout en anglais. Seuls les notes internes / commentaires de travail entre Nigel et Claude restent en français.

2. **👤 Voix humaine à 100%, jamais robotique.** Le bot et toute communication client doivent sonner comme un **assistant personnel premium qui texte avec un client**, pas comme un service-après-vente automatisé. Contractions, rythme varié, "I" naturel, pas de signature à chaque message, pas de "Thank you for reaching out", pas de bullet points pour tout. Si c'est marketing-speak ou robotique → réécrire. Détails complets dans `Knowledge_Base/03_voix_et_ton.md`.

3. **🎨 Palette sage/cream/olive uniquement** (jamais blanc/noir/rouge). Voir section 2.

4. **💰 Aucun prix inventé.** Si l'info n'est pas dans `Knowledge_Base/`, on demande à Nigel — on ne devine pas.

---

## 1. Identité business

**ASTRABODY** — Aesthetic Clinic & Wellness Studio premium, basé à Chandler's Ford (Eastleigh, UK).

- **Site** : https://astrabody.co.uk
- **Adresse** : 149 Hursley Road, Chandler's Ford, Eastleigh
- **Téléphone / WhatsApp** : +44 7393 102167
- **Booking actuel** : Fresha (URL : `fresha.com/a/astra-body-chandlers-ford-eastleigh-149-hursley-road-zp8ekaji`)
- **Tagline** : *Sculpt. Refine. Transform.*
- **Founder** : Nigel (+ équipe : Tove, Jade)

**Positioning** : sanctuaire privé, sur rendez-vous uniquement, expérience non-précipitée. PAS un salon de beauté de masse.

---

## 2. Brand identity (vraies couleurs)

⚠️ **Les anciens docs (`ASTRABODY_BRAND_BRIEF.html`, `Astrabody_Booking_Platform_Specs.md`) annonçaient blanc/noir/rouge #FF0033. C'EST FAUX.** Vérifié par scraping du CSS de production le 2026-04-26.

### Palette officielle
| Token | Hex | Usage |
|---|---|---|
| `--cream` | `#F6F3EE` | Background principal |
| `--sand` | `#DED2C3` | Beige secondaire (cards) |
| `--sage` | `#758564` | **Primary** (boutons, liens) |
| `--sage-light` | `#BBC4AA` | Accent doux |
| `--olive` | `#3E3E31` | Texte principal (pas noir pur) |
| `--destructive` | `#EE4343` | Erreurs uniquement |

### Typographie
- **Headings** : `Cormorant Garamond` (serif élégant — l'effet "spa luxe")
- **Body** : `Inter` (sans-serif moderne)

> Toute nouvelle interface, slide, asset, bot — **utilise cette palette**. Référence détaillée : `Astrabody_Site_Audit.md`.

---

## 3. Catalogue services & prix

| Service | From | Durée | Détail |
|---|---|---|---|
| InfraBike (Infrared Bike) | £39 | 30 min | Pod infrarouge + collagène + cycling — détox, peau, calorie burn |
| EMS Body Sculpting (SupraSculpt) | £80 | 30 min | Stim électromagnétique — muscle + fat localisé |
| Fat Freezing (M3Pro 360° Cryolipolysis) | £160 | 30-45 min/zone | FDA-cleared, 22-25% réduction permanente — **machine Jonte Laser M3Pro, 4 handles indépendants** — **8 semaines min entre 2 sessions sur même zone** |
| Laser Hair Removal | £9 | 15-60 min | **Diode laser 4-en-1 (755+808+940+1064 nm)** Jonte Laser, CE+ISO 13485 — toutes carnations Fitzpatrick I-VI — **4 semaines min entre 2 sessions** |

**Trial funnel** :
- **Lead magnet** = FREE InfraBike trial (30 min) — promesse Meta Ads, toujours honorée
- **Upsell bot/équipe** = £39 combo InfraBike + EMS (même séance) — feel both technos pour qualifier le programme
- **En studio** : présentation menu complet (Fat Freezing, EMS, Laser) → packages selon profil cliente

### Forfaits permanents
- **4 InfraBike** : £119
- **10 InfraBike** : £239
- **8 EMS** : £519
- **Fat Freezing 3 sessions × jusqu'à 3 zones/session** : £699 (jusqu'à 9 traitements de zone — vs £1 440 à l'unité = -51%)

### Offres mensuelles (avril 2026 — post-trial only)
- **10 InfraBike post-trial** : £199 (au lieu de £239)
- **Combo 6 InfraBike + 6 EMS post-trial** : £449

> Source de vérité détaillée : `Knowledge_Base/02_packages_de_base.md` + `Knowledge_Base/offres_mensuelles/`.

---

## 4. Horaires d'ouverture

| Jour | Horaires |
|---|---|
| Lundi–Vendredi | 08:00 – 21:00 (sur rendez-vous) |
| Samedi | 08:00 – 17:00 (sur rendez-vous) |
| Dimanche | Fermé |

**Toutes les séances sont sur rendez-vous.** No walk-in.

---

## 5. Voix de marque (résumé)

- **Vouvoyer** par défaut (UK English `you` = vous poli FR)
- Ton **chaleureux mais premium** — jamais hype, jamais agressif
- Pas d'émojis à profusion (1 max par message, ✨ ou 🌿)
- Pas de ALL CAPS
- Promesses **mesurables** ("16% muscle, 19% fat") pas spectaculaires
- Toujours reconnaître la difficulté du parcours avant de vendre

> Référence complète : `Knowledge_Base/03_voix_et_ton.md`.

---

## 6. Skills à utiliser sur ce projet

Quand tu travailles sur Astrabody, les skills suivantes sont prioritaires :

| Skill | Quand l'utiliser |
|---|---|
| `persuasion-psychology` | **Tout** contenu commercial : copy d'ad, email, message WhatsApp, script de vente, lever d'objection, design d'offre. Frameworks Cialdini / Schwartz / Kahneman / Ariely. |
| `landing-page-expert` | Landing pages spécifiquement (psychologie client + structure AIDA) |
| `email-marketing-systemeio` | Séquences email Systeme.io |
| `instagram-content-expert` | Reels, posts, calendriers éditoriaux |
| `paid-ads-expert` | Meta Ads, Google Ads — stratégie + creative briefs |
| `seo-expert` | Audit SEO du site (utile : 5 pages renvoient 404, voir `Astrabody_Site_Audit.md`) |
| `lovable-web-app-expert` | Si on prototype rapidement sur Lovable |
| `ai-automation-expert` | Make.com / n8n / scripts d'automatisation (bot WhatsApp, etc.) |

> Le skill `persuasion-psychology` est le **passe-partout** : il s'applique à tout ce qui vise à convertir un humain.

---

## 7. Stack technique en cours / prévue

| Composant | Tech | État |
|---|---|---|
| Site vitrine actuel | Next.js / Vite + Tailwind + shadcn/ui | ✅ En prod (astrabody.co.uk) |
| Booking actuel | Fresha (pas d'API publique) | ✅ En place — à remplacer |
| Booking custom (futur) | React + Supabase + Stripe + MyPOS | 🔨 Spec prête (`Astrabody_Booking_Platform_Specs.md`) |
| Lead funnel ads | Meta Lead Ads → Webhook → Make.com/n8n | 🔨 Plan prêt (`Infrabike_Lead_Funnel_Automation.md`) |
| Bot WhatsApp | Meta WhatsApp Cloud API + Claude Sonnet 4.6 + Supabase pgvector | 🔨 À construire |
| Email transactionnel | Resend (à connecter à Google Workspace `enquiries@astrabody.co.uk`) | 🔨 À setup |
| Knowledge Base RAG | `Knowledge_Base/*.md` → embeddings → Supabase pgvector | 📁 Structure prête |

---

## 8. Bugs connus du site (priorité SEO)

5 URLs présentes dans le sitemap renvoient 404 :
- `/treatments`
- `/programmes`
- `/about`
- `/contact`
- `/infrabike`

À corriger en priorité — pénalité SEO et mauvaise UX. Voir `Astrabody_Site_Audit.md`.

---

## 9. Garde-fous (à ne JAMAIS franchir)

- ❌ Ne pas inventer un prix qui n'est pas dans `Knowledge_Base/`
- ❌ Ne pas promettre de résultat médical ("perdez 10 kg en 1 mois")
- ❌ Ne pas utiliser blanc/noir/rouge — ce ne sont pas les couleurs Astrabody
- ❌ Ne pas confondre "InfraBike" (Astrabody) et "Infrabike" (autre marque éventuelle)
- ❌ Ne pas appliquer une offre mensuelle hors de sa fenêtre temporelle
- ❌ Ne pas écrire en ton "promo flash bas de gamme" — Astrabody est **premium**

---

## 10. Fichiers clés du projet (où chercher quoi)

```
/Astrabody/
├── CLAUDE.md                              ← TOI ES ICI (à lire en premier)
├── Astrabody_Site_Audit.md                ← Audit Firecrawl du site (couleurs, prix, bugs)
├── Astrabody_Booking_Platform_Specs.md    ← Spec architecture booking custom
├── Infrabike_Lead_Funnel_Automation.md    ← Spec funnel Meta Ads → Make.com
├── Email_Migration_Automation_Guide.md    ← Migration email vers Google Workspace
├── Knowledge_Base/                        ← Source de vérité pour le bot
│   ├── 00_studio_info.md
│   ├── 01_services_catalog.md
│   ├── 02_packages_de_base.md
│   ├── 03_voix_et_ton.md
│   ├── 04_FAQ_objections.md
│   ├── 05_diode_laser_technical.md        ← Connaissance technique laser (4-en-1 Jonte) pour le bot
│   ├── 06_groupon_voucher_flow.md         ← Flow Groupon → booking
│   ├── 07_fat_freezing_M3Pro_technical.md ← Connaissance technique cryolipolyse M3Pro
│   ├── 08_ems_supraSculpt_technical.md    ← Connaissance technique EMS SupraSculpt (français)
│   ├── 09_infrabike_technical.md          ← Connaissance technique vélo infrarouge InfraBike
│   ├── 10_upsell_ladder_playbook.md       ← Logique commerciale conditionnelle par profil cliente
│   ├── offres_mensuelles/
│   │   └── 2026-04_avril.md
│   └── guides_brutes/                     ← Guides scrapés du site (RAG long-tail)
├── persuasion-psychology/SKILL.md         ← Skill réutilisable (Cialdini, Schwartz, etc.)
└── astrabody-trial-funnel/                ← Code Next.js de la landing page trial
```

---

*Dernière mise à jour : 2026-04-26 — après scraping Firecrawl complet et clarification des prix par Nigel.*
