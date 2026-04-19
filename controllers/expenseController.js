import Expense from "../models/Expense.js";
import AuditLog from "../models/AuditLog.js";

// Add an expense
export const addExpense = async (req, res) => {
  const { title, amount, category, date, notes } = req.body;
  if (!title || !amount || !category || !date) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  try {
    const expense = await Expense.create({
      title,
      amount,
      category,
      date,
      notes,
      user: req.user._id,
    });

    // Log the creation to AuditLog
    await AuditLog.create({
      action: "Expense Added",
      user: req.user._id,
      targetUser: req.user._id,
      userRole: req.user.role,
      details: `${req.user.name} added a new expense: ${title} (₹${amount}) in ${category}`,
    });

    res.status(201).json(expense);
  } catch (err) {
    console.error("Add Expense Error:", err.message);
    res.status(400).json({ message: "Failed to add expense" });
  }
};

// Get all expenses for the current user with filters, sort, and pagination
export const getMyExpenses = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      category,
      startDate,
      endDate,
      sortField = "date",
      sortOrder = "desc",
    } = req.query;

    const query = { user: req.user._id };

    if (category && category !== "All") {
      query.category = category;
    }

    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }

    const expenses = await Expense.find(query)
      .sort({ [sortField]: sortOrder === "desc" ? -1 : 1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .exec();

    const count = await Expense.countDocuments(query);

    res.status(200).json({
      expenses,
      totalPages: Math.ceil(count / limit),
      currentPage: page,
      totalExpenses: count,
    });
  } catch (err) {
    console.error("Get My Expenses Error:", err.message);
    res.status(500).json({ message: "Failed to fetch expenses" });
  }
};

// Update an expense
export const updateExpense = async (req, res) => {
  try {
    const { title, amount, category, date, notes } = req.body;
    const expense = await Expense.findById(req.params.id);

    if (!expense) {
      return res.status(404).json({ message: "Expense not found" });
    }

    // Check ownership
    if (expense.user.toString() !== req.user._id.toString()) {
      return res.status(401).json({ message: "Not authorized" });
    }

    expense.title = title || expense.title;
    expense.amount = amount || expense.amount;
    expense.category = category || expense.category;
    expense.date = date || expense.date;
    expense.notes = notes || expense.notes;

    const updatedExpense = await expense.save();

    await AuditLog.create({
      action: "Expense Updated",
      user: req.user._id,
      targetUser: req.user._id,
      userRole: req.user.role,
      details: `${req.user.name} updated expense: ${expense.title}`,
    });

    res.status(200).json(updatedExpense);
  } catch (err) {
    console.error("Update Expense Error:", err.message);
    res.status(400).json({ message: "Failed to update expense" });
  }
};

// Delete an expense
export const deleteExpense = async (req, res) => {
  try {
    const expense = await Expense.findById(req.params.id);

    if (!expense) {
      return res.status(404).json({ message: "Expense not found" });
    }

    // Check ownership
    if (expense.user.toString() !== req.user._id.toString()) {
      return res.status(401).json({ message: "Not authorized" });
    }

    await expense.deleteOne();

    await AuditLog.create({
      action: "Expense Deleted",
      user: req.user._id,
      targetUser: req.user._id,
      userRole: req.user.role,
      details: `${req.user.name} deleted expense: ${expense.title}`,
    });

    res.status(200).json({ message: "Expense removed" });
  } catch (err) {
    console.error("Delete Expense Error:", err.message);
    res.status(500).json({ message: "Failed to delete expense" });
  }
};

// Get Expense Summary for Dashboard
export const getExpenseSummary = async (req, res) => {
  try {
    const userId = req.user._id;
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const startOfYear = new Date();
    startOfYear.setMonth(0, 1);
    startOfYear.setHours(0, 0, 0, 0);

    const stats = await Expense.aggregate([
      { $match: { user: userId } },
      {
        $facet: {
          totalThisMonth: [
            { $match: { date: { $gte: startOfMonth } } },
            { $group: { _id: null, total: { $sum: "$amount" } } },
          ],
          totalThisYear: [
            { $match: { date: { $gte: startOfYear } } },
            { $group: { _id: null, total: { $sum: "$amount" } } },
          ],
          categoryBreakdown: [
            { $group: { _id: "$category", total: { $sum: "$amount" } } },
            { $sort: { total: -1 } },
          ],
        },
      },
    ]);

    const summary = {
      totalThisMonth: stats[0].totalThisMonth[0]?.total || 0,
      totalThisYear: stats[0].totalThisYear[0]?.total || 0,
      categoryBreakdown: stats[0].categoryBreakdown,
      highestCategory: stats[0].categoryBreakdown[0]?._id || "None",
    };

    res.status(200).json(summary);
  } catch (err) {
    console.error("Get Summary Error:", err.message);
    res.status(500).json({ message: "Failed to fetch summary" });
  }
};

// Admin: Get all expenses (sorted by expense date descending)
export const getAllExpenses = async (req, res) => {
  try {
    const expenses = await Expense.find()
      .populate("user", "name email")
      .sort({ date: -1 });
    res.status(200).json(expenses);
  } catch (err) {
    console.error("Get All Expenses Error:", err.message);
    res.status(500).json({ message: "Failed to fetch all expenses" });
  }
};

// Admin: Update expense status
export const updateExpenseStatus = async (req, res) => {
  const { status } = req.body;

  const allowedStatuses = ["pending", "approved", "rejected"];
  if (!allowedStatuses.includes(status)) {
    return res.status(400).json({ message: "Invalid status value" });
  }

  try {
    const expense = await Expense.findById(req.params.id).populate(
      "user",
      "name email"
    );

    if (!expense) {
      return res.status(404).json({ message: "Expense not found" });
    }

    const prevStatus = expense.status;

    if (prevStatus === status) {
      return res.status(200).json({ message: `Status already '${status}'` });
    }

    expense.status = status;
    await expense.save();

    await AuditLog.create({
      user: req.user._id,
      targetUser: expense.user._id,
      action: `Expense ${status}`,
      userRole: req.user.role,
      details: `Admin ${req.user.email} changed status of expense ₹${expense.amount} from ${prevStatus} to ${status} for user ${expense.user.email}`,
    });

    res.status(200).json({ message: "Expense status updated", expense });
  } catch (err) {
    console.error("Update Status Error:", err);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

