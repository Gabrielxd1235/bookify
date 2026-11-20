#!/usr/bin/env node
/*
 * BOOKIFY - demo catalog: 13 businesses in Lima with logo, cover and gallery
 * photos, opening hours, services with every service model (appointment,
 * subscription, package, day pass) and sample reviews/opinions.
 *
 *   node scripts/seed-demo-businesses.cjs --assets <folder>
 *
 * <folder> must contain:
 *   logos/logo-<slug>.png   (generated logos)
 *   photos/<name>.jpg       (free Unsplash photos, see PHOTO_CREDITS below)
 *
 * Idempotent: a business whose name already exists is skipped. Demo users use
 * the reserved bookify.test domain and random passwords nobody knows (an admin
 * can reset the owner's password from the admin panel to log in as owner).
 *
 * Photos: Unsplash License (free to use). Sample reviews are demo content.
 */
require("dotenv").config();
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const bcrypt = require("bcrypt");
const supabase = require("../src/config/supabase");

const BUCKET = "bookify-business-media";
const argIndex = process.argv.indexOf("--assets");
const ASSETS = argIndex > -1 ? process.argv[argIndex + 1] : null;

if (!ASSETS || !fs.existsSync(ASSETS)) {
  console.error("Usage: node scripts/seed-demo-businesses.cjs --assets <folder with logos/ and photos/>");
  process.exit(1);
}

// weekday: 0 = Sunday ... 6 = Saturday
const HOURS = {
  barber: [[0, null], [1, ["09:00", "20:00", "13:00", "14:00"]], [2, ["09:00", "20:00", "13:00", "14:00"]], [3, ["09:00", "20:00", "13:00", "14:00"]], [4, ["09:00", "20:00", "13:00", "14:00"]], [5, ["09:00", "21:00", "13:00", "14:00"]], [6, ["09:00", "18:00"]]],
  salon: [[0, ["10:00", "14:00"]], [1, ["10:00", "20:00"]], [2, ["10:00", "20:00"]], [3, ["10:00", "20:00"]], [4, ["10:00", "20:00"]], [5, ["10:00", "20:00"]], [6, ["09:00", "19:00"]]],
  spa: [0, 1, 2, 3, 4, 5, 6].map((d) => [d, ["09:00", "21:00"]]),
  massage: [[0, null], [1, ["10:00", "21:00", "14:00", "15:00"]], [2, ["10:00", "21:00", "14:00", "15:00"]], [3, ["10:00", "21:00", "14:00", "15:00"]], [4, ["10:00", "21:00", "14:00", "15:00"]], [5, ["10:00", "21:00", "14:00", "15:00"]], [6, ["10:00", "18:00"]]],
  gym: [[0, ["08:00", "14:00"]], [1, ["06:00", "22:00"]], [2, ["06:00", "22:00"]], [3, ["06:00", "22:00"]], [4, ["06:00", "22:00"]], [5, ["06:00", "22:00"]], [6, ["07:00", "20:00"]]],
  yoga: [[0, null], [1, ["07:00", "21:00"]], [2, ["07:00", "21:00"]], [3, ["07:00", "21:00"]], [4, ["07:00", "21:00"]], [5, ["07:00", "21:00"]], [6, ["08:00", "13:00"]]]
};

const A = (name, price, minutes, description) => ({ name, price, duration_minutes: minutes, service_type: "APPOINTMENT", description });
const SUB = (name, price, period, description) => ({ name, price, duration_minutes: 60, service_type: "SUBSCRIPTION", billing_period: period, description });
const PACK = (name, price, sessions, days, description) => ({ name, price, duration_minutes: 60, service_type: "PACKAGE", sessions_included: sessions, validity_days: days, description });
const DAY = (name, price, description) => ({ name, price, duration_minutes: 60, service_type: "DAY_PASS", description });

const BUSINESSES = [
  { slug: "navaja", category: "Barbershops", hours: "barber", name: "Navaja & Barba Studio", address: "Av. José Larco 812, Miraflores, Lima", phone: "+51 987 210 431",
    description: "Classic barbershop with hot towels, straight razors and style advice. Industrial vibe with exposed brick and good music.",
    photos: ["barber1", "barber2"], services: [A("Classic haircut", 35, 45, "Scissor or clipper cut with wash and styling."), A("Haircut + beard", 55, 60, "Full haircut and beard shaping with a hot towel."), SUB("Monthly Beard Club", 120, "MONTH", "4 haircuts and unlimited beard trims during the month.")] },
  { slug: "gentlemen", category: "Barbershops", hours: "barber", name: "The Gentlemen Barber Co.", address: "Calle Las Begonias 455, San Isidro, Lima", phone: "+51 976 554 120",
    description: "Premium barbershop for professionals: fades, traditional shaves and imported grooming products.",
    photos: ["barber3", "barber4"], services: [A("Premium fade", 40, 45, "Detailed fade with a straight-razor finish."), A("Traditional shave", 30, 30, "Hot-lather shave finished with aftershave balm."), PACK("5-haircut pack", 170, 5, 90, "Five haircuts to use within 90 days.")] },
  { slug: "bigote", category: "Barbershops", hours: "barber", name: "Barbería Don Bigote", address: "Jr. Batallón Ayacucho 271, Barranco, Lima", phone: "+51 954 330 876",
    description: "Neighborhood barbershop with more than 10 years in Barranco. Fair prices and quick service.",
    photos: ["barber5", "barber6"], services: [A("Haircut", 30, 40, "Quick haircut with a clean finish."), A("Beard design", 25, 30, "Beard shaping and design."), SUB("Weekly plan", 45, "WEEK", "Haircut and beard maintenance all week long.")] },
  { slug: "glow", category: "Beauty Salons", hours: "salon", name: "Glow Beauty Lounge", address: "Av. Primavera 1240, Santiago de Surco, Lima", phone: "+51 991 204 557",
    description: "Full-service beauty salon: color, haircuts, hair treatments and event styling.",
    photos: ["hair1", "hair2", "hair4"], services: [A("Haircut and blow-dry", 60, 60, "Wash, personalized cut and blow-dry."), A("Full hair color", 150, 120, "Root-to-tip color with ammonia-free products."), PACK("4 blow-dry pack", 140, 4, 60, "Four blow-dry sessions within 60 days.")] },
  { slug: "nailart", category: "Beauty Salons", hours: "salon", name: "Nail Art Boutique", address: "Calle Schell 320, Miraflores, Lima", phone: "+51 972 118 640",
    description: "Hand-painted nail art, gel and acrylic manicures and pedicures. Hospital-grade tool sterilization.",
    photos: ["nail1", "nail2", "nail3"], services: [A("Gel manicure", 45, 60, "Cleaning, gel polish and a simple design."), A("Spa pedicure", 55, 60, "Exfoliation, hydration and polish."), SUB("Monthly nail membership", 160, "MONTH", "A gel manicure every week for a month.")] },
  { slug: "belladonna", category: "Beauty Salons", hours: "salon", name: "Studio Bella Donna", address: "Av. Salaverry 2050, Jesús María, Lima", phone: "+51 965 447 302",
    description: "Makeup and hairstyling studio for weddings, graduations and social events.",
    photos: ["hair3", "hair5", "hair6"], services: [A("Keratin straightening", 220, 150, "Keratin treatment with heat sealing."), A("Event makeup", 90, 60, "Professional makeup for special occasions."), A("Event hairstyle", 80, 60, "Updos, waves or half-up styles.")] },
  { slug: "zen", category: "Spas", hours: "spa", name: "Zen Garden Spa", address: "Av. Camino Real 390, San Isidro, Lima", phone: "+51 989 330 145",
    description: "Urban spa with a water circuit, sauna and facial treatments inside an indoor garden.",
    photos: ["spa1", "spa2", "spa5"], services: [DAY("Water circuit (full day)", 85, "All-day access to the sauna, jacuzzi and relaxation area."), A("Hydrating facial", 120, 60, "Deep cleansing and hydration with a face mask."), SUB("Monthly relax membership", 280, "MONTH", "Unlimited circuit access and one facial per month.")] },
  { slug: "aqua", category: "Spas", hours: "spa", name: "Aqua Serena Day Spa", address: "Av. La Molina 1105, La Molina, Lima", phone: "+51 958 902 311",
    description: "Family day spa with a heated pool, hot stone massages and couples rituals.",
    photos: ["spa3", "spa4", "spa6"], services: [DAY("Spa day pass", 99, "Heated pool, sauna and bathrobe included."), A("Hot stone massage", 150, 75, "Relaxing massage with volcanic stones."), PACK("3-ritual pack", 390, 3, 120, "Three spa rituals within four months.")] },
  { slug: "manos", category: "Massage Centers", hours: "massage", name: "Manos de Seda Masajes", address: "Av. Arequipa 2640, Lince, Lima", phone: "+51 943 776 018",
    description: "Therapeutic and relaxing massage center with certified therapists.",
    photos: ["mass1", "mass2", "mass4"], services: [A("Relaxing massage", 90, 60, "Full-body massage with essential oils."), A("Deep tissue massage", 110, 60, "Focused work on back, neck and shoulders."), PACK("4-massage pack", 360, 4, 90, "Four 60-minute massages within 90 days.")] },
  { slug: "thai", category: "Massage Centers", hours: "massage", name: "Thai Balance Center", address: "Calle Berlín 545, Miraflores, Lima", phone: "+51 936 510 284",
    description: "Traditional Thai massage and reflexology in a space inspired by Chiang Mai.",
    photos: ["mass3", "mass5", "mass6"], services: [A("Thai massage", 130, 90, "Stretching and pressure on energy points."), A("Foot reflexology", 70, 45, "Foot massage using reflexology techniques."), SUB("Monthly wellness plan", 320, "MONTH", "One Thai massage per week for a month.")] },
  { slug: "iron", category: "Gyms", hours: "gym", name: "Iron Pulse Fitness", address: "Av. Caminos del Inca 1410, Santiago de Surco, Lima", phone: "+51 981 667 230",
    description: "Strength gym with a free-weights area, cardio zone and coaches on the floor.",
    photos: ["gym1", "gym3", "gym4"], services: [SUB("Monthly membership", 129, "MONTH", "Unlimited access to the weights and cardio area."), DAY("Day pass", 20, "Train for a whole day without a membership."), SUB("Quarterly plan", 349, "QUARTER", "Three months of access with a fitness assessment.")] },
  { slug: "fitzone", category: "Gyms", hours: "gym", name: "FitZone 24/7", address: "Av. San Luis 2020, San Borja, Lima", phone: "+51 977 845 019",
    description: "Modern gym with state-of-the-art machines, group classes and personal training.",
    photos: ["gym2", "gym5", "gym6"], services: [SUB("Monthly membership", 99, "MONTH", "Access to machines and group classes."), SUB("Annual membership", 990, "YEAR", "Twelve months for the price of ten."), A("Personal training", 60, 60, "One-on-one session with a certified trainer.")] },
  { slug: "prana", category: "Gyms", hours: "yoga", name: "Prana Yoga & Pilates", address: "Av. Grau 315, Barranco, Lima", phone: "+51 962 140 733",
    description: "Yoga, pilates and meditation studio with natural light and small groups.",
    photos: ["yoga1", "yoga2", "yoga4"], services: [A("Yoga class", 35, 60, "Guided hatha or vinyasa class."), PACK("8-class pack", 240, 8, 60, "Eight classes to use within two months."), SUB("Unlimited monthly", 199, "MONTH", "Every yoga and pilates class for a month.")] }
];

const REVIEWERS = ["Lucía Fernández", "Diego Ramírez", "Valeria Quispe", "Andrés Salazar", "Camila Torres", "Mateo Gutiérrez", "Sofía Mendoza", "Joaquín Paredes", "Daniela Rojas", "Renzo Castillo"];

const COMMENTS = {
  5: ["Excellent service, very punctual and the place is spotless.", "I booked on BOOKIFY in a minute and they saw me right on time.", "The best service I have tried in Lima. I will definitely be back.", "Very friendly and professional staff. Highly recommended.", "I paid 50% online and the rest at the shop. Super convenient."],
  4: ["Very good service, I only had to wait a few minutes.", "Good value for money and a pleasant atmosphere.", "I really liked it, although parking is a bit tricky.", "Warm service and a great result."],
  3: ["The service was fine, but the place was rather crowded.", "Decent, although I expected a bit more for the price."]
};

const PLATFORM_OPINIONS = [
  [5, "I found a barbershop near my office and booked it in seconds. I love paying half online and the rest at the shop."],
  [5, "As a salon owner, BOOKIFY organized my appointments and I no longer lose bookings over WhatsApp."],
  [4, "Very easy to use on my phone. I would love to see even more spas in my district."],
  [5, "The 5-minute payment timer stops anyone from holding my time slot. Everything is very clear."],
  [5, "I could compare gyms by their reviews and membership prices before signing up."],
  [4, "Great experience: I booked a massage for my mom and paid everything online with no hassle."]
];

function pick(list, seed) {
  return list[seed % list.length];
}

function hash(text) {
  return [...text].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
}

async function ensureUser(fullName, email, role) {
  const { data: found, error } = await supabase.from("users").select("id").eq("email", email).maybeSingle();
  if (error) throw error;
  if (found) return found.id;

  // Random password nobody knows (cost 10): an admin can reset it if needed
  const password_hash = await bcrypt.hash(crypto.randomBytes(24).toString("base64url"), 10);
  const { data, error: insertError } = await supabase
    .from("users")
    .insert({ full_name: fullName, email, password_hash, role, is_active: true })
    .select("id")
    .single();
  if (insertError) throw insertError;
  return data.id;
}

async function upload(businessId, kind, file, contentType) {
  const ext = contentType === "image/png" ? "png" : "jpg";
  const storagePath = `businesses/${businessId}/${kind}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(storagePath, fs.readFileSync(file), {
    contentType,
    cacheControl: "86400",
    upsert: false
  });
  if (error) throw new Error(`Upload ${file}: ${error.message}`);
  return storagePath;
}

async function main() {
  const { data: categories, error: catError } = await supabase.from("categories").select("id, name");
  if (catError) throw catError;
  const categoryId = (name) => {
    const found = categories.find((c) => c.name.trim().toLowerCase() === name.toLowerCase());
    if (!found) throw new Error(`Category not found: ${name}`);
    return found.id;
  };

  const ownerId = await ensureUser("BOOKIFY Partners Lima", "partners.lima@bookify.test", "BUSINESS_OWNER");
  const reviewerIds = [];
  for (const [i, name] of REVIEWERS.entries()) {
    reviewerIds.push(await ensureUser(name, `demo.reviewer${i + 1}@bookify.test`, "CLIENT"));
  }

  let created = 0;

  for (const spec of BUSINESSES) {
    const { data: existing } = await supabase.from("businesses").select("id").eq("name", spec.name).maybeSingle();
    if (existing) {
      console.log(`skip  ${spec.name} (already exists, id ${existing.id})`);
      continue;
    }

    const { data: business, error } = await supabase
      .from("businesses")
      .insert({
        owner_id: ownerId,
        category_id: categoryId(spec.category),
        name: spec.name,
        description: spec.description,
        address: spec.address,
        phone: spec.phone,
        is_active: true
      })
      .select("id")
      .single();
    if (error) throw error;

    const id = business.id;
    const logoPath = await upload(id, "logo", path.join(ASSETS, "logos", `logo-${spec.slug}.png`), "image/png");
    const [coverName, ...galleryNames] = spec.photos;
    const coverPath = await upload(id, "cover", path.join(ASSETS, "photos", `${coverName}.jpg`), "image/jpeg");

    const { error: mediaError } = await supabase.from("businesses").update({ logo_path: logoPath, cover_path: coverPath }).eq("id", id);
    if (mediaError) throw mediaError;

    const gallery = [];
    for (const [i, photo] of [coverName, ...galleryNames].entries()) {
      gallery.push({ business_id: id, storage_path: await upload(id, "gallery", path.join(ASSETS, "photos", `${photo}.jpg`), "image/jpeg"), caption: i === 0 ? "Our space" : null, sort_order: i });
    }
    const { error: galleryError } = await supabase.from("business_images").insert(gallery);
    if (galleryError) throw galleryError;

    const hours = HOURS[spec.hours].map(([weekday, h]) => h
      ? { business_id: id, weekday, opens_at: h[0], closes_at: h[1], is_closed: false, break_starts_at: h[2] || null, break_ends_at: h[3] || null }
      : { business_id: id, weekday, opens_at: null, closes_at: null, is_closed: true, break_starts_at: null, break_ends_at: null });
    const { error: hoursError } = await supabase.from("business_hours").insert(hours);
    if (hoursError) throw hoursError;

    const { error: servicesError } = await supabase.from("services").insert(spec.services.map((s) => ({ ...s, business_id: id, is_active: true })));
    if (servicesError) throw servicesError;

    // 4 to 7 demo reviews, mostly 4-5 stars
    const seed = hash(spec.slug);
    const count = 4 + (seed % 4);
    const reviews = [];
    for (let i = 0; i < count; i++) {
      const rating = [5, 5, 4, 5, 4, 3, 5][(seed + i) % 7];
      const daysAgo = 3 + ((seed >> (i % 8)) % 60) + i * 4;
      const createdAt = new Date(Date.now() - daysAgo * 86400000).toISOString();
      reviews.push({ business_id: id, user_id: reviewerIds[(seed + i * 3) % reviewerIds.length], rating, comment: pick(COMMENTS[rating], seed + i), is_verified: false, created_at: createdAt, updated_at: createdAt });
    }
    const unique = [...new Map(reviews.map((r) => [r.user_id, r])).values()];
    const { error: reviewError } = await supabase.from("business_reviews").insert(unique);
    if (reviewError) throw reviewError;

    created += 1;
    console.log(`ok    ${spec.name} (id ${id}) · ${spec.services.length} services · ${gallery.length} photos · ${unique.length} reviews`);
  }

  // Opinions about BOOKIFY (one per demo user)
  const opinions = PLATFORM_OPINIONS.map(([rating, comment], i) => ({ user_id: reviewerIds[i], rating, comment, is_published: true, created_at: new Date(Date.now() - (i * 5 + 2) * 86400000).toISOString() }));
  const { error: opinionError } = await supabase.from("platform_reviews").upsert(opinions, { onConflict: "user_id", ignoreDuplicates: true });
  if (opinionError) throw opinionError;

  console.log(`\nBusinesses created: ${created} of ${BUSINESSES.length}. Platform opinions: ${opinions.length}.`);
}

main().catch((error) => {
  console.error("Seed failed:", error.message || error);
  process.exit(1);
});
