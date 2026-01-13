import { db } from "../db";
import type { Order, Product } from "../db/schema";
import type { SQLQueryBindings } from "bun:sqlite";

// Color palette for distinguishing orders
const ORDER_COLORS = [
  '#3B82F6', // blue
  '#10B981', // emerald
  '#F59E0B', // amber
  '#EF4444', // red
  '#8B5CF6', // violet
  '#EC4899', // pink
  '#06B6D4', // cyan
  '#84CC16', // lime
];

function getNextOrderColor(): string {
  const usedColors = db.query(
    "SELECT DISTINCT color FROM orders WHERE color IS NOT NULL"
  ).all() as { color: string }[];
  const usedSet = new Set(usedColors.map(c => c.color));

  // Find first unused color
  const unusedColor = ORDER_COLORS.find(c => !usedSet.has(c));
  if (unusedColor) {
    return unusedColor;
  }

  // All colors used, cycle through based on count
  const colorCounts = db.query(`
    SELECT color, COUNT(*) as count
    FROM orders
    WHERE color IS NOT NULL
    GROUP BY color
    ORDER BY count ASC
  `).all() as { color: string; count: number }[];

  // Return the least used color, or random if all equal
  if (colorCounts.length > 0) {
    return colorCounts[0]!.color;
  }

  return ORDER_COLORS[Math.floor(Math.random() * ORDER_COLORS.length)]!;
}

export async function handleOrders(request: Request): Promise<Response | null> {
  const url = new URL(request.url);

  // GET /api/orders - list all orders
  if (url.pathname === "/api/orders" && request.method === "GET") {
    const orders = db.query(`
      SELECT o.*, p.name as product_name
      FROM orders o
      JOIN products p ON o.product_id = p.id
      ORDER BY o.due_date
    `).all() as (Order & { product_name: string })[];
    return Response.json(orders);
  }

  // POST /api/orders - create new order
  if (url.pathname === "/api/orders" && request.method === "POST") {
    return handleCreateOrder(request);
  }

  // GET /api/orders/:id - get single order
  const orderMatch = url.pathname.match(/^\/api\/orders\/(\d+)$/);
  if (orderMatch && request.method === "GET") {
    const orderId = parseInt(orderMatch[1]!);
    const order = db.query(`
      SELECT o.*, p.name as product_name
      FROM orders o
      JOIN products p ON o.product_id = p.id
      WHERE o.id = ?
    `).get(orderId) as (Order & { product_name: string }) | null;

    if (!order) {
      return Response.json({ error: "Order not found" }, { status: 404 });
    }
    return Response.json(order);
  }

  // PATCH /api/orders/:id - update order status
  if (orderMatch && request.method === "PATCH") {
    return handleUpdateOrder(request, parseInt(orderMatch[1]!));
  }

  return null;
}

async function handleCreateOrder(request: Request): Promise<Response> {
  try {
    const body = await request.json() as { product_id: number; quantity: number; due_date: string };

    if (!body.product_id || !body.quantity || !body.due_date) {
      return Response.json(
        { error: "Missing required fields: product_id, quantity, due_date" },
        { status: 400 }
      );
    }

    // Verify product exists
    const product = db.query("SELECT id FROM products WHERE id = ?").get(body.product_id) as Product | null;
    if (!product) {
      return Response.json({ error: "Product not found" }, { status: 404 });
    }

    // Auto-assign a color for visual distinction
    const color = getNextOrderColor();

    const result = db.run(
      "INSERT INTO orders (product_id, quantity, due_date, color) VALUES (?, ?, ?, ?)",
      [body.product_id, body.quantity, body.due_date, color]
    );

    const order = db.query("SELECT * FROM orders WHERE id = ?").get(result.lastInsertRowid) as Order;
    return Response.json(order, { status: 201 });
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }
}

async function handleUpdateOrder(request: Request, orderId: number): Promise<Response> {
  try {
    const body = await request.json() as { status?: string };

    const updates: string[] = [];
    const values: SQLQueryBindings[] = [];

    if (body.status) {
      if (!['pending', 'scheduled', 'in_progress', 'completed'].includes(body.status)) {
        return Response.json({ error: "Invalid status" }, { status: 400 });
      }
      updates.push("status = ?");
      values.push(body.status);
    }

    if (updates.length === 0) {
      return Response.json({ error: "No fields to update" }, { status: 400 });
    }

    values.push(orderId);
    db.run(`UPDATE orders SET ${updates.join(", ")} WHERE id = ?`, values);

    const order = db.query("SELECT * FROM orders WHERE id = ?").get(orderId) as Order | null;
    if (!order) {
      return Response.json({ error: "Order not found" }, { status: 404 });
    }

    return Response.json(order);
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }
}
