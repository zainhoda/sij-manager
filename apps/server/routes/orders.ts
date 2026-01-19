import { db } from "../db";
import type { Order, Product } from "../db/schema";

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

async function getNextOrderColor(): Promise<string> {
  const result = await db.execute("SELECT DISTINCT color FROM orders WHERE color IS NOT NULL");
  const usedColors = result.rows as unknown as { color: string }[];
  const usedSet = new Set(usedColors.map(c => c.color));

  // Find first unused color
  const unusedColor = ORDER_COLORS.find(c => !usedSet.has(c));
  if (unusedColor) {
    return unusedColor;
  }

  // All colors used, cycle through based on count
  const countResult = await db.execute(`
    SELECT color, COUNT(*) as count
    FROM orders
    WHERE color IS NOT NULL
    GROUP BY color
    ORDER BY count ASC
  `);
  const colorCounts = countResult.rows as unknown as { color: string; count: number }[];

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
    const result = await db.execute(`
      SELECT o.*, p.name as product_name, s.id as schedule_id
      FROM orders o
      JOIN products p ON o.product_id = p.id
      LEFT JOIN schedules s ON s.order_id = o.id
      ORDER BY o.due_date
    `);
    const orders = result.rows;
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
    const result = await db.execute({
      sql: `
      SELECT o.*, p.name as product_name
      FROM orders o
      JOIN products p ON o.product_id = p.id
      WHERE o.id = ?
    `,
      args: [orderId]
    });
    const order = result.rows[0];

    if (!order) {
      return Response.json({ error: "Order not found" }, { status: 404 });
    }
    return Response.json(order);
  }

  // PATCH /api/orders/:id - update order status
  if (orderMatch && request.method === "PATCH") {
    return handleUpdateOrder(request, parseInt(orderMatch[1]!));
  }

  // DELETE /api/orders/:id - delete order
  if (orderMatch && request.method === "DELETE") {
    return handleDeleteOrder(parseInt(orderMatch[1]!));
  }

  return null;
}

async function handleCreateOrder(request: Request): Promise<Response> {
  try {
    const body = await request.json() as {
      product_id: number;
      quantity: number;
      due_date: string;
    };

    if (!body.product_id || !body.quantity || !body.due_date) {
      return Response.json(
        { error: "Missing required fields: product_id, quantity, due_date" },
        { status: 400 }
      );
    }

    // Verify product exists
    const productResult = await db.execute({
      sql: "SELECT id FROM products WHERE id = ?",
      args: [body.product_id]
    });
    const product = productResult.rows[0];
    if (!product) {
      return Response.json({ error: "Product not found" }, { status: 404 });
    }

    // Auto-assign a color for visual distinction
    const color = await getNextOrderColor();

    const result = await db.execute({
      sql: "INSERT INTO orders (product_id, quantity, due_date, color) VALUES (?, ?, ?, ?)",
      args: [body.product_id, body.quantity, body.due_date, color]
    });

    const newOrderResult = await db.execute({
      sql: `
        SELECT o.*, p.name as product_name
        FROM orders o
        JOIN products p ON o.product_id = p.id
        WHERE o.id = ?
      `,
      args: [result.lastInsertRowid!]
    });
    const order = newOrderResult.rows[0];
    return Response.json(order, { status: 201 });
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }
}

async function handleUpdateOrder(request: Request, orderId: number): Promise<Response> {
  try {
    const body = await request.json() as {
      status?: string;
      quantity?: number;
      due_date?: string;
      color?: string | null;
      product_id?: number;
    };

    const updates: string[] = [];
    const values: any[] = [];

    if (body.status) {
      if (!['pending', 'scheduled', 'in_progress', 'completed'].includes(body.status)) {
        return Response.json({ error: "Invalid status" }, { status: 400 });
      }
      updates.push("status = ?");
      values.push(body.status);
    }

    if (body.quantity !== undefined) {
      if (body.quantity < 1) {
        return Response.json({ error: "Quantity must be at least 1" }, { status: 400 });
      }
      updates.push("quantity = ?");
      values.push(body.quantity);
    }

    if (body.due_date !== undefined) {
      updates.push("due_date = ?");
      values.push(body.due_date);
    }

    if ('color' in body) {
      updates.push("color = ?");
      values.push(body.color);
    }

    if (body.product_id !== undefined) {
      // Verify product exists
      const productResult = await db.execute({
        sql: "SELECT id FROM products WHERE id = ?",
        args: [body.product_id]
      });
      if (productResult.rows.length === 0) {
        return Response.json({ error: "Product not found" }, { status: 404 });
      }
      updates.push("product_id = ?");
      values.push(body.product_id);
    }

    if (updates.length === 0) {
      return Response.json({ error: "No fields to update" }, { status: 400 });
    }

    values.push(orderId);
    await db.execute({
      sql: `UPDATE orders SET ${updates.join(", ")} WHERE id = ?`,
      args: values
    });

    // Return updated order with product_name and schedule_id
    const orderResult = await db.execute({
      sql: `
        SELECT o.*, p.name as product_name, s.id as schedule_id
        FROM orders o
        JOIN products p ON o.product_id = p.id
        LEFT JOIN schedules s ON s.order_id = o.id
        WHERE o.id = ?
      `,
      args: [orderId]
    });
    const order = orderResult.rows[0];

    if (!order) {
      return Response.json({ error: "Order not found" }, { status: 404 });
    }

    return Response.json(order);
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }
}

async function handleDeleteOrder(orderId: number): Promise<Response> {
  // Check if order exists
  const orderResult = await db.execute({
    sql: "SELECT id FROM orders WHERE id = ?",
    args: [orderId]
  });

  if (orderResult.rows.length === 0) {
    return Response.json({ error: "Order not found" }, { status: 404 });
  }

  // Delete in order: task_worker_assignments → schedule_entries → schedules → order
  // (Foreign keys with ON DELETE CASCADE should handle most of this, but being explicit)

  // Get schedule IDs for this order
  const schedulesResult = await db.execute({
    sql: "SELECT id FROM schedules WHERE order_id = ?",
    args: [orderId]
  });
  const scheduleIds = (schedulesResult.rows as unknown as { id: number }[]).map(r => r.id);

  if (scheduleIds.length > 0) {
    // Get schedule entry IDs
    const entriesResult = await db.execute({
      sql: `SELECT id FROM schedule_entries WHERE schedule_id IN (${scheduleIds.map(() => '?').join(',')})`,
      args: scheduleIds
    });
    const entryIds = (entriesResult.rows as unknown as { id: number }[]).map(r => r.id);

    if (entryIds.length > 0) {
      // Delete task worker assignments
      await db.execute({
        sql: `DELETE FROM task_worker_assignments WHERE schedule_entry_id IN (${entryIds.map(() => '?').join(',')})`,
        args: entryIds
      });

      // Delete schedule entries
      await db.execute({
        sql: `DELETE FROM schedule_entries WHERE id IN (${entryIds.map(() => '?').join(',')})`,
        args: entryIds
      });
    }

    // Delete schedules
    await db.execute({
      sql: `DELETE FROM schedules WHERE id IN (${scheduleIds.map(() => '?').join(',')})`,
      args: scheduleIds
    });
  }

  // Delete the order
  await db.execute({
    sql: "DELETE FROM orders WHERE id = ?",
    args: [orderId]
  });

  return Response.json({ success: true, message: "Order deleted" });
}
