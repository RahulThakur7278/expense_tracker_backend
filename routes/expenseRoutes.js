import express from "express";

import {
  addExpense,
  getMyExpenses,
  getAllExpenses,
  updateExpenseStatus,
  updateExpense,
  deleteExpense,
  getExpenseSummary,
} from "../controllers/expenseController.js";

import { protect, isAdmin } from "../middlewares/authMiddleware.js";

const router = express.Router();

// User routes
router.post("/", protect, addExpense);
router.get("/my", protect, getMyExpenses);
router.get("/summary", protect, getExpenseSummary);
router.put("/:id", protect, updateExpense);
router.delete("/:id", protect, deleteExpense);

// Admin routes
router.get("/", protect, isAdmin, getAllExpenses);
router.patch("/:id/status", protect, isAdmin, updateExpenseStatus);

export default router;

