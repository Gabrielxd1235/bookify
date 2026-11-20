"use strict";
const express = require("express");
const { verifyToken } = require("../middlewares/auth.middleware");
const { payDeposit, payBalance } = require("../controllers/mock-checkout.controller");
const router = express.Router();
router.use(verifyToken);
// Demo checkout: the signed-in reservation owner pays 50 % (DEPOSIT) or 100 % (FULL)
router.post("/reservations/:reservationId/pay", payDeposit);
// Demo checkout: pay the remaining 50 % online after a deposit
router.post("/reservations/:reservationId/pay-balance", payBalance);
module.exports = router;
