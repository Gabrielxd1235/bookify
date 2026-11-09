const supabase = require("../config/supabase");

// Database fields returned by category queries
const CATEGORY_FIELDS = "id, name, description, created_at";

// Validate positive database IDs
const isValidId = (id) => /^[1-9]\d*$/.test(String(id));

// Validate category information
const validateCategory = (body, partial = false) => {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { error: "Invalid request body" };
  }

  const hasName = Object.prototype.hasOwnProperty.call(
    body,
    "name"
  );

  const hasDescription = Object.prototype.hasOwnProperty.call(
    body,
    "description"
  );

  if (partial && !hasName && !hasDescription) {
    return { error: "At least one field must be provided" };
  }

  const values = {};

  // Validate category name
  if (!partial || hasName) {
    if (typeof body.name !== "string") {
      return { error: "Category name is required" };
    }

    const name = body.name.trim();

    if (name.length < 2 || name.length > 100) {
      return {
        error: "Category name must contain between 2 and 100 characters"
      };
    }

    values.name = name;
  }

  // Validate category description
  if (hasDescription) {
    if (
      body.description !== null &&
      typeof body.description !== "string"
    ) {
      return {
        error: "Description must be a string or null"
      };
    }

    values.description =
      typeof body.description === "string"
        ? body.description.trim()
        : null;

  } else if (!partial) {
    values.description = null;
  }

  return { values };
};

// GET /api/categories?page=1&limit=10
const getCategories = async (req, res) => {
  const page = Number(req.query.page ?? 1);
  const limit = Number(req.query.limit ?? 100);

  // Validate pagination parameters
  if (
    !Number.isSafeInteger(page) ||
    !Number.isSafeInteger(limit) ||
    page < 1 ||
    limit < 1 ||
    limit > 100
  ) {
    return res.status(400).json({
      success: false,
      message: "Invalid pagination parameters"
    });
  }

  // Calculate the requested pagination range
  const start = (page - 1) * limit;
  const end = start + limit - 1;

  // Prevent unsafe pagination ranges
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end)
  ) {
    return res.status(400).json({
      success: false,
      message: "Pagination range is too large"
    });
  }

  try {
    // Retrieve the total number of categories
    const {
      count: total,
      error: countError
    } = await supabase
      .from("categories")
      .select("id", {
        count: "exact",
        head: true
      });

    // Handle database counting errors
    if (countError) {
      console.error(
        "Category count error:",
        countError.code,
        countError.message
      );

      return res.status(500).json({
        success: false,
        message: "Unable to retrieve categories"
      });
    }

    const totalCategories = total ?? 0;

    const totalPages = Math.ceil(
      totalCategories / limit
    );

    // Return an empty page if the requested range
    // starts beyond the available records
    if (start >= totalCategories) {
      return res.status(200).json({
        success: true,
        total: totalCategories,
        categories: [],
        pagination: {
          page,
          limit,
          totalPages
        }
      });
    }

    // Retrieve the requested category page
    const {
      data,
      error
    } = await supabase
      .from("categories")
      .select(CATEGORY_FIELDS)
      .order("name", {
        ascending: true
      })
      .order("id", {
        ascending: true
      })
      .range(start, end);

    if (error) {
      // Handle records changing between the count
      // query and the paginated query
      if (error.code === "PGRST103") {
        const {
          count: updatedTotal,
          error: updatedCountError
        } = await supabase
          .from("categories")
          .select("id", {
            count: "exact",
            head: true
          });

        if (
          !updatedCountError &&
          start >= (updatedTotal ?? 0)
        ) {
          const currentTotal = updatedTotal ?? 0;

          return res.status(200).json({
            success: true,
            total: currentTotal,
            categories: [],
            pagination: {
              page,
              limit,
              totalPages: Math.ceil(
                currentTotal / limit
              )
            }
          });
        }

        if (updatedCountError) {
          console.error(
            "Category recount error:",
            updatedCountError.code,
            updatedCountError.message
          );
        }
      }

      // Preserve genuine database errors
      console.error(
        "Error retrieving categories:",
        error.code,
        error.message
      );

      return res.status(500).json({
        success: false,
        message: "Unable to retrieve categories"
      });
    }

    // Return categories with pagination metadata
    return res.status(200).json({
      success: true,
      total: totalCategories,
      categories: data ?? [],
      pagination: {
        page,
        limit,
        totalPages
      }
    });

  } catch (error) {
    console.error(
      "Internal category error:",
      error.message
    );

    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
};

// GET /api/categories/:id
const getCategoryById = async (req, res) => {
  const { id } = req.params;

  // Validate category ID
  if (!isValidId(id)) {
    return res.status(400).json({
      success: false,
      message: "Invalid category ID"
    });
  }

  try {
    const { data, error } = await supabase
      .from("categories")
      .select(CATEGORY_FIELDS)
      .eq("id", id)
      .maybeSingle();

    if (error) {
      console.error(
        "Error retrieving category:",
        error.message
      );

      return res.status(500).json({
        success: false,
        message: "Unable to retrieve category"
      });
    }

    // Handle categories that do not exist
    if (!data) {
      return res.status(404).json({
        success: false,
        message: "Category not found"
      });
    }

    return res.status(200).json({
      success: true,
      category: data
    });

  } catch (error) {
    console.error(
      "Internal category error:",
      error.message
    );

    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
};

// POST /api/categories
const createCategory = async (req, res) => {
  const validation = validateCategory(req.body);

  // Validate category data
  if (validation.error) {
    return res.status(400).json({
      success: false,
      message: validation.error
    });
  }

  try {
    const { data, error } = await supabase
      .from("categories")
      .insert(validation.values)
      .select(CATEGORY_FIELDS)
      .single();

    if (error) {
      // Handle duplicate category names
      if (error.code === "23505") {
        return res.status(409).json({
          success: false,
          message: "Category already exists"
        });
      }

      console.error(
        "Error creating category:",
        error.message
      );

      return res.status(500).json({
        success: false,
        message: "Unable to create category"
      });
    }

    return res.status(201).json({
      success: true,
      message: "Category created successfully",
      category: data
    });

  } catch (error) {
    console.error(
      "Internal category error:",
      error.message
    );

    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
};

// PUT /api/categories/:id
const updateCategory = async (req, res) => {
  const { id } = req.params;

  // Validate category ID
  if (!isValidId(id)) {
    return res.status(400).json({
      success: false,
      message: "Invalid category ID"
    });
  }

  // Validate fields provided for updating
  const validation = validateCategory(req.body, true);

  if (validation.error) {
    return res.status(400).json({
      success: false,
      message: validation.error
    });
  }

  try {
    const { data, error } = await supabase
      .from("categories")
      .update(validation.values)
      .eq("id", id)
      .select(CATEGORY_FIELDS)
      .maybeSingle();

    if (error) {
      // Handle duplicate category names
      if (error.code === "23505") {
        return res.status(409).json({
          success: false,
          message: "Category name already exists"
        });
      }

      console.error(
        "Error updating category:",
        error.message
      );

      return res.status(500).json({
        success: false,
        message: "Unable to update category"
      });
    }

    // Handle categories that do not exist
    if (!data) {
      return res.status(404).json({
        success: false,
        message: "Category not found"
      });
    }

    return res.status(200).json({
      success: true,
      message: "Category updated successfully",
      category: data
    });

  } catch (error) {
    console.error(
      "Internal category error:",
      error.message
    );

    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
};

// DELETE /api/categories/:id
const deleteCategory = async (req, res) => {
  const { id } = req.params;

  // Validate category ID
  if (!isValidId(id)) {
    return res.status(400).json({
      success: false,
      message: "Invalid category ID"
    });
  }

  try {
    // Prevent deleting categories used by businesses
    const {
      count,
      error: checkError
    } = await supabase
      .from("businesses")
      .select("id", {
        count: "exact",
        head: true
      })
      .eq("category_id", id);

    if (checkError) {
      console.error(
        "Error checking related businesses:",
        checkError.message
      );

      return res.status(500).json({
        success: false,
        message: "Unable to verify category dependencies"
      });
    }

    // Prevent deletion when related businesses exist
    if (count > 0) {
      return res.status(409).json({
        success: false,
        message: "Cannot delete a category associated with existing businesses"
      });
    }

    // Delete the category
    const { data, error } = await supabase
      .from("categories")
      .delete()
      .eq("id", id)
      .select("id")
      .maybeSingle();

    if (error) {
      // Handle database foreign key restrictions
      if (error.code === "23503") {
        return res.status(409).json({
          success: false,
          message: "Category is referenced by another record"
        });
      }

      console.error(
        "Error deleting category:",
        error.message
      );

      return res.status(500).json({
        success: false,
        message: "Unable to delete category"
      });
    }

    // Handle categories that do not exist
    if (!data) {
      return res.status(404).json({
        success: false,
        message: "Category not found"
      });
    }

    return res.status(200).json({
      success: true,
      message: "Category deleted successfully"
    });

  } catch (error) {
    console.error(
      "Internal category error:",
      error.message
    );

    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
};

// Export category controllers
module.exports = {
  getCategories,
  getCategoryById,
  createCategory,
  updateCategory,
  deleteCategory
};