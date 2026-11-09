"use strict";
const express = require("express");
const { verifyToken } = require("../middlewares/auth.middleware");
const { payDeposit } = require("../controllers/mock-checkout.controller");
const router = express.Router();
router.use(verifyToken);
// Development-only: the signed-in reservation owner may simulate the exact 50% deposit.
router.post("/reservations/:reservationId/pay", payDeposit);
module.exports = router;
