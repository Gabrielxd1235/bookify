
 // BOOKIFY - Role-based authorization middleware

const requireRole = (...allowedRoles) => {
  return (req, res, next) => {

    // Check for an authenticated user
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required"
      });
    }

    // Check whether the user's role is authorized
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to access this resource"
      });
    }

    // Allow the request to continue
    next();
  };
};

module.exports = { requireRole };
