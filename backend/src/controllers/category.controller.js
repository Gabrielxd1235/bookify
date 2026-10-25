
const supabase = require("../config/supabase");

// GET /api/categories
const getCategories = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("categories")
      .select("id, name, description, created_at")
      .order("name", { ascending: true })
      .limit(100);

    if (error) {
      console.error("Error listando categorías:", error.message);
      return res.status(500).json({
        success: false,
        message: "No se pudieron obtener las categorías"
      });
    }

    return res.status(200).json({
      success: true,
      total: data.length,
      categories: data
    });
  } catch (error) {
    console.error("Error interno:", error.message);
    return res.status(500).json({
      success: false,
      message: "Error interno del servidor"
    });
  }
};

// GET /api/categories/:id
const getCategoryById = async (req, res) => {
  const id = req.params.id;

  if (!/^[1-9]\d*$/.test(id)) {
    return res.status(400).json({
      success: false,
      message: "ID de categoría inválido"
    });
  }

  try {
    const { data, error } = await supabase
      .from("categories")
      .select("id, name, description, created_at")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      console.error("Error consultando categoría:", error.message);
      return res.status(500).json({
        success: false,
        message: "No se pudo consultar la categoría"
      });
    }

    if (!data) {
      return res.status(404).json({
        success: false,
        message: "Categoría no encontrada"
      });
    }

    return res.status(200).json({
      success: true,
      category: data
    });
  } catch (error) {
    console.error("Error interno:", error.message);
    return res.status(500).json({
      success: false,
      message: "Error interno del servidor"
    });
  }
};

// POST /api/categories - Solo ADMIN
const createCategory = async (req, res) => {
  const { name, description } = req.body || {};

  if (typeof name !== "string") {
    return res.status(400).json({
      success: false,
      message: "El nombre de la categoría es obligatorio"
    });
  }

  const cleanName = name.trim();

  if (cleanName.length < 2 || cleanName.length > 100) {
    return res.status(400).json({
      success: false,
      message: "El nombre debe tener entre 2 y 100 caracteres"
    });
  }

  if (
    description !== undefined &&
    description !== null &&
    typeof description !== "string"
  ) {
    return res.status(400).json({
      success: false,
      message: "La descripción debe ser texto"
    });
  }

  const cleanDescription = typeof description === "string"
    ? description.trim()
    : null;

  try {
    const { data, error } = await supabase
      .from("categories")
      .insert({
        name: cleanName,
        description: cleanDescription
      })
      .select("id, name, description, created_at")
      .single();

    if (error) {
      if (error.code === "23505") {
        return res.status(409).json({
          success: false,
          message: "La categoría ya existe"
        });
      }

      console.error("Error creando categoría:", error.message);
      return res.status(500).json({
        success: false,
        message: "No se pudo crear la categoría"
      });
    }

    return res.status(201).json({
      success: true,
      message: "Categoría creada correctamente",
      category: data
    });
  } catch (error) {
    console.error("Error interno:", error.message);
    return res.status(500).json({
      success: false,
      message: "Error interno del servidor"
    });
  }
};

module.exports = {
  getCategories,
  getCategoryById,
  createCategory
};
