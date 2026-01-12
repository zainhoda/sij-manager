import { Database } from "bun:sqlite";

export function initDatabase(dbPath: string = "sij.db"): Database {
  const db = new Database(dbPath);

  // Enable foreign keys
  db.run("PRAGMA foreign_keys = ON");

  // Products table
  db.run(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Product steps table
  db.run(`
    CREATE TABLE IF NOT EXISTS product_steps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      category TEXT NOT NULL CHECK (category IN ('CUTTING', 'SILKSCREEN', 'PREP', 'SEWING', 'INSPECTION')),
      time_per_piece_seconds INTEGER NOT NULL,
      sequence INTEGER NOT NULL,
      required_skill_category TEXT NOT NULL CHECK (required_skill_category IN ('SEWING', 'OTHER')),
      parent_step_code TEXT,
      FOREIGN KEY (product_id) REFERENCES products(id)
    )
  `);

  // Step dependencies (many-to-many)
  db.run(`
    CREATE TABLE IF NOT EXISTS step_dependencies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      step_id INTEGER NOT NULL,
      depends_on_step_id INTEGER NOT NULL,
      FOREIGN KEY (step_id) REFERENCES product_steps(id),
      FOREIGN KEY (depends_on_step_id) REFERENCES product_steps(id),
      UNIQUE (step_id, depends_on_step_id)
    )
  `);

  // Orders table
  db.run(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL,
      due_date TEXT NOT NULL,
      status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'scheduled', 'in_progress', 'completed')),
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES products(id)
    )
  `);

  // Schedules table
  db.run(`
    CREATE TABLE IF NOT EXISTS schedules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      week_start_date TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (order_id) REFERENCES orders(id)
    )
  `);

  // Schedule entries table
  db.run(`
    CREATE TABLE IF NOT EXISTS schedule_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      schedule_id INTEGER NOT NULL,
      product_step_id INTEGER NOT NULL,
      worker_id INTEGER,
      date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      planned_output INTEGER NOT NULL,
      actual_start_time TEXT,
      actual_end_time TEXT,
      actual_output INTEGER DEFAULT 0,
      status TEXT DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'completed')),
      notes TEXT,
      FOREIGN KEY (schedule_id) REFERENCES schedules(id),
      FOREIGN KEY (product_step_id) REFERENCES product_steps(id)
    )
  `);

  // Create indexes for common queries
  db.run("CREATE INDEX IF NOT EXISTS idx_product_steps_product ON product_steps(product_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_orders_product ON orders(product_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_schedules_order ON schedules(order_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_schedule_entries_schedule ON schedule_entries(schedule_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_schedule_entries_date ON schedule_entries(date)");

  return db;
}

// Type definitions for database rows
export interface Product {
  id: number;
  name: string;
  description: string | null;
  created_at: string;
}

export interface ProductStep {
  id: number;
  product_id: number;
  name: string;
  category: 'CUTTING' | 'SILKSCREEN' | 'PREP' | 'SEWING' | 'INSPECTION';
  time_per_piece_seconds: number;
  sequence: number;
  required_skill_category: 'SEWING' | 'OTHER';
  parent_step_code: string | null;
}

export interface StepDependency {
  id: number;
  step_id: number;
  depends_on_step_id: number;
}

export interface Order {
  id: number;
  product_id: number;
  quantity: number;
  due_date: string;
  status: 'pending' | 'scheduled' | 'in_progress' | 'completed';
  created_at: string;
}

export interface Schedule {
  id: number;
  order_id: number;
  week_start_date: string;
  created_at: string;
}

export interface ScheduleEntry {
  id: number;
  schedule_id: number;
  product_step_id: number;
  worker_id: number | null;
  date: string;
  start_time: string;
  end_time: string;
  planned_output: number;
  actual_start_time: string | null;
  actual_end_time: string | null;
  actual_output: number;
  status: 'not_started' | 'in_progress' | 'completed';
  notes: string | null;
}
