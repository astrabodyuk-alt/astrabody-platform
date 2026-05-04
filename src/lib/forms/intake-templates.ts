/**
 * Pre-built intake form templates. Keep field IDs stable — the form
 * builder clones these on use, so re-numbering would break in-flight
 * drafts. Generate fresh UUIDs in the builder when persisting; these
 * IDs are template-side only.
 */
import type { IntakeField } from "./shared";

export interface IntakeTemplate {
  slug: string;
  name: string;
  description: string;
  fields: IntakeField[];
}

const yesNo = (id: string, label: string, required = true): IntakeField => ({
  id,
  type: "yes_no",
  label,
  required,
});

export const INTAKE_TEMPLATES: IntakeTemplate[] = [
  {
    slug: "fat-freezing-health",
    name: "Fat Freezing — Standard Health Check",
    description:
      "Ten yes/no questions covering cardiovascular health, pregnancy, implants, and recent surgery.",
    fields: [
      yesNo("ff-1", "Do you have any cardiovascular conditions?"),
      yesNo("ff-2", "Do you have a pacemaker or any electronic implants?"),
      yesNo("ff-3", "Are you pregnant or breastfeeding?"),
      yesNo("ff-4", "Have you had any surgery in the last 6 months?"),
      yesNo(
        "ff-5",
        "Do you have any skin conditions in the treatment area (eczema, psoriasis, open wounds)?"
      ),
      yesNo("ff-6", "Do you have any cold-related conditions (Raynaud's, cryoglobulinemia)?"),
      yesNo("ff-7", "Do you have a hernia in or near the treatment area?"),
      yesNo("ff-8", "Are you currently taking any blood-thinning medication?"),
      yesNo("ff-9", "Do you have any active infection or inflammation?"),
      yesNo(
        "ff-10",
        "Have you had any cosmetic injectables in the treatment area in the last 4 weeks?"
      ),
      {
        id: "ff-notes",
        type: "textarea",
        label: "Anything else we should know before your session?",
        required: false,
      },
      {
        id: "ff-sig",
        type: "signature",
        label: "Signature",
        required: true,
      },
    ],
  },
  {
    slug: "laser-hair-skin",
    name: "Laser Hair Removal — Skin Assessment",
    description:
      "Fitzpatrick skin type, recent sun exposure, medications, and previous laser history.",
    fields: [
      {
        id: "lh-fitz",
        type: "multiple_choice",
        label: "Fitzpatrick skin type",
        required: true,
        options: [
          "I — Always burns, never tans",
          "II — Usually burns, tans minimally",
          "III — Sometimes burns, tans gradually",
          "IV — Rarely burns, tans easily",
          "V — Very rarely burns, tans deeply",
          "VI — Never burns, deeply pigmented",
        ],
      },
      yesNo("lh-1", "Have you been sunbathing or used a tanning bed in the last 4 weeks?"),
      yesNo("lh-2", "Are you taking any photosensitising medication (e.g. roaccutane, retinoids, doxycycline)?"),
      yesNo("lh-3", "Have you had laser hair removal anywhere on your body before?"),
      yesNo("lh-4", "Are you pregnant or breastfeeding?"),
      yesNo("lh-5", "Do you have any tattoos in the treatment area?"),
      yesNo("lh-6", "Do you have a history of keloid scarring?"),
      yesNo("lh-7", "Do you have any active skin condition or infection in the treatment area?"),
      {
        id: "lh-notes",
        type: "textarea",
        label: "Any allergies or skin sensitivities we should know about?",
        required: false,
      },
      {
        id: "lh-sig",
        type: "signature",
        label: "Signature",
        required: true,
      },
    ],
  },
  {
    slug: "ems-fitness-baseline",
    name: "EMS Body Sculpting — Fitness Baseline",
    description: "Muscle conditions, implants, recent injuries, and a quick fitness baseline.",
    fields: [
      yesNo("ems-1", "Do you have any neuromuscular conditions (epilepsy, MS, muscular dystrophy)?"),
      yesNo("ems-2", "Do you have a pacemaker or any electronic implants?"),
      yesNo("ems-3", "Do you have any metal implants (excluding small dental work)?"),
      yesNo("ems-4", "Are you pregnant or within 3 months postpartum?"),
      yesNo("ems-5", "Have you had any abdominal or pelvic surgery in the last 6 months?"),
      yesNo("ems-6", "Do you have any current muscle, tendon or joint injury?"),
      {
        id: "ems-fitness",
        type: "multiple_choice",
        label: "How would you describe your current fitness level?",
        required: true,
        options: [
          "Sedentary — minimal regular activity",
          "Light — walks, occasional gym",
          "Moderate — 2–3 sessions a week",
          "Active — 4+ sessions a week",
          "Very active — daily training",
        ],
      },
      {
        id: "ems-goals",
        type: "textarea",
        label: "What are you hoping to get out of these sessions?",
        required: false,
      },
      {
        id: "ems-sig",
        type: "signature",
        label: "Signature",
        required: true,
      },
    ],
  },
  {
    slug: "general-wellness",
    name: "General Wellness — Intake",
    description: "Five short open questions for any first-time wellness session.",
    fields: [
      {
        id: "gw-goals",
        type: "textarea",
        label: "What are your main goals for this session?",
        required: true,
      },
      {
        id: "gw-health",
        type: "textarea",
        label: "Any health concerns or conditions we should know about?",
        required: true,
      },
      {
        id: "gw-prev",
        type: "textarea",
        label: "Have you had similar treatments before? How did they go?",
        required: false,
      },
      {
        id: "gw-allergies",
        type: "textarea",
        label: "Any allergies, sensitivities or medications?",
        required: false,
      },
      {
        id: "gw-anything",
        type: "textarea",
        label: "Anything else you'd like us to know?",
        required: false,
      },
      {
        id: "gw-sig",
        type: "signature",
        label: "Signature",
        required: true,
      },
    ],
  },
];

export function findTemplate(slug: string): IntakeTemplate | undefined {
  return INTAKE_TEMPLATES.find((t) => t.slug === slug);
}
