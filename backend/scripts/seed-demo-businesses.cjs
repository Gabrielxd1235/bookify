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
    description: "Barbería clásica con toallas calientes, navaja y asesoría de estilo. Ambiente industrial con ladrillo visto y buena música.",
    photos: ["barber1", "barber2"], services: [A("Corte clásico", 35, 45, "Corte a tijera o máquina con lavado y peinado."), A("Corte + barba", 55, 60, "Corte completo y perfilado de barba con toalla caliente."), SUB("Club Barba mensual", 120, "MONTH", "4 cortes y arreglos de barba ilimitados durante el mes.")] },
  { slug: "gentlemen", category: "Barbershops", hours: "barber", name: "The Gentlemen Barber Co.", address: "Calle Las Begonias 455, San Isidro, Lima", phone: "+51 976 554 120",
    description: "Barbería premium para ejecutivos: fade, afeitado tradicional y productos de grooming importados.",
    photos: ["barber3", "barber4"], services: [A("Fade premium", 40, 45, "Degradado a detalle con acabado a navaja."), A("Afeitado tradicional", 30, 30, "Afeitado con espuma caliente y bálsamo."), PACK("Pack 5 cortes", 170, 5, 90, "Cinco cortes para usar en 90 días.")] },
  { slug: "bigote", category: "Barbershops", hours: "barber", name: "Barbería Don Bigote", address: "Jr. Batallón Ayacucho 271, Barranco, Lima", phone: "+51 954 330 876",
    description: "Barbería de barrio con más de 10 años en Barranco. Precios justos y atención rápida.",
    photos: ["barber5", "barber6"], services: [A("Corte de cabello", 30, 40, "Corte rápido con acabado limpio."), A("Diseño de barba", 25, 30, "Perfilado y diseño de barba."), SUB("Plan semanal", 45, "WEEK", "Mantenimiento de corte y barba toda la semana.")] },
  { slug: "glow", category: "Beauty Salons", hours: "salon", name: "Glow Beauty Lounge", address: "Av. Primavera 1240, Santiago de Surco, Lima", phone: "+51 991 204 557",
    description: "Salón de belleza integral: color, cortes, tratamientos capilares y peinados para eventos.",
    photos: ["hair1", "hair2", "hair4"], services: [A("Corte y brushing", 60, 60, "Lavado, corte personalizado y brushing."), A("Tinte completo", 150, 120, "Color de raíz a puntas con productos sin amoníaco."), PACK("Pack 4 brushing", 140, 4, 60, "Cuatro sesiones de brushing en 60 días.")] },
  { slug: "nailart", category: "Beauty Salons", hours: "salon", name: "Nail Art Boutique", address: "Calle Schell 320, Miraflores, Lima", phone: "+51 972 118 640",
    description: "Manicure y pedicure con diseños a mano, gel y acrílico. Esterilización hospitalaria de herramientas.",
    photos: ["nail1", "nail2", "nail3"], services: [A("Manicure en gel", 45, 60, "Limpieza, esmaltado en gel y diseño simple."), A("Pedicure spa", 55, 60, "Exfoliación, hidratación y esmaltado."), SUB("Membresía uñas mensual", 160, "MONTH", "Manicure en gel cada semana durante el mes.")] },
  { slug: "belladonna", category: "Beauty Salons", hours: "salon", name: "Studio Bella Donna", address: "Av. Salaverry 2050, Jesús María, Lima", phone: "+51 965 447 302",
    description: "Estudio de maquillaje y peinado para novias, graduaciones y eventos sociales.",
    photos: ["hair3", "hair5", "hair6"], services: [A("Alisado con keratina", 220, 150, "Tratamiento de keratina con sellado térmico."), A("Maquillaje social", 90, 60, "Maquillaje profesional para eventos."), A("Peinado de evento", 80, 60, "Recogidos, ondas o semirecogidos.")] },
  { slug: "zen", category: "Spas", hours: "spa", name: "Zen Garden Spa", address: "Av. Camino Real 390, San Isidro, Lima", phone: "+51 989 330 145",
    description: "Spa urbano con circuito de aguas, sauna y tratamientos faciales en un jardín interior.",
    photos: ["spa1", "spa2", "spa5"], services: [DAY("Circuito de aguas (día completo)", 85, "Acceso a sauna, jacuzzi y zona de relajación todo el día."), A("Facial hidratante", 120, 60, "Limpieza profunda e hidratación con mascarilla."), SUB("Membresía relax mensual", 280, "MONTH", "Circuito ilimitado y un facial al mes.")] },
  { slug: "aqua", category: "Spas", hours: "spa", name: "Aqua Serena Day Spa", address: "Av. La Molina 1105, La Molina, Lima", phone: "+51 958 902 311",
    description: "Day spa familiar con piscina temperada, piedras calientes y rituales para parejas.",
    photos: ["spa3", "spa4", "spa6"], services: [DAY("Day pass spa", 99, "Piscina temperada, sauna y bata incluida."), A("Masaje con piedras calientes", 150, 75, "Masaje relajante con piedras volcánicas."), PACK("Pack 3 rituales", 390, 3, 120, "Tres rituales de spa en cuatro meses.")] },
  { slug: "manos", category: "Massage Centers", hours: "massage", name: "Manos de Seda Masajes", address: "Av. Arequipa 2640, Lince, Lima", phone: "+51 943 776 018",
    description: "Centro de masajes terapéuticos y relajantes con terapeutas certificados.",
    photos: ["mass1", "mass2", "mass4"], services: [A("Masaje relajante", 90, 60, "Masaje de cuerpo completo con aceites esenciales."), A("Masaje descontracturante", 110, 60, "Trabajo profundo en espalda, cuello y hombros."), PACK("Pack 4 masajes", 360, 4, 90, "Cuatro masajes de 60 minutos en 90 días.")] },
  { slug: "thai", category: "Massage Centers", hours: "massage", name: "Thai Balance Center", address: "Calle Berlín 545, Miraflores, Lima", phone: "+51 936 510 284",
    description: "Masaje tailandés tradicional y reflexología en un espacio inspirado en Chiang Mai.",
    photos: ["mass3", "mass5", "mass6"], services: [A("Masaje tailandés", 130, 90, "Estiramientos y presión en puntos de energía."), A("Reflexología podal", 70, 45, "Masaje de pies con técnica de reflexología."), SUB("Plan bienestar mensual", 320, "MONTH", "Un masaje tailandés por semana durante el mes.")] },
  { slug: "iron", category: "Gyms", hours: "gym", name: "Iron Pulse Fitness", address: "Av. Caminos del Inca 1410, Santiago de Surco, Lima", phone: "+51 981 667 230",
    description: "Gimnasio de fuerza con zona de peso libre, cardio y entrenadores en sala.",
    photos: ["gym1", "gym3", "gym4"], services: [SUB("Membresía mensual", 129, "MONTH", "Acceso libre a sala de pesas y cardio."), DAY("Pase diario", 20, "Entrena un día completo sin membresía."), SUB("Plan trimestral", 349, "QUARTER", "Tres meses de acceso con evaluación física.")] },
  { slug: "fitzone", category: "Gyms", hours: "gym", name: "FitZone 24/7", address: "Av. San Luis 2020, San Borja, Lima", phone: "+51 977 845 019",
    description: "Gimnasio moderno con máquinas de última generación, clases grupales y entrenamiento personal.",
    photos: ["gym2", "gym5", "gym6"], services: [SUB("Membresía mensual", 99, "MONTH", "Acceso a máquinas y clases grupales."), SUB("Membresía anual", 990, "YEAR", "Doce meses al precio de diez."), A("Entrenamiento personal", 60, 60, "Sesión uno a uno con entrenador certificado.")] },
  { slug: "prana", category: "Gyms", hours: "yoga", name: "Prana Yoga & Pilates", address: "Av. Grau 315, Barranco, Lima", phone: "+51 962 140 733",
    description: "Estudio de yoga, pilates y meditación con luz natural y grupos reducidos.",
    photos: ["yoga1", "yoga2", "yoga4"], services: [A("Clase de yoga", 35, 60, "Clase guiada de hatha o vinyasa."), PACK("Pack 8 clases", 240, 8, 60, "Ocho clases para usar en dos meses."), SUB("Mensual ilimitado", 199, "MONTH", "Todas las clases de yoga y pilates del mes.")] }
];

const REVIEWERS = ["Lucía Fernández", "Diego Ramírez", "Valeria Quispe", "Andrés Salazar", "Camila Torres", "Mateo Gutiérrez", "Sofía Mendoza", "Joaquín Paredes", "Daniela Rojas", "Renzo Castillo"];

const COMMENTS = {
  5: ["Excelente atención, muy puntuales y el lugar impecable.", "Reservé por BOOKIFY en un minuto y me atendieron a la hora exacta.", "El mejor servicio que he probado en Lima, volveré seguro.", "Personal muy amable y profesional. Totalmente recomendado.", "Pagué el 50% online y el resto en el local, súper práctico."],
  4: ["Muy buen servicio, solo tuve que esperar unos minutos.", "Buena relación calidad-precio y ambiente agradable.", "Me gustó mucho, aunque el estacionamiento es complicado.", "Atención cálida y resultado muy bueno."],
  3: ["El servicio estuvo bien, pero el local estaba algo lleno.", "Correcto, aunque esperaba un poco más por el precio."]
};

const PLATFORM_OPINIONS = [
  [5, "Encontré una barbería cerca de mi trabajo y reservé en segundos. Me encanta poder pagar la mitad online y el resto en el local."],
  [5, "Como dueña de un salón, BOOKIFY me ordenó las citas y ya no tengo reservas perdidas por WhatsApp."],
  [4, "Muy fácil de usar desde el celular. Me gustaría ver aún más spas en mi distrito."],
  [5, "El temporizador de pago de 5 minutos evita que alguien se quede con mi horario. Todo muy claro."],
  [5, "Pude comparar gimnasios por sus reseñas y precios de membresía antes de inscribirme."],
  [4, "Buena experiencia: reservé un masaje para mi mamá y pagué todo online sin complicaciones."]
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
      gallery.push({ business_id: id, storage_path: await upload(id, "gallery", path.join(ASSETS, "photos", `${photo}.jpg`), "image/jpeg"), caption: i === 0 ? "Nuestro espacio" : null, sort_order: i });
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
