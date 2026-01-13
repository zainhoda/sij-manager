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

  // Equipment table
  db.run(`
    CREATE TABLE IF NOT EXISTS equipment (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      status TEXT DEFAULT 'available' CHECK (status IN ('available', 'in_use', 'maintenance', 'retired')),
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Workers table (human resources)
  db.run(`
    CREATE TABLE IF NOT EXISTS workers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      employee_id TEXT UNIQUE,
      status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'on_leave')),
      skill_category TEXT DEFAULT 'OTHER' CHECK (skill_category IN ('SEWING', 'OTHER')),
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Equipment certifications (worker-equipment junction table)
  db.run(`
    CREATE TABLE IF NOT EXISTS equipment_certifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      worker_id INTEGER NOT NULL,
      equipment_id INTEGER NOT NULL,
      certified_at TEXT DEFAULT CURRENT_TIMESTAMP,
      expires_at TEXT,
      FOREIGN KEY (worker_id) REFERENCES workers(id) ON DELETE CASCADE,
      FOREIGN KEY (equipment_id) REFERENCES equipment(id) ON DELETE CASCADE,
      UNIQUE (worker_id, equipment_id)
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
      equipment_id INTEGER,
      FOREIGN KEY (product_id) REFERENCES products(id),
      FOREIGN KEY (equipment_id) REFERENCES equipment(id)
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
      FOREIGN KEY (product_step_id) REFERENCES product_steps(id),
      FOREIGN KEY (worker_id) REFERENCES workers(id)
    )
  `);

  // Create indexes for common queries
  db.run("CREATE INDEX IF NOT EXISTS idx_product_steps_product ON product_steps(product_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_product_steps_equipment ON product_steps(equipment_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_orders_product ON orders(product_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_schedules_order ON schedules(order_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_schedule_entries_schedule ON schedule_entries(schedule_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_schedule_entries_date ON schedule_entries(date)");
  db.run("CREATE INDEX IF NOT EXISTS idx_schedule_entries_worker ON schedule_entries(worker_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_workers_status ON workers(status)");
  db.run("CREATE INDEX IF NOT EXISTS idx_equipment_certifications_worker ON equipment_certifications(worker_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_equipment_certifications_equipment ON equipment_certifications(equipment_id)");

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
  equipment_id: number | null;
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

export interface Equipment {
  id: number;
  name: string;
  description: string | null;
  status: 'available' | 'in_use' | 'maintenance' | 'retired';
  created_at: string;
}

export interface Worker {
  id: number;
  name: string;
  employee_id: string | null;
  status: 'active' | 'inactive' | 'on_leave';
  skill_category: 'SEWING' | 'OTHER';
  created_at: string;
}

export interface EquipmentCertification {
  id: number;
  worker_id: number;
  equipment_id: number;
  certified_at: string;
  expires_at: string | null;
}
